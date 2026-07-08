// POST /api/plaid/exchange
// Body: { public_token, institution?: { institution_id?, name? } }
// Exchanges the Link public_token for a server-only access_token, stores the
// item, and returns a sanitized snapshot (institution + accounts). The
// access_token is NEVER returned to the client.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch, sanitizeAccounts, type SanitizedAccount } from "../_plaid";
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
  if (!plaidConfigured() || !adminConfigured()) return json({ error: "Plaid not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = payload.sub;

  const body = (await req.json().catch(() => ({}))) as {
    public_token?: string;
    institution?: { institution_id?: string; name?: string };
  };
  if (!body.public_token) return json({ error: "Missing public_token" }, 400);

  // 1) Exchange the public token for a server-only access token.
  const ex = await plaidFetch<{ access_token?: string; item_id?: string; error_message?: string }>(
    "/item/public_token/exchange",
    { public_token: body.public_token },
  );
  if (!ex.ok || !ex.data.access_token || !ex.data.item_id) {
    return json({ error: ex.data.error_message || "Token exchange failed" }, ex.status || 502);
  }
  const accessToken = ex.data.access_token;
  const itemId = ex.data.item_id;

  // 2) Pull the account list (includes cached balances) for display.
  const acc = await plaidFetch<{ accounts?: unknown[]; error_message?: string }>("/accounts/get", {
    access_token: accessToken,
  });
  const accounts: SanitizedAccount[] = acc.ok
    ? sanitizeAccounts((acc.data.accounts as Parameters<typeof sanitizeAccounts>[0]) ?? [])
    : [];

  const institutionName = body.institution?.name ?? null;
  const institutionId = body.institution?.institution_id ?? null;

  // 3) Persist server-side (service-role; access_token stays out of the client).
  //    Upsert on item_id so re-linking the same institution refreshes in place.
  const upsert = await adminRest("plaid_items?on_conflict=item_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      item_id: itemId,
      access_token: accessToken,
      institution_id: institutionId,
      institution_name: institutionName,
      accounts,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!upsert.ok) {
    const detail = await upsert.text().catch(() => "");
    return json({ error: "Failed to store item", detail }, 500);
  }

  // 4) Return only the sanitized snapshot.
  return json({ item_id: itemId, institution_name: institutionName, accounts });
}
