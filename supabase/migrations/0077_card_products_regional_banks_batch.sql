-- Six more catalog products, four opening a new issuer (PNC already has two
-- rows since 0069/0072, so this batch's new issuers are Regions, M&T, BECU,
-- and effectively a second USAA product). Same discipline as every batch
-- this week: rates cited from the issuer's own page today, and anything the
-- schema cannot honestly represent stays OUT.
--
-- ---- ONE CANDIDATE REJECTED THIS PASS ---------------------------------------
--
-- SchoolsFirst Federal Credit Union: real and simple (1.5% flat on its
-- School Employee Mastercard) but membership is narrowly restricted to
-- California school employees and their families, and the search results
-- surfaced at least two differently-structured cards (a signup-bonus-heavy
-- "Rewards Mastercard" and the flat "School Employee Mastercard") under one
-- issuer with inconsistent detail. Lower confidence than this batch's other
-- additions; left out rather than guess which product or rate is current.
--
-- ---- THE SIX ADDED -----------------------------------------------------------
--
-- PNC CASH UNLIMITED VISA SIGNATURE: flat 2% cash back, uncapped, no annual
-- fee. A distinct product from PNC Cash Rewards (0069/0072), not a
-- duplicate -- PNC's own May 2024 launch announcement introduces it
-- alongside, not in place of, Cash Rewards. Requires a minimum $5,000
-- approved credit line, an underwriting condition rather than a rate one.
--
-- REGIONS CASH REWARDS VISA SIGNATURE: flat 1.5% cash back, uncapped, no
-- annual fee. New issuer.
--
-- M&T VISA SIGNATURE: flat 1.5% cash back, uncapped, no annual fee, and
-- M&T's own page states directly there are no bonus categories at all, the
-- cleanest possible case for this schema. New issuer.
--
-- BECU CASH BACK VISA PLATINUM: BECU issues two real, differently NAMED
-- products depending on approved credit line: the Visa Signature (2%,
-- $5,000+ line) and the Visa Platinum (1.5%, under $5,000). Same shape as
-- Navy Federal cashRewards in 0072: ship the tier available regardless of
-- approved line, the Platinum's 1.5%, rather than assume every member
-- cleared the higher threshold.
--
-- USAA REWARDS AMERICAN EXPRESS CARD: 3x dining, 2x gas and groceries, 1x
-- elsewhere. $0 annual fee. A second, distinct USAA product alongside
-- Preferred Cash Rewards (0073) -- USAA membership gates both the same way.
-- Point value: 0.7 cents for a cash-back/statement-credit redemption,
-- USAA's own stated rate and the lowest of its redemption paths (travel
-- redemptions run up to 1 cent), the conservative floor this catalog uses
-- throughout.
--
-- AMEX BUSINESS GREEN REWARDS CARD: confirmed still active today, but its
-- entire headline rate (2x Membership Rewards) applies ONLY to flights and
-- prepaid hotels booked through Amex Travel -- a portal bonus, excluded on
-- the same footing as every other one in this catalog. What remains once
-- that is excluded is a flat 1x everywhere, which is what ships: an honest,
-- if unexciting, representation of what the card earns outside its portal.
-- $95 annual fee ($0 intro for year one, a promotional waiver excluded the
-- same way every other first-year fee waiver in this catalog is). 1.0-cent
-- point value, the Amex floor already used throughout.
--
-- No art shipped for any of the six; all draw the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('pnc-cash-unlimited-visa-signature', 'PNC Bank', 'Visa',
   'PNC Cash Unlimited' || chr(174) || ' Visa Signature' || chr(174) || ' Credit Card',
   0, '#1E5AA8', 'cash back', NULL, 2, 'percent',
   'https://www.pnc.com/en/personal-banking/banking/credit-cards/pnc-cash-unlimited-visa-credit-card.html',
   '2026-09-15', TRUE, 'featured'),

  ('regions-cash-rewards-visa-signature', 'Regions Bank', 'Visa',
   'Regions Cash Rewards Visa' || chr(174) || ' Signature Credit Card',
   0, '#00843D', 'cash back', NULL, 1.5, 'percent',
   'https://www.regions.com/personal-banking/credit-cards/cash-rewards-credit-card',
   '2026-09-15', TRUE, 'featured'),

  ('mt-visa-signature', 'M&T Bank', 'Visa',
   'M&T Visa' || chr(174) || ' Signature Credit Card',
   0, '#004B87', 'cash back', NULL, 1.5, 'percent',
   'https://www.mtb.com/personal/credit-cards/signature-card',
   '2026-09-15', TRUE, 'featured'),

  ('becu-cash-back-visa-platinum', 'BECU', 'Visa',
   'BECU Cash Back Visa' || chr(174) || ' Platinum Credit Card',
   0, '#005670', 'cash back', NULL, 1.5, 'percent',
   'https://www.becu.org/everyday-banking/credit-card/cash-back-credit-card',
   '2026-09-15', TRUE, 'featured'),

  ('usaa-rewards-amex', 'USAA', 'American Express',
   'USAA Rewards' || chr(8482) || ' American Express' || chr(174) || ' Card',
   0, '#1B4B7A', 'points', 0.7, 1, 'points',
   'https://mobile.usaa.com/inet/wc/bank-credit-card-usaa-rewards-american-express',
   '2026-09-15', TRUE, 'featured'),

  ('amex-business-green-rewards', 'American Express', 'American Express',
   'Business Green Rewards Card from American Express',
   95, '#3E5C4C', 'points', 1.0, 1, 'points',
   'https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/rewards-points/',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, source_url, as_of)
VALUES
  ('usaa-rewards-amex', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL,
   'https://mobile.usaa.com/inet/wc/bank-credit-card-usaa-rewards-american-express', '2026-09-15'),
  ('usaa-rewards-amex', 'c_gas', 'Gas', 2, 'points', NULL, NULL,
   'https://mobile.usaa.com/inet/wc/bank-credit-card-usaa-rewards-american-express', '2026-09-15'),
  ('usaa-rewards-amex', 'c_groceries', 'Groceries', 2, 'points', NULL, NULL,
   'https://mobile.usaa.com/inet/wc/bank-credit-card-usaa-rewards-american-express', '2026-09-15')
ON CONFLICT DO NOTHING;

-- PNC Cash Unlimited, Regions, M&T, BECU Platinum, and Amex Business Green
-- Rewards all get no earn rows beyond what's listed above: each is either
-- flat-rate or (Business Green) has its only bonus excluded as a portal
-- rate, so the base rate alone is correct.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('pnc-cash-unlimited-visa-signature', 'regions-cash-rewards-visa-signature',
              'mt-visa-signature', 'becu-cash-back-visa-platinum',
              'usaa-rewards-amex', 'amex-business-green-rewards')
 ORDER BY id;
