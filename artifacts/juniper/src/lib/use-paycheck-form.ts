import { useState } from "react";
import type { CatKey, PaycheckFields } from "@/lib/paycheck-fields";

// State + derived figures for editing a paycheck breakdown, shared by the
// dashboard nudge and the onboarding paycheck step so the two surfaces cannot
// disagree about what "take-home pay" adds up to.
export function usePaycheckForm(initial?: Partial<PaycheckFields>) {
  const [income, setIncome] = useState<number | undefined>(initial?.monthlyIncome);
  const [on, setOn] = useState<Record<CatKey, boolean>>({
    deduction401k: initial?.deduction401k != null,
    deductionHealthInsurance: initial?.deductionHealthInsurance != null,
    deductionHsaFsa: initial?.deductionHsaFsa != null,
    expenseRent: initial?.expenseRent != null,
    expenseLoanPayments: initial?.expenseLoanPayments != null,
    expenseOtherEssentials: initial?.expenseOtherEssentials != null,
  });
  const [amounts, setAmounts] = useState<Partial<Record<CatKey, number>>>({
    deduction401k: initial?.deduction401k,
    deductionHealthInsurance: initial?.deductionHealthInsurance,
    deductionHsaFsa: initial?.deductionHsaFsa,
    expenseRent: initial?.expenseRent,
    expenseLoanPayments: initial?.expenseLoanPayments,
    expenseOtherEssentials: initial?.expenseOtherEssentials,
  });

  const toggle = (key: CatKey) => setOn((o) => ({ ...o, [key]: !o[key] }));
  const setAmount = (key: CatKey, v: number | undefined) => setAmounts((a) => ({ ...a, [key]: v }));
  // Unchecking a category clears its value, so a stray typed number cannot
  // ride along into the save unnoticed.
  const val = (key: CatKey): number | undefined => (on[key] ? amounts[key] : undefined);

  const rent = val("expenseRent") ?? 0;
  const loans = val("expenseLoanPayments") ?? 0;
  const other = val("expenseOtherEssentials") ?? 0;
  const spent = rent + loans + other;
  const take = income ?? 0;
  const leftover = Math.max(0, take - spent);
  const barTotal = Math.max(take, spent, 1);

  const grossExtra =
    (val("deduction401k") ?? 0) + (val("deductionHealthInsurance") ?? 0) + (val("deductionHsaFsa") ?? 0);
  const showGross = grossExtra > 0 && income != null;

  // A blended total again, computed rather than typed, so the Score keeps
  // reading exactly the field it always has.
  const fields = (): PaycheckFields => ({
    monthlyIncome: income,
    monthlyExpenses: spent > 0 ? spent : undefined,
    deduction401k: val("deduction401k"),
    deductionHealthInsurance: val("deductionHealthInsurance"),
    deductionHsaFsa: val("deductionHsaFsa"),
    expenseRent: val("expenseRent"),
    expenseLoanPayments: val("expenseLoanPayments"),
    expenseOtherEssentials: val("expenseOtherEssentials"),
  });

  return {
    income,
    setIncome,
    on,
    toggle,
    amounts,
    setAmount,
    val,
    leftover,
    barTotal,
    grossExtra,
    showGross,
    fields,
  };
}

export type PaycheckFormState = ReturnType<typeof usePaycheckForm>;
