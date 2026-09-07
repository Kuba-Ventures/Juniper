// The card catalog: read once, shaped once, shared by two callers. Issue
// #289, item 4 ("move catalog out of the /api/card-rewards response into its
// own searchable endpoint").
//
// api/card-rewards.ts still needs the raw rows server-side, for
// `rankCandidates` (an account name has to be scored against every product,
// held or not) and for `identityOf`'s art/colour lookup on a hand-entered
// card, but it no longer SENDS them: that's what moved to api/card-catalog.ts,
// the endpoint the client now reads the catalog from directly. Splitting the
// read from the shaping means neither caller can drift from the other about
// what a catalog row looks like on the wire.
import { adminRest } from "./_supabase-admin";
import { shortCardName, type CardProduct } from "./_rewards";

/**
 * How much Juniper knows about a product, from migration 0039.
 *
 * `featured` has researched rates and feeds the earning guide, the switch
 * suggestions and the upgrade rows. `listed` is identity only -- it exists so
 * the Identify picker can always name a member's card -- and is kept out of
 * anything rate-driven, because it has no rates to be right about.
 *
 * Declared here rather than in api/_rewards.ts, for the same reason art is:
 * the pure rewards module should not have to know that some products are
 * withheld from it.
 */
export type CardTier = "featured" | "listed";

export type CardCatalogRow = CardProduct & { art_url: string | null; tier: CardTier };

/**
 * The raw catalog rows, degrading if migration 0035 (art) or 0039 (tier) has
 * not been applied.
 *
 * PostgREST rejects the whole select on one unknown column, and a generic
 * failure-to-`[]` here would mean an empty catalog: no rewards, no benefits,
 * an Identify picker with nothing in it, and now a card-catalog endpoint that
 * answers with nothing to search. So `art_url` and `tier` are each tried and
 * degraded separately, the same shape the #211 columns and the per-item
 * health columns in api/plaid/accounts.ts use, and losing `tier` must not also
 * cost `art_url`.
 */
export async function readCardCatalog(): Promise<CardCatalogRow[]> {
  const base = "id,issuer,network,name,annual_fee,brand_color,rewards_currency," +
    "point_value_cents,base_multiplier,base_unit,source_url,as_of,verified";
  const scope = "card_products?status=eq.active";
  const attempts: { select: string; warn?: string }[] = [
    { select: `${base},art_url,tier` },
    { select: `${base},art_url`, warn: "tier unavailable, is migration 0039 applied?" },
    { select: base, warn: "art_url and tier unavailable, are migrations 0035 and 0039 applied?" },
  ];
  try {
    let r: Response | null = null;
    for (const a of attempts) {
      r = await adminRest(`${scope}&select=${a.select}`);
      if (r.ok) {
        if (a.warn) console.warn(`[cards] ${a.warn}`);
        break;
      }
    }
    if (!r || !r.ok) {
      console.error(`[cards] could not read the card catalog (${r?.status})`);
      return [];
    }
    const raw = (await r.json().catch(() => [])) as
      (CardProduct & { art_url?: string | null; tier?: string })[];
    // Absent `tier` means the column is not there yet, and every row that
    // existed before 0039 was researched, so featured is the honest default
    // rather than a lenient one. An unrecognized value is treated as listed:
    // wrongly withholding a card from the rewards maths is a quiet gap, and
    // wrongly including one is a wrong dollar figure.
    return (Array.isArray(raw) ? raw : []).map((p) => ({
      ...p,
      art_url: p.art_url ?? null,
      tier: p.tier == null ? "featured" : p.tier === "featured" ? "featured" : "listed",
    }));
  } catch {
    console.error("[cards] read threw for the card catalog");
    return [];
  }
}

export interface CardCatalogEntry {
  product_id: string; name: string; short_name: string; issuer: string;
  annual_fee: number; rewards_currency: string; brand_color: string | null;
  network: string | null; point_value_cents: number | null;
  art_url: string | null; tier: CardTier;
}

/** The wire shape both callers send: BOTH tiers, deliberately, so a member can
    always be shown the card they hold, and `short_name`/`point_value_cents`
    carried for every product, held or not, since the switch and upgrade rows
    (built server-side in api/card-rewards.ts) need to draw a face and a
    disclosure chip for a product the member does not own. */
export function shapeCatalogEntries(rows: CardCatalogRow[]): CardCatalogEntry[] {
  return rows.map((p) => ({
    product_id: p.id, name: p.name, issuer: p.issuer,
    annual_fee: Number(p.annual_fee) || 0, rewards_currency: p.rewards_currency,
    brand_color: p.brand_color,
    point_value_cents: p.point_value_cents == null ? null : Number(p.point_value_cents),
    short_name: shortCardName(p.name, p.issuer),
    network: p.network,
    art_url: p.art_url,
    tier: p.tier,
  }));
}
