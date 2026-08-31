-- Stage B of the card art fill-in: the three Chase Freedom cards 0037 left NULL.
-- With this applied the catalog is complete -- 18 of 18 carry art.
--
-- ---- WHY THESE THREE NEEDED THEIR OWN MIGRATION ----------------------------
--
-- Chase publishes exactly one render per Freedom card and every one of them has
-- a promotional "NO ANNUAL FEE!" ribbon baked into the top-right corner. There is
-- no second asset: twelve filename variants were probed (the base name without
-- _alt, _noname, _plain, _clean, _nobanner and the rest) and Chase's own
-- comparison pages serve the same ribboned file.
--
-- Shipping the ribbon was not an option. It is a time-limited marketing claim
-- rendered as though it were part of the card, so it would have gone stale on
-- the surface without anything in Juniper knowing it had.
--
-- The ribbon is flat colour over a smooth corner and inpaints out well. The trap
-- was that it shares its yellow-green with the word UNLIMITED, so a colour key
-- alone erased the product name along with it. The mask is therefore intersected
-- with the upper-right corner triangle before dilation, which is what makes the
-- looser colour threshold safe -- and the looser threshold is what catches the
-- ribbon's antialiased edge, which a first pass left as a green fringe.
--
-- One further wrinkle, fixed here and worth knowing if another ribboned card
-- turns up: the ribbon juts PAST the card edge, so trimming to the opaque bounds
-- measured the ribbon rather than the card and came out at ratio 1.519 instead of
-- 1.586. The card height is unaffected by a top-right ribbon, so the width is
-- reconstructed from the height at the true card ratio and the corner is filled
-- along with the rest of the hole.
--
-- Verified after processing: 0.00% residual ribbon colour in the corner quadrant
-- of all three, product names intact, ratios 1.584 to 1.587.
--
-- ---- SAME POSITION AS 0037 -------------------------------------------------
--
-- Same pipeline (scripts/card-art.py), same hosting (Juniper's own origin, not
-- hotlinked), same absence of a licence, same one-line revert. The placeholder
-- cardholder name "D. BARRETT" was erased from all three for the reason 0037
-- gives at length: it is legible at the 236px face and it is not the member's
-- name. These are derivative works and the licence note says so.
--
-- To revert just these three:
--   UPDATE public.card_products SET art_url = NULL, art_license = NULL
--    WHERE id LIKE 'chase-freedom-%';
--
-- Pure ASCII, deliberately. See docs/CARD_REWARDS.md.

BEGIN;

UPDATE public.card_products AS p
   SET art_url     = v.art_url,
       art_license = v.art_license
  FROM (VALUES
    ('chase-freedom-unlimited',
     'https://www.juniperplan.com/card-art/chase-freedom-unlimited.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/freedom_unlimited_card_alt.png. Rehosted on Juniper''s own origin; the promotional NO ANNUAL FEE ribbon was inpainted out of the corner, the card extent reconstructed at the true 1.586 ratio, and the issuer''s placeholder cardholder name erased -- all of which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-freedom-flex',
     'https://www.juniperplan.com/card-art/chase-freedom-flex.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/freedom_flex_card_alt.png. Rehosted on Juniper''s own origin; the promotional NO ANNUAL FEE ribbon was inpainted out of the corner, the card extent reconstructed at the true 1.586 ratio, and the issuer''s placeholder cardholder name erased -- all of which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.'),
    ('chase-freedom-rise',
     'https://www.juniperplan.com/card-art/chase-freedom-rise.webp',
     'Issuer marketing render, downloaded 2026-08-31 from https://creditcards.chase.com/content/dam/jpmc-marketplace/card-art/freedom_rise_alt_card2.png. Rehosted on Juniper''s own origin; the promotional NO ANNUAL FEE ribbon was inpainted out of the corner, the card extent reconstructed at the true 1.586 ratio, and the issuer''s placeholder cardholder name erased -- all of which makes this a derivative work. NO licence or affiliate agreement with the issuer -- unlicensed use pending ROADMAP Stage 5 approval. Revert by setting art_url NULL.')
  ) AS v(product_id, art_url, art_license)
 WHERE p.id = v.product_id;

COMMIT;

-- Every row should now report has_art and ok true: 18 of 18.
SELECT id,
       art_url IS NOT NULL AS has_art,
          (art_url IS NULL AND art_license IS NULL)
       OR (art_url LIKE 'https://%' AND art_license IS NOT NULL
           AND length(trim(art_license)) > 0) AS ok
  FROM public.card_products
 ORDER BY (art_url IS NULL), id;
