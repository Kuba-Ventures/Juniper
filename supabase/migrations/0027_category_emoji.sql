-- Stage 5 of docs/CUSTOM_CATEGORIES.md: a member's own icon for a category.
-- Idempotent, safe to re-run.
--
-- The default icons live in code (api/_categorize.ts), because they are the
-- same for everybody and a default nobody has changed should improve when we
-- improve it. This column holds only the ones a member has CHOSEN, layered over
-- those defaults exactly as `name` is layered over the built-in labels.
--
-- NULL means "use the default", which is the common case and costs no row: a
-- member who never opens the emoji picker writes nothing here.
--
-- No CHECK on the contents beyond a length ceiling. A single emoji is a
-- surprisingly hard thing to express in SQL (ZWJ sequences, variation
-- selectors, regional indicator pairs), and api/categories.ts already validates
-- with Intl.Segmenter, which understands all three. The ceiling is here to stop
-- the column being used as a second name field if that validation is ever
-- bypassed, not to define what an emoji is.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS emoji TEXT;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_emoji_len;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_emoji_len CHECK (emoji IS NULL OR length(emoji) BETWEEN 1 AND 16);

-- A row that renames nothing, hides nothing and sets no icon says nothing, and
-- the API deletes rather than writing one. Restated to include the new column.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_says_something;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_says_something CHECK (name IS NOT NULL OR archived OR emoji IS NOT NULL);

COMMENT ON COLUMN public.categories.emoji IS
  'The member''s chosen icon, or NULL to use the default from api/_categorize.ts.';
