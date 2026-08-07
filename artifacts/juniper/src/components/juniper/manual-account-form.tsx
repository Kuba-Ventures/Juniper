import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  MANUAL_CATEGORIES,
  saveManualAccount,
  type ManualAccount,
  type ManualCategory,
} from "@/lib/manual-accounts";

// The manual-entry form (account discovery, tier 3): add an account by hand for
// institutions Plaid can't link. Category implies asset vs liability (credit /
// loans are debts); the server derives `kind` from it. Balance is optional and
// user-maintained (not live).
export function ManualAccountForm({
  onSaved,
  onCancel,
}: {
  onSaved: (acct: ManualAccount) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [category, setCategory] = useState<ManualCategory>("banking");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the account a name.");
      return;
    }
    setError(null);
    setSaving(true);
    const digits = balance.replace(/[^\d.]/g, "");
    const acct = await saveManualAccount({
      name: trimmed,
      institution: institution.trim() || undefined,
      category,
      balance: digits === "" ? null : Number(digits),
    });
    setSaving(false);
    if (acct) onSaved(acct);
    else setError("Couldn't save that account. Please try again.");
  };

  return (
    <div className="man-form">
      <div className="man-row">
        <label className="man-field">
          <span>Account name</span>
          <input
            autoFocus
            value={name}
            placeholder="e.g. Carter Bank checking"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
        <label className="man-field">
          <span>Institution (optional)</span>
          <input
            value={institution}
            placeholder="e.g. Carter Bank & Trust"
            onChange={(e) => setInstitution(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
      </div>
      <div className="man-row">
        <label className="man-field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as ManualCategory)}>
            {MANUAL_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="man-field">
          <span>Balance (optional)</span>
          <div className="man-money">
            <span>$</span>
            <input
              inputMode="decimal"
              value={balance}
              placeholder="0"
              onChange={(e) => setBalance(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </label>
      </div>
      {error && <div className="form-error" style={{ margin: "2px 0 0" }}>{error}</div>}
      <div className="man-actions">
        <button className="btn ghost sm" onClick={onCancel} disabled={saving}>
          <X size={14} /> Cancel
        </button>
        <button className="btn sm" onClick={submit} disabled={saving}>
          <Check size={14} /> {saving ? "Saving…" : "Add account"}
        </button>
      </div>
    </div>
  );
}
