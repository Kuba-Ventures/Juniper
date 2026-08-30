// /api/budgets, CRUD for the caller's category budgets (Stage 3d).
//   GET                      -> list own budgets
//   POST { category, limit } -> upsert a monthly budget for that category
//   DELETE ?category=NAME     -> remove that budget
// The monthly *spent* rollup + over-budget flagging is computed in
// /api/finances (budgets-with-spent) and the UI; this just owns the limits.
// Scoped by the JWT's user id; writes via the service-role key.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { taxonomyFor } from "./_taxonomy";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}
const enc = encodeURIComponent;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "GET") {
    const r = await adminRest(`budgets?user_id=eq.${uid}&select=category,limit_amount,period&order=category.asc`);
    if (!r.ok) return json({ error: "Failed to read budgets" }, 500);
    return json(await r.json());
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { category?: string; limit?: number; limit_amount?: number };
    const category = (body.category || "").trim();
    const limit = Number(body.limit ?? body.limit_amount);
    if (!category || !Number.isFinite(limit) || limit < 0) return json({ error: "category and a non-negative limit are required" }, 400);
    const tax = await taxonomyFor(uid);
    const r = await adminRest("budgets?on_conflict=user_id,category,period", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      // `category_id` rides along, read by nothing yet: stage 1 of
      // docs/CUSTOM_CATEGORIES.md. Budgets are the reason the id exists at all,
      // since the unique index is on (user_id, category, period) and a rename
      // would otherwise orphan the member's own limit with no error.
      body: JSON.stringify({
        user_id: uid, category, category_id: tax.categoryIdOf(category),
        limit_amount: limit, period: "monthly", updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) return json({ error: "Failed to save budget", detail: await r.text().catch(() => "") }, 500);
    const rowsOut = (await r.json().catch(() => [])) as unknown[];
    return json(rowsOut[0] ?? { category, limit_amount: limit, period: "monthly" });
  }

  if (req.method === "DELETE") {
    const category = new URL(req.url).searchParams.get("category");
    if (!category) return json({ error: "category is required" }, 400);
    const r = await adminRest(`budgets?user_id=eq.${uid}&category=eq.${enc(category)}&period=eq.monthly`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!r.ok) return json({ error: "Failed to delete budget" }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
