import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'

/** HttpOnly, long-lived cookie identifying a browser (a "device") for the
 *  concurrent-session cap. Not user-scoped, carries no auth — just a random id. */
export const DEVICE_COOKIE_NAME = 'bellum_did'
const DEVICE_TTL_MS = 400 * 24 * 60 * 60 * 1000 // 400d (Chrome caps persistent cookies here)

export function getDeviceId(req: Request): string | null {
  const cookies = (req.cookies ?? {}) as Record<string, string>
  return cookies[DEVICE_COOKIE_NAME] ?? null
}

/** Returns the existing device id or mints + sets a fresh one on the response.
 *  Mirrors the auth cookies' cross-site posture (`SameSite=None; Secure` in prod,
 *  `Lax` in dev) so it reaches the API on cross-site requests. */
export function ensureDeviceId(req: Request, res: Response, opts: { secure: boolean; domain?: string }): string {
  const existing = getDeviceId(req)
  if (existing) return existing
  const id = randomUUID()
  res.cookie(DEVICE_COOKIE_NAME, id, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: opts.secure ? 'none' : 'lax',
    path: '/',
    domain: opts.domain,
    maxAge: DEVICE_TTL_MS,
  })
  return id
}

/** Best-effort client IP. `main.ts` règle `trust proxy` sur un nombre de sauts
 *  précis (1), donc Express résout `req.ip` depuis X-Forwarded-For en ne croyant
 *  que le proxy connu. On ne relit JAMAIS l'en-tête soi-même : le 1er élément est
 *  contrôlé par le client (audit M7) et forgeait le journal d'incarnation. Sans
 *  proxy de confiance, `req.ip` est l'IP de la socket. Affichage + heuristique de
 *  partage uniquement, jamais une décision d'auth. */
export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null
}

export function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua.slice(0, 400) : null
}
