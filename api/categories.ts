// /api/categories, the member's own leaf categories (Stage 3b of
// docs/CUSTOM_CATEGORIES.md).
//
//   GET                                  -> the member's whole resolved taxonomy
//   POST   { name, group }               -> create a leaf in that built-in group
//   PATCH  { categoryId, name }          -> rename a leaf, built-in or their own
//   PATCH  { categoryId, hidden: bool }  -> stop offering it, or offer it again
//   DELETE ?categoryId=c_...             -> remove a leaf they created
//
// Groups are built-in only at this stage: a member can add and rename leaves,
// not groups. Custom groups are stage 5 and carry the colour question, because
// GROUP_COLOR maps eleven fixed labels onto seven palette tokens and a twelfth
// wedge has no slot that stays legible beside the others.
//
// TWO RULES THIS ENDPOINT EXISTS TO ENFORCE, both about not moving money
// silently:
//
//   A leaf cannot be re-parented. Moving one into a group of a different kind
//   would reclassify the member's whole history (a grocery becoming a transfer
//   stops counting as spending at all) and move their Juniper Score with no
//   visible cause. Creating a leaf inside any group, Transfers included, is the
//   supported and visible way to get a category of another kind.
//
//   A leaf in use cannot be deleted. Deleting it would leave every row pointing
//   at an id nothing resolves, so those charges would fall into "Everything
//   else" and quietly leave whatever budget was on them. The refusal names the
//   count.
//
// HIDING IS THE ANSWER TO "get this out of my way", and it has no such refusal,
// because it takes nothing away: a hidden category leaves the picker and keeps
// resolving, so history, groups and budgets are untouched. It is also the only
// version that survives the sync, which maps Plaid's categories onto built-in
// labels and does not know what a member has hidden.
import { verifySupabaseJwt, extractBearerToken } from "./_supabase-jwt";
import { readEnv } from "./_env";
import { adminConfigured, adminRest } from "./_supabase-admin";
import { taxonomyFor } from "./_taxonomy";
import { BUILTIN_GROUPS } from "./_categorize";

export const config = { runtime: "edge" };

const SUPABASE_URL = readEnv("SUPABASE_URL");
const SUPABASE_JWT_SECRET = readEnv("SUPABASE_JWT_SECRET");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

const MAX_NAME = 40;
// Enough to write "Kids' clothes" and "Bike & repairs", not enough to smuggle
// markup into a label the client renders.
const NAME_OK = /^[\p{L}\p{N} '&+.\/-]+$/u;
const CATEGORY_ID = /^[a-z0-9_]{3,64}$/;

const BUILTIN_GROUP_IDS = new Set(BUILTIN_GROUPS.map((g) => g.id));
const BUILTIN_LEAF_IDS = new Set(BUILTIN_GROUPS.flatMap((g) => g.leaves.map((l) => l.id)));

const norm = (s: unknown) => String(s ?? "").trim();
const enc = encodeURIComponent;

/** The taxonomy as the member sees it, with the provenance the UI needs to know
 *  what it may offer: rename anything, delete only what they created. */
async function list(uid: string): Promise<Response> {
  const tax = await taxonomyFor(uid);
  return json({
    groups: tax.groups.map((g) => ({
      id: g.id,
      label: g.label,
      emoji: g.emoji,
      kind: g.kind,
      categories: g.leaves.map((l) => ({
        id: l.id,
        label: l.label,
        emoji: l.emoji,
        // `custom` decides whether Delete is offered at all, so it is answered
        // here from the built-in table rather than guessed from the id's shape.
        custom: !BUILTIN_LEAF_IDS.has(l.id),
        hidden: false,
      })),
      // Sent, not omitted: the member needs to see what they have hidden in
      // order to unhide it, and a hidden category the UI never mentions is
      // indistinguishable from one that was deleted.
      hidden: (g.hidden ?? []).map((l) => ({
        id: l.id,
        label: l.label,
        emoji: l.emoji,
        custom: !BUILTIN_LEAF_IDS.has(l.id),
        hidden: true,
      })),
    })),
  });
}

/** A name must be unique within the member's own vocabulary, case-insensitively,
 *  because a label has to resolve to exactly one id. The database has the same
 *  unique index; this exists to answer with a sentence rather than a 409. */
async function nameTaken(uid: string, name: string, exceptId?: string): Promise<boolean> {
  const tax = await taxonomyFor(uid);
  const wanted = name.toLowerCase();
  for (const g of tax.groups) {
    if (g.label.toLowerCase() === wanted) return true;
    for (const l of g.leaves) {
      if (l.id === exceptId) continue;
      if (l.label.toLowerCase() === wanted) return true;
    }
  }
  return false;
}

async function create(uid: string, body: Record<string, unknown>): Promise<Response> {
  const name = norm(body.name);
  const group = norm(body.group);
  if (!name || name.length > MAX_NAME) return json({ error: `A name is required, up to ${MAX_NAME} characters` }, 400);
  if (!NAME_OK.test(name)) return json({ error: "A name can use letters, numbers, spaces and ' & + . / -" }, 400);
  if (!BUILTIN_GROUP_IDS.has(group)) return json({ error: "Unknown group" }, 400);
  if (await nameTaken(uid, name)) return json({ error: `You already have a category called "${name}"` }, 409);

  // `c_` keeps the convention every leaf id follows, and the random half cannot
  // collide with a slug derived from a built-in label.
  const categoryId = `c_${crypto.randomUUID().replace(/-/g, "")}`;
  const r = await adminRest("categories", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: uid, category_id: categoryId, name, group_id: group }),
  });
  if (!r.ok) {
    console.error(`[categories] create failed (${r.status}): ${await r.text().catch(() => "")}`);
    return json({ error: "Could not save that category" }, 500);
  }
  return json({ id: categoryId, label: name, group, custom: true }, 201);
}

