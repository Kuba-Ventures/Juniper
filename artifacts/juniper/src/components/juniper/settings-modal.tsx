import { useState } from "react";
import { deleteAllPlans } from "@/lib/plans";
import { clearProfile, clearOnboarded, deleteRemoteProfile, requestOnboardingReplay } from "@/lib/profile";
import { ModalBackdrop } from "@/components/juniper/modal-portal";
import { useTheme } from "@/lib/theme";
import { useFinances } from "@/lib/finances";
import { timeAgo } from "@/lib/auto-sync";
import { syncFinances } from "@/lib/plaid";

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
  // The replay request is the part that actually works. Clearing the onboarded
  // flag alone left the gate satisfied by hasProfileData(), so a developer with
  // real numbers on their profile pressed Restart and got a page reload.
  requestOnboardingReplay();
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
  // Its own busy flag rather than the context's `syncing`, which is true only
  // for the AUTOMATIC background refresh. Sharing it left the button disabled
  // while a background sync it had not started was running.
  const [busyRefresh, setBusyRefresh] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const doRefresh = async () => {
    // syncFinances directly, NOT runBackgroundSync, and both differences matter
    // for a control somebody deliberately pressed.
    //
    // runBackgroundSync swallows every failure ("a failed background refresh is
    // not the member's problem"), which is right for a refresh nobody asked for
    // and wrong here: this button reported "Done" whether or not anything
    // happened, so a failing sync was indistinguishable from a working one.
    //
    // It also returns the in-flight promise when a background sync is already
    // running, so a press could resolve without starting any work at all.
    setBusyRefresh(true); setRefreshNote(null);
    try {
      const result = await syncFinances();
      await refresh();
      // Same reporting the Connections page does, for the same reason: a run
      // that reached Plaid for some connections and not others must not look
      // like a clean one.
      if (result.needsRelink.length) {
        setRefreshNote(
          `${result.needsRelink.length} connection${result.needsRelink.length === 1 ? "" : "s"} need reconnecting. Fix them on Connections.`,
        );
      } else if (!result.transactions && !result.netWorth) {
        setRefreshNote("Nothing refreshed. Check Connections.");
      } else {
        setRefreshed(true);
      }
    } catch {
      setRefreshNote("That did not run. Try again.");
    } finally {
      setBusyRefresh(false);
    }
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
                    {refreshNote && <div className="dev-warn">{refreshNote}</div>}
                  </div>
                  <button className="btn ghost sm" disabled={busyRefresh || refreshed} onClick={doRefresh}>
                    {busyRefresh ? "Refreshing…" : refreshed ? "Done" : "Refresh"}
                  </button>
                </div>

                <div className="dev-row">
                  <div className="dev-t">
                    <div className="dev-n">Restart onboarding</div>
                    <div className="dev-s">
                      Replays the first-run flow. Your plans and linked accounts are left alone, and finishing it
                      saves whatever you type over your profile.
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
