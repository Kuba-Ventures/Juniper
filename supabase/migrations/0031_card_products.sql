-- Card rewards: a curated catalog of card products, the member's confirmation of
-- which product each linked account actually is, and a benefits checklist.
-- Issue #168. Idempotent, safe to re-run.
--
-- WHY A CATALOG AND NOT A FEED. No product Juniper integrates returns card
-- rewards terms. Plaid does not: `liabilities` returns APRs, limits and payment
-- data for a card, and nothing about what it earns. There is no free bureau or
-- issuer API for earn rates. So the terms are curated, and curated data goes
-- stale silently, which is the failure this schema is built to make impossible
-- to ship by accident.
--
-- THE PROVENANCE COLUMNS ARE NOT NULL ON PURPOSE. `source_url` and `as_of` are
-- required on every product, every earn row and every benefit. The Credit page
-- was rewritten once already to strip a fabricated score, a fabricated trend and
-- fabricated bureau factors that had all been presented as the member's own
-- (see the header of src/pages/app/credit.tsx). A rewards rate is the same trap
-- wearing a different hat: it reads as a fact and it is really a snapshot of a
-- marketing page. A row that cannot say where it came from cannot be inserted
-- here, so it can never be drawn.
--
-- `verified` IS FALSE ON EVERYTHING THE SEED WRITES, and the UI says so. The
-- seed in 0032 is a starting catalog assembled without contacting an issuer.
-- Flipping a row to true is a human asserting they opened `source_url` and the
-- terms still read that way. Same posture as the placeholder `partners.url`
-- values that gate monetization in 0010.

