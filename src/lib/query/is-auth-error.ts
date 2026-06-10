/**
 * Classifies an error as a session-expiry / authentication failure.
 *
 * Used by the global query-error handler to decide when to redirect to
 * `/login`. A data request that fails because the session JWT expired or is
 * invalid surfaces as an HTTP `401` (Supabase Auth / PostgREST) or a PostgREST
 * error whose message reads "JWT expired" (code `PGRST301`). Ordinary data,
 * validation, and server errors must NOT match — they should bubble to the
 * normal error UI instead of bouncing the user to login.
 *
 * Pure predicate: no I/O, safe to call from anywhere.
 */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const e = error as Record<string, unknown>

  // HTTP 401 from Supabase Auth (`status`) or a fetch wrapper (`statusCode`).
  if (e.status === 401 || e.statusCode === 401) {
    return true
  }

  // PostgREST signals an expired/invalid JWT with code PGRST301.
  if (e.code === 'PGRST301') {
    return true
  }

  // Fallback: the message itself names the expiry (covers shapes that don't
  // carry a status, e.g. realtime/socket auth errors).
  if (typeof e.message === 'string' && /jwt expired/i.test(e.message)) {
    return true
  }

  return false
}
