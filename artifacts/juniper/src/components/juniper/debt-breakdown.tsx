// The "Your debts" builder for a Debt payoff plan. Suggests a row per linked
// credit card, student loan and mortgage (api/plaid/liabilities.ts), which the
// member can accept, edit, or ignore in favor of typing their own; manual
// entry is always the fallback, same "member's own answer wins" precedent the
// rest of this app follows (a bank-reported credit limit, a category Plaid
// guessed). Every field on an added row, principal, APR, payment and term, is
// a live input: nothing pulled from Plaid is read-only here, because a
// member's own figures always beat a snapshot that may already be stale.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { money } from "@/lib/mock-data";
import { fetchLiabilitySuggestions, type LiabilitySuggestion } from "@/lib/plaid";
import { parseNum } from "@/components/juniper/plan-create-form";
import type { DebtItem } from "@/lib/plans";

const TYPE_LABEL: Record<LiabilitySuggestion["liability_type"], string> = {
  credit: "Credit card",
  student: "Student loan",
  mortgage: "Mortgage",
};

function initials(institution: string | null): string {
  const words = (institution ?? "").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?") + (words[1]?.[0] ?? words[0]?.[1] ?? "");
}

export function DebtBreakdown({ debts, onChange }: { debts: DebtItem[]; onChange: (debts: DebtItem[]) => void }) {
  // null while loading, [] once answered (nothing linked, or liabilities is
  // unavailable, e.g. no consent yet): both render the same way, silently,
  // since a suggestion list is a nicety and manual entry has to work either
  // way. No error state: a failed fetch is indistinguishable from "nothing to
  // suggest" from here on out.
  const [suggestions, setSuggestions] = useState<LiabilitySuggestion[] | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchLiabilitySuggestions().then((rows) => { if (!cancelled) setSuggestions(rows); });
    return () => { cancelled = true; };
  }, []);

  const suggestedName = (s: LiabilitySuggestion) =>
    s.institution_name ? `${s.institution_name} ${TYPE_LABEL[s.liability_type]}` : s.name;

  const addSuggestion = (s: LiabilitySuggestion) => {
    onChange([...debts, { name: suggestedName(s), balance: s.balance ?? 0, apr: s.apr ?? 0, payment: s.monthly_payment, term: s.term }]);
    setAddedIds((prev) => new Set(prev).add(s.account_id));
  };
  const addManual = () => onChange([...debts, { name: "", balance: 0, apr: 0, payment: null, term: null }]);
  const removeRow = (i: number) => onChange(debts.filter((_, idx) => idx !== i));
  const setField = (i: number, patch: Partial<DebtItem>) => onChange(debts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const total = debts.reduce((s, d) => s + (d.balance || 0), 0);
  const blended = total > 0 ? debts.reduce((s, d) => s + (d.balance || 0) * (d.apr || 0), 0) / total : 0;
  // Excludes anything already added THIS session (addedIds) and anything a
  // past session already turned into a debt row: reopening an existing
  // payoff plan's Edit form remounts this component with no memory of which
  // suggestion a debt row came from (a DebtItem carries no account_id), so a
  // name match is what stops the same Chase card being offered again forever.
  const existingNames = new Set(debts.map((d) => d.name));
  const pending = (suggestions ?? []).filter((s) => !addedIds.has(s.account_id) && !existingNames.has(suggestedName(s)));

  return (
    <div className="field debt-bd">
      <label>Your debts</label>

      {pending.length > 0 && (
        <div className="debt-sugg-list">
          {pending.map((s) => (
            <div className="debt-sugg-row" key={s.account_id}>
              <div className="debt-sugg-ic">{initials(s.institution_name).toUpperCase()}</div>
              <div className="debt-sugg-body">
                <div className="debt-sugg-name">{s.institution_name ?? s.name}{s.mask ? ` •••• ${s.mask}` : ""}</div>
                <div className="debt-sugg-sub">{TYPE_LABEL[s.liability_type]}</div>
              </div>
              <div className="debt-sugg-nums">
                {s.balance != null && <><b>{money(s.balance)}</b><br /></>}
                {s.apr != null ? `${s.apr}% APR` : "Rate not reported"}
              </div>
              <button type="button" className="btn sm" onClick={() => addSuggestion(s)}>+ Add</button>
            </div>
          ))}
        </div>
      )}

      {debts.length === 0 ? (
        <div className="debt-empty">No debts added yet. Add a suggestion above, or enter one by hand.</div>
      ) : (
        debts.map((d, i) => (
          <div className="debt-row" key={i}>
            <div className="debt-row-top">
              <input
                value={d.name}
                placeholder="e.g. Visa"
                aria-label="Debt name"
                onChange={(e) => setField(i, { name: e.target.value })}
              />
              <button type="button" className="debt-x" aria-label="Remove debt" onClick={() => removeRow(i)}><X size={15} /></button>
            </div>
            <div className="debt-row-grid">
              <div className="field">
                <label>Balance ($)</label>
                <input
                  inputMode="numeric"
                  value={d.balance ? Math.round(d.balance).toLocaleString("en-US") : ""}
                  placeholder="0"
                  aria-label="Balance"
                  onChange={(e) => setField(i, { balance: parseNum(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>APR (%)</label>
                <input
                  inputMode="decimal"
                  value={d.apr || ""}
                  placeholder="0"
                  aria-label="APR percent"
                  onChange={(e) => setField(i, { apr: parseNum(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>Payment ($/mo)</label>
                <input
                  inputMode="numeric"
                  value={d.payment ? Math.round(d.payment).toLocaleString("en-US") : ""}
                  placeholder="0"
                  aria-label="Monthly payment"
                  onChange={(e) => setField(i, { payment: e.target.value.trim() ? parseNum(e.target.value) : null })}
                />
              </div>
              <div className="field">
                <label>Term</label>
                <input
                  value={d.term ?? ""}
                  placeholder="30 year"
                  aria-label="Loan term"
                  onChange={(e) => setField(i, { term: e.target.value.trim() || null })}
                />
              </div>
            </div>
          </div>
        ))
      )}

      <button type="button" className="btn ghost sm debt-add" onClick={addManual}>+ Add a debt by hand</button>

      {debts.length > 0 && (
        <div className="debt-foot">
          <span>Total to pay off</span>
          <b>{money(total)} <span style={{ fontWeight: 600 }}>· {blended.toFixed(1)}% blended</span></b>
        </div>
      )}
    </div>
  );
}
