// GET /api/finances
// Assembles the dashboard's money data for the caller from the Stage-3 tables
// (transactions, budgets, net_worth_snapshots), the linked-account snapshots in
// plaid_items, and the hand-entered rows in manual_accounts. Read-only.
//
// Gated per section, not globally: balances ship the moment an account exists,
// and the transaction-derived sections (cashflow, spending, budgets,
// transactions) ship only once transaction rows exist, flagged by
// `hasTransactions` so the client never has to infer it. Returns
// { linked: false } only when all three sources are empty, so the frontend keeps
// its demo mock until the member has data of their own. Sections with no source
// are omitted rather than zero-filled: the client merges what arrives over the
// member's own manual figures, and a zero would overwrite a real one with a lie.
// Colors are added client-side.
//
// Spending, income, and the breakdown all read the taxonomy in ./_categorize:
// transfers between the member's own accounts and credit-card payments are not
// consumption and are excluded from every figure here. See the cashflow block
// below for why that was a real bug and not a rounding nicety.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { fetchScoreInput } from "./_finance-snapshot";
import { fetchManualAccounts, manualBucket } from "./_manual-accounts";
import { computeScore } from "./_score";
import { taxonomyFor } from "./_taxonomy";
import { isDeveloperEmail } from "./_admin";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Display order for the spending rollup comes from the taxonomy itself
// (api/_categorize.ts), so there is no second list of category names here to
// drift out of sync with the one that actually classifies transactions. The old
// hand-kept CAT_ORDER is what this replaces.
// SPEND_GROUPS used to be a module constant derived from CATEGORY_GROUPS. It is
// read off the member's resolved taxonomy now (`tax.spendGroups`), because in a
// later stage the set of groups is a fact about the member, and a constant here
// would be a second answer to a question the resolver already owns.
const fmtDay = (d: string) => { const [, m, day] = d.split("-"); return `${MONTHS[+m - 1]} ${+day}`; };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

