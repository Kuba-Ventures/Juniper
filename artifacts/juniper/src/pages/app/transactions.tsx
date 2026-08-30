// /app/transactions, the member's full history.
//
// This is the first surface in the app that is not pinned to the current
// calendar month. It reads GET /api/transactions, which takes a date range and
// pages, and it is the reason that endpoint exists: /api/finances is a dashboard
// aggregate with no date parameter, so before it there was no honest way to draw
// anything older than the month you were standing in.
//
// The compact transactions card on the Overview STAYS. It answers "what happened
// lately" in three seconds without a page load, which is a different job from
// this one, and removing it would have made the dashboard worse to buy a nav
// entry that was already there.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/juniper/app-frame";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import { PieView, BarsView, TreemapView, TrendView, FlowView, CHART_KINDS, type ChartKind } from "@/components/juniper/spend-charts";
import { SubscriptionsPanel } from "@/components/juniper/subscriptions-panel";
import { BudgetsPanel } from "@/components/juniper/budgets-panel";
import { CategoryPicker } from "@/components/juniper/category-picker";
import { colorOf, paint } from "@/lib/category-color";
import { fmtDay, money0, money2 } from "@/lib/txn-format";
import {
  fetchTransactions, setTransactionCategory,
  RANGES, rangeFrom, rangeIsClipped, type RangeKey, type TxnPage, type TxnRow, type BreakdownRow, type TxnSummary,
} from "@/lib/transactions";
import { useFinances } from "@/lib/finances";

const PAGE_SIZE = 100;
const RANGE_LABEL: Record<RangeKey, string> = {
  "1M": "Last month", "3M": "Last 3 months", "6M": "Last 6 months", "1Y": "Last year", All: "All time",
};

type Filter = "all" | "spend" | "income" | "transfer";
const FILTERS: { k: Filter; label: string }[] = [
  { k: "all", label: "All" }, { k: "spend", label: "Spending" },
  { k: "income", label: "Income" }, { k: "transfer", label: "Transfers" },
];

