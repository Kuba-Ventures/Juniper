// POST /api/plaid/investments
//
// Suggests a monthly investment contribution per linked investment account,
// derived from Plaid's own investment transaction history
// (/investments/transactions/get). No storage: nothing here is ever confirmed
// or edited by the member, so like liabilities.ts there is nothing worth
// caching and nothing that can go stale between one call and the next.
//
// This is a different data tier than what the app already surfaces: a save
// plan's "current value" already prefills from the member's linked account
// BALANCES (Balances.totalInvest in plan-create-form.tsx, from the general
// accounts snapshot). That figure says how much is invested; it says nothing
// about the PACE money is going in, which is what this endpoint answers by
// reading actual contribution/withdrawal flows, the same way liabilities.ts
// answers "what rate" rather than just "what balance" for a debt.
//
// `investments` is already in additional_consented_products
// (api/plaid/link-token.ts), unlike liabilities, so no separate consent-list
// deploy is needed here: an item linked after that shipped can serve this
// today. An item linked before it, or in the one-to-two minute window right
// after linking, still refuses until relinked or retried, same as the
// investment leg of networth-backfill.ts.
//
// Per item, not all-or-nothing, same shape as liabilities.ts,
// networth-snapshot.ts and recurring-sync.ts: an edge function is killed if it
// has not returned within 25 seconds, so a member with a dozen institutions
// hits that on a serial loop.
import { verifySupabaseJwt, extractBearerToken } from "../_supabase-jwt";
import { readEnv } from "../_env";
import { plaidConfigured, plaidFetch } from "../_plaid";
import { adminConfigured, adminRest } from "../_supabase-admin";
import { isDeadItemCode, markItemDead } from "../_item-sync-state";
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

type ItemFailure = { item_id: string; error_code: string | null; error_message: string | null; needs_relink: boolean };

// Same set liabilities.ts and recurring-sync.ts use: entitlement is a fact
// about the account, so the first refusal answers for all of them.
const ENTITLEMENT_CODES = new Set(["INVALID_PRODUCT", "PRODUCTS_NOT_SUPPORTED", "PRODUCT_NOT_ENABLED"]);

// Six at a time, matching every other multi-item Plaid loop in this app.
const CONCURRENCY = 6;

// How far back to look, and what that trailing window is divided by to reach
// a monthly figure. 90 days rather than a full year: a member's contribution
// habit (payroll-deducted 401k, an automatic brokerage transfer) is usually
// stable month to month, and a shorter window means a contribution started or
// stopped recently is reflected quickly rather than smoothed away by months
// that no longer apply.
const WINDOW_DAYS = 90;
const WINDOW_MONTHS = WINDOW_DAYS / 30;

// Same sign/subtype convention as api/plaid/networth-backfill.ts's
// investmentFlowsByDay, which this mirrors but keys by ACCOUNT rather than by
// day: Plaid files a contribution under type `buy` and signs it like a
// purchase, so gating on type or on sign both miss it. See that file's header
// comment for the full reasoning; not repeated here.
const CONTRIBUTION_SUBTYPES = new Set(["deposit", "contribution"]);
const WITHDRAWAL_SUBTYPES = new Set(["withdrawal", "distribution"]);
const SIGNED_SUBTYPES = new Set(["transfer", "send"]);

