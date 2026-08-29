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
  const scope = `plaid_items?user_id=eq.${encodeURIComponent(payload.sub)}`;
  const order = "&order=created_at.asc";
  // Columns the page has always had.
  const BASE = "item_id,institution_id,institution_name,accounts,created_at";
  // Per-item health, so Connections can say how current each connection is and
  // whether one needs reconnecting, without calling Plaid. Written by
  // _item-sync-state.ts (0017), networth-snapshot (0022, 0023).
  const STATE = "last_synced_at,last_error_code,last_error_at,balances_refreshed_at,balances_from_cache";

  // Asked for together, and retried without the health columns if that fails.
  // PostgREST rejects the whole select on an unknown column, so a deploy that
  // lands before its migration would otherwise take the entire Connections page
  // down rather than degrade to the list it has always shown. Costs one extra
  // round trip in a case that should never happen and is free otherwise.
  let res = await adminRest(`${scope}&select=${BASE},${STATE}${order}`);
  let degraded = false;
  if (!res.ok) {
    res = await adminRest(`${scope}&select=${BASE}${order}`);
    degraded = res.ok;
    if (degraded) {
      console.warn("[plaid] accounts: per-item health columns unavailable, is migration 0023 applied?");
    }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ error: "Failed to load connections", detail }, 500);
  }
  const items = (await res.json()) as unknown[];
  return json({ items: Array.isArray(items) ? items : [], ...(degraded ? { health_unavailable: true } : {}) });
}
