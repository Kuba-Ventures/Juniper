import { useState, useEffect, type CSSProperties } from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";

const sage = "#5C7A65";
const cream = "#FAF7F2";
const ink = "#2A2A2A";
const muted = "#6B6B6B";
const border = "#E8E2D6";
const serif = "'Fraunces', Georgia, serif";
const sans = "'Inter', sans-serif";

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

export default function SignIn() {
  const [, setLocation] = useLocation();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) setLocation("/app");
  }, [session, setLocation]);

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
    setLocation("/app");
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
        Welcome back
      </h1>
      <p style={{ color: muted, fontSize: 14, margin: "0 0 28px" }}>
        Sign in to continue.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300 }}
      >
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          autoComplete="email"
          required
          style={inputStyle()}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          autoComplete="current-password"
          required
          style={inputStyle(!!error)}
        />
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 22, fontSize: 13, color: muted }}>
        New to Juniper?{" "}
        <Link
          href="/auth/sign-up"
          style={{ color: sage, fontWeight: 500, textDecoration: "none" }}
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
