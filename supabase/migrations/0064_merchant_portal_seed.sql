-- Seed data for the merchant-scoped gap 0040/0042 named and left open: Prime
-- Visa, Amazon Visa, DoorDash, Instacart get real merchant-scoped earn rows;
-- Sapphire Reserve (personal and business), Ink Business Premier, Instacart's
-- Chase Travel rate, Amex Platinum and Capital One Venture X get their
-- portal-scoped (or taxonomy-blocked) rates recorded as benefits instead,
-- since nothing here can compute them. Issue #289, item 2. Idempotent, ON
-- CONFLICT DO NOTHING throughout, same convention every seed since 0032
-- follows: a re-run must never overwrite a row somebody has verified by hand.
--
-- Rates read from each card's own rewards-program page on 2026-09-07 (cross-
-- checked against secondary sources where noted); `verified` on `card_products`
-- is untouched by this migration (all eight products already ship TRUE from
-- 0040/0042). These are NEW rows on already-verified products, seeded the same
-- way the rest of the catalog was: `as_of` says when they were read, and they
-- carry the same provenance a human can re-check.
--
-- ---- ONE THING THIS MIGRATION DOES NOT CLAIM --------------------------------
--
-- `merchant_key` is matched EXACTLY against Plaid's own `merchant_name` field,
-- the same convention `_category-precedence.ts`'s merchant rules already use
-- and for the same reason: guessing at variants is how a rule ends up filing
-- the wrong charge. 'amazon', 'whole foods', 'doordash' and 'instacart' are
-- chosen as Plaid's typical cleaned merchant name for each, based on how
-- Plaid's enrichment commonly resolves these merchants, but that has NOT been
-- checked against a real transaction from a real linked account, because this
-- migration is written with no database and no Plaid session to check it
-- against. If a member's real Amazon charge shows a different merchant_name,
-- these rows silently never match, which is the ordinary failure mode of an
-- exact-match rule and not a new one this migration introduces. Worth a real
-- production check the next time somebody holding one of these four cards
-- links their account, the same kind of follow-up ROADMAP already tracks for
-- "verify the ten seeded products" and "set a limit and confirm the queue".
--
-- ---- WHAT IS STILL LEFT OUT, ON PURPOSE --------------------------------------
--
-- Ink Business Premier's 2.5 percent on any single purchase over $5,000 is
-- neither merchant- nor portal-scoped, it is TRANSACTION-SIZE-scoped, a third
-- shape this issue did not ask for and this migration does not build. Still an
-- open gap, recorded here rather than silently dropped.
--
-- Audible.com is part of Prime Visa and Amazon Visa's real "5%/3% at Amazon"
-- language but is left out: a distinct merchant from Amazon.com in Plaid's own
-- data, low volume against the two included, and audiobooks fit no existing
-- taxonomy leaf cleanly (not quite Streaming & music, not quite Shopping).
--
-- Caviar is DoorDash's own sibling brand under the same 4 percent rate and is
-- included below even though real-world Caviar volume is now close to zero
-- (DoorDash absorbed most of Caviar's markets years ago); the card's own terms
-- still name it, so the row costs nothing to include and matches nothing extra
-- by construction if no such merchant ever appears.

BEGIN;

-- ---- Merchant-scoped earn rows ------------------------------------------------
INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period,
   note, source_url, as_of, merchant_key)
