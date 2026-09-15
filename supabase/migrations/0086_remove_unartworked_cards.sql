-- Removes the 15 of this week's 37 new catalog products that never got real
-- issuer art across five passes (0081-0085) and, per Finley's direct
-- decision, are not staying in the catalog as monogram-only rows: the
-- product owner wants every listed card backed by a real face, not a
-- synthesized initials-over-brand-color fallback.
--
-- ---- WHY THESE FIFTEEN AND NOT OTHERS ---------------------------------------
--
-- All fifteen are `tier = 'featured'` rows added this week (0072-0080) that
-- 0081 through 0085 each tried and failed to find real art for, for reasons
-- that fall into three buckets, recorded in full in those five migrations'
-- own headers:
--   * The issuer's page for the card no longer exists at all (three Amex
--     cards: amex-green, amex-everyday-preferred, amex-business-green-rewards;
--     Wells Fargo Business Platinum; Amazon Business Prime Amex; Discover it
--     Business, mid-migration to Capital One post-acquisition).
--   * A real successor product exists but pays a materially different rate
--     (USAA Rewards Amex, Citizens Cash Back Plus), so reassigning the new
--     product's art to the old row's rate would misrepresent both rather than
--     just relabel one.
--   * The issuer has no flat card render anywhere on its site, only lifestyle
--     photography, an abstract non-representative 3D render, or a generic
--     icon (M&T, Navy Federal -- whose only asset has a corner hidden behind
--     an overlapping second card -- SoFi, America First, Suncoast, Wright-Patt,
--     and Fidelity, which blocks the whole page with a hard S3 Access Denied).
--
-- None of the 35 pre-existing baseline products are touched: every id below
-- is one of this week's additions, confirmed by checking each against the
-- 0072-0080 batch migrations before writing this one.
--
-- ---- VERIFIED SAFE TO DELETE ------------------------------------------------
--
-- Checked directly against production before writing this migration: zero
-- `member_cards` rows and zero `manual_accounts` rows reference any of the
-- fifteen ids, so no real member has identified one of these as their own
-- card. The only dependent rows are 15 `card_product_earn` rate rows (one
-- issuer, Golden 1's neighbor USAA Rewards Amex among them, has three),
-- deleted first, below.
--
-- To revert: the eight batch migrations 0072-0080 hold every INSERT this
-- migration's DELETE removes; re-running the relevant VALUES rows from
-- those files (they all use ON CONFLICT DO NOTHING, so they are safe to
-- replay) restores the products, and 0081-0085 restore whichever of them
-- had since gotten real art. This migration's own DELETE cannot be
-- "reverted" by an UPDATE the way the art migrations can, since a DELETE
-- loses the row; replaying the original INSERTs is the actual revert path.
--
-- Pure ASCII.

BEGIN;

DELETE FROM public.card_product_earn
 WHERE product_id IN (
   'amazon-business-prime-amex',
   'america-first-platinum-rewards-visa',
   'amex-business-green-rewards',
   'amex-everyday-preferred',
   'amex-green',
   'citizens-cash-back-plus',
   'discover-it-business',
   'fidelity-rewards-visa-signature',
   'mt-visa-signature',
   'navyfed-cashrewards',
   'sofi-credit-card',
   'suncoast-cashback-plus-visa',
   'usaa-rewards-amex',
   'wells-fargo-business-platinum',
   'wright-patt-platinum-rewards-visa'
 );

DELETE FROM public.card_products
 WHERE id IN (
   'amazon-business-prime-amex',
   'america-first-platinum-rewards-visa',
   'amex-business-green-rewards',
   'amex-everyday-preferred',
   'amex-green',
   'citizens-cash-back-plus',
   'discover-it-business',
   'fidelity-rewards-visa-signature',
   'mt-visa-signature',
   'navyfed-cashrewards',
   'sofi-credit-card',
   'suncoast-cashback-plus-visa',
   'usaa-rewards-amex',
   'wells-fargo-business-platinum',
   'wright-patt-platinum-rewards-visa'
 );

COMMIT;

-- Expect 0: none of the fifteen ids should remain.
SELECT count(*) AS should_be_zero
  FROM public.card_products
 WHERE id IN (
   'amazon-business-prime-amex',
   'america-first-platinum-rewards-visa',
   'amex-business-green-rewards',
   'amex-everyday-preferred',
   'amex-green',
   'citizens-cash-back-plus',
   'discover-it-business',
   'fidelity-rewards-visa-signature',
   'mt-visa-signature',
   'navyfed-cashrewards',
   'sofi-credit-card',
   'suncoast-cashback-plus-visa',
   'usaa-rewards-amex',
   'wells-fargo-business-platinum',
   'wright-patt-platinum-rewards-visa'
 );

-- Expect every remaining row to carry real art.
SELECT count(*) AS total, count(art_url) AS with_art
  FROM public.card_products;
