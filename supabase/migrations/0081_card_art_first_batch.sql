-- First art pass over this week's 37 new catalog products: 6 of 37. Same
-- posture as 0037/0038/0041/0045/0069/0070: no affiliate agreement or asset
-- licence with any issuer, unlicensed use as a stopgap pending the ROADMAP
-- Stage 5 approval, reversible with one UPDATE.
--
-- ---- WHERE THESE CAME FROM AND WHAT WAS DONE ---------------------------------
--
-- All six downloaded 2026-09-15 from the issuer's own CDN, per-row source URL
-- in art_license below, then cover-fitted to 472x298 (matching every other
-- row in this catalog) and re-encoded WebP q90.
--
-- Two needed real retouching, both Citi renders that print a placeholder
-- cardholder name AND (Costco) a placeholder card number directly onto the
-- card face:
--   * citi-strata-premier: "LINDA WALKER" sat directly above the bottom edge,
--     on the card's own wave pattern. Removed by copying a same-width band of
--     the wave pattern from directly above the name and pasting it down over
--     the name's pixel bounding box (located by thresholding for bright
--     pixels against the dark background), the same "reconstruct from
--     directly above" technique 0069 used on Bank of America's promotional
--     banner. No visible seam; the wave pattern continues believably.
--   * citi-costco-anywhere-visa: prints BOTH a placeholder 16-digit card
--     number ("4100 3901 2345 6789") and a name ("L WALKER") stacked above
--     the Visa mark. Same technique, one taller patch covering both lines,
--     with the patch region's right edge stopped short of the Visa logo so
--     the logo itself is untouched.
--
-- Two Capital One small-business cards ship the SAME render: Capital One's
-- own site serves one generic "SPARK BUSINESS" card face (no product-specific
-- text) for both the Spark Cash Plus and Spark Cash Select product pages, so
-- both rows point at the same file rather than one being invented.
--
-- The other two (capital-one-ventureone, capital-one-quicksilverone) needed
-- no retouching: clean renders, no placeholder name, real product name
-- legible ("VENTUREONE", "QUICKSILVER ONE").
--
-- ---- WHAT IS STILL A MONOGRAM ------------------------------------------------
--
-- The other 31 of this week's 37 additions, plus anything from a later batch
-- not yet reviewed. Some of what was tried and set aside this pass: PayPal's
-- own asset library serves only lifestyle video stills for its Cashback
-- Mastercard, no flat card render; Bread Financial's page image is a full
-- social-preview screenshot of the marketing page, not card art; several
-- issuer sites (Navy Federal, Amex, SoFi) render their card art client-side
-- via JavaScript, which a plain fetch cannot see, and needs a slower
-- browser-driven pass rather than being skipped silently.
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
    ('capital-one-ventureone',
     'https://www.juniperplan.com/card-art/capital-one-ventureone.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://ecm.capitalone.com/WCM/card/products/ventureone_cardart_prim_323x203.png. Rehosted on Juniper''s own origin; rescaled only, no retouching needed (no placeholder name present). NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-quicksilverone',
     'https://www.juniperplan.com/card-art/capital-one-quicksilverone.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://ecm.capitalone.com/WCM/card/products/quicksilver_one_cardart.png. Rehosted on Juniper''s own origin; rescaled only, no retouching needed. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-spark-cash-plus',
     'https://www.juniperplan.com/card-art/capital-one-spark-cash-plus.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://ecm.capitalone.com/WCM/card/products/image-optimization/spark-2-card-art.png (Capital One''s own generic "Spark Business" render, served identically on both the Spark Cash Plus and Spark Cash Select product pages). Rehosted on Juniper''s own origin; rescaled only. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-spark-cash-select',
     'https://www.juniperplan.com/card-art/capital-one-spark-cash-select.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://ecm.capitalone.com/WCM/card/products/image-optimization/spark-2-card-art.png (Capital One''s own generic "Spark Business" render, identical file used for capital-one-spark-cash-plus -- see that row''s note). Rehosted on Juniper''s own origin; rescaled only. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('citi-strata-premier',
     'https://www.juniperplan.com/card-art/citi-strata-premier.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://aemapi.citi.com/content/dam/cfs/uspb/usmkt/cards/en/static/images/citi-strata-premier-credit-card/citi-strata-premier-credit-card_306x192.webp. Rehosted on Juniper''s own origin; rescaled, and the issuer''s placeholder cardholder name ("LINDA WALKER") erased by reconstructing that band from the card''s own wave pattern directly above it, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('citi-costco-anywhere-visa',
     'https://www.juniperplan.com/card-art/citi-costco-anywhere-visa.webp',
     'Issuer marketing render, downloaded 2026-09-15 from https://aemapi.citi.com/content/dam/cfs/uspb/usmkt/cards/en/static/images/citi-costco-anywhere-visa-credit-card/citi-costco-anywhere-visa-credit-card_306x192.webp. Rehosted on Juniper''s own origin; rescaled, and the issuer''s placeholder card number ("4100 3901 2345 6789") and cardholder name ("L WALKER") both erased by the same reconstruct-from-above technique, stopped short of the Visa mark so the mark itself is untouched, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(id, art_url, art_license)
 WHERE p.id = v.id;

COMMIT;

-- Every row should report ok = true (art_url set, https, paired with a license note).
SELECT id, art_url IS NOT NULL AS has_art,
          (art_url IS NULL) = (art_license IS NULL) AS paired,
          art_url LIKE 'https://%' AS is_https
  FROM public.card_products
 WHERE id IN ('capital-one-ventureone','capital-one-quicksilverone',
              'capital-one-spark-cash-plus','capital-one-spark-cash-select',
              'citi-strata-premier','citi-costco-anywhere-visa')
 ORDER BY id;
