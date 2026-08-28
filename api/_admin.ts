// Admin gating. Admins are an allowlist of emails in the ADMIN_EMAILS env var
// (comma-separated, case-insensitive). Deliberately env-based, not a DB role, so
// there's no in-app way to escalate to admin. Unset ADMIN_EMAILS => no admins
// (deny by default), so the moderation surface is inert until it's configured.
import { readEnv } from "./_env";

export function adminEmails(): string[] {
  return (readEnv("ADMIN_EMAILS") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

// ── Developer tools ─────────────────────────────────────────────────────────
//
// A SEPARATE ROLE FROM ADMIN, sharing its shape. Admin gates the marketplace
// moderation queue, which is about other people's submissions. Developer gates
// the debugging controls in Settings, which only ever act on the caller's OWN
// account: force a sync, restart onboarding, wipe your own plans and profile.
// One person is currently both, and the fallback below reflects that without
// welding the two together, so the day a moderator is not a developer the split
// already exists.
//
// Env-based like adminEmails, and for the same reason: there is no in-app path
// to grant yourself the role. Unset DEVELOPER_EMAILS falls back to ADMIN_EMAILS;
// both unset means nobody, which leaves the controls visible only on a local dev
// build.
//
// Worth being clear about what this gate is and is not. Every endpoint behind
// these controls is already scoped to the caller by their own JWT, so a member
// who called them directly could only ever reset themselves. This hides clutter
// from people who have no use for it; it is not what keeps anyone's data safe.
export function developerEmails(): string[] {
  const own = (readEnv("DEVELOPER_EMAILS") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return own.length ? own : adminEmails();
}

export function isDeveloperEmail(email?: string | null): boolean {
  if (!email) return false;
  return developerEmails().includes(email.trim().toLowerCase());
}
