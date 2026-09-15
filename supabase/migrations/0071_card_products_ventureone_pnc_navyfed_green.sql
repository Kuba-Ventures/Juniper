-- Four more catalog products, three of them opening a NEW issuer. Same discipline
-- as 0069: every row here needed its own published rate, read from the issuer's
-- own page today, and a card whose headline earning cannot be represented by
-- this schema stays OUT entirely rather than going in with only the parts that
-- fit. That is what kept this batch to four rather than the dozen or so common
-- cards considered (Citi Custom Cash and US Bank Cash+ were both rejected: each
-- picks its bonus category dynamically -- the member's own top spend, or a
-- member choice made outside this app -- which this schema has no column for and
-- 0034's own rule says not to guess at). No art is shipped for any of the four:
-- sourcing and retouching issuer renders is real work per card (see 0037/0069's
-- own notes on removing baked-in promo banners and placeholder names) and was
-- not done this pass. All four draw the synthesized face until art is sourced,
-- the same state Altitude Go (0069) already ships in.
--
-- ---- CAPITAL ONE VENTUREONE REWARDS -----------------------------------------
--
-- Flat 1.25 miles per dollar on everything, no annual fee. Capital One also
-- advertises 5 miles/dollar on hotels, cars and vacation rentals booked through
-- Capital One Travel; excluded on the same footing every portal-only bonus in
-- this catalog is excluded unless it has its own merchant/category row -- this
-- one is booking-channel-scoped rather than merchant- or category-scoped, and
-- there is no "Capital One Travel portal" concept in the taxonomy, so the flat
-- rate is what ships. 1.0 cent per mile matches the valuation already used for
-- Venture and Venture X in this catalog, Capital One's own stated redemption
-- value against a travel purchase.
--
-- ---- PNC CASH REWARDS VISA SIGNATURE, A NEW ISSUER --------------------------
--
-- 4% gas, 3% restaurants, 2% groceries, combined, on the first $8,000/year in
-- those three categories (PNC's own rates PDF, read today), 1% on everything
-- else including that $8,000 once reached. No annual fee. Static categories
-- with a single stated annual cap, the shape this schema is built for. PNC has
-- zero rows in the catalog before this and is a top-10 US bank by assets.
--
-- ---- NAVY FEDERAL CASHREWARDS, A NEW ISSUER ----------------------------------
--
-- Flat 1.5% cash back, no annual fee. This is the BASE cashRewards card, issued
-- to a member approved for a credit line under $5,000; a member approved for
-- $5,000 or more instead receives cashRewards Plus at 2%, a credit-line-gated
-- tier this schema cannot represent any more than a loyalty tier can (same
-- reasoning 0069 gave for excluding BoA's Preferred Rewards bonus). 1.5% is the
-- rate available to every cashRewards cardholder regardless of credit line, so
-- shipping it undersells the Plus tier rather than oversells the base one, the
-- safe direction 0034 set. Navy Federal is credit-union-issued rather than a
-- bank, and a segment of real US households (military-affiliated families) bank
-- there exclusively; it was not represented in this catalog before this row.
--
-- ---- AMERICAN EXPRESS GREEN CARD ---------------------------------------------
--
-- 3x Membership Rewards points on travel, transit, and restaurants worldwide,
-- 1x everywhere else. $150 annual fee. Same 1.0-cent-per-point valuation already
-- used for Amex Gold and Platinum in this catalog, Amex's own statement-credit
-- floor, deliberately conservative rather than an invented number.
--
-- Pure ASCII, per docs/CARD_REWARDS.md's account of the clipboard-mangling
-- incident: chr(174) for every (R).

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('capital-one-ventureone', 'Capital One', 'Visa',
   'Capital One VentureOne Rewards Credit Card',
   0, '#5B7A99', 'miles', 1.0, 1.25, 'miles',
   'https://www.capitalone.com/credit-cards/ventureone/',
   '2026-09-15', TRUE, 'featured'),

  ('pnc-cash-rewards-visa-signature', 'PNC Bank', 'Visa',
   'PNC Cash Rewards' || chr(174) || ' Visa Signature' || chr(174) || ' Credit Card',
   0, '#003057', 'cash back', NULL, 1, 'percent',
   'https://www.pnc.com/en/personal-banking/banking/credit-cards/pnc-cash-rewards-visa-credit-card.html',
   '2026-09-15', TRUE, 'featured'),

  ('navyfed-cashrewards', 'Navy Federal Credit Union', 'Visa',
   'Navy Federal Credit Union cashRewards Credit Card',
   0, '#003087', 'cash back', NULL, 1.5, 'percent',
   'https://www.navyfederal.org/loans-cards/credit-cards/cash-rewards.html',
   '2026-09-15', TRUE, 'featured'),

  ('amex-green', 'American Express', 'American Express',
   'American Express' || chr(174) || ' Green Card',
   150, '#4B6B57', 'points', 1.0, 1, 'points',
   'https://www.americanexpress.com/us/credit-cards/card/green/',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, source_url, as_of)
VALUES
  ('pnc-cash-rewards-visa-signature', 'c_gas', 'Gas', 4, 'percent', 8000, 'year',
   'https://www.pnc.com/content/dam/pnc-com/pdf/personal/CreditCards/cash-rewards-rates.pdf', '2026-09-15'),
  ('pnc-cash-rewards-visa-signature', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', 8000, 'year',
   'https://www.pnc.com/content/dam/pnc-com/pdf/personal/CreditCards/cash-rewards-rates.pdf', '2026-09-15'),
  ('pnc-cash-rewards-visa-signature', 'c_groceries', 'Groceries', 2, 'percent', 8000, 'year',
   'https://www.pnc.com/content/dam/pnc-com/pdf/personal/CreditCards/cash-rewards-rates.pdf', '2026-09-15'),

  ('amex-green', 'c_travel', 'Travel', 3, 'points', NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/green/', '2026-09-15'),
  ('amex-green', 'c_rides_transit', 'Rides & transit', 3, 'points', NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/green/', '2026-09-15'),
  ('amex-green', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/green/', '2026-09-15')
ON CONFLICT DO NOTHING;

-- PNC's three bonus rows share one combined $8,000/year cap, the same shape
-- 0062 built for Discover it Chrome's gas-and-dining cap; cap_group ties them
-- together as one combined bucket rather than three independent $8,000 caps.
UPDATE public.card_product_earn
   SET cap_group = 'pnc-cash-rewards-visa-signature-bonus'
 WHERE product_id = 'pnc-cash-rewards-visa-signature'
   AND cap_group IS NULL;

-- Capital One VentureOne and Navy Federal cashRewards get no earn rows at all:
-- both are flat-rate cards, and a card with no rows earns its base rate
-- everywhere, which is exactly right (same convention as the BofA flat-rate
-- rows in 0069).

COMMIT;

-- Every product row should report ok = true, and PNC's three earn rows should
-- all share the same cap_group.
SELECT id, tier, art_url IS NOT NULL AS has_art,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('capital-one-ventureone', 'pnc-cash-rewards-visa-signature',
              'navyfed-cashrewards', 'amex-green')
 ORDER BY id;

SELECT product_id, category_id, cap_group
  FROM public.card_product_earn
 WHERE product_id = 'pnc-cash-rewards-visa-signature'
 ORDER BY category_id;
