import type { UserProfile } from "@/lib/profile";

// Shared shape for anything that edits the paycheck breakdown (issue #402):
// the dashboard nudge (SnapshotNudge) and the onboarding paycheck step both
// write these same fields, so there is one definition of what a "paycheck"
// is rather than two that can drift.
export type PaycheckFields = Pick<
  UserProfile,
  | "monthlyIncome"
  | "monthlyExpenses"
  | "deduction401k"
  | "deductionHealthInsurance"
  | "deductionHsaFsa"
  | "expenseRent"
  | "expenseLoanPayments"
  | "expenseOtherEssentials"
  | "balance401k"
  | "balanceHsaFsa"
>;

export type CatKey =
  | "deduction401k"
  | "deductionHealthInsurance"
  | "deductionHsaFsa"
  | "expenseRent"
  | "expenseLoanPayments"
  | "expenseOtherEssentials";

// The two before-you're-paid categories that carry a current balance, not
// just a per-paycheck contribution (health insurance is a premium, so it has
// no counterpart). Keyed on the category's own CatKey so a balance field
// shows only where it makes sense, rather than adding a parallel category
// list of its own.
export type BalanceKey = "balance401k" | "balanceHsaFsa";
export const BALANCE_KEY_FOR: Partial<Record<CatKey, BalanceKey>> = {
  deduction401k: "balance401k",
  deductionHsaFsa: "balanceHsaFsa",
};

export const BEFORE_CATS: { key: CatKey; label: string }[] = [
  { key: "deduction401k", label: "401(k) / retirement" },
  { key: "deductionHealthInsurance", label: "Health / dental insurance" },
  { key: "deductionHsaFsa", label: "HSA / FSA" },
];

// Colors reuse the app's own chart palette (--jnpr-c1..c7, category-color.ts)
// so this reads as native rather than inventing a second palette.
export const AFTER_CATS: { key: CatKey; label: string; color: string }[] = [
  { key: "expenseRent", label: "Rent / mortgage", color: "var(--jnpr-c3)" },
  { key: "expenseLoanPayments", label: "Loan payments", color: "var(--jnpr-c4)" },
  { key: "expenseOtherEssentials", label: "Other essentials", color: "var(--jnpr-c2)" },
];

export const fmtMoney = (n: number) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
