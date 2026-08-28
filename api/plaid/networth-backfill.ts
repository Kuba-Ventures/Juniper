// POST /api/plaid/networth-backfill
//
// Plaid reports only CURRENT balances, so net_worth_snapshots (0008) can only
// grow forward from the day someone linked: a member three weeks in has a trend
// line that is one dot, while Plaid is already holding months of their
// transaction history. This endpoint fills the earlier days in, which is how
// every product that shows pre-signup net worth does it. Nothing is fetched that
// Plaid does not already have; the past is derived from the present plus the
// transactions that moved it.
//
// The arithmetic, per account and per day, walking backward:
//
//   cash(day)   = cash(day + 1) + sum(amount of that account's txns on day + 1)
//   owed(day)   = owed(day + 1) - sum(amount of that account's txns on day + 1)
//   invest(day) = invest(day + 1) - net external contributions on day + 1
//
// Plaid's sign convention is positive = money out. So on a checking account a
// purchase lowered the balance, meaning the day before it was HIGHER by that
// amount, hence the plus. On a card the same purchase RAISED the amount owed, so
// the day before it was lower, hence the minus. A card payment lands in both
// buckets, as an outflow on the checking account and an inflow on the card, and
// nets to zero against net worth, which is correct: paying a card moves nothing.
//
// Investments are the one balance that cannot be reconstructed exactly. A
// holding's value moves with the market, and market movement is not a
// transaction, so no transaction stream can recover it and Plaid publishes no
// historical price feed. What IS recoverable is money the member added or took
// out, from /investments/transactions. So the backfilled invested balance is
// today's holdings minus net contributions since that day: contributions are
// counted, market movement is not. Over the weeks a new member actually looks
// at, contributions dominate and this is close; over a year it is not, which is
// why BACKFILL_MAX_DAYS is bounded and why every row written here is flagged
// `estimated` so the chart can dash it rather than presenting it as observed.
//
// Idempotent and safe to re-run: rows are inserted with
// resolution=ignore-duplicates, so a real recorded snapshot for a day always
// wins over a reconstruction of that same day.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { fetchManualAccounts, sumManualAccounts } from "../_manual-accounts";
import { walkBackward } from "../_networth-walk";

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

// How far back to reconstruct. Two reasons for a bound rather than "all the
// history Plaid has". The invested balance drifts further from the truth the
// further back it goes, since it carries no market movement; and /api/finances
// reads the trend with limit=400, so writing more days than it will ever select
// would spend Plaid calls and rows on points nobody can see.
const BACKFILL_MAX_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type StoredAccount = { account_id: string; type: string | null; balance: number | null };
type Item = { item_id: string; access_token: string; accounts: StoredAccount[] | null };
type Txn = { account_id: string | null; amount: number; date: string };

// Which bucket an account's balance belongs to. Mirrors the classification in
// networth-snapshot.ts and _finance-snapshot.ts: depository is cash, investment
// and brokerage are invested, credit and loan are owed.
type Bucket = "cash" | "invest" | "debt";
function bucketOf(type: string | null): Bucket | null {
  switch ((type ?? "").toLowerCase()) {
    case "depository": return "cash";
    case "investment":
    case "brokerage": return "invest";
    case "credit":
    case "loan": return "debt";
    default: return null;
  }
}

// Which investment transactions moved value ACROSS the account boundary, which
// are the only ones that change the account's total value. Classified by
// SUBTYPE, not by type, and that is the whole trick. Plaid files `contribution`
// under type `buy` and `distribution` under type `sell`, because a contribution
// into an IRA usually arrives as cash and a purchase in one row, so gating on
// type `cash`/`transfer` would miss exactly the flow that matters most here: the
// money someone puts into their Roth.
//
// Direction also comes from the subtype rather than the sign, because the sign
// cannot be trusted for it. Plaid signs inflows of cash negative and outflows
// positive, but documents that "for transactions representing a simultaneous
// cash contribution and purchase of a security, the portion representing the
// purchase takes precedence, and the amount is represented as positive". So a
// contribution, money arriving, is signed like a purchase.
const CONTRIBUTION_SUBTYPES = new Set(["deposit", "contribution"]);
const WITHDRAWAL_SUBTYPES = new Set(["withdrawal", "distribution"]);
// The two subtypes that are genuinely bidirectional ("movement of assets into or
// out of an account"), where the sign IS the only direction signal.
const SIGNED_SUBTYPES = new Set(["transfer", "send"]);

