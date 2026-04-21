import { CalculatorFormValues } from "./schema";

export interface CalculationResults {
  // Current Scenario
  monthlyMortgage: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHousingCost: number;
  totalMonthlyDebt: number;
  grossMonthlyIncome: number;
  dti: number;
  monthlyBuffer: number;
  dtiCategory: "comfortable" | "tight" | "not_advisable";

  // Scenario B (Wait 2 years)
  bHousePrice: number;
  bTotalSavings: number;
  bDownPayment: number;
  bLoanAmount: number;
  bP1StudentDebt: number;
  bP2StudentDebt: number;
  bMonthlyMortgage: number;
  bMonthlyHousingCost: number;
  bTotalMonthlyDebt: number;
  bDti: number;
}

function calculateAmortization(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  if (annualRate <= 0) return principal / (years * 12);
  
  const r = (annualRate / 100) / 12;
  const n = years * 12;
  const top = r * Math.pow(1 + r, n);
  const bottom = Math.pow(1 + r, n) - 1;
  return principal * (top / bottom);
}

export function calculateResults(values: CalculatorFormValues): CalculationResults {
  // A: CURRENT SCENARIO
  const loanAmount = Math.max(0, values.housePrice - values.downPayment);
  const monthlyMortgage = calculateAmortization(loanAmount, values.interestRate, values.loanTermYears);
  
  const monthlyPropertyTax = values.annualPropertyTax / 12;
  const monthlyInsurance = values.annualInsurance / 12;
  const monthlyHousingCost = monthlyMortgage + monthlyPropertyTax + monthlyInsurance + values.monthlyHoa;
  
  const totalMonthlyDebt = values.p1StudentDebtPayment + values.p2StudentDebtPayment + values.otherMonthlyDebt + monthlyHousingCost;
  
  const monthlyIncome1 = values.useTakeHomePay ? values.p1Income : values.p1Income / 12;
  const monthlyIncome2 = values.useTakeHomePay ? values.p2Income : values.p2Income / 12;
  const grossMonthlyIncome = monthlyIncome1 + monthlyIncome2;
  
  const dti = grossMonthlyIncome > 0 ? (totalMonthlyDebt / grossMonthlyIncome) * 100 : 0;
  const monthlyBuffer = grossMonthlyIncome - totalMonthlyDebt;
  
  let dtiCategory: "comfortable" | "tight" | "not_advisable" = "comfortable";
  if (dti > 43) dtiCategory = "not_advisable";
  else if (dti >= 36) dtiCategory = "tight";

  // B: SCENARIO B (Wait 2 years)
  // House price appreciation
  const bHousePrice = values.housePrice * Math.pow(1 + (values.homeAppreciationRate / 100), 2);
  
  // Savings growth (assuming they invest the down payment for 2 years)
  // Add extra monthly paydown to savings or use it to reduce debt directly? 
  // Let's say extra paydown is put towards debt. The base down payment just grows.
  const bDownPayment = values.downPayment * Math.pow(1 + (values.savingsGrowthRate / 100), 2);
  
  // Debt paydown
  // 24 months of standard payments + extra paydown
  // Simplified: assume 100% goes to principal for student debt to keep it simple, or just a rough deduction.
  // Actually, we can just say total debt reduces by (payment + extra) * 24.
  const totalExtraPaydown24mo = values.scenarioBExtraPaydown * 24;
  const p1BasePaydown24mo = values.p1StudentDebtPayment * 24;
  const p2BasePaydown24mo = values.p2StudentDebtPayment * 24;

  // Let's proportionally reduce the debt balances
  const initialTotalDebt = values.p1StudentDebt + values.p2StudentDebt;
  let bP1StudentDebt = Math.max(0, values.p1StudentDebt - p1BasePaydown24mo);
  let bP2StudentDebt = Math.max(0, values.p2StudentDebt - p2BasePaydown24mo);
  
  if (initialTotalDebt > 0) {
    const p1Share = values.p1StudentDebt / initialTotalDebt;
    const p2Share = values.p2StudentDebt / initialTotalDebt;
    bP1StudentDebt = Math.max(0, bP1StudentDebt - totalExtraPaydown24mo * p1Share);
    bP2StudentDebt = Math.max(0, bP2StudentDebt - totalExtraPaydown24mo * p2Share);
  }

  const bLoanAmount = Math.max(0, bHousePrice - bDownPayment);
  const bMonthlyMortgage = calculateAmortization(bLoanAmount, values.interestRate, values.loanTermYears);
  
  // Property tax and insurance usually go up with house price, let's scale property tax
  const bMonthlyPropertyTax = (values.annualPropertyTax * Math.pow(1 + (values.homeAppreciationRate / 100), 2)) / 12;
  const bMonthlyHousingCost = bMonthlyMortgage + bMonthlyPropertyTax + monthlyInsurance + values.monthlyHoa;
  
  // Assuming student debt payments recalculate or stay same? Usually they stay same unless paid off.
  const bP1Payment = bP1StudentDebt > 0 ? values.p1StudentDebtPayment : 0;
  const bP2Payment = bP2StudentDebt > 0 ? values.p2StudentDebtPayment : 0;
  
  const bTotalMonthlyDebt = bP1Payment + bP2Payment + values.otherMonthlyDebt + bMonthlyHousingCost;
  
  const bDti = grossMonthlyIncome > 0 ? (bTotalMonthlyDebt / grossMonthlyIncome) * 100 : 0;

  return {
    monthlyMortgage,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHousingCost,
    totalMonthlyDebt,
    grossMonthlyIncome,
    dti,
    monthlyBuffer,
    dtiCategory,
    bHousePrice,
    bTotalSavings: bDownPayment,
    bDownPayment,
    bLoanAmount,
    bP1StudentDebt,
    bP2StudentDebt,
    bMonthlyMortgage,
    bMonthlyHousingCost,
    bTotalMonthlyDebt,
    bDti
  };
}
