// Stage 3f, the frontend data-layer seam.
//
// The dashboard's money data behind stable shapes, exposed via a context so the
// several pages that read it (Overview, Score, Plans) share one source of truth
// and one /api/finances fetch. There are three sources, in priority order:
//
//   live, the member linked Plaid and/or saved accounts server-side;
//         GET /api/finances returned data
//   manual, no link yet, but they entered accounts/income in onboarding
//            (built from the local profile by `buildManualFinances`)
//   mock, neither; the demo household so the UI always renders something
//
// `<FinancesProvider profile={…}>` wraps the app shell; `useFinances()` reads
// the resolved value.
//
// The live payload is PARTIAL by design (api/finances.ts gates each section on
// its own source), so it is merged field by field over the layer beneath it: the
// member's own manual figures, or EMPTY when they never entered any. Never over
// the mock household. A member with real balances but no transaction feed yet
// must see their own cashflow or nothing at all, not the demo's income printed
// as theirs. MOCK is reachable only as a whole layer, for a session with no
// profile and no server data whatsoever.
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

// The floor under a real member: a dashboard with nothing in it. Derived from an
// empty profile so it is built by exactly the same code as the manual layer,
// giving $0 net worth on a flat trailing-12-month line, no accounts, no
// transaction surfaces, and a score computed from zeros. A live payload merges
// onto this when the member skipped manual onboarding, so a section the server
// omits renders empty or zero instead of borrowing a demo number.
// `buildManualFinances` returns null only for a null profile, and `{}` is not
// null, hence the cast.
const EMPTY = buildManualFinances({}) as FinanceData;

// Category GROUP -> series color. One color per group, so every category inside
// a group reads as the same family on the donut and on a transaction row, and
// the vocabulary can keep widening without a color decision per leaf.
//
// The group labels ARE the seven pre-3b categories plus two new ones, so the
// seven old rows below are untouched: a member's Housing wedge is still the same
// green. Every token here already exists in both palettes (styles/juniper.css,
// light and `.dark .jnpr`), nothing new was invented. The two additions had to
// come from outside c1 to c7 because that ramp holds seven distinct hues and
// there are nine spending groups; `accent` (deep pine in light, mint in dark) and
// `ink-2` (sage) are what is left that stays legible in both themes. Both are
// greenish, so the rollup order keeps them apart from each other and from c1 and
// c6, and no two adjacent wedges share a hue. Worth knowing: in dark mode `accent` and
// `good` resolve to the same green, which is harmless only because Income never
// appears in the donut, it is excluded from spending.
//
// The server decides which group a category belongs to (api/_categorize.ts, the
// single source of truth) and sends it, so this file never mirrors that table.
// Listed in the rollup order the server sends (api/_categorize.ts), so the
// adjacency this order buys is visible right here.
const GROUP_COLOR: Record<string, SeriesKey> = {
  "Housing": "--jnpr-c1",            // green
  "Groceries & dining": "--jnpr-c2", // gold
  "Transportation": "--jnpr-c3",     // blue
  "Debt payments": "--jnpr-ink-2",   // sage
  "Shopping": "--jnpr-c4",           // terracotta
  "Fun & travel": "--jnpr-accent",   // pine
  "Utilities & bills": "--jnpr-c5",  // violet
  "Kids & health": "--jnpr-c6",      // olive
  "Everything else": "--jnpr-c7",    // grey
  "Income": "--jnpr-good",
  // Muted on purpose: a transfer or a card payment is not spending, and it
  // should not look like a category competing for the member's attention.
  "Transfers & payments": "--jnpr-ink-3",
};
// `group` is the server's answer and is preferred; `label` is the fallback for a
// spending row (whose label IS its group) or a stale payload from before the
// server sent groups.
const catColor = (label: string, group?: string): SeriesKey =>
  GROUP_COLOR[group ?? ""] ?? GROUP_COLOR[label] ?? "--jnpr-c7";
const ACCT_CYCLE: SeriesKey[] = ["--jnpr-c1", "--jnpr-c3", "--jnpr-c5", "--jnpr-c2", "--jnpr-c6", "--jnpr-c4"];

