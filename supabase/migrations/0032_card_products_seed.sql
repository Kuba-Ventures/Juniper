-- Starting card catalog for issue #168. Idempotent, safe to re-run.
--
-- ── READ THIS BEFORE TRUSTING A NUMBER IN HERE ──────────────────────────────
--
-- These rows were assembled from knowledge of each issuer's published terms.
-- NO ISSUER PAGE WAS FETCHED WHILE WRITING THIS FILE. That is exactly what
-- `verified = FALSE` records, it is the default on every row below, and the
-- Credit page prints "not yet re-checked against the issuer's own page" for as
-- long as any card a member holds is unverified.
--
-- Verifying a row means one person opening its `source_url`, reading the terms,
-- and setting `verified = TRUE` with `as_of` moved to that day. Until then the
-- catalog is a useful starting point that says so, which is the same posture as
-- the placeholder `partners.url` values gating monetization in 0010.
--
-- ON CONFLICT DO NOTHING, NOT DO UPDATE, and the difference matters: a re-run
-- must never overwrite a row somebody has verified by hand, or the act of
-- re-applying migrations would silently undo the verification work and reset
-- `as_of` to a date nobody checked. Correcting a seeded row is a later migration
-- that names it, not a re-run of this one.
--
-- ── WHAT WAS DELIBERATELY LEFT OUT ─────────────────────────────────────────
--
-- **Portal-only rates.** Freedom Unlimited earns 5% on travel booked through
-- Chase Travel, and Quicksilver earns 5% on hotels and cars through Capital One
-- Travel. Neither is comparable to the member's own Travel category, because the
-- member's Travel spend is whatever they booked wherever they booked it, and
-- crediting a card 5% on all of it would invent a booking channel they never
-- used. A rate that only applies inside a booking site is not a rate on a
-- category.
--
-- **Rotating categories.** Freedom Flex and Discover it rotate their 5% quarterly
-- and require activation, so there is no fixed category to store. They are
-- seeded with their FIXED rates only, and the rotation appears where it is
-- actually actionable: as a quarterly benefit in the tracker, which is the one
-- perk people most reliably forget.
--
-- **Signup bonuses.** They are one-time, they change constantly, and a member
-- who already holds the card cannot earn one. Including them would inflate every
-- comparison for the one audience this surface has.
--
-- ── ONE KNOWN MODELLING LIMITATION, RECORDED RATHER THAN HIDDEN ─────────────
--
-- Discover it Chrome caps gas and restaurants at $1,000 per quarter COMBINED,
-- and `card_product_earn` caps per row, so two rows each carrying $1,000 will
-- overstate the earn for somebody who spends heavily in both. The `note` on both
-- rows says the cap is combined, so the fine print on screen is right even where
-- the arithmetic is optimistic. A shared-cap column is the fix if a second card
-- needs one; one card did not justify the schema.

-- ── Products ────────────────────────────────────────────────────────────────
INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of)
VALUES
  ('chase-freedom-unlimited', 'Chase', 'Visa', 'Chase Freedom Unlimited®',
   0, '#0E4C8A', 'cash back', NULL, 1.5, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),

  ('chase-freedom-flex', 'Chase', 'Mastercard', 'Chase Freedom Flex®',
   0, '#12559F', 'cash back', NULL, 1, 'percent',
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),

  -- The only points card in the seed, and therefore the only row carrying the
  -- house valuation. 1.25 cents is not plucked from the air: it is the rate
  -- Chase itself publishes for redeeming Sapphire Preferred points through Chase
  -- Travel ("25% more value"), so it is the most defensible floor available for
  -- a card whose points can also be transferred for more. Transfer-partner
  -- redemptions routinely beat it, which means every comparison this drives is
  -- conservative in the member's favour rather than flattering.
  ('chase-sapphire-preferred', 'Chase', 'Visa', 'Chase Sapphire Preferred® Card',
   95, '#1152A0', 'points', 1.25, 1, 'points',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),

  ('capital-one-quicksilver', 'Capital One', 'Mastercard',
   'Capital One Quicksilver Cash Rewards Credit Card',
   0, '#8C8F94', 'cash back', NULL, 1.5, 'percent',
   'https://www.capitalone.com/credit-cards/quicksilver/', '2026-08-31'),

  ('capital-one-savor', 'Capital One', 'Mastercard',
   'Capital One Savor Cash Rewards Credit Card',
   0, '#7A2E3B', 'cash back', NULL, 1, 'percent',
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),

  ('discover-it-cash-back', 'Discover', 'Discover', 'Discover it® Cash Back',
   0, '#4A5560', 'cash back', NULL, 1, 'percent',
   'https://www.discover.com/credit-cards/cash-back/it-card.html', '2026-08-31'),

  ('discover-it-chrome', 'Discover', 'Discover', 'Discover it® Chrome',
   0, '#5B6470', 'cash back', NULL, 1, 'percent',
   'https://www.discover.com/credit-cards/cash-back/chrome-card.html', '2026-08-31'),

  ('amex-blue-cash-preferred', 'American Express', 'American Express',
   'Blue Cash Preferred® Card from American Express',
   95, '#006FCF', 'cash back', NULL, 1, 'percent',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),

  ('citi-double-cash', 'Citi', 'Mastercard', 'Citi Double Cash® Card',
   0, '#003B70', 'cash back', NULL, 2, 'percent',
   'https://www.citi.com/credit-cards/citi-double-cash-credit-card', '2026-08-31'),

  ('wells-fargo-active-cash', 'Wells Fargo', 'Visa', 'Wells Fargo Active Cash® Card',
   0, '#B5121B', 'cash back', NULL, 2, 'percent',
   'https://www.wellsfargo.com/credit-cards/active-cash/', '2026-08-31')
