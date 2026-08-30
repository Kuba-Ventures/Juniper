// The Budgets panel, third tab of the side rail on /app/transactions.
//
// WHY THIS PANEL IGNORES THE RANGE PILLS. A budget is a monthly limit, and this
// page defaults to three months. Measuring a 3M, 1Y, or all-time figure against
// a monthly limit produces a number that means nothing: every budget would read
// as wildly over the moment the member pressed 1Y. So the panel always reads the
// CURRENT month, from /api/finances (the one endpoint that defines a month's
// spend), and says which month that is in its own header. The pills keep acting
// on the chart and the legend beside it, which is what they claim to do.
//
// The vocabulary is the nine spending GROUPS, not leaf categories. That is what
// the donut, the legend, and the Overview card already speak, and /api/finances
// resolves a group-labelled budget against the whole group. Members cannot yet
// define categories of their own, so there is nothing else to offer here.
import { useState } from "react";
import { useFinances } from "@/lib/finances";
import { saveBudget, removeBudget } from "@/lib/budgets";
import { SPEND_GROUPS, paint } from "@/lib/category-color";
import { money0 } from "@/lib/txn-format";

interface Row {
  c: string;
  e: string;            // the group's icon, for this list
  hue: number | null;   // set only for a group the member created
  spent: number;        // this calendar month, not the page's range
  limit: number | null;
}

function LimitForm({ value, busy, onSave, onCancel }: {
  value: number | null;
  busy: boolean;
  onSave: (n: number) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const n = Number(v);
  const valid = v.trim() !== "" && Number.isFinite(n) && n > 0;
  return (
    <form
      className="bp-form"
      onSubmit={(e) => { e.preventDefault(); if (valid && !busy) onSave(Math.round(n)); }}
    >
      <span className="bp-cur">$</span>
      <input
        autoFocus inputMode="decimal" value={v} placeholder="0"
        aria-label="Monthly limit"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      />
      <button type="submit" className="btn sm" disabled={!valid || busy}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
    </form>
  );
}

export function BudgetsPanel() {
  const { data, refresh, source } = useFinances();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const spentOf = new Map(data.spending.map((s) => [s.c, s.v]));
  // Icons ride on the spending rollup, which only carries the groups with money
  // in them this month, so a group with nothing spent falls back to the budget's
  // own icon and then to nothing rather than borrowing another group's.
  const hueOf = new Map<string, number | null>([
    ...data.spending.map((s) => [s.c, s.hue ?? null] as [string, number | null]),
    ...data.budgets.map((b) => [b.c, b.hue ?? null] as [string, number | null]),
  ]);
  const emojiOf = new Map<string, string>([
    ...data.spending.map((s) => [s.c, s.e ?? ""] as [string, string]),
    ...data.budgets.map((b) => [b.c, b.e ?? ""] as [string, string]),
  ]);
  const limitOf = new Map(data.budgets.map((b) => [b.c, b.l]));

  // Fixed order, sorted once by this month's spend. It does NOT re-sort when a
  // limit is saved: a row jumping out from under the cursor in a 300px rail is
  // worse than a list that reads slightly out of priority.
  const rows: Row[] = SPEND_GROUPS
    .map((c) => ({ c, e: emojiOf.get(c) ?? "", hue: hueOf.get(c) ?? null, spent: spentOf.get(c) ?? 0, limit: limitOf.get(c) ?? null }))
    .sort((a, b) => b.spent - a.spent || a.c.localeCompare(b.c));

  const write = async (c: string, run: () => Promise<boolean>) => {
    setBusy(c); setFailed(null);
    const ok = await run();
    if (!ok) { setFailed(c); setBusy(null); return; }
    // /api/finances owns spent-against-limit, so the figures come back from
    // there rather than being guessed here.
    await refresh();
    setBusy(null); setEditing(null);
  };

  // A manual dashboard has no server-side budgets to write to: /api/budgets is
  // scoped to a session, and this member has not linked anything. Say so rather
  // than offering a control that will fail.
  if (source !== "live") {
    return <div className="sc-empty sm">Connect an account to set budgets.</div>;
  }

  return (
    <div className="bp">
      <p className="bp-note">
        A limit is monthly. Figures below are <b>{data.cashflow.month}</b> so far, whatever range the chart is showing.
      </p>
      {rows.map((r) => {
        const pct = r.limit ? Math.min(100, Math.round((r.spent / r.limit) * 100)) : 0;
        const over = r.limit != null && r.spent > r.limit;
        return (
          <div className="bp-row" key={r.c}>
            <div className="bp-top">
              <span className="sw" style={{ background: paint(r.c, r.hue) }} />
              <span className="ln"><span className="cat-em" aria-hidden>{r.e}</span>{r.c}</span>
              {editing !== r.c && (
                <button className="bp-set" onClick={() => { setEditing(r.c); setFailed(null); }}>
                  {r.limit != null ? money0(r.limit) : "Set"}
                </button>
              )}
            </div>

            {editing === r.c ? (
              <LimitForm
                value={r.limit}
                busy={busy === r.c}
                onSave={(n) => void write(r.c, () => saveBudget(r.c, n))}
                onCancel={() => { setEditing(null); setFailed(null); }}
              />
            ) : r.limit != null ? (
              <>
                <div className={`bud ${over ? "over" : "ok"} bp-bar`}>
                  <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                </div>
                <span className="bp-cap">
                  {money0(r.spent)} of {money0(r.limit)}
                  {over && <span className="flag"> · {money0(r.spent - r.limit)} over</span>}
                  <button className="bp-x" disabled={busy === r.c}
                    onClick={() => void write(r.c, () => removeBudget(r.c))}>
                    {busy === r.c ? "Removing…" : "Remove"}
                  </button>
                </span>
              </>
            ) : (
              <span className="bp-cap dim">
                {r.spent > 0 ? `${money0(r.spent)} spent, no limit` : "Nothing spent this month"}
              </span>
            )}

            {failed === r.c && <span className="bp-cap err">That did not save. Try again.</span>}
          </div>
        );
      })}
    </div>
  );
}
