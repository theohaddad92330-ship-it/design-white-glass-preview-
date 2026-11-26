import { Injectable, Optional, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { InjectRepository } from '@nestjs/typeorm'
import type { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { Repository } from 'typeorm'
import { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'
import { readSessionScopeHint } from '../../common/auth/scoped-session-cookie'
import { IMPERSONATION_COOKIE, readImpersonationConfig } from './impersonation-config'

type ImpersonationPayload = {
  sub: string
  email?: string
  act?: string
  impersonation?: boolean
  jti?: string
  aud?: string
  iss?: string
}

/** The principal shape written to `req.user` for an impersonation session. It is
 *  a superset of {@link CurrentUserPayload} (`userId` + `email`), so every
 *  downstream `@CurrentUser()` and workspace resolver behaves identically — the
 *  request is scoped to the IMPERSONATED user's data (RLS / workspace filters all
 *  key off `userId`), never the admin's. */
export type ImpersonationPrincipal = {
  userId: string
  email: string
  impersonation: true
  impersonatorId: string
  jti: string
}

/** Le `sub` d'un JWT SANS vérifier sa signature — uniquement pour décider si ce cookie concerne l'onglet
 *  appelant. Rien n'est accordé ici : la stratégie vérifie ensuite le jeton en entier. */
function unverifiedSub(token: string): string | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const sub = (JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { sub?: unknown }).sub
    return typeof sub === 'string' ? sub.toLowerCase() : null
  } catch {
    return null
  }
}

/** Reads the impersonation JWT from the dedicated `imp_session` cookie. Distinct
 *  from the Supabase `session:` cookies, so the two credentials never collide.
 *
 *  #4608.5 — quand l'onglet DIT pour qui il travaille (`x-bellum-user`) et que ce n'est pas le compte incarné
 *  (la salle de démonstration ouverte à côté), le cookie d'incarnation s'efface : la requête retombe sur la
 *  session de l'onglet. Sans cela, l'incarnation « gagnait » et la démo était servie avec les VRAIES données. */
export function fromImpersonationCookie(): (req: Request) => string | null {
  return (req: Request) => {
    const cookies = req.cookies as Record<string, string> | undefined
    const token = cookies?.[IMPERSONATION_COOKIE] ?? null
    if (!token) return null
    const hint = readSessionScopeHint(req.headers as Record<string, unknown> | undefined)
    if (hint && unverifiedSub(token) !== hint) return null
    return token
  }
}

/**
 * Validates admin impersonation tokens (passport strategy `impersonation`).
 *
 * HS256 only (blocks alg-confusion / `none`), issuer + audience pinned so a
 * Supabase session token can never be replayed here. The `impersonation: true`
 * claim is re-asserted defensively. Accepts the token from the dedicated
 * `imp_session` cookie (browser SPA path) OR a Bearer header (server-to-server /
 * tests). It is tried BEFORE the Supabase `jwt` strategy in {@link JwtGuard}, so
 * an active impersonation cookie always wins over any stale normal-session cookie
 * that may co-exist in the same browser.
 */
@Injectable()
export class ImpersonationStrategy extends PassportStrategy(Strategy, 'impersonation') {
  constructor(
    config: ConfigService,
    // LUDOVIC-D LC.10 — le journal d'audit, pour refuser une session TERMINÉE (ligne `stop`). Optionnel :
    // absent (test nu), la vérification est sautée — jamais un refus deviné.
    @Optional()
    @InjectRepository(ImpersonationAuditEntity)
    private readonly audit?: Repository<ImpersonationAuditEntity>,
  ) {
    const { signingKey, issuer, audience } = readImpersonationConfig(config)
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromImpersonationCookie(), ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      // Never empty in practice (falls back to INTERNAL_API_SECRET); a placeholder
      // keeps passport from throwing at construction in a mis-provisioned test env.
      secretOrKey: signingKey || 'impersonation-unconfigured',
      algorithms: ['HS256'],
      issuer,
      audience,
    })
  }

  async validate(payload: ImpersonationPayload): Promise<ImpersonationPrincipal> {
    // Defence in depth: even a (theoretically forged) aud-matching token must
    // carry the explicit impersonation flag to be treated as one.
    if (payload.impersonation !== true) {
      throw new UnauthorizedException('Jeton invalide')
    }
    // LUDOVIC-D LC.10 — une session terminée (par l'opérateur ou par un admin depuis /impersonations)
    // ne se rejoue pas jusqu'à l'expiration du jeton : la ligne `stop` du journal la ferme.
    if (this.audit && payload.jti && (await this.audit.count({ where: { jti: payload.jti, action: 'stop' } })) > 0) {
      throw new UnauthorizedException('Session d’incarnation terminée')
    }
    return {
      userId: payload.sub,
      email: payload.email || '',
      impersonation: true,
      impersonatorId: payload.act || '',
      jti: payload.jti || '',
    }
  }
}