ON CONFLICT (id) DO NOTHING;

-- ── Earn rates ──────────────────────────────────────────────────────────────
--
-- `category_id` values are Juniper taxonomy ids from api/_categorize.ts, and the
-- LEAF is used in every case here rather than the group. That is a decision, not
-- a habit: Sapphire Preferred earns 2x on TRAVEL, and `g_fun_travel` also holds
-- Entertainment and Streaming & music, so storing the group row would have
-- quietly credited the card 2x on cinema tickets it earns 1x on. The group level
-- is the right home for a genuinely group-wide bonus and nothing in this seed is
-- one.
INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, note, source_url, as_of)
VALUES
  -- Chase Freedom Unlimited
  ('chase-freedom-unlimited', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL,
   NULL, 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),
  ('chase-freedom-unlimited', 'c_pharmacy', 'Pharmacy', 3, 'percent', NULL, NULL,
   'Drugstore purchases.', 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),

  -- Chase Freedom Flex. Fixed categories only, see the header on rotation.
  ('chase-freedom-flex', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL,
   NULL, 'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),
  ('chase-freedom-flex', 'c_pharmacy', 'Pharmacy', 3, 'percent', NULL, NULL,
   'Drugstore purchases.', 'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),

  -- Chase Sapphire Preferred
  ('chase-sapphire-preferred', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL,
   NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('chase-sapphire-preferred', 'c_groceries', 'Groceries', 3, 'points', NULL, NULL,
   'Online grocery purchases only. Excludes Target, Walmart and wholesale clubs.',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('chase-sapphire-preferred', 'c_streaming_music', 'Streaming & music', 3, 'points', NULL, NULL,
   'Select streaming services.', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('chase-sapphire-preferred', 'c_travel', 'Travel', 2, 'points', NULL, NULL,
   'Travel booked anywhere. Chase Travel bookings earn more, which this row does not claim.',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),

  -- Capital One Savor
  ('capital-one-savor', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL,
   NULL, 'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('capital-one-savor', 'c_groceries', 'Groceries', 3, 'percent', NULL, NULL,
   'Excludes superstores such as Walmart and Target.',
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('capital-one-savor', 'c_entertainment', 'Entertainment', 3, 'percent', NULL, NULL,
   NULL, 'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('capital-one-savor', 'c_streaming_music', 'Streaming & music', 3, 'percent', NULL, NULL,
   'Popular streaming services.', 'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),

  -- Discover it Chrome. The cap is COMBINED across these two rows, see the
  -- limitation recorded in the header.
  ('discover-it-chrome', 'c_gas', 'Gas', 2, 'percent', 1000, 'quarter',
   'Cap is $1,000 each quarter COMBINED across gas and restaurants, then 1%.',
   'https://www.discover.com/credit-cards/cash-back/chrome-card.html', '2026-08-31'),
  ('discover-it-chrome', 'c_restaurants_bars', 'Restaurants & bars', 2, 'percent', 1000, 'quarter',
   'Cap is $1,000 each quarter COMBINED across gas and restaurants, then 1%.',
   'https://www.discover.com/credit-cards/cash-back/chrome-card.html', '2026-08-31'),

  -- Blue Cash Preferred. The 6% grocery cap is the reason annualEarn() honours
  -- caps at all: $6,000 a year at 6% then 1% above it is a very different number
  -- from 6% on everything, and a heavy grocery shopper crosses it.
  ('amex-blue-cash-preferred', 'c_groceries', 'Groceries', 6, 'percent', 6000, 'year',
   'U.S. supermarkets only. Excludes superstores and warehouse clubs. 1% above the cap.',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),
  ('amex-blue-cash-preferred', 'c_streaming_music', 'Streaming & music', 6, 'percent', NULL, NULL,
   'Select U.S. streaming subscriptions.',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),
  ('amex-blue-cash-preferred', 'c_gas', 'Gas', 3, 'percent', NULL, NULL,
   'U.S. gas stations.', 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),
  ('amex-blue-cash-preferred', 'c_rides_transit', 'Rides & transit', 3, 'percent', NULL, NULL,
   'Transit including rideshare, parking, tolls, trains and buses.',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31')
ON CONFLICT (product_id, category_id) DO NOTHING;

-- ── Benefits ────────────────────────────────────────────────────────────────
--
-- `value_amount` is filled only where the benefit IS a dollar credit. Insurance
-- and access perks are real and worth tracking and have no honest number, so
-- they carry NULL and the summary reports its total as partial rather than
-- assigning them a guess.
--
-- The two `quarter` rows are the point of the tracker. A rotating 5% category
-- has to be activated four times a year, is worth up to $75 a quarter, and is
-- the perk people most reliably forget, which is precisely the thing a checklist
-- is for.
INSERT INTO public.card_product_benefits
  (id, product_id, benefit_group, name, detail, value_amount, period, source_url, as_of)
VALUES
  -- Chase Sapphire Preferred
  ('csp-travel-credit', 'chase-sapphire-preferred', 'Travel',
   '$50 annual hotel credit through Chase Travel',
   'Statement credit against a hotel stay booked through Chase Travel.', 50, 'year',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-rental-cdw', 'chase-sapphire-preferred', 'Travel',
   'Primary auto rental collision damage waiver',
   'Primary rather than secondary, so it pays before your own motor policy. Decline the rental counter''s coverage to use it.',
   NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-trip-cancel', 'chase-sapphire-preferred', 'Travel',
   'Trip cancellation and interruption insurance',
   'Up to $10,000 per person for a trip paid for with the card.', NULL, NULL,
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-trip-delay', 'chase-sapphire-preferred', 'Travel',
   'Trip delay reimbursement',
   'Kicks in after a delay of 12 hours or an overnight.', NULL, NULL,
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-baggage-delay', 'chase-sapphire-preferred', 'Travel',
   'Baggage delay insurance', 'For essentials while your bag catches up.', NULL, NULL,
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-no-fx', 'chase-sapphire-preferred', 'Travel',
   'No foreign transaction fees', 'Worth reaching for this card abroad.', NULL, NULL,
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-anniversary', 'chase-sapphire-preferred', 'Travel',
   '10% anniversary points bonus',
   'A points bonus based on the previous year''s spending, added each account anniversary.', NULL, 'year',
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-purchase-protection', 'chase-sapphire-preferred', 'Shopping',
   'Purchase protection', 'Damage or theft, 120 days, up to $500 per claim.', NULL, NULL,
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),
  ('csp-extended-warranty', 'chase-sapphire-preferred', 'Shopping',
   'Extended warranty protection', 'Adds a year to a manufacturer warranty of three years or less.', NULL, NULL,
   'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred', '2026-08-31'),

  -- Chase Freedom Unlimited
  ('cfu-cell-phone', 'chase-freedom-unlimited', 'Protection',
   'Cell phone protection', 'Pay your phone bill with the card to be covered.', NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),
  ('cfu-trip-cancel', 'chase-freedom-unlimited', 'Travel',
   'Trip cancellation and interruption insurance', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),
  ('cfu-rental-cdw', 'chase-freedom-unlimited', 'Travel',
   'Auto rental collision damage waiver', 'Secondary coverage, so your own policy pays first.', NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),
  ('cfu-purchase-protection', 'chase-freedom-unlimited', 'Shopping',
   'Purchase protection', 'Damage or theft, 120 days, up to $500 per claim.', NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),
  ('cfu-extended-warranty', 'chase-freedom-unlimited', 'Shopping',
   'Extended warranty protection', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited', '2026-08-31'),

  -- Chase Freedom Flex
  ('cff-rotating', 'chase-freedom-flex', 'Shopping',
   'Activate this quarter''s 5% bonus categories',
   'Worth up to $75 a quarter, and it earns nothing at all unless you activate it. Categories change every quarter.',
   NULL, 'quarter', 'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),
  ('cff-cell-phone', 'chase-freedom-flex', 'Protection',
   'Cell phone protection', 'Pay your phone bill with the card to be covered.', NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),
  ('cff-trip-cancel', 'chase-freedom-flex', 'Travel',
   'Trip cancellation and interruption insurance', NULL, NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),
  ('cff-purchase-protection', 'chase-freedom-flex', 'Shopping',
   'Purchase protection', 'Damage or theft, 120 days, up to $500 per claim.', NULL, NULL,
   'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex', '2026-08-31'),

  -- Capital One Quicksilver
  ('coq-no-fx', 'capital-one-quicksilver', 'Travel',
   'No foreign transaction fees', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/quicksilver/', '2026-08-31'),
  ('coq-travel-accident', 'capital-one-quicksilver', 'Travel',
   'Travel accident insurance', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/quicksilver/', '2026-08-31'),
  ('coq-extended-warranty', 'capital-one-quicksilver', 'Shopping',
   'Extended warranty protection', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/quicksilver/', '2026-08-31'),

  -- Capital One Savor
  ('cos-no-fx', 'capital-one-savor', 'Travel',
   'No foreign transaction fees', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('cos-entertainment', 'capital-one-savor', 'Dining',
   'Capital One Entertainment access', 'Presales and card-holder tickets for events and dining.', NULL, NULL,
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),
  ('cos-extended-warranty', 'capital-one-savor', 'Shopping',
   'Extended warranty protection', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savor/', '2026-08-31'),

  -- Discover it Cash Back
  ('dicb-rotating', 'discover-it-cash-back', 'Shopping',
   'Activate this quarter''s 5% bonus categories',
   'Worth up to $75 a quarter, and it earns nothing at all unless you activate it. Categories change every quarter.',
   NULL, 'quarter', 'https://www.discover.com/credit-cards/cash-back/it-card.html', '2026-08-31'),
  ('dicb-no-fx', 'discover-it-cash-back', 'Travel',
   'No foreign transaction fees',
   'Worth knowing that Discover is accepted in far fewer countries than Visa or Mastercard.', NULL, NULL,
   'https://www.discover.com/credit-cards/cash-back/it-card.html', '2026-08-31'),
  ('dicb-fico', 'discover-it-cash-back', 'Protection',
   'Free FICO score',
   'Discover shows a FICO score in its own app. Juniper does not read it and cannot show it here.', NULL, NULL,
   'https://www.discover.com/credit-cards/cash-back/it-card.html', '2026-08-31'),

  -- Discover it Chrome
  ('dich-no-fx', 'discover-it-chrome', 'Travel',
   'No foreign transaction fees',
   'Worth knowing that Discover is accepted in far fewer countries than Visa or Mastercard.', NULL, NULL,
   'https://www.discover.com/credit-cards/cash-back/chrome-card.html', '2026-08-31'),
  ('dich-fico', 'discover-it-chrome', 'Protection',
   'Free FICO score',
   'Discover shows a FICO score in its own app. Juniper does not read it and cannot show it here.', NULL, NULL,
   'https://www.discover.com/credit-cards/cash-back/chrome-card.html', '2026-08-31'),

  -- Blue Cash Preferred. Note there is NO no-foreign-transaction-fee row here,
  -- deliberately: this card charges one, and a tracker that implied otherwise
  -- would cost somebody real money abroad.
  ('bcp-disney', 'amex-blue-cash-preferred', 'Shopping',
   '$7 monthly Disney Bundle credit',
   'Statement credit after spending $9.99 or more on an eligible subscription. Enrolment required.',
   7, 'month', 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),
  ('bcp-rental-cdw', 'amex-blue-cash-preferred', 'Travel',
   'Car rental loss and damage insurance', 'Secondary coverage.', NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),
  ('bcp-global-assist', 'amex-blue-cash-preferred', 'Travel',
   'Global assist hotline', 'Medical and legal referrals more than 100 miles from home.', NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),
  ('bcp-offers', 'amex-blue-cash-preferred', 'Shopping',
   'Amex Offers', 'Targeted statement credits you have to add to the card before spending.', NULL, 'month',
   'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/', '2026-08-31'),

  -- Citi Double Cash
  ('cdc-entertainment', 'citi-double-cash', 'Dining',
   'Citi Entertainment access', 'Presales and card-holder tickets for events.', NULL, NULL,
   'https://www.citi.com/credit-cards/citi-double-cash-credit-card', '2026-08-31'),

  -- Wells Fargo Active Cash
  ('wfac-cell-phone', 'wells-fargo-active-cash', 'Protection',
   'Cell phone protection', 'Pay your phone bill with the card to be covered.', NULL, NULL,
   'https://www.wellsfargo.com/credit-cards/active-cash/', '2026-08-31'),
  ('wfac-rental-cdw', 'wells-fargo-active-cash', 'Travel',
   'Auto rental collision damage waiver', NULL, NULL, NULL,
   'https://www.wellsfargo.com/credit-cards/active-cash/', '2026-08-31')
ON CONFLICT (id) DO NOTHING;
