import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/lib/workspace";
import { InviteModal } from "@/components/juniper/invite-modal";

type NavItem = { path: string; label: string; count?: number };

const PERSONAL_NAV: NavItem[] = [
  { path: "/app", label: "Home" },
  { path: "/app/spending", label: "Spending" },
  { path: "/app/plans", label: "Plans", count: 4 },
  { path: "/app/ask", label: "Ask Juniper" },
  { path: "/app/credit", label: "Credit" },
  { path: "/app/recommended", label: "Recommended" },
];

const SHARED_NAV: NavItem[] = [
  { path: "/app/shared", label: "Overview" },
  { path: "/app/shared/accounts", label: "Accounts" },
  { path: "/app/shared/goals", label: "Goals" },
  { path: "/app/shared/bills", label: "Bills" },
  { path: "/app/shared/activity", label: "Activity" },
  { path: "/app/shared/sharing", label: "Sharing" },
];

function isActive(current: string, path: string) {
  if (path === "/app") return current === "/app" || current === "/app/";
  if (path === "/app/shared") return current === "/app/shared" || current === "/app/shared/";
  return current === path || current.startsWith(path + "/");
}

const Caret = () => <svg className="caret" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function AppBar({ name, email }: { name: string; email?: string }) {
  const [loc, setLocation] = useLocation();
  const { workspace, setWorkspace, partner, disconnect } = useWorkspace();
  const [open, setOpen] = useState<null | "switcher" | "account">(null);
  const [invite, setInvite] = useState(false);
  const initial = (name || "You").trim().charAt(0).toUpperCase();
  const shared = workspace === "shared";
  const nav = shared ? SHARED_NAV : PERSONAL_NAV;

  const go = (w: "personal" | "shared") => { setWorkspace(w); setOpen(null); setLocation(w === "shared" ? "/app/shared" : "/app"); };
  const openInvite = () => { setOpen(null); setInvite(true); };
  const signOut = async () => { setOpen(null); try { await supabase.auth.signOut(); } catch { /* ignore */ } setLocation("/"); };

  return (
    <div className="appbar">
      <div className="appbar-in">
        <Link href={shared ? "/app/shared" : "/app"} className="brand">
          <img src="/logo.png" alt="Juniper" />
          Juniper
        </Link>

        {partner.connected && (
          <div className="ws-wrap">
            <button className={`ws-pill ${shared ? "on" : ""}`} onClick={() => setOpen(open === "switcher" ? null : "switcher")} aria-haspopup="true">
              {shared
                ? <><span className="ws-duo"><span className="d1" /><span className="d2" /></span> Shared with {partner.name}</>
                : <><span className="ws-solo">{initial}</span> My finances</>}
              <Caret />
            </button>
            {open === "switcher" && (
              <>
                <div className="pop-scrim" onClick={() => setOpen(null)} />
                <div className="pop ws-menu">
                  <div className="pop-lbl">Workspace</div>
                  <button className={`pop-i ${!shared ? "on" : ""}`} onClick={() => go("personal")}>
                    <span className="ws-solo">{initial}</span>
                    <span><b>My finances</b><small>Just you · private</small></span>
                    {!shared && <span className="ck">✓</span>}
                  </button>
                  <button className={`pop-i ${shared ? "on" : ""}`} onClick={() => go("shared")}>
                    <span className="ws-duo"><span className="d1" /><span className="d2" /></span>
                    <span><b>Shared with {partner.name}</b><small>Goals · joint accounts</small></span>
                    {shared && <span className="ck">✓</span>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <nav className="nav" aria-label="Primary">
          {nav.map((n) => (
            <Link key={n.path} href={n.path} className={isActive(loc, n.path) ? "on" : undefined}>
              <span className="lbl">{n.label}</span>
              {n.count != null && <span className="count">{n.count}</span>}
            </Link>
          ))}
        </nav>

        <span className="spacer" />
        {!shared && <span className="plaid-pill"><span className="dot" />7 linked</span>}
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
                <button className="pop-i flat">Profile</button>
                <button className="pop-i flat">Connections</button>
                <button className="pop-i flat hl" onClick={openInvite}>{partner.connected ? "Manage partner" : "Invite partner"}</button>
                {partner.connected && <button className="pop-i flat" onClick={() => { setOpen(null); disconnect(); }}>Disconnect partner</button>}
                <button className="pop-i flat">Settings</button>
                <div className="pop-sep" />
                <button className="pop-i flat" onClick={signOut}>Sign out</button>
              </div>
            </>
          )}
        </div>
      </div>
      {invite && <InviteModal onClose={() => setInvite(false)} />}
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
