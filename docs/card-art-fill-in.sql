-- STAGE B TEMPLATE: the three cards 0037 left NULL.
--
-- NOT a migration. It lives in docs/ so it cannot be applied half-filled. Fill in
-- the rows you have a usable render for, DELETE the rows you do not, then save as
-- supabase/migrations/0038_card_art_urls_chase.sql.
--
-- ---- WHY THESE THREE ARE STILL EMPTY ---------------------------------------
--
-- Chase publishes exactly one render per Freedom card and it has a promotional
-- "NO ANNUAL FEE!" ribbon baked into the top-right corner. Probed and confirmed
-- absent: the base name without _alt, and eleven other suffixes (_noname, _plain,
-- _clean, _nobanner, ...). Chase's own comparison pages use the ribboned file too,
-- so there is no second asset to find on their site.
--
-- The ribbon inpaints out well -- it is a flat colour over a smooth corner -- but
-- it is the same yellow-green as the word UNLIMITED, so a colour-keyed mask erases
-- the product name along with it. The fix is to intersect the colour mask with the
-- top-right corner triangle before dilating. Everything else in the Stage A
-- pipeline (trim, cover-fit to 472x298, WebP q88, median-filter the placeholder
-- name band) applies unchanged.
--
-- Sources, all 289x181 or thereabouts:
--   chase-freedom-unlimited  .../card-art/freedom_unlimited_card_alt.png
--   chase-freedom-flex       .../card-art/freedom_flex_card_alt.png
--   chase-freedom-rise       .../card-art/freedom_rise_alt_card2.png
--   (base: https://creditcards.chase.com/content/dam/jpmc-marketplace)
--
-- ---- RULES, enforced by CHECK constraints in 0035 --------------------------
--
--   * art_url MUST start with https://   (http on an https page is blocked as
--     mixed content and renders as a broken card)
--   * art_license is REQUIRED whenever art_url is set, and FORBIDDEN when it is
--     not. Match the wording 0037 uses: source URL, fetch date, what was done to
--     the image, and the fact that there is no licence behind it.
--
-- Host the files the way Stage A did -- artifacts/juniper/public/card-art/<id>.webp,
-- served off Juniper's own origin -- rather than hotlinking Chase.
--
-- KEEP THIS FILE PURE ASCII. See docs/CARD_REWARDS.md: a UTF-8 paste through the
-- macOS clipboard was read as MacRoman and mangled 13 card names in production.
-- Verify before applying:
--   python3 -c "d=open('supabase/migrations/0038_card_art_urls_chase.sql','rb').read(); print(sum(1 for b in d if b>126))"
-- and expect 0.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
  -- (product_id, art_url, art_license)
    ('chase-freedom-unlimited', NULL, NULL),
    ('chase-freedom-flex',      NULL, NULL),
    ('chase-freedom-rise',      NULL, NULL)
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
