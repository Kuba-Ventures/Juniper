-- A merchant-scoped earn category: card_product_earn can now say "5 percent AT
-- AMAZON" as well as "5 percent on Groceries". Issue #289, item 2 (of the
-- ROADMAP wording; the issue body calls it "a merchant- and portal-scoped earn
-- category"). Idempotent, safe to re-run.
--
-- ── WHY MERCHANT AND NOT PORTAL, HERE ────────────────────────────────────────
--
-- The gap 0040/0042 documented is really two different gaps wearing one name.
-- A merchant-scoped rate ("5% at Amazon.com") is knowable from a transaction:
-- Plaid's `merchant_name` says who was paid, the same field every merchant
-- rule already matches on (api/_category-precedence.ts). A portal-scoped rate
-- ("8x through Chase Travel", "10x through Capital One Travel") is NOT
-- knowable from a transaction: Plaid cannot say whether a hotel was booked
-- through an issuer's travel site or directly with the hotel, so nothing in
-- this schema can compute it, and nothing should pretend to. Portal rates (and
-- Amex Platinum's flights rate, which is genuinely merchant-CATEGORY-scoped --
-- any airline, any booking channel -- but needs a taxonomy split between
-- flights and other travel that does not exist yet) are recorded instead as
-- plain `card_product_benefits` rows in migration 0064, exactly the way "no
-- foreign transaction fees" already is: real, worth knowing, not summable, not
-- computed. That needs no schema change at all.
--
-- So this migration is narrower than the issue's own title: it builds the
-- MERCHANT half only, because that half is the one Juniper can actually
-- compute, and the portal half needs no new column.
--
-- ── THE COLUMN ───────────────────────────────────────────────────────────────
--
-- `merchant_key` is nullable free text, lowercased, the same normalization
-- `_category-precedence.ts`'s `merchantKey()` already applies to a merchant
-- rule: trimmed and space-collapsed, nothing cleverer. That function's own
-- header explains why nothing cleverer: stripping store numbers or processor
-- prefixes is exactly the kind of guess that catches a merchant nobody named,
-- and a rate that fires on the wrong charge is worse than one that misses.
--
-- A merchant-scoped row's `category_id` is still required and still means
-- something: it is the category this merchant's spend would otherwise fall
-- under (Amazon purchases are Shopping, Whole Foods purchases are Groceries),
-- which is what lets a card with NO merchant deal still be compared fairly on
-- that spend, at its ordinary category rate, rather than being scored zero.
--
-- ── WHY THE UNIQUE INDEX WIDENS ──────────────────────────────────────────────
--
-- The existing (product_id, category_id) index assumed one rate per category
-- per card, true until now: DoorDash's card already has a plain 3 percent
-- Restaurants row, and its merchant-scoped 4 percent DoorDash-orders row shares
-- that same category_id on purpose (an ordinary restaurant charge should still
-- earn the card's normal 3 percent). COALESCE folds a null merchant_key to ''
-- so the old one-row-per-category rule still holds for every row that has no
-- merchant_key at all.

BEGIN;

ALTER TABLE public.card_product_earn ADD COLUMN IF NOT EXISTS merchant_key TEXT;

ALTER TABLE public.card_product_earn
  ADD CONSTRAINT card_product_earn_merchant_key_not_blank
  CHECK (merchant_key IS NULL OR length(btrim(merchant_key)) > 0);

DROP INDEX IF EXISTS card_product_earn_product_category_unique;
CREATE UNIQUE INDEX card_product_earn_product_category_unique
  ON public.card_product_earn (product_id, category_id, COALESCE(merchant_key, ''));

COMMIT;

-- Expect 0 rows: nothing seeded before this migration has a merchant_key, and
-- the widened index must still refuse a true duplicate (same product, category
-- AND merchant_key, or the same product/category with no merchant_key at all).
SELECT product_id, category_id, merchant_key, count(*)
FROM public.card_product_earn
GROUP BY product_id, category_id, merchant_key
HAVING count(*) > 1;
