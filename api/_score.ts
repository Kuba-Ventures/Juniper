// The Juniper Score engine (Stage 4).
//
// A proprietary 0–100 financial-health score computed from the same money data
// the dashboard already assembles (Stage 3). Deliberately NOT a credit score, 
// the 300–850 credit number is just one of five factors here, not the hero.
//
// Pure and I/O-free on purpose: given a snapshot of inputs it returns the score,
// the per-factor breakdown, and a ranked list of "ways to improve", each tagged
// with the factor it came from. That makes it trivial to unit-test and lets both
// the read endpoint (/api/finances) and the history writer (/api/score/compute)
// share one source of truth. Tying a lever to one of the member's plans is a
// client concern precisely BECAUSE this stays I/O-free: it cannot read their
// plans, so it does not pretend to know them.

export interface ScoreInput {
  monthlyIncome: number;      // avg take-home per month
  monthlySpending: number;    // avg outflow per month
  cashReserves: number;       // liquid cash (depository balances)
  totalDebt: number;          // sum of debt balances (positive)
  totalAssets: number;        // cash + investments (positive)
  investmentBalance: number;  // investment / brokerage / retirement balances
  creditScore?: number;       // 300–850, if known
  creditUtilization?: number; // 0–1 revolving utilization, if known
}

export type FactorKey = "savings" | "emergency" | "debt" | "investing" | "credit";
export type FactorStatus = "strong" | "fair" | "weak";

export interface Factor {
  key: FactorKey;
  label: string;
  score: number;   // 0–100 sub-score
  weight: number;  // contribution weight (weights sum to 1)
  status: FactorStatus;
  detail: string;  // human-readable "where you stand"
}

export interface Improvement {
  factor: FactorKey;
  title: string;
  detail: string;
  potentialPts: number;   // ~how many Juniper-Score points this could add
  // No plan cross-link. This used to carry a plan icon name, which the Score
  // page resolved against a seeded demo plan list, so the payload effectively
  // told the client which stranger's plan to name. The factor key is the whole
  // handle the client needs: it maps `factor` onto the MEMBER'S own plans, which
  // only it can see (this file is I/O-free and never reads the plans table).
}

export type Band = "At risk" | "Building" | "Fair" | "Healthy" | "Excellent";

