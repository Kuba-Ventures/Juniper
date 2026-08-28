// Automatic refresh.
//
// Refresh used to be a button on Connections. It is now something the app does
// on its own, and the button is gated behind a dev build or an admin, because a
// member pressing Refresh was doing work the app should have done and could not
// fix the one case where pressing it felt necessary (a connection whose login
// has expired, which only a relink resolves).
//
// STALENESS IS DECIDED SERVER-SIDE. /api/finances returns `sync.syncedAt`, the
// timestamp of the member's STALEST connection, and the client refreshes only
// when that is past the threshold. Two reasons it is not a local timestamp:
// a second device would each keep their own and both sync on every visit, and
// two tabs would race. A server timestamp is one answer for the whole account,
// and it updates the moment any sync lands.
import { syncFinances } from "@/lib/plaid";

// Six hours. Most institutions post to Plaid roughly daily, so refreshing four
// times a day is already ahead of the data changing; anything shorter is calls
// nobody can see the result of. It is a ceiling rather than a schedule: a
// member who opens the app once a week syncs once a week, and one who opens it
// hourly still syncs four times a day.
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export interface SyncState {
  syncedAt: string | null;
  tracked: boolean;
  connections: number;
  needsRelink: { institution: string; since: string | null }[];
  canForceSync: boolean;
}

export function isStale(state: SyncState | undefined, now = Date.now()): boolean {
  if (!state) return false;
  // Nothing linked: there is nothing to refresh, and firing a sync would be a
  // round trip to be told so.
  if (state.connections === 0) return false;
  // The server cannot tell us (migration 0017 not applied). Doing nothing is
  // right: the old manual path still exists for dev and admins, and guessing
  // "stale" here would sync on every single page load.
  if (!state.tracked) return false;
  // Known to have never synced. This is the case a background refresh exists
  // for, so it is stale by definition.
  if (!state.syncedAt) return true;
  const t = Date.parse(state.syncedAt);
  if (Number.isNaN(t)) return false;
  return now - t > STALE_AFTER_MS;
}

// One sync in flight per tab. The server timestamp handles the cross-tab case
// on the next load, but within a tab a re-render must not fire a second run.
let inFlight: Promise<void> | null = null;

export function runBackgroundSync(onDone?: () => void): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = syncFinances()
    .then(() => { onDone?.(); })
    .catch(() => { /* a failed background refresh is not the member's problem */ })
    .finally(() => { inFlight = null; });
  return inFlight;
}

export const syncInFlight = () => inFlight !== null;

// Compact relative time: "just now", "12m ago", "2h ago", "3d ago". Deliberately
// short, because this sits in a page header beside a button and is a glance, not
// a sentence. Anything past a week reads as a date, since "58d ago" is arithmetic
// the reader should not have to do.
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export function timeAgo(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = now - t;
  // A clock skewed a little into the future should read as current, not as a
  // negative age.
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
