// Shared helper for the /api/partner* endpoints: find the caller's active
// partnership and identify the two members. All partner tables are server-only,
// so every endpoint calls this to enforce membership before reading/writing.
import { adminRest } from "./_supabase-admin";

export type Partnership = { id: string; inviter_id: string; partner_id: string | null; status: string };

export async function activePartnership(uid: string): Promise<Partnership | null> {
  try {
    const r = await adminRest(
      `partnerships?or=(inviter_id.eq.${uid},partner_id.eq.${uid})&status=eq.active&limit=1&select=id,inviter_id,partner_id,status`,
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as Partnership[];
    return rows[0] ?? null;
  } catch { return null; }
}

export function partnerIdOf(p: Partnership, uid: string): string | null {
  return p.inviter_id === uid ? p.partner_id : p.inviter_id;
}
