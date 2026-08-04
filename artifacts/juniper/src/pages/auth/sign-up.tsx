import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { acceptInvite } from "@/lib/invites";
import "@/styles/juniper.css";

const REQUIRED_INVITE_CODE = (import.meta.env.VITE_SIGNUP_INVITE_CODE ?? "") as string;

export default function SignUp() {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const partnerInviteToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("invite");
  }, []);

  // If user is signing up via a partner invite, waive the signup invite code.
  const needsSignupCode = !!REQUIRED_INVITE_CODE && !partnerInviteToken;

  useEffect(() => {
    if (!session) return;
    if (partnerInviteToken) {
      void acceptInvite(partnerInviteToken).then((result) => {
        if (result?.ok) setLocation(`/app/plans/${result.domain}`);
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
    setInfo(null);

    if (needsSignupCode && inviteCode.trim() !== REQUIRED_INVITE_CODE) {
      setError("Invalid invite code.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    const emailRedirectTo =
      typeof window !== "undefined"
        ? partnerInviteToken
          ? `${window.location.origin}/invite/${encodeURIComponent(partnerInviteToken)}`
          : `${window.location.origin}/app`
        : undefined;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: name.trim() || undefined },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      // Session-effect above will handle the redirect, including invite accept.
      return;
    }

    setInfo(
      partnerInviteToken
        ? "Check your email to confirm your account. Your partner invite will accept automatically."
        : "Check your email to confirm your account, then sign in.",
    );
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
          <h1>Create your account</h1>
          <p className="auth-sub">Start building your financial picture.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Preferred name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            autoComplete="new-password"
            required
            className={error ? "err" : undefined}
          />
          {needsSignupCode && (
            <input
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                setError(null);
              }}
              required
              className={error ? "err" : undefined}
            />
          )}
          {error && <p className="auth-msg bad">{error}</p>}
          {info && <p className="auth-msg good">{info}</p>}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-alt">
          Already have an account? <Link href="/auth/sign-in">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
