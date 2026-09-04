// Client data layer for the household workspace (issue #258). Talks to
// /api/household (server-only tables behind it, migration 0055). Mirrors
// lib/partner.ts's shape and its module-store pattern deliberately: usePartner
// used to be a plain hook until five call sites each held their own copy of
// the same server answer and came to disagree (#197) — useHousehold is a
// store from day one rather than repeating that bug once a second page reads it.
import { useCallback, useEffect, useReducer } from "react";
import { getAccessToken } from "@/lib/supabase";
import type { PlanLike } from "@/lib/plans";

export type HouseholdRole = "owner" | "adult" | "teen";

export interface HouseholdMember {
  userId: string;
  name: string;
  role: HouseholdRole;
  isMe: boolean;
}

// Two states are written: shared or private. Same as household_account_shares.
export type AccountScope = "shared" | "private";
export const isShared = (s: AccountScope): boolean => s === "shared";

export interface HouseholdAccount {
  account_id: string;
  n: string;
  inst: string;
  v: number;
  owner_id: string;
  scope: AccountScope;
  mine: boolean;
}

// A plan as the household page sees it: `goal`/`domain`/`current_state`/`kpis`
// are exactly PlanLike, so planTitle()/planIcon()/planNumbers() from
// lib/plans.ts read this object directly, with no second formatter for the
// household's copy of a plan.
export interface HouseholdPlan extends PlanLike {
  status: string;
  owner_id: string;
  shared: boolean;
  mine: boolean;
}

export interface HouseholdData {
  connected: boolean;
  household?: { id: string; name: string };
  role?: HouseholdRole;
  members?: HouseholdMember[];
  accounts?: HouseholdAccount[];
  plans?: HouseholdPlan[];
  combined?: { netWorth: number };
}

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
}

export async function fetchHousehold(): Promise<HouseholdData | null> {
  try {
    const res = await authed("/api/household");
    if (!res || !res.ok) return null;
    return (await res.json()) as HouseholdData;
  } catch { return null; }
}

async function post(action: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await authed("/api/household", { method: "POST", body: JSON.stringify({ action, ...extra }) });
    if (!res) return { ok: false, error: "Please sign in." };
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || data.ok === false) return { ok: false, error: data.error || "Something went wrong." };
    return { ok: true, url: data.url };
  } catch { return { ok: false, error: "Couldn't reach the server." }; }
}

export const createHousehold = (name: string) => post("create", { name });
export const inviteToHousehold = (opts: { name?: string; role?: "adult" | "teen" } = {}) => post("invite", opts);
export const acceptHouseholdInvite = (token: string) => post("accept", { token });
export const leaveHousehold = () => post("leave");
export const removeHouseholdMember = (userId: string) => post("remove-member", { userId });
export const editHouseholdMemberRole = (userId: string, role: "adult" | "teen") => post("edit-role", { userId, role });
export const setHouseholdAccountShare = (accountId: string, scope: AccountScope) => post("set-account-share", { accountId, scope });
export const setHouseholdPlanShare = (domain: string, shared: boolean) => post("share-plan", { domain, shared });

/** Who sent a household invite, for the page the invited person lands on.
 *  Carries no session, same reasoning as fetchInviteInfo in lib/partner.ts:
 *  the person making this call does not have one yet. Never rejects. */
export async function fetchHouseholdInviteInfo(token: string): Promise<{ pending: boolean; household: string | null; invitedName: string | null }> {
  try {
    const res = await fetch(`/api/household/invite?token=${encodeURIComponent(token)}`);
    if (!res.ok) return { pending: false, household: null, invitedName: null };
    const data = (await res.json()) as { pending?: boolean; household?: string | null; invitedName?: string | null };
    return { pending: !!data.pending, household: data.household ?? null, invitedName: data.invitedName ?? null };
  } catch {
    return { pending: false, household: null, invitedName: null };
  }
}

// ── One copy of the household overview, for every caller ────────────────────
// Same module-store-with-subscribers shape as usePartner in lib/partner.ts.

let cache: HouseholdData | null = null;
let loaded = false;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const fn of subscribers) fn();
}

function load(force: boolean): Promise<void> {
  if (inflight && !force) return inflight;
  inflight = fetchHousehold().then((d) => {
    cache = d;
    loaded = true;
    inflight = null;
    emit();
  });
  return inflight;
}

// Called on sign out, same as resetPartnerCache, and for the same reason: the
// store outlives a client-side route change.
export function resetHouseholdCache(): void {
  cache = null;
  loaded = false;
  inflight = null;
  emit();
}

export function useHousehold(): { data: HouseholdData | null; loading: boolean; refresh: () => void } {
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
