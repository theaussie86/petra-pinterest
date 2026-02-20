-- The trg_generate_metadata trigger was UPDATE-only, so pins inserted with
-- status = 'generate_metadata' never triggered the edge function.
-- The trigger function already handles INSERT correctly (OLD is NULL →
-- OLD.status IS DISTINCT FROM 'generate_metadata' = TRUE).
-- We just need to add INSERT to the trigger event.

DROP TRIGGER IF EXISTS trg_generate_metadata ON public.pins;

CREATE TRIGGER trg_generate_metadata
  BEFORE INSERT OR UPDATE ON public.pins
  FOR EACH ROW
  EXECUTE FUNCTION trigger_metadata_generation();
