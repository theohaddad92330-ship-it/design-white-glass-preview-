import type { Response } from 'express'
import { IMPERSONATION_COOKIE, IMPERSONATION_STATE_COOKIE } from '../auth/impersonation-config'

type SetCookieOpts = { secure: boolean; domain: string | undefined; maxAgeMs: number; loggedInCookieName: string }
type ClearCookieOpts = { secure: boolean; domain: string | undefined; loggedInCookieName: string }

/** Cross-site posture identical to the auth cookies: `None; Secure` in prod (so
 *  the cookie reaches the API on cross-site requests), `Lax` in local dev. */
function sameSite(secure: boolean): 'None' | 'Lax' {
  return secure ? 'None' : 'Lax'
}

/**
 * Builds a `Set-Cookie` header line by hand — the same reason the auth interceptor
 * does: Express's `res.cookie()` (via cookie@0.7) rejects `:` in cookie NAMES, and
 * the warm-session sentinel is `loggedIn:{userId}`. All modern browsers accept `:`
 * in cookie names.
 */
function buildCookieHeader(
  name: string,
  value: string,
  attrs: { httpOnly: boolean; secure: boolean; domain?: string; maxAgeMs: number },
): string {
  const parts = [`${name}=${value}`, `Path=/`, `Max-Age=${Math.floor(attrs.maxAgeMs / 1000)}`]
  parts.push(`Expires=${new Date(Date.now() + attrs.maxAgeMs).toUTCString()}`)
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`)
  if (attrs.httpOnly) parts.push('HttpOnly')
  if (attrs.secure) parts.push('Secure')
  parts.push(`SameSite=${sameSite(attrs.secure)}`)
  return parts.join('; ')
}

/** JS-readable banner metadata — base64url(JSON) of the impersonated email + the
 *  acting admin + expiry. Contains NO token. */
export function encodeImpersonationState(state: { email: string; by: string; exp: number }): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
}

/**
 * Set the impersonation cookies:
 *  - `imp_session` — HttpOnly, carries the token (never visible to JS).
 *  - `imp_state`   — JS-readable, banner metadata only (no token).
 *  - `loggedIn:{userId}` — JS-readable warm-session sentinel so the SPA's
 *    SessionManager boots as the impersonated user (probes `/auth/session`).
 * All are bounded to the token's remaining lifetime.
 */
export function setImpersonationCookies(res: Response, token: string, stateB64: string, opts: SetCookieOpts): void {
  res.append(
    'Set-Cookie',
    buildCookieHeader(IMPERSONATION_COOKIE, token, {
      httpOnly: true,
      secure: opts.secure,
      domain: opts.domain,
      maxAgeMs: opts.maxAgeMs,
    }),
  )
  res.append(
    'Set-Cookie',
    buildCookieHeader(IMPERSONATION_STATE_COOKIE, stateB64, {
      httpOnly: false,
      secure: opts.secure,
      domain: opts.domain,
      maxAgeMs: opts.maxAgeMs,
    }),
  )
  res.append(
    'Set-Cookie',
    buildCookieHeader(opts.loggedInCookieName, '1', {
      httpOnly: false,
      secure: opts.secure,
      domain: opts.domain,
      maxAgeMs: opts.maxAgeMs,
    }),
  )
}

/** Clear all impersonation cookies — the explicit, reversible exit. */
export function clearImpersonationCookies(res: Response, opts: ClearCookieOpts): void {
  for (const name of [IMPERSONATION_COOKIE, IMPERSONATION_STATE_COOKIE, opts.loggedInCookieName]) {
    const httpOnly = name === IMPERSONATION_COOKIE
    res.append(
      'Set-Cookie',
      buildCookieHeader(name, '', { httpOnly, secure: opts.secure, domain: opts.domain, maxAgeMs: 0 }),
    )
  }
}
