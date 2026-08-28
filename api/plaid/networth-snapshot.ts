// POST /api/plaid/networth-snapshot
// Plaid returns only *current* balances, so we can't ask it for a net-worth
// trend, we have to build one by snapshotting daily. This endpoint fetches the
// caller's fresh balances from Plaid (/accounts/balance/get, per item), classifies
// each account as an asset or a debt, and upserts ONE row per (user, day) into
// net_worth_snapshots. Call it on link, on manual refresh, and on a daily cron.
//
// Assets  = depository + investment + brokerage balances.
// Debts   = |credit + loan balances| (Plaid reports these as positive `current`).
// The access_token is read server-side only (service-role) and never leaves here.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch, sanitizeAccounts, PLAID_TIMEOUT_CODE } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { isDeadItemCode, markItemSynced, markItemDead } from "../_item-sync-state";
import { fetchManualAccounts, sumManualAccounts } from "../_manual-accounts";
import { mapPool } from "../_pool";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

// Only account_id/type/balances are read by classify() below, but the same raw
// accounts are handed to sanitizeAccounts(), which persists the name, mask,
// currency, and (since the Credit page started showing card utilization) the
// credit `limit` into the stored snapshot. The type stopped at
// current/available, describing less than this code actually handles, which is
// how a field could be persisted without anything here admitting it exists.
type BalanceAccount = {
  account_id: string;
  name?: string;
  official_name?: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  balances?: {
    current?: number | null;
    available?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
  };
};
type BalanceResp = { accounts?: BalanceAccount[]; error_message?: string; error_code?: string };

type ItemFailure = { item_id: string; error_code: string | null; error_message: string | null; needs_relink: boolean };

const DEBT_TYPES = new Set(["credit", "loan"]);

