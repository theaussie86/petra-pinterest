-- Pin Template Validation (Agenten-Eingang / agent ingest write contract)
-- Adds the DB-level rejection rules the external agent writes against via the
-- service role. The rules are lifted from the previous external import scripts
-- (epic #74, issue #77) and mirrored in TS at src/lib/validation/pin-template.ts.
-- Created: 2026-09-13 (issue #77, epic #74)
--
-- The (blog_article_id, position) uniqueness (no duplicate positions per
-- article) is already enforced by idx_pin_templates_article_position in
-- 00026_pin_templates.sql, so it is not repeated here.

-- ============================================================================
-- NORMALIZATION HELPER
-- ============================================================================
-- Lower-case, collapse whitespace runs to a single space, trim. Used by the
-- keyword-match constraints so comparisons ignore case and whitespace
-- differences. IMMUTABLE so it can be referenced from CHECK constraints.

CREATE OR REPLACE FUNCTION public.pin_template_normalize(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(lower(txt), '\s+', ' ', 'g'))
$$;

-- ============================================================================
-- CHECK CONSTRAINTS
-- ============================================================================

-- Position must be within 1..30 (exactly 30 templates per article; completeness
-- is verified with the check query below, not enforced by a constraint).
ALTER TABLE public.pin_templates
  DROP CONSTRAINT IF EXISTS pin_templates_position_range;
ALTER TABLE public.pin_templates
  ADD CONSTRAINT pin_templates_position_range
  CHECK (position BETWEEN 1 AND 30);

-- Description, when set, is at most 500 characters.
ALTER TABLE public.pin_templates
  DROP CONSTRAINT IF EXISTS pin_templates_description_max_length;
ALTER TABLE public.pin_templates
  ADD CONSTRAINT pin_templates_description_max_length
  CHECK (description IS NULL OR char_length(description) <= 500);

-- The main keyword must appear literally in the overlay (normalized: lower-case,
-- whitespace-collapsed). A missing overlay cannot contain the keyword, so it is
-- rejected too.
ALTER TABLE public.pin_templates
  DROP CONSTRAINT IF EXISTS pin_templates_keyword_in_overlay;
ALTER TABLE public.pin_templates
  ADD CONSTRAINT pin_templates_keyword_in_overlay
  CHECK (
    overlay IS NOT NULL
    AND strpos(
      public.pin_template_normalize(overlay),
      public.pin_template_normalize(main_keyword)
    ) > 0
  );

-- The description, when set, must begin with the main keyword (same
-- normalization).
ALTER TABLE public.pin_templates
  DROP CONSTRAINT IF EXISTS pin_templates_description_starts_with_keyword;
ALTER TABLE public.pin_templates
  ADD CONSTRAINT pin_templates_description_starts_with_keyword
  CHECK (
    description IS NULL
    OR starts_with(
      public.pin_template_normalize(description),
      public.pin_template_normalize(main_keyword)
    )
  );

-- ============================================================================
-- COMPLETENESS CHECK QUERY (documentation, not a constraint)
-- ============================================================================
-- Each article should carry exactly 30 templates. Completeness is intentionally
-- NOT enforced by a constraint (a batch is inserted row by row and would trip a
-- count constraint mid-insert). Run this after an ingest to list articles whose
-- template count differs from 30:
--
--   SELECT blog_article_id, COUNT(*) AS template_count
--   FROM public.pin_templates
--   GROUP BY blog_article_id
--   HAVING COUNT(*) <> 30
--   ORDER BY template_count;
--
-- An empty result means every article has the expected 30 templates.
