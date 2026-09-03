// Ask Juniper, the AI financial planner, client side. Each message turn
// streams from /api/planner/chat, which grounds answers in the user's real,
// server-verified finances. Access it standalone (/app/ask), plan-scoped (a
// plan's "Ask about this plan" seeds a thread with planContext + a question),
// or from anywhere via the app-bar panel (#263), which is what made threads
// worth syncing server-side rather than leaving them in one browser's
// localStorage: a member does not always ask from the same device twice.
//
// Threads still hydrate from localStorage FIRST, instantly (see `state`
// below), the same local-then-remote shape use-profile.ts already takes,
// because the common case (reopening the app you were just using) should
// never wait on a round trip. /api/planner/threads (migration 0054) is the
// durable copy; hydrate() reconciles the two once per page load, newest
// updatedAt per thread id wins, and any thread that exists only locally (a
// pre-migration chat, or one made while the endpoint was unreachable) is
// pushed up as a one-time backfill.
import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

export type Msg = { role: "user" | "assistant"; content: string };

export interface PlanStep { title: string; detail: string; timeline?: string; amount?: string }
export interface PlanReport {
  title: string;
  headline: string;
  situation: string;
  recommendation: string;
  steps: PlanStep[];
  assumptions?: string[];
  generatedAt: number;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  planContext?: string; // set when the thread was opened from a plan
  planTitle?: string;
  messages: Msg[];
  report?: PlanReport; // last saved PDF plan (saved by default on generate)
}

const KEY = "jnpr.planner.threads.v1";

function load(): Thread[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Thread[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function save(threads: Thread[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(threads));
  } catch {
    /* quota / private mode, threads stay in memory this session */
  }
}

// The shape /api/planner/threads reads and writes: snake_case columns,
// timestamps as ISO strings rather than the epoch millis Thread keeps locally.
type RemoteThread = {
  id: string; title: string;
  plan_context: string | null; plan_title: string | null;
  messages: Msg[]; report: PlanReport | null;
  created_at: string; updated_at: string;
};

function fromRemote(r: RemoteThread): Thread {
  return {
    id: r.id,
    title: r.title,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
    planContext: r.plan_context ?? undefined,
    planTitle: r.plan_title ?? undefined,
    messages: r.messages ?? [],
    report: r.report ?? undefined,
  };
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getAccessToken();
  return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : null;
}

async function fetchThreadsRemote(): Promise<Thread[] | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch("/api/planner/threads", { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: RemoteThread[] };
    return (data.items ?? []).map(fromRemote);
  } catch {
    return null;
  }
}

// Every remote write below is fire-and-forget: the local store (and the UI
// reading it) has already moved on by the time these resolve, the same
// posture use-profile.ts's postRemoteProfile takes. A failure here means the
// NEXT device to hydrate is stale, not that this one is; it never blocks or
// rolls back the local change that triggered it.
async function postThreadRemote(t: Thread): Promise<void> {
  const headers = await authHeaders();
  if (!headers) return;
  try {
    await fetch("/api/planner/threads", {
      method: "POST",
      headers,
      body: JSON.stringify({ id: t.id, title: t.title, planContext: t.planContext, planTitle: t.planTitle, messages: t.messages }),
    });
  } catch {
    /* best-effort */
  }
}

async function patchThreadRemote(
  id: string,
  fields: Partial<Pick<Thread, "title" | "messages" | "planContext" | "planTitle" | "report">>,
): Promise<void> {
  const headers = await authHeaders();
  if (!headers) return;
  try {
    await fetch(`/api/planner/threads?id=${encodeURIComponent(id)}`, { method: "PATCH", headers, body: JSON.stringify(fields) });
  } catch {
    /* best-effort */
  }
}

async function deleteThreadRemote(id: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers) return;
  try {
    await fetch(`/api/planner/threads?id=${encodeURIComponent(id)}`, { method: "DELETE", headers });
  } catch {
    /* best-effort */
  }
}

export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0, 46) + "…" : t || "New chat";
}

