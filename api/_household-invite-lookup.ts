// Who sent a household invite, and to which household, resolved from the
// invite token alone. Mirrors api/_invite-lookup.ts exactly, for the same
// reason: the person asking has no Juniper account yet, so this is gated on
// the token rather than a session.
//
// Same narrowness rules as the partner version:
//   - Returns the household's name and the inviter's chosen name for this
//     invitee, and nothing else. No email, no user id, no household id, no
//     money, no member list.
//   - Answers only for a token that is a PENDING invite right now. Accepted
//     or revoked tokens (api/household.ts) stop answering.
//   - The token is 32 hex characters, checked before any query is built.
//   - Every failure gives the same answer, so this cannot be used as an
//     oracle about whether a given token or household exists.
import { adminConfigured, adminRest } from "./_supabase-admin";

export const INVITE_TOKEN_RE = /^[0-9a-f]{32}$/;

export interface HouseholdInviteLookup {
  pending: boolean;
  /** The household's name, or null when the token isn't pending. */
  household: string | null;
  /** The name the inviter typed for this invitee, or null if they didn't. */
  invitedName: string | null;
}

const NOT_PENDING: HouseholdInviteLookup = { pending: false, household: null, invitedName: null };

async function rows<T>(pathAndQuery: string): Promise<T[]> {
  try {
    const r = await adminRest(pathAndQuery);
    if (!r.ok) return [];
    return (await r.json()) as T[];
  } catch {
    return [];
  }
}

export async function lookupHouseholdInvite(token: string): Promise<HouseholdInviteLookup> {
  if (!INVITE_TOKEN_RE.test(token) || !adminConfigured()) return NOT_PENDING;

  const invites = await rows<{ household_id: string; invited_name: string | null }>(
    `household_invites?invite_token=eq.${token}&status=eq.pending&select=household_id,invited_name&limit=1`,
  );
  const inv = invites[0];
  if (!inv) return NOT_PENDING;

  const households = await rows<{ name: string | null }>(
    `households?id=eq.${inv.household_id}&select=name&limit=1`,
  );
  return { pending: true, household: households[0]?.name || null, invitedName: inv.invited_name || null };
}
