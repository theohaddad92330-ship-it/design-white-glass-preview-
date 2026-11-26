import { createHash, timingSafeEqual } from 'crypto'
import { Injectable } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Request } from 'express'
import { pickScopedCookie, readSessionScopeHint } from './auth/scoped-session-cookie'
import { JwksCache } from '../modules/auth/jwks-cache'

const DEFAULT_SESSION_PREFIX = 'session'

/**
 * Compteur de quota par UTILISATEUR quand la requête est authentifiée, par IP
 * sinon.
 *
 * `ThrottlerGuard` compte par IP. Le commentaire du module annonçait « per
 * IP/user », mais aucun `getTracker` ne le mettait en œuvre : les cinq
 * commerciaux d'une ESN derrière le NAT du bureau se partageaient donc UN seul
 * quota — douze requêtes chacun. Le premier à ouvrir un dossier consommait la
 * fenêtre des autres.
 *
 * ⚠️ Sécurité (pentest 2026-09-12, finding #1). L'ancienne version dérivait la
 * clé de comptage du NOM du cookie `session:<suffixe>` fourni par le client, en
 * pariant qu'« une clé forgée ne donne accès à rien — au pire son porteur se
 * rate-limite lui-même ». C'était FAUX : ce garde est `APP_GUARD`, il tourne
 * AVANT le `JwtGuard` de contrôleur, donc `req.user` est absent sur les routes
 * d'auth (`/auth/login`, `/auth/request-otp`, `/oauth/register`…) et le repli
 * cookie s'appliquait. Un attaquant anonyme envoyait `Cookie: session:<aléa
 * différent à chaque requête>=x` : chaque requête tombait dans un compteur
 * NEUF, ce qui annulait TOUS les `@Throttle` non authentifiés (bourrage de mot
 * de passe et d'OTP, amplification e-mail, énumération, abus des routes qui
 * appellent le modèle). Prouvé en direct : `x-ratelimit-remaining` restait à sa
 * valeur pleine à chaque cookie forgé.
 *
 * Le NOM d'un cookie n'appartient à personne — sa VALEUR, elle, est un JWT
 * signé. On vérifie donc la SIGNATURE du jeton porté par le cookie de session
 * (même dispatch HS256 / asymétrique-JWKS que {@link JwtStrategy}, dédupliqué
 * ici pour ne pas toucher le chemin d'auth) et on ne clé sur l'utilisateur que
 * si le jeton est valide. Un cookie forgé a un JWT invalide → repli sur l'IP,
 * que l'attaquant ne peut pas faire tourner. Le fix NAT est préservé : un vrai
 * commercial porte un jeton valide, donc son propre compteur.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  /**
   * #4962 — les appels IA→API (`/internal/*`) n'ont ni cookie ni utilisateur : ils
   * tombaient tous sur `ip:<ip de l'IA>` et une rafale « Découvrir » affamait Laura
   * (44 × 429 le 02/11). Ce garde tourne AVANT `InternalSecretGuard` : on vérifie
   * donc ici le même secret ; valide ⇒ pas de quota utilisateur/IP. Sans secret
   * valide la requête reste comptée (et `InternalSecretGuard` la refuse ensuite).
   */
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true
    const req = context.switchToHttp().getRequest<{
      originalUrl?: string
      url?: string
      headers?: Record<string, string | string[] | undefined>
    }>()
    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? ''
    if (!/^\/internal(\/|$)/.test(path)) return false
    const raw = req.headers?.['x-internal-secret']
    const provided = Array.isArray(raw) ? raw[0] : raw
    const expected = process.env['INTERNAL_API_SECRET'] ?? ''
    if (!provided || !expected) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  protected async getTracker(req: Request): Promise<string> {
    // Si un garde d'auth a déjà tourné (Bearer, ordre inhabituel), on lui fait
    // confiance directement.
    const fromGuard = (req as { user?: { userId?: unknown } }).user?.userId
    if (typeof fromGuard === 'string' && fromGuard) return `user:${fromGuard}`

    const cookies = (req as { cookies?: Record<string, string> }).cookies
    const prefix = process.env['SESSION_COOKIE_PREFIX'] || DEFAULT_SESSION_PREFIX
    const rawJwt = pickScopedCookie(
      cookies,
      prefix,
      readSessionScopeHint(req.headers as unknown as Record<string, unknown>),
    )
    if (rawJwt) {
      const sub = await verifiedSub(rawJwt)
      if (sub) return `user:${sub}`
    }
    return `ip:${req.ip ?? 'unknown'}`
  }
}

