import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useFinances } from "@/lib/finances";
import { SettingsModal } from "@/components/juniper/settings-modal";
import type { HolderStyle } from "@/lib/holder-style";
import { WorkspaceSwitcher } from "@/components/juniper/workspace-switcher";
import { useWorkspace } from "@/lib/workspace";
import { resetPartnerCache } from "@/lib/partner";
import { useNotifications } from "@/lib/notifications";

type NavItem = { path: string; label: string; count?: number };

// Stage 4c: the bar is single-workspace again. "Recommended" left this list with
// its route (every seeded partner URL is still example.com, and the licensing
// question in docs/CREDIT_PROVIDER.md is open), and so did the shared sub-nav,
// the individual-to-shared workspace switcher, and the account-menu partner
// items, whose only destination was /app/shared. Nothing in this bar may point
// at a surface that cannot show the member their own real data.
// Switching space switches the whole product, so the bar's own tabs change with
// it rather than a sub-nav appearing under a personal one. Derived from what the
// shared space holds: on day one that is a single Together tab, because Accounts
// and Goals would open onto nothing. Bills and Activity are absent until their
// pages stopped reading the seeded household, which is now deleted.
function sharedNav(holds: { accounts: boolean; goals: boolean; bills: boolean; activity: boolean }): NavItem[] {
  const any = holds.accounts || holds.goals || holds.bills || holds.activity;
  if (!any) return [{ path: "/app/shared", label: "Together" }];
  const nav: NavItem[] = [{ path: "/app/shared", label: "Overview" }];
  if (holds.accounts) nav.push({ path: "/app/shared/accounts", label: "Accounts" });
  if (holds.goals) nav.push({ path: "/app/shared/goals", label: "Goals" });
  if (holds.bills) nav.push({ path: "/app/shared/bills", label: "Bills" });
  if (holds.activity) nav.push({ path: "/app/shared/activity", label: "Activity" });
  return nav;
}

const PERSONAL_NAV: NavItem[] = [
  { path: "/app", label: "Overview" },
  // Transactions sits second, next to the dashboard it drills into. The compact
  // transactions card stays on the Overview: that card answers "what happened
  // lately" without a page load, which is a different job from the full history.
  { path: "/app/transactions", label: "Transactions" },
  { path: "/app/plans", label: "Plans" },
  { path: "/app/ask", label: "Ask Juniper" },
  { path: "/app/credit", label: "Credit" },
  // Connections sits last, and it is in this list rather than in the account
  // menu because it is a surface about the member's money, not about their
  // Juniper account. Buried under the avatar it was two clicks from anywhere and
  // sat beside Sign out, next to the two things that are genuinely account
  // admin. It is also where a member goes after linking a bank, which is often,
  // and the menu gave no hint that it was there.
  { path: "/app/connections", label: "Connections" },
];

function isActive(current: string, path: string) {
  if (path === "/app") return current === "/app" || current === "/app/";
  return current === path || current.startsWith(path + "/");
}

