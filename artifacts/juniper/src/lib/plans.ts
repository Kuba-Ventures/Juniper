import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

// The three framings a plan can take. A plan's shape decides how its numbers
// are read (saving up vs paying down) and which icon it gets, so it belongs with
// the plan data rather than the card that renders it.
export type PlanShape = "save" | "buy" | "payoff";

// The palette tokens a member may pick from, straight out of juniper.css. Kept
// as a literal union so a stored value that is not one of these (hand-edited
// row, older client) fails the guard and falls back to the deterministic default
// instead of emitting `background: var(--whatever)`.
export type PlanColor =
  | "--jnpr-c1" | "--jnpr-c2" | "--jnpr-c3" | "--jnpr-c4" | "--jnpr-c5" | "--jnpr-c6" | "--jnpr-c7";

export const PLAN_COLORS: PlanColor[] = [
  "--jnpr-c1", "--jnpr-c2", "--jnpr-c3", "--jnpr-c4", "--jnpr-c5", "--jnpr-c6", "--jnpr-c7",
];

// `goal` is already JSONB and api/plans.ts passes it through untouched, so every
// field this stage adds (name, shape, color, the plan's own numbers) rides inside
// it. No migration, and rows written before these fields existed simply lack
// them: read them through the helpers below, never directly.
export type PlanGoal = {
  headline: string;
  summary?: string;
  home_type?: string;
  target_value?: number;
  target_date?: string;
  // Added by the Plans page. The member's display name for the plan, kept apart
  // from `domain` so renaming a plan does not change its primary key.
  name?: string;
  shape?: PlanShape;
  color?: PlanColor;
  current_value?: number;
  monthly_contribution?: number;
  rate?: number; // annual percentage on a payoff balance, e.g. 22.9
  [k: string]: unknown;
};

export type PlanKpi = {
  label: string;
  current: number;
  target: number;
  unit: string;
};

export type PlanMilestone = {
  label: string;
  target_value: number;
  current_value: number;
  completed_at: string | null;
};

export type PlanNextAction = {
  label: string;
  completed: boolean;
  note?: string; // user-entered note (confirmation #, account name, etc.)
};

// A single debt the user lists on a Debt Paydown plan. Stored (as an array)
// in current_state.debts, no table/migration. `apr` is a percentage (e.g. 22).
export type DebtItem = {
  name: string;
  balance: number;
  apr: number;
};

export type DialogueTurn = {
  role: "user" | "assistant";
  content: string;
  step_index?: number;
  step_complete_data?: Record<string, unknown>;
};

export type PlanChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type PartnerDialogueStatus = "not_started" | "in_progress" | "completed";

