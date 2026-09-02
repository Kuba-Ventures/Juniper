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
//
// SORT, GROUP AND SELECT (#260). The table can be ordered by amount, merchant or
// category as well as date, grouped by category with a total per group, and
// several rows can be given one category in a single write.
//
// Sorting happens here, over the rows in hand, and not on the server. That is a
// deliberate choice, not a shortcut: category order is the taxonomy's order,
// the one the donut and legend use, and a row's label resolves through its id
// (a renamed category is one bucket, not two), and neither of those is a thing
// PostgREST can ORDER BY. The honest cost is that an order over a hundred loaded
// rows is not an order over the range, so choosing a sort or grouping fills the
// range in, page by page, up to FILL_CAP rows, and the footer says when what is
// on screen is less than the range. The filter pills and the search box already
// act on loaded rows and say so; this follows the same rule.
//
// A group's total is NOT summed from the rows on screen. The first page carries
// the rollup for the whole range (per-category totals inside `breakdown` and
// `incomeBreakdown`), so the header states the figure the donut would, whether
// or not every row of it has loaded yet. Transfers have no per-category rollup
// and say what is loaded.
//
// A bulk change is a hand correction, made several times at once. Every row it
// touches is stored as `user`, so a merchant rule never overrules it, exactly as
// if each had been corrected on its own. After one, the same rule offer the
// single-row picker makes is made once, in the bar, when every changed row names
// the same merchant. Mixed merchants get no offer, because a rule is about one.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "@/components/juniper/app-frame";
import { MerchantMark } from "@/components/juniper/merchant-mark";
import { PieView, BarsView, TreemapView, TrendView, FlowView, CHART_KINDS, type ChartKind } from "@/components/juniper/spend-charts";
import { SubscriptionsPanel } from "@/components/juniper/subscriptions-panel";
import { BudgetsPanel } from "@/components/juniper/budgets-panel";
import { CategoryPicker } from "@/components/juniper/category-picker";
import { createMerchantRule, fetchMerchantRules } from "@/lib/merchant-rules";
import { RulesModal } from "@/components/juniper/rules-modal";
import { colorOf, paint } from "@/lib/category-color";
import { fmtDay, money0, money2 } from "@/lib/txn-format";
import {
  fetchTransactions, setTransactionCategory, setTransactionsCategory,
  RANGES, rangeFrom, rangeIsClipped, type RangeKey, type TxnPage, type TxnRow, type BreakdownRow, type TxnSummary,
} from "@/lib/transactions";
import { useFinances } from "@/lib/finances";

const PAGE_SIZE = 100;
// How far a sort or a grouping fills the range in before it stops and says so.
// Ten pages: enough that a quarter of ordinary activity is ordered in full, and
// a ceiling so "All time" on a busy account is not a hundred requests.
const FILL_CAP = 1000;
const RANGE_LABEL: Record<RangeKey, string> = {
  "1M": "Last month", "3M": "Last 3 months", "6M": "Last 6 months", "1Y": "Last year", All: "All time",
};

type Filter = "all" | "spend" | "income" | "transfer";
const FILTERS: { k: Filter; label: string }[] = [
  { k: "all", label: "All" }, { k: "spend", label: "Spending" },
  { k: "income", label: "Income" }, { k: "transfer", label: "Transfers" },
];

type SortKey = "date" | "amount" | "merchant" | "category";
type Dir = "desc" | "asc";
// Label and the two directions' meanings, said in the member's terms rather
// than as asc/desc: "largest first" is a thing a person wants, "amount desc" is
// a thing a database wants.
const SORTS: { k: SortKey; label: string; desc: string; asc: string }[] = [
  { k: "date", label: "Date", desc: "newest first", asc: "oldest first" },
  { k: "amount", label: "Amount", desc: "largest first", asc: "smallest first" },
  { k: "merchant", label: "Merchant", desc: "A to Z", asc: "Z to A" },
  { k: "category", label: "Category", desc: "as on the chart", asc: "reversed" },
];

