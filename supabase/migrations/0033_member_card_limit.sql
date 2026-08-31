-- A credit limit the member supplies, for a card their bank does not report one
-- for. Issue #211. Idempotent, safe to re-run.
--
-- ── WHY THIS IS NEEDED AT ALL ───────────────────────────────────────────────
--
-- Plaid returns `balances.limit` for a credit account only when the issuer sends
-- it, and plenty do not. On this member's real production data, Chase reports a
-- $9,000 limit while Capital One and Discover report none, so overall
-- utilization is computed from one card of three and the page says so ("2 more
-- excluded for reporting no limit"). Nothing is wrong with that number; it is
-- just answering a smaller question than the member asked. The limit is printed
-- on their statement, so they can supply it.
--
-- ── IT LIVES ON member_cards, NOT IN A TABLE OF ITS OWN ─────────────────────
--
-- Same grain: one row per (member, linked credit account), holding what the
-- member has told Juniper about that card. #168 put the product answer there and
-- this is the second such fact. A second table at an identical grain would mean
-- two joins and two places to look.
--
-- ── product_answered EXISTS BECAUSE ROW EXISTENCE STOPPED MEANING ANYTHING ───
--
-- #168 read "a row exists for this account" as "the member has answered which
-- product it is", and that was sound while the row could only be created by
-- answering. `product_id IS NULL` is itself a real answer there ("my card is not
-- in your catalog"), so the presence of the row is the only thing separating
-- "answered, not in the catalog" from "never asked".
--
-- Once a row can be created purely to hold a limit, that inference breaks, and it
-- breaks silently in the worst direction: the Identify prompt would decide the
-- member had answered and stop asking, so a card would never get its rewards
-- data and nothing on screen would explain why.
--
-- DEFAULT TRUE is deliberate and is why this migration needs no backfill
-- statement: every row that exists today was created by a product answer, so the
-- default is already correct for all of them. Only the limit endpoint inserts
-- FALSE, and only when it is creating a row for a card nobody has identified yet.
--
-- ── IT MUST NEVER REACH THE JUNIPER SCORE ───────────────────────────────────
--
-- api/_finance-snapshot.ts computes `creditUtilization` from `plaid_items`
-- balances and limits, and that feeds the Score's credit factor at weight 0.15.
-- It does NOT read this column, deliberately, and there is a comment there saying
-- so. A member could otherwise raise their own Juniper Score by typing a
-- generous number, with nothing on screen to show why it moved. #146 removed a
-- flat placeholder from that factor for the same reason: the Score is a figure
-- Juniper asserts, so it is built only from what Juniper can measure. Utilization
-- on the Credit page is a different claim, made to the member about their own
-- number, and labelled as theirs.

ALTER TABLE public.member_cards
  -- NULL means the member has not supplied one. Positive only: a zero or
  -- negative limit is not a limit, and dividing a balance by it would produce
  -- either an infinity or a negative percentage on a money page.
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC,
  -- When they supplied it, so the surface can say how old the number is. A limit
  -- changes when an issuer raises it and Juniper will never hear about that.
  ADD COLUMN IF NOT EXISTS credit_limit_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS product_answered BOOLEAN NOT NULL DEFAULT TRUE;

-- Guard rather than trust: this value arrives from a text field.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_cards_credit_limit_positive'
  ) THEN
    ALTER TABLE public.member_cards
      ADD CONSTRAINT member_cards_credit_limit_positive
      CHECK (credit_limit IS NULL OR credit_limit > 0);
  END IF;
END $$;

-- The two halves cannot come apart: a limit with no date cannot be aged, and a
-- date with no limit describes nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_cards_credit_limit_dated'
  ) THEN
    ALTER TABLE public.member_cards
      ADD CONSTRAINT member_cards_credit_limit_dated
      CHECK ((credit_limit IS NULL) = (credit_limit_set_at IS NULL));
  END IF;
END $$;

-- No new GRANT and no new policy: grants are table-level and the owner-scoped
-- RLS from 0031 already covers every column added here.

COMMENT ON COLUMN public.member_cards.credit_limit IS
  'A credit limit the member typed, for a card whose issuer does not report one through Plaid. NULL means they have not supplied one. Shown on the Credit page with a "You set this" badge, and DELIBERATELY NOT read by api/_finance-snapshot.ts, so it cannot move the Juniper Score: otherwise a member could raise their own score by entering a generous number.';
COMMENT ON COLUMN public.member_cards.product_answered IS
  'Whether the member has answered which product this card is. Needed because product_id NULL is itself a valid answer ("not in your catalog"), so row existence used to carry this meaning and stopped being able to once a row could be created just to hold a credit_limit. DEFAULT TRUE is why no backfill is needed: every row predating this migration was created by a product answer.';
