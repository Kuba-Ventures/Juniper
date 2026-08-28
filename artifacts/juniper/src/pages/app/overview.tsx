import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  money, moneyK, money2,
  type Budget, type Account, type Txn,
} from "@/lib/mock-data";
import { useFinances, type FinanceData } from "@/lib/finances";
import { fetchInstitutionLogos, fetchPlaidItems, type InstitutionBrandMap } from "@/lib/plaid";
import { brandForName, resolveInstitutionMark } from "@/lib/institution-brand";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import {
  useMemberPlans, planTitle, planColor, planShape, planNumbers, SHAPE_ICON,
} from "@/lib/plans";
import {
  BrandTile, PlanIcon, cssVar, NetWorthChart, SpendingDonut, MiniRing,
} from "@/components/juniper/primitives";

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

function Budgets({ items }: { items: Budget[] }) {
  return (
    <div>
      {items.map((b, i) => {
        const pct = Math.min(100, Math.round((b.s / b.l) * 100));
        const over = b.s > b.l;
        return (
          <div className={`bud ${over ? "over" : "ok"}`} key={i}>
            <div className="t">
              <span>{b.c}</span>
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
    <div className="card">
      <div className="card-head">
        <h3>Transactions</h3>
        <span className="search" style={{ maxWidth: 220 }}>
          <SearchIcon />
          <input placeholder="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
      </div>
      <div className="rows">
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

function NetWorthCard({ netWorth, cashflow }: { netWorth: FinanceData["netWorth"]; cashflow: FinanceData["cashflow"] }) {
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
function YourPlansCard() {
  const { plans, loading } = useMemberPlans();
  const active = plans.filter((p) => p.status !== "completed");
  return (
    <div className="card">
      <div className="card-head"><h3>Your plans</h3><Link href="/app/plans" className="link">+ New</Link></div>
      {loading ? (
        <div style={{ padding: "8px 2px", color: "var(--jnpr-ink-3)", fontSize: 13 }}>Loading your plans…</div>
      ) : active.length ? (
        <div className="plans-col">
          {active.map((p) => {
            const shape = planShape(p);
            const color = planColor(p);
            const { current, target } = planNumbers(p);
            const prog = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0;
            return (
              <Link href="/app/plans" className="plan-row" key={p.domain}>
                <div className="track" style={{ background: cssVar(color) }}><PlanIcon name={SHAPE_ICON[shape]} /></div>
                <div className="pr-body">
                  <div className="pr-top">
                    <span className="pt">{planTitle(p)}</span>
                    {target > 0 ? <span className="amt tnum">{moneyK(current)} <small>/ {moneyK(target)}</small></span> : null}
                  </div>
                  <div className="bar"><i style={{ width: `${prog}%`, background: cssVar(color) }} /></div>
                  <div className="pr-bot">
                    <span>{target > 0 ? `${prog}% funded` : "No target set yet"}</span>
                    <span className={`status ${target > 0 ? "ok" : "setup"}`}>{target > 0 ? "On track" : "Setup"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "8px 2px", color: "var(--jnpr-ink-3)", fontSize: 13, lineHeight: 1.6 }}>
          No plans yet. Turn a goal into a plan (save for a home, pay off debt, build an emergency fund) and track it here.
          <div style={{ marginTop: 12 }}><Link href="/app/plans" className="btn sm">Start a plan</Link></div>
        </div>
      )}
    </div>
  );
}

export default function Overview({
  name,
  showWelcome,
  onDismissWelcome,
}: {
  name: string;
  showWelcome?: boolean;
  onDismissWelcome?: () => void;
}) {
  const { data, hasTransactions } = useFinances();
  // Institution brand art for the Accounts card. One fetch per page load, cached
  // for a week server-side, and it only ever covers institutions this member has
  // linked. Failure is silent by design: the mark resolver falls through to
  // bundled art and then a monogram, so a logo is a nicety, never a dependency.
  const [brands, setBrands] = useState<InstitutionBrandMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Two calls rather than one: the logo endpoint keys its week-long cache on
    // the set of institution ids the caller holds, so it needs the ids, and the
    // account rollup this page renders carries only institution names. Without
    // the id set a newly linked bank would sit on a cached miss and show a
    // monogram for a week.
    fetchPlaidItems()
      .then((items) => fetchInstitutionLogos(items.map((it) => it.institution_id)))
      .then((m) => {
        if (!cancelled) setBrands(m);
      })
      .catch(() => {
        /* a logo is a nicety: the resolver falls through to bundled art, then a monogram */
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
  // haven't landed), spending and budgets have nothing real to show, so swap
  // them for an honest connect nudge.
  //
  // Gated on the server's `hasTransactions`, not on source === "live", which is
  // now true for a member who only has balances (api/finances.ts gates per
  // section). Everything behind this flag is now the member's own: the
  // Subscriptions panel that used to sit under it was built entirely from seeded
  // rows, and since the gate only opens for members with a REAL feed, the people
  // shown invented subscriptions were exactly the linked ones. The panel is
  // gone. The "Your plans" card does not sit behind the flag either: real plans
  // exist whether or not a transaction feed does, so it reads them directly and
  // shows its own empty state.
  const hasTxns = hasTransactions && (transactions.length > 0 || spending.length > 0);
  return (
    <div className="frame">
      <div className="greet">
        <h1>Good morning, {first}</h1>
        <div className="meta">
          <span>{today}</span>
          <span>·</span>
          {netWorth.changeAbs > 0
            ? <span className="up">Net worth up {money(netWorth.changeAbs)} this month</span>
            : <span>Here's your financial picture</span>}
        </div>
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

      <div className="score-strip" style={{ marginBottom: 16 }}>
        <MiniRing score={score.value} />
        <div>
          <div className="st-t">Juniper Score <span className="band">{score.value} · {score.band}</span></div>
          <div className="st-s">
            {score.delta !== 0
              ? <><b>{score.delta >= 0 ? "+" : ""}{score.delta} pts</b> this month · biggest lever: {score.lever}</>
              : <>Your starting score · biggest lever: {score.lever}</>}
          </div>
        </div>
        <Link href="/app/score" className="link" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>See breakdown →</Link>
      </div>

      <div className="grid hero" style={{ marginBottom: 16 }}>
        <NetWorthCard netWorth={netWorth} cashflow={cashflow} />
        <YourPlansCard />
      </div>

      {hasTxns && (
        <div className="grid two" style={{ marginBottom: 16 }}>
          <div className="card">
            {/* No month picker. /api/finances rolls up the CURRENT month and
               nothing else, so the three pills that used to sit here (June,
               July, Aug, with July lit whatever the date) were inert and
               mislabeled at once. The month is stated instead. */}
            <div className="card-head"><h3>Where it went: {money(totalSpent)}</h3><span className="head-note">{cashflow.month}</span></div>
            <SpendingDonut data={spending} />
          </div>
          <div className="card">
            {/* No Edit control. /api/budgets already does full CRUD on the
               member's limits, but no client code calls it, and a button that
               opens nothing is worse than no button. Wiring that endpoint up is
               a feature for a later stage, not part of this cleanup. */}
            <div className="card-head"><h3>Budgets</h3></div>
            <Budgets items={budgets} />
          </div>
        </div>
      )}

      {/* Last block on the page now that Subscriptions is gone, so no trailing
         margin: `.frame` already carries the bottom gutter. */}
      <div className="grid two">
        {hasTxns ? <TransactionsPanel items={transactions} /> : <ConnectNudge />}
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
      </div>
    </div>
  );
}
