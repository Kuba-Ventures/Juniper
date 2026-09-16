import { Fragment, useState } from "react";
import { BALANCE_KEY_FOR, BEFORE_CATS, AFTER_CATS, fmtMoney, type CatKey } from "@/lib/paycheck-fields";
import type { PaycheckFormState } from "@/lib/use-paycheck-form";

export function MoneyField({
  label,
  hint,
  value,
  chips,
  onChange,
  autoFocus,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  chips: number[];
  onChange: (v: number | undefined) => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const display = value != null ? Number(value).toLocaleString("en-US") : "";
  return (
    <div>
      <p style={{ margin: "0 0 4px", fontWeight: 650, fontSize: 13, color: "var(--jnpr-ink-2)" }}>{label}</p>
      {hint && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--jnpr-ink-3)" }}>{hint}</p>}
      <div className={`ob-money ${focused ? "on" : ""}`}>
        <span>$</span>
        <input
          inputMode="numeric"
          autoFocus={autoFocus}
          value={display}
          placeholder="0"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            onChange(digits === "" ? undefined : parseInt(digits, 10));
          }}
          style={{ width: `${Math.max(4, display.length + 1)}ch` }}
          aria-label={label}
        />
      </div>
      <div className="ob-chips">
        {chips.map((c) => (
          <button key={c} type="button" className={`ob-chip ${value === c ? "on" : ""}`} onClick={() => onChange(c)}>
            {fmtMoney(c)}
          </button>
        ))}
      </div>
    </div>
  );
}

// One itemized row: a checkbox that both labels and gates a small amount
// field, so "I don't have one of these" and "I have one but don't know the
// number" are both representable (unchecked vs. checked-but-blank).
export function CatRow({
  label,
  checked,
  amount,
  onToggle,
  onAmount,
  swatch,
}: {
  label: string;
  checked: boolean;
  amount: number | undefined;
  onToggle: () => void;
  onAmount: (v: number | undefined) => void;
  swatch?: string;
}) {
  const display = amount != null ? amount.toLocaleString("en-US") : "";
  return (
    <div className="snap-item">
      {swatch && <span className="sw" style={{ background: swatch }} />}
      <label className="snap-lab">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>{label}</span>
      </label>
      <div className="snap-amt">
        <span>$</span>
        <input
          inputMode="numeric"
          value={display}
          placeholder="0"
          disabled={!checked}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            onAmount(digits === "" ? undefined : parseInt(digits, 10));
          }}
          aria-label={label}
        />
      </div>
    </div>
  );
}

// A second, narrower row under a checked category's contribution amount:
// what is already built up, for the two categories that carry a balance
// (401(k), HSA/FSA). Shown only while the category is checked, the same way
// the amount field is only enabled then, so it never asks the question for
// a category the member does not have.
function BalanceRow({ amount, onAmount }: { amount: number | undefined; onAmount: (v: number | undefined) => void }) {
  const display = amount != null ? amount.toLocaleString("en-US") : "";
  return (
    <div className="snap-bal">
      <span>Current balance, if known</span>
      <div className="snap-amt">
        <span>$</span>
        <input
          inputMode="numeric"
          value={display}
          placeholder="0"
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            onAmount(digits === "" ? undefined : parseInt(digits, 10));
          }}
          aria-label="Current balance, if known"
        />
      </div>
    </div>
  );
}

function catRowFor(form: PaycheckFormState, c: { key: CatKey; label: string; color?: string }) {
  const balanceKey = BALANCE_KEY_FOR[c.key];
  return (
    <Fragment key={c.key}>
      <CatRow
        label={c.label}
        checked={form.on[c.key]}
        amount={form.amounts[c.key]}
        onToggle={() => form.toggle(c.key)}
        onAmount={(v) => form.setAmount(c.key, v)}
        swatch={c.color}
      />
      {balanceKey && form.on[c.key] && (
        <BalanceRow amount={form.balances[balanceKey]} onAmount={(v) => form.setBalance(balanceKey, v)} />
      )}
    </Fragment>
  );
}

// The full paycheck breakdown: take-home pay, what comes out before it lands
// (informational only, never read by the Score), and what comes out after
// (summed into monthlyExpenses). One definition of this form, so the
// dashboard nudge and the onboarding step render identically. See
// migration 0068 and lib/paycheck-fields.ts.
export function PaycheckFormFields({ form, autoFocusIncome }: { form: PaycheckFormState; autoFocusIncome?: boolean }) {
  return (
    <>
      <MoneyField
        label="Monthly take-home pay"
        hint="After taxes and deductions"
        value={form.income}
        chips={[4000, 7000, 12000]}
        onChange={form.setIncome}
        autoFocus={autoFocusIncome}
      />

      <p className="snap-divider">Before you're paid (optional)</p>
      {BEFORE_CATS.map((c) => catRowFor(form, c))}
      {form.showGross && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--jnpr-ink-3)" }}>
          {"≈"} {fmtMoney((form.income ?? 0) + form.grossExtra)} estimated gross pay
        </p>
      )}

      <p className="snap-divider">After it lands (optional)</p>
      <div className="snap-bar">
        {AFTER_CATS.map((c) => {
          const v = form.val(c.key) ?? 0;
          if (v <= 0) return null;
          return <div key={c.key} className="snap-seg" style={{ background: c.color, flex: `${v / form.barTotal} 0 0` }} />;
        })}
        <div className="snap-seg" style={{ background: "var(--jnpr-c7)", flex: `${form.leftover / form.barTotal} 0 0` }} />
      </div>
      <div className="snap-legend">
        {AFTER_CATS.map((c) => catRowFor(form, c))}
        <div className="snap-item">
          <span className="sw" style={{ background: "var(--jnpr-c7)" }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--jnpr-ink)", fontWeight: 600 }}>Left over</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--jnpr-ink)" }}>{fmtMoney(form.leftover)}</span>
        </div>
      </div>
    </>
  );
}
