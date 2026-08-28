// GET /api/transactions
// The member's transaction history over ANY date range, paged, with a category
// rollup and summary stats for the whole range.
//
// Why this exists next to /api/finances rather than inside it: /api/finances is
// a dashboard aggregate. It rolls up the CURRENT month, takes no date
// parameter, and hands back eight recent rows for a compact card. Paging and
// range selection do not belong in an aggregate that every dashboard section
// reads, so the full history gets its own read endpoint and /api/finances is
// left alone.
//
// This is a READ-SIDE change only. api/plaid/transactions-sync.ts already pages
// until has_more is false with no date cap, so the `transactions` table already
// holds everything Plaid returned (Plaid caps at 24 months, anchored two years
// before the item was linked, not a sliding window). Nothing needs re-syncing
// for a member to see their whole history here.
//
//   ?from=YYYY-MM-DD   inclusive lower bound, default: everything
//   ?to=YYYY-MM-DD     inclusive upper bound, default: everything
//   ?limit=N           page size for the row list, 1..200, default 50
//   ?cursor=DATE_UUID  keyset cursor from a previous response's `nextCursor`
//
// THE ROLLUP RIDES ON THE FIRST PAGE ONLY. `summary`, `breakdown`, and
// `available` are computed by walking every row in the range, so recomputing
// them on each scroll page would re-read the whole history to render fifty more
// rows. They are sent when no `cursor` is given and omitted after that; the
// client holds the first page's copy while it pages.
//
// Classification is api/_categorize.ts, the same module /api/finances and the
// score snapshot read, so a figure here and the same figure on the dashboard
// cannot drift: transfers between the member's own accounts are ignored,
// income is netted, spending is summed signed so a refund reduces the category
// it came back to.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { CATEGORY_GROUPS, groupOf, kindOf } from "./_categorize";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

// Display order for the rollup comes from the taxonomy itself, so there is no
// second list of category names here to drift out of sync with the one that
// classifies. Same source /api/finances uses.
const SPEND_GROUPS = CATEGORY_GROUPS.filter((g) => g.kind === "spend").map((g) => g.label);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// One PostgREST read for the rollup walk. Supabase caps a request at 1000 rows
// by default, so this is the page size that costs the fewest round trips.
const ROLLUP_PAGE = 1000;
// Ceiling on the rollup walk. 24 months across a dozen institutions lands well
// under this; the cap exists so a pathological account cannot run an edge
// function past its 25s budget. When it bites, `truncated` says so rather than
// quietly under-reporting a total.
const ROLLUP_MAX = 20000;
// The shortest span treated as representative for a per-month figure, matching
// api/_finance-snapshot.ts. Below it the monthly number is an extrapolation
// from a floor rather than from however few days happen to exist.
const MIN_COVERED_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-fA-F-]{36}$/;

type Txn = {
  id: string;
  name: string | null;
  merchant_name: string | null;
  amount: number;
  date: string;
  category: string | null;
  pending: boolean;
  account_id: string | null;
  item_id: string | null;
  iso_currency_code: string | null;
};
type RollupTxn = Pick<Txn, "name" | "merchant_name" | "amount" | "date" | "category">;
type Acct = { account_id?: string; name?: string; mask?: string | null };
type Item = { item_id: string; institution_name: string | null; accounts: Acct[] };

const PAGE_COLS = "id,name,merchant_name,amount,date,category,pending,account_id,item_id,iso_currency_code";
const ROLLUP_COLS = "name,merchant_name,amount,date,category";

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

// The page read does NOT use rows(). A soft-failing read returns [] here, and an
// empty page is indistinguishable from "you have reached the end", so a
// malformed filter would present as a member whose history simply stops. Every
// other read on this route degrades harmlessly; this one has to be loud.
async function pageRead(pathAndQuery: string): Promise<{ ok: true; data: Txn[] } | { ok: false; detail: string }> {
  try {
    const r = await adminRest(pathAndQuery);
    if (!r.ok) return { ok: false, detail: (await r.text().catch(() => "")) || `HTTP ${r.status}` };
    return { ok: true, data: (await r.json()) as Txn[] };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Read failed" };
  }
}

