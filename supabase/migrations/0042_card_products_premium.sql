-- Three premium cards: Amex Platinum, Amex Gold, Capital One Venture X.
--
-- Requires 0039 (tier). All three land `featured`. Their benefits are in 0043 and
-- their art in 0044, because on a premium card the benefits ARE the product and
-- deserve to be reviewable on their own.
--
-- ---- THE POINT VALUATION, WHICH IS THE ONLY REAL DECISION HERE -------------
--
-- Capital One miles were already valued in this catalog at 1.0 cent, set on the
-- Venture in 0034. Venture X earns the same currency, so it inherits that number
-- and invents nothing.
--
-- Membership Rewards had no valuation, because until now no MR card was in the
-- catalog (the Blue Cash cards earn cash back). It is set to 1.0 cent, which is
-- Amex's OWN floor: MR redeems at 1 cent per point against a statement credit and
-- for Pay with Points on flights. That is deliberately the conservative number.
-- Transfer partners routinely beat it, and the points-valuation blogs quote closer
-- to 2 cents, but a number Juniper cannot source from the issuer is a number it
-- should not use to tell somebody a card is worth more than the one in their
-- pocket. Understating is the safe direction; it is also the same basis the
-- Capital One row already used.
--
-- ---- WHAT IS NOT RECORDED, AND WHY THESE CARDS LOOK WEAK ------------------
--
-- Every headline rate on the Platinum and the Venture X is booked through a
-- PORTAL, and the category taxonomy cannot say so. There is no c_flights, no
-- c_amex_travel, no c_capital_one_travel:
--
--   Platinum   5x flights booked direct or through Amex Travel (to $500k/yr)
--              5x prepaid hotels through Amex Travel
--   Gold       5x prepaid hotels, 3x flights, 2x prepaid cars, all Amex Travel
--   Venture X  10x hotels and cars, 5x flights and vacation rentals, all through
--              Capital One Travel; 5x Capital One Entertainment
--
-- Recording 5x flights as 5x on c_travel would claim the rate applies to hotels
-- booked direct, where the Platinum earns 1x. So they are omitted, and the
-- Platinum shows as a 1x card whose case is entirely its credits. That is honest
-- and it is also the clearest argument yet for a sub-category: this is now the
-- fourth migration in a row to record the same omission (see 0040, and the
-- rotating-category note in ROADMAP).
--
-- The Gold is the exception and the reason it is worth adding: 4x at restaurants
-- worldwide and 4x at U.S. supermarkets are genuine whole-category rates, with
-- real caps, and they go in.
--
-- Venture X's 2x on everything is also genuine, so it lands as a base rate rather
-- than being lost.
--
-- Rates and fees read from each issuer's own product page on 2026-09-01, so
-- `verified` is TRUE. Note the Platinum's annual fee is $895, not the $695 still
-- widely quoted: Amex raised it in the 2025 refresh, which is exactly why these
-- are read rather than recalled.
--
-- Pure ASCII; marks via chr(174).

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('amex-platinum', 'American Express', 'American Express',
   'The Platinum Card' || chr(174) || ' from American Express',
   895, '#D0D2D4', 'points', 1.0, 1, 'points',
   'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01', TRUE, 'featured'),

  ('amex-gold', 'American Express', 'American Express',
   'American Express' || chr(174) || ' Gold Card',
   325, '#D2C280', 'points', 1.0, 1, 'points',
   'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01', TRUE, 'featured'),

  ('capital-one-venture-x', 'Capital One', 'Visa',
   'Capital One Venture X Rewards Credit Card',
   395, '#0E3250', 'miles', 1.0, 2, 'miles',
   'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-01', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period,
   note, source_url, as_of)
VALUES
  ('amex-gold', 'c_restaurants_bars', 'Restaurants & bars', 4, 'points', 50000, 'year',
   'Restaurants worldwide, then 1x for the rest of the calendar year.',
   'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01'),
  ('amex-gold', 'c_groceries', 'Groceries', 4, 'points', 25000, 'year',
   'U.S. supermarkets only, then 1x for the rest of the calendar year.',
   'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01')
ON CONFLICT (product_id, category_id) DO NOTHING;

COMMIT;

-- Expect 32 products, 31 featured, 1 listed, and 3 without art until 0044.
SELECT count(*) AS products,
       count(*) FILTER (WHERE tier = 'featured') AS featured,
       count(*) FILTER (WHERE tier = 'listed')   AS listed,
       count(*) FILTER (WHERE art_url IS NULL)   AS without_art
  FROM public.card_products;
