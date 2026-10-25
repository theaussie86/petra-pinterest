-- ============================================================================
-- Migration: Partial unique index on pins image paths (issue #137)
-- ============================================================================
-- MCP `create_pin(upload_path)` checks `isPinImagePathUsed` and only then
-- inserts the pin. Two concurrent calls with the same `upload_path` both pass
-- the pre-check, producing two pins that share one Storage object. Deleting one
-- later removes the object for the other (`deletePin` removes the object).
--
-- Every upload (UI and MCP) already carries its own UUID in the path, so the
-- path *is* the object's identity — a partial unique index is the race-proof
-- guarantee the pre-check cannot give. `insertAgentPin` maps the resulting
-- 23505 back to the same German "bereits verwendet" message.
--
-- NULL is excluded because `cleanup-published-images` sets the path to NULL
-- after tidying, and many such rows must coexist.
--
-- Before pushing to prod, confirm there are no existing duplicates:
--   select image_path, count(*) from public.pins
--     where image_path is not null group by 1 having count(*) > 1;
--   select cover_image_path, count(*) from public.pins
--     where cover_image_path is not null group by 1 having count(*) > 1;
-- Clean any up first, otherwise index creation fails.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS pins_image_path_unique
  ON public.pins (image_path)
  WHERE image_path IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pins_cover_image_path_unique
  ON public.pins (cover_image_path)
  WHERE cover_image_path IS NOT NULL;

COMMIT;
