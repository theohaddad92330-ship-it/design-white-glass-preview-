/**
 * JS-readable presence flag written by the API alongside the HttpOnly
 * auth cookies (`session:{userId}` and `uploadsSig:{userId}`). We can't
 * read those from JS — `loggedIn:{userId}=1` acts as a "session exists"
 * sentinel without exposing the tokens themselves.
 *
 * Used by:
 *  - `SessionManager.loadSession` to short-circuit `/auth/refresh` on boot
 *    for anonymous visitors.
 *  - `apiFetch` to decide whether a 401 deserves a retry-after-refresh
 *    or should fail fast.
 */
const LOGGED_IN_COOKIE_PREFIX = 'loggedIn:'

export function hasLoggedInCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some(c => c.startsWith(LOGGED_IN_COOKIE_PREFIX) && c.endsWith('=1'))
}
