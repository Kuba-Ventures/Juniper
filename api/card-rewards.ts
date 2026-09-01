// GET /api/card-rewards
//
// Everything the Credit page's rewards surface draws, in one request: which
// linked credit accounts the member has confirmed a product for, which are still
// waiting to be identified (with ranked guesses attached), the earning guide,
// what the wrong card is costing them, cards that would beat theirs, and the
// benefits checklist.
//
// ONE ENDPOINT ON PURPOSE. The alternative is four (catalog, confirmations,
// guide, benefits) and four round trips before the page can draw anything, and
// three of them would need the same three joins. The whole payload is small
// because the catalog is small. THE MOMENT THE CATALOG PASSES A FEW HUNDRED
// PRODUCTS, `catalog` below has to become its own searchable endpoint rather
// than riding along here; it is listed last in the response for that reason.
//
// The arithmetic is not here. It is in api/_rewards.ts, pure and I/O-free, so
// scripts/src/check-rewards.ts can exercise all of it without a database, a
// Plaid account or a session. This file's whole job is reading the rows and
// handing them over.
//
// WHY THIS DOES NOT GO THROUGH lib/finances.ts. The house rule routes money
// features through that seam, and the Credit page already carries a documented
// exception for the same reason this endpoint does: the `/api/finances` account
// rollup carries name, institution and balance only. This surface needs two
// things it does not have, each card's `limit` (from the stored Plaid snapshot)
// and per-ACCOUNT spend (from `transactions.account_id`), because "your
// groceries are on the wrong card" is a statement about one account, not about
// the member's total. Collapsing onto the seam means widening that rollup twice.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { taxonomyFor } from "./_taxonomy";
import { creditPosition } from "./_credit-balance";
import { coveredDays, isoDaysAgo, WINDOW_DAYS } from "./_finance-snapshot";
import {
  anyUnverified, benefitPeriodKey, earningGuide, oldestAsOf, rankCandidates,
  shortCardName, switchIdeas, trackBenefits, upgradeIdeas,
  type AccountCategorySpend, type Benefit, type BenefitPeriod, type CapPeriod,
  type CardProduct, type EarnRow, type EarnUnit, type MemberCard,
} from "./_rewards";

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

// How many categories the guide names. The list is the member's own spend order,
// so this is a length cap rather than a choice of categories: past about eight
// rows the guide stops being a thing anybody reads and the tail is all rounding.
const GUIDE_CATEGORIES = 8;

interface ItemRow {
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  accounts: {
    account_id: string; name: string; mask: string | null; type: string | null;
    balance: number | null; limit: number | null; currency: string | null;
  }[] | null;
}
interface MemberCardRow {
  plaid_account_id: string;
  product_id: string | null;
  /** #211: a limit the member supplied, for a card the bank reports none for. */
  credit_limit: number | null;
  credit_limit_set_at: string | null;
  /** Whether they have answered WHICH PRODUCT this is. Not the same as the row
      existing, since a row can now exist only to hold a limit. */
  product_answered: boolean;
}
interface TxnRow { account_id: string | null; amount: number; date: string; category: string | null; category_id: string | null }
interface UseRow { benefit_id: string; period_key: string; used_at: string }

async function rows<T>(query: string, what: string): Promise<T[]> {
  try {
    const r = await adminRest(query);
    if (!r.ok) {
      // Degrade rather than 500. A missing table means a deploy that has run
      // ahead of migration 0031, and the honest answer there is "no cards
      // identified yet", which renders the same prompt a new member sees. A
      // blank Credit page would be worse and harder to diagnose.
      console.error(`[cards] could not read ${what} (${r.status})`);
      return [];
    }
    return (await r.json().catch(() => [])) as T[];
  } catch {
    console.error(`[cards] read threw for ${what}`);
    return [];
  }
}

