// GET /api/partners[?domain=home-buying]
// Serves the marketplace catalog from the `partners` table (active rows only),
// ranked by estimated benefit to the user (never payout, see _offers.ts). This
// is what lets offers change without a deploy. Returns { partners: [] } when the
// table is empty or storage isn't configured, so the frontend keeps its seeded
// config until the catalog is populated.
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { rankByBenefit, type Offer } from "./_offers";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
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
  // Public catalog, no per-user data, but it still needs server storage. If
  // that's not set up yet, report an empty catalog so the UI shows its seed.
  if (!SUPABASE_URL || !adminConfigured()) return json({ partners: [] });

  const domain = new URL(req.url).searchParams.get("domain");
  const select = "id,name,category,domain,headline,blurb,description,fit,tags,url,logo_url,source,est_benefit,sort_order";
  let query = `partners?status=eq.active&select=${select}`;
  if (domain) query += `&domain=eq.${encodeURIComponent(domain)}`;

  try {
    const r = await adminRest(query);
    if (!r.ok) return json({ partners: [] });
    const rows = (await r.json()) as Offer[];
    return json({ partners: rankByBenefit(Array.isArray(rows) ? rows : []) });
  } catch {
    return json({ partners: [] });
  }
}
