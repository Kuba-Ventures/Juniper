// GET /api/plaid/accounts
// Returns the caller's linked institutions + their sanitized account snapshots.
// Reads the stored snapshot only (no live Plaid call, no token exposure).
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL) return json({ error: "Supabase not configured" }, 500);
  // If server storage isn't configured yet, report "no connections" rather than
  // erroring, so the page renders its empty state cleanly.
  if (!adminConfigured()) return json({ items: [] });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  // service-role bypasses RLS, so we MUST filter by user_id ourselves. Never
  // select access_token.
  const res = await adminRest(
    `plaid_items?user_id=eq.${encodeURIComponent(payload.sub)}` +
      `&select=item_id,institution_id,institution_name,accounts,created_at&order=created_at.asc`,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ error: "Failed to load connections", detail }, 500);
  }
  const items = (await res.json()) as unknown[];
  return json({ items: Array.isArray(items) ? items : [] });
}
