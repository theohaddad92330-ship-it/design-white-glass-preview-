import { createHmac, timingSafeEqual } from 'node:crypto'

type UnsubscribeClaims = { workspaceId: string; email: string }

/**
 * Sign a `{workspace, email}` pair into a tamper-proof token embedded in the
 * List-Unsubscribe header + footer of outreach emails. Pure so it can be
 * unit-tested. `secret` = INTERNAL_API_SECRET.
 *
 * Deliberately has NO expiry: an unsubscribe link must keep working forever
 * (a prospect may click it months later — and legally it must still opt them out).
 */
export function signUnsubscribeToken(claims: UnsubscribeClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ w: claims.workspaceId, e: claims.email.toLowerCase() })).toString(
    'base64url',
  )
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Verify + decode a token. Returns the claims, or null if tampered/malformed. */
export function verifyUnsubscribeToken(token: string, secret: string): UnsubscribeClaims | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts
  if (!payload || !sig) return null

  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { w?: unknown; e?: unknown }
    if (typeof decoded.w !== 'string' || typeof decoded.e !== 'string' || !decoded.w || !decoded.e) return null
    return { workspaceId: decoded.w, email: decoded.e }
  } catch {
    return null
  }
}