// Last assistant line of a thread, trimmed for a one-line preview in lists.
export function previewOf(t: Thread): string {
  const last = [...t.messages].reverse().find((m) => m.role === "assistant");
  const src = last?.content ?? t.messages[t.messages.length - 1]?.content ?? "";
  const clean = src.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return clean.length > 96 ? clean.slice(0, 94) + "…" : clean;
}

// "just now" / "2h ago" / "Yesterday" / "Mar 4", for chat list timestamps.
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A tiny store shared across the page so the rail, the Overview widget, and
// the app-bar panel all stay in sync without prop-drilling. Components
// subscribe via useThreads().
type Listener = () => void;
const listeners = new Set<Listener>();
let state: Thread[] = load();
function emit() {
  save(state);
  listeners.forEach((l) => l());
}

// Runs once per page load, across every mounted useThreads() consumer, not
// once per component: a member can have the rail, a widget, and the app-bar
// panel all mounted at once, and only the first of them should hit the
// network. Newest updatedAt per thread id wins; a thread the server has never
// seen (a pre-#263 localStorage chat, or one made while offline) is kept and
// pushed up so it survives past this one browser too.
let hydrated = false;
let hydrating = false;
async function hydrate(): Promise<void> {
  if (hydrated || hydrating) return;
  hydrating = true;
  try {
    const remote = await fetchThreadsRemote();
    if (remote) {
      const byId = new Map(state.map((t) => [t.id, t]));
      const seen = new Set<string>();
      const merged: Thread[] = remote.map((r) => {
        seen.add(r.id);
        const local = byId.get(r.id);
        return local && local.updatedAt > r.updatedAt ? local : r;
      });
      for (const t of state) {
        if (seen.has(t.id)) continue;
        merged.push(t);
        void postThreadRemote(t);
      }
      state = merged;
      emit();
    }
  } finally {
    hydrated = true;
    hydrating = false;
  }
}

export function useThreads() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void hydrate();
    return () => {
      listeners.delete(l);
    };
  }, []);

  const threads = [...state].sort((a, b) => b.updatedAt - a.updatedAt);

  const create = useCallback((seed?: Partial<Thread>): Thread => {
    const now = Date.now();
    const t: Thread = {
      id: crypto.randomUUID(),
      title: seed?.title ?? "New chat",
      createdAt: now,
      updatedAt: now,
      planContext: seed?.planContext,
      planTitle: seed?.planTitle,
      messages: seed?.messages ?? [],
    };
    state = [t, ...state];
    emit();
    void postThreadRemote(t);
    return t;
  }, []);

  const remove = useCallback((id: string) => {
    state = state.filter((t) => t.id !== id);
    emit();
    void deleteThreadRemote(id);
  }, []);

  const update = useCallback((id: string, patch: (t: Thread) => Thread) => {
    let patched: Thread | undefined;
    state = state.map((t) => {
      if (t.id !== id) return t;
      patched = patch(t);
      return patched;
    });
    emit();
    if (patched) {
      void patchThreadRemote(id, {
        title: patched.title,
        messages: patched.messages,
        planContext: patched.planContext,
        planTitle: patched.planTitle,
        report: patched.report,
      });
    }
  }, []);

  return { threads, create, remove, update };
}

