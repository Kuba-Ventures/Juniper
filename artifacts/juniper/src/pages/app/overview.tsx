import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  money, moneyK, money2,
  type Budget, type Account, type Txn, type SpendCat,
} from "@/lib/mock-data";
import { useFinances, type FinanceData } from "@/lib/finances";
import { fetchInstitutionLogos, fetchPlaidItems, type InstitutionBrandMap } from "@/lib/plaid";
import { brandForName, resolveInstitutionMark } from "@/lib/institution-brand";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import {
  useMemberPlans, planTitle, planColor, planShape, planNumbers, SHAPE_ICON, unplannedGoals,
} from "@/lib/plans";
import {
  BrandTile, PlanIcon, cssVar, NetWorthChart, SpendingDonut, MiniRing, PlanSpark, SCORE_DASH,
} from "@/components/juniper/primitives";
import {
  WIDGETS, WIDGET_BY_ID, isShown, layoutFrom, resolveOrder, withMoved, withNudged,
  sizeFor, sizeLabel, sizeIsFull, type DashboardLayout,
} from "@/lib/dashboard-layout";
import {
  CardsWidget, RecurringWidget, useCardsWidget, useRecurringWidget,
} from "@/components/juniper/overview-widgets";
import { Factors } from "@/components/juniper/score-factors";
import type { PlaidItem } from "@/lib/plaid";

// Points down for a decline. The net-worth delta used to be hardcoded up-and-
// green, which was safe only while the number came from a demo household that
// always rose. It is now computed from the selected range, so it can be negative.
const TrendArrow = ({ down }: { down?: boolean }) => (
  <svg viewBox="0 0 12 12" fill="none" style={down ? { transform: "rotate(180deg)" } : undefined}><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07L11 5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07L13 19" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16}><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
);

// Shown in place of the spending and budgets cards when there's no transaction
// feed yet. Nothing fake is presented as the member's, just an honest path to
// unlock the real thing. Subscription tracking used to be named here too; it was
// never built, so promising it was the same lie as showing seeded rows, only
// politer.
function ConnectNudge() {
  return (
    <div className="card nudge-card">
      <div className="nc-mark"><LinkIcon /></div>
      <h3>Unlock spending and budgets</h3>
      <p>Connect an account and Juniper categorizes your transactions automatically: your spending breakdown and your budgets appear here.</p>
      <Link href="/app/connections" className="btn" style={{ marginTop: 4 }}>Connect an account</Link>
    </div>
  );
}

// A member can have a transaction feed and no budgets at all: nothing in the app
// writes to /api/budgets yet, so this is the common case, not the edge one. The
// card used to map an empty array and leave a titled box with nothing under it.
// The copy names a real starting category off this month's own spending rather
// than sending anyone somewhere vague; the link lands on the Budgets panel of
// the Transactions page, which is where limits are configured, next to the
// spending they bound. This card stays on the Overview for review.
function BudgetsEmpty({ top }: { top?: SpendCat }) {
  return (
    <div className="bud-empty">
      <p>
        No budgets yet. A budget puts a monthly limit on one category, and Juniper flags it the moment you go over.
        {top && <> <b><span className="cat-em" aria-hidden>{top.e}</span>{top.c}</b> is your biggest this month at {money(top.v)}, a fair place to start.</>}
      </p>
      <Link href="/app/transactions?panel=budgets" className="link">Set a budget →</Link>
    </div>
  );
}

