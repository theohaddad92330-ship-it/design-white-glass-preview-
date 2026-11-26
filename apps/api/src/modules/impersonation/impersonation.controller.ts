import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { correlationStorage } from '../../correlation-id/correlation-id.store'
import { clientIp } from '../auth/device-cookie'
import type { ImpersonationPrincipal } from '../auth/impersonation.strategy'
import { JwtGuard } from '../auth/jwt.guard'
import { clearImpersonationCookies, encodeImpersonationState, setImpersonationCookies } from './impersonation-cookies'
import { ImpersonationService } from './impersonation.service'
import { ImpersonationTokenService } from './impersonation-token.service'
import { ImpersonationVisibilityService, type ImpersonationVisibility } from './impersonation-visibility.service'

/** Pull a Bearer token from the Authorization header, if present. */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && value ? value.trim() : null
}

type ImpersonationContext =
  | { impersonating: false }
  | { impersonating: true; target_user_id: string; target_email: string; impersonator: string }

/**
 * Browser-facing endpoints for the impersonation session lifecycle.
 *
 * - `POST consume` (unguarded, manual verify): the SPA lands with the token in
 *   the URL fragment and exchanges it here for the `imp_session` HttpOnly cookie
 *   (+ the JS-readable `imp_state` banner cookie). It is deliberately NOT behind
 *   JwtGuard, because JwtGuard's read-only policy blocks writes during
 *   impersonation — and this IS the entry point.
 * - `POST stop` (JwtGuard, the one write the policy allows): audits the stop and
 *   clears the cookies — the explicit, reversible exit.
 * - `GET context` (JwtGuard): lets the SPA confirm impersonation server-side.
 */
@Controller('auth/impersonate')
export class ImpersonationController {
  private readonly cookieSecure: boolean
  private readonly cookieDomain: string | undefined
  private readonly loggedInPrefix: string

  constructor(
    private readonly tokens: ImpersonationTokenService,
    private readonly impersonation: ImpersonationService,
    private readonly visibilityService: ImpersonationVisibilityService,
    config: ConfigService,
  ) {
    this.cookieSecure = config.get<string>('nodeEnv') === 'production'
    this.cookieDomain = config.get<string>('cookieDomain', '')?.trim() || undefined
    this.loggedInPrefix = config.get<string>('loggedInCookiePrefix', 'loggedIn')
  }

  /** The JS-readable presence sentinel the SPA's SessionManager checks on boot.
   *  Setting it (scoped to the IMPERSONATED user) makes the app probe
   *  `/auth/session` — which the imp_session cookie authenticates — so the SPA
   *  boots as the impersonated user without any SessionManager change. */
  private loggedInSentinel(userId: string): string {
    return `${this.loggedInPrefix}:${userId}`
  }

  @Post('consume')
  @HttpCode(200)
  consume(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = extractBearer(req.headers.authorization)
    if (!token) {
      throw new UnauthorizedException('Jeton d’incarnation manquant.')
    }
    let payload
    try {
      payload = this.tokens.verify(token)
    } catch {
      throw new UnauthorizedException('Jeton d’incarnation invalide ou expiré.')
    }

    const remainingMs = Math.max(0, payload.exp * 1000 - Date.now())
    const stateB64 = encodeImpersonationState({ email: payload.email ?? '', by: payload.act ?? '', exp: payload.exp })
    setImpersonationCookies(res, token, stateB64, {
      secure: this.cookieSecure,
      domain: this.cookieDomain,
      maxAgeMs: remainingMs,
      loggedInCookieName: this.loggedInSentinel(payload.sub),
    })

    return {
      user: { id: payload.sub, email: payload.email ?? '' },
      impersonation: {
        target_user_id: payload.sub,
        target_email: payload.email ?? '',
        impersonator: payload.act ?? '',
        expires_at: payload.exp,
      },
    }
  }

  @Post('stop')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async stop(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ stopped: true }> {
    const principal = req.user as Partial<ImpersonationPrincipal> | undefined
    if (!principal?.impersonation) {
      throw new BadRequestException('Aucune session d’incarnation active.')
    }
    await this.impersonation.stop({
      jti: principal.jti ?? '',
      targetUserId: principal.userId ?? '',
      impersonatorActor: principal.impersonatorId ?? '',
      ip: clientIp(req),
      correlationId: correlationStorage.getStore()?.correlationId ?? null,
    })
    clearImpersonationCookies(res, {
      secure: this.cookieSecure,
      domain: this.cookieDomain,
      loggedInCookieName: this.loggedInSentinel(principal.userId ?? ''),
    })
    return { stopped: true }
  }

  /**
   * Ce que le CLIENT a le droit de savoir : quelqu'un de chez nous est-il chez
   * lui, en ce moment ? (#1670.2, posé comme non négociable par l'issue.)
   *
   * ⚠️ Une session d'INCARNATION qui appelle cette route reçoit toujours
   * `active: false`. L'opérateur a déjà SON bandeau (« Tu incarnes… ») ; lui en
   * afficher un second, rédigé pour le client, ferait croire qu'une DEUXIÈME
   * personne est là. La distinction est faite ici, côté serveur, et pas
   * seulement à l'écran : une règle tenue au seul endroit qui l'affiche se perd
   * au premier écran suivant.
   */
  @Get('visibility')
  @UseGuards(JwtGuard)
  async visibility(@Req() req: Request): Promise<ImpersonationVisibility> {
    const principal = req.user as Partial<ImpersonationPrincipal> | undefined
    if (principal?.impersonation) return { active: false, since: null, until: null }
    const userId = principal?.userId
    if (!userId) return { active: false, since: null, until: null }
    return this.visibilityService.forUser(userId)
  }

  @Get('context')
  @UseGuards(JwtGuard)
  context(@Req() req: Request): ImpersonationContext {
    const principal = req.user as Partial<ImpersonationPrincipal> | undefined
    if (!principal?.impersonation) {
      return { impersonating: false }
    }
    return {
      impersonating: true,
      target_user_id: principal.userId ?? '',
      target_email: principal.email ?? '',
      impersonator: principal.impersonatorId ?? '',
    }
  }
}
