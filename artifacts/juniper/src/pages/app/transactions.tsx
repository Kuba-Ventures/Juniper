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
import { BrandTile, cssVar } from "@/components/juniper/primitives";
import { PieView, BarsView, TreemapView, TrendView, FlowView, CHART_KINDS, type ChartKind } from "@/components/juniper/spend-charts";
import { SubscriptionsPanel } from "@/components/juniper/subscriptions-panel";
import { colorOf } from "@/lib/category-color";
import { fmtDay, money0, money2, merchantMark, initial } from "@/lib/txn-format";
import {
  fetchTransactions,
import { colorOf } from "@/lib/category-color";
import { fmtDay, money0, money2 } from "@/lib/txn-format";
import {
  fetchTransactions, merchantMark, initial,
  RANGES, rangeFrom, rangeIsClipped, type RangeKey, type TxnPage, type TxnRow, type BreakdownRow, type TxnSummary,
} from "@/lib/transactions";

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
  const [panel, setPanel] = useState<"categories" | "summary">("categories");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const [head, setHead] = useState<TxnPage | null>(null);   // the first page, which carries the rollup
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hi, setHi] = useState<number | null>(null);

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
      <PageHeader
        title="Transactions"
        sub="Every transaction your banks have shared, as far back as they go."
        actions={
          <div className="pills">
            {RANGES.map((r) => (
              <button key={r} className={r === range ? "on" : undefined} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
        }
      />

      {failed && <div className="card" style={{ marginBottom: 16 }}>Could not load your transactions just now. Refresh to try again.</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>{RANGE_LABEL[range]}</h3>
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
            {chart === "trend" ? (
              <TrendView trend={head?.trend ?? []} />
            ) : chart === "flow" ? (
              <FlowView rows={breakdown} total={spent} income={summary?.income ?? 0} incomeRows={head?.incomeBreakdown ?? []} />
            ) : (
              <div className="sc-row">
                <div className="sc-chart">
                  {chart === "pie" && <PieView rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                  {chart === "bars" && <BarsView rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                  {chart === "treemap" && <TreemapView rows={breakdown} total={spent} hi={hi} onHi={setHi} />}
                </div>
                <div className="sc-side">
                  <div className="pills sc-toggle">
                    <button className={panel === "categories" ? "on" : undefined} onClick={() => setPanel("categories")}>Categories</button>
                    <button className={panel === "summary" ? "on" : undefined} onClick={() => setPanel("summary")}>Summary</button>
                  </div>
                  {panel === "categories"
                    ? <Legend rows={breakdown} total={spent} hi={hi} onHi={setHi} />
                    : <Summary s={summary} range={range} clipped={clipped} />}
                </div>
              </div>
            )}
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
                        <BrandTile name={merchantMark(t.merchant, t.m)} letter={initial(t.m)} k={colorOf(t.g)} />
                        <span className="td-mn">
                          {t.m}
                          {(t.institution || t.account) && (
                            <span className="td-msub">{[t.institution, t.mask ? `••${t.mask}` : t.account].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="td-c"><span className="ctag" style={{ borderColor: cssVar(colorOf(t.g)) }}>{t.c}</span></td>
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
          <span className="sw" style={{ background: cssVar(colorOf(r.c)) }} />
          <span className="ln">{r.c}</span>
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
