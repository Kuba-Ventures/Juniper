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
import { adminRest } from "../_supabase-admin";

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
  const body = (await req.json().catch(() => ({}))) as { routing_number?: unknown; item_id?: unknown };

  // UPDATE MODE. An item Plaid has finished with (ITEM_LOGIN_REQUIRED) is
  // repaired by reopening Link against the SAME access_token, not by linking the
  // bank again: a fresh link creates a second item for one institution, and the
  // dead one lingers with its own stale balances.
  //
  // The item id is looked up scoped to the caller, never trusted as given. A
  // client handing over somebody else's item id gets nothing back, and the
  // access_token is read server-side and never leaves this function.
  const wantedItem = typeof body.item_id === "string" && body.item_id.trim() ? body.item_id.trim() : null;
  let updateToken: string | null = null;
  if (wantedItem) {
    const r = await adminRest(
      `plaid_items?user_id=eq.${encodeURIComponent(payload.sub)}&item_id=eq.${encodeURIComponent(wantedItem)}&select=access_token&limit=1`,
    );
    if (r.ok) {
      const rows = (await r.json().catch(() => [])) as { access_token?: string }[];
      updateToken = rows[0]?.access_token ?? null;
    }
    if (!updateToken) {
      // Named rather than silently falling through to a normal link, which would
      // quietly create the duplicate item this exists to avoid.
      return json({ error: "That connection could not be found" }, 404);
    }
  }
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
      // Plaid rejects `products` in update mode: the item already has them, and
      // naming them again asks for a new link rather than a repair.
      ...(updateToken ? { access_token: updateToken } : { products: plaidProducts() }),
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
      //
      // `recurring_transactions` joined the list on 2026-08-31, the day the add
      // on was granted, and deliberately not a day earlier: naming an unentitled
      // product here makes /link/token/create fail for every member, not just
      // the ones who would have used it. It stays out of `products` for the same
      // reason investments does, requesting a product at link time narrows which
      // institutions will link, and recurring detection is a nice-to-have that
      // must never cost someone the ability to connect their bank. What needs
      // it: api/plaid/recurring-sync.ts, which until now answered every run with
      // `available: false`.
      //
      // Items linked BEFORE this change consented to investments only, so under
      // Data Transparency Messaging they may keep refusing recurring until they
      // are put back through Link in update mode, the same way investments was
      // in #144. Nothing here fixes those; the sync degrades per item, so a
      // member with one relinked bank sees that bank's streams and no error.
      additional_consented_products: ["investments", "recurring_transactions"],
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
