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
