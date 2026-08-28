-- Nothing crosses to the other person until it is explicitly shared.
--
-- share_balances shipped as DEFAULT TRUE, and api/partner.ts carried the same
-- default in code, so the moment an invite was accepted every one of the
-- inviter's accounts became visible to their partner at "balance only". Nobody
-- was ever asked. The invite modal, meanwhile, promises the opposite in
-- writing: "your accounts, net worth, and spending stay private".
--
-- Two changes, both in the revoking direction, which is the safe one:
--   1. the column default becomes FALSE for every partnership formed from here,
--   2. existing rows are set FALSE, closing the exposure on partnerships that
--      were formed under the old default.
--
-- Members re-share deliberately through the share sheet, which writes
-- account_shares rows and is unaffected by this. Idempotent, safe to re-run.
ALTER TABLE public.partner_sharing_prefs
  ALTER COLUMN share_balances SET DEFAULT FALSE;

UPDATE public.partner_sharing_prefs
   SET share_balances = FALSE
 WHERE share_balances IS TRUE;