// Raw shape returned by GET /api/finances (colors are a frontend concern, so the
// endpoint stays color-agnostic and we add `k` here).
interface RawFinances {
  linked: boolean;
  netWorth?: FinanceData["netWorth"];
  cashflow?: FinanceData["cashflow"];
  // `c` is a category GROUP label here: the endpoint rolls the month up by group
  // (nine coherent wedges) rather than by leaf category (dozens of slivers), and
  // excludes transfers and card payments so the total matches `cashflow.spent`.
  spending?: { c: string; v: number }[];
  budgets?: Budget[];
  // `c` is the transaction's own leaf category (the granular label), `g` the
  // group it rolls up into, which is what colors the row.
  transactions?: { m: string; c: string; g?: string; v: number; d: string; inc?: boolean }[];
  accounts?: { cash: Omit<Account, "k">[]; invest: Omit<Account, "k">[]; debt: Omit<Account, "k">[] };
  score?: FinanceData["score"];
  // Whether transaction rows exist for this member. The three transaction-derived
  // fields above are absent when it's false, so this is the signal pages gate on
  // rather than guessing from which fields arrived.
  hasTransactions?: boolean;
}

// Merge a live payload over `base`, the layer beneath it: the member's own
// manual figures, or EMPTY. Colors are applied here so the endpoint can stay
// color-agnostic. Every field falls back to `base` and none to MOCK: an absent
// section means "nothing honest to report server-side", and answering that with
// the demo household would put another family's money on this dashboard. A
// present-but-empty section (say, no spending yet this month) is respected as
// given, which is why these test for the key rather than coalescing.
function mergeLive(raw: RawFinances, base: FinanceData): FinanceData {
  const color = <T extends Omit<Account, "k">>(arr: T[]): Account[] =>
    arr.map((a, i) => ({ ...a, k: ACCT_CYCLE[i % ACCT_CYCLE.length] }));
  return {
    netWorth: raw.netWorth ?? base.netWorth,
    cashflow: raw.cashflow ?? base.cashflow,
    spending: raw.spending ? raw.spending.map((s) => ({ ...s, k: catColor(s.c) })) : base.spending,
    budgets: raw.budgets ?? base.budgets,
    transactions: raw.transactions
      ? raw.transactions.map((t) => ({ ...t, k: t.inc ? "--jnpr-good" : catColor(t.c, t.g) }))
      : base.transactions,
    accounts: raw.accounts
      ? {
          cash: color(raw.accounts.cash ?? []),
          invest: color(raw.accounts.invest ?? []),
          debt: color(raw.accounts.debt ?? []),
        }
      : base.accounts,
    score: raw.score ?? base.score,
  };
}

// Returns the payload as it arrived, unmerged: the base it belongs on top of can
// still change (a profile that hydrates from the server after this resolves), so
// merging is left to render time.
async function fetchFinances(): Promise<RawFinances | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch("/api/finances", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawFinances;
    if (!raw?.linked) return null;
    return raw;
  } catch {
    return null;
  }
}

export type FinanceSource = "mock" | "manual" | "live";
export interface FinancesValue {
  data: FinanceData;
  source: FinanceSource;
  loading: boolean;
  // Whether a real transaction feed sits behind `data`. Only a live payload can
  // set it (manual and demo dashboards have no feed). Pages gate their
  // transaction-dependent cards on this rather than on `source === "live"`,
  // which is now true for members who have balances and nothing else.
  hasTransactions: boolean;
}

const FinancesContext = createContext<FinancesValue | null>(null);

export function FinancesProvider({ profile, children }: { profile: UserProfile | null; children: ReactNode }) {
  // The manual dashboard is derived synchronously from the local profile, so a
  // hand-onboarded member sees their own numbers on first paint (no flash of
  // demo data). It's both the baseline until the live fetch resolves and the
  // layer the live payload merges over once it does.
  const manual = useMemo(() => buildManualFinances(profile), [profile]);
  const [raw, setRaw] = useState<RawFinances | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchFinances()
      .then((next) => {
        if (!alive) return;
        if (next) setRaw(next);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Resolved at render, not on arrival, so a profile that loads late still ends
  // up underneath the live payload instead of being missed by it.
  const value = useMemo<FinancesValue>(() => {
    if (raw) {
      return {
        data: mergeLive(raw, manual ?? EMPTY),
        source: "live",
        loading,
        hasTransactions: !!raw.hasTransactions,
      };
    }
    return manual
      ? { data: manual, source: "manual", loading, hasTransactions: false }
      : { data: MOCK, source: "mock", loading, hasTransactions: false };
  }, [raw, manual, loading]);

  return createElement(FinancesContext.Provider, { value }, children);
}

export function useFinances(): FinancesValue {
  const ctx = useContext(FinancesContext);
  // Fallback keeps any consumer rendered outside the provider working on mock
  // data rather than throwing.
  return ctx ?? { data: MOCK, source: "mock", loading: false, hasTransactions: false };
}
