// Shared assembly of the Juniper Score inputs from a user's Stage-3 data, so the
// read endpoint (/api/finances) and the history writer (/api/score/compute)
// score off exactly the same numbers. Fetches with the service-role key and
// scopes by user_id itself (RLS is bypassed here, see _supabase-admin).
import { adminRest } from "./_supabase-admin";
import { fetchManualAccounts, sumManualAccounts } from "./_manual-accounts";
import { taxonomyFor } from "./_taxonomy";
import { creditPosition } from "./_credit-balance";
import type { ScoreInput } from "./_score";

type Txn = { amount: number; date: string; category: string | null; category_id: string | null };
// `limit` is the card's credit line, persisted into the stored snapshot by
// sanitizeAccounts. Present on most cards, null on plenty of them, which is why
// utilization below is computed only across the cards that report one.
type Acct = { type: string | null; balance: number | null; limit?: number | null };
type Item = { accounts: Acct[] };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

// How far back to ask for transactions. A trailing window keeps the score stable
// across a partial current month.
export const WINDOW_DAYS = 90;

// The shortest span this will treat as representative. Below it the monthly
// figures are still an extrapolation, but from a floor rather than from however
// few days happen to exist: a member who linked three days ago would otherwise
// have their weekend multiplied into a month. Two weeks is the point where a
// pay cycle and a rent payment are usually both inside the window.
const MIN_COVERED_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// How many days of history the transactions actually span, counting from the
// oldest one to today. This is the divisor the monthly averages need, and using
// the WINDOW length instead was a real bug: a member who linked three weeks ago
// had every monthly figure divided by three, which left their spending at a
// third of reality and therefore their emergency fund reading three times the
// months it covers, their investing pace three times the pace, and their debt
// load a third of the burden. Savings rate came out right by luck, being a ratio
// of two numbers that were both a third too small.
// EXPORTED for /api/card-rewards, which needs exactly this divisor for exactly
// this reason: it turns a member's observed category spend into an annual figure
// and then quotes a dollar recommendation off it, so a window that overstates
// the history overstates the advice. One definition, not two, because two copies
// of "how much history is there" is how they come to disagree.
export function coveredDays(dates: string[]): number {
  let oldest = Infinity;
  for (const d of dates) {
    const t = Date.parse(d);
    if (!Number.isNaN(t) && t < oldest) oldest = t;
  }
  if (!Number.isFinite(oldest)) return MIN_COVERED_DAYS;
  const spanned = Math.floor((Date.now() - oldest) / DAY_MS) + 1;
  return Math.min(WINDOW_DAYS, Math.max(MIN_COVERED_DAYS, spanned));
}

// Richer breakdown for personalized marketplace picks, separates the debt kinds
// and precomputes the ratios the pick rules read.
export interface PickSignals {
  monthlySpending: number;
  cashReserves: number;
  emergencyMonths: number;   // cashReserves / monthlySpending
  cardDebt: number;          // revolving (credit) balances
  loanDebt: number;          // installment (loan) balances
  investmentBalance: number;
  annualIncome: number;
}

export interface FinanceSnapshot {
  linked: boolean;
  input: ScoreInput;
  signals: PickSignals;
}

