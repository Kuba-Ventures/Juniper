// POST /api/plaid/transactions-sync
// Pulls the caller's transactions from Plaid via /transactions/sync (cursor-based,
// incremental) and upserts them into the `transactions` table. The Plaid
// access_token is read server-side only (service-role) and never leaves here.
//
// Requires: migration 0008 applied, `transactions` in PLAID_PRODUCTS, and at
// least one linked item. Safe to call repeatedly, it resumes from the stored
// cursor and dedups on plaid_transaction_id.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { categorize } from "../_categorize";

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
};
type SyncResp = {
  added?: PlaidTxn[];
  modified?: PlaidTxn[];
  removed?: { transaction_id: string }[];
  next_cursor?: string;
  has_more?: boolean;
  error_message?: string;
  error_code?: string;
};

function toRow(userId: string, itemId: string, t: PlaidTxn) {
  const pfc = t.personal_finance_category ?? {};
  const category = categorize(pfc.primary, pfc.detailed);
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
    category_source: "plaid",
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
  const userId = payload.sub;

  // Load the caller's linked items (server-only: access_token + cursor).
  const itemsRes = await adminRest(
    `plaid_items?user_id=eq.${userId}&select=item_id,access_token,transactions_cursor`,
  );
  if (!itemsRes.ok) return json({ error: "Failed to read items" }, 500);
  const items = (await itemsRes.json().catch(() => [])) as {
    item_id: string; access_token: string; transactions_cursor: string | null;
  }[];
  if (!items.length) return json({ added: 0, modified: 0, removed: 0, items: 0 });

  let added = 0, modified = 0, removed = 0;

  for (const item of items) {
    let cursor = item.transactions_cursor ?? undefined;
    let hasMore = true;
    let guard = 0; // cap pages to avoid runaway loops

    while (hasMore && guard < 20) {
      guard++;
      const sync = await plaidFetch<SyncResp>("/transactions/sync", {
        access_token: item.access_token,
        ...(cursor ? { cursor } : {}),
        count: 250,
      });
      if (!sync.ok) {
        // Product not ready / not enabled etc., skip this item, report it.
        return json({ error: sync.data.error_message || "Plaid sync failed", error_code: sync.data.error_code, item_id: item.item_id }, 502);
      }
      const d = sync.data;
      const upserts = [...(d.added ?? []), ...(d.modified ?? [])].map((t) => toRow(userId, item.item_id, t));
      if (upserts.length) {
        const up = await adminRest("transactions?on_conflict=plaid_transaction_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(upserts),
        });
        if (!up.ok) return json({ error: "Failed to store transactions", detail: await up.text().catch(() => "") }, 500);
        added += d.added?.length ?? 0;
        modified += d.modified?.length ?? 0;
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

    // Persist the cursor so the next call is incremental.
    await adminRest(`plaid_items?item_id=eq.${item.item_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ transactions_cursor: cursor ?? null }),
    });
  }

  return json({ added, modified, removed, items: items.length });
}
