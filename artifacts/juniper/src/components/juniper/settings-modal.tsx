import { useState } from "react";
import { deleteAllPlans } from "@/lib/plans";
import { clearProfile, clearOnboarded, deleteRemoteProfile } from "@/lib/profile";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { useTheme } from "@/lib/theme";
import { useFinances } from "@/lib/finances";
import { runBackgroundSync, timeAgo } from "@/lib/auto-sync";

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

// Onboarding only. Leaves the profile and the plans alone, which is the whole
// difference from the reset below: this replays the first-run flow to see what a
// new member sees, without destroying the account it is being tested on.
function restartOnboarding(email: string) {
  if (email) {
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
  const [refreshed, setRefreshed] = useState(false);
  const { sync, syncing, refresh } = useFinances();
  const isDeveloper = import.meta.env.DEV || !!sync?.isDeveloper;

  const doRefresh = async () => {
    // The same background sync the app runs on its own, not a second path to
    // the same endpoints. What this skips is the six-hour staleness check, not
    // any of the work.
    await runBackgroundSync();
    await refresh();
    setRefreshed(true);
  };

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

        {/* Developer tools. These used to be one "Testing" block shown to
           everyone, including the reset that wipes an account. A member has no
           use for any of it, and a destructive control sitting in everyone's
           settings is an accident waiting to be reported as a bug. Gated on a
           local dev build or the DEVELOPER_EMAILS allowlist; the endpoints
           behind them are unchanged and still scoped to the caller. */}
        {isDeveloper && (
          <>
            <div className="pop-lbl" style={{ padding: "0 0 6px" }}>Developer</div>
            {!confirming ? (
              <div className="dev-tools">
                <div className="dev-row">
                  <div className="dev-t">
                    <div className="dev-n">Refresh data now</div>
                    <div className="dev-s">
                      Skips the six-hour wait and pulls transactions, balances, and recurring charges from Plaid.
                      {sync?.syncedAt ? ` Last synced ${timeAgo(sync.syncedAt)}.` : ""}
                    </div>
                  </div>
                  <button className="btn ghost sm" disabled={syncing || refreshed} onClick={doRefresh}>
                    {syncing ? "Refreshing…" : refreshed ? "Done" : "Refresh"}
                  </button>
                </div>

                <div className="dev-row">
                  <div className="dev-t">
                    <div className="dev-n">Restart onboarding</div>
                    <div className="dev-s">
                      Replays the first-run flow. Your profile, plans, and linked accounts are left alone.
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => restartOnboarding(email)}>Restart</button>
                </div>

                <div className="dev-row">
                  <div className="dev-t">
                    <div className="dev-n">Reset plans &amp; preferences</div>
                    <div className="dev-s">
                      Wipes your profile, plans, and onboarding back to a brand-new account. Linked banks stay
                      connected.
                    </div>
                  </div>
                  <button className="btn ghost sm danger" onClick={() => setConfirming(true)}>Reset</button>
                </div>
              </div>
            ) : (
              <div className="form-error" style={{ marginBottom: 14 }}>
                This wipes your profile, plans, and onboarding for <b>{email}</b>. This can't be undone.
              </div>
            )}
          </>
        )}

        {confirming ? (
          <div className="modal-actions">
            <button className="btn" onClick={doReset} disabled={busy} style={{ background: "var(--jnpr-bad)" }}>
              {busy ? "Resetting…" : "Yes, reset everything"}
            </button>
            <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          </div>
        ) : (
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>Close</button>
          </div>
        )}
    </ModalBackdrop>
  );
}
