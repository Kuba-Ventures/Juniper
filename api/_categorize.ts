// Stage 3b: the Juniper category taxonomy, and the map from a Plaid
// personal_finance_category onto it. Kept deliberately small and pure so the
// sync, the read endpoint, the score snapshot, and a future re-categorize
// endpoint can all share it. User overrides (category_source='user') are
// respected upstream and never touched here.
//
// TWO LEVELS, ONE STORED COLUMN. `transactions.category` is a single TEXT
// column, so what we store per transaction is one leaf category (the granular
// label). Groups are derived from the table below at read time, never stored,
// which is what lets the vocabulary widen without a migration.
//
// THE GROUP LABELS ARE THE SEVEN PRE-3b CATEGORIES, on purpose. Before this
// stage the whole vocabulary was Housing / Groceries & dining / Transportation /
// Shopping / Utilities & bills / Kids & health / Everything else / Income, and
// those coarse buckets are exactly what a group is. Promoting them rather than
// renaming them means rows written before this change, and budgets the member
// created against those names, keep landing in the right place: `groupOf()`
// returns a group label unchanged, so an old row is simply a row categorized at
// group precision. Two new groups (Fun & travel, Debt payments) exist because
// the old scheme had nowhere honest to put entertainment, travel, or a student
// loan payment, and dumping them in Everything else is what made that wedge 85%
// of one member's month.
//
// KIND is the other half of the fix. A group is spend, income, or transfer.
// Transfers and credit-card payments are money moving between the member's own
// accounts, not consumption: they carry kind 'transfer' and are excluded from
// spending AND from income. A credit-card payment is the worst offender, the
// purchases behind it were already counted when they happened, so counting the
// payment too billed the member twice for the same coffee.

export type CategoryKind = "spend" | "income" | "transfer";

export interface CategoryGroup {
  label: string;
  kind: CategoryKind;
  categories: string[];
}

// The one table. Order is display order: the spending rollup walks it top to
// bottom, so the donut reads fixed-costs-first and the miscellany last. The
// seven pre-3b labels keep their old relative order so a member's donut does not
// reshuffle; the two new groups are slotted in where the palette works, since
// adjacent wedges want unlike colors and the two colors left in the token set
// are both greenish (see GROUP_COLOR in src/lib/finances.ts).
//
// A few groups carry a catch-all category named like the group ("Transportation",
// "Everything else") for transactions Plaid could only place at the primary
// level. That collision is harmless because `groupOf()` resolves a group label
// to itself, and budget lookups check group labels first (see groupOf's note).
export const CATEGORY_GROUPS: CategoryGroup[] = [
  { label: "Housing", kind: "spend", categories: ["Rent", "Mortgage", "Home & repairs"] },
  { label: "Groceries & dining", kind: "spend", categories: ["Groceries", "Restaurants & bars", "Coffee shops", "Groceries & dining"] },
  { label: "Transportation", kind: "spend", categories: ["Gas", "Car payment", "Auto & parking", "Rides & transit", "Transportation"] },
  // Debt service that is not a card payment and not already sitting with the
  // thing it bought (a mortgage is Housing, a car payment is Transportation).
  { label: "Debt payments", kind: "spend", categories: ["Student loans", "Loan payment"] },
  { label: "Shopping", kind: "spend", categories: ["Shopping", "Clothing", "Electronics", "Gifts & donations"] },
  { label: "Fun & travel", kind: "spend", categories: ["Entertainment", "Streaming & music", "Travel"] },
  { label: "Utilities & bills", kind: "spend", categories: ["Utilities", "Phone & internet", "Insurance", "Utilities & bills"] },
  { label: "Kids & health", kind: "spend", categories: ["Medical", "Dental & vision", "Pharmacy", "Fitness", "Personal care", "Childcare"] },
  { label: "Everything else", kind: "spend", categories: ["Bank fees", "Taxes & government", "Education", "Services", "Everything else"] },
  { label: "Income", kind: "income", categories: ["Paycheck", "Interest & dividends", "Retirement income", "Tax refund", "Other income"] },
  // Not spending and not income: money the member moved between their own
  // accounts, or a payment against a card whose purchases already counted.
  // Named explicitly so the rollup can filter them BY NAME rather than guessing
  // from a merchant string or an amount's sign.
  { label: "Transfers & payments", kind: "transfer", categories: ["Credit card payment", "Transfer to savings", "Transfer to investments", "Transfer out", "Transfer in"] },
];