/**
 * The member's card answers, degrading if migration 0033 has not been applied.
 *
 * PostgREST rejects the WHOLE select on one unknown column, and the generic
 * `rows()` helper above turns any failure into an empty array. That combination
 * would be actively harmful here rather than merely quiet: with no confirmations,
 * every card looks unidentified, so a deploy landing ahead of 0033 would put
 * cards the member has already identified back into the Identify queue and drop
 * the rewards data they had. So the pre-0033 columns are requested separately and
 * the #211 ones are treated as optional, the same shape as the per-item health
 * columns in api/plaid/accounts.ts.
 *
 * `product_answered` defaults to TRUE when absent, which matches the column's own
 * DEFAULT and is the only safe reading: every row that exists before 0033 was
 * created by a product answer.
 */
async function readConfirmations(uid: string): Promise<MemberCardRow[]> {
  const base = "plaid_account_id,product_id";
  const withLimit = `${base},credit_limit,credit_limit_set_at,product_answered`;
  const scope = `member_cards?user_id=eq.${uid}`;
  try {
    let r = await adminRest(`${scope}&select=${withLimit}`);
    if (!r.ok) {
      r = await adminRest(`${scope}&select=${base}`);
      if (r.ok) console.warn("[cards] member limit columns unavailable, is migration 0033 applied?");
    }
    if (!r.ok) {
      console.error(`[cards] could not read card confirmations (${r.status})`);
      return [];
    }
    const raw = (await r.json().catch(() => [])) as Partial<MemberCardRow>[];
    return (Array.isArray(raw) ? raw : []).map((c) => ({
      plaid_account_id: String(c.plaid_account_id ?? ""),
      product_id: c.product_id ?? null,
      credit_limit: c.credit_limit == null ? null : Number(c.credit_limit),
      credit_limit_set_at: c.credit_limit_set_at ?? null,
      product_answered: c.product_answered ?? true,
    }));
  } catch {
    console.error("[cards] read threw for card confirmations");
    return [];
  }
}

/**
 * The card catalog, degrading if migration 0035 has not been applied.
 *
 * PostgREST rejects the whole select on one unknown column, and `rows()` turns any
 * failure into an empty array, which here would mean an empty catalog: no rewards,
 * no benefits, and an Identify picker with nothing in it. So `art_url` is
 * requested as optional and retried without, the same shape as the #211 columns in
 * `readConfirmations` and the per-item health columns in api/plaid/accounts.ts.
 */
/**
 * How much Juniper knows about a product, from migration 0039.
 *
 * `featured` has researched rates and feeds the earning guide, the switch
 * suggestions and the upgrade rows. `listed` is identity only -- it exists so the
 * Identify picker can always name a member's card -- and is kept out of anything
 * rate-driven, because it has no rates to be right about.
 *
 * Deliberately declared HERE rather than in api/_rewards.ts, for the same reason
 * art is: the pure rewards module should not have to know that some products are
 * withheld from it. It receives featured products and computes. Whether a catalog
 * row earned its place in that list is this handler's problem.
 */
type CardTier = "featured" | "listed";

async function readCatalog(): Promise<
  (CardProduct & { art_url: string | null; tier: CardTier })[]
