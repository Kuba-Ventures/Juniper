import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { deleteAllPlans } from "@/lib/plans";
import { clearProfile, clearOnboarded, deleteRemoteProfile, requestOnboardingReplay } from "@/lib/profile";
import { PageHeader } from "@/components/juniper/app-frame";
import { useTheme } from "@/lib/theme";
import { HOLDER_STYLES, HOLDER_LABEL, holderClass, type HolderStyle } from "@/lib/holder-style";
import { useFinances } from "@/lib/finances";
import { timeAgo } from "@/lib/auto-sync";
import { rebuildNetworthHistory, syncFinances } from "@/lib/plaid";

type SettingsTab = "account" | "appearance" | "developer";
const TAB_LABEL: Record<SettingsTab, string> = { account: "Account", appearance: "Appearance", developer: "Developer" };

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

// Issue #245: this used to be a modal, and `.modal .fr` (a two-column
// label -> value row) was being asked to hold three different row shapes at
// once, a genuine label/value pair (Name, Email), a control with its own
// description (Dark mode, Card holder), and a heading/paragraph/button action
// row (Developer). Routing it gives every shape the width it actually needs,
// and makes a URL like /app/settings/appearance a real destination something
// else (the Credit page's holder, say) could link to later.
export function Settings({
  tab, name, email, holderStyle = null, onHolderStyle, onNameChange,
}: {
  tab?: string;
  name: string;
  email: string;
  /** The member's chosen holder (migration 0048), or null for the default. */
  holderStyle?: HolderStyle | null;
  /** Persists a new choice. Absent means the picker is not shown, which keeps
      this page usable from anywhere that has no profile to write to. */
  onHolderStyle?: (s: HolderStyle) => void;
  /** Persists a new display name through the same profile path holder_style
      takes. Absent means Name renders read-only, same reasoning as above. */
  onNameChange?: (name: string) => void;
}) {
  const [, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(email);
  const [busyEmail, setBusyEmail] = useState(false);
  // Set once and kept until the next edit attempt, so "check your inbox" stays
  // on screen after Save closes the field back to a read-only row: the change
  // is not real yet (Supabase holds it pending confirmation), and the row
  // still showing the OLD email is exactly the moment that note matters most.
  const [emailNote, setEmailNote] = useState<{ text: string; kind: "good" | "bad" } | null>(null);
  const { sync, syncing, refresh } = useFinances();
  const isDeveloper = import.meta.env.DEV || !!sync?.isDeveloper;
  // The rebuild reports what it did rather than saying "Done", because it is the
  // one control here that deletes rows: a member pressing it deserves to read
  // how many reconstructed days were replaced and how many recorded ones were
  // left alone. See api/plaid/networth-backfill.ts.
  const [busyRebuild, setBusyRebuild] = useState(false);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);
  // Its own busy flag rather than the context's `syncing`, which is true only
  // for the AUTOMATIC background refresh. Sharing it left the button disabled
  // while a background sync it had not started was running.
  const [busyRefresh, setBusyRefresh] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  // A stale link (or a bookmark from before Developer was granted) falls back
  // to Account rather than rendering a tab with nothing behind it.
  const requested: SettingsTab = tab === "appearance" ? "appearance" : tab === "developer" ? "developer" : "account";
  const activeTab: SettingsTab = requested === "developer" && !isDeveloper ? "account" : requested;
  const tabs: SettingsTab[] = isDeveloper ? ["account", "appearance", "developer"] : ["account", "appearance"];
  const goTab = (t: SettingsTab) => setLocation(t === "account" ? "/app/settings" : `/app/settings/${t}`);

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

  const doRebuild = async () => {
    setBusyRebuild(true);
    setRebuildNote(null);
    const res = await rebuildNetworthHistory();
    setBusyRebuild(false);
    if (!res) { setRebuildNote("Please sign in again."); return; }
    if (!res.ok) { setRebuildNote(res.error ?? "Couldn't rebuild the history."); return; }
    if (!res.days) { setRebuildNote("Nothing earlier to reconstruct."); return; }
    const bits = [`${res.cleared} reconstructed ${res.cleared === 1 ? "day" : "days"} replaced`];
    if (res.recordedKept) bits.push(`${res.recordedKept} recorded ${res.recordedKept === 1 ? "day" : "days"} left alone`);
    if (res.investmentsUnavailable) {
      bits.push(`${res.investmentsUnavailable} ${res.investmentsUnavailable === 1 ? "connection" : "connections"} could not report investment flows, so their invested balance is still carried back flat`);
    } else if (res.investmentsAdjusted) {
      bits.push(`investments adjusted for contributions on ${res.investmentsAdjusted} ${res.investmentsAdjusted === 1 ? "connection" : "connections"}`);
    }
    setRebuildNote(bits.join(", ") + ".");
    refresh();
  };

  const doReset = async () => {
    setBusy(true);
    await resetForTesting(email);
    // resetForTesting navigates away; no need to unset busy.
  };

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    onNameChange?.(trimmed);
    setEditingName(false);
  };

  // Email is Supabase Auth's identity, not a `user_profiles` column, so this
  // goes through `supabase.auth.updateUser` directly rather than the profile
  // save path Name and the holder use. By default Supabase does not apply the
  // change until the member clicks the confirmation link it sends, so `email`
  // (read from the session) does not update here: it updates itself, later,
  // through `useSession()`'s own `onAuthStateChange` listener once confirmed.
  const saveEmail = async () => {
    const trimmed = emailDraft.trim();
    if (!trimmed || trimmed === email) { setEditingEmail(false); return; }
    setBusyEmail(true);
    setEmailNote(null);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setBusyEmail(false);
    if (error) {
      setEmailNote({ text: error.message, kind: "bad" });
      return;
    }
    setEmailNote({
      text: `Check ${trimmed} for a confirmation link. Your email won't change until you confirm it.`,
      kind: "good",
    });
    setEditingEmail(false);
  };

  return (
    <div className="frame">
      <PageHeader title="Settings" />
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {tabs.map((t) => (
            <button key={t} type="button" className={activeTab === t ? "on" : undefined} onClick={() => goTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>
        <div className="pills settings-mobile-tabs" role="tablist" aria-label="Settings sections">
          {tabs.map((t) => (
            <button key={t} type="button" className={activeTab === t ? "on" : undefined} onClick={() => goTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="card settings-panel">
          {activeTab === "account" && (
            <>
              <div className={`setting-row${editingName ? " stacked" : ""}`}>
                <div className="st-body">
                  <div className="st-title">Name</div>
                  {!editingName && <div className="st-desc">{name || "-"}</div>}
                </div>
                <div className="st-control">
                  {!onNameChange ? null : !editingName ? (
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() => { setNameDraft(name); setEditingName(true); }}
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="field" style={{ margin: 0 }}>
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveName()}
                        maxLength={80}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="btn sm" type="button" disabled={!nameDraft.trim()} onClick={saveName}>
                          Save
                        </button>
                        <button className="btn ghost sm" type="button" onClick={() => setEditingName(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={`setting-row${editingEmail ? " stacked" : ""}`}>
                <div className="st-body">
                  <div className="st-title">Email</div>
                  {!editingEmail && <div className="st-desc">{email || "-"}</div>}
                  {emailNote && <div className={`st-note ${emailNote.kind}`}>{emailNote.text}</div>}
                </div>
                <div className="st-control">
                  {!editingEmail ? (
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() => { setEmailDraft(email); setEditingEmail(true); setEmailNote(null); }}
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="field" style={{ margin: 0 }}>
                      <input
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEmail()}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="btn sm" type="button" disabled={busyEmail || !emailDraft.trim()} onClick={saveEmail}>
                          {busyEmail ? "Sending…" : "Save"}
                        </button>
                        <button className="btn ghost sm" type="button" disabled={busyEmail} onClick={() => setEditingEmail(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "appearance" && (
            <>
              <div className="setting-row">
                <div className="st-body">
                  <div className="st-title">Dark mode</div>
                  <div className="st-desc">{isDark ? "On" : "Off"}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  aria-label="Toggle dark mode"
                  onClick={toggleTheme}
                  className="st-control"
                  style={{
                    width: 46, height: 27, borderRadius: 999, border: "1px solid var(--jnpr-line)",
                    background: isDark ? "var(--jnpr-accent)" : "var(--jnpr-surface-3)", position: "relative",
                    cursor: "pointer", padding: 0, transition: "background .15s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute", top: 2, left: isDark ? 21 : 2, width: 21, height: 21, borderRadius: "50%",
                      background: "var(--jnpr-surface)", boxShadow: "0 1px 3px rgba(0,0,0,.35)", transition: "left .15s",
                    }}
                  />
                </button>
              </div>

              {/* THE CARD HOLDER. Appearance is where it belongs, beside the
                  theme, because both are "how the app looks to me" and neither
                  is about money. Unlike the theme it is stored per MEMBER
                  rather than per device (migration 0048): a theme is a
                  property of the screen you are looking at, and a holder is a
                  thing you picked, so a holder that changed when you opened
                  your laptop would be a bug.
                  Six materials, and the labels are what somebody would say out
                  loud. This section now gets the page's full width rather than
                  a corner of a `.fr` row, which is what let the swatches grow
                  and stopped the labels wrapping (issue #245). */}
              {onHolderStyle && (
                <div className="setting-row stacked">
                  <div className="st-body">
                    <div className="st-title">Card holder</div>
                    <div className="st-desc">How your cards are drawn on the Credit page.</div>
                  </div>
                  <div className="st-control">
                    <div className="hold-pick">
                      {HOLDER_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="hold-opt"
                          aria-pressed={holderStyle === s}
                          aria-label={HOLDER_LABEL[s]}
                          onClick={() => onHolderStyle(s)}
                        >
                          {/* The swatch IS the holder, same classes, so a
                              material can never look one way here and another
                              on the Credit page. Three stand-in cards rather
                              than real art: the choice is about the holder,
                              and borrowing an issuer's artwork to advertise a
                              leather finish is not a comparison of holders. */}
                          <span className={`hold-swatch ${holderClass(s)}`} aria-hidden="true">
                            <span className="sw-card" style={{ top: 5 }} />
                            <span className="cr-holder-band" style={{ top: 20 }} />
                            <span className="sw-card" style={{ top: 27 }} />
                            <span className="cr-holder-band" style={{ top: 42 }} />
                            <span className="sw-card" style={{ top: 49, bottom: 0, height: "auto" }} />
                          </span>
                          <span className="lbl">{HOLDER_LABEL[s]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Developer tools live on their own tab now rather than sharing a
             scroll with Appearance. A destructive Reset used to need its own
             disclosure to keep it from reading as more prominent than the
             refresh/rebuild rows beside it; separating the whole tab does that
             job instead, since Reset is never in the same view as Appearance
             at all. Gated on a local dev build or the DEVELOPER_EMAILS
             allowlist; the endpoints behind it are unchanged and still scoped
             to the caller. */}
          {activeTab === "developer" && isDeveloper && (
            !confirming ? (
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
                    <div className="dev-n">Rebuild net-worth history</div>
                    <div className="dev-s">
                      Redoes the reconstructed days before your first recorded snapshot, which is worth doing after
                      relinking a bank that can now report investment flows it could not before. Days Juniper actually
                      recorded are never touched.
                    </div>
                    {rebuildNote && <div className="dev-warn">{rebuildNote}</div>}
                  </div>
                  <button className="btn ghost sm" disabled={busyRebuild} onClick={doRebuild}>
                    {busyRebuild ? "Rebuilding…" : "Rebuild"}
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
              <>
                <div className="form-error">
                  This wipes your profile, plans, and onboarding for <b>{email}</b>. This can't be undone.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={doReset} disabled={busy} style={{ background: "var(--jnpr-bad)", flex: 1, justifyContent: "center" }}>
                    {busy ? "Resetting…" : "Yes, reset everything"}
                  </button>
                  <button className="btn ghost" onClick={() => setConfirming(false)} disabled={busy} style={{ flex: 1, justifyContent: "center" }}>
                    Cancel
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
