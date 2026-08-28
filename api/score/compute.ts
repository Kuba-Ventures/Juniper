// POST /api/score/compute
// Computes the caller's Juniper Score from their latest Stage-3 data and upserts
// one row per (user, day) into score_history so we can draw the trend and the
// month-over-month delta. Called alongside the sync trigger (on link / refresh)
// and, later, a daily cron. Safe to call repeatedly, it upserts today's row.
//
// Requires: migrations 0008 + 0009 applied and a linked, synced item.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { fetchScoreInput } from "../_finance-snapshot";
import { computeScore } from "../_score";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  return runScoreCompute(payload.sub);
}

// The work, with the caller already established. Same split as
// networth-snapshot.ts: the daily cron scores members who are not there to
// authenticate, so this half must be reachable without a request.
export async function runScoreCompute(uid: string): Promise<Response> {
  const { linked, input } = await fetchScoreInput(uid);
  if (!linked) return json({ linked: false, message: "No synced data to score yet" });

  const result = computeScore(input);
  const asOf = new Date().toISOString().slice(0, 10); // UTC day

  const up = await adminRest("score_history?on_conflict=user_id,as_of", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: uid, as_of: asOf, value: result.value, band: result.band, factors: result.factors }),
  });
  if (!up.ok) return json({ error: "Failed to save score", detail: await up.text().catch(() => "") }, 500);

  return json({ linked: true, as_of: asOf, ...result });
}
