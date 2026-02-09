-- AI Metadata Generation Schema
-- Adds columns and tables for AI-powered Pinterest metadata generation
-- Created: 2026-01-29

-- ============================================================================
-- ALTER PINS TABLE: ADD METADATA COLUMNS
-- ============================================================================
-- Add alt_text column for Pinterest alt text (accessibility + SEO ranking factor)
-- Add previous_status column for error recovery "Reset to previous state" functionality

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS alt_text TEXT,
  ADD COLUMN IF NOT EXISTS previous_status TEXT CHECK (
    previous_status IS NULL OR previous_status IN (
      'entwurf',
      'bereit_fuer_generierung',
      'pin_generieren',
      'pin_wird_generiert',
      'pin_generiert',
      'metadaten_generieren',
      'metadaten_werden_generiert',
      'metadaten_erstellt',
      'bereit_zum_planen',
      'veroeffentlicht',
      'fehler',
      'loeschen'
    )
  );

-- ============================================================================
-- PIN METADATA GENERATIONS TABLE
-- ============================================================================
-- Stores history of AI-generated metadata for each pin.
-- Enables regeneration with feedback and comparison of previous generations.
-- Retention policy: Keep last 3 generations per pin (implemented in application layer).

CREATE TABLE IF NOT EXISTS public.pin_metadata_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES public.pins(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  feedback TEXT,                     -- NULL for first generation, text for regenerations
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEX (PIN_METADATA_GENERATIONS)
-- ============================================================================
-- Index on (pin_id, created_at DESC) for fast history lookups (most recent first)

CREATE INDEX IF NOT EXISTS idx_pin_metadata_generations_pin_created
  ON public.pin_metadata_generations(pin_id, created_at DESC);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY (PIN_METADATA_GENERATIONS)
-- ============================================================================

ALTER TABLE public.pin_metadata_generations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES (PIN_METADATA_GENERATIONS)
-- ============================================================================
-- These policies enforce tenant isolation for metadata generations.
-- Pattern matches existing pins table policies.

-- Policy 1: Users can view metadata generations in their tenant
CREATE POLICY "Users can view own tenant metadata generations"
  ON public.pin_metadata_generations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert metadata generations in their tenant
CREATE POLICY "Users can insert metadata generations in own tenant"
  ON public.pin_metadata_generations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can delete metadata generations in their tenant
-- (For pruning old generations beyond the last 3)
CREATE POLICY "Users can delete own tenant metadata generations"
  ON public.pin_metadata_generations
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- TRIGGER: UPDATE PREVIOUS_STATUS ON STATUS CHANGE
-- ============================================================================
-- Tracks the status before the current one for error recovery.
-- When pin status changes, store the old status in previous_status column.

CREATE OR REPLACE FUNCTION public.update_previous_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update previous_status if the status column is actually changing
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.previous_status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to pins table
DROP TRIGGER IF EXISTS trg_update_previous_status ON public.pins;
CREATE TRIGGER trg_update_previous_status
  BEFORE UPDATE ON public.pins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_previous_status();
