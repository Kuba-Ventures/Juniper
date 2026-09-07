-- Shared caps: some cards cap two bonus categories COMBINED, and
-- card_product_earn caps per row. Issue #289, item 2 (of the ROADMAP wording;
-- "shared caps" in the issue body). Idempotent, safe to re-run.
--
-- Discover it Chrome's own header (migration 0032) already names the gap this
-- closes: gas and restaurants share one $1,000-per-quarter cap, but each row
-- carries its own independent $1,000, so a member spending heavily in both
-- earns the bonus rate on up to $2,000 a quarter rather than the $1,000 the
-- card actually allows, which overstates the card by up to $240 a year (2%
-- bonus vs 1% base on the extra $1,000 across 4 quarters). 0032 called a
-- shared-cap column the fix "if a second card ever needs one"; this is that
-- column, added generically rather than named for Discover alone.
--
-- `cap_group` is nullable and free text (a slug, same convention as every other
-- id in this schema): NULL means "this row's cap, if it has one, is its own",
-- matching every row seeded before this migration. Two rows on the SAME
-- product sharing a non-null `cap_group` are read as one combined cap by
-- api/_rewards.ts's groupCapAdjustedEarn(). It does not need to be unique or
-- reference anything: it is a grouping key scoped to one product, not a table
-- of its own, since the only real-world shape this represents (N categories,
-- one issuer-stated combined cap) has no further structure to normalize.

BEGIN;

ALTER TABLE public.card_product_earn ADD COLUMN IF NOT EXISTS cap_group TEXT;

-- Discover it Chrome's gas and restaurant rows share the $1,000/quarter cap
-- their own `note` already describes in English. Backfilling the group here
-- is a data correction on top of 0032's seed, not an edit to it: 0032 stays
-- ON CONFLICT DO NOTHING and untouched, same convention 0036/0061 follow.
UPDATE public.card_product_earn
  SET cap_group = 'discover-it-chrome-gas-dining'
  WHERE product_id = 'discover-it-chrome'
    AND category_id IN ('c_gas', 'c_restaurants_bars')
    AND cap_group IS NULL;

COMMIT;

-- Expect 2 rows, both cap_group = 'discover-it-chrome-gas-dining'.
SELECT product_id, category_id, cap_amount, cap_period, cap_group
FROM public.card_product_earn
WHERE product_id = 'discover-it-chrome'
ORDER BY category_id;