> {
  const base = "id,issuer,network,name,annual_fee,brand_color,rewards_currency," +
    "point_value_cents,base_multiplier,base_unit,source_url,as_of,verified";
  const scope = "card_products?status=eq.active";
  // Tried most-complete first and degraded one optional column at a time, the
  // same shape the #211 columns and the per-item health columns use. The point is
  // that a deploy landing ahead of its migration serves a catalog missing one
  // field rather than no catalog at all -- and losing `tier` must not also cost
  // us `art_url`, which is why these are separate steps and not one fallback.
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
    // Absent `tier` means the column is not there yet, and every row that existed
    // before 0039 was researched, so featured is the honest default rather than a
    // lenient one. An unrecognized value is treated as listed: the failure mode of
    // wrongly withholding a card from the rewards maths is a quiet gap, and the
    // failure mode of wrongly including one is a wrong dollar figure.
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const since = isoDaysAgo(WINDOW_DAYS);
  const [items, confirmations, productRows, earnRows, benefitRows, txns, uses] = await Promise.all([
    rows<ItemRow>(`plaid_items?user_id=eq.${uid}&select=item_id,institution_id,institution_name,accounts`, "linked items"),
    readConfirmations(uid),
    readCatalog(),
    rows<EarnRow & { unit: EarnUnit; cap_period: CapPeriod | null }>(
      "card_product_earn?select=product_id,category_id,category_label,multiplier,unit,cap_amount,cap_period,note",
      "earn rates"),
    rows<{ id: string; product_id: string; benefit_group: string; name: string; detail: string | null;
           value_amount: number | null; period: BenefitPeriod | null }>(
      "card_product_benefits?select=id,product_id,benefit_group,name,detail,value_amount,period", "card benefits"),
    rows<TxnRow>(
      `transactions?user_id=eq.${uid}&date=gte.${since}&select=account_id,amount,date,category,category_id&limit=2000`,
      "transactions"),
    rows<UseRow>(`card_benefit_uses?user_id=eq.${uid}&select=benefit_id,period_key,used_at`, "benefit ticks"),
  ]);

  // ── The member's credit accounts ─────────────────────────────────────────
  // `type === "credit"` is Plaid's taxonomy for cards plus the odd line of
  // credit. Loans are a separate type and have no rewards, so they are not here.
  const accounts = items.flatMap((it) =>
    (it.accounts ?? [])
      .filter((a) => (a.type ?? "").toLowerCase() === "credit")
      .map((a) => ({
        plaid_account_id: a.account_id,
        // Plaid's id for the issuer, carried so the client can read the brand map
        // (which is keyed by id) directly rather than matching on a display name,
        // exactly as the card rows on this page already do.
        institution_id: it.institution_id ?? null,
        institution: it.institution_name || "Linked institution",
        account_name: a.name,
        mask: a.mask,
        // Both halves travel. A card in credit must not be drawn as debt, and the
        // surface has to be able to say which it is. See api/_credit-balance.ts.
        balance: creditPosition(a.balance).owed,
        inCredit: creditPosition(a.balance).inCredit,
        limit: a.limit != null && a.limit > 0 ? a.limit : null,
        currency: a.currency,
      })));

  if (!accounts.length) {
    return json({ linked: false, cards: [], unidentified: [], guide: [], switches: [], upgrades: [], benefits: null });
  }

  // Kept apart from `products` because the pure module's CardProduct has no art:
  // art is a presentation fact and api/_rewards.ts should not learn about it.
  const artById = new Map<string, string | null>(
    productRows.map((p) => [p.id, (p as { art_url?: string | null }).art_url ?? null]),
  );
  const artOf = (id: string) => artById.get(id) ?? null;
  const tierById = new Map<string, CardTier>(productRows.map((p) => [p.id, p.tier]));
  const tierOf = (id: string): CardTier => tierById.get(id) ?? "featured";

  // TWO collections, and the split is the whole of #0039 in the handler.
  //
  // `products` feeds api/_rewards.ts: the earning guide, the switches, the
  // upgrades. Featured only. A listed row reaching this map would be computed
  // with, and since `base_multiplier` is NULL on listed rows the coercion below
  // would turn it into 0 -- so the member would be told a card they might hold
  // earns nothing, which is worse than saying nothing at all.
  //
  // `identifiable` feeds the Identify picker and the `catalog` payload, and holds
  // BOTH tiers. That is the point of the tier: a member must be able to name any
  // card, and every face on the page resolves its art and colour through the
  // catalog payload, listed cards included, so that none of them draw blank.
  const featuredRows = productRows.filter((p) => p.tier === "featured");
  const products = new Map<string, CardProduct>(
    featuredRows.map((p) => [p.id, {
      ...p,
      // PostgREST hands NUMERIC back as a string in some configurations, and a
      // string multiplier would make every rate NaN in silence. Coerced once,
      // here, rather than defended against in the pure module, which should be
      // allowed to trust its own types.
      annual_fee: Number(p.annual_fee) || 0,
      point_value_cents: p.point_value_cents == null ? null : Number(p.point_value_cents),
      base_multiplier: Number(p.base_multiplier) || 0,
    }]),
  );
  const earnByProduct = new Map<string, EarnRow[]>();
  for (const r of earnRows) {
    const row: EarnRow = {
      ...r,
      multiplier: Number(r.multiplier) || 0,
      cap_amount: r.cap_amount == null ? null : Number(r.cap_amount),
    };
    const list = earnByProduct.get(row.product_id);
    if (list) list.push(row); else earnByProduct.set(row.product_id, [row]);
  }
  const benefits: Benefit[] = benefitRows.map((b) => ({
    id: b.id, product_id: b.product_id, group: b.benefit_group, name: b.name,
    detail: b.detail, period: b.period,
    value_amount: b.value_amount == null ? null : Number(b.value_amount),
  }));

  // ── Confirmed, and still to identify ────────────────────────────────────
  //
  // "Has the member answered which product this is" is `product_answered`, NOT
  // the presence of a row. Since #211 a row can exist purely to hold a credit
  // limit, and reading existence as an answer would make the Identify prompt stop
  // asking about a card nobody has identified. product_id NULL with
  // product_answered TRUE is the real answer "my card is not in your catalog".
  const byAccount = new Map(confirmations.map((c) => [c.plaid_account_id, c]));
  const answeredProduct = (id: string) => byAccount.get(id)?.product_answered === true;
  const productOf = (id: string) => (answeredProduct(id) ? byAccount.get(id)?.product_id ?? null : null);
  const memberCards: MemberCard[] = accounts.map((a) => ({
    plaid_account_id: a.plaid_account_id,
    product_id: productOf(a.plaid_account_id),
    institution: a.institution,
    account_name: a.account_name,
    mask: a.mask,
  }));
  // Every product a member could plausibly say they hold, both tiers, for the
  // picker and for face lookups. Built from productRows rather than the featured
  // map precisely so a listed card is nameable.
  const identifiable: CardProduct[] = productRows.map((p) => ({
    ...p,
    annual_fee: Number(p.annual_fee) || 0,
    point_value_cents: p.point_value_cents == null ? null : Number(p.point_value_cents),
    // A listed row has no base rate. Zero here is never used for arithmetic --
    // nothing in this list reaches api/_rewards.ts's rate maths -- it exists only
    // so the shape satisfies CardProduct for ranking and naming.
    base_multiplier: p.base_multiplier == null ? 0 : Number(p.base_multiplier) || 0,
  }));
  const catalog = identifiable;
  const unidentified = accounts
    .filter((a) => !answeredProduct(a.plaid_account_id))
    .map((a) => ({
      ...a,
      // Ranked guesses, capped, so the picker opens on a short list rather than
      // the whole catalog. `confidence` orders it and NOTHING promotes a guess
      // into a stored answer: see rule 2 in _rewards.ts.
      candidates: rankCandidates(a, catalog).slice(0, 6).map((c) => ({
        product_id: c.product.id, name: c.product.name, issuer: c.product.issuer,
        annual_fee: Number(c.product.annual_fee) || 0,
        rewards_currency: c.product.rewards_currency, brand_color: c.product.brand_color,
        art_url: artOf(c.product.id),
        // So the picker can say, before the tap rather than after it, that this
        // is a card Juniper can name but has no rewards data for. Withholding
        // that until they have already chosen makes the surface look broken.
        tier: tierOf(c.product.id),
        confidence: Number(c.confidence.toFixed(3)),
      })),
    }));

  // ── The member's own spend, per account and per category ────────────────
  //
  // Resolved through THIS member's taxonomy, not a module-level table, so a
  // renamed or member-created category lands in the bucket they gave it. The
  // same three rules /api/finances applies: transfers are dropped entirely
  // (a card payment is not a purchase, and counting it would recommend a card
  // for paying off a card), income is not spending, and spending is summed
  // SIGNED so a refund reduces the category it came back to.
  const tax = await taxonomyFor(uid);
  const spendMap = new Map<string, AccountCategorySpend>();
  const spendDates: string[] = [];
  for (const t of txns) {
    if (!t.account_id) continue;
    const cls = tax.classify(t.category_id, t.category);
    if (cls.k !== "spend") continue;
    spendDates.push(t.date);
    const categoryId = t.category_id || tax.categoryIdOf(t.category);
    if (!categoryId) continue;   // an unrecognized label gets no id, and no guess
    const key = `${t.account_id}|${categoryId}`;
    const prev = spendMap.get(key);
    if (prev) prev.amount += t.amount;
    else spendMap.set(key, {
      plaid_account_id: t.account_id, category_id: categoryId,
      category_label: cls.c, amount: t.amount,
    });
  }
  const spend = [...spendMap.values()];
  // The history that actually exists, never an assumed 90 days. Getting this
  // wrong is the bug _finance-snapshot.ts already had once.
  const months = coveredDays(spendDates) / 30;

  // ── The guide's category list: the member's own, in their own spend order ─
  //
  // Not Credit Karma's fixed Groceries / Gas / Dining / Travel. A member who
  // spends nothing on gas does not need a gas row, and one whose biggest
  // category is Pharmacy should see Pharmacy first.
  const byCategory = new Map<string, { label: string; total: number }>();
  for (const s of spend) {
    if (!(s.amount > 0)) continue;
    const prev = byCategory.get(s.category_id);
    if (prev) prev.total += s.amount;
    else byCategory.set(s.category_id, { label: s.category_label, total: s.amount });
  }
  const spendOrder = [...byCategory.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, GUIDE_CATEGORIES)
    .map(([id, v]) => ({ id, label: v.label, monthlySpend: v.total / months }));

  const parentOf = (categoryId: string): string | null => {
    // The member's own tree, so a leaf they created resolves to the group they
    // put it in. A group id has no parent, and neither does anything unknown.
    for (const g of tax.groups) {
      if (g.id === categoryId) return null;
      if (g.leaves.some((l) => l.id === categoryId)) return g.id;
    }
    return null;
  };

  const guide = earningGuide({
    cards: memberCards, products, earnByProduct, parentOf,
    categories: spendOrder.map((c) => ({ id: c.id, label: c.label })),
  });
  const switches = switchIdeas({ cards: memberCards, products, earnByProduct, parentOf, spend, months });
  const upgrades = upgradeIdeas({ cards: memberCards, products, earnByProduct, parentOf, spend, months });
  const tracked = trackBenefits({ cards: memberCards, products, benefits, uses, today: new Date() });

  return json({
    linked: true,
    // Confirmed cards, each carrying the product it is and the balance and limit
    // the bank reports, so the hero can draw faces and totals from one list.
    cards: accounts.map((a) => {
      const productId = productOf(a.plaid_account_id);
      const p = productId ? products.get(productId) : null;
      const row = byAccount.get(a.plaid_account_id);
      // BOTH limits travel, separately, and the client picks. One effective
      // number computed here plus another computed there would be two answers to
      // "what is this card's limit", free to disagree; and the surface has to be
      // able to say WHICH kind it drew, because a limit the member typed is a
      // claim and a limit the bank reported is a fact.
      const memberLimit = row?.credit_limit == null ? null : Number(row.credit_limit);
      return {
        ...a,
        bank_limit: a.limit,
        member_limit: memberLimit != null && memberLimit > 0 ? memberLimit : null,
        member_limit_set_at: row?.credit_limit_set_at ?? null,
        answered: answeredProduct(a.plaid_account_id),
        product: p ? {
          id: p.id, name: p.name, issuer: p.issuer, network: p.network,
          // Derived here rather than on the client so there is one definition and
          // scripts/src/check-rewards.ts is the thing that proves it.
          short_name: shortCardName(p.name, p.issuer),
          annual_fee: Number(p.annual_fee) || 0, brand_color: p.brand_color,
          rewards_currency: p.rewards_currency,
          point_value_cents: p.point_value_cents == null ? null : Number(p.point_value_cents),
          source_url: p.source_url, as_of: p.as_of, verified: p.verified,
          art_url: artOf(p.id),
        } : null,
      };
    }),
    unidentified,
    guide: guide.map((g, i) => ({
      categoryId: g.categoryId,
      categoryLabel: g.categoryLabel,
      monthlySpend: spendOrder[i]?.monthlySpend ?? 0,
      assumesPointValue: g.assumesPointValue,
      best: g.best && {
        productId: g.best.product.id, productName: g.best.product.name,
        display: g.best.display, pct: g.best.pct, note: g.best.note, cap: g.best.cap,
        brandColor: g.best.product.brand_color,
        assumesPointValue: g.best.assumesPointValue,
      },
      tied: g.tied.map((t) => ({
        productId: t.product.id, productName: t.product.name, display: t.display,
        brandColor: t.product.brand_color,
      })),
      others: g.others.slice(0, 2).map((o) => ({
        productId: o.product.id, productName: o.product.name, display: o.display,
        brandColor: o.product.brand_color,
      })),
    })),
    switches,
    upgrades,
    benefits: tracked,
    // ── Provenance, and it is not optional decoration ─────────────────────
    // The catalog is hand-assembled, `verified` is false on everything the seed
    // wrote, and the page has to say so for as long as that is true of any card
    // this member holds. `asOf` is the OLDEST across their cards, because the
    // stalest row is the only one worth quoting.
    provenance: {
      anyUnverified: anyUnverified(memberCards, products),
      asOf: oldestAsOf(memberCards, products),
      // Whether any figure above rests on the house cents-per-point assumption.
      assumesPointValue: guide.some((g) => g.assumesPointValue)
        || switches.some((s) => s.assumesPointValue)
        || upgrades.some((u) => u.assumesPointValue),
      // The period buckets the tracker's ticks are recorded against right now,
      // so the surface can name them rather than implying an issuer's own reset
      // date, which Juniper cannot know (Plaid does not return an account's open
      // date, so a cardmember year is not computable).
      periods: {
        month: benefitPeriodKey("month", new Date()),
        quarter: benefitPeriodKey("quarter", new Date()),
        year: benefitPeriodKey("year", new Date()),
      },
    },
    // Last, and flagged: this is the whole catalog, for the "my card is not
    // listed" and "search all cards" paths in the picker. It rides along only
    // while the catalog is small enough for that to be free.
    catalog: catalog.map((p) => ({
      product_id: p.id, name: p.name, issuer: p.issuer,
      annual_fee: Number(p.annual_fee) || 0, rewards_currency: p.rewards_currency,
      brand_color: p.brand_color,
      // Carried so the disclosure chip can NAME the assumption ("assumes
      // 1.25c/pt") rather than gesturing at it ("assumes a point value"). A
      // caveat that does not say what it assumes is barely a caveat, and this is
      // the only place the number is available for a product the member does not
      // hold, which the upgrade rows need.
      point_value_cents: p.point_value_cents == null ? null : Number(p.point_value_cents),
      // Carried for every product, held or not, because the switch and upgrade
      // rows draw faces for cards the member does not own and those faces need a
      // name that fits. Derived once, server-side, by the function the check
      // script proves.
      short_name: shortCardName(p.name, p.issuer),
      network: p.network,
      art_url: artOf(p.id),
      // Sent so the client can say "Juniper does not have this card's rewards
      // yet" instead of rendering a rates section that would be empty and read
      // as "this card earns nothing".
      tier: tierOf(p.id),
    })),
  });
}
