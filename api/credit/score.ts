// GET /api/credit/score — a real VantageScore 3.0 pull from Spinwheel for the
// caller's OWN verified identity, standing in for the Credit page's "not
// tracked yet" panel (src/pages/app/credit.tsx, ScorePending / PLANNED_FACTORS).
//
// Stage 10b built this against a single shared Spinwheel sandbox test
// identity (env var SPINWHEEL_SANDBOX_USER_ID) to prove the wire end to end.
// Stage 10d replaces that: the caller's own spinwheel_user_id is looked up
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
// credit_consents (the grant) is retained; nothing here writes a table. The
// in-memory caches below are keyed by spinwheel_user_id now, a real map
// rather than the single slot Stage 10b used, since there is more than one
// real identity to serve; see that stage's own note on why a plain in-memory
// cache exists at all (Spinwheel's sandbox rate-limits /debtProfile to one
// request per identity per day) and its real limits (per warm instance only,
// not shared across cold starts or regions -- still not a substitute for a
// real refresh-subscription cadence, Stage 10e).
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { creditConfigured, creditEnv, creditFetch } from "../_credit-provider";
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

// 15 U.S.C. 1681g(f) / Cal. Civ. Code 1785.15.1: at most four adverse key
// factors, ordered by importance, per model. Matches credit.tsx's
// PLANNED_FACTORS comment exactly — do not raise this without re-reading it.
const MAX_FACTORS = 4;

type SpinwheelFactor = { code: string; description: string };
type SpinwheelScoreDetail = {
  creditScore: number;
  model: string;
  sourceBureau: string;
  reportedDate: string;
  factors?: SpinwheelFactor[];
};
type SpinwheelReport = { creditScoreDetails?: SpinwheelScoreDetail[] };
type SpinwheelDebtProfileResp = {
  data?: { creditReports?: SpinwheelReport[] };
  status?: { messages?: { desc?: string }[] };
};

export type CreditScoreSnapshot = {
  available: true;
  sandbox: boolean;
  score: number;
  model: "VANTAGE_SCORE_3_0";
  sourceBureau: string;
  asOf: string;
  factors: SpinwheelFactor[];
};

const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
const cache = new Map<string, { snapshot: CreditScoreSnapshot; at: number }>();
const rateLimitedUntil = new Map<string, number>();
const inFlight = new Map<string, Promise<CreditScoreSnapshot | { failed: true; status: number }>>();

async function pullFresh(spinwheelUserId: string): Promise<CreditScoreSnapshot | { failed: true; status: number }> {
  const r = await creditFetch<SpinwheelDebtProfileResp>(`/v1/users/${spinwheelUserId}/debtProfile`, {
    creditReport: { type: "1_BUREAU.FULL", sourceBureau: "Equifax" },
    creditScore: { model: "VANTAGE_SCORE_3_0", sourceBureau: "Equifax" },
  });
  if (!r.ok) {
    console.error(`[credit] debtProfile failed (${r.status}): ${r.data.status?.messages?.[0]?.desc ?? "unknown"}`);
    if (r.status === 429) rateLimitedUntil.set(spinwheelUserId, Date.now());
    return { failed: true, status: r.status };
  }

  const detail = r.data.data?.creditReports?.[0]?.creditScoreDetails?.[0];
  if (!detail || detail.model !== "VANTAGE_SCORE_3_0") {
    return { failed: true, status: 200 };
  }

  const snapshot: CreditScoreSnapshot = {
    available: true,
    sandbox: creditEnv() !== "production",
    score: detail.creditScore,
    model: "VANTAGE_SCORE_3_0",
    sourceBureau: detail.sourceBureau,
    asOf: detail.reportedDate,
    factors: (detail.factors ?? []).slice(0, MAX_FACTORS),
  };
  cache.set(spinwheelUserId, { snapshot, at: Date.now() });
  return snapshot;
}

type ConsentRow = { spinwheel_user_id: string };

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

  const consentRes = await adminRest(`credit_consents?user_id=eq.${payload.sub}&select=spinwheel_user_id&limit=1`);
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
    pull = pullFresh(spinwheelUserId).finally(() => { inFlight.delete(spinwheelUserId); });
    inFlight.set(spinwheelUserId, pull);
  }
  const result = await pull;
  if ("failed" in result) return json({ available: false, reason: "Credit provider did not answer" }, 502);
  return json(result);
}
