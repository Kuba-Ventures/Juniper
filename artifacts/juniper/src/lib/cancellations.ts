// Client for /api/cancellation-requests: a member's own queue of "please
// cancel this for me" requests. There is no partner API behind this yet, so a
// request is processed by a human (api/admin/cancellation-requests.ts); this
// module only ever creates one and reads the caller's own.
import { getAccessToken } from "@/lib/supabase";

export type CancellationStatus = "requested" | "contacted" | "confirmed" | "failed";

export interface CancellationRequest {
  id: string;
  stream_id: string;
  stream_name: string;
  monthly_at_request: number | null;
  status: CancellationStatus;
  requested_at: string;
  resolved_at: string | null;
}

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getAccessToken();
  if (!token) return null;
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

export async function fetchCancellationRequests(): Promise<CancellationRequest[]> {
  try {
    const res = await authed("/api/cancellation-requests");
    if (!res?.ok) return [];
    const data = (await res.json()) as { requests?: CancellationRequest[] };
    return data.requests ?? [];
  } catch {
    return [];
  }
}

export async function requestCancellation(streamId: string, memberNote?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authed("/api/cancellation-requests", {
      method: "POST",
      body: JSON.stringify({ stream_id: streamId, ...(memberNote ? { member_note: memberNote } : {}) }),
    });
    const data = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res?.ok || !data.ok) return { ok: false, error: data.error || "Couldn't queue the request." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}
