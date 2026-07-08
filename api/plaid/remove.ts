// POST /api/plaid/remove
// Body: { item_id }
// Unlinks an institution: invalidates the item at Plaid, then deletes the row.
// Scoped to the caller's own items.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL) return json({ error: "Supabase not configured" }, 500);
  if (!adminConfigured()) return json({ error: "Plaid not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = payload.sub;

  const body = (await req.json().catch(() => ({}))) as { item_id?: string };
  if (!body.item_id) return json({ error: "Missing item_id" }, 400);

  // Look up the caller's own row to get the access_token (filtered by user_id
  // so one user can't remove another's item).
  const lookup = await adminRest(
    `plaid_items?user_id=eq.${encodeURIComponent(userId)}` +
      `&item_id=eq.${encodeURIComponent(body.item_id)}&select=access_token`,
  );
  const rows = (await lookup.json().catch(() => [])) as Array<{ access_token?: string }>;
  const accessToken = rows[0]?.access_token;
  if (!accessToken) return json({ error: "Not found" }, 404);

  // Best-effort invalidate at Plaid (ignore failures; we still drop our row).
  if (plaidConfigured()) {
    await plaidFetch("/item/remove", { access_token: accessToken }).catch(() => undefined);
  }

  const del = await adminRest(
    `plaid_items?user_id=eq.${encodeURIComponent(userId)}&item_id=eq.${encodeURIComponent(body.item_id)}`,
    { method: "DELETE" },
  );
  if (!del.ok) {
    const detail = await del.text().catch(() => "");
    return json({ error: "Delete failed", detail }, 500);
  }
  return json({ ok: true });
}
