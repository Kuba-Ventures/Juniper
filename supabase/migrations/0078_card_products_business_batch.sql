-- Five more catalog products, mostly business cards, two new issuers
-- (Huntington, and Amazon as its own issuer name distinct from the
-- Chase-issued Amazon Visa/Prime Visa already in this catalog). Same
-- discipline as every batch this week.
--
-- ---- ONE CANDIDATE REJECTED THIS PASS ---------------------------------------
--
-- Huntington Voice Business Credit Card: the member picks one of ten bonus
-- categories, capped per quarter. Same excluded shape as every other
-- member-chosen-category card this catalog has turned down (TD Cash, Truist
-- Enjoy Cash, BofA Customized Cash). Huntington's separate, simpler
-- **personal** Cash Back Visa (flat 1.5%, no fee) is added below instead --
-- a real, differently-structured product, not a substitute for the rejected
-- one.
--
-- ---- THE FIVE ADDED --------------------------------------------------------
--
-- BOFA BUSINESS ADVANTAGE UNLIMITED CASH REWARDS: flat 1.5% cash back,
-- uncapped, no annual fee. The Preferred Rewards for Business tier boost
-- (up to 2.62%) is excluded, same footing as the personal BofA cards
-- already in this catalog (0069).
--
-- BOFA BUSINESS ADVANTAGE TRAVEL REWARDS: flat 1.5 points/dollar, no annual
-- fee. The 3x-at-the-BofA-Travel-Center rate is a portal bonus, excluded.
-- Same 1.0-cent point value as the personal BofA Travel Rewards card
-- (0069): "no blackout dates" statement credit toward travel and dining.
--
-- AMAZON BUSINESS PRIME AMERICAN EXPRESS CARD: 5% at Amazon.com and Whole
-- Foods (capped at $120,000/year combined, then 1%), 2% restaurants, gas,
-- and wireless service purchased directly from a US carrier, 1% elsewhere.
-- Requires an Amazon Business Prime membership, an eligibility gate rather
-- than a rate condition, same shape as the Prime-gated Prime Visa already
-- in this catalog. The merchant-scoped 5% is keyed to 'amazon' the same way
-- Prime Visa's is (0064); AWS spend, also part of the card's real headline
-- rate, is NOT separately represented, since whether Plaid's merchant_name
-- ever resolves an AWS bill to something a merchant_key of 'amazon' would
-- match could not be confirmed today, and guessing at a second merchant_key
-- risked matching nothing or matching wrong. The card ships understated on
-- AWS spend specifically, the safe direction.
--
-- WELLS FARGO BUSINESS PLATINUM CREDIT CARD: flat 1.5% cash back (the
-- card's cash-back rewards option; it also offers a points option, not
-- represented here since a card carries one rewards_currency), uncapped,
-- no annual fee.
--
-- HUNTINGTON CASH BACK VISA: flat 1.5% cash back, uncapped, no annual fee.
-- New issuer. Distinct from and simpler than the rejected Voice Business
-- card above.
--
-- No art shipped for any of the five; all draw the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('bofa-business-advantage-unlimited-cash', 'Bank of America', 'Visa',
   'Bank of America' || chr(174) || ' Business Advantage Unlimited Cash Rewards Mastercard' || chr(174) || ' Credit Card',
   0, '#C41230', 'cash back', NULL, 1.5, 'percent',
   'https://business.bankofamerica.com/en/credit-cards/business-advantage-unlimited-cash-rewards',
   '2026-09-15', TRUE, 'featured'),

  ('bofa-business-advantage-travel-rewards', 'Bank of America', 'Mastercard',
   'Bank of America' || chr(174) || ' Business Advantage Travel Rewards World Mastercard' || chr(174) || ' Credit Card',
   0, '#1F5C99', 'points', 1.0, 1.5, 'points',
   'https://business.bankofamerica.com/en/credit-cards/business-advantage-travel-rewards',
   '2026-09-15', TRUE, 'featured'),

  ('amazon-business-prime-amex', 'Amazon', 'American Express',
   'Amazon Business Prime American Express' || chr(174) || ' Card',
   0, '#FF9900', 'cash back', NULL, 1, 'percent',
   'https://www.americanexpress.com/en-us/business/credit-cards/amazon/',
   '2026-09-15', TRUE, 'featured'),

  ('wells-fargo-business-platinum', 'Wells Fargo', 'Visa',
   'Wells Fargo Business Platinum Credit Card',
   0, '#7A1220', 'cash back', NULL, 1.5, 'percent',
   'https://www.wellsfargo.com/biz/business-credit/business-platinum-credit-card/',
   '2026-09-15', TRUE, 'featured'),

  ('huntington-cash-back-visa', 'Huntington Bank', 'Visa',
   'Huntington Cash Back Visa' || chr(174) || ' Credit Card',
   0, '#00674A', 'cash back', NULL, 1.5, 'percent',
   'https://www.huntington.com/Personal/credit-card/cash-back-card',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, note, source_url, as_of, merchant_key)
VALUES
  ('amazon-business-prime-amex', 'c_shopping', 'Shopping', 5, 'percent', 120000, 'year', 'Amazon.com.',
   'https://www.americanexpress.com/en-us/business/credit-cards/amazon/', '2026-09-15', 'amazon'),
  ('amazon-business-prime-amex', 'c_groceries', 'Groceries', 5, 'percent', 120000, 'year', 'Whole Foods Market.',
   'https://www.americanexpress.com/en-us/business/credit-cards/amazon/', '2026-09-15', 'whole foods'),
  ('amazon-business-prime-amex', 'c_restaurants_bars', 'Restaurants & bars', 2, 'percent', NULL, NULL, NULL,
   'https://www.americanexpress.com/en-us/business/credit-cards/amazon/', '2026-09-15', NULL),
  ('amazon-business-prime-amex', 'c_gas', 'Gas', 2, 'percent', NULL, NULL, NULL,
   'https://www.americanexpress.com/en-us/business/credit-cards/amazon/', '2026-09-15', NULL),
  ('amazon-business-prime-amex', 'c_phone_internet', 'Phone & internet', 2, 'percent', NULL, NULL, 'Wireless service bought directly from a US carrier.',
   'https://www.americanexpress.com/en-us/business/credit-cards/amazon/', '2026-09-15', NULL)
ON CONFLICT DO NOTHING;

-- The two Amazon Business Prime rows share one combined $120,000/year cap.
UPDATE public.card_product_earn
   SET cap_group = 'amazon-business-prime-amex-5pct'
 WHERE product_id = 'amazon-business-prime-amex'
   AND multiplier = 5
   AND cap_group IS NULL;

-- Both BofA Business Advantage cards, Wells Fargo Business Platinum, and
-- Huntington Cash Back get no additional earn rows: each ships as either
-- flat-rate or (BofA Travel Rewards) with its only bonus excluded as a
-- portal rate, so the base rate alone is correct.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('bofa-business-advantage-unlimited-cash', 'bofa-business-advantage-travel-rewards',
              'amazon-business-prime-amex', 'wells-fargo-business-platinum', 'huntington-cash-back-visa')
 ORDER BY id;

-- Amazon Business Prime's two 5% rows should share one cap_group.
SELECT category_id, merchant_key, cap_group FROM public.card_product_earn
 WHERE product_id = 'amazon-business-prime-amex' AND multiplier = 5
 ORDER BY category_id;
