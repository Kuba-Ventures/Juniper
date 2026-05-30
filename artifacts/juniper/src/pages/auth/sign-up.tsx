import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { acceptInvite } from "@/lib/invites";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

const REQUIRED_INVITE_CODE = (import.meta.env.VITE_SIGNUP_INVITE_CODE ?? "") as string;

const inputStyle = (hasError = false): CSSProperties => ({
  height: 48,
  padding: "0 16px",
  border: `1px solid ${hasError ? "#b94040" : border}`,
  borderRadius: 8,
  background: "#fff",
  fontFamily: sans,
  fontSize: 16,
  color: ink,
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
});

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
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: cream,
        fontFamily: sans,
        padding: "0 24px",
        position: "relative",
      }}
    >
      <Link
        href="/"
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: muted,
          fontFamily: sans,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M10 3L5 8L10 13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </Link>

      <img
        src="/logo.png"
        alt="Juniper"
        style={{ width: 96, height: 96, objectFit: "contain", marginBottom: 18 }}
      />
      <h1
        style={{
          fontFamily: serif,
          fontSize: 22,
          color: sage,
          fontWeight: 500,
          margin: "0 0 4px",
        }}
      >
        Create your account
      </h1>
      <p style={{ color: muted, fontSize: 14, margin: "0 0 28px" }}>Private preview.</p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300 }}
      >
        <input
          type="text"
          placeholder="Preferred name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          style={inputStyle()}
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          style={inputStyle()}
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
          style={inputStyle(!!error)}
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
            style={inputStyle(!!error)}
          />
        )}
        {error && (
          <p
            style={{
              color: "#b94040",
              fontSize: 12,
              textAlign: "center",
              margin: "-2px 0 0",
            }}
          >
            {error}
          </p>
        )}
        {info && (
          <p
            style={{
              color: sage,
              fontSize: 12,
              textAlign: "center",
              margin: "-2px 0 0",
            }}
          >
            {info}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            height: 48,
            background: sage,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontFamily: sans,
            fontSize: 15,
            fontWeight: 500,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ marginTop: 22, fontSize: 13, color: muted }}>
        Already have an account?{" "}
        <Link
          href="/auth/sign-in"
          style={{ color: sage, fontWeight: 500, textDecoration: "none" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