// ── Default emoji, one per label ────────────────────────────────────────────
//
// A separate map rather than a field on CATEGORY_GROUPS, so the table that
// decides classification and the ids derived from it are untouched: an emoji is
// decoration, and it should not be able to break a category's identity.
// scripts/check-category-emoji.ts asserts every label has exactly one, so a
// category added later cannot quietly ship without an icon.
//
// CHOSEN FOR RENDERING, NOT FOR CHARM. Every one of these is Unicode 11 (2018)
// or older, which is what Windows 10 1809 and macOS 10.14 shipped, so none of
// them can land as an empty box on a machine that is a few years behind. That
// rules out some obviously better icons (a stethoscope for Medical is Unicode
// 12, a nest egg for Retirement is Unicode 14), and the second-best emoji that
// definitely draws beats the best one that might not.
const CATEGORY_EMOJI: Record<string, string> = {
  // Groups
  "Housing": "🏠", "Groceries & dining": "🍽️", "Transportation": "🚗",
  "Debt payments": "💳", "Shopping": "🛍️", "Fun & travel": "✈️",
  "Utilities & bills": "💡", "Kids & health": "🏥", "Everything else": "📦",
  "Income": "💰", "Transfers & payments": "🔁",
  // Housing
  "Rent": "🏠", "Mortgage": "🏦", "Home & repairs": "🔨",
  // Groceries & dining
  "Groceries": "🛒", "Restaurants & bars": "🍽️", "Coffee shops": "☕",
  // Transportation
  "Gas": "⛽", "Car payment": "🚙", "Auto & parking": "🅿️", "Rides & transit": "🚕",
  // Debt payments
  "Student loans": "🎓", "Loan payment": "🏦",
  // Shopping
  "Clothing": "👕", "Electronics": "💻", "Gifts & donations": "🎁",
  // Fun & travel
  "Entertainment": "🎬", "Streaming & music": "🎵", "Travel": "✈️",
  // Utilities & bills
  "Utilities": "💡", "Phone & internet": "📱", "Insurance": "🛡️",
  // Kids & health
  "Medical": "🏥", "Dental & vision": "🦷", "Pharmacy": "💊",
  "Fitness": "🏋️", "Personal care": "💇", "Childcare": "👶",
  // Everything else
  "Bank fees": "🏦", "Taxes & government": "🏛️", "Education": "📚", "Services": "🔧",
  // Income
  "Paycheck": "💵", "Interest & dividends": "📈", "Retirement income": "🏖️",
  "Tax refund": "🧾", "Other income": "💰",
  // Transfers & payments
  "Credit card payment": "💳", "Transfer to savings": "🏦",
  "Transfer to investments": "📈", "Transfer out": "↗️", "Transfer in": "↘️",
};

// A category a member made has no default worth guessing, so it gets a label
// tag: honest about being theirs, and better than borrowing its group's icon,
// which would make a new category look like a duplicate of the group.
export const NEW_CATEGORY_EMOJI = "🏷️";

// The five labels that name both a group and a leaf inside it take the group's
// icon, which is what the map above already gives them.
export const defaultEmoji = (label: string): string => CATEGORY_EMOJI[label.trim()] ?? "📦";

const GROUP_KIND: Record<string, CategoryKind> = {};
const CATEGORY_GROUP: Record<string, string> = {};
for (const g of CATEGORY_GROUPS) {
  GROUP_KIND[g.label] = g.kind;
  for (const c of g.categories) CATEGORY_GROUP[c] = g.label;
}

