// A "from your linked investment accounts" suggestion box for a Saving-shaped
// plan's monthly-contribution field, fed by api/plaid/investments.ts.
//
// Unlike DebtBreakdown, there is nothing to persist here: the field this
// suggests into is a single scalar the plan already has
// (goal.monthly_contribution), not a list that needs its own current_state
// key, so this component holds no state beyond which suggestions have been
// added this session (so a second click on the same row doesn't double
// count). It renders nothing at all when there is nothing to suggest, the
// same "available:false is not an error, it's just nothing to add" contract
// fetchInvestmentSuggestions documents: a Saving plan with no linked
// investment accounts, or one where nothing nets a positive contribution in
// the trailing window, shows no box rather than an empty one, since (unlike a
// payoff plan's debt list) the plain "Saving each month" field is already the
// primary control here.
import { useEffect, useState } from "react";
import { money } from "@/lib/mock-data";
import { fetchInvestmentSuggestions, type InvestmentSuggestion } from "@/lib/plaid";

function initials(institution: string | null): string {
  const words = (institution ?? "").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?") + (words[1]?.[0] ?? words[0]?.[1] ?? "");
}

export function InvestmentBreakdown({ onAdd }: { onAdd: (monthlyAmount: number) => void }) {
  // null while loading, [] once answered: both render nothing, since a
  // suggestion is a nicety and the plain field beneath it already works
  // either way. No error state, same reasoning as DebtBreakdown: a failed
  // fetch is indistinguishable from "nothing to suggest" from here on out.
  const [suggestions, setSuggestions] = useState<InvestmentSuggestion[] | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchInvestmentSuggestions().then((rows) => { if (!cancelled) setSuggestions(rows); });
    return () => { cancelled = true; };
  }, []);

  const pending = (suggestions ?? []).filter((s) => !addedIds.has(s.account_id));
  if (!pending.length) return null;

  const add = (s: InvestmentSuggestion) => {
    onAdd(s.monthly_contribution);
    setAddedIds((prev) => new Set(prev).add(s.account_id));
  };

  return (
    <div className="field debt-bd">
      <label>From your linked investment accounts</label>
      <div className="debt-sugg-list">
        {pending.map((s) => (
          <div className="debt-sugg-row" key={s.account_id}>
            <div className="debt-sugg-ic">{initials(s.institution_name).toUpperCase()}</div>
            <div className="debt-sugg-body">
              <div className="debt-sugg-name">{s.institution_name ?? s.name}{s.mask ? ` •••• ${s.mask}` : ""}</div>
              <div className="debt-sugg-sub">{s.account_type} · avg. last {Math.round(s.months_observed)} months</div>
            </div>
            <div className="debt-sugg-nums"><b>{money(s.monthly_contribution)}/mo</b><br />contributed</div>
            <button type="button" className="btn sm" onClick={() => add(s)}>+ Add</button>
          </div>
        ))}
      </div>
    </div>
  );
}
