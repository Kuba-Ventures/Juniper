// Client data layer for the shared workspace (Stage 7 partner data model).
// Talks to /api/partner (server-only tables behind it). usePartner() returns the
// live shared overview when a partnership is active; pages fall back to the demo
// live overview when a partnership is active. There is no demo fallback left:
// the seeded household it used to fall back to is deleted, and every shared
// surface shows an empty state rather than somebody else's finances.
import { useCallback, useEffect, useReducer, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

export interface PartnerPrefs { share_balances: boolean; share_transactions: boolean; share_score: boolean }
export interface PartnerGoal { id: string; t: string; icon: string; target: number; you: number; partner: number }
// What a member has chosen to expose for one account. Two states are written:
// shared, or private. "balance" is only ever READ, from rows written before the
// three-way control was retired, and it always meant the same as shared: it
// withheld nothing, because transactions are not shared at all.
export type AccountScope = "shared" | "balance" | "private";
export type WritableScope = "shared" | "private";
export const isShared = (s: AccountScope): boolean => s !== "private";
export interface PartnerAccount { account_id: string; n: string; inst: string; v: number; owner: "you" | "partner" | "shared"; scope: AccountScope; mine: boolean }
export interface PartnerData {
  connected: boolean;
  pending?: boolean;
  // Set only for the member who accepted: the first name the inviter gave them.
  me?: { invitedName: string | null };
  // Whether the space holds bills or messages, decided server-side so the app
  // bar does not have to call three endpoints to build its tabs.
  holds?: { bills: boolean; activity: boolean };
  partner?: { name: string };
  prefs?: { me: PartnerPrefs; partner: PartnerPrefs };
  goals?: PartnerGoal[];
  accounts?: PartnerAccount[];
  combined?: { netWorth: number; youShare: number; partnerShare: number };
}

export interface PartnerBill { id: string; name: string; amount: number; dueDay: number | null; split: boolean; payer: "you" | "partner" | "shared" }
export interface PartnerMessage { id: string; who: "you" | "partner"; body: string; txnRef: string | null; txnMerchant: string | null; createdAt: string }
export interface PartnerReaction { target: string; emoji: string; count: number; byMe: boolean }

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
}

export async function fetchPartner(): Promise<PartnerData | null> {
  try {
    const res = await authed("/api/partner");
    if (!res || !res.ok) return null;
    return (await res.json()) as PartnerData;
  } catch { return null; }
}

async function post(action: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await authed("/api/partner", { method: "POST", body: JSON.stringify({ action, ...extra }) });
    if (!res) return { ok: false, error: "Please sign in." };
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || (data.ok === false)) return { ok: false, error: data.error || "Something went wrong." };
    return { ok: true, url: data.url };
  } catch { return { ok: false, error: "Couldn't reach the server." }; }
}

export const invitePartner = (partnerName?: string) => post("invite", partnerName?.trim() ? { partnerName: partnerName.trim() } : {});
export const acceptInvite = (token: string) => post("accept", { token });
export const disconnectPartner = () => post("disconnect");
export const setSharingPrefs = (prefs: Partial<PartnerPrefs>) => post("set-prefs", prefs);
export const setAccountShare = (accountId: string, scope: WritableScope) => post("set-account-share", { accountId, scope });
export const addSharedGoal = (title: string, icon: string, target: number) => post("add-goal", { title, icon, target });
export const addContribution = (goalId: string, amount: number) => post("add-contribution", { goalId, amount });

// ── Bills (/api/partner/bills) ───────────────────────────────────────────────
export async function fetchBills(): Promise<PartnerBill[] | null> {
  try {
    const res = await authed("/api/partner/bills");
    if (!res || !res.ok) return null;
    const d = (await res.json()) as { connected?: boolean; bills?: PartnerBill[] };
    if (!d.connected) return null;
    return d.bills ?? [];
  } catch { return null; }
}
export async function addBill(b: { name: string; amount: number; dueDay?: number; payer: "you" | "partner" | "shared"; split?: boolean }) {
  const res = await authed("/api/partner/bills", { method: "POST", body: JSON.stringify(b) });
  return !!res && res.ok;
}
export async function deleteBill(id: string) {
  const res = await authed(`/api/partner/bills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return !!res && res.ok;
}

// ── Activity (/api/partner/activity) ─────────────────────────────────────────
export async function fetchActivity(): Promise<{ messages: PartnerMessage[]; reactions: PartnerReaction[] } | null> {
  try {
    const res = await authed("/api/partner/activity");
    if (!res || !res.ok) return null;
    const d = (await res.json()) as { connected?: boolean; messages?: PartnerMessage[]; reactions?: PartnerReaction[] };
    if (!d.connected) return null;
    return { messages: d.messages ?? [], reactions: d.reactions ?? [] };
  } catch { return null; }
}
export async function sendMessage(text: string, txnRef?: string, txnMerchant?: string) {
  const res = await authed("/api/partner/activity", { method: "POST", body: JSON.stringify({ action: "message", body: text, txnRef, txnMerchant }) });
  return !!res && res.ok;
}
export async function reactTo(target: string, emoji: string) {
  const res = await authed("/api/partner/activity", { method: "POST", body: JSON.stringify({ action: "react", target, emoji }) });
  return !!res && res.ok;
}

/* ------------------------------------------------------------------ *
 * One copy of the shared overview, for every caller.
 *
 * usePartner used to hold its own state per call site, and five components
 * call it: the shared frame, the share sheet, and the Overview, Accounts and
 * Goals pages. So there were five copies of the same server answer, and
 * refreshing one left the rest stale. Sharing an account showed the switch on
 * in the sheet and the account still Private on the Overview behind it, with
 * the combined total unmoved, because those two were reading different copies.
 *
 * A module store rather than a context, deliberately: usePartner lives in
 * lib/partner and WorkspaceProvider already imports it, so a provider here
 * would be a circular import, and every existing call site keeps working
 * unchanged.
 * ------------------------------------------------------------------ */

let cache: PartnerData | null = null;
let loaded = false;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const fn of subscribers) fn();
}

function load(force: boolean): Promise<void> {
  // Concurrent callers share one request. Five components mounting together
  // would otherwise each fire their own on first paint.
  if (inflight && !force) return inflight;
  inflight = fetchPartner().then((d) => {
    cache = d;
    loaded = true;
    inflight = null;
    emit();
  });
  return inflight;
}

// Called on sign out. The store outlives a client-side route change, so without
// this the next member signing in to the same tab would see the previous one's
// partner for as long as the first fetch takes.
export function resetPartnerCache(): void {
  cache = null;
  loaded = false;
  inflight = null;
  emit();
}

export function usePartner(): { data: PartnerData | null; loading: boolean; refresh: () => void } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    subscribers.add(bump);
    if (!loaded) void load(false);
    return () => { subscribers.delete(bump); };
  }, []);
  return {
    data: cache,
    loading: !loaded,
    refresh: useCallback(() => { void load(true); }, []),
  };
}

export function useBills(): { bills: PartnerBill[] | null; loading: boolean; refresh: () => void } {
  const [bills, setBills] = useState<PartnerBill[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    fetchBills().then((b) => { if (alive) { setBills(b); setLoading(false); } });
    return () => { alive = false; };
  }, [tick]);
  return { bills, loading, refresh };
}

export function useActivity(): { data: { messages: PartnerMessage[]; reactions: PartnerReaction[] } | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<{ messages: PartnerMessage[]; reactions: PartnerReaction[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    fetchActivity().then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [tick]);
  return { data, loading, refresh };
}
