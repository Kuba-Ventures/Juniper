-- Stage 5 (seed): populate the partners catalog so the Recommended marketplace
-- reads from the DB (editable without a deploy) instead of the hard-coded seed.
-- Idempotent — safe to re-run (unique name + ON CONFLICT DO NOTHING).
--
-- These mirror the frontend seed catalog (src/lib/mock-data.ts `listings`). Every
-- `url` is a PLACEHOLDER until an approved affiliate program clears compliance.
-- `est_benefit` is an ILLUSTRATIVE annual $ benefit to the member, used only for
-- benefit-ranking (never payout) — replace with real modeled values later.

-- `headline` is the short stat line shown on a card ("4.30% APY", "0% APR · 21 mo").
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS headline TEXT;

-- Stable key so re-running the seed doesn't duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS partners_name_unique ON public.partners (name);

INSERT INTO public.partners
  (name, category, headline, blurb, tags, url, source, est_benefit, sort_order, status)
VALUES
  ('SoFi', 'Debt', '0% APR · 21 mo',
   'Balance transfers with no interest for up to 21 months and no annual fee.',
   ARRAY['Balance transfer','No fee'], 'https://example.com/partners/sofi', 'curated', 450, 10, 'active'),
  ('Earnest', 'Debt', 'from 4.9% APR',
   'Refinance your student loans with flexible terms and no fees.',
   ARRAY['Student refi'], 'https://example.com/partners/earnest', 'curated', 600, 20, 'active'),
  ('Marcus', 'Saving', '4.30% APY',
   'High-yield savings with no minimums and no fees.',
   ARRAY['No minimums'], 'https://example.com/partners/marcus', 'curated', 210, 30, 'active'),
  ('Wealthfront', 'Saving', '4.25% APY',
   'Cash account with automated saving buckets and no fees.',
   ARRAY['4.25% APY'], 'https://example.com/partners/wealthfront', 'self-listed', 190, 40, 'active'),
  ('Ally', 'Banking', 'Checking + HYSA',
   'Online checking and savings that play nicely with everything.',
   ARRAY['Checking','HYSA'], 'https://example.com/partners/ally', 'curated', 120, 50, 'active'),
  ('Fidelity', 'Investing', '$0 commissions',
   'Roth IRA and brokerage with no commissions on stocks & ETFs.',
   ARRAY['Roth IRA'], 'https://example.com/partners/fidelity', 'curated', 150, 60, 'active'),
  ('Betterment', 'Investing', 'Auto-invest',
   'Automated, low-fee portfolios that rebalance for you.',
   ARRAY['Robo-advisor'], 'https://example.com/partners/betterment', 'self-listed', 140, 70, 'active'),
  ('Policygenius', 'Insurance', 'Term life',
   'Compare term life quotes from top carriers in a few minutes.',
   ARRAY['Term life'], 'https://example.com/partners/policygenius', 'curated', 100, 80, 'active'),
  ('Trust & Will', 'Estate', 'Wills & trusts',
   'Set up a legal will or trust online — worth it before the baby arrives.',
   ARRAY['Wills','Trusts'], 'https://example.com/partners/trust-will', 'curated', 90, 90, 'active')
ON CONFLICT (name) DO NOTHING;
