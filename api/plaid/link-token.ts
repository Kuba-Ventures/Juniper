// POST /api/plaid/link-token
// Returns a short-lived link_token the browser hands to Plaid Link to open the
// account-connection flow. Requires a signed-in user.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch, plaidProducts, plaidCountryCodes } from "../_plaid";

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
  if (!plaidConfigured()) return json({ error: "Plaid not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const redirectUri = readEnv("PLAID_REDIRECT_URI");
  const { ok, status, data } = await plaidFetch<{ link_token?: string; error_message?: string }>(
    "/link/token/create",
    {
      user: { client_user_id: payload.sub },
      client_name: "Juniper",
      products: plaidProducts(),
      country_codes: plaidCountryCodes(),
      language: "en",
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    },
  );

  if (!ok || !data.link_token) {
    // Surface Plaid's reason in the server logs so failures (e.g. a product not
    // enabled for Production, or a redirect_uri mismatch) are diagnosable without
    // digging in the browser Network tab. error_message is a Plaid status string,
    // not credentials, so it is safe to log.
    console.error(
      `[plaid] link/token/create failed (${status}): ${data.error_message || "unknown error"}`,
    );
    return json({ error: data.error_message || "Failed to create link token" }, status || 502);
  }
  return json({ link_token: data.link_token });
}
