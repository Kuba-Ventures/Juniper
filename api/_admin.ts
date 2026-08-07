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
