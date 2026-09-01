-- Card art for the eleven Chase products added in 0040. With this applied every
-- product in the catalog carries art: 29 of 29, no blank faces anywhere.
--
-- Same pipeline as 0037 and 0038 (scripts/card-art.py, now driven from
-- scripts/card-art-sources.tsv), same hosting on Juniper's own origin rather than
-- hotlinked, same absence of any licence behind it, same one-line revert. The full
-- position is stated in the header of 0037 and is not repeated here.
--
-- Two things this batch taught the pipeline, both recorded because the next person
-- adding a card will hit them:
--
--   * The promotional ribbon is not always top-right. Chase puts it top-LEFT on
--     the Amazon and Prime Visas. Detecting the side automatically chose wrong on
--     both -- one ribbon survived, the other took a quarter of the card with it --
--     so side is now an explicit flag.
--   * The ribbon is not always yellow-green either. It is orange on the Prime Visa
--     and TEAL on the Amazon Visa, and teal is blue-dominant, so the colour key
--     that catches the others cannot match it. That key is also exactly what
--     protects the navy Freedom bodies and the cyan Freedom Flex from being erased,
--     so hue is an explicit flag too rather than being loosened.
--
-- Verified by eye at the real 236x149 face, which is the only check that catches
-- any of this: every defect in this batch was invisible in the processing logs.
--
-- Pure ASCII.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('chase-sapphire-reserve',
     'https://www.juniperplan.com/card-art/chase-sapphire-reserve.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/sapphire_reserve_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-sapphire-reserve-business',
     'https://www.juniperplan.com/card-art/chase-sapphire-reserve-business.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/sapphire_reserve_biz_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and no retouching beyond the trim. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-ink-business-unlimited',
     'https://www.juniperplan.com/card-art/chase-ink-business-unlimited.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/ink_unlimited_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-ink-business-cash',
     'https://www.juniperplan.com/card-art/chase-ink-business-cash.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/ink_cash_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-ink-business-preferred',
     'https://www.juniperplan.com/card-art/chase-ink-business-preferred.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/ink_preferred_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-ink-business-premier',
     'https://www.juniperplan.com/card-art/chase-ink-business-premier.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/ink_business_premier_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-slate-edge',
     'https://www.juniperplan.com/card-art/chase-slate-edge.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/slate_edge_card_alt.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the promotional NO ANNUAL FEE ribbon inpainted out of the corner and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-amazon-visa',
     'https://www.juniperplan.com/card-art/chase-amazon-visa.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/amazon-visa.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the promotional NO ANNUAL FEE ribbon inpainted out of the corner and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-prime-visa',
     'https://www.juniperplan.com/card-art/chase-prime-visa.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/prime-visa.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the promotional NO ANNUAL FEE ribbon inpainted out of the corner and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-doordash',
     'https://www.juniperplan.com/card-art/chase-doordash.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/doordash_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-instacart',
     'https://www.juniperplan.com/card-art/chase-instacart.webp',
     'Issuer marketing render, downloaded 2026-09-01 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/instacart_card.png. Rehosted on Juniper''s own origin; margin-trimmed, rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(product_id, art_url, art_license)
 WHERE p.id = v.product_id;

COMMIT;

-- Expect 29 rows, has_art and ok true on every one, and no row without art.
SELECT count(*) AS products,
       count(*) FILTER (WHERE art_url IS NOT NULL) AS with_art,
       count(*) FILTER (WHERE art_url IS NULL)     AS without_art,
       count(*) FILTER (WHERE NOT (
            (art_url IS NULL AND art_license IS NULL)
         OR (art_url LIKE 'https://%' AND art_license IS NOT NULL
             AND length(trim(art_license)) > 0))) AS bad_rows
  FROM public.card_products;