export type Plan = {
  id: string;
  user_id: string;
  domain: string;
  status: "in_progress" | "completed";
  has_partner: boolean | null;
  partner_first_name: string | null;
  goal: PlanGoal | null;
  current_state: Record<string, unknown> | null;
  milestones: PlanMilestone[];
  kpis: PlanKpi[];
  next_actions: PlanNextAction[];
  dialogue_history: DialogueTurn[];
  plan_chat_history: PlanChatTurn[];
  current_step_index: number;
  partner_invite_status: "none" | "invited" | "accepted" | "declined";
  partner_user_id: string | null;
  partner_collected: Record<string, unknown>;
  partner_dialogue_history: DialogueTurn[];
  partner_current_step_index: number;
  partner_dialogue_status: PartnerDialogueStatus;
  invite_token: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanWriteBody = Partial<
  Pick<
    Plan,
    | "domain"
    | "status"
    | "has_partner"
    | "partner_first_name"
    | "goal"
    | "current_state"
    | "milestones"
    | "kpis"
    | "next_actions"
    | "dialogue_history"
    | "plan_chat_history"
    | "current_step_index"
    | "partner_invite_status"
    | "partner_collected"
    | "partner_dialogue_history"
    | "partner_current_step_index"
    | "partner_dialogue_status"
  >
> & { domain: string };

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function fetchPlans(): Promise<Plan[]> {
  const res = await authedFetch("/api/plans");
  if (!res.ok) return [];
  const data = (await res.json()) as Plan[] | null;
  return Array.isArray(data) ? data : [];
}

// Testing helper: delete every plan the current user owns. Returns true on
// success. Plans where they're only a partner are left untouched (server-side).
export async function deleteAllPlans(): Promise<boolean> {
  try {
    const res = await authedFetch("/api/plans", { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPlan(domain: string): Promise<Plan | null> {
  const res = await authedFetch(`/api/plans?domain=${encodeURIComponent(domain)}`);
  if (!res.ok) return null;
  return (await res.json()) as Plan | null;
}

export async function savePlan(body: PlanWriteBody): Promise<Plan | null> {
  let res: Response;
  try {
    res = await authedFetch("/api/plans", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Juniper] savePlan fetch threw:", err);
    return null;
  }
  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.error(`[Juniper] savePlan failed: ${res.status} ${res.statusText}, body:`, text);
    return null;
  }
  return (await res.json()) as Plan | null;
}

// Delete a single plan the caller owns, keyed by domain. Returns true on
// success. The bare DELETE above wipes every plan, which is not what a member
// removing one goal means.
export async function deletePlan(domain: string): Promise<boolean> {
  try {
    const res = await authedFetch(`/api/plans?domain=${encodeURIComponent(domain)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Reading a plan: shape, color, title, numbers.
 *
 * Every helper below has to survive a row written before this stage: a
 * free-text `domain` we have never seen and a `goal` with none of the new
 * fields. That is the member's own "Nomad" plan, so it is the case these are
 * built around, not an edge case bolted on after.
 * ------------------------------------------------------------------ */

// Keyword -> shape. A HEURISTIC that only ever picks a DEFAULT: it seeds the
// shape control when a plan is created, and infers a shape for rows that predate
// `goal.shape` so they render sensibly with no backfill. An explicit
// `goal.shape` always wins, and the member can change it in one tap. Keep this
// table small and in this one place: growing it does not make the guess "right",
// it just moves which plans start on the wrong default.
const SHAPE_KEYWORDS: Array<{ shape: PlanShape; words: string[] }> = [
  // Checked in order, so the more specific framings go first: "pay off the car
  // loan" is a payoff, not a purchase, even though it says car.
  { shape: "payoff", words: ["loan", "debt", "card", "payoff", "paydown", "credit", "owe"] },
  { shape: "buy", words: ["home", "house", "property", "condo", "mortgage", "car", "vehicle", "buy"] },
  { shape: "save", words: ["nomad", "travel", "trip", "wedding", "baby", "family", "fund", "emergency", "retire", "save", "saving", "vacation"] },
];

export function suggestShape(...text: Array<string | null | undefined>): PlanShape {
  const hay = text.filter(Boolean).join(" ").toLowerCase();
  for (const { shape, words } of SHAPE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return shape;
  }
  // Saving toward something is the most common plan and the least wrong guess:
  // it asks for a target and a contribution, which any goal can answer.
  return "save";
}

const isShape = (v: unknown): v is PlanShape => v === "save" || v === "buy" || v === "payoff";

export function planShape(plan: Plan): PlanShape {
  const stored = plan.goal?.shape;
  if (isShape(stored)) return stored;
  return suggestShape(plan.goal?.name, plan.goal?.headline, plan.domain);
}

// Small stable string hash (FNV-1a). Only used to spread default colors.
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The member's pick when they made one, otherwise a default derived from
// `domain`. Deriving it (rather than picking at random or by list position)
// means a plan keeps the same color across reloads, devices, and re-orderings,
// with nothing stored.
export function planColor(plan: Plan): PlanColor {
  const stored = plan.goal?.color;
  if (typeof stored === "string" && (PLAN_COLORS as string[]).includes(stored)) {
    return stored as PlanColor;
  }
  return PLAN_COLORS[hashString(plan.domain) % PLAN_COLORS.length];
}

// The icon a shape implies. Members cannot pick an icon (deliberately: shape and
// color are the only two knobs), so this mapping is the whole story.
export const SHAPE_ICON: Record<PlanShape, string> = {
  save: "target",
  buy: "home",
  payoff: "debt",
};

// Readable labels for the five scripted domains, which are slugs the member
// never typed. Anything else is free text they DID type, so it is de-slugified
// rather than looked up: "nomad" -> "Nomad", "new-car-fund" -> "New car fund".
const DOMAIN_TITLES: Record<string, string> = {
  "home-buying": "Home buying",
  "combining-finances": "Combining finances",
  "debt-paydown": "Debt paydown",
  "baby-planning": "Baby planning",
  prenup: "Prenup and legal",
};

function titleFromSlug(slug: string): string {
  const words = slug.replace(/[_-]+/g, " ").trim();
  if (!words) return "Untitled plan";
  return words[0].toUpperCase() + words.slice(1);
}

export function planTitle(plan: Plan): string {
  const name = plan.goal?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return DOMAIN_TITLES[plan.domain] ?? titleFromSlug(plan.domain);
}

// Turn a member-typed plan name into a domain slug. `domain` is the plan's key
// alongside user_id, so it is set once at creation and never changes: renaming a
// plan rewrites `goal.name` and leaves the row where it is.
export function domainFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `plan-${Date.now()}`;
}

// A domain not already taken by one of `existing`. POST /api/plans upserts by
// (user_id, domain), so without this a second plan named the same thing would
// silently overwrite the first instead of being created.
export function uniqueDomain(name: string, existing: Plan[]): string {
  const base = domainFromName(name);
  const taken = new Set(existing.map((p) => p.domain));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export type PlanNumbers = {
  // For save/buy: saved so far and the target. For payoff: paid off so far and
  // the original balance, so `target - current` is what is still owed and the
  // same progress bar works for all three shapes.
  current: number;
  target: number;
  monthly: number | null;
  targetDate: string | null;
  rate: number | null; // annual percentage, payoff shapes only
};

// Read a plan's numbers, newest convention first, so a plan written by the
// Plans page and one written by the dialogue synthesis both come back usable.
export function planNumbers(plan: Plan): PlanNumbers {
  const goal = plan.goal ?? ({} as PlanGoal);
  const collected = (plan.current_state?.collected as Record<string, unknown>) ?? {};

  // Money KPI as the fallback for legacy rows: the synthesis writes progress
  // there, not into `goal`. Take the first one with a real target.
  const moneyKpi = (plan.kpis ?? []).find((k) => num(k.target) != null && k.target > 0) ?? null;

  const target = num(goal.target_value) ?? num(moneyKpi?.target) ?? 0;
  const current = num(goal.current_value) ?? num(moneyKpi?.current) ?? 0;
  const monthly =
    num(goal.monthly_contribution) ?? num(collected.monthly_contribution);

  const targetDate =
    typeof goal.target_date === "string" && goal.target_date
      ? goal.target_date
      : typeof collected.target_date === "string" && collected.target_date
        ? (collected.target_date as string)
        : null;

  // Rate: the member's own figure, else blended across any debts they listed on
  // the plan (the debt-list builder writes current_state.debts).
  let rate = num(goal.rate);
  if (rate == null) {
    const debts = Array.isArray(plan.current_state?.debts)
      ? (plan.current_state?.debts as DebtItem[])
      : [];
    let bal = 0;
    let weighted = 0;
    for (const d of debts) {
      const b = num(d.balance);
      if (b == null || b <= 0) continue;
      bal += b;
      weighted += b * (num(d.apr) ?? 0);
    }
    if (bal > 0) rate = weighted / bal;
  }

  return { current, target, monthly, targetDate, rate };
}

// Months to close a `remaining` gap at `monthly` a month, with `annualRate`
// (a percentage) compounding on the gap. Rate 0 is the honest default for
// saving: we do not know what yield the member's cash earns, so we do not
// invent one. Null when the math does not resolve: nothing to pay, no payment,
// or interest outrunning the payment (a balance that never clears).
export function monthsToClose(
  remaining: number,
  monthly: number | null,
  annualRate = 0,
): number | null {
  if (remaining <= 0) return 0;
  if (monthly == null || monthly <= 0) return null;
  const r = annualRate > 0 ? annualRate / 100 / 12 : 0;
  if (r === 0) return Math.ceil(remaining / monthly);
  if (monthly <= remaining * r) return null;
  const months = Math.log(monthly / (monthly - remaining * r)) / Math.log(1 + r);
  return Number.isFinite(months) ? Math.ceil(months) : null;
}

// "Mar 2027" from a month offset, for a date we derived rather than one the
// member set.
export function monthLabelFromNow(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// "2028-06" (what the dialogue scripts store) or anything Date can parse, shown
// the same way. Falls through to the raw string so a member-typed "next spring"
// is displayed rather than swallowed.
export function formatTargetDate(raw: string): string {
  const ym = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (ym) {
    const d = new Date(Number(ym[1]), Number(ym[2]) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(raw)) {
    return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * The shared read hook.
 * ------------------------------------------------------------------ */

export type MemberPlans = {
  plans: Plan[];
  loading: boolean;
  /** Re-read from the server. */
  refresh: () => void;
  /** Fold a saved plan into the list without a round-trip. */
  upsertLocal: (plan: Plan) => void;
  /** Drop a deleted plan from the list without a round-trip. */
  removeLocal: (domain: string) => void;
};

// One place both the Plans page and Overview's "Your plans" card read the
// member's real plans from, so the two surfaces can never disagree about what
// exists. They are separate routes and never mounted together, so this is a hook
// rather than a context: the point is a single implementation, not a single
// fetch in one render pass.
export function useMemberPlans(): MemberPlans {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPlans().then((rows) => {
      if (cancelled) return;
      setPlans(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const upsertLocal = useCallback((plan: Plan) => {
    setPlans((cur) => {
      const i = cur.findIndex((p) => p.domain === plan.domain);
      if (i === -1) return [plan, ...cur];
      const next = [...cur];
      next[i] = plan;
      return next;
    });
  }, []);

  const removeLocal = useCallback((domain: string) => {
    setPlans((cur) => cur.filter((p) => p.domain !== domain));
  }, []);

  return { plans, loading, refresh, upsertLocal, removeLocal };
}

/* ------------------------------------------------------------------ *
 * Signup goals that are not plans yet.
 *
 * Lives here rather than on the Plans page because two surfaces answer the
 * same question now: Plans renders each one as an unstarted card, and the
 * Overview's "Your plans" card lists them under the real ones. A second copy
 * of "is this goal already a plan" would drift, and the two surfaces would
 * disagree about whether a member has anything.
 * ------------------------------------------------------------------ */

export type GoalRoute = {
  // Plan domains that ALREADY cover this goal, so we never offer a duplicate.
  // The seven presets overlap the five scripted plan domains and this page's
  // own templates under different words: a member who built the scripted
  // `home-buying` plan has answered "Buy a home", and slug equality alone would
  // miss that and offer them a second one. Listed explicitly rather than guessed
  // by keyword, because a wrong guess here either hides a goal the member still
  // wants or duplicates a plan they already have.
  domains: string[];
  // The create-modal template to open. A template carries an explicit shape,
  // color and real-balance prefill, all better signals than a keyword scan of
  // the goal text (same reasoning as CreateForm's `shapePinned`).
  template?: string;
  // An explicit shape for a preset with no template, where `suggestShape` would
  // otherwise fall through to its "save" default and start the member on the
  // wrong framing.
  shape?: PlanShape;
};

export const GOAL_ROUTES: Record<string, GoalRoute> = {
  "buy-a-home": { domains: ["home-buying"], template: "Buy a home" },
  "pay-off-debt": { domains: ["debt-paydown"], template: "Pay off debt" },
  "build-an-emergency-fund": { domains: ["emergency-fund"], template: "Emergency fund" },
  "save-for-a-family": { domains: ["baby-planning", "baby-and-family"], template: "Baby and family" },
  "invest-for-retirement": { domains: [], template: "Invest for retirement" },
  // No template and no scripted domain. "Plan a big purchase" contains none of
  // the keywords in `suggestShape`'s buy list, so it needs the shape stated here
  // rather than a new keyword added to a table the whole app reads.
  "plan-a-big-purchase": { domains: [], shape: "buy" },
  "increase-my-income": { domains: [] },
};

// Whether a goal is already represented by a plan. Two ways to match, both
// through Stage 3's helpers so this cannot drift from how plans are named and
// keyed: the goal's slug against the plan's `domain` (which is `domainFromName`
// of whatever it was created from), and against the slug of the plan's current
// title (which catches a renamed plan, and a plan whose key got a `-2` suffix
// from `uniqueDomain`).
export function isAlreadyPlanned(goal: string, plans: Plan[]): boolean {
  const slug = domainFromName(goal);
  const claimed = new Set<string>([slug, ...(GOAL_ROUTES[slug]?.domains ?? [])]);
  return plans.some((p) => claimed.has(p.domain) || claimed.has(domainFromName(planTitle(p))));
}


export type UnplannedGoal = { goal: string; color: PlanColor };

// The member's signup goals that no plan covers yet, deduped on slug and in the
// order they were picked. Colour is assigned by list position for the same
// reason offerFor does it: a goal has no `domain` to hash yet, and this colour
// is what the created plan inherits, so the placeholder and the plan match.
export function unplannedGoals(goals: unknown, plans: Plan[]): UnplannedGoal[] {
  const list = Array.isArray(goals) ? goals : [];
  const seen = new Set<string>();
  const out: UnplannedGoal[] = [];
  for (const raw of list) {
    const goal = typeof raw === "string" ? raw.trim() : "";
    if (!goal) continue;
    const slug = domainFromName(goal);
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (isAlreadyPlanned(goal, plans)) continue;
    out.push({ goal, color: PLAN_COLORS[out.length % PLAN_COLORS.length] });
  }
  return out;
}
