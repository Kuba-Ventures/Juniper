-- Fixes a rule that could never be saved.
-- Idempotent, safe to re-run.
--
-- 0028 made the uniqueness case-insensitive with an EXPRESSION index, on
-- (user_id, lower(btrim(merchant))). api/merchant-rules.ts then upserted with
-- PostgREST's `on_conflict=user_id,merchant`, and Postgres requires the ON
-- CONFLICT target to match an index on exactly those columns. An index on an
-- expression over a column is not an index on the column, so every insert
-- raised 42P10 and the member saw "Could not save that rule". Found the first
-- time anyone pressed the button in production.
--
-- The fix is to make the normalization a COLUMN rather than an expression, so
-- the thing the index is on is the thing the upsert names. It also puts the key
-- the sync matches on into the row instead of recomputing it on every read, so
-- api/_category-precedence.ts's merchantKey() has exactly one definition that
-- reaches the database.
ALTER TABLE public.merchant_rules ADD COLUMN IF NOT EXISTS merchant_key TEXT;

-- Matches merchantKey() in api/_category-precedence.ts: lowercased, with runs
-- of whitespace collapsed to one space. Deliberately nothing more: stripping
-- store numbers or processor prefixes is the guess that catches a merchant the
-- member never named.
UPDATE public.merchant_rules
   SET merchant_key = regexp_replace(lower(btrim(merchant)), '\s+', ' ', 'g')
 WHERE merchant_key IS NULL;

ALTER TABLE public.merchant_rules ALTER COLUMN merchant_key SET NOT NULL;

-- The expression index goes: it is the one the upsert could not name, and
-- keeping both would let the two definitions of "same merchant" drift.
DROP INDEX IF EXISTS public.merchant_rules_user_merchant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS merchant_rules_user_key_unique
  ON public.merchant_rules (user_id, merchant_key);

COMMENT ON COLUMN public.merchant_rules.merchant_key IS
  'merchant, lowercased and space-collapsed. What a rule matches on, and what the upsert conflicts on. Written by api/merchant-rules.ts via merchantKey().';
COMMENT ON COLUMN public.merchant_rules.merchant IS
  'As Plaid spells it, for showing back to the member. Match on merchant_key.';
