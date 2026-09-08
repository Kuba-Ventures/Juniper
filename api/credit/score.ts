// GET /api/credit/score — a real VantageScore 3.0 pull from Spinwheel for the
// caller's OWN verified identity, standing in for the Credit page's "not
// tracked yet" panel (src/pages/app/credit.tsx, ScorePending / PLANNED_FACTORS).
//
// Stage 10b built this against a single shared Spinwheel sandbox test
// identity (env var SPINWHEEL_SANDBOX_USER_ID) to prove the wire end to end.
// Stage 10d replaced that: the caller's own spinwheel_user_id is looked up
// from credit_consents (written only by api/credit/verify.ts, after a real
// SMS OTP verification -- see that migration's header), so a member who has
// not gone through onboarding's credit-pull consent gets an honest
// "not consented yet" rather than someone else's score.
//
// `sandbox` on the response is computed from creditEnv(), not hardcoded:
// while SPINWHEEL_ENV stays "sandbox" (no Spinwheel production contract yet),
// Spinwheel's own sandbox returns the SAME canned test fixture regardless of
// whose real phone/DOB verified the connection, so every member sees
// identical test data today even though the consent behind it is real and
// per-member. That is exactly why the Credit page's "Sandbox test data"
// disclosure must keep showing until this flips to production; removing it
// once real consent exists would be the actual misrepresentation risk.
//
// No DATABASE storage of the report itself, by design (Stage 10d's retention
// rule: never keep the report payload past the display session) -- only
// credit_consents (the grant, plus Stage 10e's last_score/last_score_at
// baseline for alerting) is retained; nothing here writes the report itself.
// The debtProfile call and its parsing live in api/_credit-provider.ts's
// pullCreditScore() now, shared with api/credit/_score-check.ts (the Stage
// 10e monthly cron leg), so there is one definition of a valid pull; this
// file keeps only the in-memory caches, which are specific to serving a live
// page view cheaply and have no reason to exist in the cron path.
//
// The caches are keyed by spinwheel_user_id, a real map rather than the
// single slot Stage 10b used, since there is more than one real identity to
// serve. See that stage's own note on why a plain in-memory cache exists at
// all (Spinwheel's sandbox rate-limits /debtProfile to one request per
// identity per day) and its real limits (per warm instance only, not shared
// across cold starts or regions).
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { creditConfigured, pullCreditScore, type CreditScoreSnapshot } from "../_credit-provider";
import { adminConfigured, adminRest } from "../_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
const cache = new Map<string, { snapshot: CreditScoreSnapshot; at: number }>();
const rateLimitedUntil = new Map<string, number>();
const inFlight = new Map<string, ReturnType<typeof pullCreditScore>>();

type ConsentRow = { user_id: string; spinwheel_user_id: string };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL) return json({ error: "Not configured" }, 503);
  if (!creditConfigured()) return json({ available: false, reason: "Credit provider not configured" }, 503);
  if (!adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const consentRes = await adminRest(`credit_consents?user_id=eq.${payload.sub}&select=user_id,spinwheel_user_id&limit=1`);
  if (!consentRes.ok) return json({ error: "Failed to read consent" }, 500);
  const rows = (await consentRes.json()) as ConsentRow[];
  const spinwheelUserId = rows[0]?.spinwheel_user_id;
  if (!spinwheelUserId) return json({ available: false, reason: "Not consented to credit tracking yet" });

  const cached = cache.get(spinwheelUserId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.snapshot);
  }
  const limitedAt = rateLimitedUntil.get(spinwheelUserId);
  if (limitedAt && Date.now() - limitedAt < CACHE_TTL_MS) {
    return json({ available: false, reason: "Already pulled today" }, 429);
  }

  let pull = inFlight.get(spinwheelUserId);
  if (!pull) {
    pull = pullCreditScore(spinwheelUserId).finally(() => { inFlight.delete(spinwheelUserId); });
    inFlight.set(spinwheelUserId, pull);
  }
  const result = await pull;
  if ("failed" in result) {
    if (result.status === 429) rateLimitedUntil.set(spinwheelUserId, Date.now());
    return json({ available: false, reason: "Credit provider did not answer" }, 502);
  }

  cache.set(spinwheelUserId, { snapshot: result, at: Date.now() });
  // Best-effort: a live view's whole job is showing the score, and a failure
  // to record the Stage 10e alerting baseline must not turn that into an
  // error the member sees. The monthly cron catches this member again either
  // way, since last_score_at only advances on a successful write here.
  void adminRest(`credit_consents?user_id=eq.${payload.sub}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ last_score: result.score, last_score_at: new Date().toISOString() }),
  }).catch(() => {});

  return json(result);
}
