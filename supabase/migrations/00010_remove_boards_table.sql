-- Remove boards table, store Pinterest board info directly on pins
-- Boards will be fetched dynamically from Pinterest API instead of stored locally
-- Created: 2026-02-09

-- ============================================================================
-- STEP 1: Add new columns to pins
-- ============================================================================

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS pinterest_board_id TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_board_name TEXT;

-- ============================================================================
-- STEP 2: Migrate existing board assignments
-- ============================================================================
-- Copy pinterest_board_id and name from boards table into pins

UPDATE public.pins p
SET
  pinterest_board_id = b.pinterest_board_id,
  pinterest_board_name = b.name
FROM public.boards b
WHERE p.board_id = b.id;

-- ============================================================================
-- STEP 3: Remove board_id FK column and its index from pins
-- ============================================================================

DROP INDEX IF EXISTS idx_pins_board_id;
ALTER TABLE public.pins DROP COLUMN IF EXISTS board_id;

-- ============================================================================
-- STEP 4: Add index on new pinterest_board_id column
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pins_pinterest_board_id
  ON public.pins(pinterest_board_id);

-- ============================================================================
-- STEP 5: Drop boards table (CASCADE removes RLS policies, triggers, indexes)
-- ============================================================================

DROP TABLE IF EXISTS public.boards CASCADE;