// Deliberately not counted as external, and each for its own reason:
//
//   dividend, interest, capital gains: return generated by assets already in the
//   account, not money the member added. Subtracting them walking backward would
//   credit the member's deposits with the portfolio's own earnings.
//
//   dividend reinvestment, interest reinvestment: cash already inside the
//   account buying a security. Counting the dividend while ignoring the buy
//   would move a balance that never changed.
//
//   splits, mergers, spin-offs, exercises, expirations: corporate actions and
//   option mechanics. They change what is held, not what it is worth to us here.
//
//   fees and taxes: these DO reduce the account's value, so leaving them out
//   understates past balances slightly. They are out of scope on purpose: the
//   subtype list is long, several entries have no documented parent type, and a
//   fee is small next to the market movement this reconstruction already cannot
//   see. Worth revisiting only if the invested line looks systematically high.
//
//   pending credit, pending debit: a pending row may also post later, and Plaid
//   does not document whether both appear, so counting them risks double
//   counting a single movement.
//
// type `cancel` is skipped outright below: it reverses another row rather than
// describing a movement of its own.

type InvestmentTxn = {
  account_id?: string;
  amount?: number;
  date?: string;
  type?: string;
  subtype?: string;
};

// Net money added to investment accounts, per day. Positive means value entered
// the account from outside on that day, which is the amount to remove when
// stepping backward past it.
async function investmentFlowsByDay(
  accessToken: string,
  investmentAccountIds: Set<string>,
  startDate: string,
  endDate: string,
): Promise<{ flows: Map<string, number>; ok: boolean }> {
  const flows = new Map<string, number>();
  if (!investmentAccountIds.size) return { flows, ok: true };

  // Paged: Plaid caps a page at 500 and reports the full count, so this asks for
  // pages until it has seen them all rather than trusting a single response to
  // be complete.
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const { ok, status, data } = await plaidFetch<{
      investment_transactions?: InvestmentTxn[];
      total_investment_transactions?: number;
      error_message?: string;
    }>("/investments/transactions/get", {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset },
    });

    if (!ok) {
      // Expected, not exceptional, and worth spelling out because it is the most
      // likely outcome on an existing item. Plaid's Data Transparency Messaging
      // (on by default for US Link sessions since October 2024) only lets a
      // product be added after the fact if it was named in
      // additional_consented_products at link time; otherwise the call fails and
      // the member has to pass through update mode. link-token.ts now consents to
      // investments so items linked from here on can serve this, but anything
      // linked before cannot. There is also a one to two minute window right
      // after linking where Plaid answers PRODUCT_NOT_READY.
      //
      // In every one of those cases the invested balance is carried back flat and
      // the response says so, rather than failing a backfill whose cash and card
      // arithmetic is perfectly good.
      console.error(
        `[plaid] investments/transactions/get failed (${status}): ${data.error_message || "unknown error"}`,
      );
      return { flows, ok: false };
    }

    const page_rows = data.investment_transactions ?? [];
    for (const t of page_rows) {
      if (!t.date || !t.account_id || !investmentAccountIds.has(t.account_id)) continue;
      if ((t.type ?? "").toLowerCase() === "cancel") continue;
      const subtype = (t.subtype ?? "").toLowerCase();
      const amount = typeof t.amount === "number" ? t.amount : 0;
      if (!Number.isFinite(amount) || amount === 0) continue;

      // Magnitude from the amount, direction from the subtype, except for the
      // two bidirectional subtypes where the sign is all there is. Plaid signs
      // an inflow of cash negative, so `-amount` is the inflow.
      let delta = 0;
      if (CONTRIBUTION_SUBTYPES.has(subtype)) delta = Math.abs(amount);
      else if (WITHDRAWAL_SUBTYPES.has(subtype)) delta = -Math.abs(amount);
      else if (SIGNED_SUBTYPES.has(subtype)) delta = -amount;
      else continue; // internal, or a subtype with no documented parent type

      flows.set(t.date, (flows.get(t.date) ?? 0) + delta);
    }

    const total = data.total_investment_transactions ?? page_rows.length;
    offset += page_rows.length;
    if (!page_rows.length || offset >= total) break;
  }

  return { flows, ok: true };
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
  const uid = payload.sub;

  const itemsRes = await adminRest(`plaid_items?user_id=eq.${uid}&select=item_id,access_token,accounts`);
  if (!itemsRes.ok) {
    const detail = await itemsRes.text().catch(() => "");
    console.error(`[plaid] networth-backfill could not read items (${itemsRes.status}): ${detail}`);
    return json({ error: "Failed to read items" }, 500);
  }
  const items = (await itemsRes.json().catch(() => [])) as Item[];
  if (!items.length) return json({ linked: false, written: 0 });

  // Today's balances, bucketed, from the stored per-item snapshot. Deliberately
  // not a fresh Plaid balance call: the snapshot is rewritten on every sync, and
  // the live figure for today is networth-snapshot's job. This endpoint's
  // question is only "what were the days before it".
  const buckets: Record<Bucket, number> = { cash: 0, invest: 0, debt: 0 };
  const accountBucket = new Map<string, Bucket>();
  const investIdsByItem = new Map<string, Set<string>>();
  for (const it of items) {
    const investIds = new Set<string>();
    for (const a of it.accounts ?? []) {
      const bucket = bucketOf(a.type);
      if (!bucket || !a.account_id) continue;
      accountBucket.set(a.account_id, bucket);
      const bal = typeof a.balance === "number" ? a.balance : 0;
      if (!Number.isFinite(bal)) continue;
      buckets[bucket] += bucket === "debt" ? Math.abs(bal) : bal;
      if (bucket === "invest") investIds.add(a.account_id);
    }
    investIdsByItem.set(it.item_id, investIds);
  }

  const todayMs = Date.parse(iso(Date.now()));
  const floorMs = todayMs - BACKFILL_MAX_DAYS * DAY_MS;

  const txnRes = await adminRest(
    `transactions?user_id=eq.${uid}&date=gte.${iso(floorMs)}&select=account_id,amount,date&order=date.asc&limit=5000`,
  );
  if (!txnRes.ok) {
    const detail = await txnRes.text().catch(() => "");
    console.error(`[plaid] networth-backfill could not read transactions (${txnRes.status}): ${detail}`);
    return json({ error: "Failed to read transactions" }, 500);
  }
  const txns = (await txnRes.json().catch(() => [])) as Txn[];
  if (!txns.length) return json({ linked: true, written: 0, reason: "no transactions to walk back through" });

  // Per-day movement, already split by what it does to net worth.
  const cashByDay = new Map<string, number>();
  const debtByDay = new Map<string, number>();
  let oldestMs = todayMs;
  for (const t of txns) {
    const bucket = t.account_id ? accountBucket.get(t.account_id) : undefined;
    const amount = typeof t.amount === "number" ? t.amount : 0;
    if (!bucket || !Number.isFinite(amount)) continue;
    const dayMs = Date.parse(t.date);
    if (Number.isNaN(dayMs) || dayMs > todayMs) continue;
    if (dayMs < oldestMs) oldestMs = dayMs;
    if (bucket === "cash") cashByDay.set(t.date, (cashByDay.get(t.date) ?? 0) + amount);
    else if (bucket === "debt") debtByDay.set(t.date, (debtByDay.get(t.date) ?? 0) + amount);
    // Investment accounts do carry rows in /transactions on some institutions,
    // but they describe activity inside the account, not its value, so the
    // invested balance is stepped by the flows below instead.
  }

  // Net external investment flows per day, across every item that serves them.
  const flowsByDay = new Map<string, number>();
  let investmentsAdjusted = 0;
  let investmentsUnavailable = 0;
  for (const it of items) {
    const ids = investIdsByItem.get(it.item_id);
    if (!ids || !ids.size) continue;
    const { flows, ok } = await investmentFlowsByDay(it.access_token, ids, iso(oldestMs), iso(todayMs));
    if (!ok) {
      investmentsUnavailable += 1;
      continue;
    }
    investmentsAdjusted += 1;
    for (const [day, delta] of flows) flowsByDay.set(day, (flowsByDay.get(day) ?? 0) + delta);
  }

  // Manual accounts are held flat across the whole window. They carry no
  // transactions and no history by construction (the member maintains the
  // balance by hand), so there is nothing to walk backward through, and holding
  // them flat is the only claim the data supports.
  const manual = sumManualAccounts(await fetchManualAccounts(uid));
  const manualAssets = manual.cash + manual.invest;
  const manualDebts = manual.cardDebt + manual.loanDebt;

  // The arithmetic itself lives in ../_networth-walk so it can be run against a
  // worked example without a Plaid key or a database. Today is left out of it:
  // networth-snapshot observes today rather than deriving it.
  const out = walkBackward({
    today: iso(todayMs),
    oldest: iso(oldestMs),
    cash: buckets.cash,
    invest: buckets.invest,
    debt: buckets.debt,
    cashByDay,
    debtByDay,
    flowsByDay,
    manualAssets,
    manualDebts,
  }).map((d) => ({ user_id: uid, ...d, estimated: true }));

  if (!out.length) return json({ linked: true, written: 0, reason: "no earlier days to reconstruct" });

  // ignore-duplicates, not merge: a day Juniper actually observed must never be
  // overwritten by a reconstruction of that day, and re-running this endpoint
  // must be a no-op rather than a rewrite.
  const up = await adminRest("net_worth_snapshots?on_conflict=user_id,as_of", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(out),
  });
  if (!up.ok) {
    const detail = await up.text().catch(() => "");
    console.error(`[plaid] networth-backfill upsert failed (${up.status}): ${detail}`);
    return json({ error: "Failed to save backfill", detail }, 500);
  }
  const written = ((await up.json().catch(() => [])) as unknown[]).length;

  return json({
    linked: true,
    // Days offered and days actually new, which differ once a member has been
    // around long enough to have recorded points inside the window.
    days: out.length,
    written,
    from: out[out.length - 1]?.as_of ?? null,
    to: out[0]?.as_of ?? null,
    // Whether the invested portion was adjusted for contributions, per item, so
    // a caller can tell "no investments" from "investments we could not read".
    investments_adjusted: investmentsAdjusted,
    investments_unavailable: investmentsUnavailable,
  });
}
