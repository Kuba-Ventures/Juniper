import { z } from "zod";

export const calculatorSchema = z.object({
  useTakeHomePay: z.boolean().default(false),
  p1Income: z.coerce.number().min(0).default(75000),
  p2Income: z.coerce.number().min(0).default(65000),
  p1StudentDebt: z.coerce.number().min(0).default(35000),
  p1StudentDebtPayment: z.coerce.number().min(0).default(350),
  p2StudentDebt: z.coerce.number().min(0).default(28000),
  p2StudentDebtPayment: z.coerce.number().min(0).default(280),
  otherMonthlyDebt: z.coerce.number().min(0).default(0),

  housePrice: z.coerce.number().min(0).default(425000),
  downPayment: z.coerce.number().min(0).default(60000),
  interestRate: z.coerce.number().min(0).max(100).default(6.5),
  loanTermYears: z.coerce.number().min(1).max(100).default(30),
  annualPropertyTax: z.coerce.number().min(0).default(5100),
  annualInsurance: z.coerce.number().min(0).default(1200),
  monthlyHoa: z.coerce.number().min(0).default(0),

  scenarioBExtraPaydown: z.coerce.number().min(0).default(500),
  homeAppreciationRate: z.coerce.number().min(0).max(100).default(3.0),
  savingsGrowthRate: z.coerce.number().min(0).max(100).default(2.0),

  p1Contribution: z.coerce.number().min(0).default(30000),
  p2Contribution: z.coerce.number().min(0).default(30000),
});

export type CalculatorFormValues = z.infer<typeof calculatorSchema>;
