-- Stage 5: Marketplace supply side — DB-backed partner offers + a self-listing
-- moderation queue, so offers can change without a deploy and real merchants can
-- list themselves. Idempotent — safe to re-run.
--
-- COMPLIANCE: every offer `url` stays a placeholder until an approved affiliate
-- program + category disclosures/licensing clear (mortgage, insurance, credit,
-- legal). Nothing here flips a monetized link live on its own — it's the plumbing.

-- ── partners ─────────────────────────────────────────────────────────────────
-- The marketplace catalog. Public to any signed-in user (it's a marketplace), so
-- GRANT SELECT + an RLS read policy limited to active rows. Written server-side
-- (service_role) — the client never inserts here; merchants go through
-- partner_submissions and an admin promotes approved ones into this table.
CREATE TABLE IF NOT EXISTS public.partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,               -- e.g. "High-yield savings"
  domain        TEXT,                        -- plan-domain key: home-buying, debt-paydown, …
  blurb         TEXT,                        -- one-liner for a listing card
  description   TEXT,                        -- fuller line for the featured hero
  fit           TEXT,                        -- the "Why this: …" line
  tags          TEXT[] NOT NULL DEFAULT '{}',
  url           TEXT NOT NULL,               -- PLACEHOLDER referral URL until compliance clears
  logo_url      TEXT,
  source        TEXT NOT NULL DEFAULT 'curated',   -- curated | scraped | self-listed
  status        TEXT NOT NULL DEFAULT 'active',    -- active | inactive
  -- Estimated *user* benefit (e.g. $/yr saved or earned). Ranking uses this, never
  -- payout — see api/_offers.ts. NULL = unranked, sorts after ranked offers.
  est_benefit   NUMERIC,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partners_source_check CHECK (source IN ('curated','scraped','self-listed')),
  CONSTRAINT partners_status_check CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS partners_domain_idx ON public.partners (domain);
CREATE INDEX IF NOT EXISTS partners_status_idx ON public.partners (status);

GRANT SELECT ON public.partners TO authenticated;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_select_active ON public.partners;
CREATE POLICY partners_select_active ON public.partners
  FOR SELECT USING (status = 'active');   -- catalog is shared; only active rows are visible

-- ── partner_submissions ──────────────────────────────────────────────────────
-- The self-listing moderation queue (the supply side). A signed-in merchant
-- submits their offer; it lands 'pending' and an admin (service_role) approves or
-- rejects, then promotes approved ones into `partners`. Submitters can read their
-- own submissions to see status; they can't read anyone else's or edit after
-- submitting.
CREATE TABLE IF NOT EXISTS public.partner_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  url            TEXT NOT NULL,
  contact_email  TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  notes          TEXT,                              -- internal moderation notes
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  CONSTRAINT partner_submissions_status_check CHECK (status IN ('pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS partner_submissions_status_idx ON public.partner_submissions (status);
CREATE INDEX IF NOT EXISTS partner_submissions_submitter_idx ON public.partner_submissions (submitted_by);

GRANT SELECT, INSERT ON public.partner_submissions TO authenticated;

ALTER TABLE public.partner_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_submissions_insert_own ON public.partner_submissions;
CREATE POLICY partner_submissions_insert_own ON public.partner_submissions
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);
DROP POLICY IF EXISTS partner_submissions_select_own ON public.partner_submissions;
CREATE POLICY partner_submissions_select_own ON public.partner_submissions
  FOR SELECT USING (auth.uid() = submitted_by);

-- ── updated_at trigger (reuses public.touch_updated_at from 0008) ────────────
DROP TRIGGER IF EXISTS partners_touch_updated_at ON public.partners;
CREATE TRIGGER partners_touch_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
