// Card rewards maths: which of the member's cards is best where, what the wrong
// card is costing them, and which benefits they are sitting on. Issue #168.
//
// Pure and I/O-free, the same split as _score.ts beside score/, _picks.ts beside
// recommendations.ts, and _categorize.ts beside _taxonomy.ts. Every number this
// file produces ends up in front of a member as a dollar figure, so all of it is
// exercised by scripts/src/check-rewards.ts without a database, a Plaid account
// or a session.
//
// ── THE HONESTY PROBLEM, WHICH IS THE WHOLE DESIGN ─────────────────────────
//
// The Credit page was rewritten once already to strip fabricated data (a 726
// score, an eight-month trend, bureau-style factor rows) that had no source. The
// same trap is wide open here and it is worse, because a rewards rate LOOKS like
// a fact and is really a snapshot of a marketing page that changed last Tuesday.
// Three rules fall out, and they are enforced in the schema rather than left to
// whoever writes the next seed:
//
//   1. No earn rate and no benefit exists without `source_url` and `as_of`.
//      Both are NOT NULL in migration 0031. A row that cannot say where it came
//      from cannot be stored, so it cannot be drawn.
//   2. Nothing is inferred about WHICH card a member holds. Plaid returns an
//      institution and an account name ("CREDIT CARD", "Freedom Unlimited");
//      neither identifies a product, and guessing wrong attaches a stranger's
//      reward rates to somebody's real spending. `rankCandidates` proposes and
//      the member confirms. There is no auto-confirm path, deliberately, and
//      `confidence` exists to ORDER the picker, never to skip it.
//   3. A points card's value is an ASSUMPTION, not a rate. Comparing "3x points"
//      against "1.5% cash back" is impossible without saying what a point is
//      worth, so the assumption is stored per product (`point_value_cents`),
//      travels with every comparison that used it (`assumesPointValue`), and the
//      UI says so. Credit Karma's own Cards Optimizer sidesteps this by showing
//      "3x points" and never comparing across currencies; Juniper does compare,
//      so Juniper has to show its working.
//
// Rule 3 is the one most likely to be quietly dropped by a later change. If a
// caller stops threading `assumesPointValue` through to the surface, the page
// starts presenting a house valuation as though the issuer published it.

// ── Shapes ──────────────────────────────────────────────────────────────────

/** How an earn rate is denominated. `percent` is cash back and needs no
    valuation; the other two do, and that is the whole reason the union exists. */
export type EarnUnit = "percent" | "points" | "miles";

/** A cap's reset window. Chase's rotating 5% is $1,500 per QUARTER, Amex Blue
    Cash Preferred's 6% groceries is $6,000 per YEAR, and a few cards cap
    monthly, so all three are representable and none is assumed. */
export type CapPeriod = "month" | "quarter" | "year";

/**
 * How often a benefit's value comes back. `once` is a signup or a one-time
 * credit and can never be "used again".
 *
 * `quarter` earns its place: rotating bonus categories have to be ACTIVATED four
 * times a year and are the single most commonly forgotten perk on a no-fee card.
 * A tracker that could not represent a quarterly reset would be unable to remind
 * anybody about the one benefit they are most likely to miss.
 */
export type BenefitPeriod = "month" | "quarter" | "year" | "once";

export interface CardProduct {
  /** Slug, e.g. `chase-freedom-unlimited`. Same reasoning as category ids: read
      by a human in a failing query far more often than by a machine. */
  id: string;
  issuer: string;
  network: string | null;
  /** The product name as the ISSUER spells it, trademark symbols and all, so a
      member recognizing their own card is a straight string comparison. */
  name: string;
  annual_fee: number;
  brand_color: string | null;
  /** Display word for the currency: "cash back", "points", "miles". */
  rewards_currency: string;
  /**
   * Cents per point/mile, the disclosed assumption behind every cross-currency
   * comparison this module makes. NULL on a cash-back card, where a cent is a
   * cent and there is nothing to assume.
   *
   * This is a HOUSE NUMBER, not an issuer number, and it is the single most
   * arguable value in the catalog: transfer-partner redemptions can beat it by
   * double and a statement credit can miss it by half. It is stored per product
   * rather than per currency so a later revision can move one card without
   * restating every comparison in the catalog.
   */
  point_value_cents: number | null;
  /** The everything-else rate, in `base_unit`. */
  base_multiplier: number;
  base_unit: EarnUnit;
  source_url: string;
  /** yyyy-mm-dd the rate was read off `source_url`. */
  as_of: string;
  /**
   * Whether a human has checked this row against the issuer's own page since it
   * was seeded. False on everything the seed migration writes, on purpose: the
   * seed is a starting catalog assembled without contacting an issuer, and the
   * surface says so until somebody verifies it. Same posture as the placeholder
   * `partners.url` values that gate monetization.
   */
  verified: boolean;
}

export interface EarnRow {
  product_id: string;
  /** A Juniper taxonomy id, leaf (`c_gas`) or group (`g_fun_travel`). Stored
      against whichever level the issuer's own bonus category actually matches,
      which is why both are allowed. */
  category_id: string;
  category_label: string;
  multiplier: number;
  unit: EarnUnit;
  cap_amount: number | null;
  cap_period: CapPeriod | null;
  /** The fine print, verbatim enough to be useful: "online grocery purchases
      only, excludes Target, Walmart and wholesale clubs". */
  note: string | null;
}

