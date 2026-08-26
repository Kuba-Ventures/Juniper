// GET /api/plaid/institution-logos
// Returns the real brand mark for each institution the caller has linked, so the
// Connections list stops rendering every bank as the same generic building glyph.
// Plaid carries the logo (base64 PNG) and primary_color as optional institution
// metadata, which /institutions/search deliberately does not request (see the
// note in institutions-search.ts: a logo per keystroke is far too much payload).
// Here the set is small, fixed, and already on file, so it is worth fetching.
//
// The institution ids come from the caller's own plaid_items rows, never from the
// request. Two reasons: a member should only ever get marks for banks they
// actually linked, and an endpoint that looked up whatever ids the client sent
// would be an open, authenticated Plaid proxy anyone could walk to enumerate
// Plaid's institution list on our rate limit.
//
// Response payload is roughly 10 to 20KB per institution, so it must not be
// fetched per render. The client fetches it once per Connections load and the
// long private Cache-Control below covers repeat visits.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { plaidConfigured, plaidFetch, plaidCountryCodes } from "../_plaid";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

// Hard ceiling on the ids we will look up in one request. /institutions/get_by_id
// takes one id per call, so an unbounded row count would fan a single request out
// into an unbounded burst of Plaid calls (rate limit, and Edge subrequest budget).
// 25 is far above any real household: Plaid's own Production Item cap for this
// account is 200 across all members, and nobody links 25 distinct banks. Ids past
// the cap simply keep the local brand map or the monogram they render today.
const MAX_INSTITUTIONS = 25;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors, ...(extra ?? {}) },
  });
}

// `private` and not `public`: the payload itself is just brand assets, but which
// institutions appear in it is a fact about this member, so it must never land in
// a shared cache. `max-age` is long because a bank's logo and brand color are
// static assets that change on the order of a rebrand, and the client varies the
// URL when its linked set changes, so a new connection is never served a stale
// map (see fetchInstitutionLogos in src/lib/plaid.ts).
const CACHE_HEADER = { "Cache-Control": "private, max-age=604800" };

export type InstitutionBrand = {
  name: string | null;
  // Base64 PNG body as Plaid returns it (no data: prefix), or null when Plaid has
  // no mark on file. Plenty of small banks and credit unions have none.
  logo: string | null;
  // Hex like "#0a7cff", or null. Display-only, used to tint the monogram tile an
  // unlogo'd institution falls back to.
  primary_color: string | null;
};

type PlaidInstitutionById = {
  institution?: {
    institution_id?: string;
    name?: string;
    logo?: string | null;
    primary_color?: string | null;
  };
  error_code?: string;
  error_message?: string;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL) return json({ error: "Supabase not configured" }, 500);
  // Same posture as accounts.ts: with no storage or no Plaid there is nothing to
  // look up, and an empty map is a state the client already handles (it falls
  // back to the local brand map, then the monogram). Erroring here would turn a
  // cosmetic enhancement into a broken page.
  if (!adminConfigured() || !plaidConfigured()) return json({ logos: {} });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, {
    supabaseUrl: SUPABASE_URL,
    legacySecret: SUPABASE_JWT_SECRET,
  });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  // service-role bypasses RLS, so the user_id filter is ours to get right. Select
  // institution_id only: nothing else here needs a name, a balance, or (ever) a
  // token.
  const res = await adminRest(
    `plaid_items?user_id=eq.${encodeURIComponent(payload.sub)}` +
      `&select=institution_id&order=created_at.asc`,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ error: "Failed to load connections", detail }, 500);
  }
  const rows = (await res.json()) as { institution_id?: string | null }[];

  // De-duplicated because one member can hold several items at the same bank (a
  // separate link for cards and for checking is common), and each would otherwise
  // cost its own Plaid call for the identical logo. Ordered by created_at above so
  // the cap, when it bites, keeps the oldest connections rather than an arbitrary
  // set.
  const ids = [
    ...new Set(
      (Array.isArray(rows) ? rows : [])
        .map((r) => r.institution_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ].slice(0, MAX_INSTITUTIONS);

  if (ids.length === 0) return json({ logos: {} }, 200, CACHE_HEADER);

  const looked = await Promise.all(
    ids.map(async (institution_id) => {
      const { ok, status, data } = await plaidFetch<PlaidInstitutionById>(
        "/institutions/get_by_id",
        {
          institution_id,
          country_codes: plaidCountryCodes(),
          // The logo and primary_color live behind this flag; without it Plaid
          // returns the institution with neither field.
          options: { include_optional_metadata: true },
        },
      );
      if (!ok || !data.institution) {
        // One institution Plaid refuses (unknown id, an institution outside our
        // country codes, a rate-limited call) must not cost the member every
        // other logo, so this resolves to null instead of throwing. Logged the
        // same way link-token logs its failures: the code is a Plaid status
        // string, not credentials, and a silently missing logo is otherwise
        // indistinguishable from a bank that has none on file.
        console.error(
          `[plaid] institutions/get_by_id failed for ${institution_id} (${status}): ` +
            `${data.error_code || data.error_message || "unknown error"}`,
        );
        return null;
      }
      const inst = data.institution;
      const brand: InstitutionBrand = {
        name: inst.name ?? null,
        logo: inst.logo ?? null,
        primary_color: inst.primary_color ?? null,
      };
      return [institution_id, brand] as const;
    }),
  );

  const logos: Record<string, InstitutionBrand> = {};
  for (const entry of looked) {
    if (!entry) continue;
    // An institution Plaid knows but has no artwork for is dropped rather than
    // returned as an all-null row: the client's fallback chain (local brand map,
    // then monogram) is what should run, and an empty row would only add weight.
    const [id, brand] = entry;
    if (brand.logo || brand.primary_color) logos[id] = brand;
  }

  return json({ logos }, 200, CACHE_HEADER);
}
