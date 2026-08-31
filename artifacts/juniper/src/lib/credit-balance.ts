// Client mirror of api/_credit-balance.ts.
//
// THAT MODULE IS CANONICAL and is what scripts/src/check-credit-balance.ts
// exercises. This is a mirror for the same reason src/lib/score.ts mirrors
// api/_score.ts: the Credit page's utilization card reads the stored Plaid
// snapshot directly (a documented exception to the finances seam, because it
// needs each card's `limit`), so it needs the rule on this side of the wire and
// the client cannot import from `api/`.
//
// If either copy changes, change both. The rule is four lines and it was wrong in
// production in five places at once, which is the argument for keeping it in one
// shape rather than open-coding it a sixth time.

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
 * Plaid reports a credit account's balance as POSITIVE when the member owes and
 * NEGATIVE when the account is in credit, from an overpayment or a refund that
 * landed after the statement cleared. `Math.abs` on that turned "the issuer owes
 * you $328" into "you owe $328".
 */
export function creditPosition(balance: number | null | undefined): CreditPosition {
  const bal = typeof balance === "number" && Number.isFinite(balance) ? balance : 0;
  if (bal > 0) return { owed: bal, inCredit: 0 };
  if (bal < 0) return { owed: 0, inCredit: -bal };
  return { owed: 0, inCredit: 0 };
}

/**
 * Utilization as a whole percentage, or null when it cannot be stated.
 *
 * Null rather than zero with no limit, because "we do not know" and "you are
 * using none of it" are different facts and this page prints them differently.
 * Clamped at both ends: a card in credit is using none of its limit, and a card
 * genuinely over its limit must not draw a bar wider than its track.
 */
export function utilizationPct(owed: number, limit: number | null | undefined): number | null {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null;
  const pct = Math.round((Math.max(0, owed) / limit) * 100);
  return Math.min(100, Math.max(0, pct));
}
