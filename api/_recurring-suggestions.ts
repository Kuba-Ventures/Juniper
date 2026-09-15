// A fallback recurring-charge detector, ours rather than Plaid's, for the case
// Plaid's own /transactions/recurring/get provably misses: a subscription paid
// through an intermediary like PayPal (or Venmo, Cash App) rather than a direct
// card or bank charge. Found live: a real member's Ancestry ($39.99/mo) and
// Apple ($9.99/mo) both cleared through a PayPal account, both landed in
// `transactions` with a clean merchant name and a consistent monthly cadence,
// and Plaid never clustered either into a stream.
//
// Pure and I/O-free, same convention as _rewards.ts, _recurring-drift.ts and
// _recurring-monthly.ts: api/subscriptions.ts is the only caller, and keeping
// the matching logic here, fed real rows rather than a live query, is what
// makes it checkable without a database.
//
// THE HEURISTIC, AND WHY IT IS THIS NARROW:
//   1. Group by merchant name (normalized) AND the amount rounded to the
//      nearest dollar. Rounding, not a percentage tolerance, because $39.99
//      and $9.99 round the same way every month while a percentage band would
//      need tuning per amount; a merchant charging genuinely different amounts
//      each time (most one-off shopping) will not repeat under the same
//      rounded bucket at all.
//   2. Require at least MIN_OCCURRENCES hits in that bucket. Two charges is a
//      coincidence Juniper has no business asserting as a subscription; three
//      is the same floor Plaid's own EARLY_DETECTION status uses.
//   3. Require the MEDIAN gap between consecutive charges to land in a loose
//      "roughly monthly" band (MIN_GAP_DAYS-MAX_GAP_DAYS). This is what tells
//      a real subscription apart from a member's Tuesday grocery run at the
//      same store for a similar rounded total: a subscription lands on
//      (approximately) the same cadence, a habit does not.
//   4. Exclude any merchant Plaid has already clustered into a real stream
//      (the caller passes those keys in), so this never proposes a duplicate
//      of what Plaid already found.
//
// Confirming or dismissing a candidate is api/subscriptions.ts's job, through
// the same recurring_overrides table every Plaid-backed stream uses, keyed by
// a synthetic `juniper:<merchantKey>` id (see subscriptions.ts) so a decision
// persists across requests without this module needing to know about storage.

export const MIN_OCCURRENCES = 3;
export const MIN_GAP_DAYS = 21;
export const MAX_GAP_DAYS = 40;
export const MAX_SUGGESTIONS = 6;

export type SuggestionTxn = {
  id: string;
  merchantName: string;
  amount: number;
  date: string; // ISO yyyy-mm-dd
};

export type RecurringSuggestion = {
  merchantKey: string;
  merchantName: string;
  averageAmount: number;
  lastAmount: number;
  lastDate: string;
  occurrences: number;
  transactionIds: string[];
};

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** `excludeMerchantKeys` should hold the normalized merchant name of every
 *  Plaid-detected stream this member already has, so a real Plaid stream is
 *  never re-proposed as a Juniper one alongside it. Callers pass only
 *  positive-amount (outflow) transactions with a non-empty merchant name;
 *  a transfer, a paycheck, or a fee with no merchant is out of scope for the
 *  same reason it is out of scope for Plaid's own detector. */
export function findRecurringSuggestions(
  transactions: SuggestionTxn[],
  excludeMerchantKeys: ReadonlySet<string>,
): RecurringSuggestion[] {
  const groups = new Map<string, { merchantKey: string; merchantName: string; txns: SuggestionTxn[] }>();
  for (const t of transactions) {
    const merchantKey = t.merchantName.trim().toLowerCase().replace(/\s+/g, " ");
    if (!merchantKey || excludeMerchantKeys.has(merchantKey)) continue;
    const bucket = Math.round(t.amount);
    if (bucket <= 0) continue;
    const key = `${merchantKey}::${bucket}`;
    const g = groups.get(key) ?? { merchantKey, merchantName: t.merchantName, txns: [] };
    g.txns.push(t);
    groups.set(key, g);
  }

  const out: RecurringSuggestion[] = [];
  for (const g of groups.values()) {
    if (g.txns.length < MIN_OCCURRENCES) continue;
    const sorted = [...g.txns].sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    const gap = median(gaps);
    if (gap < MIN_GAP_DAYS || gap > MAX_GAP_DAYS) continue;

    const last = sorted[sorted.length - 1];
    out.push({
      merchantKey: g.merchantKey,
      merchantName: g.merchantName,
      averageAmount: Math.round((sorted.reduce((a, t) => a + t.amount, 0) / sorted.length) * 100) / 100,
      lastAmount: last.amount,
      lastDate: last.date,
      occurrences: sorted.length,
      transactionIds: sorted.map((t) => t.id),
    });
  }

  out.sort((a, b) => b.occurrences - a.occurrences || b.averageAmount - a.averageAmount);
  return out.slice(0, MAX_SUGGESTIONS);
}
