-- Benefits for the premium cards: the two Sapphire Reserves, Ink Business
-- Preferred and Premier from 0040, and the Amex Platinum, Amex Gold and Capital
-- One Venture X from 0042.
--
-- Requires 0043 (`expires_on`). 59 rows. Before this the tracker had 50 benefits
-- across the ORIGINAL eighteen products and nothing at all for the seven cards
-- where benefits matter most: an $895 Platinum and a $795 Sapphire Reserve showed
-- a large fee against modest rates, because on a premium card the credits ARE the
-- product and Juniper held none of them.
--
-- Every row read from the issuer's own product page on 2026-09-01.
--
-- ---- TEN OF THESE HAVE AN END DATE ----------------------------------------
--
-- Which is why 0043 came first. Card perks increasingly carry a stated expiry, and
-- the Sapphire Reserve is the extreme case: its DoorDash, StubHub, Apple, Lyft and
-- Peloton credits, plus the select-hotel credit, all stop on a published date, and
-- between them they are a large part of what its fee buys. Recorded without an end
-- date they would have the tracker asking somebody in 2028 to use a StubHub credit
-- that stopped in 2027; left out entirely they understate the card. `expires_on`
-- is what makes recording them honest, and `trackBenefits` drops each one the day
-- after it lapses.
--
-- ---- COVERAGE LIMITS ARE NOT VALUES ---------------------------------------
--
-- 0031 says `value_amount` is "Dollar value where the benefit IS a credit. NULL
-- where it is not a number", and the tracker SUMS it. So cell phone protection,
-- purchase protection and trip delay reimbursement carry NULL rather than their
-- limits: "up to $10,000 per item" is what a claim could pay out, not $10,000 of
-- annual value, and adding it to a total would tell somebody a $95 card returns
-- five figures a year. Caught by rendering the tracker and reading it, which is
-- the only way this class of mistake shows up.
--
-- ---- SEMI-ANNUAL PERIODS --------------------------------------------------
--
-- The period CHECK allows month, quarter, year and once. Several credits reset
-- twice a year: the Platinum hotel credit, the Reserve dining and StubHub credits,
-- the Gold Resy credit, the Reserve for Business ZipRecruiter and gift card
-- credits. Each is recorded at its FULL annual value with `year`, and the detail
-- says it arrives in two halves. A member ticking it off once a year is close
-- enough to right; claiming quarterly would not be.
--
-- The Venture X travel credit and both Reserve travel credits reset on the ACCOUNT
-- ANNIVERSARY rather than the calendar year, which the tracker already warns about
-- in general. Their detail text says so specifically.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_product_benefits
  (id, product_id, benefit_group, name, detail, value_amount, period, expires_on,
   source_url, as_of)