// UTC yyyy-mm-dd for `daysAgo` before now, without Date.now-in-a-loop concerns.
// Exported alongside coveredDays and WINDOW_DAYS so a second caller asks for the
// same window it later divides by.
export function isoDaysAgo(daysAgo: number): string {
  const ms = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchScoreInput(uid: string): Promise<FinanceSnapshot> {
  const items = await rows<Item>(`plaid_items?user_id=eq.${uid}&select=accounts`);
  const since = isoDaysAgo(WINDOW_DAYS);
  const txns = await rows<Txn>(
    `transactions?user_id=eq.${uid}&date=gte.${since}&select=amount,date,category,category_id&limit=2000`,
  );

  // Not enough to score off yet, caller keeps the demo mock.
  if (!items.length || !txns.length) {
    return { linked: false, input: emptyInput(), signals: emptySignals() };
  }

  // Plaid convention: positive amount = money out, negative = money in. But the
  // sign alone does not say whether money was CONSUMED, so this applies the same
  // three rules as /api/finances (see the cashflow block there): transfers and
  // credit-card payments are dropped, income is netted from its own categories,
  // and spending is summed signed so refunds reduce it. This matters more here
  // than on the dashboard, because these two numbers drive the savings rate and
  // the emergency-fund factor: counting transfers to savings as spending both
  // inflated the fund the member needs and hid the saving they were doing.
  const months = coveredDays(txns.map((t) => t.date)) / 30;
  // Resolved once for this member, not per row. Stage 2 of
  // docs/CUSTOM_CATEGORIES.md: these two numbers drive the score's savings rate
  // and emergency-fund factor, so the classification behind them is now the
  // member's own taxonomy rather than a module-level table.
  const tax = await taxonomyFor(uid);
  let outflow = 0, inflow = 0;
  for (const t of txns) {
    const kind = tax.classify(t.category_id, t.category).k;
    if (kind === "transfer") continue;
    if (kind === "income") inflow -= t.amount;
    else outflow += t.amount;
  }
  const monthlySpending = Math.max(0, outflow) / months;
  const monthlyIncome = Math.max(0, inflow) / months;

  let cashReserves = 0, investmentBalance = 0, cardDebt = 0, loanDebt = 0;
  // Numerator and denominator of revolving utilization, accumulated together
  // across only the cards that report a limit so the ratio stays consistent: a
  // card with a balance and no limit would otherwise inflate it, and a card with
  // a limit and no balance is legitimately 0% of that line.
  //
  // BANK-REPORTED LIMITS ONLY, and this is load-bearing rather than incidental.
  // TWO member-supplied limits now exist and NEITHER is read here. Since #211 a
  // member can supply a limit for a card their issuer does not report one for
  // (`member_cards.credit_limit`), shown on the Credit page with a "You set this"
  // badge; and since migration 0046 they can enter a whole card by hand with its
  // own limit (`manual_accounts.credit_limit`), badged "You added this", for a
  // card Plaid can never reach at all, an authorized-user card on somebody else's
  // login being the case that forced it. Both are deliberately NOT read here.
  // This utilization feeds the Juniper Score's credit factor at weight 0.15, and
  // the Score is a figure Juniper asserts about the member: folding in a
  // self-reported denominator would let anybody raise their own score by typing
  // a generous number, with nothing on screen to show why it moved. #146 removed
  // a flat placeholder from this same factor for the same reason, and a null
  // factor renormalizes the remaining weights, so a member whose only limits are
  // self-reported correctly gets an unmeasured credit factor rather than a
  // flattering one. Do not "helpfully" join member_cards or select
  // manual_accounts.credit_limit in here; the shared `fetchManualAccounts` does
  // not even request that column, which is what keeps this structural rather than
  // a rule somebody has to remember.
  let utilBalance = 0, utilLimit = 0;
  for (const it of items) {
    for (const a of it.accounts || []) {
      const bal = a.balance || 0;
      const type = (a.type || "").toLowerCase();
      if (type === "depository") cashReserves += bal;
      else if (type === "investment" || type === "brokerage") investmentBalance += bal;
      else if (type === "credit") {
        // `creditPosition`, not Math.abs. Plaid reports a credit balance as
        // NEGATIVE when the account is in credit, and abs turned "the issuer owes
        // you $328" into "you owe $328", which made an overpaid card lower the
        // member's score twice over: once through debt load and once through
        // utilization. See api/_credit-balance.ts.
        const { owed } = creditPosition(bal);
        cardDebt += owed;
        const limit = typeof a.limit === "number" ? a.limit : 0;
        if (limit > 0) {
          utilLimit += limit;
          utilBalance += owed;
        }
      }
      else if (type === "loan") loanDebt += Math.abs(bal);
    }
  }

  // Real credit health, from the linked cards, computed before the manual
  // balances fold in below, so a hand-added card's balance cannot land in the
  // numerator of a ratio its limit is kept out of.
  //
  // The reason changed with migration 0046 and the exclusion did not. It used to
  // be that a hand-added card carried a balance and no credit line at all, so
  // counting it would have reported utilization of a limit nobody had entered.
  // A member can now enter that limit, and it is STILL excluded, on the stronger
  // ground above: it is a number they typed, and the Score is Juniper's own
  // assertion. The Credit page counts it and says whose it is.
  const creditUtilization = utilLimit > 0 ? utilBalance / utilLimit : undefined;

  // Fold in manually-added accounts (tier 3) so hand-entered balances, a 401(k),
  // a regional bank Plaid can't reach, count toward the score just like linked
  // ones. They carry no transactions, so income/spending above are unaffected.
  const manual = sumManualAccounts(await fetchManualAccounts(uid));
  cashReserves += manual.cash;
  investmentBalance += manual.invest;
  cardDebt += manual.cardDebt;
  loanDebt += manual.loanDebt;

  const totalDebt = cardDebt + loanDebt;
  const totalAssets = cashReserves + investmentBalance;
  const emergencyMonths = monthlySpending > 0 ? cashReserves / monthlySpending : 0;

  return {
    linked: true,
    input: {
      monthlyIncome: Math.round(monthlyIncome),
      monthlySpending: Math.round(monthlySpending),
      cashReserves: Math.round(cashReserves),
      totalDebt: Math.round(totalDebt),
      totalAssets: Math.round(totalAssets),
      investmentBalance: Math.round(investmentBalance),
      // Real utilization when the linked cards report their limits. creditScore
      // stays undefined until a bureau feed exists (Stage 10, see
      // docs/CREDIT_PROVIDER.md). With neither, the engine drops the credit
      // factor rather than inventing a number for it.
      creditUtilization,
    },
    signals: {
      monthlySpending: Math.round(monthlySpending),
      cashReserves: Math.round(cashReserves),
      emergencyMonths: Math.round(emergencyMonths * 10) / 10,
      cardDebt: Math.round(cardDebt),
      loanDebt: Math.round(loanDebt),
      investmentBalance: Math.round(investmentBalance),
      annualIncome: Math.round(monthlyIncome * 12),
    },
  };
}

function emptyInput(): ScoreInput {
  return { monthlyIncome: 0, monthlySpending: 0, cashReserves: 0, totalDebt: 0, totalAssets: 0, investmentBalance: 0 };
}

function emptySignals(): PickSignals {
  return { monthlySpending: 0, cashReserves: 0, emergencyMonths: 0, cardDebt: 0, loanDebt: 0, investmentBalance: 0, annualIncome: 0 };
}
