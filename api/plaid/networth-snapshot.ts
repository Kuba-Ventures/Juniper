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
import { plaidConfigured, plaidFetch, sanitizeAccounts, PLAID_TIMEOUT_CODE, type SanitizedAccount } from "../_plaid";
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
type StoredItem = { item_id: string; access_token: string; accounts: SanitizedAccount[] | null; balances_refreshed_at?: string | null };

// The stored-snapshot twin of classify(). Same rule, different shape: a live
// balance nests under `balances`, a sanitized one is already flattened onto
// `balance`. Kept beside classify so the two cannot drift on what counts as a
// debt, which is the one judgement either of them makes.
function classifyStored(a: SanitizedAccount): { assets: number; debts: number } {
  const bal = a.balance ?? 0;
  if (!Number.isFinite(bal)) return { assets: 0, debts: 0 };
  if (DEBT_TYPES.has((a.type ?? "").toLowerCase())) return { assets: 0, debts: Math.abs(bal) };
  return { assets: bal, debts: 0 };
}

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
  // `accounts` rides along with the token: it is the last balances Plaid gave
  // us for this item, and it is what a refusing item contributes instead of
  // collapsing the whole day's trend point. See the carry-forward below.
  const itemsRes = await adminRest(`plaid_items?user_id=eq.${userId}&select=item_id,access_token,accounts,balances_refreshed_at`);
  if (!itemsRes.ok) {
    // Logged for the same reason as the per-item failures below: this endpoint
    // runs in the background and its body is not read by the UI. A non-2xx
    // PostgREST body is an error object, not rows, so no token can appear here.
    const detail = await itemsRes.text().catch(() => "");
    console.error(`[plaid] networth-snapshot could not read items (${itemsRes.status}): ${detail}`);
    return json({ error: "Failed to read items" }, 500);
  }
  const items = (await itemsRes.json().catch(() => [])) as StoredItem[];

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

  // ── Timing ────────────────────────────────────────────────────────────────
  // Declared above the functions that read them. They used to sit below, which
  // worked only because nothing called those functions until execution had
  // passed the declarations: a call moved earlier would have failed at runtime
  // on a temporal dead zone rather than at compile time.
  // Whole-run ceiling. Vercel kills an edge function that has not answered in
  // 25 seconds, and being killed means no response at all, which throws away
  // every per-item snapshot that DID refresh. Stopping at 18 gives a real
  // answer about what resolved. See the batching note further down.
  const DEADLINE_MS = 18_000;
  // 12s, not the 9 it was. Carter Bank & Trust timed out at 9 on every attempt
  // for two days, and a small regional bank being slow through Plaid is
  // ordinary rather than broken. Raising this does NOT starve the items behind
  // it: mapPool's workers pull from a shared cursor, so the queue advances when
  // the FIRST worker frees up, which is a fast bank at a second or two, not the
  // slow one holding its own worker.
  const PER_ITEM_MS = 12_000;
  // refreshItem is a Plaid call AND two Supabase writes, and only the Plaid call
  // is covered by the budget below. Timing the calls right up to the deadline
  // therefore overshot it by however long the writes took, which is how a run
  // that stops itself at 18s was still killed at 25. Kept back for the tail:
  // the per-item writes, the snapshot upsert, and serialising the response.
  const WRITE_RESERVE_MS = 4_000;
  // Below this there is no point starting: a bank that answers in under a second
  // is not the one that puts a run in trouble, and a doomed call still costs the
  // full wait before it fails.
  const MIN_CALL_MS = 1_500;
  const startedAt = Date.now();

  // How long Plaid gets to hand back the balances it already holds. Short on
  // purpose: /accounts/get makes no round trip to the bank, so a second is
  // generous, and a slow answer here means Plaid itself is struggling rather
  // than the institution.
  const CACHED_FALLBACK_MS = 4_000;

  // The success tail, shared by the live path and the cached fallback so the two
  // cannot drift on what they store or how they classify it.
  //
  // balances_refreshed_at is written HERE and nowhere else, which is the whole
  // point of it: it dates the snapshot rather than the row, so an item whose
  // transactions sync fine and whose balance calls all fail cannot look fresh.
  // See migration 0022.
  //
  // The fallback writes it too, deliberately. The number came from Plaid this
  // minute, not from our own copy, so the staleness ceiling in the carry-forward
  // has nothing to protect against here. The ceiling exists for an item Plaid
  // cannot serve AT ALL, and one answering /accounts/get is not that.
  const storeAndSum = async (
    item: { item_id: string; access_token: string },
    accts: BalanceAccount[],
    fromCache: boolean,
  ) => {
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
      body: JSON.stringify({
        accounts: sanitizeAccounts(accts),
        balances_refreshed_at: new Date().toISOString(),
        // Always written, not only when true, so it describes the MOST RECENT
        // refresh. A bank that answered from cache yesterday and live today
        // must not still be labelled cached. See migration 0023.
        balances_from_cache: fromCache,
        updated_at: new Date().toISOString(),
      }),
    });
    await markItemSynced(item.item_id);
    return { assets: a, debts: d, failure: null, fromCache };
  };

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

      // A TIMEOUT is not a refusal. /accounts/balance/get asks Plaid to go and
      // ask the bank right now, which is what a slow bank cannot answer inside
      // any sane budget. /accounts/get returns the balance Plaid already holds:
      // no round trip to the bank, so it answers in about a second, and it is
      // still Plaid's number rather than a copy of our own from days ago.
      //
      // Only on a timeout. A dead item, a permissions error or a relink prompt
      // are all real answers and must not be papered over with cached figures.
      // Budgeted from what is LEFT of the run, not from the call that just
      // timed out. Reusing that budget would let a 12s timeout be followed by a
      // 4s retry and push the run past the deadline it sets for itself.
      const leftForFallback = Math.min(
        CACHED_FALLBACK_MS,
        DEADLINE_MS - WRITE_RESERVE_MS - (Date.now() - startedAt),
      );
      if (code === PLAID_TIMEOUT_CODE && !isDeadItemCode(code) && leftForFallback >= 1_000) {
        const cached = await plaidFetch<BalanceResp>(
          "/accounts/get",
          { access_token: item.access_token },
          { timeoutMs: leftForFallback },
        );
        if (cached.ok && (cached.data.accounts ?? []).length) {
          console.warn(
            `[plaid] accounts/balance/get timed out for item ${item.item_id}, used Plaid's cached balances from /accounts/get instead`,
          );
          return await storeAndSum(item, cached.data.accounts ?? [], true);
        }
      }

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
    return await storeAndSum(item, bal.data.accounts ?? [], false);
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
  // rather than written from partial totals. Declared with the other timing
  // constants above, since refreshItem reads it.

  const results = await mapPool(items, CONCURRENCY, async (item) => {
    const budget = Math.min(PER_ITEM_MS, DEADLINE_MS - WRITE_RESERVE_MS - (Date.now() - startedAt));
    if (budget < MIN_CALL_MS) {
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

  // An item that did not answer contributes its LAST KNOWN balances rather than
  // nothing. Dropping the day entirely was the old behaviour, and it is the
  // right call only if the alternative is a wrong number: one chronically slow
  // bank then means the trend never gets another point, which is not a gap the
  // member can see or reason about. A balance from the last successful refresh
  // is a real number that was true recently, and the row is marked `estimated`
  // (migration 0015) so the chart draws it dashed and says so.
  //
  // The one case still worth skipping: an item that has never refreshed at all
  // has no stored balance to carry, so including it would understate the total
  // by that whole institution. That is the wrong-number case the old rule was
  // written for.
  // How long a failing item may be carried before it stops counting. Without a
  // ceiling the carry-forward degrades silently: an item that never answers
  // again contributes the same frozen number every day, forever, inside a total
  // presented as today's, and the only signal is a dashed point that looks
  // exactly like a legitimately reconstructed one. A week is long enough to ride
  // out an outage and short enough that nobody is reading a month-old balance.
  const CARRY_MAX_DAYS = 7;
  const carryCutoff = Date.now() - CARRY_MAX_DAYS * 86_400_000;

  let carried = 0;
  let uncarryable = 0;
  let expired = 0;
  // Items that answered only from Plaid's cache. Reported because a bank that
  // lives here permanently is a real fact about the member's data, and it is
  // the difference between "refreshed" meaning what it says and not.
  let cached = 0;
  const byId = new Map(items.map((i) => [i.item_id, i]));
  for (const r of results) {
    if (r.failure) {
      failures.push(r.failure);
      const item = byId.get(r.failure.item_id);
      const stored = item?.accounts ?? [];
      // A null timestamp means nothing has ever recorded a balance refresh for
      // this item, so there is no evidence its stored figures are recent. Not
      // carried, for the same reason a week-old one is not.
      const at = item?.balances_refreshed_at ? Date.parse(item.balances_refreshed_at) : NaN;
      const fresh = Number.isFinite(at) && at >= carryCutoff;

      if (!stored.length) {
        // Never refreshed at all, so there is nothing to carry and including it
        // would silently drop a whole institution from the total.
        uncarryable++;
      } else if (!fresh) {
        // Has balances, but too old to fold into a total presented as today's.
        // Counted apart from the above so the log can say which happened.
        expired++;
        uncarryable++;
      } else {
        for (const acct of stored) {
          const c = classifyStored(acct);
          assets += c.assets;
          debts += c.debts;
        }
        carried++;
      }
      continue;
    }
    assets += r.assets;
    debts += r.debts;
    refreshed++;
    if ((r as { fromCache?: boolean }).fromCache) cached++;
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
  // Skipped only when an item could not be carried forward, so the totals would
  // genuinely be missing an institution. Everything else writes a point.
  const partial = uncarryable > 0;
  const estimated = carried > 0;
  let snapshotRow: unknown = null;
  if (!partial) {
    const up = await adminRest("net_worth_snapshots?on_conflict=user_id,as_of", {
      method: "POST",
      headers: {
        // A clean run overwrites whatever today holds, because a full set of
        // live balances is the best answer available. A carried-forward run
        // must not: if a clean point was already written today it is strictly
        // better, and clobbering it would downgrade a real observation to an
        // estimate on the strength of one bank being slow an hour later.
        Prefer: estimated
          ? "resolution=ignore-duplicates,return=representation"
          : "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ user_id: userId, as_of: asOf, assets, debts, net_worth: netWorth, estimated }),
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
      `[plaid] net_worth snapshot skipped for ${asOf}: ${uncarryable} of ${items.length} items could not be carried forward (${expired} stale beyond ${CARRY_MAX_DAYS} days, ${uncarryable - expired} never refreshed)`,
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
    // `estimated` says the point was written but leans on a stale balance, which
    // is a different fact from a clean refresh and from a skipped day.
    estimated,
    items: items.length,
    refreshed,
    carried_forward: carried,
    from_cache: cached,
    // Stated separately so a trend that stops getting points has a reason in the
    // response rather than only in a log line.
    carry_expired: expired,
    failed: failures.length,
    failures,
  });
}
