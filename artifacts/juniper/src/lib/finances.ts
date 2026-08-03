// Stage 3f — the frontend data-layer seam.
//
// `useFinances()` returns the dashboard's money data behind stable shapes. It
// starts with the demo mock so the UI renders instantly, then fetches
// GET /api/finances and swaps to LIVE data if the user has linked + synced.
// Any failure (not linked, tables not yet created, offline) keeps the mock —
// so nothing breaks before the Stage-3 ops gates clear, and it flips to real
// data automatically once they do.
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase";
import * as M from "@/lib/mock-data";
import type { Account, SpendCat, Budget, Txn, SeriesKey } from "@/lib/mock-data";

export interface FinanceData {
  netWorth: typeof M.netWorth;
  cashflow: typeof M.cashflow;
  spending: SpendCat[];
  budgets: Budget[];
  transactions: Txn[];
  accounts: { cash: Account[]; invest: Account[]; debt: Account[] };
  score: typeof M.score;
}

const MOCK: FinanceData = {
  netWorth: M.netWorth,
  cashflow: M.cashflow,
  spending: M.spending,
  budgets: M.budgets,
  transactions: M.transactions,
  accounts: M.accounts,
  score: M.score,
};

// Category -> series color, matching the mock so live + demo look identical.
const CAT_COLOR: Record<string, SeriesKey> = {
  "Housing": "--jnpr-c1",
  "Groceries & dining": "--jnpr-c2",
  "Transportation": "--jnpr-c3",
  "Shopping": "--jnpr-c4",
  "Utilities & bills": "--jnpr-c5",
  "Kids & health": "--jnpr-c6",
  "Everything else": "--jnpr-c7",
  "Income": "--jnpr-good",
};
const catColor = (c: string): SeriesKey => CAT_COLOR[c] ?? "--jnpr-c7";
const ACCT_CYCLE: SeriesKey[] = ["--jnpr-c1", "--jnpr-c3", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6", "--jnpr-c4"];

// Raw shape returned by GET /api/finances (colors are a frontend concern, so the
// endpoint stays color-agnostic and we add `k` here).
interface RawFinances {
  linked: boolean;
  netWorth?: FinanceData["netWorth"];
  cashflow?: FinanceData["cashflow"];
  spending?: { c: string; v: number }[];
  budgets?: Budget[];
  transactions?: { m: string; c: string; v: number; d: string; inc?: boolean }[];
  accounts?: { cash: Omit<Account, "k">[]; invest: Omit<Account, "k">[]; debt: Omit<Account, "k">[] };
  score?: FinanceData["score"];
}

function withColors(raw: RawFinances): FinanceData {
  const color = <T extends Omit<Account, "k">>(arr: T[]): Account[] =>
    arr.map((a, i) => ({ ...a, k: ACCT_CYCLE[i % ACCT_CYCLE.length] }));
  return {
    netWorth: raw.netWorth ?? MOCK.netWorth,
    cashflow: raw.cashflow ?? MOCK.cashflow,
    spending: (raw.spending ?? []).map((s) => ({ ...s, k: catColor(s.c) })),
    budgets: raw.budgets ?? [],
    transactions: (raw.transactions ?? []).map((t) => ({ ...t, k: t.inc ? "--jnpr-good" : catColor(t.c) })),
    accounts: {
      cash: color(raw.accounts?.cash ?? []),
      invest: color(raw.accounts?.invest ?? []),
      debt: color(raw.accounts?.debt ?? []),
    },
    // Stage 4: the server computes the real Juniper Score; fall back to the demo
    // value if an older payload omits it.
    score: raw.score ?? MOCK.score,
  };
}

async function fetchFinances(): Promise<FinanceData | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch("/api/finances", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawFinances;
    if (!raw?.linked) return null;
    return withColors(raw);
  } catch {
    return null;
  }
}

export function useFinances(): { data: FinanceData; source: "mock" | "live"; loading: boolean } {
  const [data, setData] = useState<FinanceData>(MOCK);
  const [source, setSource] = useState<"mock" | "live">("mock");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchFinances()
      .then((live) => { if (alive && live) { setData(live); setSource("live"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return { data, source, loading };
}
