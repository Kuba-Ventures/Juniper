// The shared test for "this is a real price move," used by api/subscriptions.ts
// (member-expected vs last-charged, for the "paid, not the amount we expected"
// state) and api/plaid/recurring-sync.ts (previous vs new last_amount, for the
// price-history write). Pure and I/O-free, same convention as _rewards.ts and
// _credit-balance.ts, so the two call sites cannot drift into disagreeing
// about what counts as a move worth flagging.
//
// A move must clear BOTH a meaningful fraction and a meaningful number of
// dollars: a 4% utility swing isn't news, and neither is a 12% move on a $2
// charge. Without both tests every list renders amber every month and the
// state stops meaning anything.
export const AMOUNT_TOLERANCE = 0.05;
export const AMOUNT_FLOOR = 1;

export function isMeaningfulDrift(from: number | null, to: number | null): boolean {
  if (from == null || to == null || from <= 0) return false;
  const drift = Math.abs(to - from);
  return drift > AMOUNT_FLOOR && drift / from > AMOUNT_TOLERANCE;
}
