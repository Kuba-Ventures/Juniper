// POST /api/plaid/liabilities
// Pulls the caller's liability details (APR, liability type) from Plaid
// (/liabilities/get), per item, and returns them live. No storage: unlike
// recurring_streams, there is no member intent to preserve here (nothing here
// is ever confirmed or edited by the member), so there is nothing worth
// caching and nothing that can go stale between one call and the next.
//
// `liabilities` is not requested anywhere else in this app: it is not in
// PLAID_PRODUCTS and not in `additional_consented_products`
// (api/plaid/link-token.ts). Unlike `recurring_transactions`, which took down
// bank linking for a day in 2026-08-31 to 09-01 because it is an ADD ON and
// not a valid `products`/`additional_consented_products` enum value,
// `liabilities` IS a real product: Plaid's docs list it alongside
// transactions/auth/investments. That makes it safe to request the same way
// `investments` already is, but it is still unrequested today, so an item
// linked before this ships will refuse it until relinked through update mode,
// same as investments did.
//
// Per item, not all-or-nothing, same shape as networth-snapshot.ts and
// recurring-sync.ts: an edge function is killed if it has not returned within
// 25 seconds, so a member with a dozen institutions hits that on a serial
// loop.
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

// Refusals that are about the Plaid client rather than the member's
// connection: entitlement is a fact about the account, so the first one
// answers for all of them. Same set recurring-sync.ts uses.
const ENTITLEMENT_CODES = new Set(["INVALID_PRODUCT", "PRODUCTS_NOT_SUPPORTED", "PRODUCT_NOT_ENABLED"]);

// Six at a time, matching networth-snapshot.ts and recurring-sync.ts.
const CONCURRENCY = 6;

export type LiabilityType = "mortgage" | "student" | "credit";

export type LiabilityAccount = {
  item_id: string;
  institution_name: string | null;
  account_id: string;
  name: string;
  mask: string | null;
  liability_type: LiabilityType;
  balance: number | null;
  // Null when Plaid reports no rate for this account (some student loans and
  // most mortgages report a rate; some do not). Never invented.
  apr: number | null;
  // The recurring amount Plaid has on file: `minimum_payment_amount` for a
  // card or student loan, `next_monthly_payment` (falling back to the last
  // payment actually made) for a mortgage. Null, never guessed, when Plaid
  // reports neither.
  monthly_payment: number | null;
  // A short, human description of the payoff horizon. Credit is revolving
  // debt with no fixed term, so this is always null there. A mortgage
  // reports its own term ("30 year"); Plaid gives a student loan no term
  // string at all, only a payoff date, so one is derived from that.
  term: string | null;
};

type PlaidLiabAccount = { account_id: string; name?: string; official_name?: string; mask?: string | null; balances?: { current?: number | null } };
type CreditApr = { apr_percentage?: number | null; apr_type?: string | null };
type CreditLiability = { account_id: string; aprs?: CreditApr[]; minimum_payment_amount?: number | null };
type MortgageLiability = {
  account_id: string;
  interest_rate?: { percentage?: number | null } | null;
  loan_term?: string | null;
  next_monthly_payment?: number | null;
  last_payment_amount?: number | null;
};
type StudentLiability = {
  account_id: string;
  interest_rate_percentage?: number | null;
  minimum_payment_amount?: number | null;
  last_payment_amount?: number | null;
  expected_payoff_date?: string | null;
};
type LiabilitiesResp = {
  accounts?: PlaidLiabAccount[];
  liabilities?: { credit?: CreditLiability[]; mortgage?: MortgageLiability[]; student?: StudentLiability[] };
  error_message?: string;
  error_code?: string;
};
type Item = { item_id: string; access_token: string; institution_name: string | null };

// A credit card can carry several APRs (purchase, cash advance, balance
// transfer, penalty). `purchase_apr` is the one a member means by "my card's
// APR"; falling back to the first entry only when that specific type is
// absent, rather than always taking the first, avoids quietly reporting a
// penalty or cash-advance rate as if it were the ordinary one.
function creditApr(aprs?: CreditApr[]): number | null {
  if (!aprs?.length) return null;
  const purchase = aprs.find((a) => a.apr_type === "purchase_apr");
  const rate = (purchase ?? aprs[0])?.apr_percentage;
  return typeof rate === "number" ? rate : null;
}

