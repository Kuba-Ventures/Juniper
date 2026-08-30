import { getAccessToken } from "@/lib/supabase";

// Client for /api/categories, the member's own leaf categories.
//
// The picker manages them in place (treatment A), so this module is small on
// purpose: create, rename, delete. Reading the taxonomy is NOT here, because
// the picker already receives it on the transactions first page, and a second
// source for the same list is how two parts of one screen come to disagree
// about what categories exist.
//
// Every call returns an error STRING rather than a boolean, because each of
// these can fail for a reason the member can act on: a name they already used,
// a category still carrying transactions. Swallowing that into `false` would
// leave the picker saying "that did not work" when the server said exactly what
// was wrong.

export type CategoryError = string;

async function authed(input: string, init?: RequestInit): Promise<{ ok: true; data: unknown } | { ok: false; error: CategoryError }> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "You are signed out. Reload and try again." };
    const res = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error || "That did not save. Try again." };
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "That did not save. Try again." };
  }
}

/** Create a leaf inside a built-in group. The group decides the new category's
 *  kind, which is why the caller passes a group id and not a kind. */
export async function createCategory(name: string, group: string) {
  return authed("/api/categories", { method: "POST", body: JSON.stringify({ name, group }) });
}

/** Rename a leaf, built-in or the member's own. The id is unchanged, which is
 *  what keeps every transaction already filed there pointing at it. */
export async function renameCategory(categoryId: string, name: string) {
  return authed("/api/categories", { method: "PATCH", body: JSON.stringify({ categoryId, name }) });
}

/** Stop offering a category, or offer it again. Hiding takes nothing away: the
 *  category keeps resolving, so history, groups and budgets are untouched. It
 *  is the only version of "get this out of my way" that survives the Plaid
 *  sync, which maps Plaid's categories onto built-in labels and knows nothing
 *  about what a member has hidden. */
export async function setCategoryHidden(categoryId: string, hidden: boolean) {
  return authed("/api/categories", { method: "PATCH", body: JSON.stringify({ categoryId, hidden }) });
}

/** Set a category's icon, or pass null to go back to its default. Any single
 *  emoji is allowed, including ones newer than the built-in defaults permit:
 *  those are capped because nobody chose them, while this is the member's own
 *  screen and their own choice. */
export async function setCategoryEmoji(categoryId: string, emoji: string | null) {
  return authed("/api/categories", { method: "PATCH", body: JSON.stringify({ categoryId, emoji }) });
}

/** Delete a leaf the member created. Refused by the server, with a count, while
 *  transactions or a budget still use it. Built-ins cannot be deleted at all:
 *  the Plaid sync maps onto their labels, so a deleted one would come back as a
 *  label nothing resolves. */
export async function deleteCategory(categoryId: string) {
  return authed(`/api/categories?categoryId=${encodeURIComponent(categoryId)}`, { method: "DELETE" });
}
