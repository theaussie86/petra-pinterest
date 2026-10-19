/**
 * Prefactor guard for the MCP work (issue #117, Spec #115, ADR-0006).
 *
 * The `/mcp` OAuth flow relies on Supabase Auth acting as an OAuth 2.1
 * authorization server. That server-side consent API (`auth.oauth`) only exists
 * from a recent `@supabase/supabase-js` release onwards. This test pins the
 * dependency: it builds a real client (no mock) and asserts the OAuth server
 * methods the consent page and the "Verbundene Agenten" settings will call.
 *
 * If a future change downgrades `@supabase/supabase-js` below the version that
 * ships the OAuth 2.1 server API, this guard fails before any MCP code breaks.
 */
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe('supabase-js OAuth 2.1 server API (prefactor for MCP)', () => {
  const client = createClient(
    'https://example.supabase.co',
    'anon-key-placeholder',
  )

  it('exposes the auth.oauth server namespace', () => {
    expect(client.auth.oauth).toBeTypeOf('object')
  })

  it.each([
    'getAuthorizationDetails',
    'approveAuthorization',
    'denyAuthorization',
    'listGrants',
    'revokeGrant',
  ] as const)('provides auth.oauth.%s()', (method) => {
    expect(client.auth.oauth[method]).toBeTypeOf('function')
  })
})
