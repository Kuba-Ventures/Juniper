-- Two kinds of card in one catalog: the ones Juniper has researched, and the
-- ones it can merely NAME.
--
-- ---- THE PROBLEM THIS SOLVES -----------------------------------------------
--
-- The catalog has to do two jobs that pull in opposite directions.
--
-- The rewards surface -- the earning guide, "worth switching", "cards that would
-- beat yours" -- needs FEW cards, each with rates good enough to do arithmetic
-- on and put a dollar figure in front of somebody. Every card added there is a
-- card whose rates have to stay right.
--
-- The Identify picker needs MANY cards. Its whole job is to let a member say
-- which card they hold, and a member holding a card the catalog has never heard
-- of hits "My card is not listed" and the surface goes quiet for them. There are
-- on the order of a thousand US consumer credit cards. Featuring a thousand
-- cards is not possible; naming a thousand cards is easy.
--
-- Before this migration the catalog could only express the first job. Adding a
-- card for identification meant adding it to the rewards engine too, and the
-- engine would then compute with whatever was in `base_multiplier` -- which is
-- NOT NULL DEFAULT 1, so an unresearched card would silently claim to earn 1%
-- on everything. That is not a gap in the data, it is a wrong number presented
-- with the same confidence as a right one.
--
-- ---- THE TWO TIERS ---------------------------------------------------------
--
--   featured  Researched. Rates exist and are good enough to compute with. Feeds
--             the earning guide, the switch suggestions, and the upgrade rows.
--             This is every product in the catalog before today.
--
--   listed    Identity only: name, issuer, network, annual fee, art, colour.
--             Appears in the Identify picker so a member can always name their
--             card. NEVER appears in anything rate-driven, because there are no
--             rates. `base_multiplier` is NULL rather than 1, so the absence is
--             representable instead of being a plausible-looking default.
--
-- The invariant a `listed` row carries is "no earn rows". Postgres cannot express
-- that as a CHECK, since it spans two tables, and a trigger for it would be more
-- machinery than the rule is worth. api/card-rewards.ts is the enforcement: it
-- builds the rewards engine's product map from featured rows only, so an earn row
-- on a listed product would be read by nothing. If that ever stops being true,
-- this comment is the thing that was wrong.
--
-- Note `tier` is orthogonal to `status`. `status` says whether the issuer still
-- offers the product; `tier` says how much Juniper knows about it. A discontinued
-- card someone still holds is status=inactive, and its tier is unchanged.
--
-- Idempotent, safe to re-run.

ALTER TABLE public.card_products
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'featured';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_products_tier_check'
  ) THEN
    ALTER TABLE public.card_products
      ADD CONSTRAINT card_products_tier_check CHECK (tier IN ('featured','listed'));
  END IF;
END $$;

-- `base_multiplier` becomes nullable so a listed card can say "no rate known"
-- rather than "1 percent". A featured card must still carry one: the whole point
-- of the tier is that featured rows are safe to compute with.
ALTER TABLE public.card_products ALTER COLUMN base_multiplier DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_products_featured_needs_base'
  ) THEN
    ALTER TABLE public.card_products
      ADD CONSTRAINT card_products_featured_needs_base
        CHECK (tier = 'listed' OR base_multiplier IS NOT NULL);
  END IF;
END $$;

-- The points-need-a-valuation rule from 0031 exists so a displayed RATE always
-- comes with the number that makes it comparable. A listed card displays no rate,
-- so the rule has nothing to protect there -- and enforcing it anyway would mean
-- inventing a cents-per-point for every airline and hotel currency in the country
-- just to name a card in a picker. Relaxed for listed rows only; unchanged, and
-- still the thing standing between a points rate and a meaningless one, for
-- featured rows.
ALTER TABLE public.card_products
  DROP CONSTRAINT IF EXISTS card_products_points_need_value;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_products_points_need_value'
  ) THEN
    ALTER TABLE public.card_products
      ADD CONSTRAINT card_products_points_need_value CHECK (
        tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS card_products_tier_idx ON public.card_products (tier);

-- Every existing row is featured, which the column default already did. This
-- states it so the migration is readable as a whole rather than depending on a
-- default declared forty lines up.
UPDATE public.card_products SET tier = 'featured' WHERE tier IS NULL;

-- Expect: 18 featured, 0 listed, and every featured row carrying a base rate.
SELECT tier,
       count(*)                                        AS products,
       count(*) FILTER (WHERE base_multiplier IS NULL) AS missing_base_rate
  FROM public.card_products
 GROUP BY tier
 ORDER BY tier;