// A row's merchant, for "select all from this merchant". Plaid's raw string
// when there is one, else the display label, so charges with no merchant name
// still group with their exact twins and never with anything else.
const merchantKeyOf = (t: TxnRow) => t.merchant ?? t.m;

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
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<Dir>("desc");
  const [grouped, setGrouped] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
  // Offered on the row a member has just corrected, and nowhere else: this is
  // the moment they are looking at the merchant they would otherwise correct
  // again next month. `applied` is how many existing charges the rule moved.
  const [offer, setOffer] = useState<{ id: string; merchant: string; category: string } | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleDone, setRuleDone] = useState<{ id: string; applied: number | null } | null>(null);
  const [ruleFailed, setRuleFailed] = useState<string | null>(null);
  // The selection, and the bulk write's own states. Held apart from the
  // single-row states above because they belong to the bar, not to a row: a
  // failed bulk write marks the bar and leaves every row as it was.
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [bulkAnchor, setBulkAnchor] = useState<HTMLElement | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkFailed, setBulkFailed] = useState(false);
  const [bulkOffer, setBulkOffer] = useState<{ merchant: string; category: string; n: number } | null>(null);
  const [bulkRuleDone, setBulkRuleDone] = useState<{ applied: number | null } | null>(null);
  // How many rules exist, so the entry point can be absent for a member who has
  // never made one. Read once on mount and after any change, not per render.
  const [ruleCount, setRuleCount] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const countRules = useCallback(() => { void fetchMerchantRules().then((r) => setRuleCount(r.length)); }, []);
  useEffect(countRules, [countRules]);
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
    // A selection is a set of rows, and the rows are about to change.
    setSel(new Set()); setBulkOffer(null); setBulkRuleDone(null); setBulkFailed(false);
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

  // Fill the range in while an order other than date, or a grouping, is asked
  // for: an order over the first hundred rows is not an order over the range.
  // One page at a time, and each completion re-runs this until the range is in
  // or the cap is reached. Nothing here is undone by going back to date order;
  // the rows stay loaded.
  const filling = (sort !== "date" || grouped) && !!cursor && rows.length < FILL_CAP;
  useEffect(() => {
    if (filling && !paging && !loading) void more();
    // `more` closes over cursor and paging, both of which are deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filling, paging, loading, cursor]);

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

  // Make a rule and bring everything with it. Shared by the row offer and the
  // bar offer, which differ only in where the answer is shown. The rule may
  // have moved charges elsewhere in the range, so the rollup and the rows both
  // have to catch up rather than only the ones on screen.
  const runRule = async (merchant: string, category: string) => {
    const r = await createMerchantRule(merchant, category);
    if (!r.ok) return { ok: false as const, error: r.error };
    const applied = typeof r.data.applied === "number" ? (r.data.applied as number) : null;
    countRules();
    await load(range);
    void refreshFinances();
    return { ok: true as const, applied };
  };

  const makeRule = async () => {
    if (!offer) return;
    setRuleBusy(true); setRuleFailed(null);
    const r = await runRule(offer.merchant, offer.category);
    setRuleBusy(false);
    if (!r.ok) { setRuleFailed(r.error); return; }
    setRuleDone({ id: offer.id, applied: r.applied });
    setOffer(null);
  };

  const makeBulkRule = async () => {
    if (!bulkOffer) return;
    setRuleBusy(true); setRuleFailed(null);
    const o = bulkOffer;
    const r = await runRule(o.merchant, o.category);
    setRuleBusy(false);
    if (!r.ok) { setRuleFailed(r.error); return; }
    // `load` cleared the bar's states; this one is set after it on purpose so
    // the answer outlives the reload it caused.
    setBulkRuleDone({ applied: r.applied });
    setBulkOffer(null);
  };

  const recategorize = async (row: TxnRow, category: string) => {
    if (category === row.c) { setEditing(null); return; }
    setSaving(row.id); setSaveFailed(null);
    const saved = await setTransactionCategory(row.id, category);
    if (!saved) { setSaveFailed(row.id); setSaving(null); return; }
    // `e` and `hue` as well as the labels. Without the icon the row showed its
    // NEW category name beside its OLD icon, so a charge moved to Coffee shops
    // sat there wearing a shopping bag until the next page load. Everything the
    // row paints itself from comes back on the response, so everything the
    // response carries is applied.
    setRows((rs) => rs.map((t) => (t.id === row.id
      ? { ...t, c: saved.c, g: saved.g, k: saved.k, e: saved.e, hue: saved.hue ?? null, userSet: true }
      : t)));
    setEditing(null); setSaving(null);
    // Only where Plaid actually named a merchant: a rule keys on that name, so
    // offering one for a charge that has none would be a button that cannot
    // work. `merchant` is Plaid's unmodified string, which is what the rule
    // matches on; `m` is the display label and can be the raw bank text.
    setRuleDone(null); setRuleFailed(null);
    setOffer(row.merchant ? { id: row.id, merchant: row.merchant, category: saved.c } : null);
    await refreshHead();
    void refreshFinances();
  };

  const breakdown: BreakdownRow[] = head?.breakdown ?? [];
  const summary: TxnSummary | null = head?.summary ?? null;
  const spent = summary?.spent ?? 0;

  // Where each category sits in the member's taxonomy, so a category sort and
  // the grouped view run in the same order as the donut and the legend rather
  // than alphabetically. Hidden categories still resolve, so they still have a
  // place: after the offered ones in their group.
  const catOrder = useMemo(() => {
    const m = new Map<string, number>();
    (head?.taxonomy ?? []).forEach((g, gi) => {
      g.cats.forEach((c, ci) => m.set(c.label, gi * 1000 + ci));
      (g.hidden ?? []).forEach((c, ci) => m.set(c.label, gi * 1000 + 500 + ci));
    });
    return m;
  }, [head?.taxonomy]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((t) => {
      if (filter !== "all" && t.k !== filter) return false;
      if (!needle) return true;
      return `${t.m} ${t.c} ${t.institution ?? ""} ${t.account ?? ""}`.toLowerCase().includes(needle);
    });
    // Date order is the server's order, (date desc, id desc), restated so a
    // tie inside another sort breaks the same way every time.
    const byDate = (a: TxnRow, b: TxnRow) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.id < b.id ? 1 : -1);
    const cmp: Record<SortKey, (a: TxnRow, b: TxnRow) => number> = {
      date: byDate,
      // By size, not by sign: "what were my biggest transactions" is asked of
      // money in and money out alike.
      amount: (a, b) => Math.abs(b.v) - Math.abs(a.v) || byDate(a, b),
      merchant: (a, b) => a.m.localeCompare(b.m) || byDate(a, b),
      category: (a, b) =>
        ((catOrder.get(a.c) ?? Number.MAX_SAFE_INTEGER) - (catOrder.get(b.c) ?? Number.MAX_SAFE_INTEGER))
        || a.c.localeCompare(b.c) || byDate(a, b),
    };
    const out = list.slice().sort(cmp[sort]);
    if (dir === "asc") out.reverse();
    return out;
  }, [rows, filter, q, sort, dir, catOrder]);

  // The grouped view: shown rows bucketed by category, groups in taxonomy order
  // whatever the row sort is, so the page reads top to bottom the way the legend
  // does. Rows inside a group keep the chosen order.
  const groups = useMemo(() => {
    if (!grouped) return null;
    const m = new Map<string, TxnRow[]>();
    for (const t of shown) { const g = m.get(t.c); if (g) g.push(t); else m.set(t.c, [t]); }
    return [...m.entries()].sort(
      (a, b) => ((catOrder.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (catOrder.get(b[0]) ?? Number.MAX_SAFE_INTEGER)) || a[0].localeCompare(b[0]),
    );
  }, [grouped, shown, catOrder]);

  // Each category's total and count over the WHOLE range, from the rollup, so
  // a group header answers the donut's question rather than summing whatever
  // happens to be loaded. Spend is stored positive there and shown negative
  // here, matching the rows under it.
  const rangeTotals = useMemo(() => {
    const m = new Map<string, { v: number; n: number }>();
    for (const g of breakdown) for (const c of g.categories) m.set(c.c, { v: -c.v, n: c.n });
    for (const c of head?.incomeBreakdown ?? []) m.set(c.c, { v: c.v, n: c.n });
    return m;
  }, [breakdown, head?.incomeBreakdown]);

  // How many loaded rows share each merchant, for "+2 more". Counted over the
  // rows that pass the filter and the search, so the press selects only rows
  // the member can see.
  const merchantCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of shown) { const k = merchantKeyOf(t); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [shown]);

  // The selection that counts is the part of it on screen. A row selected and
  // then filtered away is not changed by the bar, and is not counted by it.
  const selected = useMemo(() => shown.filter((t) => sel.has(t.id)), [shown, sel]);

  const toggle = (id: string, on: boolean) => {
    setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    setBulkOffer(null); setBulkRuleDone(null); setBulkFailed(false);
  };
  const selectMerchant = (key: string) => {
    setSel((s) => { const n = new Set(s); for (const t of shown) if (merchantKeyOf(t) === key) n.add(t.id); return n; });
    setBulkOffer(null); setBulkRuleDone(null); setBulkFailed(false);
  };
  const clearSel = () => { setSel(new Set()); setBulkAnchor(null); setBulkOffer(null); setBulkRuleDone(null); setBulkFailed(false); };

  // Escape clears the selection, when nothing else is open to claim it. The
  // picker and the modal handle their own.
  useEffect(() => {
    if (!selected.length || bulkAnchor || editing || rulesOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clearSel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.length, bulkAnchor, editing, rulesOpen]);

  const bulkRecategorize = async (category: string) => {
    const targets = selected;
    if (!targets.length) { setBulkAnchor(null); return; }
    setBulkSaving(true); setBulkFailed(false);
    const saved = await setTransactionsCategory(targets.map((t) => t.id), category);
    setBulkSaving(false);
    // Nothing moved, so nothing on screen moves. The bar says so; the rows keep
    // the categories they actually have.
    if (!saved) { setBulkFailed(true); setBulkAnchor(null); return; }
    const byId = new Map(saved.map((u) => [u.id, u]));
    setRows((rs) => rs.map((t) => {
      const u = byId.get(t.id);
      return u ? { ...t, c: u.c, g: u.g, k: u.k, e: u.e, hue: u.hue ?? null, userSet: true } : t;
    }));
    setBulkAnchor(null);
    setSel(new Set());
    // One offer for all of them, and only when they are all one merchant Plaid
    // actually named: a rule is about a merchant, and these rows have to agree
    // on which one before a rule about it is the right thing to offer.
    const changed = targets.filter((t) => byId.has(t.id));
    const merchants = new Set(changed.map((t) => t.merchant));
    const only = merchants.size === 1 ? [...merchants][0] : null;
    setRuleFailed(null); setBulkRuleDone(null);
    setBulkOffer(only && changed.length ? { merchant: only, category: byId.get(changed[0].id)!.c, n: changed.length } : null);
    await refreshHead();
    void refreshFinances();
  };

  const clipped = rangeIsClipped(range, head?.available?.from);
  const activeSort = SORTS.find((s) => s.k === sort)!;
  const ordered = sort !== "date" || grouped;
  const barShown = selected.length > 0 || !!bulkOffer || !!bulkRuleDone || bulkFailed;

  const row = (t: TxnRow) => {
    const isSel = sel.has(t.id);
    const twins = (merchantCounts.get(merchantKeyOf(t)) ?? 1) - 1;
    return (
      <tr key={t.id} className={isSel ? "sel" : undefined}>
        <td className="td-gut">
          <input
            type="checkbox" checked={isSel} aria-label={`Select ${t.m}`}
            onChange={(e) => toggle(t.id, e.target.checked)}
          />
        </td>
        <td className="td-d">{fmtDay(t.d)}{t.pending && <span className="td-pend">Pending</span>}</td>
        <td>
          <div className="td-m">
            <MerchantMark logo={t.logo} merchant={t.merchant} name={t.m} k={colorOf(t.g)} paint={paint(t.g, t.hue)} />
            <span className="td-mn">
              <span>
                {t.m}
                {/* Only where the same merchant is loaded elsewhere: one press
                    selects all of them, which is the common case behind a
                    correction (several rows of one shop, all wrong the same way). */}
                {twins > 0 && (
                  <button type="button" className="td-more" onClick={() => selectMerchant(merchantKeyOf(t))}
                    title={`Select all ${twins + 1} from ${t.m}`} aria-label={`Select all ${twins + 1} from ${t.m}`}>
                    +{twins} more
                  </button>
                )}
              </span>
              {(t.institution || t.account) && (
                <span className="td-msub">{[t.institution, t.mask ? `••${t.mask}` : t.account].filter(Boolean).join(" · ")}</span>
              )}
            </span>
          </div>
        </td>
        <td className="td-c cat-cell">
          {/* The tag already names the category, so it is the control that
              changes it: no second affordance on the row, and the target is
              where the eye already is. The picker needs the server's taxonomy,
              so with no first page in hand the tag stays a plain label. */}
          {head?.taxonomy?.length ? (
            <button
              type="button"
              className="ctag ctag-btn"
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
            <span className="ctag">
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
          {offer?.id === t.id && (
            <span className="cat-rule">
              <button type="button" className="cat-rule-go" disabled={ruleBusy} onClick={() => void makeRule()}>
                {ruleBusy ? "Applying…" : `Always use ${offer.category} for ${offer.merchant}`}
              </button>
              <button type="button" className="cat-rule-no" onClick={() => setOffer(null)} aria-label="No thanks">
                Not now
              </button>
            </span>
          )}
          {ruleDone?.id === t.id && (
            <span className="cat-rule done">
              {/* Zero reads with null: "0 charges moved" is true and sounds
                  like a failure, and what the member needs to know is the
                  same in both cases, that the rule is in place for next time. */}
              {!ruleDone.applied
                ? "Rule saved. It will apply as charges arrive."
                : ruleDone.applied === 1
                  ? "Rule saved, and 1 charge moved."
                  : `Rule saved, and ${ruleDone.applied} charges moved.`}
            </span>
          )}
          {ruleFailed && offer?.id === t.id && <span className="cat-err">{ruleFailed}</span>}
        </td>
        <td className={`td-a ta-r tnum${t.v > 0 ? " inc" : ""}`}>{t.v > 0 ? `+${money2(t.v)}` : money2(t.v)}</td>
      </tr>
    );
  };

  // A group's header. The total is the range's figure where the rollup has
  // one, and the count says how many of the range's charges are on screen, so
  // "6 of 9 charges" beside "-$412" is one true sentence rather than two
  // figures that disagree.
  const groupHead = (c: string, list: TxnRow[]) => {
    const t0 = list[0];
    const rt = rangeTotals.get(c);
    const loadedSum = list.reduce((a, t) => a + t.v, 0);
    const total = rt ? rt.v : loadedSum;
    const count = rt
      ? (rt.n === list.length ? `${rt.n} charge${rt.n === 1 ? "" : "s"}` : `${list.length} of ${rt.n} charges`)
      : `${list.length} loaded`;
    return (
      <tr key={`g:${c}`} className="tx-grp">
        <td colSpan={4}>
          <span className="ctag"><span className="cat-em" aria-hidden>{t0.e}</span>{c}</span>
          <span className="grp-n">{count}</span>
        </td>
        <td className={`ta-r tnum grp-t${total > 0 ? " inc" : ""}`}>{total > 0 ? `+${money0(total)}` : money0(total)}</td>
      </tr>
    );
  };

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

      {rulesOpen && (
        <RulesModal
          onClose={() => setRulesOpen(false)}
          onChanged={() => {
            countRules();
            // A removed rule stops applying to NEW charges and leaves the ones
            // it already set alone, so nothing on screen moves. The rollup is
            // re-read anyway rather than assumed: this is the one place a
            // member changes categorization without touching a row.
            void load(range);
            void refreshFinances();
          }}
        />
      )}

      {/* Between the chart and the table on purpose. A recurring charge is a
         conclusion drawn from the same rows the table lists, so it reads as a
         summary of them rather than as a separate feature. */}
      <SubscriptionsPanel />

      <div className="card">
        <div className="card-head">
          <h3>Transactions</h3>
          {/* Only when a rule exists: a member who has never made one gets no
              chrome for a feature they have not used. It is also the only place
              a rule can be seen or removed, so it cannot be hidden behind a
              hover or a menu. */}
          {ruleCount > 0 && (
            <button type="button" className="tx-rules" onClick={() => setRulesOpen(true)}>
              {ruleCount === 1 ? "1 rule" : `${ruleCount} rules`}
            </button>
          )}
          <div className="tx-tools">
            {/* One menu for the four orders and the group switch. Pressing the
                order already chosen flips it, and the button says which order
                and which way, so the table never has to be read to find out. */}
            <div className="tx-sort-wrap">
              <button type="button" className="tx-sort" aria-haspopup="menu" aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}>
                <span>Sort</span> {activeSort.label}{grouped ? ", grouped" : ""}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {menuOpen && (
                <>
                  <div className="pop-scrim" onClick={() => setMenuOpen(false)} />
                  <div className="pop tx-sort-menu" role="menu">
                    <div className="pop-lbl">Sort by</div>
                    {SORTS.map((s) => (
                      <button key={s.k} type="button" role="menuitemradio" aria-checked={sort === s.k}
                        className={`pop-i${sort === s.k ? " on" : ""}`}
                        onClick={() => {
                          if (sort === s.k) setDir((d) => (d === "desc" ? "asc" : "desc"));
                          else { setSort(s.k); setDir("desc"); }
                          setMenuOpen(false);
                        }}>
                        <span><b>{s.label}</b><small>{sort === s.k ? s[dir] : s.desc}</small></span>
                        {sort === s.k && <span className="ck" aria-hidden>✓</span>}
                      </button>
                    ))}
                    <div className="pop-sep" />
                    <button type="button" role="menuitemcheckbox" aria-checked={grouped}
                      className={`pop-i${grouped ? " on" : ""}`}
                      onClick={() => { setGrouped((g) => !g); setMenuOpen(false); }}>
                      <span><b>Group by category</b><small>a total for each</small></span>
                      {grouped && <span className="ck" aria-hidden>✓</span>}
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="search" style={{ maxWidth: 260 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input placeholder="Search loaded transactions" value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
          </div>
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
            <table className={`tx-table${selected.length ? " has-sel" : ""}`}>
              <thead><tr><th className="td-gut"><span className="sr-only">Select</span></th><th>Date</th><th>Merchant</th><th>Category</th><th className="ta-r">Amount</th></tr></thead>
              <tbody>
                {groups
                  ? groups.map(([c, list]) => [groupHead(c, list), ...list.map(row)])
                  : shown.map(row)}
              </tbody>
            </table>
          </div>
        )}

        {/* The count is stated because search and the filter pills act on the
           rows LOADED, not on the whole range. Saying "12 of 486" is the only
           way a member can tell that a search which found nothing may simply not
           have reached far enough back yet. The same goes for an order: while
           older rows are still out, the order covers what is in. */}
        <div className="tx-foot">
          <span>
            {shown.length === rows.length
              ? `${rows.length.toLocaleString()} shown`
              : `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} loaded`}
            {summary ? ` · ${summary.count.toLocaleString()} in ${RANGE_LABEL[range].toLowerCase()}` : ""}
            {ordered && cursor && (
              <span className="tx-foot-note">
                {paging && filling
                  ? "Loading the rest of the range so the order covers all of it…"
                  : `The order covers the ${rows.length.toLocaleString()} loaded, not the whole range. Load more to extend it.`}
              </span>
            )}
          </span>
          {cursor && <button className="btn ghost sm" onClick={() => void more()} disabled={paging}>{paging ? "Loading…" : "Load more"}</button>}
        </div>
      </div>

      {/* The selection bar. Portalled and fixed, like the picker, so it is in
         reach at the foot of the screen wherever the member is in the table.
         `display: contents` carries the `.jnpr` token scope without a box. */}
      {barShown && createPortal(
        <div className="jnpr" style={{ display: "contents" }}>
          <div className="tx-selbar" role="region" aria-label="Selected transactions">
            {selected.length > 0 && (
              <>
                <span>{selected.length === 1 ? "1 selected" : `${selected.length} selected`}</span>
                <button type="button" className="btn sm" disabled={bulkSaving || !head?.taxonomy?.length}
                  aria-haspopup="dialog" aria-expanded={!!bulkAnchor}
                  onClick={(e) => { const el = e.currentTarget; setBulkAnchor((cur) => (cur ? null : el)); setBulkFailed(false); }}>
                  {bulkSaving ? "Saving…" : "Change category"}
                </button>
                <button type="button" className="tx-selbar-x" onClick={clearSel}>Clear</button>
              </>
            )}
            {bulkFailed && <span className="cat-err">Did not save. Nothing was changed. Try again.</span>}
            {bulkOffer && (
              <span className="cat-rule">
                <button type="button" className="cat-rule-go" disabled={ruleBusy} onClick={() => void makeBulkRule()}>
                  {ruleBusy ? "Applying…" : `Always use ${bulkOffer.category} for ${bulkOffer.merchant}`}
                </button>
                <button type="button" className="cat-rule-no" onClick={() => setBulkOffer(null)} aria-label="No thanks">
                  Not now
                </button>
                {ruleFailed && <span className="cat-err">{ruleFailed}</span>}
              </span>
            )}
            {bulkRuleDone && (
              <span className="cat-rule done">
                {!bulkRuleDone.applied
                  ? "Rule saved. It will apply as charges arrive."
                  : bulkRuleDone.applied === 1
                    ? "Rule saved, and 1 more charge moved."
                    : `Rule saved, and ${bulkRuleDone.applied} more charges moved.`}
                <button type="button" className="cat-rule-no" onClick={() => setBulkRuleDone(null)} aria-label="Dismiss">OK</button>
              </span>
            )}
          </div>
          {bulkAnchor && head?.taxonomy && (
            <CategoryPicker
              anchor={bulkAnchor}
              taxonomy={head.taxonomy}
              busy={bulkSaving}
              onPick={(c) => void bulkRecategorize(c)}
              onClose={() => setBulkAnchor(null)}
              onTaxonomyChanged={refreshHead}
            />
          )}
        </div>,
        document.body,
      )}
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
