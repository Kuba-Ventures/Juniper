// What a credit-account balance actually means. Pure and I/O-free.
//
// Plaid reports a credit account's `balances.current` as POSITIVE when the member
// owes money and NEGATIVE when the account is in credit: an overpayment, or a
// refund that landed after the statement was cleared. Both are normal.
//
// ── THE BUG THIS EXISTS TO FIX ──────────────────────────────────────────────
//
// Five places took `Math.abs(balance)` for a credit account, which turns "the
// issuer owes you $328" into "you owe $328". Found on real production data: a
// Capital One card at -328.21 with a $4,400 limit was drawn as "$328 of $4,400
// limit, Used 7%", when the member was using none of that limit.
//
// The reasoning behind the original abs is in the comment it replaced, and it was
// not silly: a negative balance makes a negative bar width, which renders as
// nothing at all. But the fix for an un-drawable bar is to clamp the BAR, not to
// flip the sign of the member's money.
//
// It was not only cosmetic, because the same abs fed:
//   - the Juniper Score's debt-load factor, through `cardDebt`
//   - the Juniper Score's credit factor, through revolving utilization
//   - net worth, as a debt
// So an overpaid card made the member's score worse and their net worth smaller,
// by the amount the issuer owed them.
//
// ── WHY NOT COUNT A CREDIT BALANCE AS AN ASSET ──────────────────────────────
//
// It arguably is one: the issuer owes it, and it is usually refundable on request.
// It is deliberately counted as ZERO debt rather than as a positive asset, and the
// reason is the same one that governs the rest of this codebase: a card in credit
// is nearly always a transient state (a refund that will be spent against, a
// double payment that will be absorbed next cycle), and folding it into net worth
// would make the trend jump on something that is not really wealth. Zero is the
// honest floor. A member with a genuinely large, persistent credit balance is rare
// enough to be worth a real decision rather than a default.

/** The two halves of a credit account's position, both non-negative. */
export interface CreditPosition {
  /** What the member owes. Zero when the account is in credit. */
  owed: number;
  /** What the issuer owes the member. Zero when the member owes. */
  inCredit: number;
}

/**
 * Split a credit-account balance into what is owed and what is held in credit.
 *
 * Exactly one of the two is ever non-zero, which is what makes every caller's
 * arithmetic obvious: sum `owed` for debt and utilization, and show `inCredit`
 * where it exists instead of pretending it is debt.
 */
export function creditPosition(balance: number | null | undefined): CreditPosition {
  const bal = typeof balance === "number" && Number.isFinite(balance) ? balance : 0;
  // A zero balance is neither, and falls out of both branches as zero.
  if (bal > 0) return { owed: bal, inCredit: 0 };
  if (bal < 0) return { owed: 0, inCredit: -bal };
  return { owed: 0, inCredit: 0 };
}

/**
 * Utilization as a whole percentage, or null when it cannot be stated.
 *
 * Null rather than zero when there is no limit, because "we do not know" and "you
 * are using none of it" are different facts and the Credit page prints them
 * differently ("Unknown" against "0%").
 *
 * Clamped at both ends. The floor is what the original `Math.abs` was really
 * reaching for: a card in credit is using none of its limit, and a negative bar
 * width renders as nothing. The ceiling exists because a card can genuinely be
 * over its limit, and a bar wider than its track escapes the card it sits in.
 */
export function utilizationPct(owed: number, limit: number | null | undefined): number | null {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null;
  const pct = Math.round((Math.max(0, owed) / limit) * 100);
  return Math.min(100, Math.max(0, pct));
}
