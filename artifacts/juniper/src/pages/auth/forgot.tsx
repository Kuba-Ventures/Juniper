// /auth/forgot - ask for the reset mail.
//
// Until this page existed a member who forgot their password had no way back
// into their own account: sign-in offered password entry and nothing else, and
// recovery meant someone editing the user by hand in the Supabase dashboard.
//
// The confirmation deliberately does not say whether the address has an account.
// Supabase's own endpoint answers the same way for both, and a page that said
// "no account with that email" would turn the forgot form into a way to test
// whether a given person banks with Juniper.
import { useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import "@/styles/juniper.css";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const address = email.trim().toLowerCase();
    // Built from the current origin, matching sign-up's emailRedirectTo. The
    // Supabase Redirect URLs allow-list covers each origin with a wildcard, so
    // /auth/reset needs no separate entry, but a new origin would.
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setLoading(false);
    // The only errors reachable here are a malformed address and Supabase's
    // own rate limit, neither of which reveals whether the account exists.
    if (error) {
      setError(error.message);
      return;
    }
    setSent(address);
  }

  return (
    <div className="jnpr auth-shell">
      <Link href="/auth/sign-in" className="auth-back">
        <svg viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </Link>

      <div className="auth-card">
        {sent ? (
          <>
            <div className="auth-brand">
              <img src="/logo.png" alt="Juniper" />
              <h1>Check your email</h1>
            </div>
            <div className="auth-sent">
              <div className="tick" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none"><path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <p>
                If an account exists for <strong>{sent}</strong>, a reset link is on its way.
                The link expires in one hour and can be used once.
              </p>
            </div>
            <p className="auth-alt">
              <Link href="/auth/sign-in">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <div className="auth-brand">
              <img src="/logo.png" alt="Juniper" />
              <h1>Forgot your password?</h1>
              <p className="auth-sub">Enter your email and we will send a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                autoFocus
                autoComplete="email"
                required
              />
              {error && <p className="auth-msg bad">{error}</p>}
              <button type="submit" className="btn" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="auth-alt">
              Remembered it? <Link href="/auth/sign-in">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
