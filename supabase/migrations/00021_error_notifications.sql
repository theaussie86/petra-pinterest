-- ============================================================================
-- Migration: Error Notification E-Mails (Resend)
-- ============================================================================
-- Adds:
--   - blog_projects.notification_email     -- per-project recipient (optional;
--                                             falls back to tenant user's auth email)
--   - pins.error_notified_at               -- throttle: at most one mail per
--                                             error episode for a given pin
--   - trigger reset_error_notified_at      -- clears error_notified_at whenever
--                                             a pin transitions away from 'error'
--
-- Pin status uses English values since migration 00007. The trigger therefore
-- checks for 'error', not 'fehler'.

BEGIN;

ALTER TABLE public.blog_projects
  ADD COLUMN IF NOT EXISTS notification_email text;

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS error_notified_at timestamptz;

COMMENT ON COLUMN public.blog_projects.notification_email IS
  'Optional recipient for error notification e-mails. Falls back to the tenant user''s login e-mail when NULL.';

COMMENT ON COLUMN public.pins.error_notified_at IS
  'Timestamp of the last error notification e-mail sent for this pin. NULL = no mail sent for the current error episode. Reset automatically by trigger when status changes away from ''error''.';

-- Reset notification timestamp whenever a pin leaves the 'error' status,
-- so a future failure (e.g. after a manual retry) triggers a fresh mail.
CREATE OR REPLACE FUNCTION public.reset_error_notified_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'error' AND NEW.status IS DISTINCT FROM 'error' THEN
    NEW.error_notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pins_reset_error_notified_at ON public.pins;

CREATE TRIGGER pins_reset_error_notified_at
  BEFORE UPDATE OF status ON public.pins
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_error_notified_at();

COMMIT;
