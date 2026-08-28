-- The name the inviter types for their partner in the invite modal. It was
-- accepted by /api/partner and then dropped, because there was nowhere to put
-- it, so the invited person met a generic "What should we call you?" instead of
-- being greeted by the name the person who invited them already gave.
--
-- Numbered 0019, not 0016: 0016 to 0018 were already taken when this was
-- written, and it briefly shipped as a duplicate 0016.
--
-- Server-only like the rest of 0012: no grants, the Edge function mediates.
-- Idempotent, safe to re-run.
ALTER TABLE public.partnerships
  ADD COLUMN IF NOT EXISTS invited_name TEXT;
