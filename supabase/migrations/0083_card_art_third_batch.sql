-- Third art pass over this week's 37 new catalog products: 6 more (17 of 37
-- total now have real art). Same posture as every art migration before it:
-- no affiliate agreement or asset licence with any issuer, unlicensed use as
-- a stopgap pending ROADMAP Stage 5, reversible with one UPDATE.
--
-- ---- WHERE THESE CAME FROM AND WHAT WAS DONE ---------------------------------
--
-- All six downloaded 2026-09-15, five via a plain unauthenticated download and
-- one (PayPal) frame-extracted from the issuer's own marketing photo, then
-- cover-fitted to 472x298 and re-encoded WebP q90.
--
-- Two needed retouching. Wells Fargo Autograph Journey's render prints a
-- placeholder cardholder name ("MARY WELLS") on an otherwise flat near-black
-- lower third; removed with a single flat rectangle fill, no seam, since that
-- part of the card carries no gradient. PayPal Cashback Mastercard has no flat
-- product render anywhere on the issuer's page, only a lifestyle photo of the
-- card held at roughly a 26 degree angle in a hand; de-skewed by rotating the
-- full photo to square the card's own edges, then cropped tight and the two
-- small corners still carrying background or fingertip filled from the card's
-- own navy. This is a heavier derivative than a crop-and-scale and is called
-- out as such.
--
-- The other four needed no retouching: clean renders, no placeholder name.
--
-- ---- TWO NAMES DO NOT MATCH THE CATALOG, AND ARE LEFT AS THE CATALOG HAS THEM
--
-- Golden 1's own product page for this card now calls it "Member Cash
-- Rewards+", not "Platinum Rewards Visa", but the rate card matches exactly
-- (4% gas/EV, 3% groceries, 3% dining, 1% other, Visa Signature) so this is a
-- rename rather than a different product, and the art shipped is that
-- product's real current card face. Huntington's card is issued on Mastercard
-- World Elite, not Visa as the catalog's network column has it, confirmed
-- against Huntington's own current card lineup page; the rate (1.5% flat) and
-- issuer match exactly, so again this reads as the catalog trailing a rebrand
-- rather than a wrong card. Neither column is corrected here: this migration
-- only sets art_url and art_license, and a network/name correction is a
-- separate, deliberate edit someone should make with eyes on it, not a side
-- effect of an art pass.
--
-- ---- WHAT IS STILL A MONOGRAM, AND WHAT WAS TRIED THIS PASS -------------------
--
-- 20 of this week's 37 additions remain. Three findings from this pass, one of
-- them a reversal of an assumption the catalog itself made: Citizens Bank's
-- "Cash Back Plus" card no longer exists on citizensbank.com at all (404 on
-- the recorded URL and absent from the current four-card lineup of Amp,
-- Spring, Summit and Summit Reserve), so this is not a missing-art gap, it is
-- a discontinued-or-renamed product the catalog itself needs a human decision
-- on, not an art fetch. Wells Fargo Business Platinum's page 404s and the
-- bank's current business-card lineup page lists only Signify Business Cash,
-- with no Platinum product visible; same shape of problem as Citizens, and
-- also left alone rather than guessed at. SoFi's card page carries no flat
-- product render at all, only lifestyle photography and one abstract 3D
-- render (a plain pink rounded rectangle with no SoFi markings, logo, or the
-- card's real dark colour), which was rejected as art because it does not
-- depict the actual card design, unlike PNC's 0082 case or PayPal's above,
-- where the underlying photo genuinely shows the real card.
--
-- To revert entirely: UPDATE public.card_products SET art_url = NULL,
--                             art_license = NULL WHERE id IN (the six below);
--
-- Pure ASCII.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('capital-one-savorone-student',
     'https://www.juniperplan.com/card-art/capital-one-savorone-student.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://ecm.capitalone.com/WCM/card/products/new-savor-card-art/mobile.png (linked from the issuer''s own SavorOne Student page). This is Capital One''s shared Savor-family face art (reads "SAVOR" rather than a student-specific wordmark); rehosted on Juniper''s own origin, rescaled only, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('wells-fargo-autograph-journey',
     'https://www.juniperplan.com/card-art/wells-fargo-autograph-journey.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://creditcards.wellsfargo.com/W-Card-MarketPlace/v9-1-26/images/Products/AutographJourney/WF_Autograph_Journey_Card_d.png (linked from the issuer''s own product page). Rehosted on Juniper''s own origin, rescaled, and the issuer''s placeholder cardholder name ("MARY WELLS") erased with a single flat colour fill matching the card''s own near-black lower third, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('paypal-cashback-mastercard',
     'https://www.juniperplan.com/card-art/paypal-cashback-mastercard.webp',
     'Issuer marketing photo, downloaded 2026-09-15 from https://www.paypalobjects.com/marketing/web23/us/en/ppe/cbmc/hero_size-tablet-up_v1.jpg (linked from the issuer''s own product page), the only card imagery on that page: a lifestyle photo of the real card held in a hand at roughly a 26 degree angle, no flat render available anywhere on the site. De-skewed by rotating the full photo so the card''s own edges square to the frame, cropped to the card, and the two small corners still showing background fabric or a fingertip filled from the card''s own navy tone. A heavier derivative than a plain crop-and-scale, and called out as such; the card face itself (the PayPal monogram, the chip, the Mastercard marks) is unaltered pixels from the original photo, only rotated and cropped. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('schwab-investor-card-amex',
     'https://www.juniperplan.com/card-art/schwab-investor-card-amex.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.schwab.com/sites/g/files/eyrktu1401/files/InvestorCard.jpg (linked from the issuer''s own credit-cards page). Rehosted on Juniper''s own origin, rescaled, and the issuer''s placeholder cardholder name ("C F FROST") erased by copying an equal-sized patch of the card''s own vertical-line pattern from directly above the name, which reproduces the pattern almost seamlessly since the lines run vertically through that area; this makes it a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('golden1-platinum-rewards-visa',
     'https://www.juniperplan.com/card-art/golden1-platinum-rewards-visa.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.golden1.com/-/media/golden1/images/2025-credit-card-product-page-refresh/mcr600x378.png (fetched from within the issuer''s own page via same-origin fetch(), since a plain unauthenticated download from this shell timed out). Rehosted on Juniper''s own origin; cropped to the card out of its white marketing frame, then rescaled, no retouching needed. Note: the issuer''s current name for this exact product (same rate, same network) is "Member Cash Rewards+", not "Platinum Rewards Visa"; the catalog name is left as-is, since renaming it is a separate, deliberate edit outside this art-only migration. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('huntington-cash-back-visa',
     'https://www.juniperplan.com/card-art/huntington-cash-back-visa.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://assets.huntingtonbank.com/api/public/content/323255a2-hnb_cashback_worldelite_flat_1013x638_rgb_2026.png (linked from the issuer''s own product page). Rehosted on Juniper''s own origin; cropped out of its white marketing frame, then rescaled, no retouching needed. Note: the card is actually issued on Mastercard World Elite, not Visa as the catalog''s network column has it; the rate and issuer both match exactly, so this reads as the catalog trailing a rebrand rather than a wrong card, and is left as-is for the same reason as the Golden 1 name above. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(id, art_url, art_license)
 WHERE p.id = v.id;

COMMIT;

SELECT id, art_url IS NOT NULL AS has_art,
          (art_url IS NULL) = (art_license IS NULL) AS paired,
          art_url LIKE 'https://%' AS is_https
  FROM public.card_products
 WHERE id IN ('capital-one-savorone-student', 'wells-fargo-autograph-journey',
              'paypal-cashback-mastercard', 'schwab-investor-card-amex',
              'golden1-platinum-rewards-visa', 'huntington-cash-back-visa')
 ORDER BY id;
