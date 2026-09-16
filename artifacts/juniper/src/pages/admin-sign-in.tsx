// juniperplan.com/admin's own front door (issue: "admin sign-in should be
// separate from the member dashboard sign-in"). Before this, /admin simply
// redirected to /app/admin, which RequireAuth then bounced, when signed out,
// to the exact same "Welcome back / Sign in to your dashboard" page every
// member sees. There is no separate admin credential system to sign in
// against — admins are members whose email is on the ADMIN_EMAILS allowlist,
// checked server-side once a request carries a real session (see
// api/_admin.ts) — so this deliberately calls the same
// supabase.auth.signInWithPassword() the member sign-in page does. What
// changes is only the door: distinct copy, no "Create an account" (admins
// don't self-register), and a landing spot that is never the consumer app.
//
// Once signed in, this hands off to /app/admin exactly like before: if the
// signed-in email isn't on the allowlist, each queue on that page already
// renders its own "You don't have access" state (see admin.tsx), rather than
// this page trying to duplicate that check ahead of time.
import { useState } from "react";
import { Link, Redirect } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
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
  // Signed in: hand off to the real page, which owns the ADMIN_EMAILS gate
  // and the app shell. Not RequireAuth-wrapped again here since a session
  // already exists.
  return <Redirect to="/app/admin" />;
}
