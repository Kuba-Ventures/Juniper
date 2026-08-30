// The rules a member has made, and the only place to remove one.
//
// Rules were created from a transaction row and then existed nowhere a member
// could see them, which is a rule quietly recategorizing charges with no way to
// find out why. This is the smallest surface that fixes that.
//
// Reached from a count beside the transactions search, shown only when a rule
// exists: a member with no rules gets no chrome for a feature they have not
// used.
import { useEffect, useState } from "react";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { fetchMerchantRules, deleteMerchantRule, type MerchantRule } from "@/lib/merchant-rules";

export function RulesModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rules, setRules] = useState<MerchantRule[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = () => { void fetchMerchantRules().then(setRules); };
  useEffect(load, []);

  const remove = async (merchant: string) => {
    setBusy(merchant); setFailed(null);
    const r = await deleteMerchantRule(merchant);
    setBusy(null);
    if (!r.ok) { setFailed(r.error); return; }
    load();
    onChanged();
  };

  return (
    <ModalBackdrop onClose={onClose} wide>
      <div className="modal-head">
        <h3>Rules</h3>
      </div>
      <p className="rules-note">
        A rule sets the category for everything from one merchant. A charge you
        categorized by hand keeps your choice: a rule never overrules it.
      </p>
      {rules === null && <div className="sc-empty sm">Reading your rules…</div>}
      {rules?.length === 0 && (
        <div className="sc-empty sm">
          No rules yet. Correct a charge and Juniper offers to make one.
        </div>
      )}
      {rules?.map((r) => (
        <div className="rules-row" key={r.merchant}>
          <div className="rules-t">
            <span className="rules-m">{r.merchant}</span>
            <span className="rules-c">always {r.category}</span>
          </div>
          <button type="button" className="btn ghost sm danger" disabled={busy === r.merchant}
            onClick={() => void remove(r.merchant)}>
            {busy === r.merchant ? "Removing…" : "Remove"}
          </button>
        </div>
      ))}
      {failed && <div className="rules-err">{failed}</div>}
      {!!rules?.length && (
        <p className="rules-foot">
          {/* Said plainly, because the alternative is a member removing a rule
              and wondering why last month's charges did not move back. Undoing
              them would mean restoring Plaid's original guess, and that is not
              kept: see docs/CUSTOM_CATEGORIES.md. */}
          Removing a rule stops it applying to new charges. Charges it already
          categorized keep the category it gave them.
        </p>
      )}
      <div className="rules-actions">
        <button type="button" className="btn ghost sm" onClick={onClose}>Close</button>
      </div>
    </ModalBackdrop>
  );
}