VALUES
  -- Prime Visa: 5% at Amazon.com and Whole Foods (assumes an eligible Prime
  -- membership, which Juniper does not verify and holding this specific card
  -- makes a reasonable assumption).
  ('chase-prime-visa', 'c_shopping', 'Shopping', 5, 'percent', NULL, NULL,
   'Amazon.com purchases. Assumes an eligible Prime membership.',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-07',
   'amazon'),
  ('chase-prime-visa', 'c_groceries', 'Groceries', 5, 'percent', NULL, NULL,
   'Whole Foods Market purchases. Assumes an eligible Prime membership.',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-07',
   'whole foods'),

  -- Amazon Visa: the same two merchants at 3%, no Prime membership required.
  ('chase-amazon-visa', 'c_shopping', 'Shopping', 3, 'percent', NULL, NULL,
   'Amazon.com purchases.',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-07',
   'amazon'),
  ('chase-amazon-visa', 'c_groceries', 'Groceries', 3, 'percent', NULL, NULL,
   'Whole Foods Market purchases.',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-07',
   'whole foods'),

  -- DoorDash card: 4% on DoorDash and Caviar orders specifically, distinct from
  -- the card's own plain 3% Restaurants row already in 0040 for dining bought
  -- direct. Same category_id, distinct merchant_key, exactly what the widened
  -- unique index in 0063 exists for.
  ('chase-doordash', 'c_restaurants_bars', 'Restaurants & bars', 4, 'percent', NULL, NULL,
   'DoorDash orders. Distinct from this card''s 3% on dining bought directly from a restaurant.',
   'https://creditcards.chase.com/cash-back-credit-cards/doordash', '2026-09-07',
   'doordash'),
  ('chase-doordash', 'c_restaurants_bars', 'Restaurants & bars', 4, 'percent', NULL, NULL,
   'Caviar orders, DoorDash''s sibling brand, named in the card''s own terms.',
   'https://creditcards.chase.com/cash-back-credit-cards/doordash', '2026-09-07',
   'caviar'),

  -- Instacart card: 5% on Instacart purchases, first $6,000/year, then 1%.
  -- Restaurant orders placed through Instacart-powered-by-Uber-Eats do not
  -- qualify per the issuer's own terms; noted rather than modeled, since Plaid
  -- has no way to tell those charges apart from an ordinary Instacart grocery
  -- order by merchant name alone.
  ('chase-instacart', 'c_groceries', 'Groceries', 5, 'percent', 6000, 'year',
   'Instacart.com or app purchases, including memberships. 1% above the cap. Restaurant orders via Instacart powered by Uber Eats do not qualify, which this row cannot distinguish by merchant name alone.',
   'https://creditcards.chase.com/cash-back-credit-cards/instacart', '2026-09-07',
   'instacart')
ON CONFLICT (product_id, category_id, COALESCE(merchant_key, '')) DO NOTHING;

-- ---- Portal-scoped (or taxonomy-blocked) rates, as benefits ------------------
--
-- Every row below is real, sourced, and cannot be computed into a dollar
-- total: `value_amount` and `period` are NULL throughout, the same shape "no
-- foreign transaction fees" already uses for a real perk with no number to
-- sum. Juniper's rewards guide and switch/upgrade ideas never read these rows
-- (they live in card_product_benefits, not card_product_earn), so nothing
-- here can be double-counted into a figure api/_rewards.ts produces.
INSERT INTO public.card_product_benefits
  (id, product_id, benefit_group, name, detail, value_amount, period, source_url, as_of)
