-- Stage A of the card art fill-in: 15 of the 18 catalog products.
--
-- The three Chase Freedom cards (unlimited, flex, rise) are deliberately absent.
-- Chase publishes only a variant with a promotional "NO ANNUAL FEE!" ribbon baked
-- into the corner, and the ribbon shares its colour with the word UNLIMITED, so
-- the obvious way of removing it removes the product name too. They stay NULL and
-- keep drawing the synthesized face until there is a render worth shipping. A
-- partially populated catalog is a normal state; see 0035.
--
-- ---- WHERE THESE IMAGES CAME FROM, AND WHAT WAS DONE TO THEM ---------------
--
-- Each was downloaded on 2026-08-31 from the issuer's own CDN -- the per-row
-- source URL is recorded in art_license below -- then:
--
--   * margin-trimmed. Several renders ship with white matting and a drop shadow
--     baked in, which would have floated a small card inside the face rather
--     than filling it.
--   * cover-fitted to 472x298, twice the 236x149 lg face, and re-encoded WebP
--     q88. All 15 land within a hair of the real 1.586 card ratio, so the
--     object-fit: cover centre-crop takes essentially nothing off the edges.
--   * for 8 of them, the issuer's PLACEHOLDER CARDHOLDER NAME was erased. These
--     renders carry an embossed name -- "D. BARRETT", "LEE M CARDHOLDER",
--     "LINDA WALKER", "HENRY WELLS", "MARY WELLS" -- which is legible at the
--     236px face and would have put a stranger's name on a member's own card.
--     Removed by a horizontal median filter over the auto-detected name band:
--     wide enough to swallow the glyph strokes, narrow enough to preserve the
--     background gradient. That makes those 8 derivative works, which the
--     per-row licence note says in as many words.
--
-- ---- THE LICENCE POSITION, STATED PLAINLY ----------------------------------
--
-- Juniper has NO affiliate agreement, partner programme, or asset licence with
-- any of these issuers. This is unlicensed use of their marketing collateral,
-- taken deliberately and with the reversion cost kept at one UPDATE, exactly the
-- "route 3" that 0035 called the cheapest and least defensible. It is a stopgap
-- until the affiliate approval that ROADMAP Stage 5 already needs, which arrives
-- with a brand-asset pack containing clean, name-free renders. When it lands,
-- replace the URLs; no application code changes.
--
-- To revert entirely:  UPDATE public.card_products SET art_url = NULL,
--                             art_license = NULL WHERE art_url IS NOT NULL;
--
-- ---- HOSTING ---------------------------------------------------------------
--
-- The files are committed to artifacts/juniper/public/card-art/ and served off
-- the app's own origin, NOT hotlinked. Hotlinking would have spent the issuers'
-- bandwidth on top of their artwork, and two of these URLs are content-hashed
-- (Wells Fargo) so they break on the issuer's next deploy. 260 KB for all 15.
--
-- Pure ASCII, deliberately. See docs/CARD_REWARDS.md: a UTF-8 paste through the
-- macOS clipboard was read as MacRoman and mangled 13 card names in production.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('amex-blue-cash-everyday',
     'https://www.juniperplan.com/card-art/amex-blue-cash-everyday.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://icm.aexp-static.com/acquisition/card-art/NUS000000305_480x304_straight_noname.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('amex-blue-cash-preferred',
     'https://www.juniperplan.com/card-art/amex-blue-cash-preferred.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://icm.aexp-static.com/acquisition/card-art/NUS000000264_480x304_straight_noname.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-quicksilver',
     'https://www.juniperplan.com/card-art/capital-one-quicksilver.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/card/products/quicksilver-card-art.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-quicksilver-student',
     'https://www.juniperplan.com/card-art/capital-one-quicksilver-student.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/card/products/qs_cardart_prim_1290x812_2.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-savor',
     'https://www.juniperplan.com/card-art/capital-one-savor.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/card/products/savor-card-art.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-savorone',
     'https://www.juniperplan.com/card-art/capital-one-savorone.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/card/products/savorone-card-art.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('capital-one-venture',
     'https://www.juniperplan.com/card-art/capital-one-venture.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/card/products/venture-card-art.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-sapphire-preferred',
     'https://www.juniperplan.com/card-art/chase-sapphire-preferred.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/sapphire_preferred_card.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('citi-double-cash',
     'https://www.juniperplan.com/card-art/citi-double-cash.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://aemapi.citi.com/content/dam/cfs/uspb/usmkt/cards/en/static/images/citi-double-cash-credit-card/citi-double-cash-credit-card_306x192.webp. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('discover-it-cash-back',
     'https://www.juniperplan.com/card-art/discover-it-cash-back.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/dfs-card/products/cardart-cashit-with-shadow.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('discover-it-chrome',
     'https://www.juniperplan.com/card-art/discover-it-chrome.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/dfs-card/products/cardart-cash-chrome-shadow.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('discover-it-miles',
     'https://www.juniperplan.com/card-art/discover-it-miles.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/dfs-card/products/it-miles-card-header.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('discover-it-student-cash-back',
     'https://www.juniperplan.com/card-art/discover-it-student-cash-back.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://ecm.capitalone.com/WCM/dfs-card/products/cardart-student-it-iridescent-shadow.png. Rehosted on Juniper''s own origin; margin-trimmed and rescaled. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('wells-fargo-active-cash',
     'https://www.juniperplan.com/card-art/wells-fargo-active-cash.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://creditcards.wellsfargo.com/rv/bcs/production/active-cash.9hXxvW2T_1Thrzz.webp. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('wells-fargo-autograph',
     'https://www.juniperplan.com/card-art/wells-fargo-autograph.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://creditcards.wellsfargo.com/rv/bcs/production/autograph.B5C6nsw-_Z2rG3ci.webp. Rehosted on Juniper''s own origin; margin-trimmed and rescaled, and the issuer''s placeholder cardholder name erased, which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(product_id, art_url, art_license)
 WHERE p.id = v.product_id;

COMMIT;

-- Every row carrying a URL should report ok = true. A false never reaches here in
-- practice: the CHECK constraints in 0035 abort the COMMIT first. This is the
-- readable confirmation, not the safety net.
SELECT id,
       art_url IS NOT NULL AS has_art,
          (art_url IS NULL AND art_license IS NULL)
       OR (art_url LIKE 'https://%' AND art_license IS NOT NULL
           AND length(trim(art_license)) > 0) AS ok
  FROM public.card_products
 ORDER BY (art_url IS NULL), id;