function Budgets({ items, spending }: { items: Budget[]; spending: SpendCat[] }) {
  if (items.length === 0) {
    const top = spending.reduce<SpendCat | undefined>((best, s) => (!best || s.v > best.v ? s : best), undefined);
    return <BudgetsEmpty top={top} />;
  }
  return (
    <div>
      {items.map((b, i) => {
        const pct = Math.min(100, Math.round((b.s / b.l) * 100));
        const over = b.s > b.l;
        return (
          <div className={`bud ${over ? "over" : "ok"}`} key={i}>
            <div className="t">
              <span><span className="cat-em" aria-hidden>{b.e}</span>{b.c}</span>
              <span className="r"><b className="tnum">{money(b.s)}</b> of {money(b.l)}{over && <> · <span className="flag">{money(b.s - b.l)} over</span></>}</span>
            </div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

// The mark belongs to the INSTITUTION, not the account. This used to key off
// `a.n`, the account name, so a Chase card called "Ultimate Rewards" got a "U"
// tile and a checking account at any bank got a "C". Neither ever matched a
// brand, which is why every row here was a colored letter. `a.i` is the
// institution, and that is what has a logo.
function AccountMark({ account, brands }: { account: Account; brands: InstitutionBrandMap | null }) {
  const mark = resolveInstitutionMark(account.i, brandForName(brands, account.i));
  if (mark.kind === "logo") return <img className="blogo" src={mark.src} alt="" />;
  if (mark.kind === "monogram") {
    return (
      <div className="tile" style={{ background: mark.background, color: mark.color }}>
        {mark.letter}
      </div>
    );
  }
  // Last resort keeps a row from ever being blank: the rollup's own series color
  // with the institution's initial.
  return <BrandTile name={account.i} letter={(account.i[0] || "?").toUpperCase()} k={account.k} />;
}

function AccountGroup({ title, arr, brands }: { title: string; arr: Account[]; brands: InstitutionBrandMap | null }) {
  return (
    <>
      <div className="subhead">{title}</div>
      {arr.map((a, i) => (
        <div className="row" key={i}>
          <AccountMark account={a} brands={brands} />
          <div><div className="nm">{a.n}</div><div className="mt">{a.i}</div></div>
          <div className="amt">{money(a.v)} {a.apr && <span className="apr-chip">{a.apr}</span>}</div>
        </div>
      ))}
    </>
  );
}

function TransactionsPanel({ items }: { items: Txn[] }) {
  const [q, setQ] = useState("");
  const rows = items.filter((t) => (t.m + " " + t.c).toLowerCase().includes(q.toLowerCase()));
  return (
    // `fill-rows`: the list grows to the card's height rather than a fixed one,
    // because the card's height comes from the Accounts column beside it.
    <div className="card fill-rows">
      <div className="card-head">
        <h3>Transactions</h3>
        <span className="search" style={{ maxWidth: 220 }}>
          <SearchIcon />
          {/* "recent", because this searches the rows the card holds and not
              the full history. The Transactions tab searches everything. */}
          <input placeholder="Search recent" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
      </div>
      {/* Fills the card's height rather than scrolling inside it: the wheel
          belongs to the page. */}
      <div className="rows rows-fill">
        {rows.map((t, i) => (
          <div className="row" key={i}>
            {/* The same three-source mark the Transactions page uses: Plaid's
                own art, then bundled art, then a monogram. This used to be a
                bare BrandTile, so the card could only ever show one of the two
                dozen bundled brands however much art Plaid had. */}
            <MerchantMark logo={t.logo ?? null} merchant={t.m} name={t.m} k={t.k} />
            <div><div className="nm">{t.m}</div><div className="mt">{t.c} · {t.d}</div></div>
            <div className={`amt ${t.inc ? "inc" : ""}`}>{money2(t.v)}</div>
          </div>
        ))}
        {!rows.length && <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>No matching transactions.</div>}
      </div>
    </div>
  );
}

// Net-worth range windows, in months. "All" is the whole series.
//
// The series is one point per net_worth_snapshots row (api/finances.ts reads them
// in date order, and the snapshot job writes one per day), but each point arrives
// carrying a MONTH label rather than a date, so a window can only be cut on a
// month boundary: count runs of the same label back from the newest point. Good
// enough for these five pills, and it needs no change to the endpoint's contract.
const RANGES = [["1M", 1], ["3M", 3], ["6M", 6], ["1Y", 12]] as const;
type RangeId = (typeof RANGES)[number][0] | "All";

// How many calendar months the labels span, counting a run of identical labels
// (a month's worth of daily snapshots) as one.
function monthSpan(labels: string[]): number {
  return labels.reduce((n, l, i) => (i === 0 || l !== labels[i - 1] ? n + 1 : n), 0);
}

// First index of the last `months` month-runs.
function windowStart(labels: string[], months: number): number {
  let runs = 0;
  for (let i = labels.length - 1; i >= 0; i--) {
    if (i === labels.length - 1 || labels[i] !== labels[i + 1]) {
      runs++;
      if (runs > months) return i + 1;
    }
  }
  return 0;
}

function NetWorthCard({ netWorth, cashflow, size }: { netWorth: FinanceData["netWorth"]; cashflow: FinanceData["cashflow"]; size: string }) {
  // Hooks run unconditionally regardless of `size`, per the rules of hooks:
  // the branch on which JSX to return happens after them, at the bottom.
  const [range, setRange] = useState<RangeId>("All");
  const { labels, series } = netWorth;
  const estimated = netWorth.estimated ?? [];
  const span = monthSpan(labels);
  // A window at least as wide as the data draws exactly the same line as "All",
  // so it is offered disabled rather than as a pill that looks like it did
  // something. The degenerate case is the common one at first: with one day of
  // history every pill collapses onto "All", so all four go dim and the note
  // below says why, instead of five buttons quietly showing one identical point.
  const enabled = (id: RangeId) => id === "All" || (RANGES.find(([r]) => r === id)?.[1] ?? 0) < span;
  // Falling back at render, rather than resetting state, keeps a member's choice
  // if a later fetch brings enough history to make it valid again.
  const active: RangeId = enabled(range) ? range : "All";
  const months = RANGES.find(([r]) => r === active)?.[1];
  const from = months == null ? 0 : windowStart(labels, months);
  const win = series.slice(from);
  const winLabels = labels.slice(from);
  // Sliced with the series so the dashed run stays attached to the right points
  // whichever range pill is active.
  const winEstimated = estimated.slice(from);
  const anyEstimated = winEstimated.some(Boolean);
  // Change ACROSS THE SELECTED WINDOW, which is the only reading of these pills
  // that means anything. A one-point window has no change to report, so the chip
  // is dropped rather than printed as 0%. The denominator is the absolute
  // opening value so a member climbing out of net debt reads as up, not down.
  const changeAbs = win.length > 1 ? win[win.length - 1] - win[0] : 0;
  const base = Math.abs(win[0] ?? 0);
  const changePct = changeAbs && base ? Math.round((changeAbs / base) * 1000) / 10 : 0;
  const noRanges = !RANGES.some(([r]) => enabled(r));

  // Compact: the number, the month-over-month change (the same figure the
  // greeting band's "up $X this month" reads), and a plain sparkline over the
  // whole series, no range pills and no cashflow footer. For a member who
  // wants net worth on the page without it being the tallest card.
  if (size === "compact") {
    return (
      <div className="card">
        <div className="eyebrow">Net worth</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 6 }}>
          <span className="big-num tnum">{money(netWorth.value)}</span>
          {netWorth.changeAbs !== 0 && (
            <span className={`delta ${netWorth.changeAbs > 0 ? "up" : "down"}`} style={{ marginBottom: 5 }}>
              <TrendArrow down={netWorth.changeAbs < 0} />{Math.abs(netWorth.changePct)}%
            </span>
          )}
        </div>
        <div style={{ marginTop: 10 }}>
          <PlanSpark data={series} k="--jnpr-accent" height={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="card pad-lg">
      <div className="card-head">
        <div>
          <div className="eyebrow">Net worth</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 6 }}>
            <span className="big-num tnum">{money(netWorth.value)}</span>
            {changeAbs !== 0 && (
              <span className={`delta ${changeAbs > 0 ? "up" : "down"}`} style={{ marginBottom: 5 }}>
                <TrendArrow down={changeAbs < 0} />{Math.abs(changePct)}%
              </span>
            )}
          </div>
        </div>
        <div className="pills" role="group" aria-label="Net worth range">
          {([...RANGES.map(([r]) => r), "All"] as RangeId[]).map((r) => (
            <button
              key={r}
              className={r === active ? "on" : undefined}
              disabled={!enabled(r)}
              title={enabled(r) ? undefined : "Not enough history yet"}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <NetWorthChart series={win} labels={winLabels} estimated={winEstimated} />
      {anyEstimated && (
        <div className="nw-legend">
          {/* "Estimated" rather than "rebuilt from your transactions", because
              two different things now set this flag: a point reconstructed
              backward from transactions, and a day where one bank did not
              answer and its last known balance was carried forward. The note
              below names both. */}
          <span><i className="est" />Estimated</span>
          <span><i />Recorded by Juniper</span>
        </div>
      )}
      {anyEstimated ? (
        <p className="nw-note">
          A dashed point is one Juniper worked out rather than read live. Points before you
          joined are rebuilt from your transactions, back to the oldest one your bank shared: cash
          and card balances there are exact, while invested balances count the money you added but
          not how the market moved, because Plaid reports today's prices and not past ones. A
          dashed point in recent days means a bank did not answer that day, so its last known
          balance was carried forward.
        </p>
      ) : noRanges ? (
        <p className="nw-note">Ranges open up as history builds. Juniper saves one net worth point a day, and this is everything recorded so far.</p>
      ) : null}
      <div className="cf-foot">
        <div><div className="l">Income · {cashflow.month}</div><div className="v pos tnum">+{money(cashflow.income)}</div></div>
        <div><div className="l">Spent</div><div className="v tnum">{money(cashflow.spent)}</div></div>
        <div><div className="l">Saved</div><div className="v acc tnum">{money(cashflow.saved)}</div></div>
      </div>
    </div>
  );
}

// The member's real plans, read through the same `useMemberPlans` hook the Plans
// page uses so the two surfaces cannot disagree about what exists. Example plans
// live only on the Plans page: they are illustration, so they must never appear
// here, where everything on the screen is the member's own money.
// One plan or waiting goal, reduced to the fields every shape below draws from,
// so List/Compact/Tiles read one list rather than each re-deriving it from the
// two source arrays (real plans, unplanned goals) with their own field names.
interface PlanRow {
  key: string;
  title: string;
  color: string;
  icon: string;
  current: number;
  target: number;
  prog: number;
  /** A signup goal with no plan behind it yet, not a plan the member started.
   *  Every shape below dims its progress element for one, the same "hasn't
   *  really begun" cue the original list-only `.waiting` class carried. */
  waiting: boolean;
}

function PlanListRow({ row }: { row: PlanRow }) {
  return (
    <Link href="/app/plans" className={row.waiting ? "plan-row waiting" : "plan-row"}>
      <div className="track" style={{ background: cssVar(row.color) }}><PlanIcon name={row.icon} /></div>
      <div className="pr-body">
        <div className="pr-top">
          <span className="pt">{row.title}</span>
          {row.target > 0 ? <span className="amt tnum">{moneyK(row.current)} <small>/ {moneyK(row.target)}</small></span> : null}
        </div>
        <div className="bar"><i style={{ width: `${row.prog}%`, background: cssVar(row.color) }} /></div>
        <div className="pr-bot">
          <span>{row.target > 0 ? `${row.prog}% funded` : "No target set yet"}</span>
          <span className={`status ${row.target > 0 ? "ok" : "setup"}`}>{row.target > 0 ? "On track" : "Setup"}</span>
        </div>
      </div>
    </Link>
  );
}

// Compact: a name and a percent, nothing else. For a member with several plans
// who wants to scan all of them without the progress bar's vertical cost.
function PlanCompactRow({ row }: { row: PlanRow }) {
  return (
    <Link href="/app/plans" className={row.waiting ? "plan-crow waiting" : "plan-crow"}>
      <div className="track" style={{ background: cssVar(row.color) }}><PlanIcon name={row.icon} /></div>
      <span className="pt">{row.title}</span>
      <span className="pct tnum">{row.target > 0 ? `${row.prog}%` : "—"}</span>
    </Link>
  );
}

// Tiles: the same card, laid out as a grid rather than a stack. Shared by
// Gallery (half width) and Grid (full width, issue #259) because the two
// differ only in how many columns the board gives them room for, which
// `auto-fill`/`minmax` already answers without a second component.
function PlanTile({ row }: { row: PlanRow }) {
  return (
    <Link href="/app/plans" className={row.waiting ? "plan-tile waiting" : "plan-tile"}>
      <div className="track" style={{ background: cssVar(row.color) }}><PlanIcon name={row.icon} /></div>
      <span className="pt">{row.title}</span>
      <div className="bar"><i style={{ width: `${row.prog}%`, background: cssVar(row.color) }} /></div>
      <span className="pct">{row.target > 0 ? `${row.prog}% funded` : "No target set yet"}</span>
    </Link>
  );
}

function YourPlansCard({ goals, goalsReady, size }: { goals: string[]; goalsReady: boolean; size: string }) {
  const { plans, loading } = useMemberPlans();
  const active = plans.filter((p) => p.status !== "completed");
  // Goals picked at signup that no plan covers yet. They are listed under the
  // real plans, reading "No target yet" rather than a number, because no plan
  // row exists for them until the member sets one. Without this the card said
  // "No plans yet" to somebody who had just told onboarding three of them.
  const waiting = useMemo(() => unplannedGoals(goals, plans), [goals, plans]);
  const hasAnything = active.length > 0 || waiting.length > 0;
  const rows: PlanRow[] = [
    ...active.map((p) => {
      const { current, target } = planNumbers(p);
      return {
        key: p.domain,
        title: planTitle(p),
        color: planColor(p),
        icon: SHAPE_ICON[planShape(p)],
        current,
        target,
        prog: target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0,
        waiting: false,
      };
    }),
    ...waiting.map((g) => ({
      key: g.goal, title: g.goal, color: g.color, icon: "target", current: 0, target: 0, prog: 0, waiting: true,
    })),
  ];
  return (
    <div className="card">
      <div className="card-head"><h3>Your plans</h3><Link href="/app/plans" className="link">+ New</Link></div>
      {loading ? (
        <div style={{ padding: "8px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>Loading your plans…</div>
      ) : hasAnything ? (
        size === "compact" ? (
          <div className="plan-compact">{rows.map((r) => <PlanCompactRow row={r} key={r.key} />)}</div>
        ) : size === "gallery" || size === "grid" ? (
          <div className="plan-tiles">{rows.map((r) => <PlanTile row={r} key={r.key} />)}</div>
        ) : (
          <div className="plans-col">{rows.map((r) => <PlanListRow row={r} key={r.key} />)}</div>
        )
      ) : goalsReady ? (
        <div style={{ padding: "8px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, lineHeight: 1.6 }}>
          No plans yet. Turn a goal into a plan (save for a home, pay off debt, build an emergency fund) and track it here.
          <div style={{ marginTop: 12 }}><Link href="/app/plans" className="btn sm">Start a plan</Link></div>
        </div>
      ) : null}
    </div>
  );
}

// ── ARRANGING (issue #251) ─────────────────────────────────────────────────
//
// The Overview is the most-visited page in the app and it used to be the same
// page for everybody, in an order somebody chose once. It is now the member's:
// Arrange turns the cards themselves into the editor, they drag them where they
// want them, and a card they do not want goes to a shelf rather than away.
//
// Treatment A of four, rendered in design/dashboard-widgets-variants.html. The
// three it beat were a list of widget names in a side panel, a scale model of
// the page in a sheet, and a hybrid of the two. What won is the one where the
// member is looking at the actual card while deciding whether they want it.
//
// FOUR RULES HOLD HERE, and they are what makes this a layout feature rather
// than a settings page. They are stated where they are enforced, and this is the
// index:
//   1. The stored value is the order and the HIDDEN set, never the visible list.
//      See lib/dashboard-layout.ts, which is where that argument lives.
//   2. A hidden widget must never hide a fact. A summary that cannot carry its
//      own caveat does not carry the figure either: the member-set-limit note
//      travels with utilization, the point-value disclosure with a rewards rate,
//      the unset-cadence count with the recurring total.
//   3. An empty widget does not hold its slot. A widget with nothing to say
//      collapses out of the flow rather than sitting as a titled box with
//      nothing under it, and it is drawn as a placeholder ONLY while arranging,
//      so the slot the member gave it is still theirs to move.
//   4. Empty states are not widgets. ConnectNudge is not arrangeable and never
//      enters the order: it is the page's answer to having no data at all.
//
// PERSONAL OVERVIEW ONLY, deliberately. The shared space builds its nav from
// what the partnership holds rather than from a declaration
// (components/juniper/shared-frame.tsx), so "which cards are on it" is already
// answered there by the content, and a second, member-owned answer would be a
// third source of truth about a page two people share. Whether one member may
// arrange a page both of them look at is a question about the partnership, not
// about layout, and it is not answered here.

/** The keyboard's version of a drag. A grip is a real button, so it is reachable
 *  by Tab, and the arrows move the card it belongs to. Without this the whole
 *  feature is mouse-only, which is the defect #190 fixed on plan cards. */
const NUDGE_KEYS: Record<string, -1 | 1> = {
  ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1,
};

const GripIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={13} height={13}><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" /></svg>
);

const ArrangeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" width={14} height={14}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);

/** Drawn in a widget's place while arranging, when the widget has nothing to
 *  show. Rule 3: it must not occupy a slot on the live page, and the member must
 *  still be able to move the slot they chose for it. */
function EmptySlot({ title, why }: { title: string; why: string }) {
  return (
    <div className="card dash-empty">
      <div className="card-head"><h3>{title}</h3></div>
      <p>{why}</p>
    </div>
  );
}

function LoadingSlot({ title }: { title: string }) {
  return (
    <div className="card dash-empty">
      <div className="card-head"><h3>{title}</h3></div>
      <p>Loading…</p>
    </div>
  );
}

/**
 * Which widgets sit on which row, and whether the last one stretches.
 *
 * The page used to have two different grids, a 1.5fr/1fr hero and two equal
 * rows. Neither survives free ordering: the pairing is a property of the pair
 * and the member moves one card at a time. So every widget is a half, a widget
 * SIZED full (issue #259: a member's own choice, not a fixed registry flag)
 * spans the row, and a half left ALONE on the final row stretches rather than
 * sitting beside a hole. Net worth losing its wider column is the price of
 * free ordering and is paid here.
 */
function withSpans(ids: string[], sizeOf: (id: string) => string): { id: string; full: boolean }[] {
  const out: { id: string; full: boolean }[] = [];
  let col = 0;
  for (const id of ids) {
    const full = sizeIsFull(id, sizeOf(id));
    out.push({ id, full });
    col = full ? 0 : col === 0 ? 1 : 0;
  }
  const last = out[out.length - 1];
  if (last && !last.full && col === 1) last.full = true;
  return out;
}

/** The Score at half width is either the strip (default) or a bigger centered
 *  ring, sized and laid out like the spending donut so a member who wants the
 *  Score to read as prominently as "Where it went" has that option; at full
 *  width it is the same factor rails /app/score draws, from
 *  `components/juniper/score-factors.tsx`, so the two can never disagree about
 *  what a factor's rail shows. Issue #259: a widget declares which sizes it
 *  HAS rather than being scaled, because a strip, a ring, and a full-width
 *  breakdown are three different cards, not one card at three zoom levels. */
function ScoreWidget({ score, pending, size }: { score: FinanceData["score"]; pending: boolean; size: string }) {
  if (size === "full") {
    return (
      <div className="card pad-lg">
        <div className="card-head">
          <h3>Juniper Score</h3>
          <Link href="/app/score" className="link">Full page →</Link>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "2px 0 14px" }}>
          <span className={pending ? "big-num tnum pending" : "big-num tnum"}>{pending ? SCORE_DASH : score.value}</span>
          {!pending && score.delta !== 0 && (
            <span className={`delta ${score.delta > 0 ? "up" : "down"}`}>
              {score.delta > 0 ? "+" : ""}{score.delta} pts this month
            </span>
          )}
        </div>
        {/* Same WITHHELD-not-ZEROED rule as the strip below: the factor rails
            are derived too, and a manual-layer rail replaced a moment later by
            a live one would be the exact flash #240 fixed, just moved here. */}
        {pending ? <div style={{ height: 96 }} aria-hidden="true" /> : <Factors items={score.factors} />}
      </div>
    );
  }
  if (size === "ring") {
    return (
      <div className="card score-ring">
        <div className="card-head">
          <h3>Juniper Score</h3>
          <Link href="/app/score" className="link">See breakdown →</Link>
        </div>
        {/* Same grid the spending donut uses (170px ring column + a details
            column), so a member who wants this card to carry the same visual
            weight as "Where it went" gets exactly that, not an approximation
            of it. */}
        <div className="donut-wrap">
          <div className="chart">
            <MiniRing score={score.value} pending={pending} d={170} />
          </div>
          <div>
            <span className={pending ? "band pending" : "band"}>
              {pending ? SCORE_DASH : <>{score.value} · {score.band}</>}
            </span>
            <div className="st-s">
              {pending
                ? <>Working out your score…</>
                : score.delta !== 0
                  ? <><b>{score.delta >= 0 ? "+" : ""}{score.delta} pts</b> this month · biggest lever: {score.lever}</>
                  : <>Your starting score · biggest lever: {score.lever}</>}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    /* WITHHELD, NOT ZEROED, until the server has answered. The score is derived,
       and the manual layer derives it from different inputs than the live one,
       so drawing it on first paint showed a profile-derived 53 replaced a
       moment later by a live 97. See `scorePending` in lib/finances.ts. The
       strip keeps its exact shape either way, so nothing moves when the real
       number arrives. */
    <div className="score-strip">
      <MiniRing score={score.value} pending={pending} />
      <div>
        <div className="st-t">
          Juniper Score{" "}
          <span className={pending ? "band pending" : "band"}>
            {pending ? SCORE_DASH : <>{score.value} · {score.band}</>}
          </span>
        </div>
        <div className="st-s">
          {pending
            ? <>Working out your score…</>
            : score.delta !== 0
              ? <><b>{score.delta >= 0 ? "+" : ""}{score.delta} pts</b> this month · biggest lever: {score.lever}</>
              : <>Your starting score · biggest lever: {score.lever}</>}
        </div>
      </div>
      <Link href="/app/score" className="link" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>See breakdown →</Link>
    </div>
  );
}

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={12} height={12}><path d="M6 9l6 6 6-6" /></svg>
);

export default function Overview({
  name,
  goals = [],
  goalsReady = false,
  showWelcome,
  onDismissWelcome,
  layout = null,
  onLayout,
}: {
  name: string;
  goals?: string[];
  // False until the profile has resolved. The card waits on it rather than
  // rendering "No plans yet" for a beat at somebody who has goals.
  goalsReady?: boolean;
  showWelcome?: boolean;
  onDismissWelcome?: () => void;
  /** How this member arranged their Overview (migration 0049), or null for
      "has not arranged anything", which is not the same as arranging the
      default: an unarranged member moves if the default order ever changes. */
  layout?: DashboardLayout | null;
  onLayout?: (next: DashboardLayout) => void;
}) {
  const { data, hasTransactions, scorePending } = useFinances();
  // Institution brand art for the Accounts card, and the credit accounts the
  // Cards widget reads. One fetch per page load, cached for a week server-side,
  // and it only ever covers institutions this member has linked. Failure is
  // silent by design: the mark resolver falls through to bundled art and then a
  // monogram, so a logo is a nicety, never a dependency.
  const [brands, setBrands] = useState<InstitutionBrandMap | null>(null);
  const [items, setItems] = useState<PlaidItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Two calls rather than one: the logo endpoint keys its week-long cache on
    // the set of institution ids the caller holds, so it needs the ids, and the
    // account rollup this page renders carries only institution names. Without
    // the id set a newly linked bank would sit on a cached miss and show a
    // monogram for a week.
    fetchPlaidItems()
      .then((list) => {
        if (!cancelled) setItems(list);
        return fetchInstitutionLogos(list.map((it) => it.institution_id));
      })
      .then((m) => {
        if (!cancelled) setBrands(m);
      })
      .catch(() => {
        // A logo is a nicety: the resolver falls through to bundled art, then a
        // monogram. `items` staying null costs the Cards widget its list, which
        // is why that widget treats null as still-loading rather than as empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const { netWorth, cashflow, spending, budgets, transactions, accounts, score } = data;
  const first = (name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  // The donut's own total, so the "Where it went" header can never disagree with
  // the wedges under it. On live data it also equals `cashflow.spent` in the
  // strip above: /api/finances defines spent AS the sum of this breakdown, both
  // of them net of transfers and credit-card payments. Read from the wedges
  // rather than from cashflow so the header stays true to what is drawn even on
  // a manual dashboard, where the two come from different places.
  const totalSpent = spending.reduce((a, s) => a + s.v, 0);
  // With no transaction feed (manual entry, or a fresh link whose transactions
  // haven't landed), spending, budgets and the recent-transactions list have
  // nothing real to show, so they collapse and an honest connect nudge takes
  // their place at the foot of the page.
  //
  // Gated on the server's `hasTransactions`, not on source === "live", which is
  // now true for a member who only has balances (api/finances.ts gates per
  // section).
  const hasTxns = hasTransactions && (transactions.length > 0 || spending.length > 0);

  // ── the member's arrangement ─────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>(() => resolveOrder(layout));
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(WIDGETS.filter((w) => !isShown(layout, w.id)).map((w) => w.id)),
  );
  // Issue #259: every widget's current size, keyed by id. Populated for every
  // widget in the registry, not only the ones with a choice to make, so a
  // reader never has to fall back to a default mid-render.
  const [sizes, setSizes] = useState<Record<string, string>>(
    () => Object.fromEntries(WIDGETS.map((w) => [w.id, sizeFor(layout, w.id)])),
  );
  // Which widget's size menu is open, one at a time, closed by choosing a size,
  // by clicking anywhere else, or by leaving arrange mode.
  const [sizeMenuOpen, setSizeMenuOpen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // ── the write side reads the refs, not the state ─────────────────────────
  //
  // Both mutations below can fire more than once before React re-renders: two
  // chips tapped in the same tick, or a held arrow key repeating. Reading
  // `order`/`hidden`/`sizes` out of the closure loses every write but the last,
  // which is not theoretical: adding both shelf widgets at once put exactly one
  // of them back. The refs are updated synchronously, so the second call in a
  // tick sees the first.
  const orderRef = useRef(order);
  const hiddenRef = useRef(hidden);
  const sizesRef = useRef(sizes);
  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => { hiddenRef.current = hidden; }, [hidden]);
  useEffect(() => { sizesRef.current = sizes; }, [sizes]);


  // The profile resolves after first paint, so the stored layout arrives late.
  // Adopted only while NOT arranging: a remote answer landing mid-drag would
  // pull the card out from under the member's finger.
  useEffect(() => {
    if (editing) return;
    const nextOrder = resolveOrder(layout);
    const nextHidden = new Set(WIDGETS.filter((w) => !isShown(layout, w.id)).map((w) => w.id));
    const nextSizes = Object.fromEntries(WIDGETS.map((w) => [w.id, sizeFor(layout, w.id)]));
    orderRef.current = nextOrder;
    hiddenRef.current = nextHidden;
    sizesRef.current = nextSizes;
    setOrder(nextOrder);
    setHidden(nextHidden);
    setSizes(nextSizes);
    setSizeMenuOpen(null);
  }, [layout, editing]);

  // Written through the profile, so the arrangement lands in localStorage and in
  // `user_profiles` by the same path holder_style takes, and travels with the
  // member to every device rather than living on this one. Debounced, because a
  // keyboard nudge held down would otherwise be one POST per keypress.
  const saveTimer = useRef<number | null>(null);
  const persist = useCallback((nextOrder: string[], nextHidden: Set<string>, nextSizes: Record<string, string>) => {
    if (!onLayout) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      onLayout(layoutFrom(nextOrder, (id) => !nextHidden.has(id), (id) => nextSizes[id]));
    }, 500);
  }, [onLayout]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  const setShown = (id: string, on: boolean) => {
    const next = new Set(hiddenRef.current);
    if (on) next.delete(id); else next.add(id);
    hiddenRef.current = next;
    setHidden(next);
    persist(orderRef.current, next, sizesRef.current);
    setAnnounce(`${WIDGET_BY_ID[id]?.title} ${on ? "added to" : "taken off"} your Overview`);
  };

  const nudge = (id: string, delta: -1 | 1) => {
    const next = withNudged(orderRef.current, id, delta);
    if (next === orderRef.current) return;
    orderRef.current = next;
    setOrder(next);
    persist(next, hiddenRef.current, sizesRef.current);
    const visible = next.filter((w) => !hiddenRef.current.has(w));
    setAnnounce(`${WIDGET_BY_ID[id]?.title} moved to ${visible.indexOf(id) + 1} of ${visible.length}`);
  };

  // Issue #259: the member's own choice of size, one widget at a time. Reads
  // the same refs-not-state rule as `setShown`/`nudge` for the same reason.
  const setWidgetSize = (id: string, size: string) => {
    const next = { ...sizesRef.current, [id]: size };
    sizesRef.current = next;
    setSizes(next);
    setSizeMenuOpen(null);
    persist(orderRef.current, hiddenRef.current, next);
    setAnnounce(`${WIDGET_BY_ID[id]?.title} shown as ${sizeLabel(id, size).toLowerCase()}`);
  };

  // Closes an open size menu on a click anywhere else, the same behavior a
  // native <select> gets for free. Only listens while a menu is actually open,
  // so this costs nothing on every render of a page most members never arrange.
  useEffect(() => {
    if (!sizeMenuOpen) return;
    const close = () => setSizeMenuOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [sizeMenuOpen]);

  // Pointer events rather than the native HTML5 drag, which does not fire for
  // touch at all: this has to work on the phone the member is holding. The
  // capture is taken on the BOARD rather than on the card, because the card is
  // re-rendered mid-drag as the order changes and a capture on it would be lost
  // with the node it was taken on.
  const board = useRef<HTMLDivElement>(null);
  // Which card is being dragged, in a ref for the same reason the order is: the
  // handlers below can run before React has re-rendered with the new state, and
  // a `pointerup` that reads a stale null leaves the board stuck mid-drag. The
  // state copy exists only to put a class on the card.
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const onCardPointerDown = (e: React.PointerEvent, id: string) => {
    if (!editing) return;
    if ((e.target as HTMLElement).closest("button")) return; // the remove badge
    e.preventDefault();
    // Capture so the drag survives the pointer leaving the card, which it does
    // immediately: the cards reorder under the finger. Guarded because capture
    // throws on a pointer the browser no longer considers active, and losing the
    // capture is survivable (the board still sees the moves) while throwing here
    // would leave the page in a mode with no drag at all.
    try { board.current?.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    dragRef.current = id;
    setDragId(id);
  };
  const onBoardPointerMove = (e: React.PointerEvent) => {
    const id = dragRef.current;
    if (!id || !board.current) return;
    const over = widgetUnder(board.current, id, e.clientX, e.clientY);
    if (!over) return;
    const next = withMoved(orderRef.current, id, over);
    if (next === orderRef.current) return;
    orderRef.current = next;
    setOrder(next);
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragId(null);
    persist(orderRef.current, hiddenRef.current, sizesRef.current);
  };

  const cardsOn = !hidden.has("cards");
  const recurringOn = !hidden.has("recurring");
  const cardsData = useCardsWidget(cardsOn, items);
  const recurringData = useRecurringWidget(recurringOn);

  // Every widget, drawn once. A widget's own emptiness is decided here rather
  // than inside it, because the board has to know whether to give it a slot
  // before it draws one (rule 3).
  const nodes: Record<string, ReactNode> = {
    score: <ScoreWidget score={score} pending={scorePending} size={sizes.score} />,
    networth: <NetWorthCard netWorth={netWorth} cashflow={cashflow} size={sizes.networth} />,
    plans: <YourPlansCard goals={goals} goalsReady={goalsReady} size={sizes.plans} />,
    spend: (
      <div className="card">
        {/* No month picker. /api/finances rolls up the CURRENT month and
           nothing else, so the three pills that used to sit here (June, July,
           Aug, with July lit whatever the date) were inert and mislabeled at
           once. The month is stated instead. */}
        <div className="card-head"><h3>Where it went: {money(totalSpent)}</h3><span className="head-note">{cashflow.month}</span></div>
        <SpendingDonut data={spending} />
      </div>
    ),
    budgets: (
      <div className="card">
        <div className="card-head"><h3>Budgets</h3></div>
        <Budgets items={budgets} spending={spending} />
      </div>
    ),
    txns: <TransactionsPanel items={transactions} />,
    accounts: (
      <div className="card">
        <div className="card-head"><h3>Accounts</h3><Link href="/app/connections" className="link">Manage</Link></div>
        {accounts.cash.length + accounts.invest.length + accounts.debt.length === 0 ? (
          <div style={{ padding: "16px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>
            No accounts yet. <Link href="/app/connections" className="link">Connect one</Link> to see balances here.
          </div>
        ) : (
          <div className="rows">
            {accounts.cash.length > 0 && <AccountGroup title="Cash" arr={accounts.cash} brands={brands} />}
            {accounts.invest.length > 0 && <AccountGroup title="Investments" arr={accounts.invest} brands={brands} />}
            {accounts.debt.length > 0 && <AccountGroup title="Debts" arr={accounts.debt} brands={brands} />}
          </div>
        )}
      </div>
    ),
    cards: cardsData.loading
      ? <LoadingSlot title="Cards and rewards" />
      : <CardsWidget data={cardsData} />,
    recurring: recurringData.loading
      ? <LoadingSlot title="Recurring charges" />
      : <RecurringWidget data={recurringData} />,
  };

  // Why each widget has nothing to say, in the member's terms, because the
  // placeholder states it while they arrange.
  const emptyWhy: Record<string, string | null> = {
    score: null,
    networth: null,
    plans: null,
    spend: hasTxns ? null : "Connect an account and your spending breakdown appears here.",
    budgets: hasTxns ? null : "Connect an account and your budgets appear here.",
    txns: hasTxns ? null : "Connect an account and your recent transactions appear here.",
    accounts: null,
    cards: cardsData.empty ? "No credit cards linked yet." : null,
    recurring: recurringData.empty ? "No recurring charges detected yet." : null,
  };

  const shownIds = order.filter((id) => !hidden.has(id));
  // Rule 3 again, at the point it bites: an empty widget is skipped on the live
  // page and drawn as a placeholder while arranging.
  const laidOut = withSpans(shownIds.filter((id) => editing || !emptyWhy[id]), (id) => sizes[id]);
  const offIds = order.filter((id) => hidden.has(id));

  return (
    <div className="frame">
      <div className="greet dash-greet">
        <div>
          <h1>Good morning, {first}</h1>
          <div className="meta">
            <span>{today}</span>
            <span>·</span>
            {netWorth.changeAbs > 0
              ? <span className="up">Net worth up {money(netWorth.changeAbs)} this month</span>
              : <span>Here's your financial picture</span>}
          </div>
        </div>
        {/* The switch for a MODE, on the band the cards start under. Arranging
           is something you enter and leave, which is the half of the iPhone
           reference that matters; the tilt is the other half and is decoration. */}
        <button
          className={editing ? "dash-arr on" : "dash-arr"}
          onClick={() => { setEditing((v) => !v); setAnnounce(editing ? "Done arranging" : "Arranging your Overview"); }}
        >
          <ArrangeIcon />
          {editing ? "Done" : "Arrange"}
        </button>
      </div>

      {showWelcome && (
        <div className="welcome-tip">
          <div className="wt-body">
            <b>Welcome to Juniper, {first} 🌿</b>
            <p>This is your dashboard. Your net worth, accounts, and Juniper Score are built from what you shared. Connect an account anytime to unlock live spending and budgets.</p>
          </div>
          <button className="wt-x" onClick={onDismissWelcome} aria-label="Dismiss">
            <CloseIcon />
          </button>
        </div>
      )}

      {editing && (
        <p className="dash-hint">
          Drag a card to move it, or focus its handle and use the arrow keys. The minus takes a card off
          your Overview: its full version stays on its own page, and you can put it back below.
        </p>
      )}

      <div
        className={editing ? "dash-board editing" : "dash-board"}
        ref={board}
        onPointerMove={onBoardPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // The capture can be lost without a pointerup (a browser gesture, a
        // context menu, the tab losing focus). Without this the board would stay
        // in a drag nobody is performing.
        onLostPointerCapture={endDrag}
      >
        {laidOut.map(({ id, full }) => {
          const meta = WIDGET_BY_ID[id];
          const why = emptyWhy[id];
          return (
            <div
              key={id}
              data-widget={id}
              className={`dash-w${full ? " full" : ""}${dragId === id ? " dragging" : ""}`}
              onPointerDown={(e) => onCardPointerDown(e, id)}
            >
              {editing && (
                <>
                  <button
                    className="dash-grip"
                    aria-label={`Move ${meta.title}. Use the arrow keys.`}
                    onKeyDown={(e) => {
                      const d = NUDGE_KEYS[e.key];
                      if (!d) return;
                      e.preventDefault();
                      nudge(id, d);
                    }}
                  >
                    <GripIcon />
                  </button>
                  {/* Issue #259: only a widget that declares more than one size
                      gets a picker at all, and it lives in the top-right
                      corner beside the remove badge, visible only while
                      arranging, same as the grip and the badge either side
                      of it. */}
                  {meta.sizes.length > 1 && (
                    <div className={sizeMenuOpen === id ? "dash-size-c open" : "dash-size-c"}>
                      <button
                        className="dash-size-c-btn"
                        aria-label={`Choose how ${meta.title} is shown`}
                        aria-expanded={sizeMenuOpen === id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSizeMenuOpen((v) => (v === id ? null : id));
                        }}
                      >
                        <ChevronDownIcon />
                      </button>
                      <div className="dash-size-c-menu">
                        {meta.sizes.map((s) => (
                          <button
                            key={s.id}
                            className={sizes[id] === s.id ? "dash-size-c-item on" : "dash-size-c-item"}
                            onClick={() => setWidgetSize(id, s.id)}
                          >
                            <span>{s.label}</span>
                            <span className="ck" aria-hidden>✓</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    className="dash-x"
                    aria-label={`Take ${meta.title} off your Overview`}
                    onClick={() => setShown(id, false)}
                  >
                    −
                  </button>
                </>
              )}
              {why ? <EmptySlot title={meta.title} why={why} /> : nodes[id]}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="dash-shelf">
          <div className="dash-shelf-h">Not on your Overview</div>
          {offIds.length === 0 ? (
            <span className="dash-shelf-e">Everything is on your Overview.</span>
          ) : (
            <div className="dash-chips">
              {offIds.map((id) => (
                <button key={id} className="dash-chip" onClick={() => setShown(id, true)}>
                  <b>+</b>{WIDGET_BY_ID[id].title}
                  <span className="dash-chip-h">{WIDGET_BY_ID[id].homeLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RULE 4: an empty state is not a widget. This is the page's answer to
         having no transaction feed at all, it is not something the member chose
         to put here, and it never enters the order. */}
      {!hasTxns && !editing && (
        <div style={{ marginTop: 16 }}>
          <ConnectNudge />
        </div>
      )}

      <div className="sr-only" aria-live="polite">{announce}</div>
    </div>
  );
}

/** The widget the pointer is over, by nearest centre, ignoring the one being
 *  dragged. Nearest rather than hit-testing, so a drag into the gap between two
 *  cards still lands somewhere rather than doing nothing. */
function widgetUnder(board: HTMLElement, dragged: string, x: number, y: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const el of board.querySelectorAll<HTMLElement>("[data-widget]")) {
    const id = el.dataset.widget;
    if (!id || id === dragged) continue;
    const r = el.getBoundingClientRect();
    const d = (x - (r.left + r.width / 2)) ** 2 + (y - (r.top + r.height / 2)) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
