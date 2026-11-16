---
status: accepted
---

# Realtime via Broadcast from DB triggers, not Postgres Changes

The app's live views (pin status on the list/calendar, new articles, publish-log
events, Pinterest connection) used to each open a Supabase Realtime
`postgres_changes` subscription. In `pg_stat_statements` this was by far the
largest DB-time item: Realtime polls the WAL (`realtime.list_changes`) and runs
RLS per event, on the order of 7M calls (issue #153, split out of #150). Supabase
recommends Broadcast from database triggers once there are more users.

We switched every subscription to **Broadcast on one private channel per tenant**,
topic `tenant:<tenant_id>`.

## How it works

- **Triggers emit, not the WAL.** `public.broadcast_tenant_change()` (migration
  `00044`) fires `AFTER` the operations the client actually watches — `pins`
  UPDATE, `blog_articles` INSERT, `pin_publish_events` INSERT,
  `pinterest_connections` UPDATE — and calls `realtime.send` with a **minimal**
  payload: `table`, `operation`, and the ids (`blog_project_id`, `pin_id`,
  `tenant_id`, `id`). Never full rows, so no sensitive columns (e.g. Pinterest
  tokens) go over the wire. `pin_publish_events` has no `tenant_id`, so the
  trigger resolves it from `blog_projects` (hence `SECURITY DEFINER`).
- **Private channels.** Clients subscribe with `config: { private: true }`. An
  RLS policy on `realtime.messages` lets a user read a `broadcast` message only
  when `realtime.topic()` equals `tenant:` + their own `profiles.tenant_id`. A
  user in tenant A therefore never receives tenant B's broadcasts.
- **One socket channel per tenant.** `src/lib/realtime/tenant-broadcast.ts`
  ref-counts a single channel per tenant topic; every `useRealtimeInvalidation`
  mount registers a listener instead of opening its own channel. This avoids the
  "duplicate topic" problem and keeps one subscription regardless of how many
  views are mounted. Before subscribing it calls `supabase.realtime.setAuth()`
  so the private channel authorizes against the user's JWT.
- **Hook contract is unchanged.** `useRealtimeInvalidation(config, queryKeys)`
  still means "a change comes in, invalidate these query keys". The source is now
  Broadcast and it filters client-side by `table`, `operation`, and an optional
  `{ column, value }` match against the payload (replacing the old PostgREST
  `filter` string). Call sites changed only in that config shape.

## Consequences

- **No `postgres_changes` subscription remains in the client.** Realtime stops
  WAL-polling + per-event RLS for these tables once they leave the publication.
- **Deploy ordering.** `00044` is additive — it starts broadcasting and
  authorizes reads but leaves the tables in the `supabase_realtime` publication,
  so the old client keeps working. `00045` removes the four tables from the
  publication and is a **post-deploy** step: apply it only after the Broadcast
  client is live and verified (see each migration's header).
- **Before/after measurement.** The pg_stat_statements figures for the Realtime
  queries are captured before deploy and re-measured a few days after `00045`,
  recorded on the PR / issue (acceptance criterion).
- **Payload is deliberately thin.** A view learns only that "something changed on
  table X for project Y"; it then refetches through its normal query. This keeps
  the broadcast cheap and leaks nothing, at the cost of an occasional
  slightly-broader invalidation than a row-level diff would give.
