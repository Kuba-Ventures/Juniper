// GET /api/finances
// Assembles the dashboard's money data for the caller from the Stage-3 tables
// (transactions, budgets, net_worth_snapshots) + the linked-account snapshots
// in plaid_items. Read-only. Returns { linked: false } when there's nothing to
// show yet (no items or no synced transactions), so the frontend keeps its demo
// mock until real data exists. Colors are added client-side.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";

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
const CAT_ORDER = ["Housing", "Groceries & dining", "Transportation", "Shopping", "Utilities & bills", "Kids & health", "Everything else"];
const fmtDay = (d: string) => { const [, m, day] = d.split("-"); return `${MONTHS[+m - 1]} ${+day}`; };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try { const r = await adminRest(pathAndQuery); if (!r.ok) return []; return (await r.json()) as T[]; }
  catch { return []; }
}

type Txn = { name: string | null; merchant_name: string | null; amount: number; date: string; category: string | null };
type Bud = { category: string; limit_amount: number };
type Snap = { as_of: string; net_worth: number };
type Acct = { name: string; mask: string | null; type: string | null; subtype: string | null; balance: number | null };
type Item = { institution_name: string | null; accounts: Acct[] };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !adminConfigured()) return json({ linked: false });

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  const items = await rows<Item>(`plaid_items?user_id=eq.${uid}&select=institution_name,accounts`);
  const txns = await rows<Txn>(`transactions?user_id=eq.${uid}&select=name,merchant_name,amount,date,category&order=date.desc&limit=400`);
  if (!items.length || !txns.length) return json({ linked: false });

  const budgets = await rows<Bud>(`budgets?user_id=eq.${uid}&select=category,limit_amount`);
  const snaps = await rows<Snap>(`net_worth_snapshots?user_id=eq.${uid}&select=as_of,net_worth&order=as_of.asc&limit=400`);

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const thisMonth = txns.filter((t) => t.date.startsWith(ym));

  // Spending by category (this month, outflows only)
  const byCat = new Map<string, number>();
  for (const t of thisMonth) if (t.amount > 0) { const c = t.category || "Everything else"; byCat.set(c, (byCat.get(c) || 0) + t.amount); }
  const spending = [...byCat.entries()]
    .map(([c, v]) => ({ c, v: Math.round(v) }))
    .sort((a, b) => (CAT_ORDER.indexOf(a.c) + 99) % 100 - ((CAT_ORDER.indexOf(b.c) + 99) % 100) || b.v - a.v);

  const spent = Math.round(thisMonth.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0));
  const income = Math.round(Math.abs(thisMonth.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0)));

  const transactions = txns.slice(0, 8).map((t) => ({
    m: t.merchant_name || t.name || "Transaction",
    c: t.category || "Everything else",
    v: -t.amount, // flip Plaid's +out convention to the UI's -spend / +income
    d: fmtDay(t.date),
    inc: (t.category || "") === "Income",
  }));

  // Budgets with this-month spent
  const budgetsOut = budgets.map((b) => ({ c: b.category, s: Math.round(byCat.get(b.category) || 0), l: Math.round(b.limit_amount) }));

  // Accounts grouped from the linked snapshots
  const group = (pred: (a: Acct) => boolean, debt = false) =>
    items.flatMap((it) =>
      (it.accounts || []).filter(pred).map((a) => ({
        n: a.name, i: it.institution_name || a.subtype || a.type || "Account",
        v: debt ? -Math.abs(a.balance || 0) : (a.balance || 0),
      })),
    );
  const accounts = {
    cash: group((a) => a.type === "depository"),
    invest: group((a) => a.type === "investment" || a.type === "brokerage"),
    debt: group((a) => a.type === "credit" || a.type === "loan", true),
  };

  // Net worth: from snapshots, else a single point from current balances
  const assets = [...accounts.cash, ...accounts.invest].reduce((a, x) => a + x.v, 0);
  const debts = accounts.debt.reduce((a, x) => a + x.v, 0); // negative
  const current = Math.round(assets + debts);
  const series = snaps.length ? snaps.map((s) => Math.round(s.net_worth)) : [current];
  const labels = snaps.length ? snaps.map((s) => MONTHS[+s.as_of.split("-")[1] - 1]) : [MONTHS[now.getUTCMonth()]];
  const value = series[series.length - 1];
  const changeAbs = series.length > 1 ? value - series[0] : 0;
  const changePct = series.length > 1 && series[0] ? Math.round((changeAbs / series[0]) * 1000) / 10 : 0;

  return json({
    linked: true,
    netWorth: { value, changeAbs, changePct, series, labels },
    cashflow: { income, spent, saved: income - spent, month: MONTHS[now.getUTCMonth()] },
    spending,
    budgets: budgetsOut,
    transactions,
    accounts,
  });
}
