// Fill merchant art for charges that were synced before the art existed.
//
// WHY THIS IS NEEDED. #178's merchant art (migration 0018) only works forward.
// /transactions/sync is incremental by cursor, so it never revisits a stored
// row, and the merchant_logos cache is written only from rows it just wrote.
// A member whose whole history synced before that shipped therefore sees no art
// at all, and keeps seeing none until each merchant happens to charge them
// again. On a real feed that is weeks, and for a merchant used once it is
// never.
//
// WHY IT ONLY WRITES merchant_logos. api/transactions.ts resolves a row's art as
// `t.logo_url ?? logoOf.get(t.merchant_name)`, so filling the merchant cache
// covers every existing row for that merchant without touching the transactions
// table. One small upsert fixes a two-year history, and rewriting those rows
// would buy nothing.
//
// WHY IT DOES NOT TOUCH THE CURSOR. Nulling transactions_cursor to replay
// history would re-download and re-upsert everything through an edge function
// with a 25 second ceiling, which is what migration 0018 explicitly ruled out.
// /transactions/get takes a date window and leaves sync state alone.
//
// WHY REPEAT RUNS ARE ALMOST FREE. It asks the database which merchants the
// member has and which of those the cache already knows, and returns without
// calling Plaid at all when nothing is missing. That is what makes it safe to
// fire on every refresh and from the daily cron.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { mapPool } from "../_pool";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

// How far back to look for art. Six months covers the recurring merchants a
// member actually recognises without paging through years of history.
const WINDOW_DAYS = 180;
// Plaid's per-call maximum for /transactions/get.
const PAGE = 500;
// Pages per item. 4 x 500 is 2000 charges, well past a typical six months, and
// a hard stop so one busy account cannot spend the whole run.
const MAX_PAGES = 4;
const ITEM_CONCURRENCY = 4;
// Merchants looked up per run. The cache check sends these as a PostgREST
// `in.()` list in the query string, and a member with hundreds of distinct
// merchants would build a URL long enough to be refused. Capped rather than
// chunked because this runs daily and on every refresh: the remainder is picked
// up on the next pass, and it converges within days without a paging loop.
const MAX_LOOKUP = 200;
const CALL_TIMEOUT_MS = 9000;
// Whole-run ceiling, under Vercel's 25s edge limit with room to answer.
const RUN_DEADLINE_MS = 18000;

interface PlaidCounterparty { name?: string | null; logo_url?: string | null; website?: string | null }
interface PlaidTxn {
  merchant_name?: string | null;
  name?: string | null;
  logo_url?: string | null;
  website?: string | null;
  counterparties?: PlaidCounterparty[] | null;
}
interface Item { item_id: string; access_token: string }
interface Mark { merchant_name: string; logo_url: string | null; website: string | null }

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try {
    const r = await adminRest(pathAndQuery);
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

// Same resolution order as the sync (artOf in transactions-sync.ts): Plaid
// leaves the top-level logo_url null on plenty of charges while still naming the
// merchant under counterparties.
function artOf(t: PlaidTxn): { logo_url: string | null; website: string | null } {
  return {
    logo_url: t.logo_url ?? t.counterparties?.find((c) => c.logo_url)?.logo_url ?? null,
    website: t.website ?? t.counterparties?.find((c) => c.website)?.website ?? null,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL) return json({ error: "Supabase not configured" }, 500);
  if (!plaidConfigured() || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  return runMerchantArtBackfill(payload.sub);
}

export async function runMerchantArtBackfill(userId: string): Promise<Response> {
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > RUN_DEADLINE_MS;

  // Which merchants does this member have, and which are already cached? Both
  // are cheap indexed reads, and together they decide whether Plaid is called at
  // all. `merchant_name` is Plaid's normalised name, which is exactly the key
  // merchant_logos uses, so the two sets are directly comparable.
  const mine = await rows<{ merchant_name: string | null }>(
    `transactions?user_id=eq.${userId}&merchant_name=not.is.null&select=merchant_name&limit=5000`,
  );
  const wanted = new Set<string>();
  for (const r of mine) if (r.merchant_name) wanted.add(r.merchant_name);
  if (wanted.size === 0) return json({ ok: true, filled: 0, missing: 0, reason: "no_merchants" });

  // Newest merchants first would be better, but `wanted` is a set built from an
  // ordered read, so insertion order already favours whatever the read returned
  // first. Slice, do not sort: a stable subset converges, a shuffled one may not.
  const lookup = [...wanted].slice(0, MAX_LOOKUP);
  const deferred = wanted.size - lookup.length;
  for (const n of [...wanted]) if (!lookup.includes(n)) wanted.delete(n);
  const list = lookup.map((n) => `"${n.replace(/"/g, '""')}"`).join(",");
  const known = await rows<{ merchant_name: string }>(
    `merchant_logos?merchant_name=in.(${list})&logo_url=not.is.null&select=merchant_name`,
  );
  for (const k of known) wanted.delete(k.merchant_name);
  // The common case after the first successful run: nothing to look up, so no
  // Plaid call and no cost to firing this on every refresh.
  if (wanted.size === 0) return json({ ok: true, filled: 0, missing: 0, reason: "already_cached" });

  const items = await rows<Item>(`plaid_items?user_id=eq.${userId}&select=item_id,access_token`);
  if (items.length === 0) return json({ ok: true, filled: 0, missing: wanted.size, reason: "no_items" });

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 86400000);
  const found = new Map<string, Mark>();
  const failures: { item_id: string; error_code: string }[] = [];

  await mapPool(items, ITEM_CONCURRENCY, async (item) => {
    for (let page = 0; page < MAX_PAGES; page++) {
      if (outOfTime()) return;
      const res = await plaidFetch<{ transactions?: PlaidTxn[]; total_transactions?: number }>(
        "/transactions/get",
        {
          access_token: item.access_token,
          start_date: ymd(start),
          end_date: ymd(end),
          options: { count: PAGE, offset: page * PAGE, include_personal_finance_category: true },
        },
        { timeoutMs: CALL_TIMEOUT_MS },
      );
      if (!res.ok) {
        // One refusing item must not fail the run: art is cosmetic, and the
        // other items may still have everything the member is looking at.
        const code = (res.data as { error_code?: string } | undefined)?.error_code ?? `HTTP_${res.status}`;
        console.error(`[plaid] transactions/get failed (${res.status}) for item ${item.item_id}: ${code}`);
        failures.push({ item_id: item.item_id, error_code: code });
        return;
      }
      const txns = res.data.transactions ?? [];
      for (const t of txns) {
        const name = t.merchant_name;
        // Only merchants still missing art, so a busy account cannot fill the
        // map with entries the cache already has.
        if (!name || !wanted.has(name) || found.has(name)) continue;
        const art = artOf(t);
        if (art.logo_url || art.website) found.set(name, { merchant_name: name, ...art });
      }
      if (txns.length < PAGE) return;
    }
  });

  if (found.size) {
    // Best effort, like the sync's own cache write: a missing logo is cosmetic
    // and must never turn into a failed request.
    await adminRest("merchant_logos?on_conflict=merchant_name", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([...found.values()]),
    }).catch(() => undefined);
  }

  return json({
    ok: true,
    filled: found.size,
    // What Plaid had no art for. These stay uncached and fall back to a
    // monogram, which is the correct answer rather than a gap to retry forever.
    missing: wanted.size - found.size,
    ...(deferred > 0 ? { deferred } : {}),
    ...(failures.length ? { failures } : {}),
    ...(outOfTime() ? { deadline_hit: true } : {}),
  });
}
