import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards migration 00042 (ADR-0009). Christoph applies it to prod BEFORE the
// code is merged, so it must stay additive and compatible with the code on
// main: new table only, enqueue_generate_metadata keeps its signature and
// return type, and "no row" means on.
const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/00042_tenant_settings.sql'),
  'utf8',
)
const code = sql.replace(/--.*$/gm, '')

describe('tenant_settings migration', () => {
  it('creates the table with the agreed schema', () => {
    expect(code).toMatch(/create table if not exists public\.tenant_settings/i)
    expect(code).toMatch(/tenant_id uuid primary key/i)
    expect(code).toMatch(/ai_metadata_enabled boolean not null default true/i)
    expect(code).toMatch(/updated_at timestamptz not null default now\(\)/i)
  })

  it('enables RLS: own tenant may select, insert and update; service_role full access; no delete', () => {
    expect(code).toMatch(/alter table public\.tenant_settings enable row level security/i)
    expect(code).toMatch(/grant select, insert, update on public\.tenant_settings to authenticated/i)
    expect(code).not.toMatch(/grant[^;]*delete[^;]*tenant_settings/i)
    for (const op of ['SELECT', 'INSERT', 'UPDATE']) {
      expect(code).toMatch(new RegExp(`for ${op}\\s+to authenticated`, 'i'))
    }
    expect(code.match(/SELECT tenant_id FROM public\.profiles WHERE id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(code).toMatch(/for all\s+to service_role\s+using \(true\)\s+with check \(true\)/i)
  })

  it('makes enqueue_generate_metadata refuse when the setting is off, with no row meaning on', () => {
    expect(code).toMatch(/create or replace function public\.enqueue_generate_metadata\(p_pin_ids uuid\[\]\)\s+returns integer/i)
    expect(code).toMatch(/coalesce\(\s*\(SELECT s\.ai_metadata_enabled FROM public\.tenant_settings s WHERE s\.tenant_id = v_tenant_id\),\s*true\s*\)/i)
    expect(code).toContain("RAISE EXCEPTION 'AI metadata generation is disabled for this account'")
    expect(code).toMatch(/grant execute on function public\.enqueue_generate_metadata\(uuid\[\]\) to authenticated/i)
  })

  it('stays additive so the code on main keeps working after it runs', () => {
    expect(code).not.toMatch(/\bdrop\s+(table|column|function)\b/i)
    expect(code).not.toMatch(/\brename\b/i)
    expect(code).not.toMatch(/alter table public\.(pins|profiles)/i)
  })
})