VALUES
  ('csr-travel-credit', 'chase-sapphire-reserve', 'Travel',
   '$300 annual travel credit',
   'Applied to travel purchases each ACCOUNT ANNIVERSARY year, not the calendar year. Purchases that qualify do not earn points.',
   300, 'year', NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-edit-credit', 'chase-sapphire-reserve', 'Travel',
   '$500 credit for stays with The Edit',
   'Statement credit on bookings with The Edit, two-night minimum. Purchases that qualify do not earn points.',
   500, 'year', NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-chase-travel-hotels', 'chase-sapphire-reserve', 'Travel',
   '$250 credit for select Chase Travel hotels',
   'Statement credits on prepaid bookings at select hotels through Chase Travel.',
   250, 'year', '2026-12-31', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-lyft', 'chase-sapphire-reserve', 'Travel',
   '$120 in Lyft credits',
   'Up to $10 in monthly in-app credits to use on rides.',
   10, 'month', '2027-09-30', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-lounge', 'chase-sapphire-reserve', 'Airport',
   'Sapphire Reserve Lounge Network',
   'Sapphire Lounges and Priority Pass lounges worldwide with up to two guests.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-precheck', 'chase-sapphire-reserve', 'Travel',
   'Global Entry, TSA PreCheck or NEXUS fee credit',
   'One statement credit of up to $120 every four years, reimbursing the application fee.',
   120, 'once', NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-dining-credit', 'chase-sapphire-reserve', 'Dining',
   '$300 dining credit',
   'Up to $150 January through June and again July through December at restaurants in the Sapphire Reserve Exclusive Tables collection.',
   300, 'year', NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-dashpass', 'chase-sapphire-reserve', 'Dining',
   '$120 DashPass membership',
   'Complimentary DashPass for 12 months: $0 delivery fees and reduced service fees on eligible DoorDash orders. Activation required.',
   120, 'once', '2027-12-31', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-doordash-promos', 'chase-sapphire-reserve', 'Dining',
   '$300 in DoorDash promos',
   'DashPass members get up to $25 each month: one $5 restaurant promo and two $10 promos for groceries and retail.',
   25, 'month', '2027-12-31', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-stubhub', 'chase-sapphire-reserve', 'Shopping',
   '$300 in StubHub credits',
   'Up to $150 January through June and again July through December for StubHub and viagogo purchases. Activation required.',
   300, 'year', '2027-12-31', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-apple', 'chase-sapphire-reserve', 'Shopping',
   'Apple TV and Apple Music subscriptions',
   'Complimentary subscriptions across all your devices, a value of $288 annually.',
   288, 'year', '2027-06-22', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-peloton', 'chase-sapphire-reserve', 'Shopping',
   '$120 in Peloton credits',
   '$10 in statement credits per month on eligible Peloton memberships. Activation required.',
   10, 'month', '2027-12-31', 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-rental-cdw', 'chase-sapphire-reserve', 'Protection',
   'Primary rental car coverage',
   'Primary, not secondary: reimbursement up to $75,000 for theft and collision damage on most rentals in the U.S. and abroad.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-trip-cancel', 'chase-sapphire-reserve', 'Protection',
   'Trip cancellation and interruption',
   'Up to $10,000 per covered traveler and $20,000 per trip for prepaid, non-refundable travel expenses.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-trip-delay', 'chase-sapphire-reserve', 'Protection',
   'Trip delay reimbursement',
   'Up to $500 per covered traveler for unreimbursed expenses such as meals and lodging.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csr-travel-accident', 'chase-sapphire-reserve', 'Protection',
   'Travel accident insurance',
   'Up to $1,000,000 in accidental death or dismemberment coverage.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-travel-credit', 'chase-sapphire-reserve-business', 'Travel',
   '$300 annual travel credit',
   'Statement credits each anniversary year. Purchases that qualify do not earn points.',
   300, 'year', NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-edit-credit', 'chase-sapphire-reserve-business', 'Travel',
   '$500 credit for stays with The Edit',
   'Two-night minimum. Purchases that qualify do not earn points.',
   500, 'year', NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-chase-travel-hotels', 'chase-sapphire-reserve-business', 'Travel',
   '$250 credit for select Chase Travel hotels',
   'Statement credits on prepaid bookings at select hotels through Chase Travel.',
   250, 'year', '2026-12-31', 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-lyft', 'chase-sapphire-reserve-business', 'Travel',
   '$120 Lyft credit',
   'Up to $10 in monthly in-app credits to use on rides.',
   10, 'month', '2027-09-30', 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-lounge', 'chase-sapphire-reserve-business', 'Airport',
   'Sapphire Reserve Lounge Network',
   'Sapphire Lounges and Priority Pass with up to two guests. NOT available to employee cardmembers, who may enter as guests of the primary cardmember.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-precheck', 'chase-sapphire-reserve-business', 'Travel',
   'Global Entry, TSA PreCheck or NEXUS fee credit',
   'Up to $120 every four years. Not available to employee cardmembers.',
   120, 'once', NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-doordash-promos', 'chase-sapphire-reserve-business', 'Dining',
   'DoorDash promos',
   'Up to $25 each month: one $5 restaurant promo and two $10 promos for groceries and retail.',
   25, 'month', '2027-12-31', 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-google-workspace', 'chase-sapphire-reserve-business', 'Shopping',
   '$200 Google Workspace credit',
   'Annual statement credits on purchases made directly with Google Workspace.',
   200, 'year', NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-ziprecruiter', 'chase-sapphire-reserve-business', 'Shopping',
   '$400 ZipRecruiter credit',
   'Up to $200 in statement credits January through June and up to $200 July through December, on purchases made directly with ZipRecruiter.',
   400, 'year', NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('csrb-giftcard', 'chase-sapphire-reserve-business', 'Shopping',
   '$100 curated gift card credit',
   'Up to $50 January through June and up to $50 July through December on the curated collection at giftcards.com/reservebusiness.',
   100, 'year', NULL, 'https://creditcards.chase.com/business-credit-cards/sapphire/reserve', '2026-09-01'),

  ('inkp-dashpass', 'chase-ink-business-preferred', 'Dining',
   'DashPass membership',
   'Complimentary DashPass: $0 delivery fees and reduced service fees on eligible orders for a minimum of one year, plus up to $10 a month on grocery and retail DoorDash orders once activated.',
   10, 'month', NULL, 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  ('inkp-cell-phone', 'chase-ink-business-preferred', 'Protection',
   'Cell phone protection',
   'Up to $1,000 per claim against covered theft or damage for phones on your monthly bill when you pay it with the card. Maximum three claims in 12 months, $100 deductible each.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  ('inkp-rental-cdw', 'chase-ink-business-preferred', 'Protection',
   'Primary rental car coverage for business rentals',
   'Primary when renting for business purposes: up to $60,000 for theft and collision on most vehicles with an MSRP of $125,000 or less.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  ('inkp-trip-cancel', 'chase-ink-business-preferred', 'Protection',
   'Trip cancellation and interruption',
   'Up to $5,000 per covered traveler and $10,000 per trip for prepaid, non-refundable travel expenses.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  ('inkp-purchase-protection', 'chase-ink-business-preferred', 'Protection',
   'Purchase protection',
   'Eligible new purchases covered against damage or theft up to $10,000 per item.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  ('inkp-extended-warranty', 'chase-ink-business-preferred', 'Protection',
   'Extended warranty protection',
   'Extends the time period of an eligible manufacturer warranty.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/business-preferred', '2026-09-01'),

  ('inkpr-cell-phone', 'chase-ink-business-premier', 'Protection',
   'Cell phone protection',
   'Up to $1,000 per claim. Maximum three claims in 12 months, $100 deductible each.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/premier', '2026-09-01'),

  ('inkpr-rental-cdw', 'chase-ink-business-premier', 'Protection',
   'Primary rental car coverage for business rentals',
   'Primary when renting for business purposes: up to $60,000 on most vehicles with an MSRP of $125,000 or less.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/premier', '2026-09-01'),

  ('inkpr-purchase-protection', 'chase-ink-business-premier', 'Protection',
   'Purchase protection',
   'Eligible new purchases covered for 120 days against damage or theft, up to $10,000 per item.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/premier', '2026-09-01'),

  ('inkpr-extended-warranty', 'chase-ink-business-premier', 'Protection',
   'Extended warranty protection',
   'Extends the time period of an eligible manufacturer warranty.',
   NULL, NULL, NULL, 'https://creditcards.chase.com/business-credit-cards/ink/premier', '2026-09-01'),

  ('amexp-hotel-credit', 'amex-platinum', 'Travel',
   '$600 hotel credit',
   'Statement credits of up to $300 SEMI-ANNUALLY on prepaid Fine Hotels + Resorts or The Hotel Collection bookings through Amex Travel. Tracked yearly because the schema has no semi-annual period.',
   600, 'year', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-airline-fee', 'amex-platinum', 'Travel',
   '$200 airline fee credit',
   'Statement credits per calendar year for incidental fees, such as checked bags, charged by your one selected qualifying airline.',
   200, 'year', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-clear', 'amex-platinum', 'Airport',
   '$219 CLEAR Plus credit',
   'Statement credits per calendar year for an auto-renewing CLEAR Plus membership, excluding taxes and fees.',
   219, 'year', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-uber-cash', 'amex-platinum', 'Travel',
   '$200 Uber Cash',
   '$15 in Uber Cash each month plus a $20 bonus in December. Add the card to your Uber account.',
   200, 'year', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-uber-one', 'amex-platinum', 'Travel',
   '$120 Uber One credit',
   'Statement credits per calendar year after you purchase an auto-renewing Uber One membership with the card.',
   120, 'year', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-precheck', 'amex-platinum', 'Travel',
   'Global Entry or TSA PreCheck credit',
   '$120 every four years after applying for Global Entry, or up to $85 for a five-year TSA PreCheck membership.',
   120, 'once', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-lounge', 'amex-platinum', 'Airport',
   'The Global Lounge Collection',
   'Centurion Lounges, Priority Pass, 10 Delta Sky Club visits when flying an eligible Delta flight, and select partner lounges. Enrollment required.',
   NULL, NULL, NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-fhr', 'amex-platinum', 'Travel',
   'Fine Hotels + Resorts',
   '$100 credit towards eligible on-property charges, room upgrade when available, 4pm check-out. Average total value over $550 per two-night stay.',
   100, NULL, NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-hotel-collection', 'amex-platinum', 'Travel',
   'The Hotel Collection',
   '$100 credit towards eligible charges with every booking of two nights or more through AmexTravel.com.',
   100, NULL, NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-resy', 'amex-platinum', 'Dining',
   '$400 Resy credit',
   'Up to $100 in statement credits each quarter at qualifying U.S. Resy restaurants. Enrollment required.',
   100, 'quarter', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-digital-ent', 'amex-platinum', 'Shopping',
   '$300 digital entertainment credit',
   'Statement credits of up to $25 monthly on eligible purchases at participating partners. Enrollment required.',
   25, 'month', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-lululemon', 'amex-platinum', 'Shopping',
   '$300 lululemon credit',
   'Statement credits of up to $75 quarterly at U.S. lululemon retail stores and lululemon.com, excluding outlets. Enrollment required.',
   75, 'quarter', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexp-walmart-plus', 'amex-platinum', 'Shopping',
   '$155 Walmart+ credit',
   'Statement credit for one auto-renewing monthly Walmart+ membership, up to $12.95 monthly plus applicable tax.',
   12.95, 'month', NULL, 'https://www.americanexpress.com/us/credit-cards/card/platinum/', '2026-09-01'),

  ('amexg-dining-credit', 'amex-gold', 'Dining',
   '$120 dining credit',
   'Up to $10 in statement credits monthly at participating partners including Grubhub, Five Guys and Wonder. Enrollment required.',
   10, 'month', NULL, 'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01'),

  ('amexg-resy', 'amex-gold', 'Dining',
   '$100 Resy credit',
   'Up to $50 in statement credits January through June and up to $50 July through December at over 10,000 qualifying U.S. Resy restaurants. Enrollment required.',
   100, 'year', NULL, 'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01'),

  ('amexg-dunkin', 'amex-gold', 'Dining',
   '$84 Dunkin'' credit',
   'Up to $7 in monthly statement credits at U.S. Dunkin'' locations. Enrollment required.',
   7, 'month', NULL, 'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01'),

  ('amexg-uber-cash', 'amex-gold', 'Travel',
   '$120 Uber Cash',
   '$10 in Uber Cash each month when you add the Gold Card to your Uber account.',
   10, 'month', NULL, 'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01'),

  ('amexg-hotel-collection', 'amex-gold', 'Travel',
   'The Hotel Collection',
   '$100 credit towards eligible charges at over 1,300 upscale hotels booked through AmexTravel.com.',
   100, NULL, NULL, 'https://www.americanexpress.com/us/credit-cards/card/gold-card/', '2026-09-01'),

  ('vx-travel-credit', 'capital-one-venture-x', 'Travel',
   '$300 annual travel credit',
   'For hotels, flights, vacation rentals and more booked through Capital One Travel. Expires on the ACCOUNT-OPEN ANNIVERSARY, not the calendar year, which the calendar-period tracker cannot represent.',
   300, 'year', NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-01'),

  ('vx-anniversary-miles', 'capital-one-venture-x', 'Travel',
   '10,000 miles anniversary bonus',
   '10,000 bonus miles, equal to $100 towards travel, every year starting on your first anniversary.',
   100, 'year', NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-01'),

  ('vx-precheck', 'capital-one-venture-x', 'Travel',
   'Global Entry or TSA PreCheck credit',
   'Up to $120 every four years, reimbursing the application fee.',
   120, 'once', NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-01'),

  ('vx-lounge', 'capital-one-venture-x', 'Airport',
   'Capital One Lounges and Priority Pass',
   'Capital One Lounge and Landing locations, plus access to 1,300+ participating Priority Pass lounges worldwide.',
   NULL, NULL, NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-01'),

  ('vx-lifestyle-collection', 'capital-one-venture-x', 'Travel',
   'Lifestyle Collection hotel credit',
   '$100 experience credit on Lifestyle Collection hotel bookings, plus a room upgrade when available.',
   100, NULL, NULL, 'https://www.capitalone.com/credit-cards/venture-x/', '2026-09-01')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Expect 109 benefits (50 existing + 59), across 25 products, 10 with an end date,
-- and none attached to a listed row.
SELECT
  (SELECT count(*) FROM public.card_product_benefits)                          AS benefits,
  (SELECT count(DISTINCT product_id) FROM public.card_product_benefits)        AS products_with_benefits,
  (SELECT count(*) FROM public.card_product_benefits WHERE expires_on IS NOT NULL) AS with_end_date,
  (SELECT count(*) FROM public.card_product_benefits b
     JOIN public.card_products p ON p.id = b.product_id
    WHERE p.tier = 'listed')                                                   AS listed_with_benefits;
