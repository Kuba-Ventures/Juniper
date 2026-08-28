// Per-item sync state on plaid_items (migration 0017), written by every endpoint
// that talks to Plaid on a member's behalf.
//
// The point is that a page load can answer "how current is this" and "is
// anything broken" without calling Plaid. Before this, both facts existed only
// inside the response body of a sync the member had just triggered, and were
// thrown away when the page changed.
//
// ONLY DEAD-ITEM CODES ARE RECORDED. A transient Plaid hiccup, a rate limit, a
// product that is not ready yet: none of those are worth telling a member
// about, they resolve on the next run, and surfacing them would train people to
// ignore the one message that matters. `last_error_code` is reserved for the
// state a member has to act on, which is a connection that will never work
// again until it is relinked.
//
// That restriction also removes the only race worth worrying about. Both the
// transactions sync and the balance snapshot run over the same items on every
// refresh, so they can write these columns within moments of each other. A dead
// token fails in both and both set it; a live token succeeds in both and both
// clear it. There is no ordering in which one endpoint's success erases the
// other's report of a dead token, because a dead token cannot succeed anywhere.
import { adminRest } from "./_supabase-admin";

// Plaid codes that mean the connection itself is finished: the token will never
// work again, so the institution has to be linked afresh.
export const DEAD_ITEM_CODES = new Set(["ITEM_LOGIN_REQUIRED", "INVALID_ACCESS_TOKEN"]);

export function isDeadItemCode(code?: string | null): boolean {
  return !!code && DEAD_ITEM_CODES.has(code);
}

// Best-effort on purpose, and never awaited into a caller's error path: failing
// to record that a sync worked must not turn a successful sync into a failed
// one. A missed write self-corrects on the next run.
export async function markItemSynced(itemId: string): Promise<void> {
  try {
    await adminRest(`plaid_items?item_id=eq.${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_synced_at: new Date().toISOString(), last_error_code: null, last_error_at: null }),
    });
  } catch { /* ignore */ }
}

export async function markItemDead(itemId: string, code: string): Promise<void> {
  try {
    await adminRest(`plaid_items?item_id=eq.${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_error_code: code, last_error_at: new Date().toISOString() }),
    });
  } catch { /* ignore */ }
}
