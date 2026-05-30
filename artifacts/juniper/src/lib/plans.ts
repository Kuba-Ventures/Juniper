import { getAccessToken } from "@/lib/supabase";

export type PlanGoal = {
  headline: string;
  summary?: string;
  home_type?: string;
  target_value?: number;
  target_date?: string;
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
    console.error(`[Juniper] savePlan failed: ${res.status} ${res.statusText} — body:`, text);
    return null;
  }
  return (await res.json()) as Plan | null;
}
