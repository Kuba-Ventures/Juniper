-- Two new issuers in the catalog: Bank of America and U.S. Bank, neither of
-- which had a single row before this. Issue #249, item 3 ("close the coverage
-- gap"). Idempotent, safe to re-run.
--
-- ---- WHY THESE THREE, AND WHY ONLY THREE -----------------------------------
--
-- #249 asked to close the gap between 32 catalog products and roughly 60 real
-- US cards. That is not a batch job: every row here needed its own published
-- rate, read from the issuer's own page, and the same discipline 0034 set
-- still applies -- a card whose headline earning cannot be represented by this
-- schema stays OUT entirely rather than going in with only the parts that fit.
-- That discipline is what kept this batch to three rather than the dozen or so
-- candidates considered.
--
-- Picked for being simple AND for opening a whole new issuer: Bank of America
-- has zero rows in the catalog before this, and it is a top-5 US card issuer.
-- U.S. Bank is the same story.
--
-- ---- BANK OF AMERICA UNLIMITED CASH REWARDS --------------------------------
--
-- Flat 1.5% cash back, no bonus categories, no cap. Read directly from the
-- issuer's own product page today. (BoA also advertises 2% for the first year
-- and a Preferred Rewards tier bonus of up to 75% more; both are excluded on
-- the same footing every other migration here excludes a signup bonus or a
-- loyalty-tier condition: temporary, and not something card_product_earn can
-- express as a category rate. The 1.5% stored is what the card is worth after
-- year one with no other relationship, which undersells rather than oversells
-- it for the common case.)
--
-- ---- BANK OF AMERICA TRAVEL REWARDS -----------------------------------------
--
-- Flat 1.5 points per dollar, no bonus categories, no cap. The 1-cent-per-point
-- valuation is not a house guess: BoA's own page states the redemption
-- directly, "no blackout dates," statement credit toward travel and dining at
-- $0.01/point, which is the card's ordinary, undiscounted redemption rather
-- than a promotional rate.
--
-- ---- U.S. BANK ALTITUDE GO: LISTED, NOT FEATURED, AND HERE IS WHY ----------
--
-- The earning side is clean and well documented (issuer's own program-change
-- notice, read directly): 4x dining capped at $2,000/quarter then 1x, 2x
-- groceries/gas/streaming uncapped, 1x everywhere else. What is NOT published
-- anywhere on the issuer's own site, including their own Program Rules PDF, is
-- what a point is worth on any redemption path a member is likely to actually
-- use. U.S. Bank states only one number: "$0.01 per point" for a deposit into
-- a U.S. Bank account, and calls that explicitly the MAXIMUM value, adding
-- that statement credit, travel, gift cards and merchandise redemptions are
-- worth less by an amount "disclosed upon redemption" -- i.e. nowhere public.
-- Using $0.01 would therefore not be the conservative floor 0032 used for
-- Chase Sapphire Preferred, it would be the ceiling, and 0034's own rule is
-- that overstating a card is the unsafe direction. So this ships `listed`:
-- name, issuer, network, fee and art only, nameable in the Identify picker,
-- carrying no rate anywhere. Upgrading it to `featured` needs the real
-- non-deposit redemption value, which lives inside a signed-in Rewards Center
-- account rather than on a public page.
--
-- ---- ART --------------------------------------------------------------------
--
-- Both Bank of America renders came from the issuer's own site
-- (ContextualSiteGraphics/CreditCardArt), downloaded today, margin-trimmed and
-- cover-fitted to 472x298 the same as the rest of the catalog. The Unlimited
-- Cash Rewards render carried a "LIMITED-TIME OFFER" banner baked into the top
-- of the image, the same shape of problem 0037 hit on the three Chase Freedom
-- cards: removed by replacing the banner's rows with the card's own gradient
-- pattern shifted up from directly below it (analogous to 0037's median-filter
-- treatment of a cardholder name, applied to a promotional banner instead),
-- with the seam softened by a light blur restricted to the two replacement
-- edges. That makes this one a derivative work, same as the 8 renders 0037
-- already altered. The Travel Rewards render needed no retouching: no banner,
-- no placeholder cardholder name. U.S. Bank's own render for Altitude Go is a
-- perspective/angled product photo (160x300, not a flat card face), which
-- cannot be cover-fit into a flat rectangle without visible distortion, so no
-- art is shipped for it; it draws the synthesized face until a flat render is
-- sourced.
--
-- ---- THE LICENCE POSITION, UNCHANGED FROM 0037 -----------------------------
--
-- Same posture as every other row in this catalog: no affiliate agreement,
-- partner programme, or asset licence with either issuer. Unlicensed use of
-- their marketing collateral, kept until the affiliate approval ROADMAP Stage
-- 5 already needs replaces it with a real brand-asset pack. Revert per row by
-- setting art_url and art_license to NULL, same as always.
--
-- Pure ASCII, deliberately, per docs/CARD_REWARDS.md's own account of the
-- clipboard-mangling incident: chr(174) for every (R), chr(8480) for every SM.

