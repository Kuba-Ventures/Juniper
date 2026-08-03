// Marketplace client helpers (Stage 5). The self-listing submission is the
// supply side: a merchant submits an offer, it lands in the moderation queue.
import { getAccessToken } from "@/lib/supabase";

export interface ListingSubmission {
  name: string;
  category: string;
  url: string;
  contactEmail: string;
  description?: string;
}

export type SubmitResult =
  | { ok: true; status: "pending" }
  | { ok: false; error: string };

// POST the self-listing to /api/partners/submit. Returns a friendly error when
// the user isn't signed in or the backend isn't configured yet.
export async function submitListing(payload: ListingSubmission): Promise<SubmitResult> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "Please sign in to list your service." };
    const res = await fetch("/api/partners/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 503) return { ok: false, error: "Listings aren't open yet — check back soon." };
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error || "Couldn't submit your listing. Please try again." };
    return { ok: true, status: "pending" };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Please try again." };
  }
}
