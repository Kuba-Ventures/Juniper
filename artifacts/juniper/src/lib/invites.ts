import { getAccessToken } from "@/lib/supabase";

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export type InviteInfo = {
  domain: string;
  inviter_first_name: string;
  goal_headline: string | null;
  already_accepted: boolean;
  partner_is_self: boolean;
  inviter_is_self: boolean;
};

export type CreateInviteResult = {
  token: string;
  url: string;
  partner_first_name: string | null;
};

export async function createInvite(
  domain: string,
  partnerFirstName?: string,
): Promise<CreateInviteResult | null> {
  const res = await authedFetch("/api/invites", {
    method: "POST",
    body: JSON.stringify({ action: "create", domain, partner_first_name: partnerFirstName }),
  });
  if (!res.ok) return null;
  return (await res.json()) as CreateInviteResult;
}

export async function fetchInvite(token: string): Promise<InviteInfo | null> {
  const res = await authedFetch(`/api/invites?token=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  return (await res.json()) as InviteInfo;
}

export async function acceptInvite(
  token: string,
): Promise<{ ok: boolean; domain: string } | null> {
  const res = await authedFetch("/api/invites", {
    method: "POST",
    body: JSON.stringify({ action: "accept", token }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { ok: boolean; domain: string };
}
