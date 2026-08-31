-- Template for adding card art to a NEW product. Not a migration: it lives in
-- docs/ so it cannot be applied half-filled.
--
-- The 18 products in the catalog as of 0038 all carry art. This is the shape to
-- copy the next time a product is added.
--
-- 1. Add the row to scripts/card-art-sources.tsv, then:
--
--      python3 scripts/card-art.py <product-id> "<issuer-url>" [--ribbon] [--keep-name]
--
--    It trims the issuer's baked-in matting and drop shadow, cover-fits to
--    472x298 (twice the 236x149 face), erases the embossed PLACEHOLDER cardholder
--    name most issuer renders carry, and writes WebP into
--    artifacts/juniper/public/card-art/. Pass --keep-name if the render has no
--    such name, so the licence note below stays true. Pass --ribbon for a Chase
--    Freedom card. Read the script's docstring before trusting either flag.
--
-- 2. LOOK AT THE RESULT at 236x149 before believing it. Every defect that
--    mattered on this surface was invisible in the source and obvious at ship
--    size: a placeholder name, a promotional ribbon, a card floating inside its
--    own frame.
--
-- 3. Fill in the row below, save as the next migration number, apply.
--
-- ---- RULES, enforced by CHECK constraints in 0035 --------------------------
--
--   * art_url MUST start with https://   (http on an https page is blocked as
--     mixed content and renders as a broken card)
--   * art_license is REQUIRED whenever art_url is set, and FORBIDDEN when it is
--     not. Match the wording 0037 and 0038 use: source URL, fetch date, every
--     modification made, and the fact that there is no licence behind it. If the
--     affiliate approval in ROADMAP Stage 5 has landed by then, say that instead
--     -- that is the whole point of the field.
--
-- KEEP THIS FILE PURE ASCII, and the migration too. See docs/CARD_REWARDS.md: a
-- UTF-8 paste through the macOS clipboard was read as MacRoman and mangled 13
-- card names in production. Verify before applying:
--   python3 -c "d=open(PATH,'rb').read(); print(sum(1 for b in d if b>126))"
-- and expect 0.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
  -- (product_id, art_url, art_license)
    ('PRODUCT-ID-HERE',
     'https://www.juniperplan.com/card-art/PRODUCT-ID-HERE.webp',
     'Issuer marketing render, downloaded YYYY-MM-DD from SOURCE-URL. Rehosted on'
     ' Juniper''s own origin; DESCRIBE EVERY MODIFICATION. NO licence or affiliate'
     ' agreement with the issuer -- unlicensed use pending ROADMAP Stage 5'
     ' approval. Revert by setting art_url NULL.')
  ) AS v(product_id, art_url, art_license)
 WHERE p.id = v.product_id;

COMMIT;

SELECT id,
       art_url IS NOT NULL AS has_art,
          (art_url IS NULL AND art_license IS NULL)
       OR (art_url LIKE 'https://%' AND art_license IS NOT NULL
           AND length(trim(art_license)) > 0) AS ok
  FROM public.card_products
 ORDER BY (art_url IS NULL), id;
