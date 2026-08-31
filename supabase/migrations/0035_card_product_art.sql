-- Somewhere to put real card art, for when there is a licensed source for it.
-- Idempotent, safe to re-run.
--
-- ── WHY THE COLUMN SHIPS EMPTY ──────────────────────────────────────────────
--
-- Card art is what a member actually recognizes. A colour chip tells somebody
-- almost nothing when they are choosing between five Capital One cards, which is
-- exactly the situation the picker puts them in, and the synthesized faces in
-- #168 and #228 are a workaround rather than an answer.
--
-- The obstacle was never technical. Those renders are the issuers' own marketing
-- assets, and Juniper has no relationship with any card issuer, which is the same
-- gate holding the marketplace (ROADMAP Stage 5, every affiliate URL still
-- `example.com`). So this migration adds the column, the app renders it the moment
-- it is set, and the synthesized face stays as the fallback. What it does NOT do
-- is arrive with URLs already in it: choosing a source is a licensing decision
-- that belongs to whoever owns the product, not to whoever wrote the migration.
--
-- ── WHERE A URL CAN LEGITIMATELY COME FROM ──────────────────────────────────
--
-- Three routes, in rough order of how clean they are:
--
--   1. An ISSUER AFFILIATE OR PARTNER PROGRAM. Approval comes with a brand-asset
--      pack and written guidelines covering exactly this use. It is also the same
--      approval Stage 5 needs, so it is one piece of work unlocking both.
--   2. A LICENSED CARD-DATA VENDOR. Several bundle art with their rates feed under
--      contract. Worth pricing at the same time as the rates themselves, since
--      this catalog is hand-maintained and that is the real long-term cost.
--   3. ISSUER-HOSTED URLS, hotlinked. Cheapest and the least defensible: it uses
--      their bandwidth as well as their artwork, and it breaks whenever they
--      reorganize a path. If it is used, it should be a deliberate decision with
--      an eye on how quickly it could be reverted, which is one UPDATE per row.
--
-- ── WHAT THE SURFACE DOES WITH IT ───────────────────────────────────────────
--
-- `art_url` set renders the image, and the pocket still paints its own legible
-- strip over the top of it. That is not decoration: real card art puts the product
-- name in a different place on every card, so a stack that relies on the artwork
-- to identify a hidden card would be legible for some issuers and not others. The
-- strip guarantees the name and the last four are readable whatever the art does.
--
-- NULL renders the synthesized face, unchanged. A member whose card has no art
-- sees exactly what they see today, which is why this can ship before any URL
-- exists.

ALTER TABLE public.card_products
  -- A full https URL to a card image, or NULL. The app treats NULL as "draw the
  -- synthesized face", so a partially populated catalog is a normal state rather
  -- than a broken one.
  ADD COLUMN IF NOT EXISTS art_url TEXT,
  -- Where the right to use that image comes from, in words. Required alongside a
  -- URL, and the reason is the same one `source_url` exists for on the rates: an
  -- asset whose provenance nobody wrote down is an asset nobody can defend later,
  -- and the person who added it will not be the person who has to.
  ADD COLUMN IF NOT EXISTS art_license TEXT;

-- The two cannot come apart. A URL with no stated licence is the exact state this
-- column exists to prevent, and a licence note with no URL describes nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_products_art_licensed'
  ) THEN
    ALTER TABLE public.card_products
      ADD CONSTRAINT card_products_art_licensed
      CHECK ((art_url IS NULL) = (art_license IS NULL));
  END IF;
END $$;

-- https only. An http image on an https page is blocked as mixed content and would
-- render as a broken card rather than as an error anybody could diagnose.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'card_products_art_url_https'
  ) THEN
    ALTER TABLE public.card_products
      ADD CONSTRAINT card_products_art_url_https
      CHECK (art_url IS NULL OR art_url ~ '^https://');
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and the read-only policy
-- from 0031 already covers every column added here.

COMMENT ON COLUMN public.card_products.art_url IS
  'https URL to real card art, or NULL to draw the synthesized face. Ships empty on purpose: the images are issuer marketing assets and choosing a source is a licensing decision for the product owner, not the migration author. Populate from an issuer affiliate program''s brand pack, a licensed card-data vendor, or a deliberate decision about issuer-hosted URLs. One UPDATE per row to add or revert.';
COMMENT ON COLUMN public.card_products.art_license IS
  'Where the right to use art_url comes from, in words. Required whenever art_url is set, for the same reason source_url is required on a rate: an asset whose provenance nobody recorded is one nobody can defend later, and it will not be the same person answering for it.';
