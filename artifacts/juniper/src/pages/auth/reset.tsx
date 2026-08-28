// /auth/reset - where the emailed link lands, and the new password is set.
//
// The link carries the recovery token in the URL fragment, and the Supabase
// client is created with detectSessionInUrl, so it consumes that fragment and
// establishes a session on load. Two consequences shape this page.
//
// First, the session arrives asynchronously, so a single getSession() on the
// first render can run before the fragment has been read and report no session
// on a perfectly good link. This waits for either answer instead.
//
// Second, a link that has expired or has already been used establishes nothing
// and reports nothing: no error, no event, just silence. Silence cannot be
// distinguished from "not read yet" except by waiting, so the page waits a
// moment and then says plainly that the link is dead, with the way to get
// another one. The alternative is a password form that fails on submit, after
// the member has typed a password they now believe is set.
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "@/styles/juniper.css";

// Long enough for the client to read the fragment and settle, short enough that
// a member holding a dead link is not left watching a spinner.
const DETECT_MS = 3000;

export default function Reset() {
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<"checking" | "ready" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    // A session is the definitive good news and is allowed to arrive at any
    // point: whichever of these sees one first moves the page on.
    const arrive = (ok: boolean) => {
      if (live && ok) setPhase("ready");
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => arrive(!!session));
    void supabase.auth.getSession().then(({ data }) => arrive(!!data.session));
    // The timeout only ever downgrades a page that is still waiting. It must not
    // overwrite a session that has already landed, and a session that lands late
    // on a slow connection still wins afterwards, because telling someone their
    // link is dead while holding a live session for them is the one outcome here
    // with no way back.
    const timer = setTimeout(() => {
      if (live) setPhase((p) => (p === "checking" ? "expired" : p));
    }, DETECT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Same floor as sign-up, checked here as well so the two front doors cannot
    // disagree about what a password has to be.
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    // The recovery link already signed them in, so there is nothing left to do
    // but take them where they were going.
    setLocation("/app");
  }

  return (
    <div className="jnpr auth-shell">
      <Link href="/auth/sign-in" className="auth-back">
        <svg viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </Link>

      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Juniper" />
          <h1>
            {phase === "checking" ? "Checking your link" : phase === "expired" ? "That link has expired" : "Choose a new password"}
          </h1>
          {phase === "ready" && <p className="auth-sub">At least 8 characters.</p>}
        </div>

        {/* The heading is phase-aware rather than fixed, because a card that
            says "Choose a new password" for three seconds and then says the
            link is dead has made a promise it has to take back. */}
        {phase === "checking" && <p className="auth-msg">One moment.</p>}

        {phase === "expired" && (
          <>
            <div className="auth-sent">
              <p>Reset links last one hour and can be used once. Ask for a fresh one and it will work.</p>
            </div>
            <p className="auth-alt">
              <Link href="/auth/forgot">Send a new link</Link>
            </p>
          </>
        )}

        {phase === "ready" && (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-pw">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                autoFocus
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
            {error && <p className="auth-msg bad">{error}</p>}
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Saving…" : "Save and sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
