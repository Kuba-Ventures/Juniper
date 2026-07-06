// Frontend mirror of the dialogue script metadata.
// The backend (api/_dialogue-scripts.ts) holds the full system prompts;
// the frontend needs the step names + skip rules to render progress, and —
// for structured (tap-first) steps — the full input spec to render the
// control locally without an LLM round-trip.

export type ClientDialogueContext = {
  has_partner?: boolean | null;
  is_partner?: boolean;
};

// Question text can depend on answers collected so far (e.g. "your" vs
// "your combined" income once we know whether there's a partner).
export type QuestionText = string | ((answers: Record<string, unknown>) => string);

export type ChoiceOption = {
  value: string | number | boolean;
  label: string;
  sublabel?: string;
  icon?: "user" | "users";
};

// Structured input descriptors. When a step carries one of these, the client
// renders the matching tap-first control and records the answer directly into
// `collected` — no call to /api/dialogue. `text` (and any step with no input)
// keeps the legacy open-ended chat + <STEP_COMPLETE> path.
export type ChoiceInput = {
  type: "choice";
  key: string;
  question: QuestionText;
  helper?: string;
  options: ChoiceOption[];
  multi?: boolean; // multi-select: no auto-advance, shows a Continue button
  // Extra keys to write alongside `key` when a value is chosen.
  also?: (value: string | number | boolean) => Record<string, unknown>;
};

export type MoneyInput = {
  type: "money";
  key: string;
  question: QuestionText;
  helper?: string;
  min: number;
  max: number;
  step: number;
  chips: number[];
  default: number;
  also?: (value: number) => Record<string, unknown>;
};

export type TimelineInput = {
  type: "timeline";
  key: string; // stores the chosen month-count (number)
  question: QuestionText;
  helper?: string;
  options: ChoiceOption[]; // option.value is a month count
  also?: (months: number) => Record<string, unknown>;
};

// Open-ended / sensitive question: keeps the LLM chat + <STEP_COMPLETE> path.
// `question` is shown as the screen heading before Juniper opens the topic.
export type TextInput = { type: "text"; question?: QuestionText; helper?: string };

export type StepInput = ChoiceInput | MoneyInput | TimelineInput | TextInput;

export type ClientStep = {
  id: string;
  name: string;
  input?: StepInput; // omit or {type:"text"} => legacy LLM chat step
  skipWhen?: (ctx: ClientDialogueContext) => boolean;
};

export type ClientScript = {
  domain: string;
  title: string;
  steps: ClientStep[];
};

