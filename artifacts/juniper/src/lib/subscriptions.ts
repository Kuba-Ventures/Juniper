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

/** The five cadences a member may set (migration 0030). Ordered shortest first,
 *  which is how a select of them reads. UNKNOWN is deliberately absent: the
 *  server refuses it, because a cadence the total cannot convert would drop a
 *  charge out of the figure with nothing on the row to say so. */
export const CADENCES: { key: string; label: string }[] = [
  { key: "WEEKLY", label: "Weekly" },
  { key: "BIWEEKLY", label: "Every 2 weeks" },
  { key: "SEMI_MONTHLY", label: "Twice a month" },
  { key: "MONTHLY", label: "Monthly" },
  { key: "ANNUALLY", label: "Yearly" },
];
export type Confidence = "established" | "possible" | "missed";
export type Health = "on_track" | "amount_changed" | "missed" | null;

export interface SubItem {
  id: string;
  name: string;
  merchant: string | null;
  logo: string | null;
  /** The bank behind the stream, sent ONLY where Plaid named no merchant, so a
   *  fee charged by the card issuer can wear the issuer's mark. */
  institution: string | null;
  c: string;
  g: string;
  /** Set only for a group the member created; see lib/category-color paint(). */
  hue?: number | null;
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
  /** The raw cadence key, or null where it is one the member cannot set. Feeds
   *  the cadence control; `cadence` is the label and cannot be sent back. */
  frequencyKey: string | null;
  perMonth: number | null;
  edited: boolean;
  charges: number;
  /** What the member set, or null where they set nothing. Every other field on
   *  this item is already resolved, which is right for reading and wrong for a
   *  form: pre-filling from the resolved value cannot tell the member's answer
   *  from the bank's, so saving one change would write the others in as
   *  explicit choices. Editors read these two; readers read the fields above. */
  own: { name: string | null; expected: number | null; frequency: string | null };
  /** What the bank says, so an empty field can mean "use this". */
  bank: { name: string; expected: number | null; cadence: string };
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

/** SEND ALL THREE FIELDS WHEN EDITING ANY OF THEM. The server upserts with
 *  `resolution=merge-duplicates`, which replaces the conflicting row rather than
 *  patching it, so a save carrying only the field that changed silently clears
 *  the other two. Callers that edit read their own current values back into the
 *  request; a plain confirm or dismiss sends none of them, which is correct,
 *  because it is acting on a stream that has no overrides to preserve. */
export async function setSubscription(
  streamId: string,
  action: SubAction,
  opts?: { name?: string; expectedAmount?: number | null; frequency?: string | null },
): Promise<boolean> {
  try {
    const res = await authed("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        stream_id: streamId,
        action,
        ...(opts?.name != null ? { name: opts.name } : {}),
        ...(opts?.expectedAmount !== undefined ? { expected_amount: opts.expectedAmount } : {}),
        ...(opts?.frequency !== undefined ? { frequency: opts.frequency } : {}),
      }),
    });
    return !!res?.ok;
  } catch {
    return false;
  }
}
