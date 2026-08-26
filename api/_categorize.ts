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
export function isGroupLabel(label?: string | null): boolean {
  return !!label && !!GROUP_KIND[label.trim()];
}

// A group label resolves to itself, which is what makes every pre-3b row and
// budget keep working: they were already stored at group precision. Anything
// unrecognized (a hand-edited label, a category we retire later) falls to
// Everything else, spend, so money out is never silently dropped from a total.
export function groupOf(category?: string | null): string {
  const c = (category || "").trim();
  if (!c) return "Everything else";
  if (GROUP_KIND[c]) return c;
  return CATEGORY_GROUP[c] ?? "Everything else";
}

export function kindOf(category?: string | null): CategoryKind {
  return GROUP_KIND[groupOf(category)] ?? "spend";
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

export function categorize(primary?: string, detailed?: string): string {
  const d = (detailed || "").toUpperCase();
  const p = (primary || "").toUpperCase();
  return DETAILED_MAP[d] ?? PRIMARY_MAP[p] ?? "Everything else";
}
