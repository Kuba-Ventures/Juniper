import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { acceptInvite } from "@/lib/invites";
import { fetchInviteInfo } from "@/lib/partner";
import { fetchHouseholdInviteInfo } from "@/lib/household";
import { stashPendingHousehold } from "@/lib/profile";
import "@/styles/juniper.css";

const REQUIRED_INVITE_CODE = (import.meta.env.VITE_SIGNUP_INVITE_CODE ?? "") as string;

export default function SignUp() {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Folded in from the first onboarding step (issue #267), which removes a
  // whole screen: anybody arriving via a partner or household invite has
  // already answered this by the fact of the invite, so the picker only shows
  // for a plain sign-up. See stashPendingHousehold below for why this can't be
  // saved right here.
  const [household, setHousehold] = useState<"solo" | "partner" | undefined>();
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
  // Same nicety for a household invite (issue #258): the household's name, so
  // "Join The Barretts on Juniper" lands on a page that says The Barretts.
  const [householdName, setHouseholdName] = useState<string | null>(null);

  const { planInviteToken, partnershipToken, householdToken } = useMemo(() => {
    if (typeof window === "undefined") return { planInviteToken: null, partnershipToken: null, householdToken: null };
    const q = new URLSearchParams(window.location.search);
    return { planInviteToken: q.get("invite"), partnershipToken: q.get("partner"), householdToken: q.get("household") };
  }, []);

  useEffect(() => {
    if (!partnershipToken) return;
    let alive = true;
    void fetchInviteInfo(partnershipToken).then((info) => {
      if (alive) setInviter(info.inviter);
    });
    return () => { alive = false; };
  }, [partnershipToken]);

  useEffect(() => {
    if (!householdToken) return;
    let alive = true;
    void fetchHouseholdInviteInfo(householdToken).then((info) => {
      if (alive) setHouseholdName(info.household);
    });
    return () => { alive = false; };
  }, [householdToken]);

  // Issue #327: a plain solo account (or accepting a single plan invite,
  // `?invite=`) stays open with no code, on the reasoning that one person's
  // own data is the lower-stakes surface. Joining a shared partnership or a
  // household is the higher-stakes one, exposing account and net-worth
  // sharing between more than one person, so it is the one gated while
  // Stage 6 compliance (TOS, privacy policy, security review) is still open.
  // This is the reverse of the previous rule, which waived the code for
  // every invite type on the theory that the invite itself vouched for the
  // signup; the code the invite creator hands over now (see
  // invite-modal.tsx / household-invite-modal.tsx) is what actually vouches
  // for it.
  const needsSignupCode = !!REQUIRED_INVITE_CODE && (!!partnershipToken || !!householdToken);

  useEffect(() => {
    if (!session) return;
    if (partnershipToken) {
      setLocation(`/invite/partner/${encodeURIComponent(partnershipToken)}`);
    } else if (householdToken) {
      setLocation(`/invite/household/${encodeURIComponent(householdToken)}`);
    } else if (planInviteToken) {
      void acceptInvite(planInviteToken).then((result) => {
        if (result?.ok) setLocation(`/app/plans?open=${encodeURIComponent(result.domain)}`);
        else setLocation("/app");
      });
    } else {
      setLocation("/app");
    }
  }, [session, planInviteToken, partnershipToken, householdToken, setLocation]);

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
          : householdToken
            ? `${window.location.origin}/invite/household/${encodeURIComponent(householdToken)}`
            : planInviteToken
              ? `${window.location.origin}/invite/${encodeURIComponent(planInviteToken)}`
              : `${window.location.origin}/app`
        : undefined;

    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
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

    // Stashed by email rather than saved directly: there is no session yet to
    // save it THROUGH (confirmation may still be pending), and onboarding picks
    // it up once one exists. A partner/household invite answers the question
    // by the fact of the invite, regardless of what the (hidden) picker holds.
    const chosenHousehold: "solo" | "partner" | undefined =
      partnershipToken || householdToken ? "partner" : household;
    if (chosenHousehold) stashPendingHousehold(normalizedEmail, chosenHousehold);

    if (data.session) {
      // Session-effect above will handle the redirect, including invite accept.
      return;
    }

    setInfo(
      planInviteToken || partnershipToken || householdToken
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
              : householdToken
                ? householdName
                  ? <>You are joining <b>{householdName}</b> on Juniper.</>
                  : <>You are joining a household on Juniper.</>
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
          {!partnershipToken && !householdToken && (
            <div>
              <p style={{ fontSize: 13, color: "var(--jnpr-ink-3)", margin: "2px 0 8px" }}>
                Who are you planning for?
              </p>
              <div className="ob-seg">
                <button
                  type="button"
                  className={household === "solo" ? "on" : undefined}
                  onClick={() => setHousehold("solo")}
                >
                  Just me<small>Planning on your own</small>
                </button>
                <button
                  type="button"
                  className={household === "partner" ? "on" : undefined}
                  onClick={() => setHousehold("partner")}
                >
                  Me &amp; my partner<small>Planning for two</small>
                </button>
              </div>
            </div>
          )}
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