// True when `label` names a whole group rather than a leaf category. Budgets are
// stored by label, and every label a member could have budgeted before this
// stage is now a group, so /api/finances measures a group-labelled budget
// against the whole group and a leaf-labelled one against just that category.
function isGroupLabel(label?: string | null): boolean {
  return !!label && !!GROUP_KIND[label.trim()];
}

// A group label resolves to itself, which is what makes every pre-3b row and
// budget keep working: they were already stored at group precision. Anything
// unrecognized (a hand-edited label, a category we retire later) falls to
// Everything else, spend, so money out is never silently dropped from a total.
function groupOf(category?: string | null): string {
  const c = (category || "").trim();
  if (!c) return "Everything else";
  if (GROUP_KIND[c]) return c;
  return CATEGORY_GROUP[c] ?? "Everything else";
}

function kindOf(category?: string | null): CategoryKind {
  return GROUP_KIND[groupOf(category)] ?? "spend";
}

// ── Stable ids (Stage 1 of docs/CUSTOM_CATEGORIES.md) ───────────────────────
//
// Every built-in group and leaf gets an id that never changes, so a label can
// later be renamed without orphaning the rows that point at it. Nothing READS
// these yet: this stage only writes them alongside the existing text column, so
// the two can be compared on real data before anything depends on the id.
//
// Slugs rather than UUIDs, because a category id is read by a human far more
// often than by a machine: `c_coffee_shops` in a failing query says what it is,
// `f47ac10b-...` does not. Prefixed `g_` / `c_` because five labels ("Shopping",
// "Transportation", "Utilities & bills", "Groceries & dining", "Everything
// else") name BOTH a group and a leaf inside it, so an unprefixed slug would
// collide on exactly the rows that are hardest to debug.
//
// Member-created categories will use `c_<uuid>` in a later stage, which cannot
// collide with a slug derived from a built-in label.
const slug = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const groupId = (label: string) => `g_${slug(label)}`;
const leafId = (label: string) => `c_${slug(label)}`;

// Label -> id, built the same way the classification maps are: once, at module
// load, from the one table. A group label resolves to its GROUP id and a leaf to
// its LEAF id, which mirrors groupOf's rule that a group label is a legitimate
// stored value (rows written before #136 are categorized at group precision).
const LABEL_ID: Record<string, string> = {};
for (const g of CATEGORY_GROUPS) {
  LABEL_ID[g.label] = groupId(g.label);
  // Leaves are written after groups on purpose. Where a leaf shares its name
  // with its group, the LEAF id wins: `transactions.category = "Shopping"` on a
  // row Plaid could only place at the primary level is the leaf catch-all, and
  // groupOf() resolves it to the group either way.
  for (const c of g.categories) LABEL_ID[c] = leafId(c);
}

// The id for a stored label, or null when the label is not in the taxonomy at
// all (a hand-edited value, or a category retired in a later release). Null
// rather than a fallback to Everything else: this is written beside the text
// column, and inventing an id for a value we do not recognize would silently
// assert a classification that groupOf() never made.
function categoryIdOf(category?: string | null): string | null {
  const c = (category || "").trim();
  if (!c) return null;
  return LABEL_ID[c] ?? null;
}