// "2032-07-28" -> "Payoff by 2032". Plaid gives a student loan a payoff DATE
// and no term string the way a mortgage's `loan_term` is one already, so this
// is the one place a term gets built rather than read straight off the wire.
function payoffTermFromDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const year = dateStr.slice(0, 4);
  return /^\d{4}$/.test(year) ? `Payoff by ${year}` : null;
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

  const itemsRes = await adminRest(`plaid_items?user_id=eq.${uid}&select=item_id,access_token,institution_name`);
  if (!itemsRes.ok) return json({ error: "Failed to read connections" }, 500);
  const items = (await itemsRes.json()) as Item[];
  if (!items.length) return json({ available: true, liabilities: [], failures: [] });

  const failures: ItemFailure[] = [];

  // Set by the first item refused on entitlement grounds. Everything still
  // queued then skips its call: twelve identical refusals cost twelve round
  // trips and tell us nothing the first one did not. Held on an object so the
  // compiler does not narrow it to null; it is only ever assigned inside the
  // pool callback, past what control-flow analysis can see through.
  const entitlement: { refused: { code: string; message: string | null } | null } = { refused: null };

  const pullItem = async (item: Item): Promise<{ accounts: LiabilityAccount[]; failure: ItemFailure | null }> => {
    if (entitlement.refused) return { accounts: [], failure: null };
    const r = await plaidFetch<LiabilitiesResp>("/liabilities/get", { access_token: item.access_token });
    if (!r.ok) {
      const code = r.data.error_code ?? null;
      if (code && ENTITLEMENT_CODES.has(code)) {
        if (!entitlement.refused) {
          entitlement.refused = { code, message: r.data.error_message ?? null };
          console.warn(
            `[plaid] liabilities/get is not entitled or not consented on this item (${code}). Liabilities are unavailable until the item is relinked with liabilities consent.`,
          );
        }
        return { accounts: [], failure: null };
      }
      console.error(
        `[plaid] liabilities/get failed (${r.status}) for item ${item.item_id}: ${code || "unknown"} ${r.data.error_message || ""}`.trim(),
      );
      if (isDeadItemCode(code)) await markItemDead(item.item_id, code!);
      return {
        accounts: [],
        failure: { item_id: item.item_id, error_code: code, error_message: r.data.error_message ?? null, needs_relink: isDeadItemCode(code) },
      };
    }

    const byId = new Map((r.data.accounts ?? []).map((a) => [a.account_id, a]));
    const out: LiabilityAccount[] = [];
    const push = (
      accountId: string,
      liability_type: LiabilityType,
      apr: number | null,
      monthly_payment: number | null,
      term: string | null,
    ) => {
      const acct = byId.get(accountId);
      if (!acct) return; // Plaid named a liability for an account it did not also describe; nothing to show.
      out.push({
        item_id: item.item_id,
        institution_name: item.institution_name,
        account_id: acct.account_id,
        name: acct.official_name || acct.name || "Account",
        mask: acct.mask ?? null,
        liability_type,
        balance: acct.balances?.current ?? null,
        apr,
        monthly_payment,
        term,
      });
    };
    for (const c of r.data.liabilities?.credit ?? []) {
      push(c.account_id, "credit", creditApr(c.aprs), c.minimum_payment_amount ?? null, null);
    }
    for (const m of r.data.liabilities?.mortgage ?? []) {
      push(
        m.account_id,
        "mortgage",
        m.interest_rate?.percentage ?? null,
        m.next_monthly_payment ?? m.last_payment_amount ?? null,
        m.loan_term ?? null,
      );
    }
    for (const s of r.data.liabilities?.student ?? []) {
      push(
        s.account_id,
        "student",
        s.interest_rate_percentage ?? null,
        s.minimum_payment_amount ?? s.last_payment_amount ?? null,
        payoffTermFromDate(s.expected_payoff_date),
      );
    }

    return { accounts: out, failure: null };
  };

  const pulled = await mapPool(items, CONCURRENCY, pullItem);

  // Nothing was read, so there is nothing to report but the refusal. Same
  // reasoning as recurring-sync.ts: 200, not an error, since the endpoint ran
  // and the honest answer is that this Plaid account or item cannot serve
  // liabilities yet.
  if (entitlement.refused) {
    return json({
      available: false,
      liabilities: [],
      failures: [],
      unavailable_code: entitlement.refused.code,
      unavailable_message: entitlement.refused.message,
    });
  }

  const liabilities: LiabilityAccount[] = [];
  for (const b of pulled) {
    if (b.failure) { failures.push(b.failure); continue; }
    liabilities.push(...b.accounts);
  }

  return json({ available: true, liabilities, failures });
}