// Range filter shared by the page read and the rollup walk, so the two can
// never disagree about which rows are in scope.
function rangeFilter(from: string | null, to: string | null): string {
  return `${from ? `&date=gte.${from}` : ""}${to ? `&date=lte.${to}` : ""}`;
}

// Keyset paging, not offset. The sort is (date desc, id desc) and the cursor
// carries both, so a page boundary stays put when a sync writes new rows
// mid-scroll. An offset would shift every later page by however many rows
// landed above it, silently repeating or skipping transactions.
//
// The id is a random UUID rather than a sequence, which is fine here: a
// tiebreaker only has to impose a consistent total order, not a chronological
// one.
function cursorFilter(cursor: string | null): string | null {
  if (!cursor) return "";
  const cut = cursor.indexOf("_");
  if (cut < 0) return null;
  const date = cursor.slice(0, cut);
  const id = cursor.slice(cut + 1);
  // Validated, not escaped: both halves go into a PostgREST filter expression,
  // so anything that is not exactly a date and a UUID is refused rather than
  // quoted and hoped for.
  if (!ISO_DATE.test(date) || !UUID.test(id)) return null;
  return `&or=(date.lt.${date},and(date.eq.${date},id.lt.${id}))`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from && !ISO_DATE.test(from)) return json({ error: "Invalid `from`, expected YYYY-MM-DD" }, 400);
  if (to && !ISO_DATE.test(to)) return json({ error: "Invalid `to`, expected YYYY-MM-DD" }, 400);
  if (from && to && from > to) return json({ error: "`from` is after `to`" }, 400);

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX_LIMIT, Math.floor(rawLimit)) : DEFAULT_LIMIT;

  const cursor = url.searchParams.get("cursor");
  const keyset = cursorFilter(cursor);
  if (keyset === null) return json({ error: "Invalid `cursor`" }, 400);

  const scope = `transactions?user_id=eq.${uid}${rangeFilter(from, to)}`;
  const order = "&order=date.desc,id.desc";

  // One extra row is the page-boundary test: if it comes back there is another
  // page, and it is dropped before the response is built. This avoids a second
  // count query whose answer would be stale by the time it mattered.
  const read = await pageRead(`${scope}${keyset}&select=${PAGE_COLS}${order}&limit=${limit + 1}`);
  if (!read.ok) {
    console.error(`[transactions] page read failed: ${read.detail}`);
    return json({ error: "Failed to read transactions" }, 500);
  }
  const page = read.data;
  const hasMore = page.length > limit;
  const pageRows = hasMore ? page.slice(0, limit) : page;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? `${last.date}_${last.id}` : null;

  // Institution and account names for the row list. The transactions table
  // carries Plaid's item_id and account_id but no display names, and a full
  // transactions table wants to say "Chase 1234" rather than an opaque id.
  // One read, mapped in memory, rather than a per-row lookup.
  const items = await rows<Item>(`plaid_items?user_id=eq.${uid}&select=item_id,institution_name,accounts`);
  const institutionOf = new Map<string, string>();
  const accountOf = new Map<string, { name: string; mask: string | null }>();
  for (const it of items) {
    if (it.item_id && it.institution_name) institutionOf.set(it.item_id, it.institution_name);
    for (const a of it.accounts || []) {
      if (a.account_id) accountOf.set(a.account_id, { name: a.name || "Account", mask: a.mask ?? null });
    }
  }

  const transactions = pageRows.map((t) => {
    const acct = t.account_id ? accountOf.get(t.account_id) : undefined;
    return {
      id: t.id,
      // `m` is the display label and `merchant` the raw Plaid merchant string.
      // Both ship because they answer different questions: the row renders `m`,
      // and merchant art has to be resolved from the unmodified merchant name.
      m: t.merchant_name || t.name || "Transaction",
      merchant: t.merchant_name,
      c: t.category || "Everything else",
      g: groupOf(t.category),
      k: kindOf(t.category),
      v: -t.amount, // flip Plaid's +out convention to the UI's -spend / +income
      d: t.date,
      pending: t.pending,
      currency: t.iso_currency_code || "USD",
      account: acct?.name ?? null,
      mask: acct?.mask ?? null,
      institution: t.item_id ? institutionOf.get(t.item_id) ?? null : null,
    };
  });

  const body: Record<string, unknown> = {
    range: { from: from ?? null, to: to ?? null },
    transactions,
    nextCursor,
    hasMore,
  };

  // Paged reads stop here. Everything below walks the whole range, which is the
  // work the first page pays for once (see the header note).
  if (cursor) return json(body);

  // ── The rollup walk ──────────────────────────────────────────────────────
  const all: RollupTxn[] = [];
  let truncated = false;
  for (let offset = 0; offset < ROLLUP_MAX; offset += ROLLUP_PAGE) {
    const chunk = await rows<RollupTxn>(`${scope}&select=${ROLLUP_COLS}${order}&limit=${ROLLUP_PAGE}&offset=${offset}`);
    all.push(...chunk);
    if (chunk.length < ROLLUP_PAGE) break;
    if (offset + ROLLUP_PAGE >= ROLLUP_MAX) truncated = true;
  }

  // Same three rules as /api/finances, same module deciding which is which:
  //   transfer -> ignored, it is the member's own money changing seats
  //   income   -> summed as inflow, so a reversal reduces income
  //   spend    -> summed SIGNED, so a refund nets against its own category
  const byGroup = new Map<string, number>();
  const byCat = new Map<string, number>();
  const countByGroup = new Map<string, number>();
  const countByCat = new Map<string, number>();
  const catGroup = new Map<string, string>();
  // Per-month totals, for the trend view, and income split by its own leaf
  // category, for the flow view. Both are accumulated in the SAME pass as the
  // rollup rather than by a second walk, so the trend bars and the donut can
  // never be built from different reads of the table.
  const monthly = new Map<string, { spent: number; income: number }>();
  const bumpMonth = (ym: string, field: "spent" | "income", amt: number) => {
    const m = monthly.get(ym) ?? { spent: 0, income: 0 };
    m[field] += amt;
    monthly.set(ym, m);
  };
  const byIncomeCat = new Map<string, number>();
  const countByIncomeCat = new Map<string, number>();
  let incomeRaw = 0;
  let transfersRaw = 0;
  let spendCount = 0;
  let largest: { m: string; c: string; g: string; v: number; d: string } | null = null;
  let oldest = Infinity;
  let newest = -Infinity;

  for (const t of all) {
    const ts = Date.parse(t.date);
    if (!Number.isNaN(ts)) { if (ts < oldest) oldest = ts; if (ts > newest) newest = ts; }
    const ym = t.date.slice(0, 7);
    const cat = t.category || "Everything else";
    const kind = kindOf(cat);
    if (kind === "transfer") { transfersRaw += Math.abs(t.amount); continue; }
    if (kind === "income") {
      incomeRaw -= t.amount;
      bumpMonth(ym, "income", -t.amount);
      byIncomeCat.set(cat, (byIncomeCat.get(cat) || 0) - t.amount);
      countByIncomeCat.set(cat, (countByIncomeCat.get(cat) || 0) + 1);
      continue;
    }
    const g = groupOf(cat);
    bumpMonth(ym, "spent", t.amount);
    byGroup.set(g, (byGroup.get(g) || 0) + t.amount);
    byCat.set(cat, (byCat.get(cat) || 0) + t.amount);
    countByGroup.set(g, (countByGroup.get(g) || 0) + 1);
    countByCat.set(cat, (countByCat.get(cat) || 0) + 1);
    catGroup.set(cat, g);
    spendCount++;
    // Largest single charge, not largest category. A refund is an outlier in
    // the other direction and is not "the biggest thing you bought", so only
    // money out is eligible.
    if (t.amount > 0 && (!largest || t.amount > -largest.v)) {
      largest = { m: t.merchant_name || t.name || "Transaction", c: cat, g, v: -t.amount, d: t.date };
    }
  }

  // A group whose refunds outran its spending nets negative, which a donut
  // cannot draw, so it is dropped and `spent` is DEFINED as the sum of what the
  // breakdown shows. That keeps the donut center, the legend total, and the
  // summary's Spent identical by construction. Same choice /api/finances makes.
  const breakdown = SPEND_GROUPS
    .map((label) => {
      const v = Math.round(byGroup.get(label) || 0);
      const categories = [...byCat.entries()]
        .filter(([cat]) => catGroup.get(cat) === label)
        .map(([cat, amt]) => ({ c: cat, v: Math.round(amt), n: countByCat.get(cat) || 0 }))
        .filter((c) => c.v > 0)
        .sort((a, b) => b.v - a.v);
      return { c: label, v, n: countByGroup.get(label) || 0, categories };
    })
    .filter((g) => g.v > 0);

  const spent = breakdown.reduce((a, g) => a + g.v, 0);
  const income = Math.max(0, Math.round(incomeRaw));

  // Percentages are computed here, not in the client, so the legend, the donut,
  // and any other consumer share one rounding.
  const withPct = breakdown.map((g) => ({ ...g, pct: spent > 0 ? Math.round((g.v / spent) * 1000) / 10 : 0 }));

  // How many days of history this range ACTUALLY contains, oldest row to
  // newest, rather than how many days the caller asked for. A fixed divisor
  // over a variable history is not noise, it is a consistent flattering bias:
  // dividing three weeks of spending by a month reports two thirds of reality.
  // `days` ships alongside `perMonth` so the UI can say what the average is
  // built on instead of implying a full month.
  const days = Number.isFinite(oldest) && Number.isFinite(newest)
    ? Math.floor((newest - oldest) / DAY_MS) + 1
    : 0;
  const divisorMonths = Math.max(days, MIN_COVERED_DAYS) / DAYS_PER_MONTH;

  // The member's whole available history, independent of the requested range,
  // so the client can offer an honest "All time" without guessing a start date
  // or asking for one range to discover another.
  const [first] = await rows<{ date: string }>(`transactions?user_id=eq.${uid}&select=date&order=date.asc&limit=1`);
  const [latest] = await rows<{ date: string }>(`transactions?user_id=eq.${uid}&select=date&order=date.desc&limit=1`);

  // Ascending, so the trend view can draw it left to right without re-sorting,
  // and clamped at zero: a month whose refunds outran its spending cannot be
  // drawn as a bar, and the same clamp is what /api/finances applies to a
  // refund-heavy budget. `spent` above is NOT clamped per month, so in that rare
  // case the bars sum to slightly more than the total. The alternative is a
  // negative bar, which reads as a data error rather than as a refund.
  const trend = [...monthly.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([ym, m]) => ({ ym, spent: Math.max(0, Math.round(m.spent)), income: Math.max(0, Math.round(m.income)) }));

  // Income by leaf category (Paycheck, Interest & dividends, and the rest),
  // which the flow view needs to show where money came IN from. The spend
  // breakdown above only ever answers where it went.
  const incomeBreakdown = [...byIncomeCat.entries()]
    .map(([c, v]) => ({ c, v: Math.round(v), n: countByIncomeCat.get(c) || 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);

  body.available = { from: first?.date ?? null, to: latest?.date ?? null };
  body.breakdown = withPct;
  body.trend = trend;
  body.incomeBreakdown = incomeBreakdown;
  body.summary = {
    count: all.length,
    spendCount,
    spent,
    income,
    // Net is income minus consumption, so money moved to savings counts as kept
    // rather than spent. Transfers are excluded from both sides.
    net: income - spent,
    transfers: Math.round(transfersRaw),
    average: spendCount ? Math.round(spent / spendCount) : 0,
    perMonth: Math.round(spent / divisorMonths),
    days,
    largest,
  };
  if (truncated) body.truncated = true;

  return json(body);
}