// ── Plaid personal_finance_category -> Juniper leaf category ────────────────
//
// Detailed first, primary as the floor. Plaid's detailed taxonomy is where the
// real signal is: the primary alone cannot tell rent from a water bill, a
// credit-card payment from a car payment, or a paycheck from a tax refund, and
// every one of those distinctions changes whether the amount counts as spending.
// Detailed values are prefixed with their primary, so a value Plaid adds later
// that we have not listed still lands sensibly via PRIMARY_MAP.
const DETAILED_MAP: Record<string, string> = {
  // Income. Wages are the figure the score's savings rate is built on, so they
  // are kept apart from the lumpier inflows.
  INCOME_WAGES: "Paycheck",
  INCOME_INTEREST_EARNED: "Interest & dividends",
  INCOME_DIVIDENDS: "Interest & dividends",
  INCOME_RETIREMENT_PENSION: "Retirement income",
  // A tax refund IS income (it is money arriving from outside), but it is
  // once-a-year and large enough to distort a month, so it gets its own label
  // that a later stage can exclude without touching the rest of Income.
  INCOME_TAX_REFUND: "Tax refund",
  INCOME_UNEMPLOYMENT: "Other income",
  INCOME_OTHER_INCOME: "Other income",

  // Transfers in. Includes a loan disbursement (CASH_ADVANCES_AND_LOANS): cash
  // arriving that the member owes back is not earnings.
  TRANSFER_IN_DEPOSIT: "Transfer in",
  TRANSFER_IN_ACCOUNT_TRANSFER: "Transfer in",
  TRANSFER_IN_SAVINGS: "Transfer in",
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfer in",
  TRANSFER_IN_CASH_ADVANCES_AND_LOANS: "Transfer in",
  TRANSFER_IN_OTHER_TRANSFER_IN: "Transfer in",

  // Transfers out. Saving and investing are split out from a plain transfer
  // because "where it went" is a fair question to ask of them, just not as
  // spending.
  TRANSFER_OUT_SAVINGS: "Transfer to savings",
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfer to investments",
  TRANSFER_OUT_ACCOUNT_TRANSFER: "Transfer out",
  TRANSFER_OUT_WITHDRAWAL: "Transfer out",
  TRANSFER_OUT_OTHER_TRANSFER_OUT: "Transfer out",

  // Loan payments split three ways, and the split is the whole point: a card
  // payment is a transfer (its purchases already counted), a mortgage or car
  // payment belongs with the thing it pays for, and the rest is debt service.
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Credit card payment",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Mortgage",
  LOAN_PAYMENTS_CAR_PAYMENT: "Car payment",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "Student loans",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "Loan payment",
  LOAN_PAYMENTS_OTHER_PAYMENT: "Loan payment",

  // Rent and utilities. RENT_AND_UTILITIES is the coarse bucket the old map
  // hacked around with a substring test on the detailed value; this replaces it.
  RENT_AND_UTILITIES_RENT: "Rent",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Utilities",
  RENT_AND_UTILITIES_WATER: "Utilities",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Utilities",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "Utilities",
  RENT_AND_UTILITIES_TELEPHONE: "Phone & internet",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Phone & internet",

  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_COFFEE: "Coffee shops",
  FOOD_AND_DRINK_RESTAURANT: "Restaurants & bars",
  FOOD_AND_DRINK_FAST_FOOD: "Restaurants & bars",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Restaurants & bars",
  FOOD_AND_DRINK_VENDING_MACHINES: "Restaurants & bars",

  TRANSPORTATION_GAS: "Gas",
  TRANSPORTATION_PARKING: "Auto & parking",
  TRANSPORTATION_TOLLS: "Auto & parking",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Rides & transit",
  TRANSPORTATION_PUBLIC_TRANSIT: "Rides & transit",
  TRANSPORTATION_BIKES_AND_SCOOTERS: "Rides & transit",

  TRAVEL_FLIGHTS: "Travel",
  TRAVEL_LODGING: "Travel",
  TRAVEL_RENTAL_CARS: "Travel",
  TRAVEL_OTHER_TRAVEL: "Travel",

  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Clothing",
  GENERAL_MERCHANDISE_ELECTRONICS: "Electronics",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Gifts & donations",

  // Streaming is where a member's subscription spend actually lives, so it is
  // worth seeing on its own rather than inside a general Entertainment lump.
  ENTERTAINMENT_TV_AND_MOVIES: "Streaming & music",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Streaming & music",

  MEDICAL_DENTAL_CARE: "Dental & vision",
  MEDICAL_EYE_CARE: "Dental & vision",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "Pharmacy",

  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Fitness",

  // GENERAL_SERVICES is the grab bag the old map sent straight to Everything
  // else. Three of its detailed values are recurring obligations a member would
  // expect to see named, and one is really a car cost.
  GENERAL_SERVICES_INSURANCE: "Insurance",
  GENERAL_SERVICES_CHILDCARE: "Childcare",
  GENERAL_SERVICES_EDUCATION: "Education",
  GENERAL_SERVICES_AUTOMOTIVE: "Auto & parking",

  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "Gifts & donations",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Taxes & government",
};

