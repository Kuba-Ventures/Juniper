-- Merchant rules: "always categorize Blue Bottle as Coffee shops".
-- Idempotent, safe to re-run.
--
-- `category_source` has carried a 'rule' value since migration 0008 and nothing
-- has ever written one. This is the table behind it.
--
-- MATCHED ON PLAID'S MERCHANT NAME, lowercased, and nothing cleverer. Stripping
-- store numbers or payment-processor prefixes ("SQ *BLUE BOTTLE #241") is the
-- kind of guess that files somebody's charge in the wrong place, and a rule
-- that catches a merchant the member never named is worse than one that misses.
-- Rows where Plaid gave no merchant at all cannot be matched, by construction.
--
-- PRECEDENCE IS user, THEN rule, THEN plaid, decided in api/_category-precedence.ts.
-- A rule is a statement about a merchant and a correction is a statement about a
-- charge, so the more specific one wins: a member who rules "Amazon is Shopping"
-- and then files one Amazon charge under Groceries keeps that charge under
-- Groceries through every future sync.
CREATE TABLE IF NOT EXISTS public.merchant_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- As Plaid spells it, for showing back to the member.
  merchant     TEXT NOT NULL,
  -- The label the rule assigns. Stored alongside the id for the same reason
  -- transactions do: the id is the identity, the label is what was current.
  category     TEXT NOT NULL,
  category_id  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_rules_merchant_not_blank CHECK (length(btrim(merchant)) > 0)
);

-- One rule per merchant per member. Case-insensitive, because "AMAZON" and
-- "Amazon" are the same shop and two rules for it would be a coin toss.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_rules_user_merchant_unique
  ON public.merchant_rules (user_id, lower(btrim(merchant)));
CREATE INDEX IF NOT EXISTS merchant_rules_user_id_idx ON public.merchant_rules (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_rules TO authenticated;

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merchant_rules_select_own ON public.merchant_rules;
CREATE POLICY merchant_rules_select_own ON public.merchant_rules
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS merchant_rules_insert_own ON public.merchant_rules;
CREATE POLICY merchant_rules_insert_own ON public.merchant_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS merchant_rules_update_own ON public.merchant_rules;
CREATE POLICY merchant_rules_update_own ON public.merchant_rules
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS merchant_rules_delete_own ON public.merchant_rules;
CREATE POLICY merchant_rules_delete_own ON public.merchant_rules
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.merchant_rules IS
  'Always categorize this merchant as this category. Applied on sync and retroactively when the rule is made. Deleting a rule stops it applying to new charges; it does not undo the ones it already set, because the original classification is not kept.';