export default function Transactions() {
  // Three months rather than one. One month makes the trend view a single bar,
  // and "is this normal for me" is the question this tab exists to answer;
  // all-time is a slower first paint for a question most visits are not asking.
  const [range, setRange] = useState<RangeKey>("3M");
  const [chart, setChart] = useState<ChartKind>("pie");
  // Budgets opens directly when the Overview's empty state sent them here to set
  // one, so that nudge lands on the control it advertised rather than on a page
  // where the member has to find it.
  const [panel, setPanel] = useState<"categories" | "summary" | "budgets">(
    () => (new URLSearchParams(window.location.search).get("panel") === "budgets" ? "budgets" : "categories"),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const [head, setHead] = useState<TxnPage | null>(null);   // the first page, which carries the rollup
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hi, setHi] = useState<number | null>(null);
  // Re-categorization: which row's picker is open, which row is mid-write, and
  // which row's write just failed. Keyed by row id rather than held as one flag,
  // so a failure marks the row it belongs to.
  // Holds the anchor element as well as the id: the picker portals to <body>
  // (the table wrapper clips it otherwise) and takes its position from the tag
  // that opened it.
  const [editing, setEditing] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  // The Budgets panel and the Overview both read /api/finances, and moving a
  // charge between groups changes this month's spend, so the rollup that owns
  // that figure is asked to catch up rather than left to disagree.
  const { refresh: refreshFinances } = useFinances();

  // Guards a late response from an abandoned range: switching 1M -> All -> 1M
  // quickly can land the All payload last and leave the view showing a year
  // under a lit "1M". Compared by identity, not by range name, so a repeat of
  // the same range still invalidates the older request.
  const req = useRef(0);

  const load = useCallback(async (key: RangeKey) => {
    const mine = ++req.current;
    setLoading(true); setFailed(false); setHi(null);
    const page = await fetchTransactions({ from: rangeFrom(key), limit: PAGE_SIZE });
    if (mine !== req.current) return;
    if (!page) { setFailed(true); setLoading(false); return; }
    setHead(page); setRows(page.transactions); setCursor(page.nextCursor); setLoading(false);
  }, []);

  useEffect(() => { void load(range); }, [range, load]);

  const more = async () => {
    if (!cursor || paging) return;
    const mine = req.current;
    setPaging(true);
    const page = await fetchTransactions({ from: rangeFrom(range), cursor, limit: PAGE_SIZE });
    if (mine !== req.current) return;   // range changed while this was in flight
    if (page) { setRows((r) => [...r, ...page.transactions]); setCursor(page.nextCursor); }
    setPaging(false);
  };

  // Save, then bring the figures with it. The row is updated from what the
  // server stored rather than from what was clicked, and the rollup (donut,
  // legend, summary) is re-read, because it is computed from a walk over the
  // whole range and cannot be patched correctly here. That re-read asks for one
  // row: the rollup rides on any first page, so there is no need to re-download
  // the hundred rows already on screen, and `rows` is left alone so paging and
  // scroll position survive.
  // Re-reads the FIRST page, which is where the rollup and the category
  // taxonomy ride (see api/transactions.ts). One row is asked for, because the
  // hundred already on screen do not need re-downloading and `rows` is left
  // alone so paging and scroll position survive.
  const refreshHead = async () => {
    const mine = req.current;
    const fresh = await fetchTransactions({ from: rangeFrom(range), limit: 1 });
    if (fresh && mine === req.current) setHead((h) => (h ? { ...h, ...fresh, transactions: h.transactions } : fresh));
  };

  const recategorize = async (row: TxnRow, category: string) => {
    if (category === row.c) { setEditing(null); return; }
    setSaving(row.id); setSaveFailed(null);
    const saved = await setTransactionCategory(row.id, category);
    if (!saved) { setSaveFailed(row.id); setSaving(null); return; }
    setRows((rs) => rs.map((t) => (t.id === row.id ? { ...t, c: saved.c, g: saved.g, k: saved.k, userSet: true } : t)));
    setEditing(null); setSaving(null);
    await refreshHead();
    void refreshFinances();
  };

  const breakdown: BreakdownRow[] = head?.breakdown ?? [];
  const summary: TxnSummary | null = head?.summary ?? null;
  const spent = summary?.spent ?? 0;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      if (filter !== "all" && t.k !== filter) return false;
      if (!needle) return true;
      return `${t.m} ${t.c} ${t.institution ?? ""} ${t.account ?? ""}`.toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  const clipped = rangeIsClipped(range, head?.available?.from);

  return (
    <div className="frame">
      {/* No range pills up here. They used to sit in the page header, a long way
         from the figure they change, so the connection between pressing "1Y"
         and the donut redrawing had to be inferred. They now sit beside the
         range label itself. */}
      <PageHeader
        title="Transactions"
        sub="Every transaction your banks have shared, as far back as they go."
      />

      {failed && <div className="card" style={{ marginBottom: 16 }}>Could not load your transactions just now. Refresh to try again.</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        {/* Both control groups hang off the left edge, under the label they act
           on, rather than one being pushed to the far right of a wide card.
           Reading order matches cause and effect: which range, then which view
           of it, then the view. */}
        <div className="tx-head">
          <div className="tx-head-row">
            <h3>{RANGE_LABEL[range]}</h3>
            <div className="pills">
              {RANGES.map((r) => (
                <button key={r} className={r === range ? "on" : undefined} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div className="sc-switch">
            {CHART_KINDS.map((c) => (
              <button key={c.k} className={c.k === chart ? "on" : undefined} title={c.hint}
                onClick={() => setChart(c.k)}>{c.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="sc-empty">Reading your history…</div>
        ) : !breakdown.length && !summary?.count ? (
          <div className="sc-empty">No transactions in this range.</div>
        ) : (
          <>
            {/* Trend and flow are whole-width views: one is a time axis and the
               other is a two-sided diagram, and squeezing either next to a
               legend makes both unreadable. The three category views keep the
               side panel, which is where the legend/summary toggle lives. */}
            <div className={`sc-row${chart === "trend" || chart === "flow" ? " wide" : ""}`}>
              <div className="sc-chart">
                {chart === "pie" && <PieView rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                {chart === "bars" && <BarsView rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                {chart === "treemap" && <TreemapView rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                {chart === "trend" && <TrendView trend={head?.trend ?? []} />}
                {chart === "flow" && <FlowView rows={breakdown} total={spent} income={summary?.income ?? 0} incomeRows={head?.incomeBreakdown ?? []} />}
              </div>
              <div className="sc-side">
                <div className="pills sc-toggle">
                  <button className={panel === "categories" ? "on" : undefined} onClick={() => setPanel("categories")}>Categories</button>
                  <button className={panel === "summary" ? "on" : undefined} onClick={() => setPanel("summary")}>Summary</button>
                  <button className={panel === "budgets" ? "on" : undefined} onClick={() => setPanel("budgets")}>Budgets</button>
                </div>
                {panel === "categories" && <Legend rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                {panel === "summary" && <Summary s={summary} range={range} clipped={clipped} />}
                {panel === "budgets" && <BudgetsPanel />}
              </div>
            </div>
            {head?.truncated && (
              <p className="sc-note">This range holds more transactions than Juniper totals in one pass, so the figures above cover the most recent 20,000.</p>
            )}
          </>
        )}
      </div>

      {/* Between the chart and the table on purpose. A recurring charge is a
         conclusion drawn from the same rows the table lists, so it reads as a
         summary of them rather than as a separate feature. */}
      <SubscriptionsPanel />

      <div className="card">
        <div className="card-head">
          <h3>Transactions</h3>
          <span className="search" style={{ maxWidth: 260 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input placeholder="Search loaded transactions" value={q} onChange={(e) => setQ(e.target.value)} />
          </span>
        </div>
        <div className="pills">
          {FILTERS.map((f) => (
            <button key={f.k} className={f.k === filter ? "on" : undefined} onClick={() => setFilter(f.k)}>{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="sc-empty">Reading your history…</div>
        ) : !shown.length ? (
          <div className="sc-empty">{rows.length ? "Nothing matches that filter." : "No transactions in this range."}</div>
        ) : (
          <div className="tx-tablewrap">
            <table className="tx-table">
              <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th className="ta-r">Amount</th></tr></thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id}>
                    <td className="td-d">{fmtDay(t.d)}{t.pending && <span className="td-pend">Pending</span>}</td>
                    <td>
                      <div className="td-m">
                        <MerchantMark logo={t.logo} merchant={t.merchant} name={t.m} k={colorOf(t.g)} paint={paint(t.g, t.hue)} />
                        <span className="td-mn">
                          {t.m}
                          {(t.institution || t.account) && (
                            <span className="td-msub">{[t.institution, t.mask ? `••${t.mask}` : t.account].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="td-c cat-cell">
                      {/* The tag already names the category, so it is the
                          control that changes it: no second affordance on the
                          row, and the target is where the eye already is. The
                          picker needs the server's taxonomy, so with no first
                          page in hand the tag stays a plain label. */}
                      {head?.taxonomy?.length ? (
                        <button
                          type="button"
                          className="ctag ctag-btn"
                          style={{ borderColor: paint(t.g, t.hue) }}
                          aria-haspopup="dialog"
                          aria-expanded={editing?.id === t.id}
                          title={t.userSet ? "You set this category" : "Change category"}
                          disabled={saving === t.id}
                          onClick={(e) => {
                            const el = e.currentTarget;
                            setEditing((cur) => (cur?.id === t.id ? null : { id: t.id, el }));
                            setSaveFailed(null);
                          }}
                        >
                          {saving === t.id ? "Saving…" : <><span className="cat-em" aria-hidden>{t.e}</span>{t.c}</>}
                          {t.userSet && saving !== t.id && <span className="ctag-dot" aria-hidden />}
                        </button>
                      ) : (
                        <span className="ctag" style={{ borderColor: paint(t.g, t.hue) }}>
                          <span className="cat-em" aria-hidden>{t.e}</span>{t.c}
                        </span>
                      )}
                      {editing?.id === t.id && head?.taxonomy && (
                        <CategoryPicker
                          anchor={editing.el}
                          taxonomy={head.taxonomy}
                          value={t.c}
                          busy={saving === t.id}
                          onPick={(c) => void recategorize(t, c)}
                          onClose={() => setEditing(null)}
                          onTaxonomyChanged={refreshHead}
                        />
                      )}
                      {saveFailed === t.id && <span className="cat-err">Did not save. Try again.</span>}
                    </td>
                    <td className={`td-a ta-r tnum${t.v > 0 ? " inc" : ""}`}>{t.v > 0 ? `+${money2(t.v)}` : money2(t.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The count is stated because search and the filter pills act on the
           rows LOADED, not on the whole range. Saying "12 of 486" is the only
           way a member can tell that a search which found nothing may simply not
           have reached far enough back yet. */}
        <div className="tx-foot">
          <span>
            {shown.length === rows.length
              ? `${rows.length.toLocaleString()} shown`
              : `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} loaded`}
            {summary ? ` · ${summary.count.toLocaleString()} in ${RANGE_LABEL[range].toLowerCase()}` : ""}
          </span>
          {cursor && <button className="btn ghost sm" onClick={() => void more()} disabled={paging}>{paging ? "Loading…" : "Load more"}</button>}
        </div>
      </div>
    </div>
  );
}

function Legend({ rows, total, hi, onHi }: { rows: BreakdownRow[]; total: number; hi: number | null; onHi: (i: number | null) => void }) {
  if (!rows.length) return <div className="sc-empty sm">No spending in this range.</div>;
  return (
    <div className="legend">
      {rows.map((r, i) => (
        <div className="lg" key={r.c} onPointerEnter={() => onHi(i)} onPointerLeave={() => onHi(null)}
          style={{ opacity: hi == null || hi === i ? 1 : 0.5 }}>
          {/* Swatch AND icon: the swatch is what ties this row to its wedge on
              the donut, so it cannot be replaced by an emoji here. */}
          <span className="sw" style={{ background: paint(r.c, r.hue) }} />
          <span className="ln"><span className="cat-em" aria-hidden>{r.e}</span>{r.c}</span>
          <span className="lv tnum">{money0(r.v)}</span>
          <span className="lp tnum">{total > 0 ? Math.round((r.v / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
}

function Summary({ s, range, clipped }: { s: TxnSummary | null; range: RangeKey; clipped: boolean }) {
  if (!s) return <div className="sc-empty sm">Nothing to summarize yet.</div>;
  // `days` is the span the transactions actually cover, which is not the same as
  // the span the member asked for. Stating it is what keeps the per-month figure
  // from implying a full month of history that may not exist.
  const months = s.days / 30;
  return (
    <div className="sumbox">
      <div className="sum-r"><span>Transactions</span><b className="tnum">{s.count.toLocaleString()}</b></div>
      <div className="sum-r"><span>Total spending</span><b className="tnum">{money0(s.spent)}</b></div>
      <div className="sum-r"><span>Money in</span><b className="tnum inc">+{money0(s.income)}</b></div>
      <div className="sum-r"><span>Kept</span><b className={`tnum${s.net >= 0 ? " inc" : ""}`}>{s.net >= 0 ? "+" : ""}{money0(s.net)}</b></div>
      <div className="sum-r"><span>Average charge</span><b className="tnum">{money0(s.average)}</b></div>
      {months >= 1.5 && <div className="sum-r"><span>Spending per month</span><b className="tnum">{money0(s.perMonth)}</b></div>}
      {s.largest && (
        <div className="sum-r"><span>Largest</span><b className="tnum" title={`${s.largest.m} · ${fmtDay(s.largest.d)}`}>{money0(-s.largest.v)}</b></div>
      )}
      <p className="sum-note">
        {s.days > 0 ? `Covers ${s.days} day${s.days === 1 ? "" : "s"} of history` : "No history in this range"}
        {clipped ? `, which is everything your banks have shared, not the full ${RANGE_LABEL[range].toLowerCase()}` : ""}
        . Transfers between your own accounts are excluded{s.transfers > 0 ? ` (${money0(s.transfers)} moved)` : ""}.
      </p>
    </div>
  );
}
