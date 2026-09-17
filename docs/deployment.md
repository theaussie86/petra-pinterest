# Deployment

## CI overview

`.github/workflows/ci.yml` runs on every push and PR against `main`:

- **`ci`** — install, `npm test`, `npm run build`. Always runs.
- **`deploy-edge-functions`** — deploys the Supabase Edge Functions, only on a
  push to `main` and only when something under `supabase/functions/` changed
  (issue #86).

> Stage 2 (issue #85 / #93) removed Trigger.dev entirely. The former
> `deploy-trigger` job and the `USE_TRIGGER_*` feature flags no longer exist, and
> the clean-up in #96 deleted the `TRIGGER_ACCESS_TOKEN` / `TRIGGER_SECRET_KEY`
> Actions secrets and the Trigger.dev account itself. The pgmq queues + Edge
> Functions are the only background-job path.

## Edge Functions deploy

The job is change-gated:

1. Checkout with `fetch-depth: 2` so `HEAD~1..HEAD` is available.
2. If `git diff --name-only HEAD~1 HEAD` touches `supabase/functions/`, install
   the Supabase CLI (`supabase/setup-cli`).
3. Run `supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"`, which
   redeploys **all** functions in `supabase/functions/`.

Redeploying every function (rather than only the changed one) keeps the whole
folder in sync with `main` on any change.

### Migrations are never applied automatically

The deploy step runs `supabase functions deploy` only. It never runs
`supabase db push` / `migration up`. Database migrations stay a deliberate,
manual step applied via the Supabase CLI or MCP (see `CLAUDE.md` → Database
Migrations). This is an explicit requirement of issue #86 and is guarded by
`src/test/ci-edge-functions-deploy.test.ts`.

## CI secrets

Configure these under **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | `deploy-edge-functions` | Supabase personal access token used by the CLI to authenticate the deploy. Create one at <https://supabase.com/dashboard/account/tokens>. |
| `SUPABASE_PROJECT_REF` | `deploy-edge-functions` | Project ref of the production project (`dedacaqstvzxlxpxvxgb`, "Pinterest Management"). |

`SUPABASE_ACCESS_TOKEN` grants deploy rights to the account's projects, so scope
it to a service/CI account where possible and rotate it if leaked.

## One-time reconciliation with `main`

Before the automated deploy existed, functions were deployed by hand and could
drift from `main`. The first automated run resolves this: because the job
redeploys **all** functions on any change under `supabase/functions/`, the next
merge that touches any function brings the entire folder in production up to the
`main` state in one deploy.

To reconcile immediately (independent of the next functional change), run the
same command locally against production once:

```bash
supabase functions deploy --project-ref dedacaqstvzxlxpxvxgb
```

The functions currently in the repo (the deployed set is expected to match
after the step above):

- `cleanup-published-images`
- `generate-metadata-single`
- `generate-metadata-worker`
- `publish-scheduled-pins`
- `refresh-pinterest-tokens`
- `scrape-article-worker`
- `scrape-blog-worker`

> Note: the local/CI reconciliation deploy requires production access
> (`SUPABASE_ACCESS_TOKEN` + project ref) that is not available from the agent
> environment. Run it as a human step and record any pre-existing drift here.

## Stage 1 production cutover (issue #92, PRD #85) - historical

> **Done, kept for reference.** Stage 1 moved every background job onto the pgmq
> queue path while Trigger.dev stayed available behind the `USE_TRIGGER_*` flags.
> Stage 2 (#93) removed Trigger.dev, and #96 removed the leftover `TRIGGER_*`
> secrets, environment variables and the Trigger.dev account. The flags are gone,
> there is no fall-back and no flag rollback - the queues are the only path.

The migration and Edge Function steps below are the reference for how the queues
were brought live. They require production access (Supabase
`SUPABASE_ACCESS_TOKEN` + project ref `dedacaqstvzxlxpxvxgb`) and are a human
step, not an agent one.

### Prerequisites (blocked-by issues, all merged)

- #86 CI deploy for Edge Functions
- #88 single & feedback metadata sync via Edge Function
- #89 bulk metadata progress & auto-metadata via queue
- #90 single-article scrape via `scrape_article` queue
- #91 blog scan & daily run via `scrape_blog` queue

### Cutover steps

1. **Apply the queue migrations to production**, in order, via the Supabase CLI
   or MCP (`apply_migration`). Migrations are never applied by CI (see above):

   - `00032_generate_metadata_queue.sql` - pgmq extension, `generate_metadata`
     queue, `enqueue_generate_metadata`, `kick_queue_worker`, cron
     `kick-generate-metadata-worker` (15s).
   - `00033_scrape_article_queue.sql` - `scrape_article` queue,
     `enqueue_scrape_article`, cron `kick-scrape-article-worker` (15s).
   - `00034_scrape_blog_queue.sql` - `scrape_blog` queue, `queue_send_batch`,
     `enqueue_scrape_blog`, `enqueue_due_blog_scrapes`; **unschedules**
     `scrape-scheduled-daily` and schedules `enqueue-due-blog-scrapes-daily`
     (`0 6 * * *`) + `kick-scrape-blog-worker` (15s).

   Verify after applying:
   ```sql
   SELECT queue_name FROM pgmq.list_queues();               -- 3 queues present
   SELECT jobname, schedule, active FROM cron.job            -- 3 kicks + daily,
   WHERE jobname LIKE 'kick-%' OR jobname LIKE 'enqueue-%';  -- no scrape-scheduled-daily
   ```

2. **Deploy / reconcile the Edge Functions.** Run the reconciliation deploy
   (see *One-time reconciliation with `main`* above) so the deployed set matches
   `main`. The obsolete fan-out functions were deleted in production (#95):

   ```bash
   supabase functions deploy --project-ref dedacaqstvzxlxpxvxgb
   supabase functions list   --project-ref dedacaqstvzxlxpxvxgb
   ```

## Queue health checks

Run these when background jobs look wrong (pins stuck, no mails, growing
backlog). They were the stage-1 observation checklist and stay useful as the
standing diagnostic set.

- **Queue archives - final failures.** Non-empty archives mean jobs exhausted
  their attempts (blog 2, article 3, metadata 3).
  ```sql
  SELECT 'generate_metadata' q, count(*) FROM pgmq.a_generate_metadata
  UNION ALL SELECT 'scrape_article', count(*) FROM pgmq.a_scrape_article
  UNION ALL SELECT 'scrape_blog',    count(*) FROM pgmq.a_scrape_blog;
  -- inspect: SELECT * FROM pgmq.a_generate_metadata ORDER BY archived_at DESC LIMIT 20;
  ```

- **Queue depth / backlog.** Length should hover near 0 between kicks; a growing
  queue means the worker is not draining (lock stuck, deploy missing, errors).
  ```sql
  SELECT * FROM pgmq.metrics_all();  -- queue_length, oldest_msg_age_sec
  ```

- **Pins stuck in `generating_metadata`.** A pin should leave this status within
  a few minutes (success -> `metadata_created`, final failure -> `error`). Rows
  older than ~10 min with an empty queue indicate a lost/hung job.
  ```sql
  SELECT id, updated_at FROM public.pins
  WHERE status = 'generating_metadata' AND updated_at < now() - interval '10 minutes'
  ORDER BY updated_at;
  ```

- **Error mails.** Expect **exactly one** mail per finally-failed job (never one
  per attempt). More than one per job, or none for an archived failure, is a bug.

- **Daily blog run.** After 06:00 UTC, confirm `enqueue-due-blog-scrapes-daily`
  ran and due projects were enqueued & drained (`last_scraped_at` advanced).

- **Cron health.** No repeated failures for the kicks or the daily enqueue.
  ```sql
  SELECT j.jobname, r.status, r.return_message, r.start_time
  FROM cron.job_run_details r JOIN cron.job j USING (jobid)
  WHERE r.start_time > now() - interval '1 day'
    AND (r.status <> 'succeeded' OR j.jobname LIKE '%blog-scrapes%')
  ORDER BY r.start_time DESC LIMIT 50;
  ```
