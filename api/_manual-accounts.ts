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
