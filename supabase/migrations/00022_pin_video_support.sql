-- ============================================================================
-- Migration: Pinterest video publishing support
-- ============================================================================
-- Adds:
--   - pins.media_type              -- 'image' | 'video' (default 'image')
--   - pins.cover_image_path        -- optional user-uploaded cover for videos;
--                                     stored in the pin-images bucket like
--                                     regular pin media
--   - pins.cover_keyframe_seconds  -- fallback when cover_image_path is NULL:
--                                     extract the video frame at this second
--                                     (via the external ffmpeg server) and
--                                     use it as the Pinterest cover thumbnail
--
-- The TypeScript type in src/types/pins.ts already declared `media_type` but
-- the column did not exist in the DB, so it was silently dropped on every
-- insert. This migration makes the schema match the types.
--
-- Backfill: default 'image' covers every existing row. RLS policies on pins
-- remain unchanged (same tenant_id scope).

BEGIN;

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS cover_image_path text,
  ADD COLUMN IF NOT EXISTS cover_keyframe_seconds integer DEFAULT 1
    CHECK (cover_keyframe_seconds IS NULL OR cover_keyframe_seconds >= 0);

COMMENT ON COLUMN public.pins.media_type IS
  'Media kind for this pin. Drives the Pinterest publish path: ''image'' uses source_type=image_url, ''video'' registers media with Pinterest, uploads the file, and uses source_type=video_id.';

COMMENT ON COLUMN public.pins.cover_image_path IS
  'Optional user-uploaded cover image for video pins (path inside the pin-images bucket). When NULL, the publish flow falls back to extracting a frame from the video at cover_keyframe_seconds via the external ffmpeg server.';

COMMENT ON COLUMN public.pins.cover_keyframe_seconds IS
  'Fallback cover source for video pins without a cover_image_path: the second (integer) at which to extract a keyframe. Defaults to 1 second.';

COMMIT;
