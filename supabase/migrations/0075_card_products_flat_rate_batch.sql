-- Four more catalog products, all flat-rate, no earn rows needed. Two new
-- issuers (Bread Financial, Citizens Bank). Same discipline as every prior
-- batch this week: every rate cited from the issuer's own page today, and a
-- card whose structure this schema cannot honestly represent stays OUT.
--
-- ---- THREE CANDIDATES REJECTED THIS PASS --------------------------------
--
-- Truist Enjoy Cash: NOT one product but two, chosen once at application and
-- never changeable after: 3% gas/EV, 2% utilities/groceries (combined
-- $1,000/month cap), 1% elsewhere, OR a flat 1.5% on everything. Juniper's
-- Identify picker names which PRODUCT a member holds, not which of two
-- configurations they picked at signup, and there is no way to tell the two
-- apart after the fact. Unlike a portal bonus or a tier upgrade (which this
-- catalog ships the safe floor for), the FLOOR here is not safe either: a
-- member on the tiered option earns only 1% outside their bonus categories,
-- worse than the 1.5% flat option, so no single number can stand in for both
-- without either overstating one member's card or understating the other's.
-- Out.
--
-- Alliant Cashback Visa Signature: real churn in the last year (its 2.5%
-- tier was discontinued in September 2025, replaced card-wide with a flat
-- 1.5%, then reportedly "available again" by spring 2026), and one source
-- checked today is titled "No longer available." Same posture as every other
-- card this catalog has left out on an unconfirmed current-availability
-- signal (Amex EveryDay non-Preferred and Discover it Secured, both 0073/
-- 0074): a wrong `verified = TRUE` is worse than a missing row.
--
-- KeyBank Latitude Card: not a rewards card at all -- it is a 0%-intro-APR
-- balance-transfer card. (KeyBand does have a separate Key Cashback card with
-- real rewards; not researched this pass.)
--
-- ---- THE FOUR ADDED ---------------------------------------------------------
--
-- BREAD CASHBACK AMERICAN EXPRESS: flat 2% cash back, uncapped, no rotating
-- categories, no annual fee. New issuer, Bread Financial.
--
-- CITIZENS BANK CASH BACK PLUS WORLD MASTERCARD: flat 1.8% cash back,
-- uncapped, no annual fee. A Citizens Quest Checking relationship bumps this
-- to 1.9%; excluded, same footing as every other banking-relationship bonus
-- this catalog omits (BofA Preferred Rewards, 0069). New issuer.
--
-- CAPITAL ONE SPARK CASH SELECT: flat 1.5% cash back business card, uncapped,
-- no annual fee. The 5%-through-Capital-One-Business-Travel portal bonus is
-- excluded, same as Spark Cash Plus (0073) and VentureOne (0072).
--
-- DISCOVER IT BUSINESS: flat 1.5% cash back business card, uncapped, no
-- annual fee, no rotating categories (the personal Discover it cards' 5%
-- calendar does not apply here). The first-year Cashback Match is a
-- promotional welcome bonus, excluded on the same footing every signup bonus
-- in this catalog already is.
--
-- No art shipped for any of the four; all draw the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('bread-cashback-amex', 'Bread Financial', 'American Express',
   'Bread Cashback' || chr(8482) || ' American Express' || chr(174) || ' Credit Card',
   0, '#A67C52', 'cash back', NULL, 2, 'percent',
   'https://www.breadfinancial.com/en/bread-financial-cashback-card.html',
   '2026-09-15', TRUE, 'featured'),

  ('citizens-cash-back-plus', 'Citizens Bank', 'Mastercard',
   'Citizens Bank Cash Back Plus' || chr(174) || ' World Mastercard' || chr(174),
   0, '#007A3D', 'cash back', NULL, 1.8, 'percent',
   'https://www.citizensbank.com/credit-cards/cash-back-plus.aspx',
   '2026-09-15', TRUE, 'featured'),

  ('capital-one-spark-cash-select', 'Capital One', 'Visa',
   'Capital One Spark Cash Select for Business',
   0, '#4A7A8C', 'cash back', NULL, 1.5, 'percent',
   'https://www.capitalone.com/small-business/credit-cards/spark-cash-select/',
   '2026-09-15', TRUE, 'featured'),

  ('discover-it-business', 'Discover', 'Discover',
   'Discover it' || chr(174) || ' Business Card',
   0, '#FF6000', 'cash back', NULL, 1.5, 'percent',
   'https://www.discover.com/credit-cards/business/',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

-- All four are flat-rate cards with no earn rows: a card with no rows earns
-- its base rate everywhere, which is exactly right.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('bread-cashback-amex', 'citizens-cash-back-plus',
              'capital-one-spark-cash-select', 'discover-it-business')
 ORDER BY id;
