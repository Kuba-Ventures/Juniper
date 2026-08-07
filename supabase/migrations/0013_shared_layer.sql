-- Stage 7: finish the shared data layer — per-account sharing, shared bills, and
-- the shared activity/chat. Idempotent. All SERVER-ONLY (restrictive RLS), same
-- posture as 0012: the /api/partner* Edge functions mediate every read/write and
-- enforce membership + sharing prefs themselves.

-- ── account_shares: per-account visibility to the partner ─────────────────────
-- Refines the coarse share_balances pref into a per-account choice.
--   shared  = joint/shared account (shown in the Shared group, full balance)
--   balance = balance visible, transactions hidden
--   private = hidden from the partner entirely
CREATE TABLE IF NOT EXISTS public.account_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id  UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL,               -- Plaid account_id
  scope           TEXT NOT NULL DEFAULT 'balance',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_shares_scope_check CHECK (scope IN ('shared','balance','private')),
  CONSTRAINT account_shares_unique UNIQUE (partnership_id, user_id, account_id)
);
CREATE INDEX IF NOT EXISTS account_shares_pid_idx ON public.account_shares (partnership_id);

-- ── shared_bills ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id  UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  amount          NUMERIC NOT NULL DEFAULT 0,
  due_day         INTEGER,                      -- day of month (1–31)
  payer_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = shared / split
  split           BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shared_bills_pid_idx ON public.shared_bills (partnership_id);

-- ── shared_messages + reactions (the chat / activity) ────────────────────────
-- A message may optionally hang off a transaction (txn_ref = plaid_transaction_id)
-- so partners can chat about a specific charge; txn_merchant is a display cache.
CREATE TABLE IF NOT EXISTS public.shared_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id  UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  txn_ref         TEXT,
  txn_merchant    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shared_messages_pid_idx ON public.shared_messages (partnership_id, created_at DESC);

-- Reactions target either a message id or a txn_ref (both are text).
CREATE TABLE IF NOT EXISTS public.shared_reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id  UUID NOT NULL REFERENCES public.partnerships(id) ON DELETE CASCADE,
  target          TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shared_reactions_unique UNIQUE (partnership_id, target, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS shared_reactions_pid_idx ON public.shared_reactions (partnership_id, target);

-- ── Lock down: server-only, restrictive RLS ──────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_shares','shared_bills','shared_messages','shared_reactions']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_no_client_access ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_no_client_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t, t);
  END LOOP;
END$$;

DROP TRIGGER IF EXISTS account_shares_touch ON public.account_shares;
CREATE TRIGGER account_shares_touch BEFORE UPDATE ON public.account_shares
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS shared_bills_touch ON public.shared_bills;
CREATE TRIGGER shared_bills_touch BEFORE UPDATE ON public.shared_bills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
