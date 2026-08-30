// POST /api/plaid/transactions-sync
// Pulls the caller's transactions from Plaid via /transactions/sync (cursor-based,
// incremental) and upserts them into the `transactions` table. The Plaid
// access_token is read server-side only (service-role) and never leaves here.
//
// Requires: migration 0008 applied, `transactions` in PLAID_PRODUCTS, and at
// least one linked item. Safe to call repeatedly, it resumes from the stored
// cursor and dedups on plaid_transaction_id.
//
// Per item, not all-or-nothing: a connection Plaid refuses is logged, reported
// in `failures`, and skipped, so the member's other institutions still sync.
// Only a run where every item failed returns a non-200.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { isDeadItemCode, markItemSynced, markItemDead } from "../_item-sync-state";
import { categorize, categoryIdOf } from "../_categorize";

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

type PlaidTxn = {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code?: string | null;
  date: string;
  name?: string;
  merchant_name?: string | null;
  pending?: boolean;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
  // Plaid enrichment, already included with Transactions. `logo_url` is the
  // merchant's mark; `counterparties` carries the same for the parties behind a
  // charge, which is where the art lives when the top-level merchant is a
  // payment processor rather than the shop.
  logo_url?: string | null;
  website?: string | null;
  counterparties?: { name?: string | null; logo_url?: string | null; website?: string | null; type?: string | null }[];
};
type ItemFailure = { item_id: string; error_code: string | null; error_message: string | null; needs_relink: boolean };

type SyncResp = {
  added?: PlaidTxn[];
  modified?: PlaidTxn[];
  removed?: { transaction_id: string }[];
  next_cursor?: string;
  has_more?: boolean;
  error_message?: string;
  error_code?: string;
};

// Top-level first, then the first counterparty that has one. Plaid leaves the
// top-level `logo_url` null on plenty of charges while still naming the
// merchant underneath, so falling through to counterparties is what takes this
// from "some rows have art" to "most rows do".
function artOf(t: PlaidTxn): { logo_url: string | null; website: string | null } {
  const logo = t.logo_url ?? t.counterparties?.find((c) => c.logo_url)?.logo_url ?? null;
  const site = t.website ?? t.counterparties?.find((c) => c.website)?.website ?? null;
  return { logo_url: logo, website: site };
}

function toRow(userId: string, itemId: string, t: PlaidTxn) {
  const pfc = t.personal_finance_category ?? {};
  const category = categorize(pfc.primary, pfc.detailed);
  const art = artOf(t);
  return {
    user_id: userId,
    item_id: itemId,
    account_id: t.account_id,
    plaid_transaction_id: t.transaction_id,
    name: t.name ?? null,
    merchant_name: t.merchant_name ?? null,
    amount: t.amount,
    iso_currency_code: t.iso_currency_code ?? "USD",
    date: t.date,
    pending: !!t.pending,
    plaid_category: pfc.primary ?? null,
    category,
    // Written beside the label, read by nothing yet: stage 1 of
    // docs/CUSTOM_CATEGORIES.md. Null for a label outside the taxonomy.
    category_id: categoryIdOf(category),
    category_source: "plaid",
    logo_url: art.logo_url,
    website: art.website,
    updated_at: new Date().toISOString(),
  };
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
  return runTransactionsSync(payload.sub);
}

