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
import { plaidConfigured, plaidFetch, sanitizeAccounts } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { fetchManualAccounts, sumManualAccounts } from "../_manual-accounts";

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

type BalanceAccount = {
  account_id: string;
  type?: string | null;
  subtype?: string | null;
  balances?: { current?: number | null; available?: number | null };
};
type BalanceResp = { accounts?: BalanceAccount[]; error_message?: string; error_code?: string };

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
  const userId = payload.sub;

  // Load the caller's linked items (server-only: access_token).
  const itemsRes = await adminRest(`plaid_items?user_id=eq.${userId}&select=item_id,access_token`);
  if (!itemsRes.ok) return json({ error: "Failed to read items" }, 500);
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

  for (const item of items) {
    const bal = await plaidFetch<BalanceResp>("/accounts/balance/get", { access_token: item.access_token });
    if (!bal.ok) {
      return json({ error: bal.data.error_message || "Plaid balance fetch failed", error_code: bal.data.error_code, item_id: item.item_id }, 502);
    }
    const accts = bal.data.accounts ?? [];
    for (const a of accts) {
      const c = classify(a);
      assets += c.assets;
      debts += c.debts;
    }
    // Refresh the stored snapshot so /api/plaid/accounts stays current too.
    await adminRest(`plaid_items?item_id=eq.${item.item_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ accounts: sanitizeAccounts(accts), updated_at: new Date().toISOString() }),
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  assets = round(assets);
  debts = round(debts);
  const netWorth = round(assets - debts);
  const asOf = new Date().toISOString().slice(0, 10); // UTC day

  const up = await adminRest("net_worth_snapshots?on_conflict=user_id,as_of", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, as_of: asOf, assets, debts, net_worth: netWorth }),
  });
  if (!up.ok) return json({ error: "Failed to save snapshot", detail: await up.text().catch(() => "") }, 500);
  const rows = (await up.json().catch(() => [])) as unknown[];

  return json({ linked: true, as_of: asOf, assets, debts, net_worth: netWorth, snapshot: rows[0] ?? null, items: items.length });
}
