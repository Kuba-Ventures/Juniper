// Admin client helpers for the self-listing moderation queue (Stage 5).
// The server gates on the ADMIN_EMAILS allowlist; these calls surface a 403 as
// `forbidden` so the page can render a clean "no access" state.
import { getAccessToken } from "@/lib/supabase";

export interface Submission {
  id: string;
  name: string;
  category: string;
  url: string;
  contact_email: string;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
}

export type SubmissionsResult =
  | { ok: true; submissions: Submission[] }
  | { ok: false; forbidden: boolean; error: string };

export async function fetchSubmissions(status: "pending" | "all" = "pending"): Promise<SubmissionsResult> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, forbidden: false, error: "Please sign in." };
    const res = await fetch(`/api/admin/submissions?status=${status}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403) return { ok: false, forbidden: true, error: "You don't have access to moderation." };
    if (!res.ok) return { ok: false, forbidden: false, error: "Couldn't load submissions." };
    const data = (await res.json()) as { submissions?: Submission[] };
    return { ok: true, submissions: data.submissions ?? [] };
  } catch {
    return { ok: false, forbidden: false, error: "Couldn't reach the server." };
  }
}

export async function moderateSubmission(
  id: string,
  action: "approve" | "reject",
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "Please sign in." };
    const res = await fetch("/api/admin/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action, notes }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Action failed." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}