/** One PATCH covers renaming and hiding, because both are the same row: an
 *  override of a category, keyed by (user, category_id). Sending only `hidden`
 *  leaves any existing name alone, and sending only `name` leaves the hidden
 *  state alone, so a member who renamed a category can hide it later without
 *  losing the name. */
async function update(uid: string, body: Record<string, unknown>): Promise<Response> {
  const categoryId = norm(body.categoryId);
  const wantsName = body.name !== undefined;
  const wantsHidden = body.hidden !== undefined;
  const name = norm(body.name);
  const hidden = body.hidden === true;
  if (!CATEGORY_ID.test(categoryId)) return json({ error: "Invalid `categoryId`" }, 400);
  if (!wantsName && !wantsHidden) return json({ error: "Nothing to change" }, 400);
  if (wantsName) {
    if (!name || name.length > MAX_NAME) return json({ error: `A name is required, up to ${MAX_NAME} characters` }, 400);
    if (!NAME_OK.test(name)) return json({ error: "A name can use letters, numbers, spaces and ' & + . / -" }, 400);
  }
  // Groups can be neither renamed nor hidden yet, and a request to do either is
  // a bug in the caller rather than something to half-apply.
  if (BUILTIN_GROUP_IDS.has(categoryId)) return json({ error: "Groups cannot be changed yet" }, 400);

  const tax = await taxonomyFor(uid);
  // Hidden categories count as known here: unhiding one is a request about a
  // category the member can no longer see in the offered list.
  const known = tax.groups.some((g) =>
    g.leaves.some((l) => l.id === categoryId) || (g.hidden ?? []).some((l) => l.id === categoryId));
  if (!known) return json({ error: "Unknown category" }, 404);
  if (wantsName && await nameTaken(uid, name, categoryId)) {
    return json({ error: `You already have a category called "${name}"` }, 409);
  }

  // The row as it stands, so a partial change does not blank the other half.
  // A merge-duplicates upsert replaces the WHOLE row, so anything not restated
  // here would be lost: hiding a renamed category would drop the rename.
  const existing = await adminRest(
    `categories?user_id=eq.${uid}&category_id=eq.${enc(categoryId)}&select=group_id,name,archived&limit=1`,
  );
  const prior = existing.ok
    ? ((await existing.json().catch(() => [])) as { group_id: string | null; name: string | null; archived: boolean }[])[0]
    : undefined;

  const nextName = wantsName ? name : prior?.name ?? null;
  const nextHidden = wantsHidden ? hidden : prior?.archived ?? false;

  // A row that neither renames nor hides says nothing, so it is deleted rather
  // than stored. Unhiding a built-in nobody renamed therefore leaves no trace,
  // which is what makes "unhide" the true inverse of "hide".
  if (!nextName && !nextHidden) {
    const d = await adminRest(`categories?user_id=eq.${uid}&category_id=eq.${enc(categoryId)}`, { method: "DELETE" });
    if (!d.ok) {
      console.error(`[categories] clearing override failed (${d.status}): ${await d.text().catch(() => "")}`);
      return json({ error: "Could not save that change" }, 500);
    }
    return json({ id: categoryId, label: null, hidden: false });
  }

  // Upsert on (user_id, category_id), so changing a built-in for the first time
  // and changing it again are the same call. `group_id` is carried through
  // rather than recomputed: for a built-in it stays null (it keeps the group it
  // already has, and re-parenting is not on offer), and for a created category
  // it is the group it was created in.
  const r = await adminRest("categories?on_conflict=user_id,category_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: uid,
      category_id: categoryId,
      name: nextName,
      group_id: prior?.group_id ?? null,
      archived: nextHidden,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    console.error(`[categories] update failed (${r.status}): ${await r.text().catch(() => "")}`);
    return json({ error: "Could not save that change" }, 500);
  }
  return json({ id: categoryId, label: nextName, hidden: nextHidden });
}

