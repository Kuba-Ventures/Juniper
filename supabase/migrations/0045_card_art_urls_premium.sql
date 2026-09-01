-- Card art for the three premium products added in 0042. With this applied every
-- product in the catalog carries art again: 32 of 32.
--
-- Same pipeline, hosting and (absent) licence position as 0037, 0038 and 0041;
-- the full statement is in the header of 0037 and is not repeated.
--
-- All three needed NO retouching beyond the margin trim: Amex publishes a
-- `_noname` variant of each card art id, and Capital One's Venture X render
-- carries no placeholder name. So unlike eleven of the other faces, these are not
-- derivative works -- they are the issuer's render, trimmed and rescaled.
--
-- One thing worth writing down, because it cost a wrong card once: the Amex art
-- ids are opaque (NUS000000237, NUS000000174) and the pages reference many of them.
-- 237 is the Platinum and 174 is the Gold, established by DOWNLOADING both and
-- looking at them, not by matching ids to nearby text -- which had earlier pointed
-- at 174 for a card it was not.
--
-- Pure ASCII.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('amex-platinum',
     'https://www.juniperplan.com/card-art/amex-platinum.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://icm.aexp-static.com/acquisition/card-art/NUS000000237_480x304_straight_noname.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and Amex publishes a name-free variant, so nothing was retouched beyond the trim. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('amex-gold',
     'https://www.juniperplan.com/card-art/amex-gold.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://icm.aexp-static.com/acquisition/card-art/NUS000000174_480x304_straight_noname.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and Amex publishes a name-free variant, so nothing was retouched beyond the trim. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-venture-x',
     'https://www.juniperplan.com/card-art/capital-one-venture-x.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://ecm.capitalone.com/WCM/card/products/venture-x-card-art.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the render carries no placeholder cardholder name, so nothing was retouched beyond the trim. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(product_id, art_url, art_license)
 WHERE p.id = v.product_id;

COMMIT;

-- Expect 32 products, 32 with art, 0 without, 0 bad rows.
SELECT count(*) AS products,
       count(*) FILTER (WHERE art_url IS NOT NULL) AS with_art,
       count(*) FILTER (WHERE art_url IS NULL)     AS without_art,
       count(*) FILTER (WHERE NOT (
            (art_url IS NULL AND art_license IS NULL)
         OR (art_url LIKE 'https://%' AND art_license IS NOT NULL
             AND length(trim(art_license)) > 0)))  AS bad_rows
  FROM public.card_products;
