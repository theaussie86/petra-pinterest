# Deployment

## CI overview

`.github/workflows/ci.yml` runs on every push and PR against `main`:

- **`ci`** — install, `npm test`, `npm run build`. Always runs.
- **`deploy-trigger`** — deploys the Trigger.dev tasks, but only on a push to
  `main` and only when something under `src/trigger/`, `server/lib/` or
  `trigger.config.ts` changed. Left untouched until Trigger.dev is removed in
  stage 2 (spec #85).
- **`deploy-edge-functions`** — deploys the Supabase Edge Functions, only on a
  push to `main` and only when something under `supabase/functions/` changed
  (issue #86).

## Edge Functions deploy

The job mirrors the Trigger.dev change-gate pattern:

1. Checkout with `fetch-depth: 2` so `HEAD~1..HEAD` is available.
2. If `git diff --name-only HEAD~1 HEAD` touches `supabase/functions/`, install
   the Supabase CLI (`supabase/setup-cli`).
3. Run `supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"`, which
   redeploys **all** functions in `supabase/functions/`.

Redeploying every function (rather than only the changed one) keeps the whole
folder in sync with `main` on any change — the same "deploy everything on any
change" behaviour the Trigger.dev job has.

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
| `TRIGGER_ACCESS_TOKEN` | `deploy-trigger` | Existing Trigger.dev deploy token (unchanged). |

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
- `scrape-single`

> Note: the local/CI reconciliation deploy requires production access
> (`SUPABASE_ACCESS_TOKEN` + project ref) that is not available from the agent
> environment. Run it as a human step and record any pre-existing drift here.

## Stage 1 production cutover & observation (issue #92, PRD #85)

Stage 1 switches every background job onto the pgmq queue path while keeping
Trigger.dev available as a fall-back behind the `USE_TRIGGER_*` flags. Run the
cutover, then observe for several days before deciding whether to proceed to
stage 2 (removing Trigger.dev, #93) or roll back.

> **Requires production access** (Supabase `SUPABASE_ACCESS_TOKEN` + project ref
> `dedacaqstvzxlxpxvxgb`, and Hostinger env access). None of it is runnable from
> the agent environment — this is a human runbook. Record results in the
> **Observation log** below and in a comment on issue #92.

### Prerequisites (blocked-by issues, all merged)

- #86 CI deploy for Edge Functions
- #88 single & feedback metadata sync via Edge Function
- #89 bulk metadata progress & auto-metadata via queue
- #90 single-article scrape via `scrape_article` queue
- #91 blog scan & daily run via `scrape_blog` queue

### Cutover steps

Do these in order. Steps 1–2 are safe to run before flipping the flags — the
queue path only becomes active once the flags are `false`.

1. **Apply the queue migrations to production**, in order, via the Supabase CLI
   or MCP (`apply_migration`). Migrations are never applied by CI (see above):

   - `00032_generate_metadata_queue.sql` — pgmq extension, `generate_metadata`
     queue, `enqueue_generate_metadata`, `kick_queue_worker`, cron
     `kick-generate-metadata-worker` (15s).
   - `00033_scrape_article_queue.sql` — `scrape_article` queue,
     `enqueue_scrape_article`, cron `kick-scrape-article-worker` (15s).
   - `00034_scrape_blog_queue.sql` — `scrape_blog` queue, `queue_send_batch`,
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
   `main`, then **delete the obsolete functions in production** — they no longer
   exist in the repo and their cron caller is gone:

   ```bash
   supabase functions deploy --project-ref dedacaqstvzxlxpxvxgb
   supabase functions delete scrape-scheduled --project-ref dedacaqstvzxlxpxvxgb
   supabase functions delete scrape-blog       --project-ref dedacaqstvzxlxpxvxgb
   ```

   Confirm the deployed set matches the repo list (workers present, old
   fan-out functions gone):
   ```bash
   supabase functions list --project-ref dedacaqstvzxlxpxvxgb
   ```

3. **Flip the flags on Hostinger and restart.** Set both to `false` (queue path
   active; Trigger.dev retained as the fall-back), then restart the app:

   ```
   USE_TRIGGER_METADATA=false
   USE_TRIGGER_SCRAPING=false
   ```

   The flags default to `false` when unset (`src/lib/config/feature-flags.ts`),
   so removing them entirely has the same effect. **Rollback** at any point is
   setting either back to `true` and restarting — no redeploy or migration
   needed.

### Observation checklist (run daily for several days)

Watch these; anything unexpected is a rollback signal (flip the relevant flag
back to `true`).

- **Queue archives — final failures.** Non-empty archives mean jobs exhausted
  their attempts (blog 2, article 3, metadata 3). Investigate before dismissing.
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
  a few minutes (success → `metadata_created`, final failure → `error`). Rows
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

### Observation log

Record each observation day here (or in the issue #92 comment thread):

| Date | Archives | Backlog | Stuck pins | Error mails | Daily run | Cron failures | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| _(pending prod access)_ | | | | | | | |

### Go / no-go decision

After a clean observation window, document the decision **as a comment on issue
#92**:

- **Go** → proceed to stage 2 (#93): remove Trigger.dev tasks, SDK, config,
  flags, `TRIGGER_*` secrets and the `deploy-trigger` CI job.
- **No-go** → set the affected `USE_TRIGGER_*` flag back to `true`, restart, and
  record the reason and the failing signal above.
