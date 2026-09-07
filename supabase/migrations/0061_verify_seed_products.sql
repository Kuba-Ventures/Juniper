-- Verify the 10 products 0032 seeded against their own source_url and flip
-- verified to TRUE. Issue #289, item 1. Idempotent, safe to re-run.
--
-- ── WHAT THIS DOES AND DOES NOT CLAIM ───────────────────────────────────────
--
-- 0032's own header said no issuer page was fetched while writing it. This
-- migration is that fetch: every one of the 10 rows below was checked against
-- its stored source_url (or, where that URL no longer resolves, against the
-- card's current official page plus independent corroboration), read on
-- 2026-09-07, and every rate, cap, fee and exclusion 0032 stored still matches
-- what the issuer publishes today. Nothing here changes a rate: this run found
-- no drift, only two dead links (see below). A row whose terms HAD moved would
-- get a follow-up migration correcting the rate, never a silent flip.
--
-- The 8 rows 0034 seeded and everything in 0040/0042 are already `verified`
-- (0040/0042) or out of scope for this pass (0034); this migration only
-- touches the 10 ids `0032` itself inserted.
--
-- ── PER-CARD FINDINGS ────────────────────────────────────────────────────────
--
-- chase-freedom-unlimited: $0 fee, 1.5% base, 3% dining, 3% drugstores. Matches.
--   (5% Chase Travel is portal-scoped and correctly absent, see 0032's header.)
-- chase-freedom-flex: $0 fee, 1% base, 3% dining, 3% drugstores. Matches.
--   (5% Chase Travel and the rotating 5% are both correctly absent.)
-- chase-sapphire-preferred: $95 fee, 1x base, 3x dining, 3x online groceries
--   (exclusions unchanged), 3x select streaming, 2x other travel. Matches.
--   (5x Chase Travel is portal-scoped and correctly absent.)
-- capital-one-quicksilver: $0 fee, 1.5% flat, no bonus categories. Matches.
-- capital-one-savor: $0 fee, 1% base, 3% dining, 3% groceries (superstores
--   excluded), 3% entertainment, 3% streaming. Matches.
-- discover-it-cash-back: $0 fee, 1% base, 5% rotating (correctly absent as a
--   fixed rate, tracked instead as the 'dicb-rotating' benefit). Matches.
-- discover-it-chrome: $0 fee, 1% base, 2% gas and restaurants on $1,000 a
--   quarter COMBINED. Matches, cap language confirmed word for word.
--   Stored source_url (`.../chrome-card.html`) now 404s; the same content
--   lives at `.../chrome-card` with no extension. Corrected below, on the
--   card_products row and both of its card_product_earn rows.
-- amex-blue-cash-preferred: $95 standing fee (a promotional $0 first year is
--   not modeled here, matching how this catalog already treats standing terms
--   over promotions), 6% supermarkets on $6,000/year then 1%, 6% streaming
--   uncapped, 3% gas, 3% transit. Matches. Confirmed via independent
--   corroboration (the issuer's own page renders through client-side
--   JavaScript that this pass's fetch tool could not execute).
-- citi-double-cash: no fee, 1% buy + 1% pay = 2% flat, no bonus categories
--   stored (the extra 3% through Citi Travel is portal-scoped, correctly
--   absent). Matches.
-- wells-fargo-active-cash: $0 fee, 2% flat, no bonus categories. Matches, via
--   Wells Fargo's own credit-card portal (`creditcards.wellsfargo.com`) plus
--   independent corroboration. The stored source_url returned 404 to this
--   pass's automated fetch three different ways (bare, with `-visa`, with a
--   trimmed query string) while resolving fine through a browser-style
--   redirect chain, which reads as anti-scraping protection rather than a
--   dead page. Left unchanged rather than replaced with an uncertain
--   tracking-parameter URL that might rot on its own; worth a human
--   double-check in an actual browser next time this row is touched.
--
-- ── WHY UPDATE, NOT A SEED EDIT ─────────────────────────────────────────────
--
-- 0032 is `ON CONFLICT DO NOTHING` and must stay that way, so correcting or
-- verifying a seeded row is always a later migration that names it, never a
-- re-run of the seed. Same convention 0036 (name repair) and 0043/0046/etc.
-- (new columns) already follow.

BEGIN;

UPDATE public.card_products SET verified = TRUE, as_of = '2026-09-07'
  WHERE id IN (
    'chase-freedom-unlimited',
    'chase-freedom-flex',
    'chase-sapphire-preferred',
    'capital-one-quicksilver',
    'capital-one-savor',
    'discover-it-cash-back',
    'discover-it-chrome',
    'amex-blue-cash-preferred',
    'citi-double-cash',
    'wells-fargo-active-cash'
  )
  AND verified = FALSE;

-- discover-it-chrome's source_url 404s with the .html suffix 0032 stored;
-- the same page now serves with no extension. Corrected on the product and
-- both of its earn rows, `as_of` moved to the day this was confirmed.
UPDATE public.card_products
  SET source_url = 'https://www.discover.com/credit-cards/cash-back/chrome-card',
      as_of = '2026-09-07'
  WHERE id = 'discover-it-chrome'
    AND source_url = 'https://www.discover.com/credit-cards/cash-back/chrome-card.html';

UPDATE public.card_product_earn
  SET source_url = 'https://www.discover.com/credit-cards/cash-back/chrome-card',
      as_of = '2026-09-07'
  WHERE product_id = 'discover-it-chrome'
    AND source_url = 'https://www.discover.com/credit-cards/cash-back/chrome-card.html';

COMMIT;

-- Expect 10 rows, verified true and as_of 2026-09-07 on every one.
SELECT id, verified, as_of, source_url
FROM public.card_products
WHERE id IN (
  'chase-freedom-unlimited','chase-freedom-flex','chase-sapphire-preferred',
  'capital-one-quicksilver','capital-one-savor','discover-it-cash-back',
  'discover-it-chrome','amex-blue-cash-preferred','citi-double-cash',
  'wells-fargo-active-cash'
)
ORDER BY id;
