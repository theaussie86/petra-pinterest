import { listConnectedAgents, revokeConnectedAgent } from './connected-agents'

const { mockListGrants, mockRevokeGrant } = vi.hoisted(() => ({
  mockListGrants: vi.fn(),
  mockRevokeGrant: vi.fn(),
}))

// Connected Agents are the user's OAuth grants. The settings page calls the
// Supabase OAuth 2.1 server API through the browser client, exactly like the
// consent page does (issue #128, Spec #115, ADR-0006).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      oauth: {
        listGrants: (...args: any[]) => mockListGrants(...args),
        revokeGrant: (...args: any[]) => mockRevokeGrant(...args),
      },
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listConnectedAgents', () => {
  it('maps OAuth grants to the connected-agent display model', async () => {
    mockListGrants.mockResolvedValueOnce({
      data: [
        {
          client: { id: 'c1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' },
          scopes: ['openid', 'profile'],
          granted_at: '2026-10-10T08:00:00Z',
        },
      ],
      error: null,
    })

    const agents = await listConnectedAgents()

    expect(mockListGrants).toHaveBeenCalledTimes(1)
    expect(agents).toEqual([
      {
        clientId: 'c1',
        name: 'Claude',
        grantedAt: '2026-10-10T08:00:00Z',
        scopes: ['openid', 'profile'],
      },
    ])
  })

  it('returns the newest grant first', async () => {
    mockListGrants.mockResolvedValueOnce({
      data: [
        {
          client: { id: 'old', name: 'ChatGPT', uri: '', logo_uri: '' },
          scopes: [],
          granted_at: '2026-01-01T00:00:00Z',
        },
        {
          client: { id: 'new', name: 'Codex', uri: '', logo_uri: '' },
          scopes: [],
          granted_at: '2026-10-01T00:00:00Z',
        },
      ],
      error: null,
    })

    const agents = await listConnectedAgents()

    expect(agents.map((a) => a.clientId)).toEqual(['new', 'old'])
  })

  it('returns an empty list when no agent is connected', async () => {
    mockListGrants.mockResolvedValueOnce({ data: [], error: null })
    expect(await listConnectedAgents()).toEqual([])
  })

  it('tolerates a null data payload', async () => {
    mockListGrants.mockResolvedValueOnce({ data: null, error: null })
    expect(await listConnectedAgents()).toEqual([])
  })

  it('throws when the API errors', async () => {
    mockListGrants.mockResolvedValueOnce({ data: null, error: new Error('boom') })
    await expect(listConnectedAgents()).rejects.toThrow('boom')
  })
})

describe('revokeConnectedAgent', () => {
  it('revokes the grant for the given client id', async () => {
    mockRevokeGrant.mockResolvedValueOnce({ data: {}, error: null })

    await revokeConnectedAgent('c1')

    expect(mockRevokeGrant).toHaveBeenCalledWith({ clientId: 'c1' })
  })

  it('throws when revocation errors', async () => {
    mockRevokeGrant.mockResolvedValueOnce({ data: null, error: new Error('nope') })
    await expect(revokeConnectedAgent('c1')).rejects.toThrow('nope')
  })
})
