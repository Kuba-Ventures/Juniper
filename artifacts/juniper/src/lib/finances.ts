// Stage 3f — the frontend data-layer seam.
//
// The dashboard's money data behind stable shapes, exposed via a context so the
// several pages that read it (Overview, Score, Plans) share one source of truth
// and one /api/finances fetch. There are three sources, in priority order:
//
//   live   — the member linked + synced Plaid; GET /api/finances returned data
//   manual — no link yet, but they entered accounts/income in onboarding
//            (built from the local profile by `buildManualFinances`)
//   mock   — neither; the demo household so the UI always renders something
//
// `<FinancesProvider profile={…}>` wraps the app shell; `useFinances()` reads
// the resolved value. Live overrides manual overrides mock, and the swap to
// live happens automatically once the Stage-3 ops gates clear.
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAccessToken } from "@/lib/supabase";
import * as M from "@/lib/mock-data";
import type { Account, SpendCat, Budget, Txn, SeriesKey } from "@/lib/mock-data";
import type { UserProfile } from "@/lib/profile";
import { buildManualFinances } from "@/lib/manual-finances";

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

export type FinanceSource = "mock" | "manual" | "live";
export interface FinancesValue { data: FinanceData; source: FinanceSource; loading: boolean }

const FinancesContext = createContext<FinancesValue | null>(null);

export function FinancesProvider({ profile, children }: { profile: UserProfile | null; children: ReactNode }) {
  // The manual dashboard is derived synchronously from the local profile, so a
  // hand-onboarded member sees their own numbers on first paint (no flash of
  // demo data). It's the baseline until the live fetch resolves.
  const manual = useMemo(() => buildManualFinances(profile), [profile]);
  const base: FinancesValue = manual
    ? { data: manual, source: "manual", loading: true }
    : { data: MOCK, source: "mock", loading: true };

  const [value, setValue] = useState<FinancesValue>(base);

  // Re-seed the baseline when the profile changes (before/independent of live).
  useEffect(() => {
    setValue((prev) => (prev.source === "live" ? prev : base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual]);

  useEffect(() => {
    let alive = true;
    fetchFinances()
      .then((live) => {
        if (!alive) return;
        if (live) setValue({ data: live, source: "live", loading: false });
        else setValue((prev) => ({ ...prev, loading: false }));
      })
      .catch(() => { if (alive) setValue((prev) => ({ ...prev, loading: false })); });
    return () => { alive = false; };
  }, []);

  return createElement(FinancesContext.Provider, { value }, children);
}

export function useFinances(): FinancesValue {
  const ctx = useContext(FinancesContext);
  // Fallback keeps any consumer rendered outside the provider working on mock
  // data rather than throwing.
  return ctx ?? { data: MOCK, source: "mock", loading: false };
}
