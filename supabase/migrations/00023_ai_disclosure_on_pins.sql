-- ============================================================================
-- Migration: AI disclosure on Pins (Pinterest Pflicht-Kennzeichnung)
-- ============================================================================
-- Pinterest requires creators to disclose AI involvement in a Pin's image,
-- sent on POST /v5/pins as ai_disclosures.values (UPPERCASE enums).
--
-- Persisted as two boolean columns (see docs/adr/0001-ai-disclosure-on-pins.md):
--   - ai_modified          -- image generated/altered with AI (broad)
--   - synthetic_performer  -- a fully AI-invented, fictional human (narrow)
--
-- Backfill: DEFAULT true on ai_modified marks every existing Pin as AI-modified,
-- which is correct for this app (essentially all images are AI-generated). No
-- separate data-migration script is needed. synthetic_performer defaults false.
--
-- RLS policies on pins remain unchanged (same tenant_id scope).

BEGIN;

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS ai_modified boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS synthetic_performer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pins.ai_modified IS
  'AI disclosure: image was generated or altered with AI. Maps to the Pinterest ai_disclosures value AI_MODIFIED. Defaults true (compliant-by-default; all images are AI-generated).';

COMMENT ON COLUMN public.pins.synthetic_performer IS
  'AI disclosure: image depicts a fully AI-invented, fictional human (not a real identifiable person). Maps to the Pinterest ai_disclosures value SYNTHETIC_PERFORMER and implies AI_MODIFIED. Defaults false.';

COMMIT;
