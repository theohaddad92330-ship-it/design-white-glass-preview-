import type { ConfigService } from '@nestjs/config'

/**
 * Shared configuration for the admin "impersonate a user" feature.
 *
 * SECURITY MODEL — an impersonation token is a SEPARATE credential from a
 * normal Supabase session:
 *  - It is an HS256 JWT signed with a dedicated key (never the Supabase JWT
 *    secret — mirrors the "encryption key must not derive from JWT_SECRET" rule).
 *  - Its audience is pinned to {@link IMPERSONATION_AUDIENCE}, so a Supabase
 *    session token (aud `authenticated`) can never satisfy the impersonation
 *    strategy and vice-versa (RFC 8707 style binding, same idea as the MCP token).
 *  - It carries the impersonated user as `sub`, the acting admin as `act`, and an
 *    explicit `impersonation: true` claim; it is short-lived (≤ 30 min) and cannot
 *    be refreshed into a normal session (there is no refresh path).
 */

/** Audience pinned on every impersonation token — isolates it from Supabase
 *  sessions (aud `authenticated`) and MCP tokens (aud = MCP resource). */
export const IMPERSONATION_AUDIENCE = 'bellum:impersonation'

/** HttpOnly cookie that carries the impersonation JWT to the browser. Distinct
 *  from the `session:{userId}` cookies so it never collides with a real login. */
export const IMPERSONATION_COOKIE = 'imp_session'

/** JS-readable cookie carrying ONLY display metadata for the banner
 *  (impersonated email + acting admin + expiry). NEVER contains the token. */
export const IMPERSONATION_STATE_COOKIE = 'imp_state'

const DEFAULT_TTL_MINUTES = 15

/**
 * Plafond DUR — un jeton d'incarnation ne vit jamais plus longtemps (#1670.3).
 *
 * ⚠️ EXPORTÉ POUR ÊTRE GARDÉ, ET C'EST SA RAISON D'ÊTRE.
 * « Une session d'incarnation qui traîne est une session oubliée. » Le plafond
 * existait déjà, mais aucun test ne le lisait : porter `30` à `240` serait passé
 * en CI sans qu'une ligne rougisse. Un chiffre que rien ne lit n'est pas une
 * garantie, c'est une intention. `impersonation-config.spec.ts` le lit.
 */
export const MAX_TTL_MINUTES = 30

type ImpersonationConfig = {
  signingKey: string
  issuer: string
  audience: string
  ttlSeconds: number
  frontendUrl: string
  /** User ids that may NOT be impersonated (e.g. other operators / superadmins).
   *  CSV in `IMPERSONATION_PROTECTED_USER_IDS`. Attempts are refused + audited. */
  protectedUserIds: string[]
}

/** La durée demandée par l'environnement, RABOTÉE au plafond. Exportée pour être testée. */
export function readTtlMinutes(): number {
  const raw = Number(process.env['IMPERSONATION_TTL_MINUTES'])
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_MINUTES
  return Math.min(Math.floor(raw), MAX_TTL_MINUTES)
}

function readProtectedUserIds(): string[] {
  const raw = process.env['IMPERSONATION_PROTECTED_USER_IDS'] ?? ''
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Resolve the impersonation config from the environment.
 *
 * The signing key defaults to `INTERNAL_API_SECRET` (a strong M2M secret, enforced
 * ≥ 32 chars in production by the env schema) — NOT the Supabase JWT secret. An
 * explicit `IMPERSONATION_SIGNING_KEY` overrides it for full key separation.
 */
export function readImpersonationConfig(config: ConfigService): ImpersonationConfig {
  const signingKey = process.env['IMPERSONATION_SIGNING_KEY']?.trim() || config.get<string>('internalApiSecret') || ''
  const issuer = trimTrailingSlash(config.get<string>('apiPublicUrl') ?? 'http://localhost:3000')
  const frontendUrl = trimTrailingSlash(config.get<string>('frontendUrl') ?? 'http://localhost:5173')
  return {
    signingKey,
    issuer,
    audience: IMPERSONATION_AUDIENCE,
    ttlSeconds: readTtlMinutes() * 60,
    frontendUrl,
    protectedUserIds: readProtectedUserIds(),
  }
}
