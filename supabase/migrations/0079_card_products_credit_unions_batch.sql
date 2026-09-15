-- Three more catalog products, three new issuers, all flat-rate credit
-- union cards. Same discipline as every batch this week.
--
-- ---- TWO CANDIDATES LEFT INCOMPLETE THIS PASS -------------------------------
--
-- RBFCU (Randolph-Brooks Federal Credit Union) CashBack Rewards Visa and
-- Delta Community Credit Union Visa Platinum Rewards: both confirmed no
-- annual fee today, but the actual earn rate could not be pinned down from
-- either issuer's own page in the time spent. Left out rather than guess a
-- percentage; good candidates for a future pass with a more targeted search.
--
-- ---- THE THREE ADDED ---------------------------------------------------------
--
-- AMERICA FIRST CREDIT UNION PLATINUM REWARDS VISA: flat 1.5% cash back
-- (100 points = $1, the issuer's own stated conversion, i.e. 1 cent/point),
-- uncapped, no annual fee. New issuer.
--
-- SUNCOAST CREDIT UNION CASHBACK+ VISA: 2% on gas and groceries, 1%
-- elsewhere, no annual fee. (The issuer's page also names tolls in the 2%
-- tier; not represented, since this taxonomy has no toll/transit-toll
-- category distinct from `c_rides_transit`, which covers fares rather than
-- tolls, and mapping it there would be a guess.) New issuer.
--
-- WRIGHT-PATT CREDIT UNION PLATINUM REWARDS VISA: flat 1.5% cash back,
-- uncapped, no annual fee, no categories -- the issuer's own page states
-- this directly. New issuer.
--
-- No art shipped for any of the three; all draw the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('america-first-platinum-rewards-visa', 'America First Credit Union', 'Visa',
   'America First Credit Union Platinum Rewards Visa' || chr(174),
   0, '#0C4DA2', 'cash back', NULL, 1.5, 'percent',
   'https://www.americafirst.com/visa/visa-credit-cards/visa-platinum-card.html',
   '2026-09-15', TRUE, 'featured'),

  ('suncoast-cashback-plus-visa', 'Suncoast Credit Union', 'Visa',
   'Suncoast Credit Union CashBack+' || chr(174) || ' Visa',
   0, '#00A6E0', 'cash back', NULL, 1, 'percent',
   'https://www.suncoast.com/Why-Suncoast/Membership-Benefits/Cashback-Plus',
   '2026-09-15', TRUE, 'featured'),

  ('wright-patt-platinum-rewards-visa', 'Wright-Patt Credit Union', 'Visa',
   'Wright-Patt Credit Union Platinum Rewards Visa' || chr(174),
   0, '#00558C', 'cash back', NULL, 1.5, 'percent',
   'https://www.wpcu.coop/personal/credit-cards/platinum-rewards-visa-credit-card',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, source_url, as_of)
VALUES
  ('suncoast-cashback-plus-visa', 'c_gas', 'Gas', 2, 'percent', NULL, NULL,
   'https://www.suncoast.com/Why-Suncoast/Membership-Benefits/Cashback-Plus', '2026-09-15'),
  ('suncoast-cashback-plus-visa', 'c_groceries', 'Groceries', 2, 'percent', NULL, NULL,
   'https://www.suncoast.com/Why-Suncoast/Membership-Benefits/Cashback-Plus', '2026-09-15')
ON CONFLICT DO NOTHING;

-- America First and Wright-Patt get no earn rows: both flat-rate, and a card
-- with no rows earns its base rate everywhere.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('america-first-platinum-rewards-visa', 'suncoast-cashback-plus-visa',
              'wright-patt-platinum-rewards-visa')
 ORDER BY id;
