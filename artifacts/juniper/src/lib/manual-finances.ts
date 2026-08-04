// Build dashboard finance data from a *manually entered* profile.
//
// When a member finishes onboarding by hand (accounts, loans, income) but
// hasn't linked Plaid, the dashboard should still show THEIR numbers — real net
// worth, their accounts, and a computed Juniper Score — not the demo household.
// This turns the local `UserProfile` into the same `FinanceData` shape the live
// path produces. Transaction-derived fields (spending, budgets, transactions)
// stay empty on purpose: with no bank feed there is nothing honest to show, so
// the dashboard renders a "connect an account to unlock" nudge instead.

import type { FinanceData } from "@/lib/finances";
import type { Account, SeriesKey } from "@/lib/mock-data";
import { netWorth as mockNetWorth } from "@/lib/mock-data";
import type { UserProfile } from "@/lib/profile";
import { computeScore } from "@/lib/score";

const ACCT_CYCLE: SeriesKey[] = ["--jnpr-c1", "--jnpr-c3", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6", "--jnpr-c4"];

const KIND_LABEL: Record<string, string> = { cash: "Cash", invest: "Investment", debt: "Debt" };

const monthLabel = () => {
  try {
    return new Date().toLocaleDateString(undefined, { month: "short" });
  } catch {
    return "This month";
  }
};

// True when the profile carries at least one real number to show.
export function hasManualFinances(p: UserProfile | null): boolean {
  if (!p) return false;
  return (
    (Array.isArray(p.accounts) && p.accounts.length > 0) ||
    typeof p.monthlyIncome === "number" ||
    typeof p.monthlyExpenses === "number"
  );
}

// Any non-null profile means the member has been through onboarding, so we show
// THEIR dashboard — even if sparse/zeroed — never the demo household. The demo
// (mock) is reserved for pre-onboarding sessions with no saved profile at all.
export function buildManualFinances(p: UserProfile | null): FinanceData | null {
  if (!p) return null;

  const list = p.accounts ?? [];
  let ci = 0;
  const nextColor = (): SeriesKey => ACCT_CYCLE[ci++ % ACCT_CYCLE.length];

  const toAccount = (a: NonNullable<UserProfile["accounts"]>[number], signed: boolean): Account => ({
    n: a.name,
    i: KIND_LABEL[a.kind] ?? "Account",
    v: signed ? -Math.abs(a.balance) : Math.abs(a.balance),
    k: nextColor(),
    ...(a.apr != null ? { apr: `${a.apr}%` } : {}),
  });

  const cashAccts = list.filter((a) => a.kind === "cash");
  const investAccts = list.filter((a) => a.kind === "invest");
  const debtAccts = list.filter((a) => a.kind === "debt");

  const accounts = {
    cash: cashAccts.map((a) => toAccount(a, false)),
    invest: investAccts.map((a) => toAccount(a, false)),
    debt: debtAccts.map((a) => toAccount(a, true)),
  };

  const cashTotal = cashAccts.reduce((s, a) => s + Math.abs(a.balance), 0);
  const investTotal = investAccts.reduce((s, a) => s + Math.abs(a.balance), 0);
  const debtTotal = debtAccts.reduce((s, a) => s + Math.abs(a.balance), 0);
  const netWorthValue = cashTotal + investTotal - debtTotal;

  // No history yet, so the trend line is honestly flat at the current value.
  // A 12-point series keeps NetWorthChart's fixed month ticks/labels valid.
  const flatSeries = mockNetWorth.labels.map(() => netWorthValue);

  const income = p.monthlyIncome ?? 0;
  const spent = p.monthlyExpenses ?? 0;

  const s = computeScore({
    monthlyIncome: income,
    monthlySpending: spent,
    cashReserves: cashTotal,
    totalDebt: debtTotal,
    totalAssets: cashTotal + investTotal,
    investmentBalance: investTotal,
  });

  return {
    netWorth: {
      value: netWorthValue,
      changeAbs: 0,
      changePct: 0,
      series: flatSeries,
      labels: mockNetWorth.labels,
    },
    cashflow: { income, spent, saved: income - spent, month: monthLabel() },
    // Transaction-derived surfaces are empty until an account is linked.
    spending: [],
    budgets: [],
    transactions: [],
    accounts,
    score: {
      value: s.value,
      band: s.band,
      delta: 0,
      lever: s.lever,
      trend: [s.value, s.value],
      factors: s.factors,
      improvements: s.improvements,
    },
  };
}