type Txn = { name: string | null; merchant_name: string | null; amount: number; date: string; category: string | null; category_id: string | null; logo_url: string | null };
type Bud = { category: string; category_id: string | null; limit_amount: number };
type Snap = { as_of: string; net_worth: number; estimated?: boolean };
type ScoreRow = { as_of: string; value: number };
type Acct = { name: string; mask: string | null; type: string | null; subtype: string | null; balance: number | null };
type Item = {
  institution_name: string | null;
  accounts: Acct[];
  // Per-item sync state (migration 0017). Absent on a deploy where 0017 has not
  // been applied, which is why every read of these is optional: the page then
  // simply shows no freshness line rather than breaking.
  last_synced_at?: string | null;
  last_error_code?: string | null;
  last_error_at?: string | null;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ linked: false });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const items = await rows<Item>(`plaid_items?user_id=eq.${uid}&select=institution_name,accounts,last_synced_at,last_error_code,last_error_at`);
  const txns = await rows<Txn>(`transactions?user_id=eq.${uid}&select=name,merchant_name,amount,date,category,category_id,logo_url&order=date.desc&limit=400`);
  // Manual accounts (tier 3) are a balance source in their own right, so they're
  // read up here with the other two: the "does this member have anything" test
  // below has to see all three. Balance-less entries are dropped (they still
  // show under Connections, there's just nothing to add to a rollup).
  const manualAccts = (await fetchManualAccounts(uid)).filter((m) => m.balance != null);

  // Per-section gating starts here. The old single gate (items AND txns) held
  // back the whole payload whenever the transaction feed was empty, so a member
  // who had just linked a bank, or typed their accounts in by hand, saw net
  // worth $0 and "No accounts yet" while their balances sat in these very rows.
  // Transactions land minutes after a link, and never at all for some
  // institutions, so balances must not queue behind them.
  const hasAccounts = items.length > 0 || manualAccts.length > 0;
  const hasTransactions = txns.length > 0;
  if (!hasAccounts && !hasTransactions) return json({ linked: false });

  // Budgets only mean something next to a this-month spend figure, so they're
  // read only when there are transactions to measure them against.
  const budgets = hasTransactions
    ? await rows<Bud>(`budgets?user_id=eq.${uid}&select=category,category_id,limit_amount`)
    : [];
  const snaps = await rows<Snap>(`net_worth_snapshots?user_id=eq.${uid}&select=as_of,net_worth,estimated&order=as_of.asc&limit=400`);

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const thisMonth = txns.filter((t) => t.date.startsWith(ym));

  // ── This month's cashflow and spending ──────────────────────────────────
  //
  // The sign of an amount says which way the money moved (Plaid: positive is
  // out); the CATEGORY says what kind of movement it was. Reading only the sign,
  // which is what this used to do, made every outflow spending and every inflow
  // income, so a transfer to savings, a Venmo to a friend, and a credit-card
  // payment all registered as money spent, and a refund or a transfer in
  // registered as earnings. The card payment was the worst of it: the purchases
  // behind it already counted when they happened, so the member was billed twice
  // for the same month.
  //
  // Three rules, one pass:
  //   transfer  -> ignored entirely, it is the member's own money changing seats
  //   income    -> summed as inflow, so a reversal (an outflow on an income
  //                category) reduces income rather than becoming spending
  //   spend     -> summed SIGNED, so a refund nets against the category it came
  //                back to instead of masquerading as income
  // Resolved once for this member and used for every classification below, so
  // the donut, the budgets and the recent rows on one response cannot disagree
  // about what a category is. Stage 2 of docs/CUSTOM_CATEGORIES.md.
  const tax = await taxonomyFor(uid);
  const byCat = new Map<string, number>();   // leaf category -> net spend, for budgets
  const byGroup = new Map<string, number>(); // group -> net spend, for the donut
  let incomeRaw = 0;
  for (const t of thisMonth) {
    // Id first, so a renamed category is one bucket across the month rather
    // than two: rows written before the rename still carry the old label.
    const { c: cat, g, k: kind } = tax.classify(t.category_id, t.category);
    if (kind === "transfer") continue;
    if (kind === "income") { incomeRaw -= t.amount; continue; }
    byCat.set(cat, (byCat.get(cat) || 0) + t.amount);
    byGroup.set(g, (byGroup.get(g) || 0) + t.amount);
  }

  // The breakdown is by GROUP, not leaf category: nine coherent wedges instead
  // of forty slivers, and the two-level table is what makes that a derived view
  // rather than a second stored vocabulary. Order follows the table.
  //
  // A group whose refunds outran its spending nets negative, which a donut
  // cannot draw, so it is dropped from the breakdown and `spent` is defined as
  // the sum of what the breakdown shows. That keeps the card header, the donut
  // center, and the "Spent" figure in the cashflow strip identical by
  // construction, which matters more than the fraction of a dollar it rounds off.
  const spending = tax.spendGroups
    .map((c) => ({ c, v: Math.round(byGroup.get(c) || 0) }))
    .filter((s) => s.v > 0);

  const spent = spending.reduce((a, s) => a + s.v, 0);
  const income = Math.max(0, Math.round(incomeRaw));

  // Merchant art for the eight rows this card shows, resolved exactly the way
  // api/transactions.ts resolves it: the row's own logo first, then the
  // merchant-level cache, which is what covers charges stored before the art
  // existed. This card is the one most members actually look at, and it was
  // rendering bundled art and monograms only, because it never asked for a logo.
  // Fifteen, not eight. Eight was short enough that four new charges in a day
  // pushed half the list off and it read as history going missing, and the
  // card's own search box could only ever match within what it held.
  const recent = txns.slice(0, 15);
  const logoOf = new Map<string, string>();
  const needed = [...new Set(recent.filter((t) => !t.logo_url && t.merchant_name).map((t) => t.merchant_name as string))];
  if (needed.length) {
    const list = needed.map((n) => `"${n.replace(/"/g, '""')}"`).join(",");
    const marks = await rows<{ merchant_name: string; logo_url: string | null }>(
      `merchant_logos?merchant_name=in.(${list})&select=merchant_name,logo_url`,
    );
    for (const m of marks) if (m.logo_url) logoOf.set(m.merchant_name, m.logo_url);
  }

  const transactions = recent.map((t) => ({
    m: t.merchant_name || t.name || "Transaction",
    logo: t.logo_url ?? (t.merchant_name ? logoOf.get(t.merchant_name) ?? null : null),
    c: t.category || "Everything else",
    // The group rides along so the client can color a row from the same table
    // the rollup used, instead of keeping its own copy of the taxonomy.
    g: tax.classify(t.category_id, t.category).g,
    v: -t.amount, // flip Plaid's +out convention to the UI's -spend / +income
    d: fmtDay(t.date),
    inc: tax.classify(t.category_id, t.category).k === "income",
  }));

  // Budgets with this-month spent. A budget is stored by label, and every label
  // a member could have set before Stage 3b is now a GROUP, so a group-labelled
  // budget measures the whole group and a leaf-labelled one measures just that
  // category. Without this, widening the vocabulary would have quietly zeroed
  // every budget the member already had. Clamped at zero so a refund-heavy month
  // cannot render a negative bar.
  //
  // The budget's own label is resolved through the same id-first path the
  // spending above was bucketed by, so the two agree by construction. Without
  // it a rename would split a budget from its own spending: the limit would
  // still say "Coffee shops" while the month's charges had been counted under
  // "Coffee", and the bar would read zero with money plainly going out.
  const budgetSpent = (label: string, id: string | null) => {
    const c = tax.classify(id, label).c;
    return Math.max(0, Math.round((tax.isGroupLabel(c) ? byGroup.get(c) : byCat.get(c)) || 0));
  };
  const budgetsOut = budgets.map((b) => ({
    c: tax.classify(b.category_id, b.category).c,
    s: budgetSpent(b.category, b.category_id),
    l: Math.round(b.limit_amount),
  }));

  // Accounts grouped from the linked snapshots
  const group = (pred: (a: Acct) => boolean, debt = false) =>
    items.flatMap((it) =>
      (it.accounts || []).filter(pred).map((a) => ({
        n: a.name, i: it.institution_name || a.subtype || a.type || "Account",
        v: debt ? -Math.abs(a.balance || 0) : (a.balance || 0),
      })),
    );
  // The manual accounts read at the top of the handler join the same groups, so
  // they show in the Accounts rollup and count toward net worth below. Debts
  // render negative, matching the linked-debt convention in group().
  const manualIn = (bucket: "cash" | "invest" | "debt") =>
    manualAccts
      .filter((m) => manualBucket(m) === bucket)
      .map((m) => ({
        n: m.name,
        i: m.institution || "Manual",
        v: bucket === "debt" ? -Math.abs(m.balance || 0) : Math.abs(m.balance || 0),
      }));

  const accounts = {
    cash: [...group((a) => a.type === "depository"), ...manualIn("cash")],
    invest: [...group((a) => a.type === "investment" || a.type === "brokerage"), ...manualIn("invest")],
    debt: [...group((a) => a.type === "credit" || a.type === "loan", true), ...manualIn("debt")],
  };

  // Net worth: from snapshots, else a single point from current balances
  const assets = [...accounts.cash, ...accounts.invest].reduce((a, x) => a + x.v, 0);
  const debts = accounts.debt.reduce((a, x) => a + x.v, 0); // negative
  const current = Math.round(assets + debts);
  const series = snaps.length ? snaps.map((s) => Math.round(s.net_worth)) : [current];
  const labels = snaps.length ? snaps.map((s) => MONTHS[+s.as_of.split("-")[1] - 1]) : [MONTHS[now.getUTCMonth()]];
  // Which points were reconstructed by networth-backfill rather than observed.
  // Sent per point rather than as a cutoff index, so the client can slice it
  // alongside the series for whichever range window is selected.
  const estimated = snaps.length ? snaps.map((s) => s.estimated === true) : [false];
  const value = series[series.length - 1];
  const changeAbs = series.length > 1 ? value - series[0] : 0;
  const changePct = series.length > 1 && series[0] ? Math.round((changeAbs / series[0]) * 1000) / 10 : 0;

  // ── Sync state ───────────────────────────────────────────────────────────
  //
  // How current the data is, and what is broken, answered on a plain page load
  // with no Plaid call. This is what lets refresh stop being a button: the
  // client fires a background sync only when `syncedAt` is past its threshold,
  // rather than on every mount or whenever a member happens to press something.
  //
  // The freshness of the WHOLE dashboard is the freshness of its STALEST
  // connection, not its newest. Taking the newest would report a dashboard as
  // current when eleven of twelve banks last answered a week ago, which is the
  // flattering direction and the wrong one. A connection that has never synced
  // (null) makes the whole thing stale, since that is exactly the case a first
  // background sync exists to fix.
  const syncable = items.filter((it) => it.last_synced_at !== undefined);
  const stalest = syncable.reduce<string | null | undefined>((acc, it) => {
    if (acc === null) return null;
    const v = it.last_synced_at ?? null;
    if (v === null) return null;
    return acc === undefined || v < acc ? v : acc;
  }, undefined);

  // Only connections a member can actually do something about. A transient
  // Plaid failure is never recorded (see api/_item-sync-state.ts), so anything
  // here needs relinking, which is a thing a person can do and a refresh button
  // never could.
  const needsRelink = items
    .filter((it) => !!it.last_error_code)
    .map((it) => ({ institution: it.institution_name || "A connection", since: it.last_error_at ?? null }));

  // Juniper Score, computed from the same data, with trend + delta from the
  // stored history (written by /api/score/compute). Shares one engine so the
  // dashboard strip, the breakdown page, and the writer never disagree.
  const { input } = await fetchScoreInput(uid);
  const computed = computeScore(input);
  const scoreRows = await rows<ScoreRow>(`score_history?user_id=eq.${uid}&select=as_of,value&order=as_of.asc&limit=400`);
  const trend = scoreRows.length ? scoreRows.map((s) => s.value) : [computed.value];
  const priorValue = scoreRows.length > 1 ? scoreRows[0].value : computed.value;
  const scoreOut = {
    value: computed.value,
    band: computed.band,
    delta: computed.value - priorValue,
    lever: computed.lever,
    trend,
    factors: computed.factors,
    improvements: computed.improvements,
  };

  // Each section rides along only when its own source exists. `accounts` and
  // `netWorth` are omitted (not sent empty) when there is no account source at
  // all, so a member's hand-entered onboarding accounts aren't blanked out by an
  // empty live rollup. Same reasoning for cashflow: with no transactions there
  // is no honest income/spent to send, and the client keeps the figures the
  // member gave us in onboarding.
  return json({
    linked: true,
    sync: {
      // null means "not known yet", which the client treats as stale. undefined
      // would mean migration 0017 is not applied, and there the client shows
      // nothing rather than claiming the data is old.
      syncedAt: stalest === undefined ? null : stalest,
      // Whether the server knows how to answer at all, so the client can tell
      // "never synced" from "this deploy cannot tell you".
      tracked: syncable.length > 0,
      connections: items.length,
      needsRelink,
      // Server-side check, so the allowlist never reaches the bundle. Gates the
      // manual refresh control and the developer section in Settings (a local
      // dev build gets both regardless). The endpoints behind them are
      // unchanged and still scoped to the caller by their own JWT, so this
      // gates a control, not a capability.
      isDeveloper: isDeveloperEmail(payload.email),
    },
    // Explicit so the client gates its transaction-dependent cards on a real
    // signal rather than inferring one from "a live payload arrived", which is
    // now true for members who only have balances.
    hasTransactions,
    ...(hasAccounts
      ? { netWorth: { value, changeAbs, changePct, series, labels, estimated }, accounts }
      : {}),
    ...(hasTransactions
      ? {
          // `saved` is income minus consumption, so money moved to savings or
          // investments counts as saved rather than spent, which is the point.
          // It also means a credit-card payment no longer eats the month's
          // savings twice over.
          cashflow: { income, spent, saved: income - spent, month: MONTHS[now.getUTCMonth()] },
          spending,
          budgets: budgetsOut,
          transactions,
        }
      : {}),
    score: scoreOut,
  });
}
