---
status: accepted
implemented: 2026-10-11
---

# Publish scheduled pins via MQ instead of pg_cron

Scheduled pins are published by MQ (weissteiner-automation-mq, ADR-0010 there) instead of the pg_cron job `publish-scheduled-pins` and its Edge Function. Pinfinity keeps the job consistent with `syncPublishJob(pin)` on every write path that sets, changes or removes `scheduled_at`; an MQ reconcile job (every 15 min) enqueues pins that have no job yet.

## Considered options

- **Keep pg_cron + Edge Function (rejected).** No visible retries, no per-attempt board, error mail hand-rolled per call site.
- **Enqueue from the metadata workers (rejected, see issue #105).** Reconcile picks pins up within 15 min, which is enough.

## Consequences

- **Retry and error mail:** MQ retries failed publishes; the error mail is a follow-up job that runs only after final failure.
- **Cutover order matters.** The atomic `status = 'metadata_created'` check happens after the Pinterest call, so cron and MQ could both post the same pin. Order: deactivate cron (`cron.alter_job`, reversible) -> reconcile without `dryRun` -> verify the first real publish on the MQ board -> after a few clean days remove the Edge Function, its `notifyPinError` calls and the cron job (migration).
- **Rollback** before removal: `cron.alter_job(4, active := true)` and stop the MQ reconcile schedule.