export interface Benefit {
  id: string;
  product_id: string;
  /** Perk family, for grouping the tracker: "Travel", "Airport", "Shopping",
      "Dining", "Protection". */
  group: string;
  name: string;
  detail: string | null;
  /** Dollar value where the benefit is a credit. NULL where it is not a number
      (lounge access, primary rental coverage). Those are trackable but not
      summable, and `BenefitSummary.unusedValue` skips them rather than guessing. */
  value_amount: number | null;
  period: BenefitPeriod | null;
  /** ISO date the benefit stops, or null for "no stated end date" (migration
      0043). Null is NOT a promise that it renews forever -- an issuer can withdraw
      a perk whenever it likes -- it means the issuer has published no end date,
      which is all the catalog can know.

      A benefit past this date is dropped by `trackBenefits`, so it never reaches
      the tracker, the summary, or the unused-value total. Card perks increasingly
      carry a stated expiry (five of the Sapphire Reserve's do), and without this
      they had to be left out entirely: a tracker with no way to represent an
      ending would still be asking somebody in 2028 to use a credit that stopped
      in 2027. */
  expires_on: string | null;
  /** Lowercase merchant substring, or null (migration 0052). Set on a benefit
      only when a charge to this merchant is real evidence worth surfacing --
      "Uber Cash" and nothing that says "eligible partners" or "participating
      restaurants" -- which is nearly no row in the catalog. See `matchAutoBenefits`
      and 0052's own header for which two qualify for `auto_mode = 'tick'` today
      and why no others do. NULL, the default, means the member ticks it by hand,
      same as every benefit before this column existed. */
  auto_merchant: string | null;
  /** What a match against `auto_merchant` means (migration 0053). 'tick': the
      charge IS the credit, restated (Uber Cash), so `matchAutoBenefits`'s caller
      writes the row itself. 'suggest': the charge is real evidence but not proof
      (a Chase Travel charge might not be the hotel stay the $50 credit covers),
      so the match is surfaced as `TrackedBenefit.suggestedEvidence` for the
      member to confirm, and nothing is written until they do. Meaningless while
      `auto_merchant` is null. */
  auto_mode: "tick" | "suggest";
}

/** A linked Plaid credit account, and the product the member confirmed it is. */
export interface MemberCard {
  plaid_account_id: string;
  /** NULL when the member has confirmed their card is NOT in the catalog. That
      is a real answer and a different state from never having been asked, which
      is the absence of a row entirely. */
  product_id: string | null;
  institution: string;
  account_name: string;
  mask: string | null;
}

/** Observed spend on one account in one category, over the window. */
export interface AccountCategorySpend {
  plaid_account_id: string;
  category_id: string;
  category_label: string;
  /** Signed sum over the window, so refunds have already reduced it. */
  amount: number;
}

// ── Rate arithmetic ─────────────────────────────────────────────────────────

/**
 * An earn rate as a percentage of spend, which is the only form two cards in
 * different currencies can be compared in.
 *
 * 3x points at 1.25 cents each is 3.75%. 1.5% cash back is 1.5%. A points rate
 * with no stored valuation falls back to one cent, which is the floor every
 * major program guarantees for a statement credit or a gift card, so the
 * fallback UNDERSTATES rather than flatters: a comparison that survives it is
 * still true at any higher valuation.
 */
export function ratePct(multiplier: number, unit: EarnUnit, pointValueCents: number | null): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0;
  if (unit === "percent") return multiplier;
  const cents = pointValueCents != null && pointValueCents > 0 ? pointValueCents : 1;
  return multiplier * cents;
}

/** True when reading this rate as a percentage required the house valuation. */
const needsValuation = (unit: EarnUnit) => unit !== "percent";

/** How the rate is written on the issuer's page, which is what a member
    recognizes. "3x points", "1.5% cash back", "5% cash back". */
export function displayRate(multiplier: number, unit: EarnUnit, currency: string): string {
  const n = Number.isInteger(multiplier) ? String(multiplier) : String(multiplier);
  if (unit === "percent") return `${n}% ${currency}`;
  return `${n}x ${currency}`;
}

/** A cap in plain words, for the row that is subject to one. */
export function displayCap(amount: number | null, period: CapPeriod | null): string | null {
  if (amount == null || amount <= 0 || !period) return null;
  const money = "$" + Math.round(amount).toLocaleString("en-US");
  return `on the first ${money} each ${period}`;
}

const PERIODS_PER_YEAR: Record<CapPeriod, number> = { month: 12, quarter: 4, year: 1 };

/**
 * What one card earns on a year of spending in one category, in dollars.
 *
 * Spend above a cap does NOT stop earning, it drops to the card's base rate,
 * and getting that wrong is the difference between a $90 recommendation and a
 * $340 one. Chase Freedom Flex at 5% on $1,500 a quarter is 5% on the first
 * $6,000 a year and 1% on everything after it, not 5% on all of it and not
 * nothing.
 */
export function annualEarn(
  annualSpend: number,
  row: EarnRow | null,
  product: CardProduct,
): number {
  if (!(annualSpend > 0)) return 0;
  const basePct = ratePct(product.base_multiplier, product.base_unit, product.point_value_cents);
  if (!row) return (annualSpend * basePct) / 100;

  const bonusPct = ratePct(row.multiplier, row.unit, product.point_value_cents);
  const capped =
    row.cap_amount != null && row.cap_amount > 0 && row.cap_period
      ? Math.min(annualSpend, row.cap_amount * PERIODS_PER_YEAR[row.cap_period])
      : annualSpend;
  const overflow = annualSpend - capped;
  // The overflow earns the BASE rate, not zero, and not the bonus rate.
  return (capped * bonusPct) / 100 + (overflow * basePct) / 100;
}

