import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import {
  AI_METADATA_DISABLED_MESSAGE,
  isAiMetadataDisabledError,
  readAiMetadataEnabled,
} from './ai-metadata-setting'

function clientWith(response: { data?: unknown; error?: unknown }) {
  const qb = createMockQueryBuilder(response)
  const client = { from: vi.fn(() => qb) } as unknown as SupabaseClient
  return { client, qb }
}

describe('readAiMetadataEnabled (ADR-0009)', () => {
  it('returns the stored value', async () => {
    expect(await readAiMetadataEnabled(clientWith({ data: { ai_metadata_enabled: false } }).client)).toBe(false)
    expect(await readAiMetadataEnabled(clientWith({ data: { ai_metadata_enabled: true } }).client)).toBe(true)
  })

  it('treats a missing row as on', async () => {
    expect(await readAiMetadataEnabled(clientWith({ data: null }).client)).toBe(true)
  })

  it('treats a missing table (migration not applied yet) as on', async () => {
    for (const code of ['PGRST205', '42P01']) {
      const { client } = clientWith({ error: { code, message: 'missing' } })
      expect(await readAiMetadataEnabled(client)).toBe(true)
    }
  })

  it('throws on any other read error', async () => {
    const { client } = clientWith({ error: { code: '57014', message: 'timeout' } })
    await expect(readAiMetadataEnabled(client)).rejects.toThrow('timeout')
  })

  it('filters by tenant only when a tenant id is given', async () => {
    const withTenant = clientWith({ data: null })
    await readAiMetadataEnabled(withTenant.client, 'tenant-1')
    expect(withTenant.qb.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')

    const rls = clientWith({ data: null })
    await readAiMetadataEnabled(rls.client)
    expect(rls.qb.eq).not.toHaveBeenCalled()
  })
})

describe('isAiMetadataDisabledError', () => {
  it('recognises the DB/server message in errors, objects and strings', () => {
    expect(isAiMetadataDisabledError(new Error(AI_METADATA_DISABLED_MESSAGE))).toBe(true)
    expect(isAiMetadataDisabledError({ message: AI_METADATA_DISABLED_MESSAGE })).toBe(true)
    expect(isAiMetadataDisabledError(AI_METADATA_DISABLED_MESSAGE)).toBe(true)
    expect(isAiMetadataDisabledError(new Error('Pin not found'))).toBe(false)
    expect(isAiMetadataDisabledError(null)).toBe(false)
  })
})
