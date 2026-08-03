import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";

const NAV = [
  { path: "/app", label: "Home" },
  { path: "/app/spending", label: "Spending" },
  { path: "/app/plans", label: "Plans", count: 4 },
  { path: "/app/credit", label: "Credit" },
  { path: "/app/recommended", label: "Recommended" },
];

function isActive(current: string, path: string) {
  if (path === "/app") return current === "/app" || current === "/app/";
  return current === path || current.startsWith(path + "/");
}

export function AppBar({ name }: { name: string }) {
  const [loc] = useLocation();
  const initial = (name || "You").trim().charAt(0).toUpperCase();
  return (
    <div className="appbar">
      <div className="appbar-in">
        <Link href="/app" className="brand">
          <img src="/logo.png" alt="Juniper" />
          Juniper
        </Link>
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => (
            <Link key={n.path} href={n.path} className={isActive(loc, n.path) ? "on" : undefined}>
              <span className="lbl">{n.label}</span>
              {n.count != null && <span className="count">{n.count}</span>}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <span className="plaid-pill"><span className="dot" />7 linked</span>
        <button className="icon-btn" aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.5 21a1.5 1.5 0 003 0" strokeLinecap="round" />
          </svg>
        </button>
        <div className="avatar" aria-label="Account">{initial}</div>
      </div>
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
