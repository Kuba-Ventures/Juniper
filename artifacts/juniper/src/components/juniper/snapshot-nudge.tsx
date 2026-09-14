import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { UserProfile } from "@/lib/profile";
import { fetchConnectionNames, pollCashflowEstimate } from "@/lib/plaid";

function dismissKey(email: string): string {
  return `juniper_nudge_snapshot_dismissed_${email}`;
}
function isDismissed(email: string): boolean {
  try {
    return localStorage.getItem(dismissKey(email)) === "1";
  } catch {
    return false;
  }
}
function markDismissed(email: string): void {
  try {
    localStorage.setItem(dismissKey(email), "1");
  } catch {
    /* ignore */
  }
}

const fmtMoney = (n: number) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

function MoneyField({
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
function CatRow({
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

type CatKey =
  | "deduction401k"
  | "deductionHealthInsurance"
  | "deductionHsaFsa"
  | "expenseRent"
  | "expenseLoanPayments"
  | "expenseOtherEssentials";

const BEFORE_CATS: { key: CatKey; label: string }[] = [
  { key: "deduction401k", label: "401(k) / retirement" },
  { key: "deductionHealthInsurance", label: "Health / dental insurance" },
  { key: "deductionHsaFsa", label: "HSA / FSA" },
];

// Colors reuse the app's own chart palette (--jnpr-c1..c7, category-color.ts)
// so this reads as native rather than inventing a second palette.
const AFTER_CATS: { key: CatKey; label: string; color: string }[] = [
  { key: "expenseRent", label: "Rent / mortgage", color: "var(--jnpr-c3)" },
  { key: "expenseLoanPayments", label: "Loan payments", color: "var(--jnpr-c4)" },
  { key: "expenseOtherEssentials", label: "Other essentials", color: "var(--jnpr-c2)" },
];

export type PaycheckFields = Pick<
  UserProfile,
  | "monthlyIncome"
  | "monthlyExpenses"
  | "deduction401k"
  | "deductionHealthInsurance"
  | "deductionHsaFsa"
  | "expenseRent"
  | "expenseLoanPayments"
  | "expenseOtherEssentials"
>;

// Moved off the onboarding wizard onto the dashboard (issue #267). The old
// step asked EVERY member for a rough income and spending figure, even one
// who had just linked a real bank with real transactions Juniper could read
// directly -- and while it waited to find out, it said "Estimating from your
// connected accounts..." for a few seconds even when there was nothing
// connected to estimate from, which is exactly the kind of false activity the
// app is otherwise careful never to show (see the six-hour staleness gate,
// PRODUCT_NOT_READY, the "still arriving" copy elsewhere).
//
// This checks for a live estimate FIRST, silently, with nothing rendered while
// it does. Found one: it saves automatically and this nudge never appears at
// all, because the member should not be asked for a number Juniper can already
// read. Nothing to find (not linked, or linked but not synced far enough yet):
// the card appears once, asking by hand, and either saving or dismissing it
// retires it for good.
//
// Reworked for issue #402: take-home pay stays the one required field (and the
// one Plaid's cashflow estimate can fill in above), but the flat "essential
// expenses" number is now itemized into what comes out BEFORE a paycheck lands
// (401(k), health insurance, HSA/FSA, informational only, never read by the
// Score) and what comes out AFTER it lands (rent, loan payments, other
// essentials, which the client sums into monthlyExpenses so the Score keeps
// reading exactly what it always has). See migration 0068.
export function SnapshotNudge({
  email,
  profile,
  onSave,
}: {
  email: string;
  profile: UserProfile | null;
  onSave: (fields: PaycheckFields) => void;
}) {
  const alreadyHasData = profile?.monthlyIncome != null || profile?.monthlyExpenses != null;
  const [dismissed, setDismissed] = useState(() => isDismissed(email));
  const [checking, setChecking] = useState(!alreadyHasData);
  const [autoFilled, setAutoFilled] = useState(false);
  const [income, setIncome] = useState<number | undefined>();
  const [on, setOn] = useState<Record<CatKey, boolean>>({
    deduction401k: false,
    deductionHealthInsurance: false,
    deductionHsaFsa: false,
    expenseRent: false,
    expenseLoanPayments: false,
    expenseOtherEssentials: false,
  });
  const [amounts, setAmounts] = useState<Partial<Record<CatKey, number>>>({});

  useEffect(() => {
    if (alreadyHasData) return;
    let live = true;
    void (async () => {
      const names = await fetchConnectionNames().catch(() => []);
      if (!live) return;
      if (names.length === 0) {
        setChecking(false);
        return;
      }
      const est = await pollCashflowEstimate();
      if (!live) return;
      if (est && (est.income > 0 || est.spent > 0)) {
        onSave({ monthlyIncome: est.income || undefined, monthlyExpenses: est.spent || undefined });
        setAutoFilled(true);
      }
      setChecking(false);
    })();
    return () => {
      live = false;
    };
    // Runs once on mount; a later profile edit must not re-trigger a re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed || alreadyHasData || checking || autoFilled) return null;

  const dismiss = () => {
    markDismissed(email);
    setDismissed(true);
  };

  const toggle = (key: CatKey) => setOn((o) => ({ ...o, [key]: !o[key] }));
  const setAmount = (key: CatKey, v: number | undefined) => setAmounts((a) => ({ ...a, [key]: v }));
  // Unchecking a category clears its value, so a stray typed number cannot
  // ride along into the save unnoticed.
  const val = (key: CatKey): number | undefined => (on[key] ? amounts[key] : undefined);

  const rent = val("expenseRent") ?? 0;
  const loans = val("expenseLoanPayments") ?? 0;
  const other = val("expenseOtherEssentials") ?? 0;
  const spent = rent + loans + other;
  const take = income ?? 0;
  const leftover = Math.max(0, take - spent);
  const barTotal = Math.max(take, spent, 1);

  const grossExtra = (val("deduction401k") ?? 0) + (val("deductionHealthInsurance") ?? 0) + (val("deductionHsaFsa") ?? 0);
  const showGross = grossExtra > 0 && income != null;

  const save = () => {
    if (income == null) return dismiss();
    onSave({
      monthlyIncome: income,
      // A blended total again, computed rather than typed, so the Score keeps
      // reading exactly the field it always has.
      monthlyExpenses: spent > 0 ? spent : undefined,
      deduction401k: val("deduction401k"),
      deductionHealthInsurance: val("deductionHealthInsurance"),
      deductionHsaFsa: val("deductionHsaFsa"),
      expenseRent: val("expenseRent"),
      expenseLoanPayments: val("expenseLoanPayments"),
      expenseOtherEssentials: val("expenseOtherEssentials"),
    });
    markDismissed(email);
    setDismissed(true);
  };

  return (
    <div className="card pad-lg dash-nudge" style={{ marginBottom: 16 }}>
      <button className="dash-nudge-x" onClick={dismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
      <h3 style={{ margin: "0 0 6px" }}>What happens to your paycheck?</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--jnpr-ink-2)" }}>
        Rough numbers are fine, you can refine them anytime, and take-home pay powers your Juniper Score.
      </p>

      <MoneyField
        label="Monthly take-home pay"
        hint="After taxes and deductions"
        value={income}
        chips={[4000, 7000, 12000]}
        onChange={setIncome}
        autoFocus
      />

      <p className="snap-divider">Before you're paid (optional)</p>
      {BEFORE_CATS.map((c) => (
        <CatRow
          key={c.key}
          label={c.label}
          checked={on[c.key]}
          amount={amounts[c.key]}
          onToggle={() => toggle(c.key)}
          onAmount={(v) => setAmount(c.key, v)}
        />
      ))}
      {showGross && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--jnpr-ink-3)" }}>
          {"≈"} {fmtMoney(take + grossExtra)} estimated gross pay
        </p>
      )}

      <p className="snap-divider">After it lands (optional)</p>
      <div className="snap-bar">
        {AFTER_CATS.map((c) => {
          const v = val(c.key) ?? 0;
          if (v <= 0) return null;
          return <div key={c.key} className="snap-seg" style={{ background: c.color, flex: `${v / barTotal} 0 0` }} />;
        })}
        <div className="snap-seg" style={{ background: "var(--jnpr-c7)", flex: `${leftover / barTotal} 0 0` }} />
      </div>
      <div className="snap-legend">
        {AFTER_CATS.map((c) => (
          <CatRow
            key={c.key}
            label={c.label}
            checked={on[c.key]}
            amount={amounts[c.key]}
            onToggle={() => toggle(c.key)}
            onAmount={(v) => setAmount(c.key, v)}
            swatch={c.color}
          />
        ))}
        <div className="snap-item">
          <span className="sw" style={{ background: "var(--jnpr-c7)" }} />
          <span style={{ flex: 1, fontSize: 13, color: "var(--jnpr-ink)", fontWeight: 600 }}>Left over</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--jnpr-ink)" }}>{fmtMoney(leftover)}</span>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={save} disabled={income == null}>
          Save
        </button>
      </div>
    </div>
  );
}