// The floor: every Plaid primary, so an unlisted detailed value still lands in
// the right group. Values here are leaf categories, several of them the
// group-named catch-alls.
const PRIMARY_MAP: Record<string, string> = {
  INCOME: "Other income",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  LOAN_PAYMENTS: "Loan payment",
  BANK_FEES: "Bank fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Groceries & dining",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Home & repairs",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal care",
  GENERAL_SERVICES: "Services",
  GOVERNMENT_AND_NON_PROFIT: "Taxes & government",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Utilities & bills",
};

function categorize(primary?: string, detailed?: string): string {
  const d = (detailed || "").toUpperCase();
  const p = (primary || "").toUpperCase();
  return DETAILED_MAP[d] ?? PRIMARY_MAP[p] ?? "Everything else";
}

// ── The resolver (Stage 2 of docs/CUSTOM_CATEGORIES.md) ─────────────────────
//
// The four functions above answer from one table fixed at build time. Custom
// categories mean the answers become a fact about a MEMBER, so classification
// has to move behind an object a caller resolves once per request rather than a
// module-level lookup a caller can reach from anywhere.
//
// This stage introduces the seam and nothing else. `taxonomyFor()` is async and
// takes a user id, which is the shape stage 3 needs, but it returns the built-in
// taxonomy for everybody, so every answer is identical to the one the free
// functions gave. That is asserted, not assumed: scripts/check-category-
// resolver.ts replays the whole input domain against a fixture captured from the
// pre-refactor module. The reason for the care is api/_finance-snapshot.ts,
// which feeds the Juniper Score: a classification that shifts is a member's
// visible score history shifting, and score_history is keyed by (user, day), so
// a wrong row cannot be quietly recomputed later.
// A group and its leaves, each carrying the id it is known by. This is the
// shape the resolver works in, and it exists because an id can no longer be
// derived from a label: a member who renames "Coffee shops" to "Coffee" keeps
// the id `c_coffee_shops`, which is the whole point of having one, and a
// category they created has an id that never had a slug behind it.
export interface ResolvedLeaf { id: string; label: string; emoji: string }
export interface ResolvedGroup {
  id: string;
  label: string;
  emoji: string;
  kind: CategoryKind;
  /** Offered: what a picker lists and what may be stored. */
  leaves: ResolvedLeaf[];
  /**
   * Hidden: NOT offered, still resolved.
   *
   * A member who hides "Childcare" wants it out of a 46-item list, not out of
   * their history. Every charge already filed there must keep naming it, keep
   * landing in this group, and keep counting toward a budget on it, so these
   * take part in every lookup below except `writableLabels`. The Plaid sync can
   * also still produce one: api/_categorize.ts maps Plaid's categories onto
   * built-in labels, and that mapping does not care what a member has hidden.
   */
  hidden?: ResolvedLeaf[];
}

