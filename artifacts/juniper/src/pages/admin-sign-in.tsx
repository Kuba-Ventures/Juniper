// juniperplan.com/admin: its own sign-in AND its own shell, entirely apart
// from the member dashboard. This used to redirect to /app/admin, which
// mounted the moderation queues INSIDE JuniperApp: the full consumer app bar
// (workspace switcher, nav to Overview/Transactions/Plans/Credit/
// Connections, notification bell), FinancesProvider/WorkspaceProvider, and
// even the first-run-onboarding gate a brand new admin account would hit
// before ever reaching it. None of that has anything to do with moderating
// submissions or reading the sign-up roster, and it made the page read as
// "a tab in my dashboard" rather than a tool every admin shares. /app/admin
// is gone; this route is the only way in.
//
// There is still no separate admin credential system: an admin is a member
// whose email is on the ADMIN_EMAILS allowlist, checked server-side once a
// request carries a real session (see api/_admin.ts), so this calls the same
// supabase.auth.signInWithPassword() the member sign-in page does. What's
// different is the door (distinct copy, no "Create an account") and the
// room on the other side of it: a bare header with just the product name and
// a sign-out control, then the Admin page directly, with no member-facing
// chrome and nothing scoped to whichever member happens to be signed in.
// A signed-in non-admin still lands here and sees each queue's own "You
// don't have access" state (admin.tsx), rather than this page duplicating
// that check ahead of time.
import { useState } from "react";
import { Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { Admin } from "@/pages/app/admin";
import "@/styles/juniper.css";

function AdminSignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      setPassword("");
      return;
    }
    // AdminGate's own session watch handles the redirect once this resolves.
  }

  return (
    <div className="jnpr auth-shell">
      <Link href="/" className="auth-back">
        <svg viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </Link>

      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Juniper" />
          <h1>Admin sign-in</h1>
          <p className="auth-sub">For the Juniper team only.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
            required
          />
          <div className="auth-pw">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              autoComplete="current-password"
              required
              className={error ? "err" : undefined}
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff /> : <Eye />}
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <div className="auth-forgot">
            <Link href="/auth/forgot">Forgot password?</Link>
          </div>
          {error && <p className="auth-msg bad">{error}</p>}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// The entire chrome around the Admin page: a product name, the signed-in
// email so an admin can tell which of several team accounts they're on, and
// a sign-out control. Deliberately not AppBar: no nav, no workspace
// switcher, no notification bell, nothing that implies this is a personal
// dashboard rather than a shared tool.
function AdminShell({ email }: { email: string }) {
  return (
    <div className="jnpr" style={{ minHeight: "100dvh" }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "14px 22px", borderBottom: "1px solid var(--jnpr-line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.png" alt="" style={{ width: 24, height: 24 }} />
          <span style={{ fontWeight: 700, color: "var(--jnpr-head)", fontSize: 15 }}>Juniper Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--jnpr-ink-3)" }}>{email}</span>
          <button className="btn ghost sm" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
      <Admin />
    </div>
  );
}

export default function AdminGate() {
  const session = useSession();

  // undefined while use-session's first getSession() call is in flight.
  if (session === undefined) {
    return (
      <div className="jnpr" style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "var(--jnpr-ink-3)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }
  if (session === null) return <AdminSignInForm />;
  return <AdminShell email={session.user.email ?? ""} />;
}
