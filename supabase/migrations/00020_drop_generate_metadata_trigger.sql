-- Drop the generate_metadata trigger and function
-- These were causing double-triggering: the DB trigger called the Edge Function
-- while the app also dispatched to Trigger.dev after pin creation.
--
-- Metadata generation is now handled exclusively by:
-- - Trigger.dev (primary, via triggerMetadataViaTriggerDevFn)
-- - Edge Function fallback (via triggerBulkMetadataFn when Trigger.dev disabled)
--
-- The Edge Function 'generate-metadata-single' is kept for the fallback path.

DROP TRIGGER IF EXISTS trg_generate_metadata ON public.pins;
DROP FUNCTION IF EXISTS public.trigger_metadata_generation();
