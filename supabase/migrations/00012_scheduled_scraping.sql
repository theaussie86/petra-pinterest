-- Add last_scraped_at column to blog_projects
ALTER TABLE blog_projects ADD COLUMN last_scraped_at TIMESTAMPTZ;

-- Register pg_cron job: runs daily at 6 AM UTC
-- Invokes the scrape-scheduled Edge Function using existing Vault secrets
SELECT cron.schedule(
  'scrape-scheduled-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/scrape-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_anon_key')
    ),
    body := jsonb_build_object('time', now()),
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
