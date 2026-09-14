import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { UserProfile } from "@/lib/profile";
import { fetchConnectionNames, pollCashflowEstimate } from "@/lib/plaid";
import { usePaycheckForm } from "@/lib/use-paycheck-form";
import { PaycheckFormFields } from "@/components/juniper/paycheck-form-fields";
import type { PaycheckFields } from "@/lib/paycheck-fields";

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
//
// A member who already filled this in during onboarding's paycheck step never
// sees this nudge at all: `alreadyHasData` below gates on the same
// monthlyIncome/monthlyExpenses fields that step writes, so this is purely the
// catch for anyone who skipped it there. See first-run-onboarding.tsx.
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
  const form = usePaycheckForm();

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

  const save = () => {
    if (form.income == null) return dismiss();
    onSave(form.fields());
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

      <PaycheckFormFields form={form} autoFocusIncome />

      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={save} disabled={form.income == null}>
          Save
        </button>
      </div>
    </div>
  );
}