// The work, with the caller already established. Same split as
// networth-snapshot.ts, and for the same reason: the daily cron runs this for
// members who never open the app and so never present a JWT.
export async function runTransactionsSync(userId: string): Promise<Response> {
  // Load the caller's linked items (server-only: access_token + cursor).
  const itemsRes = await adminRest(
    `plaid_items?user_id=eq.${userId}&select=item_id,access_token,transactions_cursor`,
  );
  if (!itemsRes.ok) {
    // Logged, not just returned. syncFinances() fires this endpoint in the
    // background and drops the body, so an unlogged failure means a member's
    // transactions silently never arrive and nothing in the Vercel logs says
    // why. A non-2xx PostgREST body is an error object (code/message/hint), not
    // rows, so this cannot print an access_token even though the query selects
    // one. Same shape as the logging in link-token.ts.
    const detail = await itemsRes.text().catch(() => "");
    console.error(`[plaid] transactions/sync could not read items (${itemsRes.status}): ${detail}`);
    return json({ error: "Failed to read items" }, 500);
  }
  const items = (await itemsRes.json().catch(() => [])) as {
    item_id: string; access_token: string; transactions_cursor: string | null;
  }[];
  if (!items.length) return json({ added: 0, modified: 0, removed: 0, items: 0, synced: 0, failed: 0, failures: [] });

  // Categories the member set BY HAND, keyed by Plaid's transaction id. The
  // upsert below is `resolution=merge-duplicates`, which replaces the whole row,
  // and `toRow` writes Plaid's own classification with `category_source:
  // "plaid"` every time. So without this, a correction would survive right up
  // until Plaid next put that transaction in `modified` (or a failed sync
  // replayed the cursor from its last good position) and then vanish with no
  // trace and no error. Read once per sync, not per item: one query bounded by
  // how many corrections the member has made, against a partial-ish index on
  // (user_id, category).
  const overrides = new Map<string, string>();
  const ovRes = await adminRest(
    `transactions?user_id=eq.${userId}&category_source=eq.user&plaid_transaction_id=not.is.null&select=plaid_transaction_id,category`,
  );
  if (ovRes.ok) {
    const rows = (await ovRes.json().catch(() => [])) as { plaid_transaction_id: string; category: string | null }[];
    for (const r of rows) if (r.category) overrides.set(r.plaid_transaction_id, r.category);
  } else {
    // Not fatal, but it must be loud: proceeding here silently reverts every
    // correction this member has ever made. Skipping the sync instead would
    // strand the feed on a transient read failure, which is worse, so the
    // trade is recorded rather than hidden.
    console.error(`[plaid] could not read category overrides for ${userId} (${ovRes.status}); a sync now may revert them`);
  }

  let added = 0, modified = 0, removed = 0;
  // Items are isolated from each other, same reasoning as networth-snapshot.ts:
  // this loop used to return on the first item Plaid refused, so one dead
  // connection (a token minted under a different PLAID_ENV, an expired login)
  // cost the member every other item's transactions too.
  const failures: ItemFailure[] = [];
  let synced = 0;

  for (const item of items) {
    let cursor = item.transactions_cursor ?? undefined;
    let hasMore = true;
    let guard = 0; // cap pages to avoid runaway loops
    let failed = false;

    while (hasMore && guard < 20) {
      guard++;
      const sync = await plaidFetch<SyncResp>("/transactions/sync", {
        access_token: item.access_token,
        ...(cursor ? { cursor } : {}),
        count: 250,
      });
      if (!sync.ok) {
        // Product not ready / not enabled / dead item. Recorded and skipped, not
        // fatal to the run. The log line is the only place this is visible in
        // practice (see above); error_code and error_message are Plaid status
        // strings, never credentials, and item_id is already client-visible.
        const code = sync.data.error_code ?? null;
        console.error(
          `[plaid] transactions/sync failed (${sync.status}) for item ${item.item_id}: ${code || "unknown"} ${sync.data.error_message || ""}`.trim(),
        );
        failures.push({
          item_id: item.item_id,
          error_code: code,
          error_message: sync.data.error_message ?? null,
          needs_relink: isDeadItemCode(code),
        });
        // Recorded so a later page load can name this connection without
        // calling Plaid again. Only dead-item codes are stored, see
        // _item-sync-state.ts.
        if (isDeadItemCode(code)) await markItemDead(item.item_id, code!);
        failed = true;
        break;
      }
      const d = sync.data;
      const upserts = [...(d.added ?? []), ...(d.modified ?? [])]
        .map((t) => toRow(userId, item.item_id, t))
        .map((row) => {
          // The member's own answer wins over Plaid's. Kept as `user` so it
          // keeps winning on every future sync, rather than being written back
          // as `plaid` and reverting the next time round.
          const mine = overrides.get(row.plaid_transaction_id);
          return mine
            ? { ...row, category: mine, category_id: categoryIdOf(mine), category_source: "user" }
            : row;
        });
      if (upserts.length) {
        const up = await adminRest("transactions?on_conflict=plaid_transaction_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(upserts),
        });
        if (!up.ok) {
          // The failure that hurts most: Plaid handed us rows and we dropped
          // them, so the dashboard shows a linked bank with no feed forever. A
          // missing migration or a column mismatch reads straight out of this
          // detail (PostgREST's error text, no token material in it).
          const detail = await up.text().catch(() => "");
          console.error(`[plaid] transactions upsert failed (${up.status}) for item ${item.item_id}: ${detail}`);
          failures.push({
            item_id: item.item_id,
            error_code: "STORAGE_FAILED",
            error_message: detail || "Failed to store transactions",
            needs_relink: false,
          });
          failed = true;
          break;
        }
        added += d.added?.length ?? 0;
        modified += d.modified?.length ?? 0;
        // Merchant-level cache, so art found on one charge covers every other
        // charge from that merchant, including rows written before this column
        // existed. This is what makes a full re-sync unnecessary: /transactions
        // /sync never revisits old rows, so without it those rows would carry no
        // art forever. Deduped per batch, since a page routinely holds several
        // charges from the same shop.
        const marks = new Map<string, { merchant_name: string; logo_url: string | null; website: string | null }>();
        for (const r of upserts) {
          if (!r.merchant_name || (!r.logo_url && !r.website)) continue;
          if (!marks.has(r.merchant_name)) {
            marks.set(r.merchant_name, { merchant_name: r.merchant_name, logo_url: r.logo_url, website: r.website });
          }
        }
        if (marks.size) {
          // Best effort. A missing logo is cosmetic and must never fail a sync
          // that has already stored the member's transactions.
          await adminRest("merchant_logos?on_conflict=merchant_name", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([...marks.values()]),
          }).catch(() => undefined);
        }
      }
      const removedIds = (d.removed ?? []).map((r) => r.transaction_id);
      if (removedIds.length) {
        const list = removedIds.map((id) => `"${id}"`).join(",");
        await adminRest(`transactions?user_id=eq.${userId}&plaid_transaction_id=in.(${list})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        removed += removedIds.length;
      }
      cursor = d.next_cursor ?? cursor;
      hasMore = !!d.has_more;
    }

    // Deliberately not persisting the cursor for a failed item: the next call
    // then replays from the last good position, which is safe because the upsert
    // dedups on plaid_transaction_id.
    if (failed) continue;

    // Persist the cursor so the next call is incremental.
    await adminRest(`plaid_items?item_id=eq.${item.item_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ transactions_cursor: cursor ?? null }),
    });
    await markItemSynced(item.item_id);
    synced++;
  }

  // Only a total loss is an error. A partial sync is a real success: whatever
  // landed is now on the member's dashboard, and `failed`/`failures` tell the
  // caller which connections did not.
  const body = { added, modified, removed, items: items.length, synced, failed: failures.length, failures };
  if (synced === 0) {
    return json({ ...body, error: failures[0]?.error_message || "Plaid sync failed", error_code: failures[0]?.error_code ?? null }, 502);
  }
  return json(body);
}
