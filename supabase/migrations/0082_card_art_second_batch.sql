-- Second art pass over this week's 37 new catalog products: 5 more (11 of 37
-- total now have real art). Same posture as every art migration before it:
-- no affiliate agreement or asset licence with any issuer, unlicensed use as
-- a stopgap pending ROADMAP Stage 5, reversible with one UPDATE.
--
-- ---- WHERE THESE CAME FROM AND WHAT WAS DONE ---------------------------------
--
-- All five downloaded 2026-09-15 via a same-origin `fetch()` run in the
-- issuer's own page (bypassing hotlink/referer protection that blocked a
-- plain, unauthenticated download for two of these five), then cover-fitted
-- to 472x298 and re-encoded WebP q90.
--
-- One needed real retouching. BECU's Cash Back Visa Platinum render prints a
-- placeholder card number, an expiry date ("GOOD THRU 06/25"), AND a
-- placeholder cardholder name ("LEE M. CARDHOLDER" -- the exact placeholder
-- name 0037 already documented seeing on a different issuer's render) all in
-- one block on a card face that is otherwise two flat, solid teal tones (a
-- darker inset panel behind the chip, a lighter tone everywhere else, the
-- boundary a vertical line, not a gradient). Removed by filling the text's
-- pixel bounding box with two flat rectangles matching that boundary exactly
-- -- a single flat fill first produced a visible seam because the block
-- spans both tones; the two-rectangle version has none.
--
-- The other four needed no retouching: clean renders, no placeholder name,
-- no promotional banner.
--
-- ---- WHAT IS STILL A MONOGRAM -------------------------------------------------
--
-- 26 of this week's 37 additions remain. Notes on what was tried and why it
-- did not yield this pass: PNC's own CDN returns 403 with no referer even
-- from a live browser tab (Akamai bot protection); Fidelity's URL 404s;
-- three USAA pages required a signed-in session; Amex's own card pages
-- render no usable <img> for their hero art in the DOM (client-rendered
-- through a path this pass could not resolve, after four different Amex
-- product URLs all either 404'd or showed an unrelated card-comparison
-- strip); M&T's own page has no card render, only lifestyle stock photography
-- and a hero SVG that turned out (rendered in-browser, since no local SVG
-- rasterizer was available) to be two DIFFERENT cards shown at an angle, not
-- a flat single-card render usable without a distorting crop; Navy Federal's
-- own card-art SVG has the identical problem, two cards shown angled and
-- overlapping. Discover's own business-card URL now redirects to a generic
-- personal-card application page with no business art on it.
--
-- To revert entirely: UPDATE public.card_products SET art_url = NULL,
--                             art_license = NULL WHERE id IN (the five below);
--
-- Pure ASCII.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('penfed-platinum-rewards-visa-signature',
     'https://www.juniperplan.com/card-art/penfed-platinum-rewards-visa-signature.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.penfed.org/content/dam/penfed/en/products/credit-cards/cards/platinum-rewards.webp (fetched from within the issuer''s own page via same-origin fetch(), since a plain unauthenticated download returns 403 Access Denied). Rehosted on Juniper''s own origin; rescaled only, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('bofa-business-advantage-unlimited-cash',
     'https://www.juniperplan.com/card-art/bofa-business-advantage-unlimited-cash.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://business.bankofamerica.com/content/dam/consumer/credit-cards/unlimited_cash_rewards_336x213.png. Rehosted on Juniper''s own origin; rescaled only, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('bofa-business-advantage-travel-rewards',
     'https://www.juniperplan.com/card-art/bofa-business-advantage-travel-rewards.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://business.bankofamerica.com/content/dam/consumer/credit-cards/travel_rewards__336x213.png. Rehosted on Juniper''s own origin; rescaled only, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('regions-cash-rewards-visa-signature',
     'https://www.juniperplan.com/card-art/regions-cash-rewards-visa-signature.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.regions.com/-/media/Images/Hero5050/Cash-Rewards-Card-5050-Hero-1.jpg, a hero photo with the card composited on a gradient backdrop rather than a bare flat render. Rehosted on Juniper''s own origin; cropped to the card itself, then rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('becu-cash-back-visa-platinum',
     'https://www.juniperplan.com/card-art/becu-cash-back-visa-platinum.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://www.becu.org/-/media/Images/image-component/everyday-banking/credit-card/Image_Everyday-Banking_Credit-Card_Cash-Back.png. Rehosted on Juniper''s own origin; rescaled, and the issuer''s placeholder card number, expiry date, and cardholder name ("LEE M. CARDHOLDER") all erased with two flat colour fills matching the card''s own two-tone panel design, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(id, art_url, art_license)
 WHERE p.id = v.id;

COMMIT;

SELECT id, art_url IS NOT NULL AS has_art,
          (art_url IS NULL) = (art_license IS NULL) AS paired,
          art_url LIKE 'https://%' AS is_https
  FROM public.card_products
 WHERE id IN ('penfed-platinum-rewards-visa-signature', 'bofa-business-advantage-unlimited-cash',
              'bofa-business-advantage-travel-rewards', 'regions-cash-rewards-visa-signature',
              'becu-cash-back-visa-platinum')
 ORDER BY id;
