// POST /api/plaid/institutions-search  { query }
// Searches Plaid's real institution list so the gallery's own search bar can
// find banks that aren't in the curated CATALOG (Carter Bank and every other
// regional bank Plaid links but we don't hand-list). Before this, the search bar
// only filtered the ~60 hardcoded tiles, so typing a supported bank's name
// produced "No matches" and pushed people toward the manual form, which stores a
// static balance that never refreshes.
//
// Filtered by PLAID_PRODUCTS on purpose: an institution that can't serve the
// products we request at link time would fail inside Link, so it should not be
// offered here.
//
// Brand metadata (logo + primary_color) IS requested, via
// `options.include_optional_metadata`, so a search row shows the bank's real
// mark rather than a monogram. The earlier objection was payload: Plaid returns
// a base64 PNG per institution, up to 10 per response. What makes that fine is
// the client's own throttle, not the endpoint: the search is debounced 300ms,
// cached per normalized query, and aborts the in-flight request on the next
// keystroke, so this is one response per query someone actually finished typing,
// not one per keystroke.
//
// Note the boundary this does NOT cross. /api/plaid/institution-logos serves
// brand art only for institutions the caller has already linked, because it
// reads their own plaid_items ids and never an id from the request. This
// endpoint stays inside that rule: the ids and the artwork both come from
// Plaid's own answer to the member's query, so there is still no way to ask
// Juniper for artwork for an arbitrary institution id.
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

type PlaidInstitution = {
  institution_id?: string;
  name?: string;
  oauth?: boolean;
  // Only present on some institutions; when it is, we pass it to
  // /link/token/create as institution_data.routing_number so Plaid highlights
  // that bank in Link's own list instead of opening on a blank search.
  routing_numbers?: string[];
  // Both from include_optional_metadata, and both routinely absent: plenty of
  // small banks and credit unions have neither on file with Plaid.
  logo?: string | null;
  primary_color?: string | null;
};

export type SanitizedInstitution = {
  institution_id: string;
  name: string;
  oauth: boolean;
  routing_number: string | null;
  // Base64 PNG body as Plaid sends it, no data: prefix. The client adds that
  // through institutionLogoSrc().
  logo: string | null;
  primary_color: string | null;
};

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

  const body = (await req.json().catch(() => ({}))) as { query?: unknown };
  // Bounded before it reaches Plaid: a 1-char query matches half the country and
  // burns rate limit, and an unbounded string is just a payload we'd forward.
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";
  if (query.length < 2) return json({ institutions: [] });

  const { ok, status, data } = await plaidFetch<{
    institutions?: PlaidInstitution[];
    error_message?: string;
  }>("/institutions/search", {
    query,
    products: plaidProducts(),
    country_codes: plaidCountryCodes(),
    options: { include_optional_metadata: true },
  });

  if (!ok) {
    // Same reasoning as link-token: error_message is a Plaid status string, not
    // credentials, and a search that fails silently looks identical to a bank
    // Plaid doesn't support.
    console.error(
      `[plaid] institutions/search failed (${status}): ${data.error_message || "unknown error"}`,
    );
    return json({ error: data.error_message || "Institution search failed" }, status || 502);
  }

  const institutions: SanitizedInstitution[] = (data.institutions ?? [])
    .filter((i): i is PlaidInstitution & { institution_id: string; name: string } =>
      typeof i.institution_id === "string" && typeof i.name === "string",
    )
    .map((i) => ({
      institution_id: i.institution_id,
      name: i.name,
      oauth: i.oauth === true,
      routing_number: i.routing_numbers?.find((r) => typeof r === "string" && r.length > 0) ?? null,
      logo: typeof i.logo === "string" && i.logo.length > 0 ? i.logo : null,
      primary_color:
        typeof i.primary_color === "string" && i.primary_color.length > 0 ? i.primary_color : null,
    }));

  return json({ institutions });
}
