-- Add ai_context field for project-specific AI instructions
ALTER TABLE blog_projects ADD COLUMN ai_context TEXT NULL;

COMMENT ON COLUMN blog_projects.ai_context IS 'Custom instructions for AI metadata generation (e.g., content restrictions, tone guidelines)';
