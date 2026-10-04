-- Article curation for the Pin-Werkstatt
-- The reviewer decides per article whether the external agent should write pin
-- templates for it. `workshop_status`:
--   NULL       = not decided yet (default)
--   'wanted'   = agent should create 30 templates (optional note in workshop_note)
--   'excluded' = no templates for this article (only affects the Werkstatt; the
--                article stays usable everywhere else, unlike archived_at)
-- The agent role pin_werkstatt_agent already has table-level SELECT on
-- blog_articles and reads the new columns; it gets no write access. Whether a
-- request is done is derived from the template count (30), not stored.
-- Created: 2026-10-04 (epic #74)

ALTER TABLE public.blog_articles
  ADD COLUMN IF NOT EXISTS workshop_status TEXT
    CONSTRAINT blog_articles_workshop_status_check
    CHECK (workshop_status IN ('wanted', 'excluded')),
  ADD COLUMN IF NOT EXISTS workshop_note TEXT
    CONSTRAINT blog_articles_workshop_note_length
    CHECK (workshop_note IS NULL OR char_length(workshop_note) <= 1000),
  ADD COLUMN IF NOT EXISTS workshop_status_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.blog_articles.workshop_status IS
  'Pin-Werkstatt curation: NULL = undecided, wanted = agent creates templates, excluded = no templates. Set in the UI only.';
COMMENT ON COLUMN public.blog_articles.workshop_note IS
  'Optional reviewer note for the agent when requesting templates (max 1000 chars).';
COMMENT ON COLUMN public.blog_articles.workshop_status_changed_at IS
  'When workshop_status last changed. The agent works wanted articles oldest first.';

-- The agent's work queue: wanted, active articles per project.
CREATE INDEX IF NOT EXISTS idx_blog_articles_workshop_wanted
  ON public.blog_articles (blog_project_id, workshop_status_changed_at)
  WHERE workshop_status = 'wanted' AND archived_at IS NULL;

-- Articles that already carry templates were wanted in all but name.
UPDATE public.blog_articles a
SET workshop_status = 'wanted',
    workshop_status_changed_at = now()
WHERE a.workshop_status IS NULL
  AND EXISTS (SELECT 1 FROM public.pin_templates t WHERE t.blog_article_id = a.id);