// ── Resolving a card's rate for a category ──────────────────────────────────

/**
 * Parent lookup for a taxonomy id: a leaf's group, or null for a group and for
 * anything unknown.
 *
 * Passed in rather than imported so this module stays free of the taxonomy's
 * database read (`taxonomyFor` touches Supabase) and so a member's own custom
 * categories resolve through THEIR tree, not a module-level copy of the
 * built-ins. Same reason `_categorize.ts` and `_taxonomy.ts` are two files.
 */
export type ParentOf = (categoryId: string) => string | null;

export interface ResolvedRate {
  product: CardProduct;
  /** The bonus row that applies, or null when only the base rate does. */
  row: EarnRow | null;
  pct: number;
  display: string;
  cap: string | null;
  note: string | null;
  /** True when `pct` rests on `point_value_cents` rather than on a published
      percentage. Threaded all the way to the surface, see rule 3 up top. */
  assumesPointValue: boolean;
}

/**
 * The rate one card earns in one category: its own row for that exact category,
 * else its row for the category's GROUP, else its base rate.
 *
 * Exact before group, because a card that earns 3% on Gas and 1% on the rest of
 * Transportation must not have the Gas row shadowed by the group row, and the
 * seed stores rows at whichever level the issuer's bonus category matches.
 */
export function rateFor(
  product: CardProduct,
  categoryId: string,
  earnByProduct: Map<string, EarnRow[]>,
  parentOf: ParentOf,
): ResolvedRate {
  const rows = earnByProduct.get(product.id) ?? [];
  const parent = parentOf(categoryId);
  const row = rows.find((r) => r.category_id === categoryId)
    ?? (parent ? rows.find((r) => r.category_id === parent) : undefined)
    ?? null;

  const multiplier = row ? row.multiplier : product.base_multiplier;
  const unit = row ? row.unit : product.base_unit;
  return {
    product,
    row,
    pct: ratePct(multiplier, unit, product.point_value_cents),
    display: displayRate(multiplier, unit, product.rewards_currency),
    cap: row ? displayCap(row.cap_amount, row.cap_period) : null,
    note: row?.note ?? null,
    assumesPointValue: needsValuation(unit),
  };
}

// ── The earning guide ───────────────────────────────────────────────────────

export interface GuideEntry {
  categoryId: string;
  categoryLabel: string;
  /** The member's best card here. Null only when they have no confirmed card. */
  best: ResolvedRate | null;
  /** Cards matching the winner's rate exactly. Credit Karma's "tied with 1
      other card" chip, and it matters: a tie means it does not matter which one
      they reach for, which is a genuinely different instruction from a winner. */
  tied: ResolvedRate[];
  /** Everything else they hold, best first, so the guide can show what the
      alternative costs rather than only naming the winner. */
  others: ResolvedRate[];
  /** True when ANY rate in this entry needed the house point valuation, so a
      surface can disclose it per row rather than once in a footnote nobody
      reads. */
  assumesPointValue: boolean;
}

/**
 * Sort key for one resolved rate, best first.
 *
 * Rate descending is obvious. The two tie-breaks are not, and both are chosen to
 * give the member the LESS surprising instruction when the money is identical:
 * an uncapped row beats a capped one (no "you already hit the limit in March"),
 * and a published percentage beats a points rate that only ties once the house
 * valuation is applied. Product id last, so the order is stable across loads
 * rather than dependent on however the rows came back from Postgres.
 */
function byRate(a: ResolvedRate, b: ResolvedRate): number {
  if (b.pct !== a.pct) return b.pct - a.pct;
  const capA = a.cap ? 1 : 0, capB = b.cap ? 1 : 0;
  if (capA !== capB) return capA - capB;
  const assumeA = a.assumesPointValue ? 1 : 0, assumeB = b.assumesPointValue ? 1 : 0;
  if (assumeA !== assumeB) return assumeA - assumeB;
  return a.product.id.localeCompare(b.product.id);
}

/** Cards a rate can be resolved for: confirmed, and matched to a catalog row. */
function heldProducts(cards: MemberCard[], products: Map<string, CardProduct>): CardProduct[] {
  const seen = new Set<string>();
  const out: CardProduct[] = [];
  for (const c of cards) {
    if (!c.product_id || seen.has(c.product_id)) continue;
    const p = products.get(c.product_id);
    if (!p) continue;            // a confirmation pointing at a retired catalog row
    seen.add(c.product_id);
    out.push(p);
  }
  return out;
}

/**
 * "Which of your cards is best in each category", for the categories the member
 * actually spends in.
 *
 * The category LIST is the member's own, ordered by their own spend, rather than
 * Credit Karma's fixed Groceries/Gas/Dining/Travel. A member who spends nothing
 * on gas does not need a gas row, and one whose largest category is Pharmacy
 * should see Pharmacy. `extraCategories` lets the caller append categories the
 * catalog has bonus rows for even when the member has not spent there yet, so
 * the guide is not empty for somebody who just linked a card.
 */
