// /api/card-benefits, the benefits checklist.
//
//   POST   { benefit_id }        -> tick it off for the current period
//   DELETE ?benefit=<benefit_id> -> untick it
//
// Reads live on /api/card-rewards, which returns the ticks resolved against the
// current period alongside the benefits themselves. This file only writes.
//
// ── THE PERIOD KEY IS COMPUTED HERE AND NEVER ACCEPTED FROM THE CLIENT ─────
//
// `card_benefit_uses` is unique on (user_id, benefit_id, period_key), and the key
// is what makes a recurring credit reset with no cron job: next month the key
// changes, no row matches, the benefit is unticked again. Taking the key from the
// request body would let a client tick a period that has not happened yet, and
// the effect would be a monthly credit that reads as already used for the rest of
// the year, quietly, with no way for the member to work out why. So the key comes
// from the benefit's own stored period and the server's clock, through the same
// pure function the read path uses.
//
// ── CALENDAR PERIODS, AND THE SURFACE SAYS SO ──────────────────────────────
//
// Plenty of real card credits reset on the CARDMEMBER year, the anniversary of
// the account opening. Plaid's `transactions` product does not return an
// account's open date, so a calendar year is the only bucket Juniper can compute.
// Presenting it as the issuer's own reset date would be a small lie that costs
// somebody a $120 credit, so the tracker is framed as the member's own checklist
// and the page names the period it is using.
//
// JUNIPER DOES NOT DETECT USE. It would be tempting to tick a $50 hotel credit
// automatically off a matching charge, and it would be wrong: the charge proves a
// hotel was paid for, not that the issuer applied the credit, and those come
// weeks apart. A checklist the member keeps is honest. An automatic tick that is
// sometimes wrong is worse than no tick at all, because they would stop checking.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { benefitPeriodKey, type BenefitPeriod } from "./_rewards";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const enc = encodeURIComponent;
const norm = (v: unknown) => String(v ?? "").trim();
const MAX_ID = 120;

/**
 * The benefit's stored period, and whether the caller actually holds the card it
 * belongs to.
 *
 * The card check is not about protecting anybody else's data (every row here is
 * scoped to the caller's own user_id). It is about the member's own list staying
 * coherent: a tick against a benefit on a card they have not confirmed would be
 * stored, counted by nothing, and impossible to clear from the UI, because the
 * benefit is never drawn. Returning null makes that a clean 400.
 */
async function resolveBenefit(uid: string, benefitId: string): Promise<{ period: BenefitPeriod | null } | null> {
  const r = await adminRest(
    `card_product_benefits?id=eq.${enc(benefitId)}&select=id,period,product_id`,
  );
  if (!r.ok) {
    console.error(`[benefits] could not read benefit ${benefitId} (${r.status})`);
    return null;
  }
  const found = (await r.json().catch(() => [])) as { period: BenefitPeriod | null; product_id: string }[];
  const benefit = found[0];
  if (!benefit) return null;

  const held = await adminRest(
    `member_cards?user_id=eq.${uid}&product_id=eq.${enc(benefit.product_id)}&select=id&limit=1`,
  );
  const rows = held.ok ? ((await held.json().catch(() => [])) as unknown[]) : [];
  if (!rows.length) return null;

  return { period: benefit.period };
}

async function tick(uid: string, body: Record<string, unknown>): Promise<Response> {
  const benefitId = norm(body.benefit_id);
  if (!benefitId || benefitId.length > MAX_ID) return json({ error: "A benefit is required" }, 400);

  const benefit = await resolveBenefit(uid, benefitId);
  if (!benefit) return json({ error: "That benefit is not on one of your cards" }, 400);

  const periodKey = benefitPeriodKey(benefit.period, new Date());
  // ignore-duplicates, not merge-duplicates: the row records THAT it was used
  // and when, so a second tick in the same period must keep the first
  // timestamp rather than sliding it forward. "Used 14 March" is the useful
  // thing on screen, and it should not become "used today" because somebody
  // tapped twice.
  const r = await adminRest(
    "card_benefit_uses?on_conflict=user_id,benefit_id,period_key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: uid, benefit_id: benefitId, period_key: periodKey }),
    },
  );
  if (!r.ok) {
    console.error(`[benefits] tick failed (${r.status}) ${await r.text().catch(() => "")}`);
    return json({ error: "Could not save that" }, 500);
  }
  return json({ ok: true, benefit_id: benefitId, period_key: periodKey, used: true });
}

async function untick(uid: string, url: URL): Promise<Response> {
  const benefitId = norm(url.searchParams.get("benefit"));
  if (!benefitId || benefitId.length > MAX_ID) return json({ error: "A benefit is required" }, 400);

  const benefit = await resolveBenefit(uid, benefitId);
  if (!benefit) return json({ error: "That benefit is not on one of your cards" }, 400);

  // Only the CURRENT period is cleared, not every period. Unticking is "I have
  // not used this yet after all", a statement about now; deleting the history
  // would also erase last year's answer, which the member never asked to change.
  const periodKey = benefitPeriodKey(benefit.period, new Date());
  const r = await adminRest(
    `card_benefit_uses?user_id=eq.${uid}&benefit_id=eq.${enc(benefitId)}&period_key=eq.${enc(periodKey)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  if (!r.ok) {
    console.error(`[benefits] untick failed (${r.status})`);
    return json({ error: "Could not undo that" }, 500);
  }
  return json({ ok: true, benefit_id: benefitId, period_key: periodKey, used: false });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "POST") {
    return tick(uid, (await req.json().catch(() => ({}))) as Record<string, unknown>);
  }
  if (req.method === "DELETE") return untick(uid, new URL(req.url));
  return json({ error: "Method not allowed" }, 405);
}
