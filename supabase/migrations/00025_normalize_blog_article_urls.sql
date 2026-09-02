-- Issue #71: blog_articles.url was stored inconsistently (with and without a
-- trailing slash, occasionally with a fragment). The sitemap diff compares
-- exactly, so those rows never matched the sitemap URLs and every article was
-- re-scraped nightly, which kept the Gemini bill running.
--
-- Bring the existing rows onto the same normalized form the scrapers now write
-- (see normalizeUrl in src/lib/utils.ts): fragment dropped, trailing slashes
-- stripped, root path kept. Host casing is left alone — the scrapers normalize
-- it going forward and no existing row differs only by case.
--
-- Duplicates are merged rather than dropped: pins.blog_article_id is
-- ON DELETE CASCADE, so deleting a duplicate article would delete its pins.
-- Pins are repointed at the surviving article first.

BEGIN;

-- Normalized form of a URL, matching normalizeUrl() for the slash/fragment case
CREATE OR REPLACE FUNCTION pg_temp.normalize_article_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Keep a bare origin (https://example.com/) intact
    WHEN regexp_replace(split_part(p_url, '#', 1), '/+$', '') ~ '^https?:/*$'
      THEN split_part(p_url, '#', 1)
    ELSE regexp_replace(split_part(p_url, '#', 1), '/+$', '')
  END
$$;

-- 1. Pick one survivor per (project, normalized url): newest scrape wins,
--    id breaks ties so the result is deterministic.
CREATE TEMP TABLE article_url_merge ON COMMIT DROP AS
SELECT
  id,
  blog_project_id,
  pg_temp.normalize_article_url(url) AS normalized_url,
  first_value(id) OVER (
    PARTITION BY blog_project_id, pg_temp.normalize_article_url(url)
    ORDER BY scraped_at DESC NULLS LAST, id DESC
  ) AS survivor_id
FROM blog_articles;

-- 2. Repoint pins that hang off a duplicate before it disappears
UPDATE pins p
SET blog_article_id = m.survivor_id
FROM article_url_merge m
WHERE p.blog_article_id = m.id
  AND m.id <> m.survivor_id;

-- 3. Drop the duplicates (no pins reference them any more)
DELETE FROM blog_articles a
USING article_url_merge m
WHERE a.id = m.id
  AND m.id <> m.survivor_id;

-- 4. Normalize the survivors
UPDATE blog_articles a
SET url = m.normalized_url
FROM article_url_merge m
WHERE a.id = m.id
  AND a.url <> m.normalized_url;

DROP FUNCTION pg_temp.normalize_article_url(text);

COMMIT;