// Plaid's own investment account subtypes, collapsed to a label a member
// recognizes. Falls back to "Investment account" for anything not listed
// rather than growing this forever; Plaid's subtype list is long and most of
// it (529, UGMA, Keogh, pension) is rare enough that the generic label is
// honest rather than a gap.
const SUBTYPE_LABEL: Record<string, string> = {
  "401k": "401(k)",
  "401a": "401(a)",
  "403b": "403(b)",
  "457b": "457(b)",
  ira: "IRA",
  roth: "Roth IRA",
  "roth 401k": "Roth 401(k)",
  "sep ira": "SEP IRA",
  "simple ira": "SIMPLE IRA",
  brokerage: "Brokerage",
  hsa: "HSA",
};
function accountTypeLabel(subtype?: string | null): string {
  const key = (subtype ?? "").toLowerCase();
  return SUBTYPE_LABEL[key] ?? "Investment account";
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type InvestmentContribution = {
  item_id: string;
  institution_name: string | null;
  account_id: string;
  name: string;
  mask: string | null;
  account_type: string;
  // Net contribution flow over WINDOW_DAYS, divided into a monthly figure and
  // rounded. Always positive: an account that is net withdrawing, or flat, is
  // filtered out before this type is constructed, since a plan's monthly
  // contribution field has no honest use for a suggested $0 or a negative
  // number.
  monthly_contribution: number;
  months_observed: number;
};

type PlaidInvAccount = { account_id: string; name?: string; official_name?: string; mask?: string | null; type?: string; subtype?: string | null };
type InvestmentTxn = { account_id?: string; amount?: number; date?: string; type?: string; subtype?: string };
type InvestmentsResp = {
  accounts?: PlaidInvAccount[];
  investment_transactions?: InvestmentTxn[];
  total_investment_transactions?: number;
  error_message?: string;
  error_code?: string;
};
type Item = { item_id: string; access_token: string; institution_name: string | null };

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

  const itemsRes = await adminRest(`plaid_items?user_id=eq.${uid}&select=item_id,access_token,institution_name`);
  if (!itemsRes.ok) return json({ error: "Failed to read connections" }, 500);
  const items = (await itemsRes.json()) as Item[];
  if (!items.length) return json({ available: true, contributions: [], failures: [] });

  const failures: ItemFailure[] = [];

  // Set by the first item refused on entitlement grounds, same reasoning as
  // liabilities.ts: twelve identical refusals cost twelve round trips and
  // tell us nothing the first one did not.
  const entitlement: { refused: { code: string; message: string | null } | null } = { refused: null };

  const endDate = iso(Date.now());
  const startDate = iso(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pullItem = async (item: Item): Promise<{ contributions: InvestmentContribution[]; failure: ItemFailure | null }> => {
    if (entitlement.refused) return { contributions: [], failure: null };

    // Paged the same way networth-backfill.ts's investmentFlowsByDay is:
    // Plaid caps a page at 500 and reports the full count.
    const flowByAccount = new Map<string, number>();
    let accounts: PlaidInvAccount[] = [];
    let offset = 0;
    for (let page = 0; page < 10; page++) {
      const r = await plaidFetch<InvestmentsResp>("/investments/transactions/get", {
        access_token: item.access_token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset },
      });
      if (!r.ok) {
        const code = r.data.error_code ?? null;
        if (code && ENTITLEMENT_CODES.has(code)) {
          if (!entitlement.refused) {
            entitlement.refused = { code, message: r.data.error_message ?? null };
            console.warn(
              `[plaid] investments/transactions/get is not entitled or not consented on this item (${code}). Investment contributions are unavailable until the item is relinked with investments consent.`,
            );
          }
          return { contributions: [], failure: null };
        }
        console.error(
          `[plaid] investments/transactions/get failed (${r.status}) for item ${item.item_id}: ${code || "unknown"} ${r.data.error_message || ""}`.trim(),
        );
        if (isDeadItemCode(code)) await markItemDead(item.item_id, code!);
        return {
          contributions: [],
          failure: { item_id: item.item_id, error_code: code, error_message: r.data.error_message ?? null, needs_relink: isDeadItemCode(code) },
        };
      }

      if (page === 0) accounts = r.data.accounts ?? [];
      const rows = r.data.investment_transactions ?? [];
      for (const t of rows) {
        if (!t.account_id || (t.type ?? "").toLowerCase() === "cancel") continue;
        const subtype = (t.subtype ?? "").toLowerCase();
        const amount = typeof t.amount === "number" ? t.amount : 0;
        if (!Number.isFinite(amount) || amount === 0) continue;

        // Magnitude from the amount, direction from the subtype, except the two
        // bidirectional subtypes where the sign is all there is. Plaid signs an
        // inflow of cash negative, so `-amount` is the inflow. Same convention
        // as networth-backfill.ts's investmentFlowsByDay.
        let delta = 0;
        if (CONTRIBUTION_SUBTYPES.has(subtype)) delta = Math.abs(amount);
        else if (WITHDRAWAL_SUBTYPES.has(subtype)) delta = -Math.abs(amount);
        else if (SIGNED_SUBTYPES.has(subtype)) delta = -amount;
        else continue; // internal, or a subtype with no documented parent type

        flowByAccount.set(t.account_id, (flowByAccount.get(t.account_id) ?? 0) + delta);
      }

      const total = r.data.total_investment_transactions ?? rows.length;
      offset += rows.length;
      if (!rows.length || offset >= total) break;
    }

    const out: InvestmentContribution[] = [];
    for (const acct of accounts) {
      if ((acct.type ?? "").toLowerCase() !== "investment") continue;
      const net = flowByAccount.get(acct.account_id) ?? 0;
      const monthly = Math.round(net / WINDOW_MONTHS);
      // A flat or net-withdrawing account has nothing honest to suggest for a
      // "monthly contribution" field: $0 or negative is not a contribution
      // pace, it is the absence of one.
      if (monthly <= 0) continue;
      out.push({
        item_id: item.item_id,
        institution_name: item.institution_name,
        account_id: acct.account_id,
        name: acct.official_name || acct.name || "Account",
        mask: acct.mask ?? null,
        account_type: accountTypeLabel(acct.subtype),
        monthly_contribution: monthly,
        months_observed: WINDOW_MONTHS,
      });
    }
    return { contributions: out, failure: null };
  };

  const pulled = await mapPool(items, CONCURRENCY, pullItem);

  // Nothing was read, so there is nothing to report but the refusal. Same
  // reasoning as liabilities.ts and recurring-sync.ts: 200, not an error,
  // since the endpoint ran and the honest answer is that this Plaid account
  // or item cannot serve investment transactions yet.
  if (entitlement.refused) {
    return json({
      available: false,
      contributions: [],
      failures: [],
      unavailable_code: entitlement.refused.code,
      unavailable_message: entitlement.refused.message,
    });
  }

  const contributions: InvestmentContribution[] = [];
  for (const b of pulled) {
    if (b.failure) { failures.push(b.failure); continue; }
    contributions.push(...b.contributions);
  }

  return json({ available: true, contributions, failures });
}
