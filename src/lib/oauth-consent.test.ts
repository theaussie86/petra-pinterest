import { describe, expect, it } from 'vitest'
import { describeRedirectHost, safeNextPath } from './oauth-consent'

// ─── safeNextPath ────────────────────────────────────────────────
//
// The `next` return path survives Google login + the auth callback. It must
// never become an open redirect, so only same-origin relative paths are let
// through; everything else falls back to the dashboard (Spec #115, ADR-0006).

describe('safeNextPath', () => {
  it('returns the dashboard when next is missing', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath('')).toBe('/dashboard')
  })

  it('keeps a relative path with query and hash', () => {
    expect(safeNextPath('/oauth/consent?authorization_id=abc123')).toBe(
      '/oauth/consent?authorization_id=abc123',
    )
    expect(safeNextPath('/settings#agents')).toBe('/settings#agents')
  })

  it('rejects absolute URLs to another origin', () => {
    expect(safeNextPath('https://evil.com/phish')).toBe('/dashboard')
    expect(safeNextPath('http://evil.com')).toBe('/dashboard')
  })

  it('rejects protocol-relative and backslash redirects', () => {
    expect(safeNextPath('//evil.com')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.com')).toBe('/dashboard')
    expect(safeNextPath('\\/evil.com')).toBe('/dashboard')
  })

  it('rejects paths that do not start with a single slash', () => {
    expect(safeNextPath('dashboard')).toBe('/dashboard')
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeNextPath(' /dashboard')).toBe('/dashboard')
  })

  it('rejects embedded control characters', () => {
    expect(safeNextPath('/dash\nboard')).toBe('/dashboard')
  })
})

// ─── describeRedirectHost ────────────────────────────────────────
//
// The consent page warns when a client redirects to a host we do not know.
// Known: claude.ai and chatgpt.com over https (incl. subdomains), and
// localhost / 127.0.0.1 over http for local dev (Claude Code, Codex).

describe('describeRedirectHost', () => {
  it('knows claude.ai and chatgpt.com over https', () => {
    expect(describeRedirectHost('https://claude.ai/api/mcp/callback')).toEqual({
      host: 'claude.ai',
      known: true,
    })
    expect(describeRedirectHost('https://chatgpt.com/connector/callback')).toEqual(
      { host: 'chatgpt.com', known: true },
    )
  })

  it('knows subdomains of the known https hosts', () => {
    expect(describeRedirectHost('https://app.claude.ai/cb').known).toBe(true)
  })

  it('knows localhost and 127.0.0.1 over http', () => {
    expect(describeRedirectHost('http://localhost:33418/callback')).toEqual({
      host: 'localhost',
      known: true,
    })
    expect(describeRedirectHost('http://127.0.0.1:5173/cb').known).toBe(true)
  })

  it('does not know localhost over https-less arbitrary hosts', () => {
    expect(describeRedirectHost('https://evil.com/callback')).toEqual({
      host: 'evil.com',
      known: false,
    })
  })

  it('does not trust a lookalike host that merely contains a known host', () => {
    expect(describeRedirectHost('https://claude.ai.evil.com/cb').known).toBe(
      false,
    )
  })

  it('treats http on a non-local host as unknown', () => {
    expect(describeRedirectHost('http://claude.ai/cb').known).toBe(false)
  })

  it('falls back to the raw string for an unparseable uri', () => {
    expect(describeRedirectHost('not a url')).toEqual({
      host: 'not a url',
      known: false,
    })
  })
})
