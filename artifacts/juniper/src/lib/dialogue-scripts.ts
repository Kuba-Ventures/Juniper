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

export type TextInput = { type: "text" };

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
    { id: "partner", name: "Who's planning this", skipWhen: (ctx) => ctx.is_partner === true },
    { id: "current_setup", name: "How things look today" },
    { id: "account_architecture", name: "Account architecture" },
    { id: "bills_split", name: "Splitting shared bills" },
    { id: "emergency_fund", name: "Emergency fund" },
    { id: "investments", name: "Investment priorities" },
    { id: "discretionary", name: "Discretionary boundaries" },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const DEBT_PAYDOWN: ClientScript = {
  domain: "debt-paydown",
  title: "Debt Paydown",
  steps: [
    { id: "partner", name: "Who's planning this", skipWhen: (ctx) => ctx.is_partner === true },
    { id: "inventory", name: "Debt inventory" },
    { id: "method", name: "Method & monthly target" },
    { id: "consolidation", name: "Refi or consolidate" },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const BABY_PLANNING: ClientScript = {
  domain: "baby-planning",
  title: "Baby Planning",
  steps: [
    { id: "partner", name: "Who's planning this", skipWhen: (ctx) => ctx.is_partner === true },
    { id: "timeline", name: "Timeline" },
    { id: "leave", name: "Parental leave plan" },
    { id: "childcare", name: "Childcare strategy" },
    { id: "costs", name: "Cost picture" },
    { id: "college_fund", name: "College fund start" },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const PRENUP: ClientScript = {
  domain: "prenup",
  title: "Prenup & Legal",
  steps: [
    { id: "partner", name: "Who's planning this", skipWhen: (ctx) => ctx.is_partner === true },
    { id: "premarital_assets", name: "Premarital assets" },
    { id: "premarital_debts", name: "Premarital debts" },
    { id: "property_treatment", name: "Property treatment" },
    { id: "inheritances", name: "Inheritances & gifts" },
    { id: "support_stance", name: "Spousal support stance" },
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
