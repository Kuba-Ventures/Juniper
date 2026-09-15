-- Two more catalog products. Same discipline as every batch this week: rates
-- cited from the issuer's own page today, and a card whose structure this
-- schema cannot honestly represent stays OUT.
--
-- ---- THREE CANDIDATES REJECTED THIS PASS ------------------------------------
--
-- Target Circle Mastercard: the 5% at Target is an instant discount applied
-- at checkout, not an accumulated reward; the 2%/1% earned everywhere else is
-- redeemable ONLY as a Target GiftCard, not cash or a disclosed-value point.
-- Neither shape matches this catalog's `rewards_currency` model (cash back,
-- or points/miles with a stated cent value), and Target currently sells at
-- least four similarly-named card products (Circle Card, Circle Mastercard,
-- RedCard debit, and a legacy card), raising real risk of conflating SKUs.
-- Out rather than force-fit.
--
-- DCU Visa Platinum Rewards: DCU's own page shows this product replaced by a
-- newer "Visa Signature Cash Rewards" card, with no stated cent value for the
-- Platinum card's points found today. Out for the same reason Robinhood Gold
-- Card was in 0074: no published floor to cite.
--
-- Bank of America Customized Cash Rewards: the member picks their own 3%
-- category (gas, online shopping, dining, travel, drug stores, or home
-- improvement) and can change it monthly. Same shape as TD Cash (0074) and
-- Truist Enjoy Cash (0075): a rate chosen outside this app, with no way to
-- know which category a given member picked. Out.
--
-- ---- THE TWO ADDED -----------------------------------------------------------
--
-- CAPITAL ONE QUICKSILVERONE: flat 1.5% cash back, uncapped. Unlike base
-- Quicksilver (already in this catalog since 0031, no annual fee), this is a
-- distinct product built for fair-credit applicants and carries its own $39
-- annual fee -- a real, separate SKU, not a duplicate. The 5%-through-
-- Capital-One-Travel portal bonus is excluded, same as every other Capital
-- One portal rate already omitted in this catalog.
--
-- GOLDEN 1 CREDIT UNION PLATINUM REWARDS VISA: 4% on gas up to $5,000/year,
-- 3% on groceries and restaurants (uncapped per the source read today, which
-- describes the gas rate as newly bumped from a shared 3% baseline while
-- groceries and restaurants stayed at 3%), 1% elsewhere. No annual fee. New
-- issuer: Golden 1 is one of the largest credit unions in California, not
-- previously represented here.
--
-- No art shipped for either; both draw the synthesized face.
--
-- Pure ASCII.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier)
VALUES
  ('capital-one-quicksilverone', 'Capital One', 'Mastercard',
   'Capital One QuicksilverOne Cash Rewards Credit Card',
   39, '#A3A6AB', 'cash back', NULL, 1.5, 'percent',
   'https://www.capitalone.com/credit-cards/cash-back/quicksilver/',
   '2026-09-15', TRUE, 'featured'),

  ('golden1-platinum-rewards-visa', 'Golden 1 Credit Union', 'Visa',
   'Golden 1 Credit Union Platinum Rewards Visa' || chr(174),
   0, '#C9A227', 'cash back', NULL, 1, 'percent',
   'https://www.golden1.com/credit-cards/member-cash-rewards-plus',
   '2026-09-15', TRUE, 'featured')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_product_earn
  (product_id, category_id, category_label, multiplier, unit, cap_amount, cap_period, source_url, as_of)
VALUES
  ('golden1-platinum-rewards-visa', 'c_gas', 'Gas', 4, 'percent', 5000, 'year',
   'https://www.golden1.com/credit-cards/member-cash-rewards-plus', '2026-09-15'),
  ('golden1-platinum-rewards-visa', 'c_groceries', 'Groceries', 3, 'percent', NULL, NULL,
   'https://www.golden1.com/credit-cards/member-cash-rewards-plus', '2026-09-15'),
  ('golden1-platinum-rewards-visa', 'c_restaurants_bars', 'Restaurants & bars', 3, 'percent', NULL, NULL,
   'https://www.golden1.com/credit-cards/member-cash-rewards-plus', '2026-09-15')
ON CONFLICT DO NOTHING;

-- QuicksilverOne gets no earn rows: flat-rate, and a card with no rows earns
-- its base rate everywhere.

COMMIT;

-- Every product row should report ok = true.
SELECT id, tier,
          (tier = 'listed' OR base_unit = 'percent' OR point_value_cents IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('capital-one-quicksilverone', 'golden1-platinum-rewards-visa')
 ORDER BY id;
