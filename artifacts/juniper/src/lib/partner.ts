// Client data layer for the shared workspace (Stage 7 partner data model).
// Talks to /api/partner (server-only tables behind it). usePartner() returns the
// live shared overview when a partnership is active; pages fall back to the demo
// live overview when a partnership is active. There is no demo fallback left:
// the seeded household it used to fall back to is deleted, and every shared
// surface shows an empty state rather than somebody else's finances.
import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

export interface PartnerPrefs { share_balances: boolean; share_transactions: boolean; share_score: boolean }
export interface PartnerGoal { id: string; t: string; icon: string; target: number; you: number; partner: number }
export type AccountScope = "shared" | "balance" | "private";
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
export const setAccountShare = (accountId: string, scope: AccountScope) => post("set-account-share", { accountId, scope });
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

// Fetches the shared overview once; `refresh()` re-pulls after a mutation.
export function usePartner(): { data: PartnerData | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPartner().then((d) => { if (alive) { setData(d); setLoading(false); } });
    return () => { alive = false; };
  }, [tick]);
  return { data, loading, refresh };
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