BEGIN;

INSERT INTO public.card_products
  (id, issuer, network, name, annual_fee, brand_color, rewards_currency,
   point_value_cents, base_multiplier, base_unit, source_url, as_of, verified, tier,
   art_url, art_license)
VALUES
  ('bofa-unlimited-cash-rewards', 'Bank of America', 'Visa',
   'Bank of America' || chr(174) || ' Unlimited Cash Rewards Credit Card',
   0, '#9A9B9E', 'cash back', NULL, 1.5, 'percent',
   'https://www.bankofamerica.com/credit-cards/products/unlimited-cash-back-credit-card/',
   '2026-09-15', TRUE, 'featured',
   'https://www.juniperplan.com/card-art/bofa-unlimited-cash-rewards.webp',
   'Issuer marketing render, downloaded 2026-09-15 from https://www.bankofamerica.com/content/images/ContextualSiteGraphics/CreditCardArt/en_US/Approved_PCM/bofa_cshsigcm_v_sky_lto_300x188.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and a "LIMITED-TIME OFFER" banner baked into the source image was removed by reconstructing that region from the card''s own gradient, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),

  ('bofa-travel-rewards', 'Bank of America', 'Visa',
   'Bank of America' || chr(174) || ' Travel Rewards Credit Card',
   0, '#0F3D83', 'points', 1.0, 1.5, 'points',
   'https://www.bankofamerica.com/credit-cards/products/travel-rewards-credit-card/',
   '2026-09-15', TRUE, 'featured',
   'https://www.juniperplan.com/card-art/bofa-travel-rewards.webp',
   'Issuer marketing render, downloaded 2026-09-15 from https://www.bankofamerica.com/content/images/ContextualSiteGraphics/CreditCardArt/en_US/Approved_PCM/8blm_trvsigcm_v_250x158.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. No placeholder cardholder name present. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),

  ('usbank-altitude-go', 'U.S. Bank', 'Visa',
   'U.S. Bank Altitude' || chr(174) || ' Go Visa Signature' || chr(174) || ' Card',
   0, '#1E4D5C', 'points', NULL, NULL, 'points',
   'https://www.usbank.com/credit-cards/altitude-go-visa-signature-credit-card.html',
   '2026-09-15', TRUE, 'listed', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Flat-rate cards (both Bank of America rows) get no earn rows at all: a card
-- with no rows earns its base rate everywhere, which is exactly right. The
-- listed row (Altitude Go) gets none either, per 0039's invariant that a
-- `listed` product carries no earn rows.

COMMIT;

-- Every row should report ok = true.
SELECT id, tier, art_url IS NOT NULL AS has_art,
          (tier = 'listed' AND base_multiplier IS NULL)
       OR (tier = 'featured' AND base_multiplier IS NOT NULL) AS ok
  FROM public.card_products
 WHERE id IN ('bofa-unlimited-cash-rewards', 'bofa-travel-rewards', 'usbank-altitude-go')
 ORDER BY id;