// ── Helpers for structured Home Buying ────────────────────────────────────
// Convert a month-offset from today into a "YYYY-MM" target date string, the
// shape the synthesis prompt and PlanAlignment already expect for target_date.
function monthsToYearMonth(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Baby-planning target-year chips, anchored to the current year. Values are
// the actual year numbers (the `target_year` PlanAlignment compares).
function babyYearOptions(): ChoiceOption[] {
  const y = new Date().getFullYear();
  return [
    { value: y, label: "This year" },
    { value: y + 1, label: "Next year" },
    { value: y + 2, label: "In 2 years" },
    { value: y + 3, label: "3+ years" },
  ];
}

const HOME_BUYING: ClientScript = {
  domain: "home-buying",
  title: "Home Buying",
  steps: [
    {
      id: "who",
      name: "Who's buying",
      skipWhen: (ctx) => ctx.is_partner === true,
      input: {
        type: "choice",
        key: "has_partner",
        question: "Who's buying this home?",
        options: [
          { value: false, label: "Just me", icon: "user" },
          { value: true, label: "Me + my partner", icon: "users" },
        ],
      },
    },
    {
      id: "price",
      name: "Target price",
      input: {
        type: "money",
        key: "target_home_price",
        question: "What's your target home price?",
        min: 200_000,
        max: 5_000_000,
        step: 50_000,
        default: 1_000_000,
        chips: [500_000, 1_000_000, 2_000_000],
      },
    },
    {
      id: "timeline",
      name: "Timeline",
      input: {
        type: "timeline",
        key: "target_months",
        question: "When do you want to buy?",
        options: [
          { value: 12, label: "Within a year" },
          { value: 24, label: "1–2 years" },
          { value: 54, label: "3–5 years" },
          { value: 84, label: "5+ years" },
        ],
        also: (months) => ({ target_date: monthsToYearMonth(months) }),
      },
    },
    {
      id: "saved",
      name: "Saved so far",
      input: {
        type: "money",
        key: "total_savings",
        question: "Saved for a down payment so far?",
        min: 0,
        max: 1_000_000,
        step: 5_000,
        default: 50_000,
        chips: [0, 50_000, 100_000],
      },
    },
    {
      id: "income",
      name: "Income",
      input: {
        type: "money",
        key: "annual_income",
        question: (a) =>
          a.has_partner === true ? "Your combined yearly income?" : "Your yearly income?",
        min: 50_000,
        max: 1_000_000,
        step: 10_000,
        default: 200_000,
        chips: [150_000, 250_000, 400_000],
        // Synthesis and the profile model reason in monthly terms.
        also: (v) => ({ monthly_income: Math.round(v / 12) }),
      },
    },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const COMBINING_FINANCES: ClientScript = {
  domain: "combining-finances",
  title: "Combining Finances",
  steps: [
    {
      id: "who",
      name: "Who's planning this",
      skipWhen: (ctx) => ctx.is_partner === true,
      input: {
        type: "choice",
        key: "has_partner",
        question: "Who's combining finances here?",
        options: [
          { value: false, label: "Just me", icon: "user" },
          { value: true, label: "Me + my partner", icon: "users" },
        ],
      },
    },
    {
      id: "account_architecture",
      name: "Account architecture",
      input: {
        type: "choice",
        key: "accounts_approach",
        question: "How do you want to hold your money?",
        options: [
          { value: "joint", label: "Fully joint", sublabel: "Everything shared" },
          { value: "separate", label: "Fully separate", sublabel: "Each keeps their own" },
          { value: "hybrid", label: "Yours, mine & ours", sublabel: "Joint + individual" },
        ],
      },
    },
    {
      id: "bills_split",
      name: "Splitting shared bills",
      input: {
        type: "choice",
        key: "bills_split_method",
        question: "How should shared bills be split?",
        options: [
          { value: "equal", label: "50 / 50" },
          { value: "income-proportional", label: "By income" },
          { value: "single", label: "One of us covers most" },
        ],
      },
    },
    {
      id: "emergency_fund",
      name: "Emergency fund",
      input: {
        type: "choice",
        key: "emergency_fund_months",
        question: "How big an emergency fund feels safe?",
        options: [
          { value: 3, label: "3 months" },
          { value: 6, label: "6 months" },
          { value: 9, label: "9 months" },
          { value: 12, label: "12 months" },
        ],
      },
    },
    {
      id: "monthly_savings",
      name: "Monthly savings",
      input: {
        type: "money",
        key: "monthly_savings",
        question: "How much can you save together each month?",
        min: 0,
        max: 50_000,
        step: 250,
        default: 2_000,
        chips: [1_000, 2_500, 5_000],
      },
    },
    {
      id: "investments",
      name: "Investment priorities",
      input: {
        type: "choice",
        key: "investment_priority",
        question: "What comes first when you invest?",
        options: [
          { value: "retirement-first", label: "Retirement first" },
          { value: "balanced", label: "A balance" },
          { value: "brokerage-first", label: "Flexibility first" },
        ],
      },
    },
    {
      id: "solo_spend",
      name: "Solo spending",
      input: {
        type: "money",
        key: "solo_spend_limit",
        question: "How much can each of you spend solo, no check-in?",
        min: 0,
        max: 5_000,
        step: 50,
        default: 300,
        chips: [100, 300, 500],
      },
    },
    {
      id: "big_purchase",
      name: "Discuss-first threshold",
      input: {
        type: "money",
        key: "big_purchase_threshold",
        question: "Above what amount do you talk before buying?",
        min: 0,
        max: 25_000,
        step: 100,
        default: 500,
        chips: [250, 500, 1_000],
      },
    },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const DEBT_PAYDOWN: ClientScript = {
  domain: "debt-paydown",
  title: "Debt Paydown",
  steps: [
    {
      id: "who",
      name: "Who's planning this",
      skipWhen: (ctx) => ctx.is_partner === true,
      input: {
        type: "choice",
        key: "has_partner",
        question: "Who's tackling this debt?",
        options: [
          { value: false, label: "Just me", icon: "user" },
          { value: true, label: "Me + my partner", icon: "users" },
        ],
      },
    },
    {
      id: "total_debt",
      name: "Total debt",
      input: {
        type: "money",
        key: "total_debt",
        question: "How much debt are you paying off?",
        min: 0,
        max: 500_000,
        step: 1_000,
        default: 25_000,
        chips: [10_000, 25_000, 50_000],
      },
    },
    {
      id: "monthly_target",
      name: "Monthly payment",
      input: {
        type: "money",
        key: "monthly_target",
        question: "How much can you put toward it each month?",
        min: 0,
        max: 20_000,
        step: 50,
        default: 1_000,
        chips: [500, 1_000, 2_000],
      },
    },
    {
      id: "method",
      name: "Payoff strategy",
      input: {
        type: "choice",
        key: "payoff_method",
        question: "Which payoff strategy fits you?",
        options: [
          { value: "avalanche", label: "Avalanche", sublabel: "Highest interest first" },
          { value: "snowball", label: "Snowball", sublabel: "Smallest balance first" },
        ],
        // prioritize_high_interest is what PlanAlignment compares.
        also: (v) => ({ prioritize_high_interest: v === "avalanche" }),
      },
    },
    {
      id: "consolidation",
      name: "Refi or consolidate",
      input: {
        type: "choice",
        key: "consider_consolidation",
        question: "Want to explore consolidating or refinancing?",
        helper:
          "That means rolling your balances into one new loan or card, often at a lower rate, to simplify payments and cut interest.",
        options: [
          { value: "yes", label: "Yes, explore it" },
          { value: "no", label: "No, keep as-is" },
        ],
      },
    },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const BABY_PLANNING: ClientScript = {
  domain: "baby-planning",
  title: "Baby Planning",
  steps: [
    {
      id: "who",
      name: "Who's planning this",
      skipWhen: (ctx) => ctx.is_partner === true,
      input: {
        type: "choice",
        key: "has_partner",
        question: "Who's planning for this baby?",
        options: [
          { value: false, label: "Just me", icon: "user" },
          { value: true, label: "Me + my partner", icon: "users" },
        ],
      },
    },
    {
      id: "target_year",
      name: "Timeline",
      input: {
        type: "choice",
        key: "target_year",
        question: "When do you hope to welcome a baby?",
        options: babyYearOptions(),
      },
    },
    {
      id: "childcare",
      name: "Childcare strategy",
      input: {
        type: "choice",
        key: "childcare_preference",
        question: "What's your childcare plan?",
        options: [
          { value: "daycare", label: "Daycare" },
          { value: "nanny", label: "Nanny" },
          { value: "family", label: "Family or stay-home" },
        ],
      },
    },
    {
      id: "costs",
      name: "Monthly cost",
      input: {
        type: "money",
        key: "monthly_cost_estimate",
        question: "Estimated monthly childcare cost?",
        min: 0,
        max: 15_000,
        step: 100,
        default: 2_000,
        chips: [1_500, 2_500, 4_000],
      },
    },
    {
      id: "savings_goal",
      name: "Baby fund",
      input: {
        type: "money",
        key: "savings_goal",
        question: "One-time savings goal before the baby arrives?",
        min: 0,
        max: 100_000,
        step: 1_000,
        default: 10_000,
        chips: [5_000, 10_000, 20_000],
      },
    },
    {
      id: "college_fund",
      name: "College fund start",
      input: {
        type: "choice",
        key: "college_fund_start",
        question: "When do you want to start a college fund?",
        options: [
          { value: "immediately", label: "Right away" },
          { value: "later", label: "After the baby fund" },
          { value: "no", label: "Not yet" },
        ],
      },
    },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const PRENUP: ClientScript = {
  domain: "prenup",
  title: "Prenup & Legal",
  steps: [
    {
      id: "who",
      name: "Who's planning this",
      skipWhen: (ctx) => ctx.is_partner === true,
      input: {
        type: "choice",
        key: "has_partner",
        question: "Who's working through this prenup?",
        options: [
          { value: false, label: "Just me", icon: "user" },
          { value: true, label: "Me + my partner", icon: "users" },
        ],
      },
    },
    {
      id: "property_treatment",
      name: "Property treatment",
      input: {
        type: "choice",
        key: "property_treatment",
        question: "How should property be treated in a marriage?",
        options: [
          { value: "community", label: "Shared", sublabel: "Community property" },
          { value: "separate", label: "Kept separate", sublabel: "Each keeps their own" },
          { value: "hybrid", label: "A mix", sublabel: "Some shared, some separate" },
        ],
      },
    },
    {
      id: "inheritances",
      name: "Inheritances & gifts",
      input: {
        type: "choice",
        key: "inheritance_treatment",
        question: "How should inheritances and gifts be treated?",
        options: [
          { value: "separate", label: "Stay separate" },
          { value: "shared", label: "Become shared" },
          { value: "depends", label: "Depends on the gift" },
        ],
      },
    },
    {
      id: "support_stance",
      name: "Spousal support stance",
      input: {
        type: "choice",
        key: "support_stance",
        question: "What's your stance on spousal support?",
        options: [
          { value: "waive", label: "Waive it" },
          { value: "keep", label: "Keep support rights" },
          { value: "formula", label: "Use a formula" },
        ],
      },
    },
    {
      id: "carveouts",
      name: "Carveouts",
      // Sensitive and specific: kept open-ended so people can name the assets
      // that actually matter to them (a business, a family property, etc.).
      input: {
        type: "text",
        question: "Anything either of you wants kept clearly separate?",
        helper: "A business, a family home, an heirloom. Say as much or as little as you like.",
      },
    },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const SCRIPTS: Record<string, ClientScript> = {
  "home-buying": HOME_BUYING,
  "combining-finances": COMBINING_FINANCES,
  "debt-paydown": DEBT_PAYDOWN,
  "baby-planning": BABY_PLANNING,
  "prenup": PRENUP,
};

export function getClientScript(domain: string): ClientScript | null {
  return SCRIPTS[domain] ?? null;
}

// A structured step renders a tap-first control locally (no LLM call).
export function isStructuredStep(step: ClientStep | undefined): boolean {
  return !!step?.input && step.input.type !== "text";
}

// An LLM step needs a /api/dialogue round-trip: legacy text steps, explicit
// `text` inputs, and the final synthesis step (which has no input).
export function isLlmStep(step: ClientStep | undefined): boolean {
  return !!step && !isStructuredStep(step);
}

// True when a script uses the new tap-first flow (any structured step).
export function scriptIsStructured(script: ClientScript): boolean {
  return script.steps.some((s) => isStructuredStep(s));
}

// Step indices accounting for skips. Returns the count of visible steps and
// the position (1-indexed) of stepIndex within them. Useful for "Step X of Y".
export function visibleProgress(
  script: ClientScript,
  stepIndex: number,
  ctx: ClientDialogueContext,
): { position: number; total: number } {
  let position = 0;
  let total = 0;
  for (let i = 0; i < script.steps.length; i++) {
    const skip = script.steps[i].skipWhen?.(ctx) ?? false;
    if (skip) continue;
    total += 1;
    if (i <= stepIndex) position = total;
  }
  return { position, total };
}

// How many questions remain to be answered from stepIndex onward, counting
// only visible, answerable steps (the synthesis step is not a question).
export function remainingQuestions(
  script: ClientScript,
  stepIndex: number,
  ctx: ClientDialogueContext,
): number {
  let remaining = 0;
  for (let i = stepIndex; i < script.steps.length; i++) {
    const step = script.steps[i];
    if (step.skipWhen?.(ctx)) continue;
    if (step.id === "synthesis") continue;
    remaining += 1;
  }
  return remaining;
}

// Advance step index by 1, skipping any disabled steps.
export function nextVisibleStepIndex(
  script: ClientScript,
  stepIndex: number,
  ctx: ClientDialogueContext,
): number | null {
  for (let i = stepIndex + 1; i < script.steps.length; i++) {
    if (script.steps[i].skipWhen?.(ctx)) continue;
    return i;
  }
  return null;
}
