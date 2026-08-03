// GET /api/recommendations
// "Picked for you" — personalized marketplace offers for the caller, each with a
// reason drawn from their own financial signals (Stage 5). Read-only. Returns
// { linked: false } when there's nothing synced to personalize from, so the
// frontend keeps its demo picks until real data exists.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { rankByBenefit, type Offer } from "./_offers";
import { fetchScoreInput } from "./_finance-snapshot";
import { computePicks } from "./_picks";

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ linked: false });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const { linked, signals } = await fetchScoreInput(payload.sub);
  if (!linked) return json({ linked: false });

  // The benefit-ranked active catalog the picks are drawn from.
  let catalog: Offer[] = [];
  try {
    const select = "id,name,category,domain,headline,blurb,description,fit,tags,url,logo_url,source,est_benefit,sort_order";
    const r = await adminRest(`partners?status=eq.active&select=${select}`);
    if (r.ok) catalog = rankByBenefit(((await r.json()) as Offer[]) || []);
  } catch { /* empty catalog -> no picks */ }
  if (!catalog.length) return json({ linked: true, picks: [] });

  return json({ linked: true, picks: computePicks(signals, catalog) });
}
