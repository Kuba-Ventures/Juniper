// Frontend mirror of the dialogue script metadata.
// The backend (api/_dialogue-scripts.ts) holds the full system prompts;
// the frontend just needs the step names + skip rules to render progress.

export type ClientDialogueContext = {
  has_partner?: boolean | null;
  is_partner?: boolean;
};

export type ClientStep = {
  id: string;
  name: string;
  skipWhen?: (ctx: ClientDialogueContext) => boolean;
};

export type ClientScript = {
  domain: string;
  title: string;
  steps: ClientStep[];
};

const HOME_BUYING: ClientScript = {
  domain: "home-buying",
  title: "Home Buying",
  steps: [
    { id: "partner", name: "Who's planning this", skipWhen: (ctx) => ctx.is_partner === true },
    { id: "goal", name: "Goal & timeline" },
    { id: "finances", name: "Current finances" },
    { id: "downpayment", name: "Down payment plan" },
    { id: "debt", name: "Debt strategy" },
    { id: "strategies", name: "Affordability strategies" },
    { id: "mortgage_basics", name: "Mortgage basics" },
    { id: "legal_tax", name: "Legal & tax", skipWhen: (ctx) => ctx.has_partner !== true },
    { id: "synthesis", name: "Your plan", skipWhen: (ctx) => ctx.is_partner === true },
  ],
};

const SCRIPTS: Record<string, ClientScript> = {
  "home-buying": HOME_BUYING,
};

export function getClientScript(domain: string): ClientScript | null {
  return SCRIPTS[domain] ?? null;
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

// Advance step index by N (default 1), skipping any disabled steps.
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
