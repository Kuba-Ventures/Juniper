// Shared assembly of the Juniper Score inputs from a user's Stage-3 data, so the
// read endpoint (/api/finances) and the history writer (/api/score/compute)
// score off exactly the same numbers. Fetches with the service-role key and
// scopes by user_id itself (RLS is bypassed here, see _supabase-admin).
import { adminRest } from "./_supabase-admin";
import type { ScoreInput } from "./_score";

type Txn = { amount: number; date: string; category: string | null };
type Acct = { type: string | null; balance: number | null };
type Item = { accounts: Acct[] };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

// Days back to average income/spending over, a trailing window keeps the score
// stable across a partial current month.
const WINDOW_DAYS = 90;

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
function isoDaysAgo(daysAgo: number): string {
  const ms = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchScoreInput(uid: string): Promise<FinanceSnapshot> {
  const items = await rows<Item>(`plaid_items?user_id=eq.${uid}&select=accounts`);
  const since = isoDaysAgo(WINDOW_DAYS);
  const txns = await rows<Txn>(
    `transactions?user_id=eq.${uid}&date=gte.${since}&select=amount,date,category&limit=2000`,
  );

  // Not enough to score off yet, caller keeps the demo mock.
  if (!items.length || !txns.length) {
    return { linked: false, input: emptyInput(), signals: emptySignals() };
  }

  // Plaid convention: positive amount = money out, negative = money in.
  const months = WINDOW_DAYS / 30;
  const outflow = txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const inflow = Math.abs(txns.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0));
  const monthlySpending = outflow / months;
  const monthlyIncome = inflow / months;

  let cashReserves = 0, investmentBalance = 0, cardDebt = 0, loanDebt = 0;
  for (const it of items) {
    for (const a of it.accounts || []) {
      const bal = a.balance || 0;
      const type = (a.type || "").toLowerCase();
      if (type === "depository") cashReserves += bal;
      else if (type === "investment" || type === "brokerage") investmentBalance += bal;
      else if (type === "credit") cardDebt += Math.abs(bal);
      else if (type === "loan") loanDebt += Math.abs(bal);
    }
  }
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
      // creditScore / creditUtilization left undefined until we ingest credit
      // data (Stage 10); the engine falls back to a neutral credit factor.
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