// --- Vérification du JWT de session, isolée du chemin d'auth ----------------
// Ces fonctions RÉPLIQUENT volontairement le dispatch de `JwtStrategy`
// (secret HS256 / clé asymétrique par `kid` via JWKS, audience épinglée,
// algorithmes verrouillés). On ne les factorise pas avec la stratégie pour ne
// prendre AUCUN risque sur le chemin d'authentification : ici, une erreur ne
// fait que dégrader la clé de rate-limit vers l'IP, jamais accorder un accès.

const jwtService = new JwtService()
let jwksCache: JwksCache | null | undefined

function sessionSecret(): string {
  return process.env['SUPABASE_JWT_SECRET'] || (process.env['NODE_ENV'] === 'test' ? 'test-jwt-secret' : '')
}

function jwks(): JwksCache | null {
  if (jwksCache === undefined) {
    const url = process.env['SUPABASE_URL']?.replace(/\/$/, '')
    jwksCache = url ? new JwksCache(`${url}/auth/v1/.well-known/jwks.json`) : null
  }
  return jwksCache
}

function decodeHeader(rawJwt: string): { alg?: string; kid?: string } {
  try {
    const segment = rawJwt.split('.')[0] ?? ''
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { alg?: string; kid?: string }
  } catch {
    return {}
  }
}

/**
 * Perf P2 (29/09/2026) — le `sub` des jetons DÉJÀ vérifiés, jusqu'à leur `exp`.
 *
 * Ce garde tourne sur CHAQUE appel (APP_GUARD, avant le JwtGuard) et
 * revérifiait la signature du même jeton à chaque fois — 10 à 41 fois par page.
 * « Décoder seulement l'id » est REFUSÉ : sans vérification, un attaquant
 * anonyme forge un `sub` neuf par requête et annule tout `@Throttle` (finding
 * #1). On mémorise donc seulement le résultat d'une vérification RÉUSSIE :
 * - clé = empreinte SHA-256 du jeton (jamais le jeton lui-même) ;
 * - un jeton forgé n'y entre jamais (il est revérifié et refusé à chaque fois),
 *   donc un attaquant ne peut pas remplir la table ;
 * - l'entrée meurt à l'`exp` du jeton (la vérification l'aurait refusé) ;
 * - taille bornée (on vide la plus ancienne au-delà du plafond).
 */
const VERIFIED_MAX_ENTRIES = 5_000
const verifiedTokens = new Map<string, { sub: string; expiresAtMs: number }>()

function tokenDigest(rawJwt: string): string {
  return createHash('sha256').update(rawJwt).digest('hex')
}

/** Le `sub` d'un JWT de session VÉRIFIÉ, ou `null` si absent/forgé/expiré. */
async function verifiedSub(rawJwt: string): Promise<string | null> {
  const digest = tokenDigest(rawJwt)
  const known = verifiedTokens.get(digest)
  if (known) {
    if (known.expiresAtMs > Date.now()) return known.sub
    verifiedTokens.delete(digest)
  }
  const sub = await verifySub(rawJwt)
  if (sub) {
    const expSeconds = decodeExp(rawJwt)
    // Sans `exp` lisible, on ne mémorise pas : on revérifiera.
    if (expSeconds !== null) {
      if (verifiedTokens.size >= VERIFIED_MAX_ENTRIES) {
        const oldest = verifiedTokens.keys().next().value
        if (oldest !== undefined) verifiedTokens.delete(oldest)
      }
      verifiedTokens.set(digest, { sub, expiresAtMs: expSeconds * 1000 })
    }
  }
  return sub
}

function decodeExp(rawJwt: string): number | null {
  try {
    const segment = rawJwt.split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null
  } catch {
    return null
  }
}

/** Vérifie la signature (même dispatch que `JwtStrategy`) et rend le `sub`. */
async function verifySub(rawJwt: string): Promise<string | null> {
  try {
    const header = decodeHeader(rawJwt)
    let payload: { sub?: unknown }
    if (!header.kid || header.alg === 'HS256') {
      const secret = sessionSecret()
      if (!secret) return null
      payload = await jwtService.verifyAsync(rawJwt, {
        secret,
        algorithms: ['HS256', 'ES256', 'RS256'],
        audience: 'authenticated',
      })
    } else {
      const cache = jwks()
      if (!cache) return null
      const key = await cache.getPublicKey(header.kid)
      payload = await jwtService.verifyAsync(rawJwt, {
        publicKey: key.export({ type: 'spki', format: 'pem' }),
        algorithms: ['HS256', 'ES256', 'RS256'],
        audience: 'authenticated',
      })
    }
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}
