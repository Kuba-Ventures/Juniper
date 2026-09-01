-- Eleven more Chase products: every card in their lineup that earns cash back or
-- Ultimate Rewards, plus Slate Edge, which earns nothing.
--
-- Requires 0039 (the tier column). Ten land as `featured`; Slate Edge lands as
-- `listed`, and that one row is the reason 0039 exists.
--
-- ---- WHY THESE ELEVEN, AND NOT THE OTHER THIRTY ----------------------------
--
-- Chase publishes around forty consumer and business cards. The line drawn here
-- is not popularity, it is whether adding the card requires INVENTING A NUMBER.
--
-- These eleven earn cash back or Ultimate Rewards. UR already has a valuation in
-- this catalog -- 1.25 cents, set on the Sapphire Preferred in 0032 -- so nothing
-- new is being guessed at.
--
-- The thirty-odd left out are co-brands: United, Southwest, Marriott, IHG, Hyatt,
-- Disney, Avios, Aeroplan. Each earns its OWN loyalty currency, and 0031's
-- points-need-a-valuation CHECK would require a cents-per-point for every one of
-- them. Those valuations are contested, they would be invented here, and they
-- would then drive the dollar figures in "cards that would beat yours". A
-- co-brand is better added one at a time, when a member actually holds it and the
-- valuation is a real decision about a real card.
--
-- ---- WHAT WAS DELIBERATELY NOT RECORDED ------------------------------------
--
-- Several of these cards' headline rates are MERCHANT- or PORTAL-LOCKED, and the
-- category taxonomy has no way to say so. There is no c_amazon, no c_doordash, no
-- c_chase_travel_portal. Recording them against the nearest whole category would
-- read as "put all your shopping here at 5 percent" when the 5 percent applies at
-- one merchant, and the guide would then move spend onto a card earning 1 percent
-- on it.
--
-- So they are omitted, and these cards are UNDERSTATED here on purpose:
--
--   8x Chase Travel                Sapphire Reserve, Reserve for Business
--   5% Chase Travel                Ink Business Premier, Instacart
--   5% / 3% at Amazon              Prime Visa, Amazon Visa
--   4% DoorDash and Caviar         DoorDash Rewards
--   5% Instacart (first $6,000)    Instacart
--   2.5% on purchases over $5,000  Ink Business Premier
--   3x shipping and advertising    Ink Business Preferred
--
-- Understating is the safe direction: it can cost a member a better option, it
-- cannot send them to a worse one. The same trade already applies to the rotating
-- 5% on Freedom Flex and Discover it (see ROADMAP). A merchant-scoped category is
-- the real fix for all of them at once.
--
-- Also NOT in this migration: BENEFITS. The Sapphire Reserve's case for a $795 fee
-- is almost entirely its credits and lounge access, and with no rows in
-- card_product_benefit it will show a large fee against modest rates. That is
-- visibly incomplete rather than wrong, and it is called out in ROADMAP rather
-- than half-entered here.
--
-- ---- PROVENANCE ------------------------------------------------------------
--
-- Every rate below was read from the issuer's own product page -- the formal
-- "You'll earn N points for each $1 spent..." rewards-program text, not the
-- comparison-page summary, which omits caps and exclusions. `verified` is
-- therefore TRUE on these eleven, which is what that column is for and what the
-- existing eighteen still need.
--
-- Time-limited promotions were excluded: the Lyft and Peloton multipliers on the
-- Sapphire and Ink pages expire in 2027 and are not rates.
--
-- Pure ASCII. Registered and service marks are built with chr(174) and chr(8480),
-- for the reason 0036 exists.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('chase-sapphire-reserve', 'Chase', 'Visa',
   'Chase Sapphire Reserve' || chr(174),
   795, '#101315', 'points', 1.25, 1, 'points',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01', TRUE, 'featured'),

  ('chase-sapphire-reserve-business', 'Chase', 'Visa',
   'Sapphire Reserve for Business' || chr(8480) || ' Credit Card',
   795, '#111D3E', 'points', 1.25, 1, 'points',
   'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01', TRUE, 'featured'),

  ('chase-ink-business-unlimited', 'Chase', 'Visa',
   'Ink Business Unlimited' || chr(174) || ' Credit Card',
   0, '#464B51', 'cash back', NULL, 1.5, 'percent',
   'https://creditcards.chase.com/business-credit-cards/ink/unlimited', '2026-09-01', TRUE, 'featured'),

  ('chase-ink-business-cash', 'Chase', 'Visa',
   'Ink Business Cash' || chr(174) || ' Credit Card',
   0, '#696E76', 'cash back', NULL, 1, 'percent',
   'https://creditcards.chase.com/business-credit-cards/ink/cash', '2026-09-01', TRUE, 'featured'),

  ('chase-ink-business-preferred', 'Chase', 'Visa',
   'Ink Business Preferred' || chr(174) || ' Credit Card',
   95, '#0B1937', 'points', 1.25, 1, 'points',
   'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01', TRUE, 'featured'),

  ('chase-ink-business-premier', 'Chase', 'Visa',
   'Ink Business Premier' || chr(174) || ' Credit Card',
   195, '#010C24', 'cash back', NULL, 2, 'percent',
   'https://creditcards.chase.com/business-credit-cards/ink/premier', '2026-09-01', TRUE, 'featured'),

  ('chase-amazon-visa', 'Chase', 'Visa',
   'Amazon Visa',
   0, '#C6C6C6', 'cash back', NULL, 1, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-01', TRUE, 'featured'),

  ('chase-prime-visa', 'Chase', 'Visa',
   'Prime Visa',
   0, '#0C1D36', 'cash back', NULL, 1, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-01', TRUE, 'featured'),

  ('chase-doordash', 'Chase', 'Mastercard',
   'DoorDash Rewards Mastercard' || chr(174),
   0, '#CCCFCA', 'cash back', NULL, 1, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/doordash', '2026-09-01', TRUE, 'featured'),

  ('chase-instacart', 'Chase', 'Mastercard',
   'Instacart Mastercard' || chr(174),
   0, '#09311D', 'cash back', NULL, 1, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/instacart', '2026-09-01', TRUE, 'featured'),

  -- The row 0039 was built for. Slate Edge is a real card a member can hold and
  -- it has NO rewards programme at all. As `featured` it would need a
  -- base_multiplier, and the NOT NULL default of 1 would have had it claim 1
  -- percent on everything -- a number with no source, presented exactly like the
  -- sourced ones. `listed` says what is true: Juniper can name this card and has
  -- no rates for it, because there are none.
  ('chase-slate-edge', 'Chase', 'Visa',
   'Slate Edge' || chr(174) || ' Credit Card',
   0, '#347F9C', 'cash back', NULL, NULL, 'percent',
   'https://creditcards.chase.com/credit-building-credit-cards/slate/edge', '2026-09-01', TRUE, 'listed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period,
   note, source_url, as_of)
VALUES
  -- Sapphire Reserve. The 8x is Chase Travel only and is omitted; 4x on flights
  -- and hotels booked direct is the rate that applies to travel spend generally.
  ('chase-sapphire-reserve', 'c_travel', 'Travel', 4, 'points', NULL, NULL,
   'Flights and hotels booked direct. Chase Travel bookings earn 8x, which Juniper does not yet model.',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),
  ('chase-sapphire-reserve', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL,
   'Includes takeout and eligible delivery.',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('chase-sapphire-reserve-business', 'c_travel', 'Travel', 4, 'points', NULL, NULL,
   'Flights and hotels booked direct. Chase Travel bookings earn 8x, which Juniper does not yet model.',
   'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  -- Ink Business Cash. Both tiers share one $25,000 combined annual cap, and the
  -- schema has no way to say "combined", so each row carries the cap and the note
  -- says they share it. Overstating the cap would be the alternative.
  ('chase-ink-business-cash', 'c_phone_internet', 'Phone & internet', 5, 'percent', 25000, 'year',
   'Also office supply stores. Shares one 25,000 dollar combined annual cap with the 2 percent categories.',
   'https://creditcards.chase.com/business-credit-cards/ink/cash', '2026-09-01'),
  ('chase-ink-business-cash', 'c_gas', 'Gas', 2, 'percent', 25000, 'year',
   'Shares one 25,000 dollar combined annual cap with the other bonus categories.',
   'https://creditcards.chase.com/business-credit-cards/ink/cash', '2026-09-01'),
  ('chase-ink-business-cash', 'c_restaurants_bars', 'Restaurants & bars', 2, 'percent', 25000, 'year',
   'Shares one 25,000 dollar combined annual cap with the other bonus categories.',
   'https://creditcards.chase.com/business-credit-cards/ink/cash', '2026-09-01'),

  ('chase-ink-business-preferred', 'c_travel', 'Travel', 3, 'points', 150000, 'year',
   'Shares one 150,000 dollar combined annual cap with the other 3x categories.',
   'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),
  ('chase-ink-business-preferred', 'c_phone_internet', 'Phone & internet', 3, 'points', 150000, 'year',
   'Also shipping, and advertising with social media sites and search engines. Shares one 150,000 dollar combined annual cap.',
   'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  -- Amazon and Prime Visas. The 3 percent / 5 percent at Amazon is merchant-locked
  -- and omitted; the 2 percent categories below apply generally.
  ('chase-amazon-visa', 'c_gas', 'Gas', 2, 'percent', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-01'),
  ('chase-amazon-visa', 'c_rides_transit', 'Rides & transit', 2, 'percent', NULL, NULL,
   'Local transit and commuting, including rideshare.',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-01'),
  ('chase-amazon-visa', 'c_restaurants_bars', 'Restaurants & bars', 2, 'percent', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-rewards', '2026-09-01'),

  ('chase-prime-visa', 'c_gas', 'Gas', 2, 'percent', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-01'),
  ('chase-prime-visa', 'c_rides_transit', 'Rides & transit', 2, 'percent', NULL, NULL,
   'Local transit and commuting, including rideshare.',
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-01'),
  ('chase-prime-visa', 'c_restaurants_bars', 'Restaurants & bars', 2, 'percent', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards', '2026-09-01'),

  -- DoorDash. The 4 percent is DoorDash and Caviar only and is omitted; 3 percent
  -- on dining purchased directly from a restaurant is the general rate.
  ('chase-doordash', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL,
   'Dining purchased directly from a restaurant. DoorDash and Caviar orders earn 4 percent, which Juniper does not yet model.',
   'https://creditcards.chase.com/cash-back-credit-cards/doordash', '2026-09-01'),
  ('chase-doordash', 'c_groceries', 'Groceries', 2, 'percent', NULL, NULL,
   'Grocery stores, online or in store.',
   'https://creditcards.chase.com/cash-back-credit-cards/doordash', '2026-09-01'),

  -- Instacart. Both 5 percent rates are locked to Instacart or Chase Travel and
  -- are omitted.
  ('chase-instacart', 'c_restaurants_bars', 'Restaurants & bars', 2, 'percent', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/instacart', '2026-09-01'),
  ('chase-instacart', 'c_gas', 'Gas', 2, 'percent', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/instacart', '2026-09-01'),
  ('chase-instacart', 'c_streaming_music', 'Streaming & music', 2, 'percent', NULL, NULL,
   'Select streaming services.',
   'https://creditcards.chase.com/cash-back-credit-cards/instacart', '2026-09-01')
ON CONFLICT (product_id, category_id) DO NOTHING;

COMMIT;

-- Expect: 29 products, 28 featured and 1 listed; the listed row is the only one
-- with no base rate; and no listed row carries an earn row.
SELECT
  (SELECT count(*) FROM public.card_products)                                    AS products,
  (SELECT count(*) FROM public.card_products WHERE tier = 'featured')            AS featured,
  (SELECT count(*) FROM public.card_products WHERE tier = 'listed')              AS listed,
  (SELECT count(*) FROM public.card_products
    WHERE tier = 'featured' AND base_multiplier IS NULL)                         AS featured_missing_rate,
  (SELECT count(*) FROM public.card_product_earn e
     JOIN public.card_products p ON p.id = e.product_id
    WHERE p.tier = 'listed')                                                     AS listed_with_earn_rows,
  (SELECT count(*) FROM public.card_products WHERE art_url IS NULL)              AS without_art;
