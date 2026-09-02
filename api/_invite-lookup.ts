// Who sent a partnership invite, resolved from the invite token alone.
//
// ── WHY THIS IS UNAUTHENTICATED, AND WHY THAT IS NOT A HOLE ────────────────
//
// The person this answer is for has no Juniper account yet. That is the whole
// situation: they were sent a link by somebody who already uses it, and every
// other endpoint on this API requires the session they are about to create. So
// this one is gated on the TOKEN rather than on a session, which is the same
// thing the accept path has always been gated on.
//
// What that is worth spelling out is the blast radius, because "unauthenticated
// endpoint that reads user_profiles with the service-role key" is a sentence
// that should stop a reader:
//
//   - It returns ONE field, the inviter's FIRST name, and nothing else. No
//     email, no surname, no user id, no partnership id, no money.
//   - It answers only for a token that is a PENDING invite. A token that was
//     accepted is nulled out by the accept path (api/partner.ts), so a spent
//     link stops answering.
//   - The token is 32 hex characters from crypto.randomUUID, so it is not
//     guessable and not enumerable, and the shape is checked here before any
//     query is built, so a stored filter can never be assembled out of
//     something that is not a token.
//
// And the disclosure itself is the point rather than a leak: the recipient
// cannot sensibly be asked to join somebody without being told who. It is worth
// knowing that anybody holding the link learns the same first name, including a
// link-preview crawler and everybody in a group chat it was pasted into.

import { adminConfigured, adminRest } from "./_supabase-admin";

/** 32 hex characters, which is what api/partner.ts mints. Checked before a
 *  query is built rather than after, because the token is interpolated into a
 *  PostgREST filter. */
export const INVITE_TOKEN_RE = /^[0-9a-f]{32}$/;

export interface InviteLookup {
  /** True only for a token that is a pending invite right now. */
  pending: boolean;
  /** The inviter's first name, or null when it is unknown (no profile row, or a
   *  profile with no name). Null is a real answer and the copy handles it: the
   *  invitation is still real, it just cannot be signed. */
  inviter: string | null;
}

const NOT_PENDING: InviteLookup = { pending: false, inviter: null };

const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try {
    const r = await adminRest(pathAndQuery);
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

/**
 * Resolve an invite token to the first name of the person who sent it.
 *
 * Never throws and never reports why it failed: every failure, from a malformed
 * token to a missing service-role key, is the same answer to the caller, because
 * distinguishing "no such invite" from "invite already accepted" would turn this
 * into an oracle about other people's partnerships.
 */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!INVITE_TOKEN_RE.test(token) || !adminConfigured()) return NOT_PENDING;

  const parts = await rows<{ inviter_id: string; status: string }>(
    `partnerships?invite_token=eq.${token}&status=eq.pending&select=inviter_id,status&limit=1`,
  );
  const inviterId = parts[0]?.inviter_id;
  if (!inviterId) return NOT_PENDING;

  // The name comes from the inviter's own profile row rather than from
  // `invited_name`, which is the name the inviter typed for the person being
  // invited, and is therefore the wrong end of the relationship. Two different
  // names, one of them already on this table, which is exactly the kind of pair
  // that gets swapped by accident.
  const profs = await rows<{ name: string | null }>(
    `user_profiles?user_id=eq.${inviterId}&select=name&limit=1`,
  );
  return { pending: true, inviter: firstName(profs[0]?.name) || null };
}