export function earningGuide(args: {
  cards: MemberCard[];
  products: Map<string, CardProduct>;
  earnByProduct: Map<string, EarnRow[]>;
  parentOf: ParentOf;
  /** Category ids in the order they should appear, usually member spend order. */
  categories: { id: string; label: string }[];
}): GuideEntry[] {
  const held = heldProducts(args.cards, args.products);
  if (!held.length) return [];

  return args.categories.map(({ id, label }) => {
    const rates = held
      .map((p) => rateFor(p, id, args.earnByProduct, args.parentOf))
      .sort(byRate);
    const best = rates[0] ?? null;
    // Exact equality, not a tolerance. Two cards "tie" only when the arithmetic
    // lands on the same number; a 0.05% gap is a winner, and calling it a tie
    // would tell a member it does not matter which card they use when it does.
    const tied = best ? rates.slice(1).filter((r) => r.pct === best.pct) : [];
    const others = best ? rates.slice(1).filter((r) => r.pct !== best.pct) : [];
    return {
      categoryId: id,
      categoryLabel: label,
      best,
      tied,
      others,
      assumesPointValue: rates.some((r) => r.assumesPointValue),
    };
  });
}

// ── What the wrong card is costing ──────────────────────────────────────────

export interface SwitchIdea {
  categoryId: string;
  categoryLabel: string;
  /** Annualized spend in this category on the card they are using now. */
  annualSpend: number;
  from: { productId: string; productName: string; display: string; plaidAccountId: string };
  to: { productId: string; productName: string; display: string; note: string | null; cap: string | null };
  /** Dollars a year, already net of caps. Rounded at the surface, not here. */
  gain: number;
  assumesPointValue: boolean;
}

/**
 * Category spend sitting on a card that earns less than another card the member
 * ALREADY HOLDS.
 *
 * This is the recommendation worth shipping first and the only one in this file
 * that needs no catalog beyond what the member confirmed: both cards are theirs,
 * both rates have a source, the spend is their own, and acting on it costs them
 * nothing. No application, no hard pull, no affiliate link, so none of the
 * compliance work that gates the marketplace applies to it.
 *
 * `months` is the observed window, not an assumed 12, for the same reason
 * _finance-snapshot.ts covers days rather than assuming a full month: a member
 * eleven days into their first linked card had every monthly figure divided by
 * three before that was fixed.
 */
export function switchIdeas(args: {
  cards: MemberCard[];
  products: Map<string, CardProduct>;
  earnByProduct: Map<string, EarnRow[]>;
  parentOf: ParentOf;
  spend: AccountCategorySpend[];
  months: number;
  /** Ignore anything below this many dollars a year. Default $12, a dollar a
      month: below that the advice costs more attention than it returns. */
  minGain?: number;
}): SwitchIdea[] {
  const months = args.months > 0 ? args.months : 1;
  const minGain = args.minGain ?? 12;
  const held = heldProducts(args.cards, args.products);
  if (held.length < 2) return [];   // nothing to switch TO

  const productByAccount = new Map<string, CardProduct>();
  for (const c of args.cards) {
    const p = c.product_id ? args.products.get(c.product_id) : null;
    if (p) productByAccount.set(c.plaid_account_id, p);
  }

  const ideas: SwitchIdea[] = [];
  for (const s of args.spend) {
    const current = productByAccount.get(s.plaid_account_id);
    if (!current) continue;                    // spend on an unconfirmed card
    const annualSpend = (s.amount / months) * 12;
    if (!(annualSpend > 0)) continue;          // a net-refund category

    const mine = rateFor(current, s.category_id, args.earnByProduct, args.parentOf);
    const best = held
      .map((p) => rateFor(p, s.category_id, args.earnByProduct, args.parentOf))
      .sort(byRate)[0];
    if (!best || best.product.id === current.id) continue;

    const gain = annualEarn(annualSpend, best.row, best.product)
      - annualEarn(annualSpend, mine.row, mine.product);
    if (gain < minGain) continue;

    ideas.push({
      categoryId: s.category_id,
      categoryLabel: s.category_label,
      annualSpend,
      from: {
        productId: current.id, productName: current.name,
        display: mine.display, plaidAccountId: s.plaid_account_id,
      },
      to: {
        productId: best.product.id, productName: best.product.name,
        display: best.display, note: best.note, cap: best.cap,
      },
      gain,
      assumesPointValue: mine.assumesPointValue || best.assumesPointValue,
    });
  }
  // Largest gain first, then category id so equal gains hold a stable order.
  return ideas.sort((a, b) => b.gain - a.gain || a.categoryId.localeCompare(b.categoryId));
}

// ── Cards that would beat theirs ────────────────────────────────────────────

export interface UpgradeIdea {
  productId: string;
  productName: string;
  issuer: string;
  annualFee: number;
  /** The categories this card wins, largest gain first. */
  wins: { categoryId: string; categoryLabel: string; display: string; gain: number }[];
  /** Total annual gain across `wins`, BEFORE the fee. */
  grossGain: number;
  /** grossGain minus annualFee. The number that decides whether to show it. */
  netGain: number;
  assumesPointValue: boolean;
}

/**
 * Catalog cards the member does not hold that would earn more on their existing
 * spending, net of the annual fee.
 *
 * DELIBERATELY CARRIES NO URL. Every apply link in this product is a placeholder
 * until an approved affiliate program and category-specific credit disclosures
 * clear (ROADMAP Stage 5, the `partners.url` note in migration 0010), and a
 * credit-card application is exactly the category where that matters most. So
 * this names the card and shows the arithmetic and stops there. Wiring it to the
 * marketplace is a follow-up that starts with the compliance work, not with this
 * function.
 *
 * The fee subtraction is why `netGain` exists separately from `grossGain`: a card
 * earning $180 more a year on a $250 fee is a worse card for this member, and
 * showing the $180 alone would be the most expensive kind of half-truth. Only
 * `netGain` gates inclusion.
 */