export interface ScoreResult {
  value: number;          // 0–100
  band: Band;
  factors: Factor[];
  improvements: Improvement[];
  lever: string;          // the single highest-leverage next step
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

// Weights sum to 1.0. Savings + emergency fund carry the most weight because
// they're the most actionable levers for the young-individual audience.
const WEIGHTS: Record<FactorKey, number> = {
  savings: 0.25,
  emergency: 0.25,
  debt: 0.2,
  investing: 0.15,
  credit: 0.15,
};

function statusOf(score: number): FactorStatus {
  if (score >= 75) return "strong";
  if (score >= 50) return "fair";
  return "weak";
}

export function bandOf(value: number): Band {
  if (value >= 80) return "Excellent";
  if (value >= 65) return "Healthy";
  if (value >= 50) return "Fair";
  if (value >= 35) return "Building";
  return "At risk";
}

// ── Per-factor sub-scores (each 0–100) ───────────────────────────────────────

// Savings rate = (income − spending) / income. 20%+ saved → full marks.
function savingsFactor(i: ScoreInput): Factor {
  const inc = Math.max(i.monthlyIncome, 0);
  const rate = inc > 0 ? (inc - i.monthlySpending) / inc : 0;
  const score = clamp((rate / 0.2) * 100);
  const pct = Math.round(rate * 100);
  return {
    key: "savings", label: "Savings rate", score: round(score), weight: WEIGHTS.savings,
    status: statusOf(score),
    detail: inc > 0
      ? `You're saving about ${pct}% of your income${pct >= 20 ? ", great pace" : pct >= 0 ? ", aim for 20%" : ", you're spending more than you earn"}.`
      : "Link income to measure your savings rate.",
  };
}

// Emergency fund = months of spending covered by liquid cash. 6 months → full.
function emergencyFactor(i: ScoreInput): Factor {
  const months = i.monthlySpending > 0 ? i.cashReserves / i.monthlySpending : 0;
  const score = clamp((months / 6) * 100);
  return {
    key: "emergency", label: "Emergency fund", score: round(score), weight: WEIGHTS.emergency,
    status: statusOf(score),
    detail: i.monthlySpending > 0
      ? `${months.toFixed(1)} months of expenses saved${months >= 6 ? ", fully covered" : ", target is 6 months"}.`
      : "Link spending to size your emergency fund.",
  };
}

// Debt load = total debt relative to annual income. ≤0.3× → full marks,
// ≥2× annual income → zero. (A young person with ~1× income in student loans
// lands mid-scale, not at the floor.)
function debtFactor(i: ScoreInput): Factor {
  const annualIncome = Math.max(i.monthlyIncome * 12, 0);
  if (i.totalDebt <= 0) {
    return { key: "debt", label: "Debt load", score: 100, weight: WEIGHTS.debt, status: "strong", detail: "No tracked debt, excellent." };
  }
  const dti = annualIncome > 0 ? i.totalDebt / annualIncome : 2;
  const score = clamp(((2.0 - dti) / (2.0 - 0.3)) * 100);
  return {
    key: "debt", label: "Debt load", score: round(score), weight: WEIGHTS.debt,
    status: statusOf(score),
    detail: annualIncome > 0
      ? `Your debt is about ${dti.toFixed(1)}× your annual income${dti <= 0.3 ? ", very manageable" : dti >= 1.5 ? ", a heavy load" : ", moderate"}.`
      : "Link income to weigh your debt load.",
  };
}

// Investing pace = investment balance relative to annual income. 1× → full.
// A rough young-saver proxy for retirement pace (no reliable age input yet).
function investingFactor(i: ScoreInput): Factor {
  const annualIncome = Math.max(i.monthlyIncome * 12, 0);
  const ratio = annualIncome > 0 ? i.investmentBalance / annualIncome : (i.investmentBalance > 0 ? 1 : 0);
  const score = clamp(ratio * 100);
  return {
    key: "investing", label: "Investing pace", score: round(score), weight: WEIGHTS.investing,
    status: statusOf(score),
    detail: annualIncome > 0
      ? `You've invested about ${ratio.toFixed(1)}× your annual income${ratio >= 1 ? ", ahead of pace" : ", keep contributing"}.`
      : "Link investments to track your pace.",
  };
}

// Credit health from the credit score when known (300–850 → 0–100), else from
// revolving utilization, else a neutral placeholder.
function creditFactor(i: ScoreInput): Factor {
  if (typeof i.creditScore === "number") {
    const score = clamp(((i.creditScore - 300) / 550) * 100);
    return {
      key: "credit", label: "Credit health", score: round(score), weight: WEIGHTS.credit,
      status: statusOf(score),
      detail: `Credit score ${Math.round(i.creditScore)}, ${i.creditScore >= 740 ? "excellent" : i.creditScore >= 670 ? "good" : "room to grow"}.`,
    };
  }
  if (typeof i.creditUtilization === "number") {
    const util = i.creditUtilization;
    const score = clamp(((0.5 - util) / 0.4) * 100);
    return {
      key: "credit", label: "Credit health", score: round(score), weight: WEIGHTS.credit,
      status: statusOf(score),
      detail: `Using ${Math.round(util * 100)}% of your credit limits${util > 0.3 ? ", aim under 30%" : ", nicely under 30%"}.`,
    };
  }
  return { key: "credit", label: "Credit health", score: 70, weight: WEIGHTS.credit, status: "fair", detail: "Connect a credit card to track credit health." };
}

// ── Improvement templates ────────────────────────────────────────────────────
// Each below-target factor becomes a ranked next step. Potential points ≈ the
// weighted headroom left in that factor.
// Deliberately just words: the title, the detail, and the factor key that
// carries them. Deciding which plan a lever belongs to needs the member's plans,
// which this file cannot see and should not guess at, so that decision lives on
// the Score page (see FACTOR_ROUTES in src/pages/app/score.tsx) where the real
// plans are in hand.
const TEMPLATES: Record<FactorKey, { title: string; detail: string }> = {
  emergency: { title: "Build your emergency fund", detail: "Aim for 6 months of expenses in an accessible high-yield account." },
  savings: { title: "Raise your savings rate", detail: "Trim a category or automate a transfer to save closer to 20% of income." },
  debt: { title: "Pay down high-interest debt", detail: "Target the highest-APR balance first to lighten your debt load." },
  investing: { title: "Invest more consistently", detail: "Increase automatic contributions to keep your investing pace on track." },
  credit: { title: "Improve your credit health", detail: "Keep card utilization under 30% and payments on time to lift your score." },
};

export function computeScore(input: ScoreInput): ScoreResult {
  const factors = [
    savingsFactor(input),
    emergencyFactor(input),
    debtFactor(input),
    investingFactor(input),
    creditFactor(input),
  ];

  const value = round(factors.reduce((a, f) => a + f.weight * f.score, 0));

  const improvements: Improvement[] = factors
    .filter((f) => f.score < 80)
    .map((f) => {
      const t = TEMPLATES[f.key];
      return {
        factor: f.key,
        title: t.title,
        detail: t.detail,
        potentialPts: Math.max(1, round(f.weight * (100 - f.score))),
      };
    })
    .sort((a, b) => b.potentialPts - a.potentialPts);

  const lever = improvements[0]?.title.toLowerCase() ?? "keep up your strong habits";

  return { value, band: bandOf(value), factors, improvements, lever };
}
