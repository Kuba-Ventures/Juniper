import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { acceptInvite } from "@/lib/invites";
import "@/styles/juniper.css";

export default function SignIn() {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const partnerInviteToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("invite");
  }, []);

  useEffect(() => {
    if (!session) return;
    if (partnerInviteToken) {
      void acceptInvite(partnerInviteToken).then((result) => {
        if (result?.ok) setLocation(`/app/plans?open=${encodeURIComponent(result.domain)}`);
        else setLocation("/app");
      });
    } else {
      setLocation("/app");
    }
  }, [session, partnerInviteToken, setLocation]);

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
    // Session-effect above handles invite accept + redirect.
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
          <h1>Welcome back</h1>
          <p className="auth-sub">Sign in to your dashboard.</p>
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
          {error && <p className="auth-msg bad">{error}</p>}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-alt">
          New to Juniper? <Link href="/auth/sign-up">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
