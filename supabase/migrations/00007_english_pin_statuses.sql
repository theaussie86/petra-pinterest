-- ============================================================================
-- Migration: English Pin Statuses
-- ============================================================================
-- Converts all pin status values from German to English.
-- Removes 3 unused pin generation statuses (pin_generieren, pin_wird_generiert, pin_generiert).
-- Keeps German display labels in the application layer.
--
-- Status mapping:
--   entwurf                  -> draft
--   bereit_fuer_generierung  -> ready_for_generation
--   metadaten_generieren     -> generate_metadata
--   metadaten_werden_generiert -> generating_metadata
--   metadaten_erstellt       -> metadata_created
--   bereit_zum_planen        -> ready_to_schedule
--   veroeffentlicht          -> published
--   fehler                   -> error
--   loeschen                 -> deleted
--   pin_generieren           -> draft (removed status, fallback)
--   pin_wird_generiert       -> draft (removed status, fallback)
--   pin_generiert            -> draft (removed status, fallback)

BEGIN;

-- ============================================================================
-- Step 1: Drop existing CHECK constraints
-- ============================================================================

-- Drop the status CHECK constraint on pins table
-- The constraint name is auto-generated from the inline CHECK in CREATE TABLE
ALTER TABLE public.pins DROP CONSTRAINT IF EXISTS pins_status_check;

-- Drop the previous_status CHECK constraint (added in migration 00006)
ALTER TABLE public.pins DROP CONSTRAINT IF EXISTS pins_previous_status_check;

-- ============================================================================
-- Step 2: Update existing rows - map German values to English
-- ============================================================================

-- Map status column
UPDATE public.pins SET status = 'draft' WHERE status IN ('entwurf', 'pin_generieren', 'pin_wird_generiert', 'pin_generiert');
UPDATE public.pins SET status = 'ready_for_generation' WHERE status = 'bereit_fuer_generierung';
UPDATE public.pins SET status = 'generate_metadata' WHERE status = 'metadaten_generieren';
UPDATE public.pins SET status = 'generating_metadata' WHERE status = 'metadaten_werden_generiert';
UPDATE public.pins SET status = 'metadata_created' WHERE status = 'metadaten_erstellt';
UPDATE public.pins SET status = 'ready_to_schedule' WHERE status = 'bereit_zum_planen';
UPDATE public.pins SET status = 'published' WHERE status = 'veroeffentlicht';
UPDATE public.pins SET status = 'error' WHERE status = 'fehler';
UPDATE public.pins SET status = 'deleted' WHERE status = 'loeschen';

-- Map previous_status column
UPDATE public.pins SET previous_status = 'draft' WHERE previous_status IN ('entwurf', 'pin_generieren', 'pin_wird_generiert', 'pin_generiert');
UPDATE public.pins SET previous_status = 'ready_for_generation' WHERE previous_status = 'bereit_fuer_generierung';
UPDATE public.pins SET previous_status = 'generate_metadata' WHERE previous_status = 'metadaten_generieren';
UPDATE public.pins SET previous_status = 'generating_metadata' WHERE previous_status = 'metadaten_werden_generiert';
UPDATE public.pins SET previous_status = 'metadata_created' WHERE previous_status = 'metadaten_erstellt';
UPDATE public.pins SET previous_status = 'ready_to_schedule' WHERE previous_status = 'bereit_zum_planen';
UPDATE public.pins SET previous_status = 'published' WHERE previous_status = 'veroeffentlicht';
UPDATE public.pins SET previous_status = 'error' WHERE previous_status = 'fehler';
UPDATE public.pins SET previous_status = 'deleted' WHERE previous_status = 'loeschen';

-- ============================================================================
-- Step 3: Add new CHECK constraints with English values (9 statuses)
-- ============================================================================

ALTER TABLE public.pins
  ADD CONSTRAINT pins_status_check CHECK (status IN (
    'draft',
    'ready_for_generation',
    'generate_metadata',
    'generating_metadata',
    'metadata_created',
    'ready_to_schedule',
    'published',
    'error',
    'deleted'
  ));

ALTER TABLE public.pins
  ADD CONSTRAINT pins_previous_status_check CHECK (
    previous_status IS NULL OR previous_status IN (
      'draft',
      'ready_for_generation',
      'generate_metadata',
      'generating_metadata',
      'metadata_created',
      'ready_to_schedule',
      'published',
      'error',
      'deleted'
    )
  );

-- ============================================================================
-- Step 4: Update default value
-- ============================================================================

ALTER TABLE public.pins ALTER COLUMN status SET DEFAULT 'draft';

COMMIT;
