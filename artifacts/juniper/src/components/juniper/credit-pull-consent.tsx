import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import { connectCredit, verifyCredit } from "@/lib/credit-score";

// Stage 10c/10d: the credit-pull consent block. DRAFT COPY -- the disclosure
// text below is Spinwheel's own required "written instructions" language
// (developer.spinwheel.io docs), not something Juniper wrote, but the
// surrounding design and the exact wording around it still need a lawyer's
// sign-off before a real member ever sees this. See docs/CREDIT_PROVIDER.md
// section 4 and PROJECT.md's 2026-09-07 Decisions log entry for why.
//
// Extracted out of first-run-onboarding.tsx (issue #390) so the Credit page
// can offer the exact same consent gesture to a member who skipped it at
// signup, rather than only ever telling them they skipped it. The checkbox
// stays unchecked by default everywhere this renders: Spinwheel's contract
// and the FTC "grant, not notification" test this design follows both
// require a real, affirmative, unchecked-by-default action, so the Credit
// page cannot pre-check this on the member's behalf just because they
// navigated here on purpose.
//
// phone/onPhoneChange stay controllable (onboarding lifts them to share one
// phone field with LayerDiscovery on the same screen) but default to
// internal state, the same optional-controlled-prop pattern LayerDiscovery
// itself already uses, so a standalone caller (the Credit page) needs no
// parent state at all.
export function CreditPullConsent({
  phone: phoneProp,
  onPhoneChange,
  consented: consentedProp,
  onConsentChange,
  dob: dobProp,
  onDobChange,
  onDone,
}: {
  phone?: string;
  onPhoneChange?: (v: string) => void;
  consented?: boolean;
  onConsentChange?: (v: boolean) => void;
  dob?: string;
  onDobChange?: (v: string) => void;
  onDone?: () => void;
} = {}) {
  const [phoneState, setPhoneState] = useState("");
  const [consentedState, setConsentedState] = useState(false);
  const [dobState, setDobState] = useState("");
  const phone = phoneProp ?? phoneState;
  const setPhone = onPhoneChange ?? setPhoneState;
  const consented = consentedProp ?? consentedState;
  const setConsented = onConsentChange ?? setConsentedState;
  const dob = dobProp ?? dobState;
  const setDob = onDobChange ?? setDobState;

  const [phase, setPhase] = useState<"form" | "code" | "done">("form");
  const [spinwheelUserId, setSpinwheelUserId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = useCallback(async () => {
    setError(null);
    setBusy(true);
    const r = await connectCredit(phone, dob);
    setBusy(false);
    if (r.ok) {
      setSpinwheelUserId(r.userId);
      setPhase("code");
    } else {
      setError(r.error);
    }
  }, [phone, dob]);

  const verify = useCallback(async () => {
    if (!spinwheelUserId) return;
    setError(null);
    setBusy(true);
    const r = await verifyCredit(spinwheelUserId, code);
    setBusy(false);
    if (r.ok) {
      setPhase("done");
      onDone?.();
    } else {
      setError(r.error);
    }
  }, [spinwheelUserId, code, onDone]);

  return (
    <div className="ob-credit-consent">
      <label className="ob-credit-row">
        <input
          type="checkbox"
          checked={consented}
          disabled={phase !== "form"}
          onChange={(e) => setConsented(e.target.checked)}
        />
        <span className="ob-credit-label">
          <b>Pull my credit history too.</b> By checking this, you're providing "written instructions" to
          Spinwheel Solutions, Inc. authorizing it to obtain your credit profile from Equifax on Juniper's
          behalf.{" "}
          <a href="https://spinwheel.io/legal/end-user-agreement" target="_blank" rel="noreferrer">
            End User Agreement
          </a>
          .
        </span>
      </label>

      {consented && phase === "form" && (
        <div className="ob-credit-fields">
          <input
            className="ob-input"
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="ob-input"
            placeholder="Date of birth (MM/DD/YYYY)"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <button
            className="ob-credit-btn"
            type="button"
            disabled={busy || !phone.trim() || !dob.trim()}
            onClick={() => void sendCode()}
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      )}

      {phase === "code" && (
        <div className="ob-credit-fields">
          <p className="ob-credit-note">
            We texted a code to {phone}.{" "}
            <button type="button" className="ob-credit-link" onClick={() => { setPhase("form"); setError(null); }}>
              Use a different number
            </button>
          </p>
          <input
            className="ob-input"
            inputMode="numeric"
            placeholder="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="ob-credit-btn" type="button" disabled={busy || !code.trim()} onClick={() => void verify()}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </div>
      )}

      {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}

      {phase === "done" && (
        <div className="ob-connected" style={{ marginTop: 10, marginBottom: 0 }}>
          <Check size={18} strokeWidth={2.5} /> Credit tracking connected. Your score will show up on the Credit
          tab.
        </div>
      )}
    </div>
  );
}
