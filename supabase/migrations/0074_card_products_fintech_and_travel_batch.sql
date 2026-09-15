-- Four more catalog products. Same discipline as 0069/0072/0073: every row
-- needed its own published rate, cited from the issuer's own page today, and
-- a card whose earning cannot be honestly represented by this schema stays
-- OUT rather than going in with only the parts that fit. Eight candidates
-- were researched this pass; four made it, four did not.
--
-- ---- FOUR CANDIDATES CONSIDERED AND REJECTED THIS PASS -----------------------
--
-- Discover it Secured: a real, simple, well-documented rate (2% gas and
-- restaurants combined up to $1,000/quarter, 1% elsewhere), but one source
-- found today is titled "Discover it Secured 2026: Paused, and What to Use
-- Instead," a stronger signal than a missing page that this product may not
-- be reliably open today. Same posture as Amex EveryDay non-Preferred in
-- 0073: an inaccurate `verified = TRUE` row is worse than a missing one.
--
-- Capital One Walmart Rewards Mastercard: closed to new applicants, which on
-- its own would not disqualify it (Amex EveryDay Preferred, added below, is
-- also closed and still goes in, since existing holders still carry it and
-- the Identify picker's job is naming a card a member ALREADY has). What
-- disqualifies this one is different: its headline 5% applies only to
-- Walmart.com/app purchases, 2% to in-store Walmart and gas, and Plaid's
-- `merchant_name` for a Walmart charge has no reliable way to tell those two
-- channels apart the way it can tell Costco's own gas pumps from a Shell
-- station (0073). Shipping one blended rate would either overstate in-store
-- spend or understate online spend with no way to know which for a given
-- charge; out.
--
-- Petal 2 "Cash Back, No Fees" Visa: Petal itself is being wound down, not
-- merely closed to new applicants -- multiple sources today report Petal
-- cards are "no longer available," replaced by a different brand (Tilt)
-- entirely. A materially stronger signal than Amex EveryDay Preferred's
-- plain "closed to new applications"; out.
--
-- Robinhood Gold Card: 3 points/dollar, but the point's own cash value is
-- redemption-path-dependent with no single stated floor -- Robinhood's own
-- terms give close to 1 cent/point for an account/crypto/gift-card/travel
-- redemption and noticeably less (one source estimates ~0.7 cents, "roughly
-- 2.1%" effective) for a plain statement credit, with no official number for
-- the low end the way Citi states 0.75 cents for Strata Premier (0073) or
-- PenFed states 0.85 (0072). Shipping an inferred rather than a published
-- floor is the kind of guess 0034's own rule exists to prevent; out.
--
-- ---- THE FOUR ADDED --------------------------------------------------------
--
-- SOFI CREDIT CARD: 2% cash back, uncapped, no annual fee -- but only when
-- redeemed into a SoFi account; a plain statement credit pays 1%. Same shape
-- as Fidelity Rewards Visa Signature and the Schwab Investor Card in 0073,
-- an account-destination requirement rather than a spend condition, so 2%
-- ships as the flat rate the same way those two do. The 3% SoFi Travel
-- portal rate and the 10% relationship-checking-and-savings boost are both
-- excluded, same footing as every other portal/tier bonus this catalog omits.
--
-- WELLS FARGO AUTOGRAPH JOURNEY: the card's own real structure is THREE
-- travel tiers (5x hotels, 4x airlines, 3x other travel), which this
-- taxonomy's single `c_travel` category cannot distinguish between. Shipping
-- 5x for all travel would overstate an airline or a car-rental charge;
-- shipping the published FLOOR of the three tiers, 3x (paired with 3x on
-- restaurants, the same rate), never overstates any travel purchase and
-- undersells only the hotel- and airline-heavy case, the safe direction.
-- $95 annual fee. Wells Fargo's own stated cash value for these points is 1.0
-- cent, the same floor this catalog already uses for Amex and Capital One.
--
-- AMEX EVERYDAY PREFERRED: closed to new applicants (confirmed directly on
-- Amex's own site today, distinct from the ambiguous "no longer available"
-- signal that kept the non-Preferred EveryDay out of 0073), but the page
-- still states its terms in full and existing cardholders still use it,
-- which is what the Identify picker needs. 3x U.S. supermarkets up to
-- $6,000/year, 2x U.S. gas stations, 1x elsewhere. $95 annual fee. The
-- 50%-bonus-at-30-transactions/month condition is excluded, the same
-- transaction-count-conditional shape 0069 already excludes on Bank of
-- America's Preferred Rewards tier. 1.0-cent point value, the established
-- Amex floor.
--
-- PAYPAL CASHBACK MASTERCARD: PayPal's own page states 3% on purchases made
-- THROUGH PayPal and 1.5% everywhere else. The 3% tier is excluded here: it
-- depends on PayPal being the payment method chosen at a merchant's checkout
-- rather than on which merchant it is, and whether Plaid's `merchant_name`
-- reliably surfaces "PayPal" for a PayPal-funded purchase at an arbitrary
-- retailer was not something today's research could confirm one way or the
-- other. The uncapped, unconditional 1.5% ships as the flat base rate; no
-- annual fee. New issuer, zero rows in this catalog before this.
--
-- No art shipped for any of the four; all draw the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('sofi-credit-card', 'SoFi', 'Mastercard',
   'SoFi Credit Card',
   0, '#00A9E0', 'cash back', NULL, 2, 'percent',
   'https://www.sofi.com/credit-card/',
   '2026-09-15', TRUE, 'featured'),

  ('wells-fargo-autograph-journey', 'Wells Fargo', 'Visa',
   'Wells Fargo Autograph Journey' || chr(8480) || ' Card',
   95, '#C40A2C', 'points', 1.0, 1, 'points',
   'https://www.wellsfargo.com/credit-cards/autograph-journey/',
   '2026-09-15', TRUE, 'featured'),

  ('amex-everyday-preferred', 'American Express', 'American Express',
   'Amex EveryDay' || chr(174) || ' Preferred Credit Card from American Express',
   95, '#5B9BD5', 'points', 1.0, 1, 'points',
   'https://www.americanexpress.com/us/credit-cards/card/amex-everyday-preferred/',
   '2026-09-15', TRUE, 'featured'),

  ('paypal-cashback-mastercard', 'PayPal', 'Mastercard',
   'PayPal Cashback Mastercard' || chr(174),
   0, '#003087', 'cash back', NULL, 1.5, 'percent',
   'https://www.paypal.com/us/digital-wallet/manage-money/paypal-cashback-mastercard',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, note, source_url, as_of)
VALUES
  ('wells-fargo-autograph-journey', 'c_travel', 'Travel', 3, 'points', NULL, NULL,
   'Published floor of three travel tiers (5x hotels, 4x airlines, 3x other travel); this taxonomy has one Travel category, so the floor ships rather than the top rate.',
   'https://www.wellsfargo.com/credit-cards/autograph-journey/', '2026-09-15'),
  ('wells-fargo-autograph-journey', 'c_restaurants_bars', 'Restaurants & bars', 3, 'points', NULL, NULL, NULL,
   'https://www.wellsfargo.com/credit-cards/autograph-journey/', '2026-09-15'),

  ('amex-everyday-preferred', 'c_groceries', 'Groceries', 3, 'points', 6000, 'year', 'U.S. supermarkets.',
   'https://www.americanexpress.com/us/credit-cards/card/amex-everyday-preferred/', '2026-09-15'),
  ('amex-everyday-preferred', 'c_gas', 'Gas', 2, 'points', NULL, NULL, NULL,
   'https://www.americanexpress.com/us/credit-cards/card/amex-everyday-preferred/', '2026-09-15')
ON CONFLICT DO NOTHING;

-- SoFi Credit Card and PayPal Cashback Mastercard get no earn rows at all:
-- both ship as flat-rate cards, and a card with no rows earns its base rate
-- everywhere.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('sofi-credit-card', 'wells-fargo-autograph-journey',
              'amex-everyday-preferred', 'paypal-cashback-mastercard')
 ORDER BY id;