-- ── card_products ────────────────────────────────────────────────────────────
-- The catalog. Public to any signed-in member (it is reference data about cards,
-- not about anybody), written server-side only: the client never inserts here.
CREATE TABLE IF NOT EXISTS public.card_products (
  -- Slug, not a UUID, for the reason category ids are slugs: `chase-freedom-unlimited`
  -- in a failing query says what it is.
  id                 TEXT PRIMARY KEY,
  issuer             TEXT NOT NULL,
  network            TEXT,
  -- As the ISSUER spells it, trademark symbols included, so a member recognizing
  -- their own card is a straight string comparison.
  name               TEXT NOT NULL,
  annual_fee         NUMERIC NOT NULL DEFAULT 0,
  -- Hex, for the synthesized card face. Juniper does NOT ship issuer card art:
  -- those images are trademarked and licensed, and Credit Karma pays for the
  -- ones in the screenshots on #168. The face is drawn from this colour plus the
  -- issuer's own logo as served by Plaid, which Juniper is already licensed for
  -- through its Plaid agreement and already renders on Connections.
  brand_color        TEXT,
  -- Display word only: "cash back", "points", "miles".
  rewards_currency   TEXT NOT NULL DEFAULT 'cash back',
  -- Cents per point/mile. NULL on a cash-back card, where a cent is a cent.
  --
  -- A HOUSE NUMBER, not an issuer number, and the most arguable value in this
  -- table: transfer-partner redemptions can beat it by double and a statement
  -- credit can miss it by half. It is stored per product so a later revision can
  -- move one card without restating every comparison, and api/_rewards.ts carries
  -- an `assumesPointValue` flag out to the surface on any figure that used it.
  point_value_cents  NUMERIC,
  -- The everything-else rate, in `base_unit`.
  base_multiplier    NUMERIC NOT NULL DEFAULT 1,
  base_unit          TEXT NOT NULL DEFAULT 'percent',
  -- Where the terms above were read. Required.
  source_url         TEXT NOT NULL,
  -- When they were read. Required.
  as_of              DATE NOT NULL,
  -- Has a human re-checked this against source_url since it was seeded.
  verified           BOOLEAN NOT NULL DEFAULT FALSE,
  status             TEXT NOT NULL DEFAULT 'active',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_products_base_unit_check CHECK (base_unit IN ('percent','points','miles')),
  CONSTRAINT card_products_status_check CHECK (status IN ('active','inactive')),
  CONSTRAINT card_products_source_url_not_blank CHECK (length(btrim(source_url)) > 0),
  -- A points rate is meaningless without the valuation that makes it comparable,
  -- so the two cannot come apart: a card that earns points must carry a value.
  CONSTRAINT card_products_points_need_value CHECK (
    base_unit = 'percent' OR point_value_cents IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS card_products_issuer_idx ON public.card_products (lower(issuer));
CREATE INDEX IF NOT EXISTS card_products_status_idx ON public.card_products (status);

-- ── card_product_earn ────────────────────────────────────────────────────────
-- One row per bonus category. A card with no rows here earns its base rate
-- everywhere, which is exactly right for a flat-rate card.
CREATE TABLE IF NOT EXISTS public.card_product_earn (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     TEXT NOT NULL REFERENCES public.card_products(id) ON DELETE CASCADE,
  -- A Juniper taxonomy id, LEAF (`c_gas`) or GROUP (`g_fun_travel`), stored at
  -- whichever level the issuer's own bonus category actually matches. Both are
  -- allowed because "3% on gas" is a leaf and "2x on travel" is a group, and
  -- api/_rewards.ts resolves exact-before-group so a leaf row is never shadowed.
  category_id    TEXT NOT NULL,
  -- The label as it stood when the row was written, alongside the id, the same
  -- convention transactions follow: the id is the identity, the label is history.
  category_label TEXT NOT NULL,
  multiplier     NUMERIC NOT NULL,
  unit           TEXT NOT NULL DEFAULT 'percent',
  -- Spend above a cap does not stop earning, it drops to the card's BASE rate.
  -- Getting that wrong is the difference between a $90 recommendation and a $340
  -- one, so the cap and its window are both stored and neither is assumed.
  cap_amount     NUMERIC,
  cap_period     TEXT,
  -- The fine print, verbatim enough to be useful: "online grocery purchases
  -- only, excludes Target, Walmart and wholesale clubs".
  note           TEXT,
  source_url     TEXT NOT NULL,
  as_of          DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_product_earn_unit_check CHECK (unit IN ('percent','points','miles')),
  CONSTRAINT card_product_earn_cap_period_check CHECK (cap_period IS NULL OR cap_period IN ('month','quarter','year')),
  -- A cap amount with no window cannot be turned into an annual figure, and a
  -- window with no amount caps nothing. Neither half is useful alone.
  CONSTRAINT card_product_earn_cap_paired CHECK ((cap_amount IS NULL) = (cap_period IS NULL)),
  CONSTRAINT card_product_earn_multiplier_positive CHECK (multiplier > 0),
  CONSTRAINT card_product_earn_source_url_not_blank CHECK (length(btrim(source_url)) > 0)
);
-- One rate per category per card. Two rows for the same pair would make "what
-- does this card earn on gas" a coin toss.
CREATE UNIQUE INDEX IF NOT EXISTS card_product_earn_product_category_unique
  ON public.card_product_earn (product_id, category_id);

-- ── card_product_benefits ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.card_product_benefits (
  -- Slug, because the member's tick in card_benefit_uses references it and a
  -- readable key makes that join debuggable.
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES public.card_products(id) ON DELETE CASCADE,
  -- Perk family, for grouping the tracker: Travel, Airport, Shopping, Dining,
  -- Protection.
  benefit_group TEXT NOT NULL,
  name         TEXT NOT NULL,
  detail       TEXT,
  -- Dollar value where the benefit IS a credit. NULL where it is not a number
  -- (lounge access, primary rental coverage). Those are trackable but not
  -- summable, and the summary reports its total as partial rather than assigning
  -- them a guessed value.
  value_amount NUMERIC,
  -- How often the value comes back. NULL and 'once' both mean it does not.
  -- 'quarter' is here because rotating bonus categories are the most commonly
  -- missed benefit on a no-fee card and they must be ACTIVATED four times a
  -- year: a tracker that cannot represent a quarterly reset cannot remind
  -- anybody about the one perk they are most likely to forget.
  period       TEXT,
  source_url   TEXT NOT NULL,
  as_of        DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_product_benefits_period_check CHECK (period IS NULL OR period IN ('month','quarter','year','once')),
  CONSTRAINT card_product_benefits_source_url_not_blank CHECK (length(btrim(source_url)) > 0)
);
CREATE INDEX IF NOT EXISTS card_product_benefits_product_idx ON public.card_product_benefits (product_id);

-- The catalog is reference data about card products, not about any member, so
-- every signed-in member reads all of it. Still RLS-enabled with a read-only
-- policy rather than left open: an unprotected table is a table somebody widens
-- by accident later.
GRANT SELECT ON public.card_products TO authenticated;
GRANT SELECT ON public.card_product_earn TO authenticated;
GRANT SELECT ON public.card_product_benefits TO authenticated;

ALTER TABLE public.card_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_products_select_active ON public.card_products;
CREATE POLICY card_products_select_active ON public.card_products
  FOR SELECT USING (status = 'active');

ALTER TABLE public.card_product_earn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_product_earn_select_all ON public.card_product_earn;
CREATE POLICY card_product_earn_select_all ON public.card_product_earn
  FOR SELECT USING (TRUE);

ALTER TABLE public.card_product_benefits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_product_benefits_select_all ON public.card_product_benefits;
CREATE POLICY card_product_benefits_select_all ON public.card_product_benefits
  FOR SELECT USING (TRUE);

-- ── member_cards ─────────────────────────────────────────────────────────────
-- Which catalog product each of the member's linked credit accounts IS.
--
-- THE MEMBER ANSWERS THIS. NOTHING INFERS IT. Plaid returns an institution and
-- an account name, and the account name is routinely "CREDIT CARD" or "Card
-- ending 4021". Neither identifies a product. api/_rewards.ts `rankCandidates`
-- orders a picker and there is no threshold anywhere that promotes a guess into
-- a stored row, because attaching the wrong card's reward rates to somebody's
-- real spending produces confident, specific, wrong dollar advice, the failure
-- mode this whole surface exists to avoid.
CREATE TABLE IF NOT EXISTS public.member_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Plaid's account id, the same value transactions.account_id carries, which is
  -- what lets per-card spend be attributed.
  plaid_account_id  TEXT NOT NULL,
  -- NULL means the member confirmed their card is NOT in the catalog. That is a
  -- real answer, and a DIFFERENT state from never having been asked, which is the
  -- absence of a row. Without the distinction the picker would nag forever.
  product_id        TEXT REFERENCES public.card_products(id) ON DELETE SET NULL,
  confirmed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_cards_account_not_blank CHECK (length(btrim(plaid_account_id)) > 0)
);
-- One answer per account per member.
CREATE UNIQUE INDEX IF NOT EXISTS member_cards_user_account_unique
  ON public.member_cards (user_id, plaid_account_id);
CREATE INDEX IF NOT EXISTS member_cards_user_id_idx ON public.member_cards (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_cards TO authenticated;
ALTER TABLE public.member_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_cards_select_own ON public.member_cards;
CREATE POLICY member_cards_select_own ON public.member_cards
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS member_cards_insert_own ON public.member_cards;
CREATE POLICY member_cards_insert_own ON public.member_cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS member_cards_update_own ON public.member_cards;
CREATE POLICY member_cards_update_own ON public.member_cards
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS member_cards_delete_own ON public.member_cards;
CREATE POLICY member_cards_delete_own ON public.member_cards
  FOR DELETE USING (auth.uid() = user_id);

-- ── card_benefit_uses ────────────────────────────────────────────────────────
-- The benefits checklist: one row per benefit the member has ticked off, per
-- period.
--
-- `period_key` IS WHAT MAKES A MONTHLY CREDIT COME BACK WITHOUT A CRON JOB.
-- api/_rewards.ts computes the key from the benefit's period and today ('2026-08'
-- monthly, '2026' yearly, the literal 'once' for a one-time credit), so next
-- month the key changes, no row matches, and the benefit is unticked again. A
-- 'once' benefit keys to 'once' and therefore stays ticked forever, which is what
-- a signup bonus should do.
--
-- CALENDAR PERIODS, AND THE SURFACE SAYS SO. Plenty of real card credits reset on
-- the CARDMEMBER year, the anniversary of the account opening. Plaid's
-- `transactions` product does not return an account's open date, so a calendar
-- year is the only bucket Juniper can compute. Presenting it as the issuer's own
-- reset date would be a small lie that costs somebody a $120 credit, so the
-- tracker is framed as a checklist the member keeps rather than a statement about
-- the issuer's clock.
CREATE TABLE IF NOT EXISTS public.card_benefit_uses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  benefit_id  TEXT NOT NULL REFERENCES public.card_product_benefits(id) ON DELETE CASCADE,
  period_key  TEXT NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_benefit_uses_period_key_not_blank CHECK (length(btrim(period_key)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS card_benefit_uses_unique
  ON public.card_benefit_uses (user_id, benefit_id, period_key);
CREATE INDEX IF NOT EXISTS card_benefit_uses_user_id_idx ON public.card_benefit_uses (user_id);

GRANT SELECT, INSERT, DELETE ON public.card_benefit_uses TO authenticated;
ALTER TABLE public.card_benefit_uses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS card_benefit_uses_select_own ON public.card_benefit_uses;
CREATE POLICY card_benefit_uses_select_own ON public.card_benefit_uses
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS card_benefit_uses_insert_own ON public.card_benefit_uses;
CREATE POLICY card_benefit_uses_insert_own ON public.card_benefit_uses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS card_benefit_uses_delete_own ON public.card_benefit_uses;
CREATE POLICY card_benefit_uses_delete_own ON public.card_benefit_uses
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.card_products IS
  'Curated catalog of credit-card products and their published terms. No integrated provider returns rewards terms (Plaid liabilities returns APRs and limits, not earn rates), so this is hand-assembled. source_url and as_of are NOT NULL so no row can exist without provenance; verified is FALSE until a human re-checks it against the issuer page, and the UI says so.';
COMMENT ON COLUMN public.card_products.point_value_cents IS
  'House valuation in cents per point/mile, the disclosed assumption behind every comparison between a points card and a cash-back card. Not an issuer figure. api/_rewards.ts flags any number that used it.';
COMMENT ON TABLE public.member_cards IS
  'Which catalog product each linked credit account is. The MEMBER confirms this; nothing infers it. Plaid account names are routinely "CREDIT CARD", and a wrong guess attaches the wrong reward rates to real spending. product_id NULL means "confirmed not in the catalog", which is different from the absence of a row, which means "not asked yet".';
COMMENT ON TABLE public.card_benefit_uses IS
  'Benefits the member has ticked off, one row per benefit per period. period_key (2026-08 / 2026-Q3 / 2026 / once) is computed in api/_rewards.ts and is what makes a recurring credit reset with no cron job. Periods are CALENDAR periods; many issuers reset on the cardmember year, which Juniper cannot know because Plaid does not return an account open date, so the surface presents this as the member''s own checklist.';
