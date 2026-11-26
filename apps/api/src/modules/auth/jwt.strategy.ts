import { SESSION_REVOKED_CODE } from '@bellum/contracts'
import { TechnicalError } from '@bellum/errors'
import { Injectable, Optional, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import type { Request } from 'express'
import { ExtractJwt, Strategy, type SecretOrKeyProvider } from 'passport-jwt'
import { pickScopedCookie, readSessionScopeHint } from '../../common/auth/scoped-session-cookie'
import { DEVICE_COOKIE_NAME } from './device-cookie'
import { JwksCache } from './jwks-cache'
import { SessionRegistryService } from './session-registry.service'

/** Durée du cache « non révoquée » : borne le délai de prise d'effet d'une
 *  révocation ET la charge base (une lecture par appareil et par fenêtre). */
const REVOCATION_TTL_MS = 30 * 1000
/** Borne du cache « non révoquée » : la clé inclut le cookie, choisi par l'appelant. */
const NOT_REVOKED_CACHE_MAX = 5000

type JwtPayload = {
  sub: string
  email?: string
  role?: string
  aud?: string
  /** Émission du jeton (secondes) : rattache la révocation au jeton (audit H2). */
  iat?: number
}

const DEFAULT_SESSION_PREFIX = 'session'

/**
 * Reads the access JWT from the user-scoped `session:{userId}` cookie that
 * belongs to the identity THIS TAB declared, falling back to the first cookie
 * when nothing is declared. SPA cookies arrive automatically thanks to
 * `credentials: 'include'`, so this is the primary auth path.
 *
 * Voir {@link pickScopedCookie} : c'est ici que deux onglets — l'un sur un vrai
 * compte, l'autre sur la démonstration — cessaient d'être deux sessions.
 */
function extractFromSessionCookie(prefix: string): (req: Request) => string | null {
  return (req: Request) =>
    pickScopedCookie(
      req.cookies as Record<string, string> | undefined,
      prefix,
      readSessionScopeHint(req.headers as unknown as Record<string, unknown>),
    )
}

/** Best-effort decode of a JWT header — never throws, returns `{}` on garbage. */
function decodeJwtHeader(rawJwt: string): { alg?: string; kid?: string } {
  try {
    const segment = rawJwt.split('.')[0] ?? ''
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { alg?: string; kid?: string }
  } catch {
    return {}
  }
}

/**
 * Validates Supabase-issued access JWTs. Supabase now ships asymmetric JWT
 * signing keys (ES256/RS256, rotated per-project via the JWKS endpoint) and is
 * migrating projects off the legacy HS256 shared secret. We support BOTH:
 *   - HS256 tokens → verified against the project JWT secret (SUPABASE_JWT_SECRET).
 *   - ES256/RS256  → the signing key is fetched by `kid` from the project's
 *                    JWKS (`/auth/v1/.well-known/jwks.json`), cached in-process.
 * Tokens carry `aud: 'authenticated'`; we pin the audience to reject
 * service-role tokens minted with the same secret, and lock the algorithm list
 * to block `alg: none` downgrade attacks. We deliberately don't pin `iss` —
 * Supabase's exact issuer string varies across projects/regions and the
 * audience + signature is enough.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /** Cache court des sessions NON révoquées, pour ne pas frapper la base à chaque
   *  requête (finding #6). Une révocation prend donc effet en ≤ REVOCATION_TTL_MS,
   *  contre ≤ la durée du jeton (1 h par défaut, 24 h max) avant ce lot. */
  private readonly notRevokedCache = new Map<string, number>()

  constructor(
    config: ConfigService,
    // `@Optional()` : la révocation par requête est une défense en profondeur.
    // Un module de test minimal qui monte la stratégie sans le registre saute
    // simplement le contrôle (comme un hoquet base) — il n'a jamais à fournir
    // trois dépôts pour tester autre chose. En production, `AuthModule` le
    // fournit, donc le contrôle tourne.
    @Optional() private readonly sessions?: SessionRegistryService,
  ) {
    const secret =
      config.get<string>('supabaseJwtSecret', '') || (process.env['NODE_ENV'] === 'test' ? 'test-jwt-secret' : '')
    if (!secret) {
      throw new TechnicalError('SUPABASE_JWT_SECRET must be configured')
    }
    const sessionPrefix = config.get<string>('sessionCookiePrefix', DEFAULT_SESSION_PREFIX)

    // JWKS resolver for asymmetric verification. Without SUPABASE_URL (some unit
    // tests) we still serve the HS256 path; asymmetric tokens then fail closed.
    const supabaseUrl = config.get<string>('supabaseUrl', '')?.replace(/\/$/, '')
    const jwks = supabaseUrl ? new JwksCache(`${supabaseUrl}/auth/v1/.well-known/jwks.json`) : null

    // Dispatch on the token header: HS256 → shared secret; asymmetric → JWKS.
    const secretOrKeyProvider: SecretOrKeyProvider = (_req, rawJwtToken, done) => {
      const header = decodeJwtHeader(String(rawJwtToken))
      if (!header.kid || header.alg === 'HS256') {
        done(null, secret)
        return
      }
      if (!jwks) {
        done(new Error('Asymmetric JWT received but JWKS is not configured (SUPABASE_URL missing)'))
        return
      }
      jwks
        .getPublicKey(header.kid)
        .then(key => done(null, key.export({ type: 'spki', format: 'pem' })))
        .catch((err: Error) => done(err))
    }

    super({
      // Cookie first (browser SPA), Bearer fallback (server-to-server,
      // tests, curl, mobile clients that don't carry cookies).
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromSessionCookie(sessionPrefix),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKeyProvider,
      algorithms: ['HS256', 'ES256', 'RS256'],
      audience: 'authenticated',
      // On a besoin de la requête pour lire le cookie d'appareil et vérifier la
      // révocation de session à CHAQUE requête (finding #6).
      passReqToCallback: true,
    })
  }

  /**
   * ⚠️ Révocation par requête (finding pentest #6). Le jeton Supabase est
   * auto-porté : sans ce contrôle, `isRevoked` n'était consulté qu'au refresh,
   * donc un jeton volé restait valide jusqu'à son `exp` (1 h par défaut, 24 h
   * max) MALGRÉ un logout, un « déconnecter cet appareil » ou l'éviction au-delà
   * du plafond d'appareils (`MAX_ACTIVE_DEVICES`, `@bellum/contracts`). La révocation est clé sur `(user_id, device_id)` où
   * `device_id` est le cookie `bellum_did` — on le lit sur la requête.
   *
   * Audit H2 : un jeton sans cookie d'appareil (ou avec un UUID neuf) n'échappe
   * plus au contrôle — la révocation se rattache au jeton lui-même (`iat`, vérifié
   * par la signature) : refusé si une session du compte a été révoquée depuis son
   * émission (voir `SessionRegistryService.isRevoked`).
   * Fail-OPEN sur erreur base : un hoquet ne doit pas déconnecter tout le monde.
   */
  async validate(req: Request, payload: JwtPayload): Promise<{ userId: string; email: string }> {
    const userId = payload.sub
    const rawDeviceId = req.cookies?.[DEVICE_COOKIE_NAME]
    const deviceId = typeof rawDeviceId === 'string' && rawDeviceId.length > 0 ? rawDeviceId : null
    const issuedAt = typeof payload.iat === 'number' ? new Date(payload.iat * 1000) : undefined
    if (this.sessions) {
      const key = `${userId}:${deviceId ?? '-'}:${deviceId ? '' : (payload.iat ?? '')}`
      const cachedUntil = this.notRevokedCache.get(key)
      if (!cachedUntil || cachedUntil < Date.now()) {
        let revoked = false
        try {
          revoked = await this.sessions.isRevoked(userId, deviceId, issuedAt)
        } catch {
          revoked = false // fail-open : jamais déconnecter tout le monde sur un hoquet base
        }
        if (revoked) {
          this.notRevokedCache.delete(key)
          // R15-7 : le code machine dit « révoqué », pas « expiré » — le client ne
          // relance pas de refresh et propose de se reconnecter.
          throw new UnauthorizedException({ code: SESSION_REVOKED_CODE, message: 'Session révoquée sur cet appareil.' })
        }
        if (this.notRevokedCache.size >= NOT_REVOKED_CACHE_MAX) {
          const oldest = this.notRevokedCache.keys().next().value
          if (oldest !== undefined) this.notRevokedCache.delete(oldest)
        }
        this.notRevokedCache.set(key, Date.now() + REVOCATION_TTL_MS)
      }
    }
    return {
      userId,
      email: payload.email || '',
    }
  }
}