export interface Taxonomy {
  /** Ordered, display order, exactly as CATEGORY_GROUPS is. */
  readonly groups: ResolvedGroup[];
  /** Spend groups only, in display order. What a donut and a legend read. */
  readonly spendGroups: string[];
  /** Every label that may be stored: both levels, because a group label is a
      legitimate stored value on rows categorized at group precision. */
  readonly writableLabels: ReadonlySet<string>;
  /**
   * Label-only resolution, for a caller that genuinely has no id: a label typed
   * into a request, or a value being validated before it is stored.
   *
   * Reading a STORED ROW with these is a bug waiting for the first rename.
   * `transactions.category` holds the label as it stood when the row was
   * written, so after a member renames a category these two answer for a
   * category that no longer goes by that name. Use `classify(id, label)`.
   */
  groupOf(category?: string | null): string;
  /** Label-only. See groupOf: use `classify` for a stored row. */
  kindOf(category?: string | null): CategoryKind;
  isGroupLabel(label?: string | null): boolean;
  categoryIdOf(category?: string | null): string | null;
  /** Plaid's category to a leaf label. Deliberately NOT per member: a member's
      own category can never be something Plaid maps onto, and the built-ins a
      member has archived must still resolve, or their history changes. */
  categorize(primary?: string, detailed?: string): string;
  /**
   * A stored row's category, resolved id first and label second.
   *
   * This is what makes a rename survivable, and it is why it exists BEFORE
   * members can rename anything. `transactions.category` holds the label as it
   * stood when the row was written, so once a member renames "Coffee shops" to
   * "Coffee", history says one thing and new rows say another: resolving by
   * label would drop every older row into "Everything else", show two names for
   * one category, and split the member's budget in half. Resolving by
   * `category_id` gives one answer for both.
   *
   * `c` is therefore the CURRENT display label, not the stored one, and it is
   * what callers should aggregate on. The label is the fallback for rows
   * written before migration 0024 backfilled the ids, and for a value outside
   * the taxonomy, where the stored text is still the most honest thing to show.
   */
  classify(categoryId?: string | null, label?: string | null): { c: string; g: string; k: CategoryKind; e: string };
}

export function buildTaxonomy(groups: ResolvedGroup[]): Taxonomy {
  const kindByGroup: Record<string, CategoryKind> = {};
  const groupByLeaf: Record<string, string> = {};
  const idByLabel: Record<string, string> = {};
  const writable = new Set<string>();
  // id -> what that category currently is. Groups and leaves cannot collide
  // here even where they share a name, because their ids differ by prefix.
  const byId: Record<string, { label: string; group: string; kind: CategoryKind; emoji: string }> = {};
  for (const g of groups) {
    kindByGroup[g.label] = g.kind;
    idByLabel[g.label] = g.id;
    writable.add(g.label);
    byId[g.id] = { label: g.label, group: g.label, kind: g.kind, emoji: g.emoji };
    for (const leaf of g.leaves) {
      groupByLeaf[leaf.label] = g.label;
      // Leaves after groups, so where a label names both, the LEAF id wins.
      // Same order the migration's mapping was generated in.
      idByLabel[leaf.label] = leaf.id;
      writable.add(leaf.label);
      byId[leaf.id] = { label: leaf.label, group: g.label, kind: g.kind, emoji: leaf.emoji };
    }
    // Hidden leaves join every lookup EXCEPT `writable`. That single omission
    // is what "hidden" means: it cannot be chosen, and everything else about it
    // still works.
    for (const leaf of g.hidden ?? []) {
      groupByLeaf[leaf.label] = g.label;
      idByLabel[leaf.label] = leaf.id;
      byId[leaf.id] = { label: leaf.label, group: g.label, kind: g.kind, emoji: leaf.emoji };
    }
  }
  const group = (category?: string | null): string => {
    const c = (category || "").trim();
    if (!c) return "Everything else";
    if (kindByGroup[c]) return c;
    return groupByLeaf[c] ?? "Everything else";
  };
  return {
    groups,
    spendGroups: groups.filter((g) => g.kind === "spend").map((g) => g.label),
    writableLabels: writable,
    groupOf: group,
    kindOf: (category) => kindByGroup[group(category)] ?? "spend",
    isGroupLabel: (label) => !!label && !!kindByGroup[label.trim()],
    categoryIdOf: (category) => {
      const c = (category || "").trim();
      if (!c) return null;
      return idByLabel[c] ?? null;
    },
    categorize,
    classify: (categoryId, label) => {
      const id = (categoryId || "").trim();
      const hit = id ? byId[id] : undefined;
      if (hit) return { c: hit.label, g: hit.group, k: hit.kind, e: hit.emoji };
      // No id, or an id this member's taxonomy does not know. Fall back to the
      // stored text, which is exactly what every read did before this existed.
      const c = (label || "").trim() || "Everything else";
      const g = group(c);
      // The label's own default, not the group's: an unrecognized label still
      // gets the fallback icon rather than borrowing its group's.
      return { c, g, k: kindByGroup[g] ?? "spend", e: idByLabel[c] ? defaultEmoji(c) : defaultEmoji(g) };
    },
  };
}

