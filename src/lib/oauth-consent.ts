/**
 * Pure helpers for the MCP OAuth consent flow (Spec #115, ADR-0006).
 *
 * Kept free of React, the router and Supabase so they are trivially testable
 * and reusable from the login page, the auth callback and the consent page.
 */

/** Where a login lands when no safe `next` path is supplied. */
export const DEFAULT_NEXT_PATH = '/dashboard'

/**
 * Normalise a `next` return path to a safe, same-origin relative path.
 *
 * The consent flow sends the user through Google login and the auth callback
 * carrying a `next` path. An attacker who controls that value could otherwise
 * turn the login into an open redirect, so only relative paths on this origin
 * are allowed; anything else falls back to {@link DEFAULT_NEXT_PATH}.
 *
 * Rejected: absolute URLs, protocol-relative (`//host`) and backslash tricks
 * (`/\host`, `\/host`), values not starting with a single `/`, and anything
 * with embedded control characters.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_NEXT_PATH

  // Must be a plain relative path: a single leading slash, no backslashes that
  // browsers would fold into a host, no control chars that could smuggle a
  // scheme or split the value.
  if (!next.startsWith('/')) return DEFAULT_NEXT_PATH
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_NEXT_PATH
  if (next.includes('\\')) return DEFAULT_NEXT_PATH
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return DEFAULT_NEXT_PATH

  // Resolve against a throwaway origin; anything that escapes it is rejected.
  try {
    const url = new URL(next, 'http://localhost')
    if (url.origin !== 'http://localhost') return DEFAULT_NEXT_PATH
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return DEFAULT_NEXT_PATH
  }
}

/** Host the consent page shows, plus whether we recognise it. */
export interface RedirectHostInfo {
  /** Hostname for display, or the raw input when it does not parse. */
  host: string
  /** True when the host is a known OAuth client callback (no warning shown). */
  known: boolean
}

/** Hosts we trust over https, including their subdomains. */
const KNOWN_HTTPS_HOSTS = ['claude.ai', 'chatgpt.com'] as const

/** Loopback hosts we trust over http for local dev (Claude Code, Codex). */
const KNOWN_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const

/**
 * Describe the redirect host of an OAuth client for the consent page, flagging
 * unknown hosts so the user is warned before approving an unfamiliar client.
 *
 * Known hosts: `claude.ai` and `chatgpt.com` (and their subdomains) over https,
 * and `localhost` / `127.0.0.1` over http. Everything else is unknown — a
 * lookalike like `claude.ai.evil.com` must not match.
 */
export function describeRedirectHost(redirectUri: string): RedirectHostInfo {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return { host: redirectUri, known: false }
  }

  const host = url.hostname

  if (url.protocol === 'https:') {
    const known = KNOWN_HTTPS_HOSTS.some(
      (known) => host === known || host.endsWith(`.${known}`),
    )
    return { host, known }
  }

  if (url.protocol === 'http:') {
    return { host, known: (KNOWN_LOCAL_HOSTS as readonly string[]).includes(host) }
  }

  return { host, known: false }
}
