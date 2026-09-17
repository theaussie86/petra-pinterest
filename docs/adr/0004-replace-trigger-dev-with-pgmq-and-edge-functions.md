---
status: accepted
---

# Replace Trigger.dev with pgmq queues and Supabase Edge Functions

We remove Trigger.dev entirely (SDK, `trigger.config.ts`, CI deploy, account) and run all background jobs inside Supabase: one `pgmq` queue per job type (`scrape_blog`, `scrape_article`, `generate_metadata`), drained by Edge Function workers. The motivation is dependency reduction, not a functional gap - Trigger.dev worked. Supabase already hosts the data, Vault keys, pg_cron and the Edge Functions that ran as a fallback path, so the queue replaces what Trigger.dev gave us (retries, single failure mail, throttling) without a new vendor.

## Considered options

- **Direct Edge Function invocation with status columns and a cron sweeper (rejected).** Would need hand-rolled attempt counting and stuck-job detection. `pgmq` visibility timeouts and `read_ct` give retries and "final attempt" detection for free.
- **No automatic retries (rejected).** Gemini calls fail intermittently; losing retries would turn transient errors into user-visible `error` pins.
- **Keep shared logic runnable on both Node and Deno (rejected).** Scraping and metadata generation now live only in `supabase/functions`. The Node copies (`server/lib/scraping.ts`, `server/lib/gemini-scraper.ts`, the Node side of `src/lib/ai`) go away. This supersedes the "both runtimes migrate" consequence of ADR-0002.

## Consequences

- **User-facing single actions bypass the queue.** Generating or regenerating (with feedback) metadata for one pin invokes the Edge Function directly and waits; no automatic retry, the error shows in the dialog.
- **Enqueueing happens in SQL.** The app calls RPCs that check the tenant and `pgmq.send`. The daily scheduled scrape enqueues from pg_cron directly; the old `scrape-scheduled`, `scrape-blog` and `scrape-single` Edge Functions go away (removed from the repo and production in issue #95).
- **Failure semantics:** a pin stays `generating_metadata` across retries; `error` status and the notification mail happen only after the last attempt (blog 2, article 3, metadata 3), then the message is archived.
- **Workers are kicked only by pg_cron**, every ~15s per queue, and only when the queue has visible messages (checked in SQL before `net.http_post`). No database trigger on enqueue - an immediate start was considered for metadata jobs and rejected as not worth the extra moving parts; up to ~15s delay is accepted.
- **Throttling:** at most one worker per queue (a lock stops overlapping cron kicks), 5 messages per worker run, 420s visibility timeout (just above the 400s Edge Function wall clock on Pro).
- **No per-run URL cap on blog scans.** A first import enqueues every new or changed article at once; cost lands on the project's BYOK key immediately instead of spread over days.
- **Sitemap diff = new + changed articles (by `lastmod`)**, the behaviour the Edge path already had.
- **Rollout in two stages:** first build the queue path and switch the `USE_TRIGGER_*` flags off in production, then delete Trigger.dev once it has run cleanly.