export function upgradeIdeas(args: {
  cards: MemberCard[];
  products: Map<string, CardProduct>;
  earnByProduct: Map<string, EarnRow[]>;
  parentOf: ParentOf;
  spend: AccountCategorySpend[];
  months: number;
  /** Minimum net annual gain to be worth naming. Default $50: an application is
      a hard pull and a permanent line on a credit report, so the bar is much
      higher than the $12 that justifies reaching for a different card. */
  minNetGain?: number;
  limit?: number;
}): UpgradeIdea[] {
  const months = args.months > 0 ? args.months : 1;
  const minNetGain = args.minNetGain ?? 50;
  const held = heldProducts(args.cards, args.products);
  if (!held.length) return [];
  const heldIds = new Set(held.map((p) => p.id));

  // Their own spending, rolled up by category across every confirmed card. A
  // candidate is judged against the whole category, not against one account.
  const byCategory = new Map<string, { label: string; annual: number }>();
  const confirmedAccounts = new Set(
    args.cards.filter((c) => c.product_id && args.products.has(c.product_id)).map((c) => c.plaid_account_id),
  );
  for (const s of args.spend) {
    if (!confirmedAccounts.has(s.plaid_account_id)) continue;
    const annual = (s.amount / months) * 12;
    if (!(annual > 0)) continue;
    const prev = byCategory.get(s.category_id);
    if (prev) prev.annual += annual;
    else byCategory.set(s.category_id, { label: s.category_label, annual });
  }
  if (!byCategory.size) return [];

  // What they earn today, per category, with the best card they hold.
  const mineByCategory = new Map<string, number>();
  for (const [categoryId, { annual }] of byCategory) {
    const best = held
      .map((p) => rateFor(p, categoryId, args.earnByProduct, args.parentOf))
      .sort(byRate)[0];
    mineByCategory.set(categoryId, best ? annualEarn(annual, best.row, best.product) : 0);
  }

  const ideas: UpgradeIdea[] = [];
  for (const candidate of args.products.values()) {
    if (heldIds.has(candidate.id)) continue;
    const wins: UpgradeIdea["wins"] = [];
    let grossGain = 0;
    let assumes = false;
    for (const [categoryId, { label, annual }] of byCategory) {
      const rate = rateFor(candidate, categoryId, args.earnByProduct, args.parentOf);
      const gain = annualEarn(annual, rate.row, candidate) - (mineByCategory.get(categoryId) ?? 0);
      if (gain <= 0) continue;
      wins.push({ categoryId, categoryLabel: label, display: rate.display, gain });
      grossGain += gain;
      assumes = assumes || rate.assumesPointValue;
    }
    const netGain = grossGain - candidate.annual_fee;
    if (!wins.length || netGain < minNetGain) continue;
    ideas.push({
      productId: candidate.id, productName: candidate.name, issuer: candidate.issuer,
      annualFee: candidate.annual_fee,
      wins: wins.sort((a, b) => b.gain - a.gain),
      grossGain, netGain, assumesPointValue: assumes,
    });
  }
  return ideas
    .sort((a, b) => b.netGain - a.netGain || a.productId.localeCompare(b.productId))
    .slice(0, args.limit ?? 3);
}

// ── Display names ───────────────────────────────────────────────────────────

/**
 * A product name short enough to print on a card face.
 *
 * `CardProduct.name` is stored as the ISSUER spells it, which is what makes the
 * picker recognizable and what a member compares against the card in their hand.
 * It is also 53 characters for "Capital One Quicksilver Student Cash Rewards
 * Credit Card", which truncates on any face Juniper can draw.
 *
 * DERIVED RATHER THAN STORED, deliberately. Eighteen hand-written short names
 * would be eighteen chances to get one wrong, and a migration every time the
 * catalog grows; one function is checkable, and scripts/src/check-rewards.ts
 * checks it. It drops the issuer, which the face already prints above the name,
 * and the generic tails that carry no information once the card is identified.
 *
 * THE LOWERCASE GUARD IS THE WHOLE SUBTLETY. "Discover it® Chrome" minus its
 * issuer is "it® Chrome", which is not a card name, it is a fragment. So when
 * removing the issuer would leave the name starting on a lowercase word, the
 * issuer stays. That case was found by rendering the result, not by reasoning
 * about the rule.
 */
