import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { WorkspaceSwitcher } from "@/components/juniper/workspace-switcher";
import { HouseholdSwitcher } from "@/components/juniper/household-switcher";
import { useWorkspace } from "@/lib/workspace";
import { resetPartnerCache } from "@/lib/partner";
import { resetHouseholdCache } from "@/lib/household";
import { useNotifications, agoLabel, type NotificationRecord } from "@/lib/notifications";

// One row in the bell's dropdown, New or Earlier. A separate component
// (rather than inlined twice) because the two sections differ in exactly two
// props, read styling and what opening the row does, and a plain object
// literal duplicated per loop was the alternative.
function NotifRow({
  n, read = false, onOpen, onClear,
}: {
  n: NotificationRecord;
  read?: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  const when = n.resolved_at ?? n.created_at;
  return (
    <Link
      href={n.href}
      className={`notif-item notif-${n.kind}${read ? " read" : ""}`}
      onClick={onOpen}
    >
      <span className="notif-dot" />
      <span className="notif-text"><b>{n.title}</b><small>{n.detail}</small></span>
      <span className="when">{agoLabel(when)}</span>
      <button
        className="notif-x"
        aria-label={`Clear "${n.title}"`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </Link>
  );
}

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
  // Ask Juniper left this list for the icon beside the bell (issue #263):
  // always reachable, on every page, rather than only from a nav tab you
  // have to first navigate away from whatever you were looking at.
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
  name, email,
}: {
  name: string;
  email?: string;
}) {
  const [loc, setLocation] = useLocation();
  const [open, setOpen] = useState<null | "account" | "notifications">(null);
  const { workspace, holds } = useWorkspace();
  const shared = workspace === "shared";
  const initial = (name || "You").trim().charAt(0).toUpperCase();
  const { active: newNotifs, earlier: earlierNotifs, markRead, clear } = useNotifications();
  const notifCount = newNotifs.length;

  const signOut = async () => {
    setOpen(null);
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    // The partner store is module level, so it survives this client-side route
    // change. Without clearing it the next member signing in to the same tab
    // would see the previous one's partner until the first fetch returned.
    resetPartnerCache();
    resetHouseholdCache();
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
            <HouseholdSwitcher />
          </div>

          {/* The "N linked" pill used to live here. It counted accounts, not
              institutions, was hidden below 720px, and did nothing when
              pressed: an ambient fact with no page behind it. It moved to
              Connections (LinkedSummary in pages/connections.tsx), the one
              place the number is both provable and actionable, leaving this
              bar to the two controls that actually act: the bell and the
              account menu. */}
          <div className="appbar-acct">
            <div className="acct-wrap">
              <button
                className={`icon-btn${notifCount > 0 ? " has-alert" : ""}`}
                aria-label={notifCount > 0 ? `Notifications, ${notifCount} new` : "Notifications"}
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
                    {newNotifs.length === 0 && earlierNotifs.length === 0 ? (
                      <div className="notif-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                          <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10.5 21a1.5 1.5 0 003 0" strokeLinecap="round" />
                        </svg>
                        <p>Nothing to review</p>
                        <small>A connection that needs reconnecting, a budget going over, or a charge that came in higher than expected will show up here.</small>
                      </div>
                    ) : (
                      <div className="notif-scroll">
                        {newNotifs.length > 0 && (
                          <>
                            <div className="notif-sec">New</div>
                            {newNotifs.map((n) => (
                              <NotifRow key={n.id} n={n} onOpen={() => { markRead(n.id); setOpen(null); }} onClear={() => clear(n.id)} />
                            ))}
                          </>
                        )}
                        {earlierNotifs.length > 0 && (
                          <>
                            <div className="notif-sec">Earlier</div>
                            {earlierNotifs.map((n) => (
                              <NotifRow key={n.id} n={n} read onOpen={() => setOpen(null)} onClear={() => clear(n.id)} />
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Ask Juniper (issue #263): always reachable from any page,
               grounded in whichever one this was pressed from. A plain
               navigation to the real page rather than a popover holding its
               own small copy of the conversation UI, so there is one
               experience for "ask something" and not two that can drift. */}
            <Link
              href={`/app/ask?from=${encodeURIComponent(loc)}`}
              className={`icon-btn${loc.startsWith("/app/ask") ? " lit" : ""}`}
              aria-label="Ask Juniper"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
              </svg>
            </Link>

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
                    <button className="pop-i flat" onClick={() => { setOpen(null); setLocation("/app/settings"); }}>Settings</button>
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
    </div>
  );
}

/* A pine page-header band with a title, optional subtitle, and right-side actions.
   `actionsClassName` is an escape hatch for a caller whose actions row is too
   crowded to sit beside the title (Connections' institution summary, freshness
   line and two buttons): it modifies rather than replaces `.page-actions`, so
   every other caller's layout is untouched. */
export function PageHeader({
  title, sub, actions, actionsClassName,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  actionsClassName?: string;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && (
        <div className={actionsClassName ? `page-actions ${actionsClassName}` : "page-actions"}>{actions}</div>
      )}
    </div>
  );
}
