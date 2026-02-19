-- Register pg_cron job: publishes scheduled pins every 10 minutes (7–23 UTC)
-- Invokes the publish-scheduled-pins Edge Function using existing Vault secrets
SELECT cron.schedule(
  'publish-scheduled-pins',
  '*/10 7-23 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/publish-scheduled-pins',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_anon_key')
    ),
    body := jsonb_build_object('time', now()),
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
