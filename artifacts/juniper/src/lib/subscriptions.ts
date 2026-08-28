// Client for /api/subscriptions, the recurring charges Plaid detected and what
// the member said about each one.
//
// Every derived judgement (confidence tier, expected-vs-actual health, the
// monthly figure, whether a cadence can be normalized at all) is computed
// server-side and arrives ready to render. The client's job here is to show it
// and to send back decisions, not to re-derive any of it: a second copy of the
// "is this amount different enough to flag" rule would be free to disagree with
// the one the total is built from.
import { getAccessToken } from "@/lib/supabase";

export type Review = "confirmed" | "dismissed" | "unreviewed";
export type Confidence = "established" | "possible" | "missed";
export type Health = "on_track" | "amount_changed" | "missed" | null;

export interface SubItem {
  id: string;
  name: string;
  merchant: string | null;
  logo: string | null;
  c: string;
  g: string;
  direction: "outflow" | "inflow";
  review: Review;
  confidence: Confidence;
  health: Health;
  expected: number | null;
  last: number | null;
  drift: number | null;
  nextDate: string | null;
  overdue: boolean;
  lastDate: string | null;
  cadence: string;
  perMonth: number | null;
  edited: boolean;
  charges: number;
}
export interface SubSummary {
  monthly: number; yearly: number; confirmed: number;
  unreviewed: number; monthlyUnreviewed: number; dismissed: number;
  unknownCadence: number; incoming: number;
}
export interface SubPayload { items: SubItem[]; summary: SubSummary }

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

export async function fetchSubscriptions(): Promise<SubPayload | null> {
  try {
    const res = await authed("/api/subscriptions");
    if (!res?.ok) return null;
    return (await res.json()) as SubPayload;
  } catch {
    return null;
  }
}

export type SubAction = "confirm" | "dismiss" | "revert";

export async function setSubscription(
  streamId: string,
  action: SubAction,
  opts?: { name?: string; expectedAmount?: number | null },
): Promise<boolean> {
  try {
    const res = await authed("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        stream_id: streamId,
        action,
        ...(opts?.name != null ? { name: opts.name } : {}),
        ...(opts?.expectedAmount !== undefined ? { expected_amount: opts.expectedAmount } : {}),
      }),
    });
    return !!res?.ok;
  } catch {
    return false;
  }
}
