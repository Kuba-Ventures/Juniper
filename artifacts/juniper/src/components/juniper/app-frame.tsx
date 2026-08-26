import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useFinances } from "@/lib/finances";
import { SettingsModal } from "@/components/juniper/settings-modal";

type NavItem = { path: string; label: string; count?: number };

// Stage 4c: the bar is single-workspace again. "Recommended" left this list with
// its route (every seeded partner URL is still example.com, and the licensing
// question in docs/CREDIT_PROVIDER.md is open), and so did the shared sub-nav,
// the individual-to-shared workspace switcher, and the account-menu partner
// items, whose only destination was /app/shared. Nothing in this bar may point
// at a surface that cannot show the member their own real data.
const PERSONAL_NAV: NavItem[] = [
  { path: "/app", label: "Overview" },
  { path: "/app/plans", label: "Plans" },
  { path: "/app/ask", label: "Ask Juniper" },
  { path: "/app/credit", label: "Credit" },
];

function isActive(current: string, path: string) {
  if (path === "/app") return current === "/app" || current === "/app/";
  return current === path || current.startsWith(path + "/");
}

export function AppBar({ name, email }: { name: string; email?: string }) {
  const [loc, setLocation] = useLocation();
  const { data: finances, source } = useFinances();
  const [open, setOpen] = useState<null | "account">(null);
  const [settings, setSettings] = useState(false);
  const initial = (name || "You").trim().charAt(0).toUpperCase();
  // Only show a "linked" count when the member actually linked + synced Plaid;
  // a manual-only dashboard has no linked institutions.
  const linkedCount = source === "live"
    ? finances.accounts.cash.length + finances.accounts.invest.length + finances.accounts.debt.length
    : 0;

  const navTo = (path: string) => { setOpen(null); setLocation(path); };
  const signOut = async () => { setOpen(null); try { await supabase.auth.signOut(); } catch { /* ignore */ } setLocation("/"); };

  return (
    <div className="appbar">
      <div className="appbar-in">
        {/* Row 1, brand and account controls inline, then the primary nav below.
           The workspace switcher used to sit centered between them; it went with
           the shared workspace in Stage 4c, so the grid is two columns now. */}
        <div className="appbar-top">
          <Link href="/app" className="brand">
            <img src="/logo.png" alt="Juniper" />
            Juniper
          </Link>

          <div className="appbar-acct">
            {linkedCount > 0 && <span className="plaid-pill"><span className="dot" />{linkedCount} linked</span>}
            <button className="icon-btn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.5 21a1.5 1.5 0 003 0" strokeLinecap="round" />
              </svg>
            </button>

            <div className="acct-wrap">
              <button className="avatar" aria-label="Account" onClick={() => setOpen(open === "account" ? null : "account")}>{initial}</button>
              {open === "account" && (
                <>
                  <div className="pop-scrim" onClick={() => setOpen(null)} />
                  <div className="pop acct-menu">
                    <div className="pop-head"><div className="avatar sm">{initial}</div><div><b>{name || "You"}</b><small>{email || "you@email.com"}</small></div></div>
                    <button className="pop-i flat" onClick={() => navTo("/app/connections")}>Connections</button>
                    {/* Invite partner, Manage partner, and Disconnect partner
                        lived here. All three only led to /app/shared, which is
                        unrouted, so they were an invitation into nothing. */}
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
        <nav className="nav" aria-label="Primary">
          {PERSONAL_NAV.map((n) => (
            <Link key={n.path} href={n.path} className={isActive(loc, n.path) ? "on" : undefined}>
              <span className="lbl">{n.label}</span>
              {n.count != null && <span className="count">{n.count}</span>}
            </Link>
          ))}
        </nav>
      </div>
      {settings && <SettingsModal name={name} email={email ?? ""} onClose={() => setSettings(false)} />}
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
