-- Stage 3b of docs/CUSTOM_CATEGORIES.md: a member's own leaf categories.
-- Idempotent, safe to re-run.
--
-- WHAT THIS HOLDS. Only what a member has ADDED or CHANGED, layered over the
-- built-in table in api/_categorize.ts. Not a copy of the taxonomy per account.
-- A member who never touches categories writes no rows here, which is almost
-- all of them, and a built-in we later rename or regroup improves for everybody
-- rather than being frozen at the moment their account was created.
--
-- TWO KINDS OF ROW, told apart by whether `category_id` names a built-in:
--
--   created leaf    category_id = 'c_<uuid>', name set, group_id set
--   renamed builtin category_id = the built-in's own id, name set, group_id NULL
--
-- A renamed built-in keeps its group. Re-parenting a built-in is deliberately
-- NOT possible: moving a leaf into a group of a different kind would silently
-- reclassify the member's whole history (a grocery becoming a transfer stops
-- counting as spending at all) and move their Juniper Score with no visible
-- cause. Creating a leaf inside any group, including Transfers & payments, is
-- the supported way to get a category of a different kind, and it is visible.
--
-- GROUPS ARE BUILT-IN ONLY at this stage. `group_id` must name one of the
-- eleven, which the API enforces; custom groups are stage 5 and carry the
-- colour question with them.
--
-- Client-readable, owner RLS, same pattern as plans (0002) and transactions
-- (0008). No secrets here: this is the member's own vocabulary.

CREATE TABLE IF NOT EXISTS public.categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The id this row describes. Stable across renames, which is the entire
  -- reason stage 1 put ids on the three tables that reference a category.
  category_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  -- The built-in group a CREATED leaf sits in. NULL for a renamed built-in,
  -- which keeps the group it already had.
  group_id     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT categories_name_len CHECK (length(name) <= 40)
);

-- One row per (member, category). An upsert on this key is what makes "rename"
-- and "rename again" the same call.
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_catid_unique
  ON public.categories (user_id, category_id);
CREATE INDEX IF NOT EXISTS categories_user_id_idx ON public.categories (user_id);

-- Two members may both have a "Coffee"; one member may not have two. Case
-- insensitive, because "coffee" and "Coffee" in one picker is a bug report.
-- Enforced here as well as in the API: a label has to resolve to exactly one
-- id, and a duplicate would make `categoryIdOf` ambiguous for the member.
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_unique
  ON public.categories (user_id, lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_select_own ON public.categories;
CREATE POLICY categories_select_own ON public.categories
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS categories_insert_own ON public.categories;
CREATE POLICY categories_insert_own ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS categories_update_own ON public.categories;
CREATE POLICY categories_update_own ON public.categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS categories_delete_own ON public.categories;
CREATE POLICY categories_delete_own ON public.categories
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.categories IS
  'A member''s own leaf categories: created ones, and renames of built-ins. Layered over api/_categorize.ts at read time, never a full copy of it.';