// Synthesize the conversation into a structured, saveable plan (rendered to PDF
// client-side). Grounding is inherited from the chat the plan is built from.
export async function generateReport(messages: Msg[], planContext?: string): Promise<PlanReport> {
  const token = await getAccessToken();
  const res = await fetch("/api/planner/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, planContext }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as Omit<PlanReport, "generatedAt"> & { error?: string };
  if (data.error) throw new Error(data.error);
  return { ...data, generatedAt: Date.now() };
}

// The declarative list a route maps to, and what a member can switch a
// page-grounded thread TO from the dropdown in ask.tsx's tools bar (issue
// #263 follow-up: "Grounded in Credit" read as a category nobody chose until
// it was explained that it names whatever page the icon was pressed from,
// so it needed both tighter copy and a way to change it after the fact).
// Ordered longest route first so a sub-route (/app/credit) is matched before
// the bare /app that is also its prefix; Overview's own /app entry only ever
// matches by exact equality since nothing is shorter than it to out-rank.
export interface PageContext { route: string; label: string; context: string }
export const PAGE_CONTEXTS: PageContext[] = [
  { route: "/app/credit", label: "Credit", context: "Page in focus: Credit — the member's linked cards, utilization, and rewards guide." },
  { route: "/app/transactions", label: "Transactions", context: "Page in focus: Transactions — spending by category, budgets, and recurring charges." },
  { route: "/app/plans", label: "Plans", context: "Page in focus: Plans — the member's savings, purchase, and payoff goals." },
  { route: "/app/score", label: "Score", context: "Page in focus: Score — the Juniper Score breakdown and levers to improve it." },
  { route: "/app/connections", label: "Connections", context: "Page in focus: Connections — linked banks, cards, and manual accounts." },
  { route: "/app/shared", label: "Together", context: "Page in focus: the shared workspace with a partner." },
  { route: "/app", label: "Overview", context: "Page in focus: Overview — net worth, spending, budgets, and the member's plans at a glance." },
];

// Every context string above shares this prefix, which is the one thing that
// tells the tools bar a thread's grounding is a PAGE (switchable via the
// dropdown) rather than a real PLAN from the Plans page (its own fixed
// context, never offered as one of these options).
const PAGE_CONTEXT_PREFIX = "Page in focus:";
export function isPageContext(context: string | undefined): boolean {
  return !!context?.startsWith(PAGE_CONTEXT_PREFIX);
}

// Route -> what to tell the model and what to show as this thread's grounding,
// when a NEW thread is started from wherever the member currently is (issue
// #263, option C). planContext is the same free-text field a plan's "Ask
// about this" already sends; nothing server-side changed to support this,
// only what the client puts in the field.
export function pageContextFor(loc: string): { label: string; context: string | undefined } {
  if (loc === "/app/ask" || loc.startsWith("/app/ask/") || loc.startsWith("/app/ask?")) {
    return { label: "Ask Juniper", context: undefined };
  }
  const hit = [...PAGE_CONTEXTS]
    .sort((a, b) => b.route.length - a.route.length)
    .find((p) => loc === p.route || loc.startsWith(`${p.route}/`) || loc.startsWith(`${p.route}?`));
  return hit ? { label: hit.label, context: hit.context } : { label: "this page", context: undefined };
}

// Runs one turn against an EXISTING thread: appends the member's message,
// streams the assistant's reply via onDelta, and writes both into the thread
// through `update`. Factored out so "what sending a message does to a
// thread" has one definition rather than two, now that both /app/ask and the
// app-bar panel drive it.
export async function runTurn(
  thread: Thread,
  text: string,
  update: (id: string, patch: (t: Thread) => Thread) => void,
  onDelta: (full: string) => void,
): Promise<void> {
  const isFirst = thread.messages.length === 0;
  const nextMsgs = [...thread.messages, { role: "user" as const, content: text }];
  update(thread.id, (x) => ({ ...x, messages: nextMsgs, title: isFirst ? titleFrom(text) : x.title, updatedAt: Date.now() }));
  try {
    const full = await streamTurn(nextMsgs, thread.planContext, onDelta);
    update(thread.id, (x) => ({ ...x, messages: [...nextMsgs, { role: "assistant", content: full }], updatedAt: Date.now() }));
  } catch {
    update(thread.id, (x) => ({
      ...x,
      messages: [...nextMsgs, { role: "assistant", content: "Sorry, something went wrong. Please try again." }],
      updatedAt: Date.now(),
    }));
  }
}

// Stream one planner turn. Appends the user message, streams the assistant
// reply token-by-token via onDelta, and resolves with the full reply text.
export async function streamTurn(
  messages: Msg[],
  planContext: string | undefined,
  onDelta: (full: string) => void,
): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch("/api/planner/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, planContext }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return full;
      try {
        const parsed = JSON.parse(data) as { text?: string; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          full += parsed.text;
          onDelta(full);
        }
      } catch {
        /* ignore malformed SSE line */
      }
    }
  }
  return full;
}
