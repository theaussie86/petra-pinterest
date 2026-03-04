-- Migrate existing additional_instructions data to ai_context
UPDATE blog_projects
SET ai_context = additional_instructions
WHERE additional_instructions IS NOT NULL
  AND ai_context IS NULL;
