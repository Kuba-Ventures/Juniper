-- Which catalog card a manually-added account IS, for identity only.
--
-- ---- WHY ------------------------------------------------------------------
--
-- A hand-entered card draws as a neutral face with no artwork and no brand
-- colour, because nothing said which product it is. The catalog already holds
-- the artwork: 0038 recorded chase-freedom-unlimited.webp, and nothing has ever
-- been able to point at it from a manual account. The member can see their own
-- card in the wallet since the wallet learned to draw them, and it is the only
-- one in the pocket without a face.
--
-- ---- IDENTITY ONLY, AND THAT IS THE WHOLE DESIGN --------------------------
--
-- This column buys the card its NAME, its BRAND COLOUR and its ART. It buys
-- nothing else, and the boundary is not a phase-one compromise, it is the
-- correct end state given what a manual account is.
--
-- The rewards maths in api/_rewards.ts keys on per-ACCOUNT spend, taken from
-- `transactions.account_id`. A hand-entered account has no Plaid account id and
-- therefore no transactions, ever. So an earning guide row, a switch idea or a
-- benefits tracker entry built on this card would be computed from an empty
-- spend set: "you are losing $0 a year by using the wrong card here" is not a
-- true statement about a card, it is a statement about missing data. Naming the
-- product must not turn missing data into a confident zero.
--
-- Concretely, api/card-rewards.ts must keep this product OUT of its `products`
-- map, which is what feeds the guide, the switches and the upgrades. It resolves
-- only name, short_name, brand_color and art_url for the face.
--
-- ---- AND IT STILL MUST NOT REACH THE SCORE --------------------------------
--
-- Unchanged from 0046 and worth restating, because this migration makes a manual
-- card look more like a linked one and that is exactly when a rule gets
-- forgotten. `manual_accounts.credit_limit` stays out of the Juniper Score, the
-- shared `fetchManualAccounts` select still does not request it, and
-- scripts/src/check-manual-limit-isolation.ts still asserts it.
--
-- NULL means the member has not said, which is the state every existing row is
-- in and a perfectly good place to stay: the neutral face is honest.
--
-- Idempotent, safe to re-run. Pure ASCII, per docs/CARD_REWARDS.md.

ALTER TABLE public.manual_accounts
  ADD COLUMN IF NOT EXISTS product_id TEXT;

-- ON DELETE SET NULL, matching member_cards in 0031: retiring a catalog product
-- must not delete somebody's account, it must only stop naming it. Added
-- separately from the column so a re-run does not attempt a duplicate
-- constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_accounts_product_fk'
  ) THEN
    ALTER TABLE public.manual_accounts
      ADD CONSTRAINT manual_accounts_product_fk
      FOREIGN KEY (product_id) REFERENCES public.card_products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A product on a checking account is meaningless, the same rule 0046 applies to
-- the credit limit and for the same reason: made unrepresentable rather than
-- merely discouraged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_accounts_product_category'
  ) THEN
    ALTER TABLE public.manual_accounts
      ADD CONSTRAINT manual_accounts_product_category
      CHECK (product_id IS NULL OR category = 'credit');
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and the owner-scoped
-- RLS from 0014 already covers every column added here.

COMMENT ON COLUMN public.manual_accounts.product_id IS
  'Which catalog card this hand-entered account is, for IDENTITY ONLY: name, brand colour and art. Deliberately NOT used for rewards, benefits or switch ideas, because those key on per-account spend from transactions.account_id and a hand-entered account has no transactions, so any figure would be computed from an empty spend set and read as a confident zero. NULL means the member has not said, and the neutral face is the honest answer. Only valid on category = credit, enforced by CHECK.';

-- Expect: every existing row unchanged with product_id NULL, because nothing
-- written before today had a product to record.
SELECT count(*)                                          AS manual_accounts,
       count(*) FILTER (WHERE category = 'credit')        AS credit_accounts,
       count(*) FILTER (WHERE product_id IS NOT NULL)     AS named
  FROM public.manual_accounts;
