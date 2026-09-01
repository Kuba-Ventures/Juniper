// Shared read + classification of a user's manually-added accounts (tier 3 of
// account discovery, migration 0014), so every balance-derived surface, the
// dashboard net worth + account rollup (/api/finances), the daily net-worth
// snapshot writer, and the Juniper Score inputs (_finance-snapshot), counts them
// the same way. Fetched with the service-role key and scoped by user_id (RLS is
// bypassed here, see _supabase-admin).
import { adminRest } from "./_supabase-admin";

export type ManualAccountRow = {
  name: string;
  institution: string | null;
  category: string; // banking | investing | credit | loans | cash | other
  kind: string;     // asset | liability
  balance: number | null; // stored as a positive magnitude; sign comes from `kind`
  currency: string | null;
};

export async function fetchManualAccounts(uid: string): Promise<ManualAccountRow[]> {
  try {
    const r = await adminRest(
      `manual_accounts?user_id=eq.${uid}&select=name,institution,category,kind,balance,currency&order=created_at.asc`,
    );
    if (!r.ok) return [];
    const data = (await r.json()) as ManualAccountRow[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Which net-worth bucket a manual account falls into: cash (depository-like),
// invest (investing/retirement), or debt (any liability).
export type ManualBucket = "cash" | "invest" | "debt";
export function manualBucket(m: ManualAccountRow): ManualBucket {
  if (m.kind === "liability") return "debt";
  if (m.category === "investing") return "invest";
  return "cash"; // banking, cash, other assets
}

export type ManualTotals = {
  cash: number;        // depository-like asset balances
  invest: number;      // investing/retirement asset balances
  cardDebt: number;    // credit-category liabilities
  loanDebt: number;    // loan (and other) liabilities
};

// Sum manual accounts into the buckets the score/net-worth math uses. Balance is
// a magnitude; we take abs defensively. Debt is split card vs loan by category
// so it lines up with the Plaid classification in _finance-snapshot.
export function sumManualAccounts(list: ManualAccountRow[]): ManualTotals {
  const t: ManualTotals = { cash: 0, invest: 0, cardDebt: 0, loanDebt: 0 };
  for (const m of list) {
    const v = Math.abs(m.balance ?? 0);
    if (!Number.isFinite(v) || v === 0) continue;
    if (m.kind === "liability") {
      if (m.category === "credit") t.cardDebt += v;
      else t.loanDebt += v;
    } else if (m.category === "investing") {
      t.invest += v;
    } else {
      t.cash += v;
    }
  }
  return t;
}

// ── Manual CREDIT accounts, read on their own ────────────────────────────────
//
// The Credit page needs two fields no other manual-account reader does: the
// `credit_limit` a member typed for a card Plaid cannot reach (migration 0046)
// and the `mask` that makes it identifiable beside a linked card. This is a
// SEPARATE fetch with a SEPARATE row type rather than two more columns on
// `ManualAccountRow`, and the separation is the point.
//
// `fetchManualAccounts` above is read by api/_finance-snapshot.ts (Juniper Score
// inputs), api/plaid/networth-snapshot.ts, api/plaid/networth-backfill.ts and
// api/finances.ts. A member-typed limit must never reach the Score: it is a
// CLAIM, the Score is a figure Juniper asserts from what it can measure, and a
// member able to raise their own score by typing a generous number would be
// scoring themselves. Same rule as `member_cards.credit_limit` in 0033.
//
// Keeping the column out of the shared select is what makes that structural
// rather than a convention somebody has to remember: the score path cannot read
// what it is never handed. Adding `credit_limit` to `ManualAccountRow` would put
// it one property access away in four files, and the comment forbidding it would
// be the only thing standing there.

/** A manual credit-card account, plus the two fields only the Credit page reads. */
export type ManualCreditRow = ManualAccountRow & {
  id: string;
  /** Last four digits the member typed, or null. */
  mask: string | null;
  /** What the member says the limit is. NULL means unknown, never zero: see
      `utilizationPct` in ./_credit-balance.ts, which returns null rather than 0
      for an unknown limit because those are different facts. */
  credit_limit: number | null;
  /** Which catalog card this is (migration 0047), for IDENTITY ONLY: name, brand
      colour and art. NULL means the member has not said, which is a fine place to
      stay. Never used for rewards: see the note on the select below. */
  product_id: string | null;
};

/**
 * The member's manually-added CREDIT accounts, degrading if 0046 is unapplied.
 *
 * PostgREST rejects the WHOLE select on one unknown column, and returning [] on
 * that failure would drop every hand-entered card off the Credit page for the
 * length of a deploy window. So the 0046 columns are requested as optional and
 * retried without, the same ladder shape as `rowsWithOptional` and `readCatalog`
 * in api/card-rewards.ts. Without them a manual card still lists, with its limit
 * unknown, which is exactly what it was before 0046.
 */
export async function fetchManualCreditAccounts(uid: string): Promise<ManualCreditRow[]> {
  const base = "id,name,institution,category,kind,balance,currency";
  const scope = `manual_accounts?user_id=eq.${uid}&category=eq.credit`;
  const order = "&order=created_at.asc";
  // Tried most-complete first and degraded one migration at a time, the same
  // ladder shape `readCatalog` uses: losing 0047's `product_id` must not also
  // cost 0046's limit, which is the field utilization depends on, so these are
  // separate steps rather than one fallback.
  try {
    let r = await adminRest(`${scope}&select=${base},mask,credit_limit,product_id${order}`);
    if (!r.ok) {
      r = await adminRest(`${scope}&select=${base},mask,credit_limit${order}`);
      if (r.ok) console.warn("[manual] product_id unavailable, is migration 0047 applied?");
    }
    if (!r.ok) {
      r = await adminRest(`${scope}&select=${base}${order}`);
      if (r.ok) console.warn("[manual] mask, credit_limit and product_id unavailable, are migrations 0046 and 0047 applied?");
    }
    if (!r.ok) {
      console.error(`[manual] could not read manual credit accounts (${r.status})`);
      return [];
    }
    const raw = (await r.json().catch(() => [])) as Partial<ManualCreditRow>[];
    return (Array.isArray(raw) ? raw : []).map((m) => ({
      id: String(m.id ?? ""),
      name: String(m.name ?? ""),
      institution: m.institution ?? null,
      category: String(m.category ?? "credit"),
      kind: String(m.kind ?? "liability"),
      // PostgREST hands NUMERIC back as a string in some configurations, and a
      // string limit would make every percentage NaN in silence. Coerced here,
      // once, exactly as api/card-rewards.ts does for the catalog's numerics.
      balance: m.balance == null ? null : Number(m.balance),
      currency: m.currency ?? null,
      mask: m.mask ?? null,
      // Zero or negative is refused by 0046's CHECK, but this value has been
      // through a text field and a REST layer, so it is not trusted here either:
      // anything that is not a usable positive limit reads as unknown.
      credit_limit:
        m.credit_limit == null || !Number.isFinite(Number(m.credit_limit)) || Number(m.credit_limit) <= 0
          ? null
          : Number(m.credit_limit),
      product_id: m.product_id ?? null,
    }));
  } catch {
    console.error("[manual] read threw for manual credit accounts");
    return [];
  }
}