// The built-in table, in the resolver's shape. Ids come from the slug helpers,
// which is the one place a label still determines an id, and only for the
// categories that shipped in the code.
export const BUILTIN_GROUPS: ResolvedGroup[] = CATEGORY_GROUPS.map((g) => ({
  id: groupId(g.label),
  label: g.label,
  emoji: defaultEmoji(g.label),
  kind: g.kind,
  leaves: g.categories.map((c) => ({ id: leafId(c), label: c, emoji: defaultEmoji(c) })),
}));

export const BUILTIN_TAXONOMY: Taxonomy = buildTaxonomy(BUILTIN_GROUPS);

// A member's own categories, layered over the built-ins (stage 3b). Only what
// they added or changed is stored, so this is usually zero rows.
export interface MemberCategoryRow {
  category_id: string;
  /** NULL on a row that only hides a built-in: there is no new name to give it. */
  name: string | null;
  group_id: string | null;
  archived?: boolean;
}

// Built-ins plus the member's own, in the resolver's shape.
//
// Order matters and is chosen, not incidental: a created leaf is appended to
// the END of its group, so adding one never reshuffles the categories a member
// already knows the position of. A rename replaces a label in place, keeping
// the leaf's id and its slot.
//
// A row naming a group id, or a built-in that no longer exists after a taxonomy
// change, is SKIPPED rather than treated as a new leaf. Dropping it is the safe
// direction: an unknown row appearing as a category the member never made would
// be worse than one of their renames quietly not applying, and the row survives
// for a later release to interpret.
export function applyMemberCategories(base: ResolvedGroup[], rows: MemberCategoryRow[]): ResolvedGroup[] {
  if (!rows.length) return base;

  const builtinLeaf = new Set<string>();
  const groupIds = new Set<string>();
  for (const g of base) {
    groupIds.add(g.id);
    for (const l of g.leaves) builtinLeaf.add(l.id);
  }

  const renames = new Map<string, string>();          // leaf id -> new label
  const archived = new Set<string>();                 // leaf ids to stop offering
  const created: MemberCategoryRow[] = [];
  for (const r of rows) {
    const name = (r.name || "").trim();
    if (groupIds.has(r.category_id)) continue;        // groups are neither renameable nor hideable yet
    if (r.archived) archived.add(r.category_id);
    if (!name) continue;                              // a hide-only row carries no name
    if (builtinLeaf.has(r.category_id)) renames.set(r.category_id, name);
    else if (r.group_id && groupIds.has(r.group_id)) created.push({ ...r, name });
  }

  return base.map((g) => {
    // A rename keeps the leaf's icon: renaming "Coffee shops" to "Coffee" does
    // not make it stop being coffee.
    const named = (l: ResolvedLeaf) =>
      (renames.has(l.id) ? { id: l.id, label: renames.get(l.id)!, emoji: l.emoji } : l);
    const all = g.leaves.map(named);
    for (const c of created) {
      if (c.group_id === g.id) all.push({ id: c.category_id, label: c.name!, emoji: NEW_CATEGORY_EMOJI });
    }
    // Split, rather than filtered: the hidden ones still have to resolve.
    const leaves = all.filter((l) => !archived.has(l.id));
    const hidden = all.filter((l) => archived.has(l.id));
    return hidden.length ? { ...g, leaves, hidden } : { ...g, leaves };
  });
}
