-- Stage 4 of docs/CUSTOM_CATEGORIES.md: hiding a category.
-- Idempotent, safe to re-run.
--
-- HIDDEN IS NOT DELETED, and the distinction is the whole point. A hidden
-- category stops being OFFERED: it leaves the picker, so a 46-item list can be
-- cut down to the categories a member actually uses. It keeps RESOLVING: every
-- transaction already filed there still names it, still lands in its group, and
-- still counts toward whatever budget covers it.
--
-- That is not a nicety. api/_categorize.ts maps Plaid's own categories onto
-- built-in labels, so a member who could truly delete "Childcare" would find the
-- next sync writing that label again onto a category nothing resolves, dropping
-- the charge into "Everything else" with nobody told. Hiding is the only version
-- of "get this out of my way" that survives contact with the sync.
--
-- `name` becomes nullable in the same change. A row that only hides a built-in
-- has no new name to give it, and pinning the current label into the row would
-- freeze it: a built-in we improve later would come back under its old name the
-- moment the member unhid it. NULL means "no rename", which is exactly what a
-- hide-only row is.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Drop the NOT NULL and re-state the checks so they tolerate a hide-only row.
-- Both constraints are recreated rather than altered, because a CHECK cannot be
-- modified in place.
ALTER TABLE public.categories ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_not_blank;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_len;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_name_not_blank CHECK (name IS NULL OR length(btrim(name)) > 0);
ALTER TABLE public.categories
  ADD CONSTRAINT categories_name_len CHECK (name IS NULL OR length(name) <= 40);

-- A row that neither renames nor hides is a row that says nothing, and the API
-- deletes rather than writing one. Stated here so the table cannot hold one.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_says_something;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_says_something CHECK (name IS NOT NULL OR archived);

COMMENT ON COLUMN public.categories.archived IS
  'Hidden from the picker, still resolved for history and for anything the Plaid sync produces. Never means deleted.';
COMMENT ON COLUMN public.categories.name IS
  'The member''s name for this category, or NULL when the row only hides it.';
