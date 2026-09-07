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
// No storage, by design, ahead of Stage 10d's retention rule (never keep the
// report payload past the display session): every call is a live pull, and
// nothing here writes a table.
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

  const r = await creditFetch<SpinwheelDebtProfileResp>(`/v1/users/${userId}/debtProfile`, {
    creditReport: { type: "1_BUREAU.FULL", sourceBureau: "Equifax" },
    creditScore: { model: "VANTAGE_SCORE_3_0", sourceBureau: "Equifax" },
  });
  if (!r.ok) {
    console.error(`[credit] debtProfile failed (${r.status}): ${r.data.status?.messages?.[0]?.desc ?? "unknown"}`);
    return json({ available: false, reason: "Credit provider did not answer" }, 502);
  }

  const detail = r.data.data?.creditReports?.[0]?.creditScoreDetails?.[0];
  if (!detail || detail.model !== "VANTAGE_SCORE_3_0") {
    return json({ available: false, reason: "No VantageScore 3.0 in the response" });
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
  return json(snapshot);
}
