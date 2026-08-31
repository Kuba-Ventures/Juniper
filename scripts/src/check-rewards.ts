// The card rewards maths, and the seed catalog it reads, checked without a
// database, a Plaid account or a signed-in session.
//
// Run: node_modules/.bin/tsx scripts/src/check-rewards.ts
//
// WHY THIS IS WORTH ITS OWN CHECK. Every number api/_rewards.ts produces reaches
// a member as a dollar figure attached to their own spending: "move groceries to
// this card, it is worth $94 a year". Four things in there are quietly easy to
// get wrong, and each one is wrong in the direction of a confident, specific,
// false claim rather than a visible failure:
//
//   1. A CAP. Spend above a cap does not stop earning, it drops to the card's
//      BASE rate. Treating the cap as a hard stop understates; ignoring it
//      overstates, and on Blue Cash Preferred's 6% grocery cap the two answers
//      differ by hundreds of dollars a year.
//   2. THE POINT VALUATION. "3x points" beats "2% cash back" only once a point
//      is given a value, and if `assumesPointValue` stops travelling out to the
//      surface then a house estimate starts being presented as an issuer's
//      published rate.
//   3. EXACT-BEFORE-GROUP resolution. A card with a leaf row for Gas and a group
//      row for Transportation must use the leaf for Gas. Get the precedence
//      backwards and the guide names the wrong winner.
//   4. THE ANNUAL FEE. `upgradeIdeas` must subtract it. A card earning $180 more
//      on a $250 fee is a worse card, and showing the $180 alone is the most
//      expensive kind of half-truth this surface could tell.
//
// It also checks something the TypeScript compiler cannot: that every
// `category_id` in migration 0032 is a real id in the taxonomy. That mapping is
// one fact written twice, the same shape of duplication that earned
// check-category-ids.ts its place, and a typo there is invisible. A card would
// simply never win a category, with no error anywhere.
import { strictEqual, deepStrictEqual, ok as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const R = await import("../../api/_rewards.ts");
const C = await import("../../api/_categorize.ts");

let n = 0;
const ok = (what: string, fn: () => void) => { fn(); n++; void what; };

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// Deliberately not the real catalog. The seed is checked separately for id
// validity below; the maths is checked against numbers chosen so a wrong answer
// is obvious by inspection, which a real card's 1.5% never is.
const cash = (id: string, base: number, fee = 0): R.CardProduct => ({
  id, issuer: "Testbank", network: null, name: `Test ${id}`, annual_fee: fee,
  brand_color: null, rewards_currency: "cash back", point_value_cents: null,
  base_multiplier: base, base_unit: "percent",
  source_url: "https://example.test/terms", as_of: "2026-08-31", verified: true,
});
const points = (id: string, base: number, cents: number, fee = 0): R.CardProduct => ({
  ...cash(id, base, fee), rewards_currency: "points", point_value_cents: cents, base_unit: "points",
});
const earn = (
  product_id: string, category_id: string, multiplier: number,
  unit: R.EarnUnit = "percent", cap_amount: number | null = null,
  cap_period: R.CapPeriod | null = null,
): R.EarnRow => ({
  product_id, category_id, category_label: category_id, multiplier, unit,
  cap_amount, cap_period, note: null,
});
const held = (product_id: string, account = product_id + "-acct"): R.MemberCard => ({
  plaid_account_id: account, product_id, institution: "Testbank",
  account_name: "CREDIT CARD", mask: "0000",
});
const byProduct = (rows: R.EarnRow[]) => {
  const m = new Map<string, R.EarnRow[]>();
  for (const r of rows) {
    const list = m.get(r.product_id);
    if (list) list.push(r); else m.set(r.product_id, [r]);
  }
  return m;
};
const productMap = (ps: R.CardProduct[]) => new Map(ps.map((p) => [p.id, p]));
// The taxonomy's real parent lookup, so the resolution test exercises the same
// tree the app does rather than a hand-built stand-in that could disagree.
const REAL_PARENT: Record<string, string> = {};
for (const g of C.BUILTIN_TAXONOMY.groups) for (const l of g.leaves) REAL_PARENT[l.id] = g.id;
const parentOf: R.ParentOf = (id) => REAL_PARENT[id] ?? null;

// ── 1. Rate arithmetic ──────────────────────────────────────────────────────
ok("cash back is its own percentage", () => {
  strictEqual(R.ratePct(1.5, "percent", null), 1.5);
  strictEqual(R.ratePct(2, "percent", null), 2);
});
ok("points are multiplied by the stored valuation", () => {
  strictEqual(R.ratePct(3, "points", 1.25), 3.75);
  strictEqual(R.ratePct(2, "miles", 1), 2);
});
ok("a points rate with no valuation falls back to one cent, which UNDERSTATES", () => {
  // One cent is the floor every major program guarantees for a statement credit
  // or a gift card. Falling back to it means a comparison that survives is still
  // true at any higher valuation, which is the safe direction.
  strictEqual(R.ratePct(3, "points", null), 3);
  strictEqual(R.ratePct(3, "points", 0), 3);
});
ok("a nonsense multiplier earns nothing rather than NaN", () => {
  strictEqual(R.ratePct(0, "percent", null), 0);
  strictEqual(R.ratePct(-2, "percent", null), 0);
  strictEqual(R.ratePct(Number.NaN, "percent", null), 0);
});

// ── 2. Caps, the one most likely to ship wrong ──────────────────────────────
ok("an uncapped row earns its rate on everything", () => {
  const p = cash("flat", 1);
  strictEqual(R.annualEarn(10_000, earn("flat", "c_gas", 3), p), 300);
});
ok("spend above a cap drops to the BASE rate, not to zero and not to the bonus", () => {
  // 6% on the first $6,000 a year, 1% above it. $10,000 of groceries:
  // 6,000 * 6% = 360, plus 4,000 * 1% = 40, so 400.
  const p = cash("bcp", 1);
  const row = earn("bcp", "c_groceries", 6, "percent", 6000, "year");
  strictEqual(R.annualEarn(10_000, row, p), 400);
  // The two wrong answers this test exists to rule out.
  assert(R.annualEarn(10_000, row, p) !== 600, "must not ignore the cap");
  assert(R.annualEarn(10_000, row, p) !== 360, "must not treat the cap as a hard stop");
});
ok("a quarterly cap is annualized by four, not treated as an annual cap", () => {
  // $1,500 a quarter is $6,000 a year. 5% then 1%, on $8,000 of spend:
  // 6,000 * 5% = 300, plus 2,000 * 1% = 20, so 320.
  const p = cash("flex", 1);
  strictEqual(R.annualEarn(8_000, earn("flex", "c_gas", 5, "percent", 1500, "quarter"), p), 320);
});
ok("a monthly cap is annualized by twelve", () => {
  const p = cash("m", 1);
  // $100 a month is $1,200 a year. 5% on 1,200 = 60, plus 800 * 1% = 8.
  strictEqual(R.annualEarn(2_000, earn("m", "c_gas", 5, "percent", 100, "month"), p), 68);
});
ok("spend below the cap never reaches the base rate", () => {
  const p = cash("bcp", 1);
  strictEqual(R.annualEarn(3_000, earn("bcp", "c_groceries", 6, "percent", 6000, "year"), p), 180);
});
ok("no bonus row means the base rate applies", () => {
  strictEqual(R.annualEarn(1_000, null, cash("flat", 2)), 20);
});
ok("zero or negative spend earns nothing", () => {
  strictEqual(R.annualEarn(0, null, cash("flat", 2)), 0);
  strictEqual(R.annualEarn(-500, null, cash("flat", 2)), 0);
});

// ── 3. Exact before group ───────────────────────────────────────────────────
ok("a leaf row is NOT shadowed by the card's own group row", () => {
  // 3% on Gas, 1.5% on the rest of Transportation. Gas must resolve to 3%.
  const p = cash("mix", 1);
  const rows = byProduct([
    earn("mix", "g_transportation", 1.5),
    earn("mix", "c_gas", 3),
  ]);
  strictEqual(R.rateFor(p, "c_gas", rows, parentOf).pct, 3);
  // And a sibling leaf with no row of its own still picks up the group row.
  strictEqual(R.rateFor(p, "c_auto_parking", rows, parentOf).pct, 1.5);
});
ok("a category with neither a leaf nor a group row falls to the base rate", () => {
  const p = cash("flat", 1.5);
  strictEqual(R.rateFor(p, "c_groceries", byProduct([]), parentOf).pct, 1.5);
});
ok("assumesPointValue is set exactly when the rate needed the valuation", () => {
  // THE DISCLOSURE TEST. If this flag stops being set, the page starts
  // presenting a house estimate as an issuer's published rate.
  const cp = points("csp", 1, 1.25);
  const rows = byProduct([earn("csp", "c_groceries", 3, "points")]);
  strictEqual(R.rateFor(cp, "c_groceries", rows, parentOf).assumesPointValue, true);
  strictEqual(R.rateFor(cp, "c_gas", rows, parentOf).assumesPointValue, true, "base rate is points too");
  const cb = cash("cfu", 1.5);
  strictEqual(R.rateFor(cb, "c_gas", byProduct([]), parentOf).assumesPointValue, false);
});

// ── 4. The earning guide ────────────────────────────────────────────────────
const GUIDE_CATS = [
  { id: "c_groceries", label: "Groceries" },
  { id: "c_gas", label: "Gas" },
];
ok("the winner is the highest percentage-equivalent across every card held", () => {
  // 3x points at 1.25c is 3.75%, which beats 3% cash back. That comparison is
  // the entire reason ratePct exists.
  const products = productMap([points("csp", 1, 1.25), cash("savor", 1)]);
  const rows = byProduct([
    earn("csp", "c_groceries", 3, "points"),
    earn("savor", "c_groceries", 3),
  ]);
  const g = R.earningGuide({
    cards: [held("csp"), held("savor")], products, earnByProduct: rows, parentOf,
    categories: GUIDE_CATS,
  });
  strictEqual(g[0].best?.product.id, "csp");
  strictEqual(g[0].best?.pct, 3.75);
  strictEqual(g[0].assumesPointValue, true, "the entry must disclose the valuation it used");
});
ok("a tie is reported as a tie, and only on exact equality", () => {
  const products = productMap([cash("a", 1.5), cash("b", 1.5), cash("c", 1.45)]);
  const g = R.earningGuide({
    cards: [held("a"), held("b"), held("c")], products, earnByProduct: byProduct([]),
    parentOf, categories: GUIDE_CATS,
  });
  strictEqual(g[0].tied.length, 1, "b ties a");
  strictEqual(g[0].others.length, 1, "c does not");
  // A 0.05% gap is a WINNER. Calling it a tie would tell a member it does not
  // matter which card they reach for when it does.
  strictEqual(g[0].others[0].product.id, "c");
});
ok("an uncapped row wins a tie against a capped one", () => {
  // Same money either way, so the member gets the instruction with no "you hit
  // the limit in March" attached.
  const products = productMap([cash("capped", 1), cash("free", 1)]);
  const rows = byProduct([
    earn("capped", "c_groceries", 3, "percent", 1000, "year"),
    earn("free", "c_groceries", 3),
  ]);
  const g = R.earningGuide({
    cards: [held("capped"), held("free")], products, earnByProduct: rows, parentOf,
    categories: [GUIDE_CATS[0]],
  });
  strictEqual(g[0].best?.product.id, "free");
});
ok("a published percentage wins a tie against a points rate that only ties once valued", () => {
  const products = productMap([points("pts", 2, 1.25), cash("cb", 2.5)]);
  const g = R.earningGuide({
    cards: [held("pts"), held("cb")], products, earnByProduct: byProduct([]), parentOf,
    categories: [GUIDE_CATS[0]],
  });
  strictEqual(g[0].best?.pct, 2.5);
  strictEqual(g[0].best?.product.id, "cb");
});
ok("a member with no confirmed card gets an empty guide, not a guide of nulls", () => {
  const g = R.earningGuide({
    cards: [{ ...held("x"), product_id: null }], products: productMap([cash("x", 1)]),
    earnByProduct: byProduct([]), parentOf, categories: GUIDE_CATS,
  });
  deepStrictEqual(g, []);
});
ok("a confirmation pointing at a product no longer in the catalog is skipped", () => {
  const g = R.earningGuide({
    cards: [held("retired"), held("live")], products: productMap([cash("live", 1)]),
    earnByProduct: byProduct([]), parentOf, categories: GUIDE_CATS,
  });
  strictEqual(g[0].best?.product.id, "live");
  strictEqual(g[0].tied.length + g[0].others.length, 0);
});
ok("guide order follows the caller's category order, which is the member's spend order", () => {
  const g = R.earningGuide({
    cards: [held("a")], products: productMap([cash("a", 1)]),
    earnByProduct: byProduct([]), parentOf, categories: GUIDE_CATS,
  });
  deepStrictEqual(g.map((e) => e.categoryId), ["c_groceries", "c_gas"]);
});

// ── 5. Switch ideas ─────────────────────────────────────────────────────────
const spend = (account: string, category_id: string, amount: number): R.AccountCategorySpend =>
  ({ plaid_account_id: account, category_id, category_label: category_id, amount });

ok("spend on the weaker card is surfaced with the annual gain", () => {
  const products = productMap([cash("weak", 1), cash("strong", 1)]);
  const rows = byProduct([earn("strong", "c_groceries", 4)]);
  // $900 observed over 3 months is $300 a month, so $3,600 a year.
  // 4% on the strong card against the weak card's 1% base is 3% of 3,600 = $108.
  const ideas = R.switchIdeas({
    cards: [held("weak"), held("strong")], products, earnByProduct: rows, parentOf,
    spend: [spend("weak-acct", "c_groceries", 900)], months: 3,
  });
  strictEqual(ideas.length, 1);
  strictEqual(Math.round(ideas[0].gain), 108);
  strictEqual(ideas[0].from.productId, "weak");
  strictEqual(ideas[0].to.productId, "strong");
  strictEqual(Math.round(ideas[0].annualSpend), 3600);
});
ok("the observed window is honoured, not assumed to be a year", () => {
  // The bug this rules out is the one _finance-snapshot.ts already had: a fixed
  // window over a variable history, which had every monthly figure divided by
  // three for a member eleven days in.
  const products = productMap([cash("weak", 1), cash("strong", 1)]);
  const rows = byProduct([earn("strong", "c_groceries", 4)]);
  const one = R.switchIdeas({
    cards: [held("weak"), held("strong")], products, earnByProduct: rows, parentOf,
    spend: [spend("weak-acct", "c_groceries", 300)], months: 1,
  });
  const three = R.switchIdeas({
    cards: [held("weak"), held("strong")], products, earnByProduct: rows, parentOf,
    spend: [spend("weak-acct", "c_groceries", 300)], months: 3,
  });
  strictEqual(Math.round(one[0].gain), 108, "one month of $300 annualizes to $3,600");
  strictEqual(Math.round(three[0].gain), 36, "three months of $300 annualizes to $1,200");
});
ok("no idea when the card already in use is the best one", () => {
  const products = productMap([cash("best", 3), cash("other", 1)]);
  const ideas = R.switchIdeas({
    cards: [held("best"), held("other")], products, earnByProduct: byProduct([]), parentOf,
    spend: [spend("best-acct", "c_groceries", 900)], months: 3,
  });
  deepStrictEqual(ideas, []);
});
ok("a single card produces no switch ideas, because there is nothing to switch to", () => {
  const ideas = R.switchIdeas({
    cards: [held("only")], products: productMap([cash("only", 1)]),
    earnByProduct: byProduct([]), parentOf,
    spend: [spend("only-acct", "c_groceries", 9000)], months: 3,
  });
  deepStrictEqual(ideas, []);
});
ok("spend on an UNCONFIRMED card is ignored rather than guessed at", () => {
  // TWO cards are confirmed here on purpose. An earlier version of this case
  // used one, which meant it passed through the "nothing to switch to" guard and
  // never exercised the per-account skip it claims to be about.
  const ideas = R.switchIdeas({
    cards: [held("a"), held("b"), { ...held("unknown"), product_id: null }],
    products: productMap([cash("a", 3), cash("b", 1)]),
    earnByProduct: byProduct([]), parentOf,
    spend: [spend("unknown-acct", "c_groceries", 9000)], months: 3,
  });
  deepStrictEqual(ideas, [], "the product behind unknown-acct is unknown, so its rate is unknown");
  // Control: the same spend on a CONFIRMED weaker card does produce an idea, so
  // the empty result above is the skip and not a broken fixture.
  const control = R.switchIdeas({
    cards: [held("a"), held("b")], products: productMap([cash("a", 3), cash("b", 1)]),
    earnByProduct: byProduct([]), parentOf,
    spend: [spend("b-acct", "c_groceries", 9000)], months: 3,
  });
  strictEqual(control.length, 1);
  strictEqual(control[0].to.productId, "a");
});
ok("a gain under the floor is not worth anybody's attention", () => {
  const products = productMap([cash("weak", 1), cash("strong", 1.1)]);
  const ideas = R.switchIdeas({
    cards: [held("weak"), held("strong")], products, earnByProduct: byProduct([]), parentOf,
    spend: [spend("weak-acct", "c_groceries", 30)], months: 3, // $120/yr at 0.1% = 12 cents
  });
  deepStrictEqual(ideas, []);
});
ok("a net-refund category produces no idea", () => {
  const ideas = R.switchIdeas({
    cards: [held("weak"), held("strong")],
    products: productMap([cash("weak", 1), cash("strong", 5)]),
    earnByProduct: byProduct([]), parentOf,
    spend: [spend("weak-acct", "c_groceries", -400)], months: 3,
  });
  deepStrictEqual(ideas, []);
});
ok("ideas are ordered by gain, largest first", () => {
  const products = productMap([cash("weak", 1), cash("strong", 3)]);
  const ideas = R.switchIdeas({
    cards: [held("weak"), held("strong")], products, earnByProduct: byProduct([]), parentOf,
    spend: [spend("weak-acct", "c_gas", 300), spend("weak-acct", "c_groceries", 1200)],
    months: 3,
  });
  deepStrictEqual(ideas.map((i) => i.categoryId), ["c_groceries", "c_gas"]);
});
ok("a switch idea carries the disclosure when either side is a points rate", () => {
  const products = productMap([cash("cb", 1), points("pts", 3, 1.25)]);
  const ideas = R.switchIdeas({
    cards: [held("cb"), held("pts")], products, earnByProduct: byProduct([]), parentOf,
    spend: [spend("cb-acct", "c_groceries", 3000)], months: 3,
  });
  strictEqual(ideas[0].assumesPointValue, true);
});

// ── 6. Upgrade ideas, and the annual fee ────────────────────────────────────
ok("the annual fee is subtracted, and it can sink an otherwise better card", () => {
  // Candidate earns 5% where the member earns 1%, on $4,000 a year of groceries,
  // so $160 gross. A $250 fee makes it a WORSE card, and netGain must say so.
  const products = productMap([cash("mine", 1), cash("pricey", 1, 250)]);
  const rows = byProduct([earn("pricey", "c_groceries", 5)]);
  const ideas = R.upgradeIdeas({
    cards: [held("mine")], products, earnByProduct: rows, parentOf,
    spend: [spend("mine-acct", "c_groceries", 1000)], months: 3,
  });
  deepStrictEqual(ideas, [], "$160 of extra earn does not justify a $250 fee");
});
ok("a fee worth paying is surfaced, with gross and net kept apart", () => {
  const products = productMap([cash("mine", 1), cash("worth-it", 1, 95)]);
  const rows = byProduct([earn("worth-it", "c_groceries", 6)]);
  // $12,000 a year of groceries, 5 points of extra rate, so $600 gross.
  const ideas = R.upgradeIdeas({
    cards: [held("mine")], products, earnByProduct: rows, parentOf,
    spend: [spend("mine-acct", "c_groceries", 3000)], months: 3,
  });
  strictEqual(ideas.length, 1);
  strictEqual(Math.round(ideas[0].grossGain), 600);
  strictEqual(Math.round(ideas[0].netGain), 505);
  strictEqual(ideas[0].annualFee, 95);
});
ok("a card the member already holds is never offered back to them", () => {
  const products = productMap([cash("mine", 1)]);
  const rows = byProduct([earn("mine", "c_groceries", 9)]);
  const ideas = R.upgradeIdeas({
    cards: [held("mine")], products, earnByProduct: rows, parentOf,
    spend: [spend("mine-acct", "c_groceries", 3000)], months: 3,
  });
  deepStrictEqual(ideas, []);
});
ok("an upgrade idea carries no url, because every affiliate link is a placeholder", () => {
  // Structural: a credit-card application is the category where an unapproved
  // affiliate link matters most, so the shape simply has nowhere to put one.
  const products = productMap([cash("mine", 1), cash("better", 1)]);
  const rows = byProduct([earn("better", "c_groceries", 6)]);
  const ideas = R.upgradeIdeas({
    cards: [held("mine")], products, earnByProduct: rows, parentOf,
    spend: [spend("mine-acct", "c_groceries", 3000)], months: 3,
  });
  strictEqual(ideas.length, 1);
  assert(!("url" in ideas[0]), "UpgradeIdea must not carry a url");
});
ok("candidates are judged against the member's whole category, not one account", () => {
  const products = productMap([cash("a", 1), cash("b", 1), cash("cand", 1)]);
  const rows = byProduct([earn("cand", "c_groceries", 3)]);
  const ideas = R.upgradeIdeas({
    cards: [held("a"), held("b")], products, earnByProduct: rows, parentOf,
    spend: [spend("a-acct", "c_groceries", 1500), spend("b-acct", "c_groceries", 1500)],
    months: 3,
  });
  // $12,000 a year across both accounts, 2 points of rate, so $240.
  strictEqual(Math.round(ideas[0].grossGain), 240);
});

// ── 7. Matching an account to a product ─────────────────────────────────────
ok("trademark noise and card-type words are stripped for comparison", () => {
  strictEqual(R.normalizeCardName("Chase Freedom Unlimited®"), "chase freedom unlimited");
  strictEqual(R.normalizeCardName("Capital One Quicksilver Credit Card"), "capital one quicksilver");
  strictEqual(R.normalizeCardName("  DISCOVER IT  CHROME  "), "discover it chrome");
});
ok("the issuer is a FILTER: a Chase account is never offered a Capital One product", () => {
  const cands = R.rankCandidates(
    { institution: "Chase", account_name: "Freedom Unlimited" },
    [cash("x", 1), { ...cash("q", 1), issuer: "Capital One", name: "Quicksilver" },
     { ...cash("cfu", 1), issuer: "Chase", name: "Chase Freedom Unlimited®" }],
  );
  assert(cands.every((c) => c.product.issuer === "Chase"), "only Chase products offered");
  strictEqual(cands[0].product.id, "cfu");
});
ok("an unknown institution gets the whole catalog rather than nothing", () => {
  // A member whose bank Juniper has never heard of should still be able to find
  // their card by scrolling, rather than being told there is nothing to pick.
  const all = [cash("a", 1), cash("b", 1)];
  const cands = R.rankCandidates({ institution: "Bank of Nowhere", account_name: "CARD" }, all);
  strictEqual(cands.length, 2);
});
ok("a useless account name ranks everything at zero rather than inventing a favourite", () => {
  const cands = R.rankCandidates(
    { institution: "Testbank", account_name: "CREDIT CARD" },
    [cash("a", 1), cash("b", 1)],
  );
  // "CREDIT CARD" normalizes away entirely, so there is no signal at all and
  // confidence must not manufacture one.
  assert(cands.every((c) => c.confidence === 0), "no signal means no confidence");
});
ok("ranking is stable for equal confidence, so the picker does not reshuffle", () => {
  const pool = [{ ...cash("z", 1), name: "Zeta Card" }, { ...cash("a", 1), name: "Alpha Card" }];
  const first = R.rankCandidates({ institution: "Testbank", account_name: "CARD" }, pool);
  const second = R.rankCandidates({ institution: "Testbank", account_name: "CARD" }, [...pool].reverse());
  deepStrictEqual(first.map((c) => c.product.id), second.map((c) => c.product.id));
});

// ── 8. Benefit periods ─────────────────────────────────────────────────────
const AUG = new Date(Date.UTC(2026, 7, 31));   // 2026-08-31
const SEP = new Date(Date.UTC(2026, 8, 1));    // 2026-09-01, a new month AND quarter
ok("a monthly benefit re-arms when the month changes, with no cron job", () => {
  strictEqual(R.benefitPeriodKey("month", AUG), "2026-08");
  strictEqual(R.benefitPeriodKey("month", SEP), "2026-09");
});
ok("a quarterly benefit re-arms on the quarter boundary", () => {
  // August is Q3, September is also Q3. October starts Q4.
  strictEqual(R.benefitPeriodKey("quarter", AUG), "2026-Q3");
  strictEqual(R.benefitPeriodKey("quarter", SEP), "2026-Q3");
  strictEqual(R.benefitPeriodKey("quarter", new Date(Date.UTC(2026, 9, 1))), "2026-Q4");
  strictEqual(R.benefitPeriodKey("quarter", new Date(Date.UTC(2026, 0, 1))), "2026-Q1");
});
ok("a yearly benefit re-arms on the calendar year", () => {
  strictEqual(R.benefitPeriodKey("year", AUG), "2026");
  strictEqual(R.benefitPeriodKey("year", new Date(Date.UTC(2027, 0, 1))), "2027");
});
ok("a one-time benefit stays ticked forever", () => {
  strictEqual(R.benefitPeriodKey("once", AUG), "once");
  strictEqual(R.benefitPeriodKey("once", new Date(Date.UTC(2099, 0, 1))), "once");
  strictEqual(R.benefitPeriodKey(null, AUG), "once");
});

// ── 9. The benefits tracker ────────────────────────────────────────────────
const benefit = (
  id: string, product_id: string, group: string,
  value_amount: number | null = null, period: R.BenefitPeriod | null = null,
): R.Benefit => ({ id, product_id, group, name: id, detail: null, value_amount, period });

ok("only benefits from cards the member confirmed are counted", () => {
  const s = R.trackBenefits({
    cards: [held("mine")], products: productMap([cash("mine", 1), cash("theirs", 1)]),
    benefits: [benefit("a", "mine", "Travel"), benefit("b", "theirs", "Travel")],
    uses: [], today: AUG,
  });
  strictEqual(s.total, 1);
});
ok("a tick in the current period reads as used; one from a past period does not", () => {
  const args = {
    cards: [held("mine")], products: productMap([cash("mine", 1)]),
    benefits: [benefit("credit", "mine", "Shopping", 7, "month" as const)],
    today: AUG,
  };
  strictEqual(R.trackBenefits({ ...args, uses: [
    { benefit_id: "credit", period_key: "2026-08", used_at: "2026-08-04T00:00:00Z" }] }).usedCount, 1);
  strictEqual(R.trackBenefits({ ...args, uses: [
    { benefit_id: "credit", period_key: "2026-07", used_at: "2026-07-04T00:00:00Z" }] }).usedCount, 0,
    "last month's tick must not carry into this month");
});
ok("unused value is annualized so a monthly credit and a yearly one compare", () => {
  const s = R.trackBenefits({
    cards: [held("mine")], products: productMap([cash("mine", 1)]),
    benefits: [
      benefit("monthly", "mine", "Shopping", 7, "month"),    // 7 * 12 = 84
      benefit("yearly", "mine", "Travel", 50, "year"),       // 50
      benefit("quarterly", "mine", "Travel", 25, "quarter"), // 25 * 4 = 100
    ],
    uses: [], today: AUG,
  });
  strictEqual(s.unusedValue, 234);
});
ok("a used benefit is not counted as value left on the table", () => {
  const s = R.trackBenefits({
    cards: [held("mine")], products: productMap([cash("mine", 1)]),
    benefits: [benefit("yearly", "mine", "Travel", 50, "year")],
    uses: [{ benefit_id: "yearly", period_key: "2026", used_at: "2026-03-14T00:00:00Z" }],
    today: AUG,
  });
  strictEqual(s.unusedValue, 0);
  strictEqual(s.usedCount, 1);
});
ok("a benefit with no dollar figure is counted but not summed, and the total says so", () => {
  const s = R.trackBenefits({
    cards: [held("mine")], products: productMap([cash("mine", 1)]),
    benefits: [benefit("lounge", "mine", "Travel"), benefit("credit", "mine", "Travel", 50, "year")],
    uses: [], today: AUG,
  });
  strictEqual(s.total, 2);
  strictEqual(s.unusedValue, 50);
  strictEqual(s.valuePartial, true, "the surface must be able to say the total is partial");
});
ok("group order is stable as rows are ticked", () => {
  // Biggest group first then alphabetical, computed from the group's SIZE rather
  // than from how many are unticked, so ticking a row cannot reorder the page
  // under the member's cursor.
  const base = {
    cards: [held("mine")], products: productMap([cash("mine", 1)]),
    benefits: [
      benefit("t1", "mine", "Travel"), benefit("t2", "mine", "Travel"),
      benefit("s1", "mine", "Shopping"),
    ],
    today: AUG,
  };
  const before = R.trackBenefits({ ...base, uses: [] }).groups.map((g) => g.group);
  const after = R.trackBenefits({ ...base,
    uses: [{ benefit_id: "t1", period_key: "once", used_at: "x" },
           { benefit_id: "t2", period_key: "once", used_at: "x" }] }).groups.map((g) => g.group);
  deepStrictEqual(before, ["Travel", "Shopping"]);
  deepStrictEqual(after, before, "ticking every Travel row must not move Travel");
});

// ── 10. Provenance helpers ─────────────────────────────────────────────────
ok("one unverified card held is enough to make the surface say so", () => {
  const products = productMap([
    cash("verified", 1),
    { ...cash("seeded", 1), verified: false },
  ]);
  strictEqual(R.anyUnverified([held("verified")], products), false);
  strictEqual(R.anyUnverified([held("verified"), held("seeded")], products), true);
});
ok("the quoted as_of is the OLDEST, because the worst row is the only one worth quoting", () => {
  const products = productMap([
    { ...cash("new", 1), as_of: "2026-08-31" },
    { ...cash("old", 1), as_of: "2025-01-04" },
  ]);
  strictEqual(R.oldestAsOf([held("new"), held("old")], products), "2025-01-04");
  strictEqual(R.oldestAsOf([], products), null);
});

// ── 11. The seed's category ids are real ───────────────────────────────────
//
// One fact written twice: migration 0032 names taxonomy ids in SQL, and the
// taxonomy is TypeScript. A typo is invisible, because a card with a bogus
// category_id simply never wins that category and nothing errors.
// EVERY card seed migration, discovered rather than named, so a seed added later
// is covered without anybody remembering to edit this line. 0034 exists because
// the picker could not offer "Quicksilver Student"; the next one will exist for a
// similar reason, and it must not silently escape this check.
const seedFiles = readdirSync(join(repo, "supabase", "migrations"))
  .filter((f) => /^\d{4}_card_products.*\.sql$/.test(f))
  .sort();
const seedIds = (() => {
  const found = new Set<string>();
  for (const f of seedFiles) {
    const sql = readFileSync(join(repo, "supabase", "migrations", f), "utf8");
    for (const m of sql.matchAll(/'([gc]_[a-z0-9_]+)'/g)) found.add(m[1]);
  }
  return [...found];
})();
const taxonomyIds = new Set<string>();
for (const g of C.BUILTIN_TAXONOMY.groups) {
  taxonomyIds.add(g.id);
  for (const l of g.leaves) taxonomyIds.add(l.id);
}
ok("every category_id in the seed is a real taxonomy id", () => {
  const missing = seedIds.filter((id) => !taxonomyIds.has(id));
  deepStrictEqual(missing, [], `seed names ids the taxonomy does not have: ${missing.join(", ")} (files: ${seedFiles.join(", ")})`);
  assert(seedIds.length > 0, "the check is worthless if it matched nothing");
});
ok("every seeded earn row resolves to the category it claims", () => {
  // Stronger than existence: the id must classify back to a SPEND category, since
  // a bonus rate on a transfer or on income is nonsense and would mean the id was
  // right in shape and wrong in meaning.
  for (const id of seedIds) {
    const kind = C.BUILTIN_TAXONOMY.classify(id, null).k;
    strictEqual(kind, "spend", `${id} is ${kind}, not spend`);
  }
});

console.log(`${n} rewards cases passed`);
console.log(`${seedIds.length} seeded category ids across ${seedFiles.length} seed migrations all exist in the taxonomy and are spend categories`);
console.log("PASS: caps drop to the base rate, the point valuation is disclosed, and the annual fee is subtracted");
