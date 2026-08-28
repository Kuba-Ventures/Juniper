// POST /api/plaid/recurring-sync
// Pulls the caller's recurring transaction streams from Plaid
// (/transactions/recurring/get) and caches them in `recurring_streams`.
//
// No extra Plaid product. Recurring is entitled under Transactions, which
// Juniper already requests, so this needs no relink and no consent change.
//
// The endpoint deliberately writes NO member intent. Everything the member says
// about a stream (confirmed, dismissed, renamed, corrected) lives in
// `recurring_overrides` and is written by /api/subscriptions, because Plaid
// deprecated `is_user_modified` and discontinued modifying streams, so a
// correction has nowhere to live on their side and would be lost on the next
// detection run. This table is a cache and can be rebuilt at any time.
//
// Per item, not all-or-nothing, and in bounded parallel batches: same shape as
// networth-snapshot.ts, and for the same reason, an edge function is killed if
// it has not returned an initial response within 25 seconds and a member with a
// dozen institutions will hit that on a serial loop.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
// Deliberately no markItemSynced here. Freshness means "your balances and
// transactions are current", which is what the snapshot and transactions legs
// deliver. A recurring detection run succeeding says nothing about either, so
// stamping last_synced_at from here would report data as fresher than it is.
import { isDeadItemCode, markItemDead } from "../_item-sync-state";
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

type ItemFailure = { item_id: string; error_code: string | null; error_message: string | null; needs_relink: boolean };

// Six at a time, matching networth-snapshot.ts: enough to clear a dozen
// institutions in two rounds, far short of a rate limit.
const CONCURRENCY = 6;

type Amount = { amount?: number | null; iso_currency_code?: string | null };
type Stream = {
  stream_id: string;
  account_id?: string;
  description?: string;
  merchant_name?: string | null;
  first_date?: string;
  last_date?: string;
  frequency?: string;
  status?: string;
  is_active?: boolean;
  // Plaid documents this as present "only if the next payment date can be
  // predicted". A null is an answer, not a gap to fill.
  predicted_next_date?: string | null;
  average_amount?: Amount | null;
  last_amount?: Amount | null;
  transaction_ids?: string[];
  personal_finance_category?: { primary?: string; detailed?: string } | null;
};
type RecurringResp = {
  inflow_streams?: Stream[];
  outflow_streams?: Stream[];
  error_message?: string;
  error_code?: string;
};
type Item = { item_id: string; access_token: string };

function toRow(userId: string, itemId: string, s: Stream, direction: "inflow" | "outflow") {
  return {
    user_id: userId,
    stream_id: s.stream_id,
    item_id: itemId,
    account_id: s.account_id ?? null,
    description: s.description ?? null,
    merchant_name: s.merchant_name ?? null,
    // Same taxonomy the transactions feed uses, so a stream's category and the
    // category of the charges behind it cannot disagree.
    category: categorize(s.personal_finance_category?.primary, s.personal_finance_category?.detailed),
    plaid_status: s.status ?? "UNKNOWN",
    frequency: s.frequency ?? "UNKNOWN",
    direction,
    // Plaid signs an outflow positive here, same convention as a transaction.
    // Magnitudes are stored and `direction` carries the sense, so a consumer
    // never has to know which way Plaid happened to sign a given stream.
    average_amount: s.average_amount?.amount != null ? Math.abs(s.average_amount.amount) : null,
    last_amount: s.last_amount?.amount != null ? Math.abs(s.last_amount.amount) : null,
    last_date: s.last_date ?? null,
    predicted_next_date: s.predicted_next_date ?? null,
    is_active: s.is_active !== false,
    transaction_ids: s.transaction_ids ?? [],
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);
  if (!plaidConfigured()) return json({ error: "Plaid not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const itemsRes = await adminRest(`plaid_items?user_id=eq.${uid}&select=item_id,access_token`);
  if (!itemsRes.ok) return json({ error: "Failed to read connections" }, 500);
  const items = (await itemsRes.json()) as Item[];
  if (!items.length) return json({ items: 0, streams: 0, synced: 0, failed: 0, failures: [] });

  const failures: ItemFailure[] = [];

  const pullItem = async (item: Item): Promise<{ rows: ReturnType<typeof toRow>[]; failure: ItemFailure | null }> => {
    const r = await plaidFetch<RecurringResp>("/transactions/recurring/get", { access_token: item.access_token });
    if (!r.ok) {
      const code = r.data.error_code ?? null;
      console.error(
        `[plaid] transactions/recurring/get failed (${r.status}) for item ${item.item_id}: ${code || "unknown"} ${r.data.error_message || ""}`.trim(),
      );
      if (isDeadItemCode(code)) await markItemDead(item.item_id, code!);
      return {
        rows: [],
        failure: {
          item_id: item.item_id,
          error_code: code,
          error_message: r.data.error_message ?? null,
          needs_relink: isDeadItemCode(code),
        },
      };
    }
    return {
      rows: [
        ...(r.data.outflow_streams ?? []).map((s) => toRow(uid, item.item_id, s, "outflow")),
        ...(r.data.inflow_streams ?? []).map((s) => toRow(uid, item.item_id, s, "inflow")),
      ],
      failure: null,
    };
  };

  const rows: ReturnType<typeof toRow>[] = [];
  let synced = 0;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = await Promise.all(items.slice(i, i + CONCURRENCY).map(pullItem));
    for (const b of batch) {
      if (b.failure) { failures.push(b.failure); continue; }
      rows.push(...b.rows);
      synced++;
    }
  }

  if (rows.length) {
    const up = await adminRest("recurring_streams?on_conflict=user_id,stream_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!up.ok) {
      const detail = await up.text().catch(() => "");
      console.error(`[plaid] recurring upsert failed (${up.status}): ${detail}`);
      return json({ error: "Failed to store recurring streams", detail }, 500);
    }
  }

  // Streams Plaid no longer returns for a successfully synced item are stale
  // detections, so they are dropped. Only for items that answered: deleting on
  // behalf of an item that errored would wipe a member's whole subscription
  // list because one bank was briefly down. The member's OVERRIDES are never
  // touched here, so a stream that reappears comes back already confirmed.
  if (synced > 0 && failures.length === 0) {
    const keep = rows.map((r) => `"${r.stream_id}"`).join(",");
    const filter = keep ? `&stream_id=not.in.(${keep})` : "";
    await adminRest(`recurring_streams?user_id=eq.${uid}${filter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  const body = { items: items.length, streams: rows.length, synced, failed: failures.length, failures };
  if (synced === 0) {
    return json({ ...body, error: failures[0]?.error_message || "Plaid recurring sync failed", error_code: failures[0]?.error_code ?? null }, 502);
  }
  return json(body);
}
