-- ============================================================================
-- Migration: Orphaned pin-images cleanup RPC
-- ============================================================================
-- Adds public.list_orphaned_pin_images(): returns the storage object names in
-- the `pin-images` bucket that are older than 7 days and are not referenced by
-- any pin (neither image_path nor cover_image_path). The cleanup-published-
-- images Edge Function calls this to find leftover uploads from aborted
-- request_pin_upload / UI upload flows (#135, #136) and removes them via the
-- Storage API. (Issue #138.)
--
-- storage.objects is not reachable over PostgREST, so this SECURITY DEFINER
-- function (owned by the migration role, which can read the storage schema)
-- exposes exactly the orphan list and nothing else.
--
-- SECURITY DEFINER + no caller input beyond a bounded limit. EXECUTE is granted
-- only to service_role; the implicit PUBLIC grant and anon/authenticated are
-- revoked so only server-side code (the Edge Function's service client) can run
-- it. The function reads storage.objects explicitly schema-qualified, so the
-- locked-down search_path cannot be abused to shadow it.
--
-- References counted: public.pins.image_path AND public.pins.cover_image_path
-- (cover_image_path added in 00022). A grep of this repo found no other column
-- or system pointing at pin-images.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_orphaned_pin_images(max_count integer DEFAULT 100)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'pin-images'
    AND o.created_at < now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.pins p
      WHERE p.image_path = o.name OR p.cover_image_path = o.name
    )
  ORDER BY o.created_at
  LIMIT GREATEST(max_count, 0);
$$;

COMMENT ON FUNCTION public.list_orphaned_pin_images(integer) IS
  'Returns names of pin-images objects older than 7 days not referenced by any pin (image_path or cover_image_path). service_role only; drained by cleanup-published-images (#138).';

REVOKE EXECUTE ON FUNCTION public.list_orphaned_pin_images(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphaned_pin_images(integer) TO service_role;

COMMIT;
