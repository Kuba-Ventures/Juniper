// POST /api/plaid/link-token  { routing_number? }
// Returns a short-lived link_token the browser hands to Plaid Link to open the
// account-connection flow. Requires a signed-in user.
//
// Plaid has no way to preselect an institution: Link always opens on its own
// institution list, so a user who already found their bank in our search still
// has to pick it again. `institution_data.routing_number` is the only lever
// Plaid offers, and it highlights that bank in the list, turning the second step
// from a re-typed search into a tap. It is best-effort by design: Plaid
// documents that a routing number shared by several institutions highlights
// nothing, and most institutions come back from /institutions/search without
// one, in which case Link opens exactly as it does today.
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
  const body = (await req.json().catch(() => ({}))) as { routing_number?: unknown };
  // Client-supplied, so validated to the only shape Plaid accepts (9 digits)
  // rather than forwarded as-is. Worst case for a wrong-but-valid value is that
  // Link highlights nothing.
  const routingNumber =
    typeof body.routing_number === "string" && /^[0-9]{9}$/.test(body.routing_number)
      ? body.routing_number
      : null;
  const { ok, status, data } = await plaidFetch<{ link_token?: string; error_message?: string }>(
    "/link/token/create",
    {
      user: { client_user_id: payload.sub },
      client_name: "Juniper",
      products: plaidProducts(),
      // Consent for investments now, so it can be called later. Plaid's Data
      // Transparency Messaging (default on for US Link sessions since October
      // 2024) only allows a product to be added to an existing item if it was
      // named here at link time; without it, /investments/transactions/get fails
      // and the member has to be sent back through update mode to grant it. This
      // is consent, not a requirement: unlike `products`, naming it here does not
      // narrow which institutions will link, and it is the pattern Plaid
      // documents for personal-finance apps. What needs it: the net-worth
      // backfill, which reads investment contributions to reconstruct the
      // invested balance on days before the member joined.
      //
      // Sandbox caveat: with Plaid's CUSTOM sandbox user, investments has to sit
      // in `products` instead and cannot be consented this way, so a custom
      // sandbox item will report investments as unavailable to the backfill.
      additional_consented_products: ["investments"],
      country_codes: plaidCountryCodes(),
      language: "en",
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      ...(routingNumber ? { institution_data: { routing_number: routingNumber } } : {}),
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
