import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the pin_publish_events table (issue #109, PRD
// weissteiner-automation-mq#5, Teil 2). The MQ worker writes one row per
// publish attempt with the service-role key (bypassing RLS); Pinfinity reads
// the rows for the per-pin history and the global log and subscribes to them
// over Realtime. The checks below assert the migration's schema, access rules
// and Realtime publication without needing a live database.
const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/00036_pin_publish_events.sql'),
  'utf8',
)

describe('pin_publish_events migration', () => {
  it('creates the table with the agreed schema', () => {
    expect(sql).toMatch(/create table[\s\S]*public\.pin_publish_events/i)
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/i)
    expect(sql).toMatch(
      /pin_id uuid not null references public\.pins\(id\) on delete cascade/i,
    )
    expect(sql).toMatch(/blog_project_id uuid not null/i)
    expect(sql).toMatch(/event_type text not null/i)
    expect(sql).toMatch(/attempt int/i)
    expect(sql).toMatch(/max_attempts int/i)
    expect(sql).toMatch(/message text/i)
    expect(sql).toMatch(/details jsonb not null default '\{\}'/i)
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/i)
  })

  it('restricts event_type to the five known kinds', () => {
    for (const kind of [
      'attempt_started',
      'succeeded',
      'retry_scheduled',
      'failed_final',
      'mail_sent',
    ]) {
      expect(sql).toContain(`'${kind}'`)
    }
    expect(sql).toMatch(/check[\s\S]*event_type in/i)
  })

  it('creates the retention- and lookup-friendly indexes', () => {
    expect(sql).toMatch(/\(pin_id, created_at desc\)/i)
    expect(sql).toMatch(/\(blog_project_id, created_at desc\)/i)
    expect(sql).toMatch(/\(created_at desc\)/i)
  })

  it('enables RLS and grants read access only via tenant of the project', () => {
    expect(sql).toMatch(
      /alter table public\.pin_publish_events enable row level security/i,
    )
    // SELECT policy: project must belong to a tenant the user can see.
    expect(sql).toMatch(/for select[\s\S]*to authenticated/i)
    expect(sql).toMatch(
      /blog_project_id in[\s\S]*from public\.blog_projects[\s\S]*tenant_id in[\s\S]*from public\.profiles[\s\S]*auth\.uid\(\)/i,
    )
  })

  it('does not grant insert/update/delete to authenticated', () => {
    // No write policy should target the authenticated role.
    expect(sql).not.toMatch(/for insert[\s\S]*?to authenticated/i)
    expect(sql).not.toMatch(/for update[\s\S]*?to authenticated/i)
    expect(sql).not.toMatch(/for delete[\s\S]*?to authenticated/i)
  })

  it('lets the service-role worker write via a bypass policy', () => {
    expect(sql).toMatch(/for all[\s\S]*to service_role/i)
  })

  it('adds the table to the supabase_realtime publication', () => {
    expect(sql).toMatch(
      /alter publication supabase_realtime add table public\.pin_publish_events/i,
    )
  })
})