// Assets add, debts subtract. Plaid reports credit/loan `current` as a positive
// amount owed, so take its absolute value regardless of sign.
function classify(a: BalanceAccount): { assets: number; debts: number } {
  const bal = a.balances?.current ?? a.balances?.available ?? 0;
  if (!Number.isFinite(bal)) return { assets: 0, debts: 0 };
  if (DEBT_TYPES.has((a.type ?? "").toLowerCase())) return { assets: 0, debts: Math.abs(bal) };
  return { assets: bal, debts: 0 };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL) return json({ error: "Supabase not configured" }, 500);
  if (!plaidConfigured() || !adminConfigured()) return json({ error: "Plaid not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  return runNetworthSnapshot(payload.sub);
}

// The work, with the caller already established. Split out so the daily cron
// can run it for a member who is not there to authenticate: the sync endpoints
// are JWT scoped, and a cron holds no member's JWT. The split is where the
// request stops mattering, which is the moment the user id is known, so both
// callers run byte for byte the same code below.
export async function runNetworthSnapshot(userId: string): Promise<Response> {
  // Load the caller's linked items (server-only: access_token).
  const itemsRes = await adminRest(`plaid_items?user_id=eq.${userId}&select=item_id,access_token`);
  if (!itemsRes.ok) {
    // Logged for the same reason as the per-item failures below: this endpoint
    // runs in the background and its body is not read by the UI. A non-2xx
    // PostgREST body is an error object, not rows, so no token can appear here.
    const detail = await itemsRes.text().catch(() => "");
    console.error(`[plaid] networth-snapshot could not read items (${itemsRes.status}): ${detail}`);
    return json({ error: "Failed to read items" }, 500);
  }
  const items = (await itemsRes.json().catch(() => [])) as { item_id: string; access_token: string }[];

  // Manually-added accounts (tier 3) count toward the snapshotted net worth too,
  // so a hand-entered 401(k) or regional bank shows up on the trend line.
  const manual = sumManualAccounts(await fetchManualAccounts(userId));
  const manualAssets = manual.cash + manual.invest;
  const manualDebts = manual.cardDebt + manual.loanDebt;

  if (!items.length && manualAssets === 0 && manualDebts === 0) {
    return json({ linked: false, message: "No accounts" });
  }

  let assets = manualAssets, debts = manualDebts;

  // Items are isolated from each other. This loop used to return on the first
  // item Plaid refused, and because the stored-snapshot PATCH sits inside the
  // loop after the fetch, one bad connection meant NO connection got refreshed:
  // the member pressed "Refresh data", every balance stayed stale, and they saw
  // no error because syncFinances() dropped the body. Real case: two items
  // linked while PLAID_ENV was sandbox, whose tokens are invalid against
  // Production, sitting in front of one healthy card.
  const failures: ItemFailure[] = [];
  let refreshed = 0;

  // One item's balance refresh: a Plaid call, then the stored-snapshot write.
  // Returns rather than mutating, so the batching below can run several at once
  // without two items racing on the same totals.
  const refreshItem = async (item: { item_id: string; access_token: string }, timeoutMs: number) => {
    const bal = await plaidFetch<BalanceResp>(
      "/accounts/balance/get",
      { access_token: item.access_token },
      { timeoutMs },
    );
    if (!bal.ok) {
      const code = bal.data.error_code ?? null;
      // Logged as well as returned, matching link-token.ts: error_code and
      // error_message are Plaid status strings, never the access token, and a
      // background refresh has nowhere else to report itself.
      console.error(
        `[plaid] accounts/balance/get failed (${bal.status}) for item ${item.item_id}: ${code || "unknown"} ${bal.data.error_message || ""}`.trim(),
      );
      // Recorded so a later page load can name this connection without calling
      // Plaid again. Only dead-item codes are stored, see _item-sync-state.ts.
      if (isDeadItemCode(code)) await markItemDead(item.item_id, code!);
      return {
        assets: 0,
        debts: 0,
        failure: {
          item_id: item.item_id,
          error_code: code,
          error_message: bal.data.error_message ?? null,
          needs_relink: isDeadItemCode(code),
        } as ItemFailure,
      };
    }
    const accts = bal.data.accounts ?? [];
    let a = 0, d = 0;
    for (const acct of accts) {
      const c = classify(acct);
      a += c.assets;
      d += c.debts;
    }
    // Refresh the stored snapshot so /api/plaid/accounts stays current too.
    await adminRest(`plaid_items?item_id=eq.${item.item_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ accounts: sanitizeAccounts(accts), updated_at: new Date().toISOString() }),
    });
    await markItemSynced(item.item_id);
    return { assets: a, debts: d, failure: null };
  };

  // Items are refreshed several at a time rather than one after another, because
  // a Plaid balance call plus a Supabase write is a second or two at best and an
  // edge function is killed if it has not returned an initial response within 25
  // seconds. A member with twelve institutions hit that ceiling on a serial
  // loop: the whole refresh 504'd, no trend point was written for the day, and
  // the legs that run after this one in syncFinances were left waiting on a
  // function already dead.
  //
  // Bounded rather than unbounded: the Item cap on this tier is 200, and firing
  // 200 concurrent balance calls would trade a timeout for a rate limit.
  const CONCURRENCY = 6;

  // Six at a time was first written as rounds: six items, wait for all six, then
  // the next six. That is a barrier, and a barrier is only as fast as its
  // slowest member, so one institution taking twenty seconds to answer held five
  // finished calls and six unstarted ones behind it, and the ceiling was reached
  // again with eleven healthy connections having done nothing. mapPool keeps the
  // same six-at-a-time limit without the barrier: a slow bank occupies one
  // worker and the other five keep going.
  //
  // The deadline is the other half of it. Being killed at 25 seconds means no
  // response at all, which throws away the per-item snapshots that DID refresh
  // and leaves the legs running after this one in syncFinances waiting on a dead
  // function. Stopping at 18 gives a real answer about what resolved, and a
  // connection that did not is already handled: the day's trend point is skipped
  // rather than written from partial totals.
  const DEADLINE_MS = 18_000;
  const PER_ITEM_MS = 9_000;
  const startedAt = Date.now();

  const results = await mapPool(items, CONCURRENCY, async (item) => {
    const budget = Math.min(PER_ITEM_MS, DEADLINE_MS - (Date.now() - startedAt));
    if (budget <= 0) {
      // Never reached, rather than tried and refused. Named as such, because
      // "we ran out of time" and "your bank said no" are different facts, and
      // the failures list is what a later page load reads to explain itself.
      return {
        assets: 0,
        debts: 0,
        failure: {
          item_id: item.item_id,
          error_code: PLAID_TIMEOUT_CODE,
          error_message: "Ran out of time before this connection was refreshed",
          needs_relink: false,
        } as ItemFailure,
      };
    }
    return refreshItem(item, budget);
  });

  for (const r of results) {
    if (r.failure) {
      failures.push(r.failure);
      continue;
    }
    assets += r.assets;
    debts += r.debts;
    refreshed++;
  }

  // The only non-200 path: nothing at all resolved, so there is no snapshot to
  // write (a row built from the manual side alone would stamp a fake dip on the
  // trend). A partial refresh is a real success and proceeds.
  if (items.length > 0 && refreshed === 0) {
    return json(
      {
        error: failures[0]?.error_message || "Plaid balance fetch failed",
        error_code: failures[0]?.error_code ?? null,
        refreshed: 0,
        failed: failures.length,
        failures,
      },
      502,
    );
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  assets = round(assets);
  debts = round(debts);
  const netWorth = round(assets - debts);
  const asOf = new Date().toISOString().slice(0, 10); // UTC day

  // A partial refresh must not write the day's trend point. The totals above
  // cover only the items that resolved, so a member with one broken connection
  // would get a permanently low dip in their net-worth history, and a wrong
  // point in a trend outlives the outage that caused it. A skipped day is
  // invisible by comparison: the chart simply has no sample there. Per-item
  // snapshots were already refreshed above, so balances and credit limits are
  // still up to date for everything that answered.
  const partial = failures.length > 0;
  let snapshotRow: unknown = null;
  if (!partial) {
    const up = await adminRest("net_worth_snapshots?on_conflict=user_id,as_of", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: userId, as_of: asOf, assets, debts, net_worth: netWorth }),
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      console.error(`[plaid] net_worth_snapshots upsert failed (${up.status}): ${detail}`);
      return json({ error: "Failed to save snapshot", detail }, 500);
    }
    const rows = (await up.json().catch(() => [])) as unknown[];
    snapshotRow = rows[0] ?? null;
  } else {
    console.error(
      `[plaid] net_worth snapshot skipped for ${asOf}: ${failures.length} of ${items.length} items failed to refresh`,
    );
  }

  // `refreshed` / `failed` / `failures` let the caller tell a clean refresh from
  // one that skipped broken connections, and `snapshot_skipped` says why no
  // trend point was written. Totals are still reported so the caller can show
  // what did resolve; they just are not persisted on a partial run.
  return json({
    linked: true,
    as_of: asOf,
    assets,
    debts,
    net_worth: netWorth,
    snapshot: snapshotRow,
    snapshot_skipped: partial,
    items: items.length,
    refreshed,
    failed: failures.length,
    failures,
  });
}
