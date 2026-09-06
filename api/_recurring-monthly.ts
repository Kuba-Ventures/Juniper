// The one place a recurring stream's amount and cadence become a monthly
// figure. Shared by api/subscriptions.ts (the summary total) and
// api/cancellation-requests.ts (the monthly_at_request snapshot), so a
// cancellation's "estimated savings" and the confirmed total it drops out of
// are guaranteed to have agreed about this stream's monthly figure at the
// moment the request was made. Pure and I/O-free, same convention as
// _rewards.ts and _recurring-drift.ts.
//
// UNKNOWN is deliberately absent rather than defaulting to monthly: a stream
// Plaid (or the member) cannot put a cadence on cannot be converted into a
// monthly figure, and guessing "monthly" would silently misstate the total.
export const PER_YEAR: Record<string, number> = {
  WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12, ANNUALLY: 1,
};

export function monthlyAmount(amount: number | null, frequency: string | null): number | null {
  const per = PER_YEAR[(frequency || "").toUpperCase()];
  if (amount == null || !per) return null;
  return (amount * per) / 12;
}
