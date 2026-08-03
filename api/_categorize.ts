// Stage 3c (core): map a Plaid personal_finance_category onto a Juniper spending
// category. Kept deliberately small and pure so the sync, a future re-categorize
// endpoint, and tests can all share it. User overrides (category_source='user')
// are respected upstream and never touched here.
//
// Juniper categories (must match the dashboard): Housing, Groceries & dining,
// Transportation, Shopping, Utilities & bills, Kids & health, Income,
// Everything else.

const PRIMARY_MAP: Record<string, string> = {
  INCOME: "Income",
  FOOD_AND_DRINK: "Groceries & dining",
  GENERAL_MERCHANDISE: "Shopping",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Transportation",
  RENT_AND_UTILITIES: "Utilities & bills",
  HOME_IMPROVEMENT: "Housing",
  MEDICAL: "Kids & health",
  PERSONAL_CARE: "Kids & health",
  ENTERTAINMENT: "Everything else",
  GENERAL_SERVICES: "Everything else",
  GOVERNMENT_AND_NON_PROFIT: "Everything else",
  LOAN_PAYMENTS: "Everything else",
  BANK_FEES: "Everything else",
  TRANSFER_IN: "Everything else",
  TRANSFER_OUT: "Everything else",
};

// A few detailed-category overrides where the primary bucket is too coarse —
// e.g. RENT_AND_UTILITIES covers both rent (Housing) and the utility bill.
export function categorize(primary?: string, detailed?: string): string {
  const d = (detailed || "").toUpperCase();
  if (d.includes("RENT") || d.includes("MORTGAGE")) return "Housing";
  return PRIMARY_MAP[(primary || "").toUpperCase()] || "Everything else";
}
