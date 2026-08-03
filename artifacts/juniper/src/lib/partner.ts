// Client data layer for the shared workspace (Stage 7 partner data model).
// Talks to /api/partner (server-only tables behind it). usePartner() returns the
// live shared overview when a partnership is active; pages fall back to the demo
// shared-data until then, so the UI keeps working before the ops gates clear.
import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";

export interface PartnerPrefs { share_balances: boolean; share_transactions: boolean; share_score: boolean }
export interface PartnerGoal { id: string; t: string; icon: string; target: number; you: number; partner: number }
export interface PartnerData {
  connected: boolean;
  pending?: boolean;
  partner?: { name: string };
  prefs?: { me: PartnerPrefs; partner: PartnerPrefs };
  goals?: PartnerGoal[];
  combined?: { netWorth: number; youShare: number; partnerShare: number };
}

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

export const invitePartner = () => post("invite");
export const acceptInvite = (token: string) => post("accept", { token });
export const disconnectPartner = () => post("disconnect");
export const setSharingPrefs = (prefs: Partial<PartnerPrefs>) => post("set-prefs", prefs);
export const addSharedGoal = (title: string, icon: string, target: number) => post("add-goal", { title, icon, target });
export const addContribution = (goalId: string, amount: number) => post("add-contribution", { goalId, amount });

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
