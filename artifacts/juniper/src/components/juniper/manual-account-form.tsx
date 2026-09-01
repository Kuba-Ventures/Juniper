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
//
// ── THE CREDIT-ONLY FIELDS (migration 0046) ────────────────────────────────
//
// Credit limit and mask appear only when the category is "Credit cards", and the
// gate is not tidiness. A limit on a checking account is meaningless: 0046 makes
// it unrepresentable with a CHECK and the write endpoint rejects it with a 400,
// so a field that could collect one would be a field that could only produce an
// error. Showing it and refusing it is worse than never offering it.
//
// The limit matters because some cards can NEVER arrive through Plaid. The case
// that forced this: a card issued to the member as an authorized user on another
// person's login, which no credential they hold will ever surface. Without its
// limit the Credit page's utilization denominator is short, so the percentage
// reads too HIGH (3 percent against 1.5 percent on the member's own credit
// report). It is counted in utilization, badged "You added this", and never
// reaches the Juniper Score, because a limit somebody typed is a claim.
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
  const [creditLimit, setCreditLimit] = useState("");
  const [mask, setMask] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCredit = category === "credit";

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the account a name.");
      return;
    }
    // Read the credit-only fields ONLY on a credit account, so a member who typed
    // a limit and then changed the category away does not get a 400 for a field
    // they can no longer see. The visible form is the whole of what is submitted.
    const limitDigits = isCredit ? creditLimit.replace(/[^\d.]/g, "") : "";
    const maskDigits = isCredit ? mask.replace(/\D/g, "") : "";
    if (limitDigits !== "" && !(Number(limitDigits) > 0)) {
      // Caught here as well as server-side, because zero is the one wrong value
      // somebody types on purpose and a round trip to be told so is a poor way to
      // find out. Zero would make the utilization division an infinity.
      setError("A credit limit has to be more than zero. Leave it blank if you don't know it.");
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
      // Null rather than omitted, so the field is explicitly cleared rather than
      // left to whatever a previous write put there.
      credit_limit: limitDigits === "" ? null : Number(limitDigits),
      mask: maskDigits === "" ? null : maskDigits.slice(-4),
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
      {/* CREDIT ONLY, see the note at the head of this file. Rendered after the
          balance row so the shape of the form does not change under the member's
          cursor while they are typing an earlier field. */}
      {isCredit && (
        <>
          <div className="man-row">
            <label className="man-field">
              <span>Credit limit (optional)</span>
              <div className="man-money">
                <span>$</span>
                <input
                  inputMode="numeric"
                  value={creditLimit}
                  placeholder="20,000"
                  onChange={(e) => setCreditLimit(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
            </label>
            <label className="man-field">
              <span>Last 4 digits (optional)</span>
              <input
                inputMode="numeric"
                value={mask}
                placeholder="4417"
                maxLength={4}
                onChange={(e) => setMask(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
          </div>
          {/* Says what the limit is FOR, because a member who skips it will see a
              card on the Credit page reading "Unknown" and no explanation, and
              says what it is not for, because the honest thing about a number
              Juniper cannot check is that it does not move the Score. */}
          <div className="man-hint">
            The limit lets Juniper work out your utilization across every card, including ones your
            bank cannot show it. It is your number, so it is labelled as yours wherever it appears,
            and it does not affect your Juniper Score.
          </div>
        </>
      )}
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
