import { useState } from "react";
import { deleteAllPlans } from "@/lib/plans";
import { clearProfile, clearOnboarded, deleteRemoteProfile } from "@/lib/profile";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { useTheme } from "@/lib/theme";

// Wipe this account back to a brand-new state, server profile + plans and all
// local caches (profile, onboarded flag, welcome tip), then hard-reload into
// /app so the first-run onboarding gate re-triggers. Testing convenience only;
// does NOT unlink Plaid items.
async function resetForTesting(email: string) {
  await Promise.all([deleteAllPlans(), deleteRemoteProfile()]);
  if (email) {
    clearProfile(email);
    clearOnboarded(email);
    try {
      localStorage.removeItem(`juniper_welcomed_${email}`);
    } catch {
      /* ignore */
    }
  }
  window.location.assign("/app");
}

export function SettingsModal({ name, email, onClose }: { name: string; email: string; onClose: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const doReset = async () => {
    setBusy(true);
    await resetForTesting(email);
    // resetForTesting navigates away; no need to unset busy.
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <h3>Settings</h3>

        <div className="facts" style={{ marginBottom: 20 }}>
          <div className="fr"><span className="k">Name</span><span className="v">{name || "-"}</span></div>
          <div className="fr"><span className="k">Email</span><span className="v">{email || "-"}</span></div>
        </div>

        <div className="pop-lbl" style={{ padding: "0 0 6px" }}>Appearance</div>
        <div
          className="fr"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}
        >
          <div>
            <div className="k" style={{ fontWeight: 650, color: "var(--jnpr-ink)" }}>Dark mode</div>
            <div className="v" style={{ color: "var(--jnpr-ink-3)", fontSize: 12.5 }}>{isDark ? "On" : "Off"}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
            style={{
              flex: "0 0 auto",
              width: 46,
              height: 27,
              borderRadius: 999,
              border: "1px solid var(--jnpr-line)",
              background: isDark ? "var(--jnpr-accent)" : "var(--jnpr-surface-3)",
              position: "relative",
              cursor: "pointer",
              padding: 0,
              transition: "background .15s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: isDark ? 21 : 2,
                width: 21,
                height: 21,
                borderRadius: "50%",
                background: "var(--jnpr-surface)",
                boxShadow: "0 1px 3px rgba(0,0,0,.35)",
                transition: "left .15s",
              }}
            />
          </button>
        </div>

        <div className="pop-lbl" style={{ padding: "0 0 6px" }}>Testing</div>
        {!confirming ? (
          <>
            <p style={{ margin: "0 0 12px" }}>
              Reset this account to a brand-new state, clears your profile, plans, and onboarding so the
              first-run flow runs again. Linked bank accounts are not disconnected.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirming(true)}>Reset plans &amp; preferences</button>
              <button className="btn ghost" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="form-error" style={{ marginBottom: 14 }}>
              This wipes your profile, plans, and onboarding for <b>{email}</b>. This can't be undone.
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={doReset} disabled={busy} style={{ background: "var(--jnpr-bad)" }}>
                {busy ? "Resetting…" : "Yes, reset everything"}
              </button>
              <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
    </ModalBackdrop>
  );
}