export function shortCardName(full: string, issuer: string): string {
  const name = (full ?? "").trim();
  const iss = (issuer ?? "").trim();
  if (!name) return "";
  if (!iss) return name;
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // "Blue Cash Preferred® Card from American Express" puts the issuer at the end
  // behind a preposition, so that shape is removed before the bare-name pass.
  let out = name.replace(new RegExp(`\\bfrom\\s+${esc(iss)}\\b`, "i"), " ");
  const withoutIssuer = out
    .replace(new RegExp(`\\b${esc(iss)}\\b`, "i"), " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutIssuer && !/^[a-z]/.test(withoutIssuer)) out = withoutIssuer;

  // "Cash Rewards" is always a suffix in Capital One's naming and carries nothing
  // once the product word is there. "Cash Back" is NOT the same: it is what
  // separates "Discover it Cash Back" from "Discover it Chrome" and "Discover it
  // Miles", and stripping it left the flagship card reading as the family name.
  // Caught by printing the derivation for all 18 seeded products rather than by
  // checking the examples that happened to be in mind.
  out = out
    .replace(/\b(credit card|card)\b/gi, " ")
    .replace(/\bcash rewards\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Never return nothing. A name made entirely of the words above would leave a
  // blank face, and the full name always beats that.
  return out || name;
}

// ── Matching a linked account to a product ──────────────────────────────────

export interface Candidate {
  product: CardProduct;
  /** 0..1, for ORDERING THE PICKER ONLY. Never a threshold to skip the member's
      confirmation, see rule 2 at the top of this file. */
  confidence: number;
}

/** Comparison form: lowercased, trademark noise and punctuation gone, collapsed
    to single spaces. "Chase Freedom Unlimited®" and "FREEDOM UNLIMITED" both
    reduce to something the token overlap below can work with. */
export function normalizeCardName(v: string): string {
  return v
    .toLowerCase()
    .replace(/[®™©]/g, " ")
    .replace(/\b(credit card|card|visa|mastercard|amex|american express|signature|world elite|world|platinum tier)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Words that carry no identifying signal, so a shared "rewards" does not make
// two unrelated products look alike.
const STOP = new Set(["the", "and", "cash", "rewards", "reward", "student", "secured", "preferred", "plus"]);

const tokens = (v: string) => normalizeCardName(v).split(" ").filter((t) => t && !STOP.has(t));

/**
 * Catalog products ranked as guesses for one linked account, best first.
 *
 * Issuer is a FILTER, not a signal: a Chase account is not a Capital One
 * product, and offering one in the picker would be noise at best. Where the
 * institution does not match any catalog issuer the whole catalog comes back
 * unranked, because a member whose bank Juniper has never heard of should still
 * be able to find their card by scrolling rather than being told there is
 * nothing to pick.
 *
 * Confidence is Jaccard overlap of the identifying tokens, with a bump for a
 * clean containment ("freedom unlimited" inside "chase freedom unlimited"). It
 * is a sort key. Nothing reads it as a decision.
 */
export function rankCandidates(
  account: { institution: string; account_name: string },
  products: CardProduct[],
): Candidate[] {
  const inst = normalizeCardName(account.institution);
  const sameIssuer = products.filter((p) => {
    const issuer = normalizeCardName(p.issuer);
    return !!inst && !!issuer && (issuer.includes(inst) || inst.includes(issuer));
  });
  const pool = sameIssuer.length ? sameIssuer : products;

  const want = tokens(account.account_name);
  const scored = pool.map((product) => {
    if (!want.length) return { product, confidence: 0 };
    const have = tokens(product.name);
    if (!have.length) return { product, confidence: 0 };
    const wantSet = new Set(want);
    const haveSet = new Set(have);
    let shared = 0;
    for (const t of wantSet) if (haveSet.has(t)) shared++;
    const union = new Set([...wantSet, ...haveSet]).size;
    let confidence = union ? shared / union : 0;
    const a = want.join(" "), b = have.join(" ");
    if (a && b && (b.includes(a) || a.includes(b))) confidence = Math.max(confidence, 0.9);
    return { product, confidence };
  });

  return scored.sort(
    (x, y) => y.confidence - x.confidence || x.product.name.localeCompare(y.product.name),
  );
}

// ── The benefits tracker ────────────────────────────────────────────────────

/**
 * The bucket a benefit's use is recorded against.
 *
 * CALENDAR periods, and the surface has to say so, because a good share of real
 * card credits reset on the CARDMEMBER year (the anniversary of opening the
 * account) rather than in January. Juniper does not know an account's open date
 * (Plaid's `transactions` product does not return it), so a calendar year is
 * the only bucket it can compute, and presenting it as the issuer's own reset
 * date would be a small lie that costs somebody a $120 credit. The tracker is a
 * checklist the member keeps, not a statement about the issuer's clock.
 *
 * `today` is passed in rather than read from the clock so the mapping is
 * testable, the same reason _finance-snapshot.ts keeps its date helper apart.
 */
export function benefitPeriodKey(period: BenefitPeriod | null, today: Date): string {
  if (period === "once" || period == null) return "once";
  const y = today.getUTCFullYear();
  if (period === "year") return String(y);
  if (period === "quarter") return `${y}-Q${Math.floor(today.getUTCMonth() / 3) + 1}`;
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface TrackedBenefit extends Benefit {
  productName: string;
  /** The period bucket this row's use is recorded against right now. */
  periodKey: string;
  used: boolean;
  usedAt: string | null;
  /** How `used` came to be true. 'member' (the default, and the only value for
      every benefit without `auto_merchant`) means somebody tapped the checkbox.
      'auto' means `matchAutoBenefits` found a charge and the caller wrote the row
      itself. Meaningless while `used` is false, which is when a benefit has never
      been ticked by either path. */
  source: "member" | "auto";
  /** The matched charge, as a snapshot string ("Uber · Mar 14 · $10.00"),
      or null. Set only when `source` is 'auto': the whole point of showing it is
      that an automatic tick must never be the only thing claiming a credit was
      used, so the evidence for it has to be on screen next to it, not just in a
      database row the member cannot see. */
  evidence: string | null;
  /** A `mode: 'suggest'` match against `auto_merchant`, same evidence string
      shape as `evidence` above, but nothing has been written: the member has to
      tap "Yes, used it" before this benefit's `used` becomes true. Only ever set
      while `used` is false -- once ticked, a benefit shows what it IS (evidence
      if auto, "ticked off <date>" if member), not what it might have been. */
  suggestedEvidence: string | null;
}

export interface BenefitGroup {
  group: string;
  benefits: TrackedBenefit[];
  /** Benefits in this group the member has ticked off this period. */
  usedCount: number;
}

export interface BenefitSummary {
  /** Total benefits across the member's confirmed cards. Credit Karma's "42
      benefits from your 4 credit cards". */
  total: number;
  usedCount: number;
  /** Summed `value_amount` of the recurring, unused, dollar-valued benefits.
      Benefits with no dollar figure are counted in `total` and excluded here
      rather than assigned a guessed value. */
  unusedValue: number;
  /** True when at least one benefit carries no dollar figure, so the surface can
      say the total is partial instead of implying it is the whole picture. */
  valuePartial: boolean;
  groups: BenefitGroup[];
}

/**
 * The member's benefits, grouped, with what they have already ticked off.
 *
 * `uses` is keyed `benefitId|periodKey`, which is what makes a monthly credit
 * reappear next month without a cron job: the key changes, no row matches, the
 * benefit is unticked again. A `once` benefit keys to the literal "once" and
 * therefore stays ticked forever, which is correct for a signup bonus.
 */
export function trackBenefits(args: {
  cards: MemberCard[];
  products: Map<string, CardProduct>;
  benefits: Benefit[];
  uses: {
    benefit_id: string; period_key: string; used_at: string;
    /** Absent on a use built before migration 0052 (and on every use of a
        member-ticked benefit since), which is why this defaults to 'member'
        rather than being required. */
    source?: "member" | "auto"; evidence?: string | null;
  }[];
  /** `benefit_id|period_key` -> the evidence string for a 'suggest'-mode match
      (migration 0053), computed by the caller from `matchAutoBenefits` the same
      way `uses` already is. Optional so every existing caller (and every test in
      check-rewards.ts) keeps working unchanged. */
  suggestions?: Map<string, string>;
  today: Date;
}): BenefitSummary {
  const held = new Set(heldProducts(args.cards, args.products).map((p) => p.id));
  const useByKey = new Map(args.uses.map((u) => [`${u.benefit_id}|${u.period_key}`, u]));

  // Compared as ISO strings on purpose: `expires_on` is a DATE, so it arrives as
  // "YYYY-MM-DD" with no time and no zone, and lexicographic order on that format
  // IS chronological order. Parsing it into a Date would invent a midnight in some
  // timezone and make a benefit lapse a few hours early or late depending on where
  // the function ran.
  const todayIso = args.today.toISOString().slice(0, 10);

  const tracked: TrackedBenefit[] = [];
  for (const b of args.benefits) {
    if (!held.has(b.product_id)) continue;
    // Already over. Dropped here rather than in the handler so the tracker, the
    // group counts and `unusedValue` cannot disagree about what still exists.
    if (b.expires_on && b.expires_on < todayIso) continue;
    const periodKey = benefitPeriodKey(b.period, args.today);
    const use = useByKey.get(`${b.id}|${periodKey}`);
    const used = !!use;
    tracked.push({
      ...b,
      productName: args.products.get(b.product_id)?.name ?? b.product_id,
      periodKey,
      used,
      usedAt: use?.used_at ?? null,
      source: use?.source === "auto" ? "auto" : "member",
      evidence: use?.source === "auto" ? use?.evidence ?? null : null,
      // Only while unticked: once used, the row shows what happened, not what
      // might have.
      suggestedEvidence: used ? null : args.suggestions?.get(`${b.id}|${periodKey}`) ?? null,
    });
  }

  const byGroup = new Map<string, TrackedBenefit[]>();
  for (const t of tracked) {
    const list = byGroup.get(t.group);
    if (list) list.push(t);
    else byGroup.set(t.group, [t]);
  }

  let unusedValue = 0;
  let valuePartial = false;
  for (const t of tracked) {
    if (t.value_amount == null) { valuePartial = true; continue; }
    // A spent one-time credit is gone, so it is not "value left on the table".
    if (t.used) continue;
    // Annualized so a $7-a-month credit and a $50-a-year one are comparable.
    // A quarterly benefit with a dollar figure counts four times.
    const perYear = t.period === "month" ? 12 : t.period === "quarter" ? 4 : 1;
    unusedValue += t.value_amount * perYear;
  }

  const groups: BenefitGroup[] = [...byGroup.entries()]
    .map(([group, benefits]) => ({
      group,
      benefits: benefits.sort((a, b) => a.name.localeCompare(b.name)),
      usedCount: benefits.filter((b) => b.used).length,
    }))
    // Biggest group first, then alphabetical, so the order does not shuffle as
    // rows are ticked.
    .sort((a, b) => b.benefits.length - a.benefits.length || a.group.localeCompare(b.group));

  return {
    total: tracked.length,
    usedCount: tracked.filter((t) => t.used).length,
    unusedValue,
    valuePartial,
    groups,
  };
}

// ── Auto-matching a benefit to a charge (issue #264) ────────────────────────
//
// A narrow exception to "Juniper does not detect use", the header comment on
// card_benefit_uses since 0031 and still correct for almost everything the
// tracker shows: a matching charge usually proves a purchase happened, not that
// the issuer applied the credit for it, and those arrive weeks apart. The
// exception is a benefit like Amex's Uber Cash, where the "credit" and the
// "charge that earns it" are the same fact stated twice -- there is no gap for
// the issuer to fail to close. `auto_merchant` on the catalog row is the editorial
// decision that a given benefit clears that bar (see migration 0052); this
// function is the arithmetic once that decision has been made.

/** The one shape this needs out of a transaction: enough to say a charge to a
    named merchant happened, on a date, for an amount. Deliberately not the full
    transactions row -- account_id, merchant_name, amount and date is the whole
    match. */
export interface MerchantTxn {
  account_id: string | null;
  merchant_name: string | null;
  amount: number;
  date: string;
}

export interface BenefitMatch {
  benefit_id: string;
  period_key: string;
  /** The evidence string, verbatim: stored in card_benefit_uses.evidence when
      `mode` is 'tick', or surfaced as `TrackedBenefit.suggestedEvidence` when
      `mode` is 'suggest'. Same string, different fate -- the caller decides
      which, based on this field, never on its own judgment about the benefit. */
  evidence: string;
  /** Copied straight from the benefit's own `auto_mode` (migration 0053), so a
      caller can split one call's results into "write these" and "suggest
      these" without a second catalog lookup. */
  mode: "tick" | "suggest";
}

/** The first day of the period a benefit's `periodKey` names, as an ISO date, so
    a match can be scoped to THIS period and not last month's or last year's use
    of the same merchant. `once` and a null period have no period to start from,
    so every charge Juniper has ever read counts -- which is fine, because nothing
    in the catalog pairs `auto_merchant` with anything but 'month' or 'year'
    today, and a stray 'once' row would rather over-match than never match. */
function periodStart(period: BenefitPeriod | null, today: Date): string {
  const y = today.getUTCFullYear();
  if (period === "year") return `${y}-01-01`;
  if (period === "quarter") {
    const q = Math.floor(today.getUTCMonth() / 3);
    return `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  }
  if (period === "month") return `${y}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return "0001-01-01";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Uber · Mar 14 · $10.00". Parsed as UTC date parts rather than through the
    Date constructor for the same reason benefits-tracker.tsx's own `endsOn`
    is: a bare YYYY-MM-DD read through `new Date()` and printed in local time
    lands a day early for anybody west of Greenwich. */
function formatEvidence(t: MerchantTxn): string {
  const [, m, d] = t.date.split("-").map(Number);
  const when = MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}` : t.date;
  const merchant = (t.merchant_name ?? "").trim() || "a charge";
  return `${merchant} · ${when} · $${Math.abs(t.amount).toFixed(2)}`;
}

/**
 * Which auto-completable benefits have a matching charge THIS period, from the
 * transactions Juniper can actually see.
 *
 * Pure and I/O-free, same as everything else in this file: the caller reads the
 * rows, this decides what they mean, scripts/src/check-rewards.ts proves it with
 * no database.
 *
 * `txns` is expected to be whatever window the caller already fetched for the
 * earning guide (90 days today, see WINDOW_DAYS in _finance-snapshot.ts), NOT a
 * window sized to the benefit's own period. That is a real, stated limitation
 * rather than a silent one: a YEARLY benefit (both seeded Uber Cash rows are
 * 'year', see 0044) can only be matched against the trailing 90 days of the
 * member's history, so a January charge will not surface a match in October even
 * though it is genuinely inside the same calendar year. The alternative, fetching
 * a second, wider window just for this, doubles the read for two benefits in the
 * whole catalog; this degrades toward UNDER-matching, which is the safe
 * direction, exactly like the cents-per-point floor above.
 *
 * Only the MOST RECENT matching charge is returned per benefit: one is enough to
 * prove use, and the most recent is the one a member would recognize.
 */
export function matchAutoBenefits(args: {
  cards: MemberCard[];
  benefits: Benefit[];
  txns: MerchantTxn[];
  today: Date;
}): BenefitMatch[] {
  const accountsByProduct = new Map<string, string[]>();
  for (const c of args.cards) {
    if (!c.product_id) continue;
    const list = accountsByProduct.get(c.product_id);
    if (list) list.push(c.plaid_account_id);
    else accountsByProduct.set(c.product_id, [c.plaid_account_id]);
  }

  const todayIso = args.today.toISOString().slice(0, 10);
  const out: BenefitMatch[] = [];
  for (const b of args.benefits) {
    const needle = b.auto_merchant;
    if (!needle) continue;
    // Same rule trackBenefits applies: an expired benefit is not there to match.
    if (b.expires_on && b.expires_on < todayIso) continue;
    const accountIds = accountsByProduct.get(b.product_id);
    if (!accountIds?.length) continue;

    const start = periodStart(b.period, args.today);
    const hits = args.txns
      .filter((t) => t.account_id && accountIds.includes(t.account_id))
      .filter((t) => t.date >= start && t.date <= todayIso)
      .filter((t) => (t.merchant_name ?? "").toLowerCase().includes(needle))
      .sort((x, y) => y.date.localeCompare(x.date));
    if (!hits.length) continue;

    out.push({
      benefit_id: b.id,
      period_key: benefitPeriodKey(b.period, args.today),
      evidence: formatEvidence(hits[0]),
      mode: b.auto_mode,
    });
  }
  return out;
}

/**
 * Whether anything the member is being shown came from an unverified catalog
 * row, so the surface can carry one honest caveat rather than a per-row asterisk
 * nobody reads. See `CardProduct.verified`.
 */
export function anyUnverified(cards: MemberCard[], products: Map<string, CardProduct>): boolean {
  return heldProducts(cards, products).some((p) => !p.verified);
}

/** The oldest `as_of` among the member's cards: how stale the WORST row is,
    which is the only one worth quoting. Null when they hold nothing. */
export function oldestAsOf(cards: MemberCard[], products: Map<string, CardProduct>): string | null {
  const dates = heldProducts(cards, products).map((p) => p.as_of).filter(Boolean).sort();
  return dates[0] ?? null;
}
