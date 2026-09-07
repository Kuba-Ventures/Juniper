// GET /api/card-catalog
//
// The card catalog alone: name, issuer, fee, rewards currency, art, tier.
// Issue #289, item 4. Split out of api/card-rewards.ts's own response, which
// used to carry the whole catalog on every request because the catalog was
// small enough for that to be free; it is still small (a few dozen products,
// not yet the "few hundred" that migration 0031's own header names as the
// trigger for this split), but a component that only needs to NAME or DRAW a
// card, the Identify picker's "my card is not listed" search or the
// manual-account form, no longer has to fetch the member's whole rewards
// computation (cards, guide, switches, upgrades, benefits) to reach the one
// field it actually wanted.
//
// Reference data, the same rows for every signed-in member: no per-account
// spend, no confirmations, nothing keyed on `uid` beyond the auth gate every
// other card endpoint already has. `api/_card-catalog.ts` holds the read and
// the shaping, shared with api/card-rewards.ts, which still reads the raw
// rows server-side for rankCandidates and for a hand-entered card's art
// lookup, but no longer sends them.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured } from "./_supabase-admin";
import { readCardCatalog, shapeCatalogEntries } from "./_card-catalog";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);

  const rows = await readCardCatalog();
  return json({ catalog: shapeCatalogEntries(rows) });
}
