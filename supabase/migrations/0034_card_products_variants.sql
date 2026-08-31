-- More products for the card catalog, so the picker can offer the name actually
-- printed on the card. Idempotent, safe to re-run. Follows #211's production
-- test, where the member's card says "Quicksilver Student" and 0032 could only
-- offer plain "Quicksilver".
--
-- Same provenance posture as 0032, and for the same reasons: `source_url` and
-- `as_of` are required by the schema, `verified` is FALSE on every row because NO
-- ISSUER PAGE WAS FETCHED WHILE WRITING THIS FILE, and `ON CONFLICT DO NOTHING`
-- so a re-run cannot overwrite a row somebody has verified by hand.
--
-- ── STUDENT AND LEGACY NAMES EARN THEIR OWN ROWS ────────────────────────────
--
-- Quicksilver Student earns the same 1.5% as Quicksilver, so no figure on the
-- page would have been wrong. It still matters: this surface exists to name the
-- member's card correctly, and offering them a card that is not the one in their
-- hand is exactly the wrong failure for it. The same goes for SavorOne, which is
-- what Capital One called the card before renaming it Savor, and which is still
-- what is printed on plenty of cards in circulation. A catalog of current
-- marketing names cannot identify cards people actually hold.
--
-- ── THE RULE FOR WHAT DOES NOT GO IN, WHICH IS THE IMPORTANT PART ───────────
--
-- A card whose HEADLINE earning cannot be represented by this schema is left OUT
-- of the catalog entirely, rather than added with only the rates that do fit.
--
-- The reasoning corrects an assumption 0032 made. That migration said excluding a
-- rate "understates rather than flatters", and treated understating as the safe
-- direction. It is not, for a card the member ALREADY HOLDS. `switchIdeas`
-- compares the card they used against the best card they own, so a held card
-- recorded at 1% when it really earns 2% produces advice to move spending OFF it.
-- Understating is safe when deciding whether to recommend a NEW card and unsafe
-- when describing an existing one, and this surface does both.
--
-- So these are deliberately absent, each because its headline is conditional on
-- something `card_product_earn` cannot express:
--
--   * Apple Card. 2% applies when paying with Apple Pay and 1% with the physical
--     card, which is a payment-method condition and not a merchant category.
--   * Bilt Mastercard. Rent earns points only in a month with at least five
--     transactions, which is a behavioural condition.
--   * Citi Custom Cash. 5% applies to the member's own highest-spend eligible
--     category each cycle, which changes month to month.
--   * Bank of America Customized Cash Rewards. 3% in a category the member
--     chooses and can change.
--   * Chase Sapphire Reserve and Amex Gold, for a different reason: their annual
--     fees have moved recently and `upgradeIdeas` subtracts the fee, so a stale
--     figure there is not a cosmetic error, it inverts the recommendation.
--
-- A card that is absent is not a gap the member cannot close: the picker offers
-- "My card is not listed", which is stored as a real answer, and they simply get
-- no rewards claims for it. No claim beats a wrong claim.
--
-- ── A KNOWN LIMITATION THIS MAKES WORSE, NAMED RATHER THAN HIDDEN ───────────
--
-- Rotating-category cards (Freedom Flex, Discover it, and the Student version
-- added here) carry only their FIXED rates, because the rotating 5% changes every
-- quarter and requires activation. During a quarter when a member's rotating
-- category is live, the earning guide will understate that card and may suggest
-- moving spend away from it. The rotation is surfaced as a quarterly benefit in
-- the tracker, which is where it is actionable, and the guide's fine print names
-- the card's fixed rates only. Fixing it properly needs a per-quarter category
-- table that somebody has to maintain four times a year, which is a real
-- commitment rather than a schema change.

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of)
VALUES
  -- The card that prompted this migration.
  ('capital-one-quicksilver-student', 'Capital One', 'Mastercard',
   'Capital One Quicksilver Student Cash Rewards Credit Card',
   0, '#8C8F94', 'cash back', NULL, 1.5, 'percent',
   'https://www.capitalone.com/credit-cards/quicksilver-student/', '2026-08-31'),

  -- What Capital One called Savor before the rename. Still printed on cards in
  -- circulation, so a member holding one cannot find it under the current name.
  ('capital-one-savorone', 'Capital One', 'Mastercard',
   'Capital One SavorOne Cash Rewards Credit Card',
   0, '#7A2E3B', 'cash back', NULL, 1, 'percent',
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),

  -- Miles at one cent, which is what Capital One itself pays for a travel
  -- redemption. Transfer partners beat it, so every comparison this drives is
  -- conservative in the member's favour, the same choice 0032 made for Chase.
  ('capital-one-venture', 'Capital One', 'Visa',
   'Capital One Venture Rewards Credit Card',
   95, '#004977', 'miles', 1.0, 2, 'miles',
   'https://www.capitalone.com/credit-cards/venture/', '2026-08-31'),

  ('discover-it-student-cash-back', 'Discover', 'Discover', 'Discover it® Student Cash Back',
   0, '#4A5560', 'cash back', NULL, 1, 'percent',
   'https://www.discover.com/credit-cards/student-credit-card/it-card.html', '2026-08-31'),

  ('discover-it-miles', 'Discover', 'Discover', 'Discover it® Miles',
   0, '#6B7580', 'miles', 1.0, 1.5, 'miles',
   'https://www.discover.com/credit-cards/travel/miles-card.html', '2026-08-31'),

  ('chase-freedom-rise', 'Chase', 'Visa', 'Chase Freedom Rise®',
   0, '#1560BD', 'cash back', NULL, 1.5, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/rise', '2026-08-31'),

  ('amex-blue-cash-everyday', 'American Express', 'American Express',
   'Blue Cash Everyday® Card from American Express',
   0, '#4B9CD3', 'cash back', NULL, 1, 'percent',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', '2026-08-31'),

  ('wells-fargo-autograph', 'Wells Fargo', 'Visa', 'Wells Fargo Autograph℠ Card',
   0, '#D71E28', 'points', 1.0, 1, 'points',
   'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, note, source_url, as_of)
VALUES
  -- Quicksilver Student and Freedom Rise are flat-rate, so they get no rows at
  -- all: a card with no bonus categories earns its base rate everywhere, which is
  -- exactly right and needs nothing stored.

  -- SavorOne, matching the Savor rows in 0032.
  ('capital-one-savorone', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL,
   NULL, 'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('capital-one-savorone', 'c_groceries', 'Groceries', 3, 'percent', NULL, NULL,
   'Excludes superstores such as Walmart and Target.',
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('capital-one-savorone', 'c_entertainment', 'Entertainment', 3, 'percent', NULL, NULL,
   NULL, 'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('capital-one-savorone', 'c_streaming_music', 'Streaming & music', 3, 'percent', NULL, NULL,
   'Popular streaming services.', 'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),

  -- Blue Cash Everyday. Each 3% category has its OWN annual cap, which is why
  -- three separate capped rows rather than one shared limit: unlike the Discover
  -- Chrome case recorded in 0032, these genuinely do not share.
  ('amex-blue-cash-everyday', 'c_groceries', 'Groceries', 3, 'percent', 6000, 'year',
   'U.S. supermarkets only. Excludes superstores and warehouse clubs. 1% above the cap.',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', '2026-08-31'),
  ('amex-blue-cash-everyday', 'c_gas', 'Gas', 3, 'percent', 6000, 'year',
   'U.S. gas stations. 1% above the cap.',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', '2026-08-31'),
  ('amex-blue-cash-everyday', 'c_shopping', 'Shopping', 3, 'percent', 6000, 'year',
   'U.S. online retail purchases only, so in-store shopping earns the base rate. 1% above the cap.',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', '2026-08-31'),

  -- Wells Fargo Autograph, which is unusually broad for a no-fee card and is the
  -- only seeded product that earns a bonus on a phone bill.
  ('wells-fargo-autograph', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL,
   NULL, 'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31'),
  ('wells-fargo-autograph', 'c_travel', 'Travel', 3, 'points', NULL, NULL,
   NULL, 'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31'),
  ('wells-fargo-autograph', 'c_gas', 'Gas', 3, 'points', NULL, NULL,
   NULL, 'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31'),
  ('wells-fargo-autograph', 'c_rides_transit', 'Rides & transit', 3, 'points', NULL, NULL,
   NULL, 'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31'),
  ('wells-fargo-autograph', 'c_streaming_music', 'Streaming & music', 3, 'points', NULL, NULL,
   'Popular streaming services.', 'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31'),
  ('wells-fargo-autograph', 'c_phone_internet', 'Phone & internet', 3, 'points', NULL, NULL,
   'Phone plans. An internet bill earns the base rate.',
   'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31')
ON CONFLICT (product_id, category_id) DO NOTHING;

INSERT INTO public.card_product_benefits
  (id, product_id, benefit_group, name, detail, value_amount, period, source_url, as_of)
VALUES
  ('coqs-no-fx', 'capital-one-quicksilver-student', 'Travel',
   'No foreign transaction fees', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/quicksilver-student/', '2026-08-31'),

  ('coso-no-fx', 'capital-one-savorone', 'Travel',
   'No foreign transaction fees', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('coso-entertainment', 'capital-one-savorone', 'Dining',
   'Capital One Entertainment access', 'Presales and card-holder tickets.', NULL, NULL,
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),

  ('cov-no-fx', 'capital-one-venture', 'Travel',
   'No foreign transaction fees', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/venture/', '2026-08-31'),
  ('cov-precheck', 'capital-one-venture', 'Airport',
   'Global Entry or TSA PreCheck application credit',
   'A statement credit toward one application, once every four years. Juniper tracks this as one-time and will not re-arm it after four years, because it has no four-year period.', 100, 'once',
   'https://www.capitalone.com/credit-cards/venture/', '2026-08-31'),
  ('cov-rental-cdw', 'capital-one-venture', 'Travel',
   'Auto rental collision damage waiver', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/venture/', '2026-08-31'),

  ('dis-rotating', 'discover-it-student-cash-back', 'Shopping',
   'Activate this quarter''s 5% bonus categories',
   'Worth up to $75 a quarter, and it earns nothing at all unless you activate it. Categories change every quarter.',
   NULL, 'quarter', 'https://www.discover.com/credit-cards/student-credit-card/it-card.html', '2026-08-31'),
  ('dis-no-fx', 'discover-it-student-cash-back', 'Travel',
   'No foreign transaction fees',
   'Worth knowing that Discover is accepted in far fewer countries than Visa or Mastercard.', NULL, NULL,
   'https://www.discover.com/credit-cards/student-credit-card/it-card.html', '2026-08-31'),

  ('dim-no-fx', 'discover-it-miles', 'Travel',
   'No foreign transaction fees',
   'Worth knowing that Discover is accepted in far fewer countries than Visa or Mastercard.', NULL, NULL,
   'https://www.discover.com/credit-cards/travel/miles-card.html', '2026-08-31'),

  ('cfr-purchase-protection', 'chase-freedom-rise', 'Shopping',
   'Purchase protection', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/rise', '2026-08-31'),

  ('bce-offers', 'amex-blue-cash-everyday', 'Shopping',
   'Amex Offers', 'Targeted statement credits you have to add to the card before spending.',
   NULL, 'month', 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', '2026-08-31'),
  ('bce-rental-cdw', 'amex-blue-cash-everyday', 'Travel',
   'Car rental loss and damage insurance', 'Secondary coverage.', NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/', '2026-08-31'),

  ('wfa-no-fx', 'wells-fargo-autograph', 'Travel',
   'No foreign transaction fees', NULL, NULL, NULL,
   'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31'),
  ('wfa-cell-phone', 'wells-fargo-autograph', 'Protection',
   'Cell phone protection', 'Pay your phone bill with the card to be covered.', NULL, NULL,
   'https://www.wellsfargo.com/credit-cards/autograph/', '2026-08-31')
ON CONFLICT (id) DO NOTHING;
