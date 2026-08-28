// The pure half of the net-worth backfill: given today's balances and the daily
// movements behind them, produce one net-worth point per earlier day.
//
// Split out of api/plaid/networth-backfill.ts for the same reason _score.ts is
// split out of the endpoints that use it. Everything here is arithmetic on
// arguments, with no Plaid call, no database, and no clock, so it can be run
// against a worked example and checked, which matters more here than usual: the
// signs are the whole correctness story and they are easy to get backwards.

export type WalkDay = { as_of: string; assets: number; debts: number; net_worth: number };

export type WalkInput = {
  /** UTC yyyy-mm-dd of today. Today itself is not emitted: it is observed, not derived. */
  today: string;
  /** UTC yyyy-mm-dd of the oldest day to reconstruct back to, exclusive of its own step. */
  oldest: string;
  /** Today's balances, already bucketed and positive. `debt` is the amount owed. */
  cash: number;
  invest: number;
  debt: number;
  /**
   * Signed transaction totals per day, Plaid's convention: positive is money out
   * of the member's pocket. Keyed yyyy-mm-dd.
   *
   * `cashByDay` covers depository accounts, `debtByDay` covers credit and loan
   * accounts, and `flowsByDay` is net external money into investment accounts
   * (positive means value arrived from outside).
   */
  cashByDay: Map<string, number>;
  debtByDay: Map<string, number>;
  flowsByDay: Map<string, number>;
  /** Held flat across the window: hand-entered balances have no history to walk. */
  manualAssets: number;
  manualDebts: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Walk backward from today, one day at a time, undoing each day's movements to
 * arrive at the balances that must have preceded them.
 *
 *   cash(day - 1)   = cash(day)   + that day's depository total
 *   owed(day - 1)   = owed(day)   - that day's credit total
 *   invest(day - 1) = invest(day) - that day's external inflow
 *
 * The first two signs differ because the same positive amount means opposite
 * things to the two balances. A $40 purchase on a debit card took $40 out of
 * checking, so the day before it, checking held $40 MORE. The same purchase on a
 * credit card added $40 to what is owed, so the day before it, the balance owed
 * was $40 LESS. A card payment appears in both buckets, as an outflow from
 * checking and an inflow to the card, and therefore nets to zero against net
 * worth, which is right: paying a card changes nothing about what you are worth.
 *
 * Returned oldest-day-last, the order the caller writes them in.
 */
export function walkBackward(input: WalkInput): WalkDay[] {
  const todayMs = Date.parse(input.today);
  const oldestMs = Date.parse(input.oldest);
  if (Number.isNaN(todayMs) || Number.isNaN(oldestMs) || oldestMs >= todayMs) return [];

  let { cash, invest, debt } = input;
  const out: WalkDay[] = [];

  for (let dayMs = todayMs; dayMs > oldestMs; dayMs -= DAY_MS) {
    const day = iso(dayMs);
    cash += input.cashByDay.get(day) ?? 0;
    debt -= input.debtByDay.get(day) ?? 0;
    invest -= input.flowsByDay.get(day) ?? 0;

    // Owed is clamped at zero rather than allowed to go negative. A card can
    // legitimately hold a credit balance, but a negative figure here is far more
    // often the reconstruction running past the beginning of the history Plaid
    // shared, and a phantom negative debt inflates past net worth.
    const assets = round(cash + invest + input.manualAssets);
    const debts = round(Math.max(0, debt) + input.manualDebts);
    out.push({ as_of: iso(dayMs - DAY_MS), assets, debts, net_worth: round(assets - debts) });
  }

  return out;
}
