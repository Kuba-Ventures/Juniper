import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { acceptInvite } from "@/lib/invites";
import { fetchInviteInfo } from "@/lib/partner";
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
  const [showPassword, setShowPassword] = useState(false);

  // Two separate invite systems land here. ?invite= is a plan invite, accepted
  // inline below. ?partner= is a partnership invite, handed back to
  // /invite/partner/:token once there is a session, so that page stays the one
  // place that accepts a partnership and reports why one was refused.
  // Who invited them, when they arrived on a partnership link (#172). The thread
  // has to survive the step it is most likely to break at: "Join Finley on
  // Juniper" landing on a page that says nothing about Finley is the moment
  // somebody wonders whether they are in the right place. Nicety, never a
  // dependency: null renders the page exactly as it was.
  const [inviter, setInviter] = useState<string | null>(null);

  const { planInviteToken, partnershipToken } = useMemo(() => {
    if (typeof window === "undefined") return { planInviteToken: null, partnershipToken: null };
    const q = new URLSearchParams(window.location.search);
    return { planInviteToken: q.get("invite"), partnershipToken: q.get("partner") };
  }, []);

  useEffect(() => {
    if (!partnershipToken) return;
    let alive = true;
    void fetchInviteInfo(partnershipToken).then((info) => {
      if (alive) setInviter(info.inviter);
    });
    return () => { alive = false; };
  }, [partnershipToken]);

  // Someone arriving on an invite of either kind was vouched for by the member
  // who invited them, so the private-preview code is waived for them.
  const needsSignupCode = !!REQUIRED_INVITE_CODE && !planInviteToken && !partnershipToken;

  useEffect(() => {
    if (!session) return;
    if (partnershipToken) {
      setLocation(`/invite/partner/${encodeURIComponent(partnershipToken)}`);
    } else if (planInviteToken) {
      void acceptInvite(planInviteToken).then((result) => {
        if (result?.ok) setLocation(`/app/plans?open=${encodeURIComponent(result.domain)}`);
        else setLocation("/app");
      });
    } else {
      setLocation("/app");
    }
  }, [session, planInviteToken, partnershipToken, setLocation]);

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

    // Confirming by email lands on a fresh page load with no React state, so the
    // invite has to be carried in the URL the mail points at.
    const emailRedirectTo =
      typeof window !== "undefined"
        ? partnershipToken
          ? `${window.location.origin}/invite/partner/${encodeURIComponent(partnershipToken)}`
          : planInviteToken
            ? `${window.location.origin}/invite/${encodeURIComponent(planInviteToken)}`
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
      planInviteToken || partnershipToken
        ? "Check your email to confirm your account. Your invite will accept automatically."
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
          <p className="auth-sub">
            {partnershipToken
              ? inviter
                ? <>You are joining <b>{inviter}</b> on Juniper.</>
                : <>You are joining someone on Juniper.</>
              : <>Start building your financial picture.</>}
          </p>
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
          <div className="auth-pw">
            <input
              type={showPassword ? "text" : "password"}
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
