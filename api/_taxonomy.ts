// Resolving a member's taxonomy, which means touching the database.
//
// This is a separate module from _categorize.ts on purpose, and for the reason
// that module's own header gives: it is kept pure and I/O-free so the sync, the
// read endpoints and the score snapshot can all share it. Putting a Supabase
// read inside it would mean every one of those callers, and every future test
// of the classification maths, dragging in the service-role client. Same split
// as _networth-walk.ts beside networth-backfill.ts, and lib/category-color.ts
// beside lib/finances.ts on the client.
//
// So: _categorize.ts owns what a taxonomy IS and how it answers. This owns
// where a member's own rows come from.
import { adminConfigured, adminRest } from "./_supabase-admin";
import {
  BUILTIN_GROUPS, BUILTIN_TAXONOMY, applyMemberCategories, buildTaxonomy,
  type MemberCategoryRow, type Taxonomy,
} from "./_categorize";

// One resolve per request.
//
// A member with no categories of their own gets BUILTIN_TAXONOMY itself, the
// same object every time: no query result to merge, no allocation, and the
// classification path is byte for byte what scripts/check-category-resolver.ts
// proves. That is the case that must never change, and it is the common one.
export async function taxonomyFor(userId: string): Promise<Taxonomy> {
  const rows = await readMemberCategories(userId);
  if (!rows.length) return BUILTIN_TAXONOMY;
  return buildTaxonomy(applyMemberCategories(BUILTIN_GROUPS, rows));
}

// Kept apart from taxonomyFor so the merge above stays pure and testable, and
// so a failure here degrades to the built-ins rather than failing the request.
// That degradation is deliberate and worth being explicit about: a member whose
// categories cannot be read sees the built-in names for one page load, which is
// wrong but harmless, where a 500 on /api/finances is a blank dashboard. Their
// stored rows are untouched either way, because every write path resolves the
// id from the same taxonomy it just read.
async function readMemberCategories(userId: string): Promise<MemberCategoryRow[]> {
  if (!adminConfigured()) return [];
  try {
    const r = await adminRest(
      `categories?user_id=eq.${userId}&select=category_id,name,group_id&order=created_at.asc`,
    );
    if (!r.ok) {
      // Not thrown: a deploy that runs ahead of migration 0025 lands here, and
      // it must degrade rather than take the dashboard down.
      console.error(`[categorize] could not read categories for ${userId} (${r.status})`);
      return [];
    }
    return (await r.json().catch(() => [])) as MemberCategoryRow[];
  } catch {
    return [];
  }
}
