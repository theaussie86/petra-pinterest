-- Register pg_cron job: cleans up storage images for pins published 7+ days ago
-- Runs daily at 3 AM UTC
SELECT cron.schedule(
  'cleanup-published-images',
  '0 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/cleanup-published-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_anon_key')
    ),
    body := jsonb_build_object('time', now()),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
