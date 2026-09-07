// GET /api/credit/score — Stage 10b: a real, sandbox-sourced VantageScore 3.0
// pull from Spinwheel, standing in for the Credit page's "not tracked yet"
// panel (src/pages/app/credit.tsx, ScorePending / PLANNED_FACTORS).
//
// SANDBOX ONLY. Every caller sees the same pre-connected Spinwheel sandbox
// test identity's score (see api/_credit-provider.ts), never their own. There
// is no per-member Spinwheel connection yet: that needs Stage 10c's identity-
// match decision plus a consent screen, and Stage 10d's onboarding trigger,
// neither of which exist. This endpoint proves the wire end to end, a real
// score, real ordered factors, a real bureau, without pretending it is the
// caller's own credit file.
//
// Requires a signed-in member anyway, same JWT gate as every other endpoint,
// even though the payload isn't member-specific yet: the point is that this
// never quietly becomes a public unauthenticated read once Stage 10c/10d
// land real per-member data behind the same route.
//
// No DATABASE storage, by design, ahead of Stage 10d's retention rule (never
// keep the report payload past the display session): nothing here writes a
// table. There IS a small in-memory cache below, and it exists for a real
// reason found live on 2026-09-07: Spinwheel's sandbox rate-limits
// /debtProfile to ONE request per test identity PER DAY regardless of what's
// requested (`DAILY_USER_REQUEST_LIMIT_REACHED`, "Credit report orders are
// limited to one request per user per day"), so a page reloaded twice in the
// same day 429s without it. This is also just the right shape for production,
// not only a sandbox workaround: Spinwheel bills per fetch (see Stage 10e),
// so pulling live on every single page view was always going to be the wrong
// design, cost aside.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { creditConfigured, creditFetch, creditSandboxUserId } from "../_credit-provider";

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
  sandbox: true;
  score: number;
  model: "VANTAGE_SCORE_3_0";
  sourceBureau: string;
  asOf: string;
  factors: SpinwheelFactor[];
};

// Module-scope, so it only lives for the life of one warm Edge Function
// instance: it evaporates on a cold start or a redeploy, is never shared
// across regions, and is not a substitute for a real refresh-subscription
// cadence (Stage 10e). Kept comfortably under Spinwheel's 24h window so a
// redeploy or a cold start can't land inside a stale cache and still 429.
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;
let cache: { userId: string; snapshot: CreditScoreSnapshot; at: number } | null = null;

// A 429 here means "not again today" (Spinwheel's own daily-per-identity
// limit, not a transient failure), found live 2026-09-07 by two requests
// racing the plain result cache above within the same warm instance: the
// first started, hadn't written `cache` yet, and the second saw an empty
// cache and re-called Spinwheel, burning the SAME day's one allowed pull a
// second time before the first response could ever be reused. Caching the
// 429 itself (same TTL as a success) stops that instance from trying again
// for the rest of the day; caching a genuinely transient failure (502, a
// timeout) would be wrong, so only 429 is remembered here.
let rateLimitedUntil: { userId: string; at: number } | null = null;

// De-dupes concurrent callers within one warm instance onto a single Spinwheel
// request, which is the other half of the race above: two nearly-simultaneous
// requests must share one in-flight pull rather than each starting their own.
let inFlight: Promise<CreditScoreSnapshot | { failed: true; status: number }> | null = null;

async function pullFresh(userId: string): Promise<CreditScoreSnapshot | { failed: true; status: number }> {
  const r = await creditFetch<SpinwheelDebtProfileResp>(`/v1/users/${userId}/debtProfile`, {
    creditReport: { type: "1_BUREAU.FULL", sourceBureau: "Equifax" },
    creditScore: { model: "VANTAGE_SCORE_3_0", sourceBureau: "Equifax" },
  });
  if (!r.ok) {
    console.error(`[credit] debtProfile failed (${r.status}): ${r.data.status?.messages?.[0]?.desc ?? "unknown"}`);
    if (r.status === 429) rateLimitedUntil = { userId, at: Date.now() };
    return { failed: true, status: r.status };
  }

  const detail = r.data.data?.creditReports?.[0]?.creditScoreDetails?.[0];
  if (!detail || detail.model !== "VANTAGE_SCORE_3_0") {
    return { failed: true, status: 200 };
  }

  const snapshot: CreditScoreSnapshot = {
    available: true,
    sandbox: true,
    score: detail.creditScore,
    model: "VANTAGE_SCORE_3_0",
    sourceBureau: detail.sourceBureau,
    asOf: detail.reportedDate,
    factors: (detail.factors ?? []).slice(0, MAX_FACTORS),
  };
  cache = { userId, snapshot, at: Date.now() };
  return snapshot;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL) return json({ error: "Not configured" }, 503);
  if (!creditConfigured()) return json({ available: false, reason: "Credit provider not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const userId = creditSandboxUserId();
  if (!userId) return json({ available: false, reason: "No sandbox identity connected yet" });

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
    return json(cache.snapshot);
  }
  if (rateLimitedUntil && rateLimitedUntil.userId === userId && Date.now() - rateLimitedUntil.at < CACHE_TTL_MS) {
    return json({ available: false, reason: "Sandbox identity already pulled today" }, 429);
  }

  if (!inFlight) inFlight = pullFresh(userId).finally(() => { inFlight = null; });
  const result = await inFlight;
  if ("failed" in result) return json({ available: false, reason: "Credit provider did not answer" }, 502);
  return json(result);
}
