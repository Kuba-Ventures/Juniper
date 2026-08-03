// Ask Juniper — the AI financial planner, client side. Threads live in
// localStorage for v1 (no server round-trip to list chats); each message turn
// streams from /api/planner/chat, which grounds answers in the user's real,
// server-verified finances. Access it standalone (/app/ask) or plan-scoped
// (a plan's "Ask about this plan" seeds a thread with planContext + a question).
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
    /* quota / private mode — threads stay in memory this session */
  }
}

let counter = 0;
function newId() {
  counter += 1;
  return `t${Date.now()}_${counter}`;
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

// "just now" / "2h ago" / "Yesterday" / "Mar 4" — for chat list timestamps.
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

// A tiny store shared across the page so the rail and the thread view stay in
// sync without prop-drilling. Components subscribe via useThreads().
type Listener = () => void;
const listeners = new Set<Listener>();
let state: Thread[] = load();
function emit() {
  save(state);
  listeners.forEach((l) => l());
}

export function useThreads() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const threads = [...state].sort((a, b) => b.updatedAt - a.updatedAt);

  const create = useCallback((seed?: Partial<Thread>): Thread => {
    const now = Date.now();
    const t: Thread = {
      id: newId(),
      title: seed?.title ?? "New chat",
      createdAt: now,
      updatedAt: now,
      planContext: seed?.planContext,
      planTitle: seed?.planTitle,
      messages: seed?.messages ?? [],
    };
    state = [t, ...state];
    emit();
    return t;
  }, []);

  const remove = useCallback((id: string) => {
    state = state.filter((t) => t.id !== id);
    emit();
  }, []);

  const update = useCallback((id: string, patch: (t: Thread) => Thread) => {
    state = state.map((t) => (t.id === id ? patch(t) : t));
    emit();
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
