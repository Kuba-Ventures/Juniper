-- Stage 3a: the data spine — transactions, budgets, and net-worth history.
-- Idempotent — safe to re-run.
--
-- Unlike plaid_items (0007, server-only token store), these hold the user's own
-- financial data and ARE client-readable: GRANT to `authenticated` + owner RLS
-- (auth.uid() = user_id), same as plans (0002). The Plaid access_token never
-- appears here. The transactions sync writes with the service-role key
-- (bypasses RLS), so it must scope every write by user_id itself.

-- ── transactions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id               TEXT,                     -- Plaid item this came from
  account_id            TEXT,                     -- Plaid account id
  plaid_transaction_id  TEXT UNIQUE,              -- dedup key for /transactions/sync upserts
  name                  TEXT,
  merchant_name         TEXT,
  amount                NUMERIC NOT NULL,         -- Plaid convention: positive = money out
  iso_currency_code     TEXT DEFAULT 'USD',
  date                  DATE NOT NULL,
  pending               BOOLEAN NOT NULL DEFAULT FALSE,
  plaid_category        TEXT,                     -- personal_finance_category.primary
  category              TEXT,                     -- resolved Juniper category
  category_source       TEXT NOT NULL DEFAULT 'plaid',  -- plaid | rule | user
  is_recurring          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_category_source_check
    CHECK (category_source IN ('plaid','rule','user'))
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx      ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS transactions_user_date_idx    ON public.transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS transactions_user_cat_idx     ON public.transactions (user_id, category);

GRANT SELECT, UPDATE ON public.transactions TO authenticated;  -- read own + edit category; sync writes via service_role

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS transactions_update_own ON public.transactions;
CREATE POLICY transactions_update_own ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── budgets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  limit_amount  NUMERIC NOT NULL,
  period        TEXT NOT NULL DEFAULT 'monthly',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT budgets_period_check CHECK (period IN ('monthly'))
);
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_cat_period_unique
  ON public.budgets (user_id, category, period);
CREATE INDEX IF NOT EXISTS budgets_user_id_idx ON public.budgets (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_select_own ON public.budgets;
CREATE POLICY budgets_select_own ON public.budgets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS budgets_insert_own ON public.budgets;
CREATE POLICY budgets_insert_own ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS budgets_update_own ON public.budgets;
CREATE POLICY budgets_update_own ON public.budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS budgets_delete_own ON public.budgets;
CREATE POLICY budgets_delete_own ON public.budgets FOR DELETE USING (auth.uid() = user_id);

-- ── net_worth_snapshots ──────────────────────────────────────────────────────
-- Plaid returns only *current* balances, so we snapshot daily to build a trend.
-- One row per (user, day). Written server-side (service_role); read own.
CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of       DATE NOT NULL,
  assets      NUMERIC NOT NULL DEFAULT 0,
  debts       NUMERIC NOT NULL DEFAULT 0,
  net_worth   NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS net_worth_user_asof_unique
  ON public.net_worth_snapshots (user_id, as_of);
CREATE INDEX IF NOT EXISTS net_worth_user_id_idx ON public.net_worth_snapshots (user_id);

GRANT SELECT ON public.net_worth_snapshots TO authenticated;

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS net_worth_select_own ON public.net_worth_snapshots;
CREATE POLICY net_worth_select_own ON public.net_worth_snapshots
  FOR SELECT USING (auth.uid() = user_id);

-- ── plaid_items: cursor for /transactions/sync ───────────────────────────────
-- Server-only table (0007) — no grant change; just track the sync cursor per item.
ALTER TABLE public.plaid_items ADD COLUMN IF NOT EXISTS transactions_cursor TEXT;

-- ── updated_at triggers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS transactions_touch_updated_at ON public.transactions;
CREATE TRIGGER transactions_touch_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS budgets_touch_updated_at ON public.budgets;
CREATE TRIGGER budgets_touch_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
