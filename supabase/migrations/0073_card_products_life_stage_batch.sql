-- Eight more catalog products, four of them opening a NEW issuer (PenFed and
-- USAA are credit unions the catalog had zero rows for; Fidelity and Schwab are
-- brokerage-issued cards, also zero rows). Same discipline as 0069 and 0072:
-- every row needed its own published rate, read from the issuer's own page
-- today, and a card whose headline earning cannot be represented by this
-- schema stays OUT rather than going in with only the parts that fit.
--
-- ---- FOUR CANDIDATES CONSIDERED AND REJECTED THIS PASS -----------------------
--
-- Amex Blue Business Cash: 2% cash back capped at $50,000/year, then 1%. This
-- is a cap on the card's BASE rate across every category, not a category
-- bonus, and `card_product_earn.cap_amount` only ever scopes one category (or
-- a `cap_group` of a few), never the whole card. There is no column anywhere
-- in this schema for "cap the base_multiplier itself"; representing this
-- correctly would need a running total across a member's ENTIRE spend, which
-- `api/_rewards.ts` has no concept of. Out, same as every other card this
-- catalog has rejected for a shape the schema cannot express.
--
-- TD Cash Credit Card: the member picks their own 3%/2% categories each
-- quarter from a menu (dining, entertainment, gas, groceries, travel). Same
-- shape as Citi Custom Cash (0034) and US Bank Cash+ (never added): a rate
-- chosen by the member outside this app, which this schema has no column for
-- and 0034's own rule says not to guess at by shipping the DEFAULT category
-- and hoping nobody changes it.
--
-- Amex EveryDay (the non-Preferred one): NerdWallet's own review is titled
-- "No Longer Available." Possibly still held by members who got it before it
-- closed to new applicants, but its current status could not be confirmed
-- from a public page today, and an inaccurate `verified = TRUE` row is worse
-- than a missing one. Left out until its status is confirmed.
--
-- Citi Rewards+: discontinued and replaced by Citi Strata (no relation to
-- Citi Strata Premier, added below) in July 2025, per multiple sources
-- checked today. Not something a member opens today; out.
--
-- ---- THE EIGHT ADDED -----------------------------------------------------------
--
-- CITI STRATA PREMIER: 3x points on air travel, hotels, restaurants,
-- supermarkets, gas and EV charging; 1x elsewhere. $95 annual fee. A 10x rate
-- on cititravel.com bookings is excluded, portal-only, same footing as every
-- other travel-portal bonus this catalog omits. Point value: Citi's own
-- program states THIS card's points cash out at $0.0075/point specifically
-- (Double Cash is the only Citi card that cashes out at a full cent; Strata
-- and Strata Elite are lower), so 0.75 cents is what ships, not the 1-cent
-- gift-card rate the same source quotes for a different redemption path.
--
-- COSTCO ANYWHERE VISA BY CITI: 5% at Costco gas pumps, 4% at other gas and EV
-- charging, both toward one shared $7,000/year combined cap (same `cap_group`
-- shape 0062 built for Discover it Chrome); 3% restaurants and travel; 2% at
-- Costco and Costco.com; 1% elsewhere. No annual fee (a paid Costco membership
-- is required to hold the card at all, an eligibility gate rather than a rate
-- condition, the same shape as the Prime-gated Prime Visa already in this
-- catalog since 0040).
--
-- CAPITAL ONE SPARK CASH PLUS: flat 2% cash back on every purchase, uncapped,
-- no preset spending limit (a charge card, balance due monthly). $150 annual
-- fee. The 5x-through-Capital-One-Business-Travel bonus is excluded, portal
-- rate, same as VentureOne's Capital One Travel bonus in 0072.
--
-- USAA PREFERRED CASH REWARDS VISA SIGNATURE: flat 1.5% cash back, uncapped,
-- no annual fee. Eligibility restricted to USAA members (active military,
-- veterans, and eligible family), the same eligibility-gate shape as Navy
-- Federal cashRewards (0072) rather than a rate condition.
--
-- FIDELITY REWARDS VISA SIGNATURE: flat 2% cash back, uncapped, no annual fee.
-- The 2% requires the cash back be deposited into an eligible Fidelity
-- account (brokerage, IRA, HSA, 529, etc.) rather than taken as a statement
-- credit; an account-destination requirement, not a spend-category condition,
-- so it ships as a flat 2% the same as any other uncapped flat-rate card here.
--
-- SCHWAB INVESTOR CARD FROM AMERICAN EXPRESS: flat 1.5% cash back, uncapped,
-- no annual fee, deposited to an eligible Schwab account. Same shape as
-- Fidelity above; requires a qualifying Schwab brokerage account to hold the
-- card at all.
--
-- CAPITAL ONE SAVORONE STUDENT CASH REWARDS: 3% at grocery stores, dining,
-- entertainment and popular streaming services; 1% elsewhere. No annual fee.
-- The 5%-through-Capital-One-Travel and 8%-Capital-One-Entertainment portal
-- bonuses are excluded, same reasoning as every other Capital One portal rate
-- this catalog omits.
--
-- PENFED PLATINUM REWARDS VISA SIGNATURE: 5x points on gas and EV charging,
-- 3x on supermarkets, restaurants, and TV/radio/cable/streaming; 1x
-- elsewhere. No annual fee. PenFed is a credit union open to anyone who joins
-- (unlike Navy Federal/USAA's military-family gate), so no eligibility note is
-- needed the way those two carry one. Point value: PenFed's own stated range
-- for this card is 0.85 to 1 cent depending on redemption path, with travel
-- redemptions running higher (1.7 cents) on a promotional basis; 0.85 cents
-- ships as the conservative floor, the same posture as every other points
-- valuation in this catalog.
--
-- No art shipped for any of the eight; all draw the synthesized face.
--
-- Pure ASCII: chr(174) for every (R).

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('citi-strata-premier', 'Citi', 'Mastercard',
   'Citi Strata Premier' || chr(174) || ' Card',
   95, '#1A3668', 'points', 0.75, 1, 'points',
   'https://www.citi.com/credit-cards/citi-strata-premier-credit-card',
   '2026-09-15', TRUE, 'featured'),

  ('citi-costco-anywhere-visa', 'Citi', 'Visa',
   'Costco Anywhere Visa' || chr(174) || ' Card by Citi',
   0, '#A6192E', 'cash back', NULL, 1, 'percent',
   'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card',
   '2026-09-15', TRUE, 'featured'),

  ('capital-one-spark-cash-plus', 'Capital One', 'Visa',
   'Capital One Spark Cash Plus',
   150, '#35586B', 'cash back', NULL, 2, 'percent',
   'https://www.capitalone.com/small-business/credit-cards/spark-cash-plus/',
   '2026-09-15', TRUE, 'featured'),

  ('usaa-preferred-cash-rewards', 'USAA', 'Visa',
   'USAA Preferred Cash Rewards Visa Signature' || chr(174) || ' Card',
   0, '#002F6C', 'cash back', NULL, 1.5, 'percent',
   'https://www.usaa.com/inet/wc/bank-credit-cards-preferred-cash-rewards-visa-signature',
   '2026-09-15', TRUE, 'featured'),

  ('fidelity-rewards-visa-signature', 'Fidelity', 'Visa',
   'Fidelity' || chr(174) || ' Rewards Visa Signature' || chr(174) || ' Card',
   0, '#00754A', 'cash back', NULL, 2, 'percent',
   'https://www.fidelity.com/visa-signature-card/overview',
   '2026-09-15', TRUE, 'featured'),

  ('schwab-investor-card-amex', 'Charles Schwab', 'American Express',
   'Schwab Investor Card' || chr(174) || ' from American Express',
   0, '#005EB8', 'cash back', NULL, 1.5, 'percent',
   'https://www.schwab.com/credit-cards',
   '2026-09-15', TRUE, 'featured'),

  ('capital-one-savorone-student', 'Capital One', 'Mastercard',
   'Capital One SavorOne Student Cash Rewards Credit Card',
   0, '#7A2E3B', 'cash back', NULL, 1, 'percent',
   'https://www.capitalone.com/credit-cards/savorone-student/',
   '2026-09-15', TRUE, 'featured'),

  ('penfed-platinum-rewards-visa-signature', 'PenFed Credit Union', 'Visa',
   'PenFed Platinum Rewards Visa Signature' || chr(174) || ' Card',
   0, '#003865', 'points', 0.85, 1, 'points',
   'https://www.penfed.org/credit-cards/platinum-rewards-visa.content',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, note, source_url, as_of, merchant_key)
VALUES
  ('citi-strata-premier', 'c_travel', 'Travel', 3, 'points', NULL, NULL, NULL,
   'https://www.citi.com/credit-cards/citi-strata-premier-credit-card', '2026-09-15', NULL),
  ('citi-strata-premier', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL, NULL,
   'https://www.citi.com/credit-cards/citi-strata-premier-credit-card', '2026-09-15', NULL),
  ('citi-strata-premier', 'c_groceries', 'Groceries', 3, 'points', NULL, NULL, NULL,
   'https://www.citi.com/credit-cards/citi-strata-premier-credit-card', '2026-09-15', NULL),
  ('citi-strata-premier', 'c_gas', 'Gas', 3, 'points', NULL, NULL, NULL,
   'https://www.citi.com/credit-cards/citi-strata-premier-credit-card', '2026-09-15', NULL),

  ('citi-costco-anywhere-visa', 'c_gas', 'Gas', 5, 'percent', 7000, 'year', 'Costco gas stations only.',
   'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card', '2026-09-15', 'costco'),
  ('citi-costco-anywhere-visa', 'c_gas', 'Gas', 4, 'percent', 7000, 'year', 'Gas and EV charging outside Costco.',
   'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card', '2026-09-15', NULL),
  ('citi-costco-anywhere-visa', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL, NULL,
   'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card', '2026-09-15', NULL),
  ('citi-costco-anywhere-visa', 'c_travel', 'Travel', 3, 'percent', NULL, NULL, NULL,
   'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card', '2026-09-15', NULL),
  ('citi-costco-anywhere-visa', 'c_shopping', 'Shopping', 2, 'percent', NULL, NULL, 'Costco warehouses and Costco.com.',
   'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card', '2026-09-15', 'costco'),

  ('capital-one-savorone-student', 'c_groceries', 'Groceries', 3, 'percent', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savorone-student/', '2026-09-15', NULL),
  ('capital-one-savorone-student', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savorone-student/', '2026-09-15', NULL),
  ('capital-one-savorone-student', 'c_entertainment', 'Entertainment', 3, 'percent', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savorone-student/', '2026-09-15', NULL),
  ('capital-one-savorone-student', 'c_streaming_music', 'Streaming & music', 3, 'percent', NULL, NULL, NULL,
   'https://www.capitalone.com/credit-cards/savorone-student/', '2026-09-15', NULL),

  ('penfed-platinum-rewards-visa-signature', 'c_gas', 'Gas', 5, 'points', NULL, NULL, NULL,
   'https://www.penfed.org/credit-cards/platinum-rewards-visa.content', '2026-09-15', NULL),
  ('penfed-platinum-rewards-visa-signature', 'c_groceries', 'Groceries', 3, 'points', NULL, NULL, NULL,
   'https://www.penfed.org/credit-cards/platinum-rewards-visa.content', '2026-09-15', NULL),
  ('penfed-platinum-rewards-visa-signature', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL, NULL,
   'https://www.penfed.org/credit-cards/platinum-rewards-visa.content', '2026-09-15', NULL),
  ('penfed-platinum-rewards-visa-signature', 'c_streaming_music', 'Streaming & music', 3, 'points', NULL, NULL, NULL,
   'https://www.penfed.org/credit-cards/platinum-rewards-visa.content', '2026-09-15', NULL)
ON CONFLICT DO NOTHING;

-- Costco Anywhere Visa's two gas rows share one combined $7,000/year cap.
UPDATE public.card_product_earn
   SET cap_group = 'citi-costco-anywhere-visa-gas'
 WHERE product_id = 'citi-costco-anywhere-visa'
   AND category_id = 'c_gas'
   AND cap_group IS NULL;

-- Spark Cash Plus, USAA Preferred Cash Rewards, Fidelity Rewards Visa
-- Signature, and Schwab Investor Card get no earn rows at all: all four are
-- flat-rate cards, and a card with no rows earns its base rate everywhere.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('citi-strata-premier', 'citi-costco-anywhere-visa', 'capital-one-spark-cash-plus',
              'usaa-preferred-cash-rewards', 'fidelity-rewards-visa-signature',
              'schwab-investor-card-amex', 'capital-one-savorone-student',
              'penfed-platinum-rewards-visa-signature')
 ORDER BY id;

-- Costco's two gas rows should both show the same cap_group.
SELECT product_id, category_id, merchant_key, multiplier, cap_group
  FROM public.card_product_earn
 WHERE product_id = 'citi-costco-anywhere-visa'
 ORDER BY category_id, merchant_key NULLS LAST;