export function AppBar({
  name, email, holderStyle = null, onHolderStyle,
}: {
  name: string;
  email?: string;
  /** Passed straight through to the settings modal's Appearance section. The bar
      does not use it; it is the only component mounted high enough to own the
      modal and low enough to have the profile handed to it. */
  holderStyle?: HolderStyle | null;
  onHolderStyle?: (s: HolderStyle) => void;
}) {
  const [loc, setLocation] = useLocation();
  const { data: finances, source } = useFinances();
  const [open, setOpen] = useState<null | "account" | "notifications">(null);
  const [settings, setSettings] = useState(false);
  const { workspace, holds } = useWorkspace();
  const shared = workspace === "shared";
  const initial = (name || "You").trim().charAt(0).toUpperCase();
  // Only show a "linked" count when the member actually linked + synced Plaid;
  // a manual-only dashboard has no linked institutions.
  const linkedCount = source === "live"
    ? finances.accounts.cash.length + finances.accounts.invest.length + finances.accounts.debt.length
    : 0;
  const { items: notifications } = useNotifications();

  const signOut = async () => {
    setOpen(null);
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    // The partner store is module level, so it survives this client-side route
    // change. Without clearing it the next member signing in to the same tab
    // would see the previous one's partner until the first fetch returned.
    resetPartnerCache();
    setLocation("/");
  };

  return (
    <div className="appbar">
      <div className="appbar-in">
        {/* Row 1, brand and account controls inline, then the primary nav below.
           The workspace switcher used to sit centered between them; it went with
           the shared workspace in Stage 4c, so the grid is two columns now. */}
        <div className="appbar-top with-ws">
          <Link href="/app" className="brand">
            <img src="/logo.png" alt="Juniper" />
            Juniper
          </Link>

          {/* The slot the Stage 4c teardown left in place. Centred between the
              brand and the account controls, which is where a control that
              changes the meaning of every number below it belongs. */}
          <div className="appbar-ws">
            <WorkspaceSwitcher initial={initial} />
          </div>

          <div className="appbar-acct">
            {linkedCount > 0 && <span className="plaid-pill"><span className="dot" />{linkedCount} linked</span>}
            <div className="acct-wrap">
              <button
                className={`icon-btn${notifications.length > 0 ? " has-alert" : ""}`}
                aria-label={notifications.length > 0 ? `Notifications, ${notifications.length} to review` : "Notifications"}
                onClick={() => setOpen(open === "notifications" ? null : "notifications")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10.5 21a1.5 1.5 0 003 0" strokeLinecap="round" />
                </svg>
              </button>
              {open === "notifications" && (
                <>
                  <div className="pop-scrim" onClick={() => setOpen(null)} />
                  <div className="pop notif-pop">
                    <div className="pop-head"><b>Notifications</b></div>
                    {notifications.length === 0 ? (
                      <div className="notif-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                          <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10.5 21a1.5 1.5 0 003 0" strokeLinecap="round" />
                        </svg>
                        <p>Nothing to review</p>
                        <small>A connection that needs reconnecting, a budget going over, or a charge that came in higher than expected will show up here.</small>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <Link key={n.id} href={n.href} className={`notif-item notif-${n.kind}`} onClick={() => setOpen(null)}>
                          <span className="notif-dot" />
                          <span className="notif-text"><b>{n.title}</b><small>{n.detail}</small></span>
                        </Link>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="acct-wrap">
              <button className="avatar" aria-label="Account" onClick={() => setOpen(open === "account" ? null : "account")}>{initial}</button>
              {open === "account" && (
                <>
                  <div className="pop-scrim" onClick={() => setOpen(null)} />
                  <div className="pop acct-menu">
                    <div className="pop-head"><div className="avatar sm">{initial}</div><div><b>{name || "You"}</b><small>{email || "you@email.com"}</small></div></div>
                    {/* Connections moved to the primary nav, so this menu is
                        the member's Juniper account and nothing else. Two ways
                        into one page would have left the nav tab looking like a
                        different destination.

                        Invite partner, Manage partner, and Disconnect partner
                        lived here too. All three only led to /app/shared, which
                        is unrouted, so they were an invitation into nothing. */}
                    <button className="pop-i flat" onClick={() => { setOpen(null); setSettings(true); }}>Settings</button>
                    <div className="pop-sep" />
                    <button className="pop-i flat" onClick={signOut}>Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2, primary nav */}
        <nav className="nav" aria-label={shared ? "Shared" : "Primary"}>
          {(shared ? sharedNav(holds) : PERSONAL_NAV).map((n) => (
            <Link key={n.path} href={n.path} className={isActive(loc, n.path) ? "on" : undefined}>
              <span className="lbl">{n.label}</span>
              {n.count != null && <span className="count">{n.count}</span>}
            </Link>
          ))}
        </nav>
      </div>
      {settings && (
        <SettingsModal
          name={name}
          email={email ?? ""}
          onClose={() => setSettings(false)}
          holderStyle={holderStyle}
          onHolderStyle={onHolderStyle}
        />
      )}
    </div>
  );
}

/* A pine page-header band with a title, optional subtitle, and right-side actions. */
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