VALUES
  ('cpv-chase-travel', 'chase-prime-visa', 'Travel',
   '5% cash back on Chase Travel bookings',
   'Not reflected in Juniper''s rewards guide or totals: Juniper cannot tell whether a travel charge was booked through the portal or directly.',
   NULL, NULL, 'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-07'),
  ('cav-chase-travel', 'chase-amazon-visa', 'Travel',
   '3% cash back on Chase Travel bookings',
   'Not reflected in Juniper''s rewards guide or totals: Juniper cannot tell whether a travel charge was booked through the portal or directly.',
   NULL, NULL, 'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-07'),
  ('cin-chase-travel', 'chase-instacart', 'Travel',
   '5% cash back on Chase Travel bookings',
   'Not reflected in Juniper''s rewards guide or totals: Juniper cannot tell whether a travel charge was booked through the portal or directly.',
   NULL, NULL, 'https://creditcards.chase.com/cash-back-credit-cards/instacart', '2026-09-07'),

  ('csr-chase-travel-8x', 'chase-sapphire-reserve', 'Travel',
   '8x points on Chase Travel bookings',
   'The card''s single largest rate. Not reflected in Juniper''s rewards guide or totals, which show this card''s 4x direct-booking rate instead: Juniper cannot tell whether a travel charge was booked through the portal or directly.',
   NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-07'),
  ('csrb-chase-travel-8x', 'chase-sapphire-reserve-business', 'Travel',
   '8x points on Chase Travel bookings',
   'The card''s single largest rate. Not reflected in Juniper''s rewards guide or totals, which show this card''s 4x direct-booking rate instead: Juniper cannot tell whether a travel charge was booked through the portal or directly.',
   NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-07'),

  ('ibp-chase-travel', 'chase-ink-business-premier', 'Travel',
   '5% cash back on Chase Travel bookings',
   'Not reflected in Juniper''s rewards guide or totals: Juniper cannot tell whether a travel charge was booked through the portal or directly. This card also earns 2.5% on any single purchase over $5,000, a transaction-size-based rate Juniper does not model at all.',
   NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/premier', '2026-09-07'),

  -- Amex Platinum. The flights rate is genuinely broader than a portal (it
  -- applies to any airline, booked direct or through Amex Travel), but
  -- Juniper's taxonomy has no c_flights distinct from c_travel, so it is
  -- exactly as uncomputable here as a true portal rate and recorded the same
  -- way, with the nuance stated rather than glossed over.
  ('apl-flights-5x', 'amex-platinum', 'Travel',
   '5x points on flights, up to $500,000/year',
   'Booked directly with an airline OR through American Express Travel, so this is broader than a portal rate, but not reflected in Juniper''s totals: the taxonomy has no separate flights category, only the general Travel one this card earns 1x on.',
   NULL, NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-07'),
  ('apl-hotels-5x', 'amex-platinum', 'Travel',
   '5x points on prepaid hotels through American Express Travel',
   'Prepaid bookings only, through the portal. Not reflected in Juniper''s totals: Juniper cannot tell whether a hotel charge was a portal prepay or a direct stay.',
   NULL, NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-07'),

  -- Capital One Venture X. All three of the card's premium rates are
  -- exclusively through Capital One Travel or Capital One Entertainment, per
  -- the issuer's own terms, unlike the Platinum's flights above.
  ('cvx-travel-10x', 'capital-one-venture-x', 'Travel',
   '10x miles on hotels and rental cars through Capital One Travel',
   'Portal-exclusive. Not reflected in Juniper''s totals, which show this card''s 2x base rate on travel spend instead.',
   NULL, NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-07'),
  ('cvx-travel-5x', 'capital-one-venture-x', 'Travel',
   '5x miles on flights, vacation rentals and activities through Capital One Travel',
   'Portal-exclusive. Not reflected in Juniper''s totals, which show this card''s 2x base rate on travel spend instead.',
   NULL, NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-07'),
  ('cvx-entertainment-5x', 'capital-one-venture-x', 'Shopping',
   '5x miles at Capital One Entertainment',
   'Capital One''s own ticketing marketplace, not a category Juniper''s transaction data can identify as distinct from ordinary Entertainment spend.',
   NULL, NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-07')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Expect 7 new merchant-scoped earn rows across 4 products, and 11 new
-- benefit rows across 6 products.
SELECT
  (SELECT count(*) FROM public.card_product_earn WHERE merchant_key IS NOT NULL) AS merchant_scoped_earn_rows,
  (SELECT count(DISTINCT product_id) FROM public.card_product_earn WHERE merchant_key IS NOT NULL) AS products_with_merchant_rows,
  (SELECT count(*) FROM public.card_product_benefits WHERE id IN (
     'cpv-chase-travel','cav-chase-travel','cin-chase-travel','csr-chase-travel-8x',
     'csrb-chase-travel-8x','ibp-chase-travel','apl-flights-5x','apl-hotels-5x',
     'cvx-travel-10x','cvx-travel-5x','cvx-entertainment-5x'
  )) AS portal_benefit_rows;
