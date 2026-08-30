// Which category a synced transaction ends up with, and why.
//
// Three answers can exist for one charge and they do not carry equal weight:
//
//   plaid  what Plaid's own classification maps onto (api/_categorize.ts)
//   rule   "always categorize Blue Bottle as Coffee shops", set by the member
//   user   this ONE charge, corrected by hand by the member
//
// Precedence is user, then rule, then plaid, and the reason is not arbitrary.
// A rule is a statement about a merchant; a correction is a statement about a
// charge. The more specific statement wins, so a member who rules "Amazon is
// Shopping" and then files one Amazon charge under Groceries keeps that one
// charge under Groceries, forever, through every sync.
//
// A PURE FUNCTION IN ITS OWN MODULE, because it is the thing that quietly
// reverts a member's work when it is wrong. The bug it exists to prevent
// already happened once: transactions-sync upserts with merge-duplicates and
// wrote `category_source: "plaid"` on every row, so a correction survived only
// until Plaid next touched that transaction and then vanished with no error.
// Pure, so scripts/check-category-precedence.ts can exercise every combination
// without a database or a Plaid account.
export type CategorySource = "plaid" | "rule" | "user";

export interface CategoryDecision {
  category: string;
  source: CategorySource;
}

export function decideCategory(input: {
  /** What api/_categorize.ts made of Plaid's own classification. */
  plaid: string;
  /** The member's rule for this merchant, if they have one. */
  rule?: string | null;
  /** The member's correction to THIS charge, if they made one. */
  override?: string | null;
}): CategoryDecision {
  const override = (input.override || "").trim();
  // Kept as `user`, not written back as `plaid` or downgraded to `rule`: the
  // source is what makes it keep winning on the next sync, so losing it is the
  // same as losing the correction.
  if (override) return { category: override, source: "user" };

  const rule = (input.rule || "").trim();
  if (rule) return { category: rule, source: "rule" };

  return { category: input.plaid, source: "plaid" };
}

// Plaid's merchant string, normalized for matching a rule against.
//
// Lowercased and space-collapsed, and nothing more. It is tempting to strip
// store numbers and payment-processor prefixes ("SQ *BLUE BOTTLE #241"), and
// that is exactly the kind of cleverness that silently files the wrong charge:
// a member who set a rule on one merchant would find it catching another. A
// rule matches the merchant Plaid named, or it does not match.
export function merchantKey(merchant?: string | null): string | null {
  const m = (merchant || "").trim().toLowerCase().replace(/\s+/g, " ");
  return m || null;
}
