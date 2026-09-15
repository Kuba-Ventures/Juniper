-- One more catalog product, closing out this week's run of card-catalog
-- batches. Same discipline as every prior one.
--
-- ---- TWO CANDIDATES LEFT OUT THIS PASS ---------------------------------------
--
-- Delta Community Credit Union Visa Platinum Rewards: base rate confirmed
-- (1 point/dollar) but no published cent value for that point found today,
-- and its bonus categories rotate by calendar quarter (a fixed rotation
-- applied to everyone, not a member choice, so representable in principle
-- the way Discover it Cash Back's rotating 5% is handled: ship the base
-- rate, omit the rotating bonus) -- except there is nothing to convert that
-- base rate INTO without a stated point value. Out for the same reason
-- DCU was in 0079: no floor to cite.
--
-- Justice Federal Credit Union Visa Platinum: no annual fee confirmed, but
-- no cash-back percentage was published on any page found today. Out.
--
-- ---- THE ONE ADDED -----------------------------------------------------------
--
-- RBFCU (RANDOLPH-BROOKS FEDERAL CREDIT UNION) WORLD CASH BACK MASTERCARD:
-- flat 2% cash back, uncapped, no annual fee. (Corrects this catalog's own
-- 0079 note, which assumed a "CashBack Rewards Visa" product name that
-- turned out not to exist; RBFCU's real cash-back card is this Mastercard.)
-- A temporary 3% promotional boost ran through 2025-12-31 and has since
-- lapsed per RBFCU's own page; the standing 2% rate is what ships, not the
-- expired promotional one. New issuer.
--
-- No art shipped; draws the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('rbfcu-world-cash-back-mastercard', 'Randolph-Brooks Federal Credit Union', 'Mastercard',
   'RBFCU World Cash Back Mastercard' || chr(174),
   0, '#003DA5', 'cash back', NULL, 2, 'percent',
   'https://www.rbfcu.org/loans/credit-cards/world-cash-back-mastercard',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

-- Flat-rate, no earn rows needed.

COMMIT;

SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id = 'rbfcu-world-cash-back-mastercard';
