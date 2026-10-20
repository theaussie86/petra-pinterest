import { describe, expect, it } from 'vitest'
import {
  PROTECTED_RESOURCE_METADATA_PATH,
  protectedResourceMetadata,
} from './metadata'

describe('protectedResourceMetadata', () => {
  it('names /mcp as the resource and Supabase Auth as the authorization server', () => {
    const meta = protectedResourceMetadata(
      'https://pinfinity.test',
      'https://project.supabase.co',
    )
    expect(meta).toEqual({
      resource: 'https://pinfinity.test/mcp',
      authorization_servers: ['https://project.supabase.co'],
      bearer_methods_supported: ['header'],
    })
  })

  it('exposes the path-bound well-known metadata path for /mcp', () => {
    expect(PROTECTED_RESOURCE_METADATA_PATH).toBe(
      '/.well-known/oauth-protected-resource/mcp',
    )
  })
})