async function remove(uid: string, url: URL): Promise<Response> {
  const categoryId = norm(url.searchParams.get("categoryId"));
  if (!CATEGORY_ID.test(categoryId)) return json({ error: "Invalid `categoryId`" }, 400);
  if (BUILTIN_LEAF_IDS.has(categoryId) || BUILTIN_GROUP_IDS.has(categoryId)) {
    return json({ error: "Built-in categories cannot be deleted" }, 400);
  }

  // In use means the id is still on a row. Counted before deleting, because
  // afterwards those rows would point at an id nothing resolves and their
  // charges would fall into "Everything else" without anybody being told.
  const used = await adminRest(
    `transactions?user_id=eq.${uid}&category_id=eq.${enc(categoryId)}&select=id&limit=1`,
    { headers: { Prefer: "count=exact" } },
  );
  if (used.ok) {
    const count = Number((used.headers.get("content-range") || "").split("/")[1] || 0);
    if (count > 0) {
      return json({
        error: `${count} transaction${count === 1 ? "" : "s"} still use this category. Move them first.`,
        inUse: count,
      }, 409);
    }
  }
  const budgeted = await adminRest(
    `budgets?user_id=eq.${uid}&category_id=eq.${enc(categoryId)}&select=id&limit=1`,
  );
  if (budgeted.ok && ((await budgeted.json().catch(() => [])) as unknown[]).length) {
    return json({ error: "A budget still uses this category. Remove the budget first." }, 409);
  }

  const r = await adminRest(`categories?user_id=eq.${uid}&category_id=eq.${enc(categoryId)}`, { method: "DELETE" });
  if (!r.ok) {
    console.error(`[categories] delete failed (${r.status}): ${await r.text().catch(() => "")}`);
    return json({ error: "Could not delete that category" }, 500);
  }
  return json({ ok: true });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!SUPABASE_URL || !adminConfigured()) return json({ error: "Not configured" }, 503);

  const token = extractBearerToken(req);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const payload = await verifySupabaseJwt(token, { supabaseUrl: SUPABASE_URL, legacySecret: SUPABASE_JWT_SECRET });
  if (!payload?.sub) return json({ error: "Unauthorized" }, 401);
  const uid = payload.sub;

  if (req.method === "GET") return list(uid);
  if (req.method === "DELETE") return remove(uid, new URL(req.url));
  if (req.method === "POST" || req.method === "PATCH") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return req.method === "POST" ? create(uid, body) : update(uid, body);
  }
  return json({ error: "Method not allowed" }, 405);
}
