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
export function SnapshotNudge({
  email,
  profile,
  onSave,
}: {
  email: string;
  profile: UserProfile | null;
  onSave: (income: number | undefined, expenses: number | undefined) => void;
}) {
  const alreadyHasData = profile?.monthlyIncome != null || profile?.monthlyExpenses != null;
  const [dismissed, setDismissed] = useState(() => isDismissed(email));
  const [checking, setChecking] = useState(!alreadyHasData);
  const [autoFilled, setAutoFilled] = useState(false);
  const [income, setIncome] = useState<number | undefined>();
  const [expenses, setExpenses] = useState<number | undefined>();

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
        onSave(est.income || undefined, est.spent || undefined);
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

  const save = () => {
    if (income == null && expenses == null) return dismiss();
    onSave(income, expenses);
    markDismissed(email);
    setDismissed(true);
  };

  return (
    <div className="card pad-lg dash-nudge" style={{ marginBottom: 16 }}>
      <button className="dash-nudge-x" onClick={dismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
      <h3 style={{ margin: "0 0 6px" }}>Let&rsquo;s get a quick money snapshot.</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--jnpr-ink-2)" }}>
        Rough numbers are fine, you can refine them anytime, and they power your Juniper Score.
      </p>
      <div className="ob-fieldgroup">
        <MoneyField
          label="Monthly take-home pay"
          hint="After taxes and deductions"
          value={income}
          chips={[4000, 7000, 12000]}
          onChange={setIncome}
          autoFocus
        />
        <MoneyField
          label="Monthly essential expenses"
          hint="Rent, utilities, groceries, minimum payments"
          value={expenses}
          chips={[2500, 4000, 6000]}
          onChange={setExpenses}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={save} disabled={income == null && expenses == null}>
          Save
        </button>
      </div>
    </div>
  );
}
