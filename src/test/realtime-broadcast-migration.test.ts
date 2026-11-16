import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the Realtime Broadcast cutover (issue #153, "Skalierung 2b"). The
// additive migration must: emit a minimal tenant-scoped broadcast from triggers
// on the four watched tables, route it to the private `tenant:<id>` topic, and
// authorize reads via an RLS policy on realtime.messages. The follow-up
// migration removes the tables from the postgres_changes publication.
const additive = readFileSync(
  resolve(
    __dirname,
    '../../supabase/migrations/00044_realtime_broadcast_changes.sql',
  ),
  'utf8',
)

const cutover = readFileSync(
  resolve(
    __dirname,
    '../../supabase/migrations/00045_drop_realtime_postgres_changes.sql',
  ),
  'utf8',
)

describe('realtime broadcast migration (00044)', () => {
  it('defines a SECURITY DEFINER trigger function', () => {
    expect(additive).toMatch(
      /create or replace function public\.broadcast_tenant_change\(\)/i,
    )
    expect(additive).toMatch(/security definer/i)
  })

  it('sends a minimal payload to the private per-tenant topic', () => {
    // Routes to tenant:<tenant_id> as a private broadcast.
    expect(additive).toMatch(/realtime\.send\(/i)
    expect(additive).toMatch(/'tenant:' \|\| v_tenant_id::text/i)
    // Private flag (4th arg true).
    expect(additive).toMatch(/true\s*(--[^\n]*)?\s*\);/)
    // Payload carries table + operation + ids, never full rows.
    expect(additive).toMatch(/'table', TG_TABLE_NAME/i)
    expect(additive).toMatch(/'operation', TG_OP/i)
    expect(additive).toMatch(/'blog_project_id', v_blog_project_id/i)
  })

  it('resolves the tenant for pin_publish_events via blog_projects', () => {
    expect(additive).toMatch(
      /select tenant_id into v_tenant_id[\s\S]*from public\.blog_projects/i,
    )
  })

  it('creates triggers on the four watched tables for the right operations', () => {
    expect(additive).toMatch(
      /create trigger broadcast_pins_update[\s\S]*after update on public\.pins/i,
    )
    expect(additive).toMatch(
      /create trigger broadcast_blog_articles_insert[\s\S]*after insert on public\.blog_articles/i,
    )
    expect(additive).toMatch(
      /create trigger broadcast_pin_publish_events_insert[\s\S]*after insert on public\.pin_publish_events/i,
    )
    expect(additive).toMatch(
      /create trigger broadcast_pinterest_connections_update[\s\S]*after update on public\.pinterest_connections/i,
    )
  })

  it('restricts realtime.messages reads to the user tenant topic', () => {
    expect(additive).toMatch(/on realtime\.messages/i)
    expect(additive).toMatch(/for select[\s\S]*to authenticated/i)
    expect(additive).toMatch(/realtime\.topic\(\) = 'tenant:'/i)
    expect(additive).toMatch(
      /tenant_id::text[\s\S]*from public\.profiles[\s\S]*auth\.uid\(\)/i,
    )
  })

  it('stays additive: does not drop tables from the publication', () => {
    expect(additive).not.toMatch(/drop table/i)
  })
})

describe('realtime postgres_changes cutover migration (00045)', () => {
  it('removes the four tables from the supabase_realtime publication', () => {
    expect(cutover).toMatch(
      /alter publication supabase_realtime drop table public\.%I/i,
    )
    for (const t of [
      'pins',
      'blog_articles',
      'pin_publish_events',
      'pinterest_connections',
    ]) {
      expect(cutover).toContain(`'${t}'`)
    }
  })

  it('guards the removal so re-running is a no-op', () => {
    expect(cutover).toMatch(/if exists[\s\S]*from pg_publication_tables/i)
  })
})
