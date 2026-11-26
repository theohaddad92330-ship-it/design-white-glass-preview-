import {
  Body,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { isFailure } from '@bellum/utils'
import type { Request, Response } from 'express'
import { KeepOtherSessions } from '../../common/decorator/keep-other-sessions.decorator'
import { AttachRefreshCookieInterceptor } from '../../common/interceptor/refresh-cookie.interceptor'
import { BackofficeAlertDispatchService } from '../backoffice-alerts/backoffice-alert-dispatch.service'
import { clientIp, ensureDeviceId, getDeviceId, userAgent } from '../auth/device-cookie'
import { SessionRegistryService } from '../auth/session-registry.service'
import { DemoLeadDto } from './dto/demo-lead.dto'
import { DemoLeadService } from './demo-lead.service'
import { DemoLinkService, type DemoLinkFailure } from './demo-link.service'
import { DemoSessionDto } from './dto/demo-session.dto'

function throwDemoFailure({ code, message, retryAfterSeconds }: DemoLinkFailure): never {
  switch (code) {
    case 'demo_disabled':
      // The feature does not exist on this deployment — same answer as an
      // unknown route, so probing tells an outsider nothing.
      throw new NotFoundException(message)
    case 'invalid_token':
      throw new UnauthorizedException(message)
    case 'no_demo_workspace':
      // The link is valid but the operator has not provisioned the space yet.
      throw new ServiceUnavailableException(message)
    case 'demo_preparing':
      // #3578 — 503 NOMMÉ : le code machine dit « réessaie dans N s », l'écran n'affiche pas d'erreur.
      throw new ServiceUnavailableException({ code, message, retryAfterSeconds: retryAfterSeconds ?? 15 })
    case 'session_failed':
      throw new InternalServerErrorException(message)
    case 'no_lease':
      // Même réponse qu'une session morte : le client revient sur /demo/acces.
      throw new UnauthorizedException(message)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown demo failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Public entry point of the SHARED demo link (mode démo).
 *
 * NO `JwtGuard` — by design: the visitor has no account, the token in the URL
 * IS the credential. Everything that makes that safe lives one layer down
 * ({@link DemoLinkService}): env-gated, constant-time token check, and a
 * session that only ever resolves to the owner of an `is_demo` workspace.
 */
@Controller('demo')
export class DemoController {
  private readonly logger = new Logger(DemoController.name)
  private readonly cookieSecure: boolean
  private readonly cookieDomain: string | undefined

  constructor(
    private readonly demoLink: DemoLinkService,
    config: ConfigService,
    private readonly demoLead: DemoLeadService,
    private readonly alerts: BackofficeAlertDispatchService,
    private readonly registry: SessionRegistryService,
  ) {
    this.cookieSecure = config.get<string>('nodeEnv') === 'production'
    this.cookieDomain = config.get<string>('cookieDomain', '')?.trim() || undefined
  }

  /** Lets the SPA decide whether to show a demo entry point at all. */
  @Get('status')
  status(): { enabled: boolean } {
    return { enabled: this.demoLink.isEnabled() }
  }

  /**
   * Redeems the link: leases the visitor a demo ROOM of their own (purged and
   * re-seeded while it was free), then signs the browser in (cookies are
   * written by the interceptor, tokens never reach JS).
   *
   * The device cookie is minted HERE, before the lease: it is what makes a
   * reload land back in the same room instead of consuming — and wiping — a
   * second one.
   *
   * Throttled tighter than the login route: a redemption that lands on a free
   * room runs ~35 DELETEs plus a full re-seed, so it is the most expensive
   * unauthenticated call in the API.
   */
  @Post('session')
  @HttpCode(200)
  @Throttle({ 'default-1m': { limit: 5, ttl: 60_000 } })
  @UseInterceptors(AttachRefreshCookieInterceptor)
  // #4608 — ouvrir la démo ne purge pas la session réelle du navigateur.
  @KeepOtherSessions()
  async session(@Body() dto: DemoSessionDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // #3511 — renouvellement silencieux : la clé est le cookie d'appareil, qui ne
    // mène qu'à une salle `is_demo` dont il est le locataire. Pas de nouvelle
    // route (gel GA-05), pas de bail neuf, pas de purge.
    if (dto.renew === true) return this.renew(req)
    const deviceId = ensureDeviceId(req, res, { secure: this.cookieSecure, domain: this.cookieDomain })
    // #4291 J — même jeton, même appareil, même bail : seule la variante de salle change.
    const outcome = await this.demoLink.redeem(dto.token, deviceId, dto.profile ?? 'staffing')
    if (isFailure(outcome)) throwDemoFailure(outcome.problem)
    // 30/09 : un navigateur déconnecté de la salle a sa ligne (salle, appareil)
    // RÉVOQUÉE ; la salle lui est rendue (même cookie) et le jeton neuf tombait
    // sur « Session révoquée sur cet appareil » — la démo ne s'ouvrait plus.
    // Une nouvelle session ré-enregistre l'appareil (lève `revoked_at`) ; l'ancien
    // refresh token reste mort. Best-effort, comme `trackDevice` au login.
    try {
      await this.registry.registerAndEnforce(outcome.output.user.id, deviceId, clientIp(req), userAgent(req))
    } catch (err) {
      this.logger.warn('Demo session: device registration failed (non-fatal)', { error: err })
    }
    return outcome.output
  }

  private async renew(req: Request) {
    const deviceId = getDeviceId(req)
    const outcome = await this.demoLink.renew(deviceId)
    if (isFailure(outcome)) throwDemoFailure(outcome.problem)
    try {
      await this.registry.registerAndEnforce(outcome.output.user.id, deviceId!, clientIp(req), userAgent(req))
    } catch (err) {
      this.logger.warn('Demo renew: device registration failed (non-fatal)', { error: err })
    }
    return outcome.output
  }

  /**
   * #2705 — le formulaire obligatoire. Enregistre le prospect (dédupliqué par
   * e-mail, `DemoLeadService`) puis, SEULEMENT à la création (#2707.2, jamais
   * à une mise à jour), prévient l'équipe (#2707) — une alerte interne, pas un
   * envoi vers le prospect : « le copilote n'envoie jamais tout seul » ne
   * concerne que les envois VERS un tiers, celui-ci nous prévient NOUS.
   *
   * ⚠️ Le lead est déjà écrit en base quand on atteint l'alerte : une panne du
   * canal (Resend, Slack, Redis) ne doit JAMAIS faire échouer cette réponse —
   * le prospect a rempli son formulaire, il entre en démo quoi qu'il arrive
   * (#2707.5). `dispatch()` avale déjà ses propres échecs d'envoi ; le
   * try/catch ici couvre en plus une panne de la dé-duplication Redis.
   */
  @Post('lead')
  @HttpCode(200)
  @Throttle({ 'default-1m': { limit: 5, ttl: 60_000 } })
  async createLead(@Body() dto: DemoLeadDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const deviceId = ensureDeviceId(req, res, { secure: this.cookieSecure, domain: this.cookieDomain })
    const outcome = await this.demoLead.registerOrTouch({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      jobTitle: dto.jobTitle,
      company: dto.company,
      phone: dto.phone,
      deviceId,
      utm: {
        source: dto.utmSource ?? null,
        medium: dto.utmMedium ?? null,
        campaign: dto.utmCampaign ?? null,
        term: dto.utmTerm ?? null,
        content: dto.utmContent ?? null,
      },
    })

    if (outcome.created) {
      try {
        await this.alerts.dispatch({
          kind: 'nouveau_prospect_demo',
          subject: outcome.lead.email,
          title: `${outcome.lead.first_name} ${outcome.lead.last_name} — ${outcome.lead.company}`,
          detail: [
            `E-mail : ${outcome.lead.email}`,
            `Fonction : ${outcome.lead.job_title}`,
            `Premier accès : ${outcome.lead.first_access_at.toISOString()}`,
            outcome.lead.utm_source ? `Source UTM : ${outcome.lead.utm_source}` : null,
          ]
            .filter((line): line is string => line !== null)
            .join('\n'),
          resolved: false,
        })
      } catch (error) {
        this.logger.error('Alerte nouveau_prospect_demo en échec — le lead reste enregistré', { error })
      }
    }

    return { firstName: outcome.lead.first_name }
  }

  /**
   * #2705.6 — le visiteur dont le cookie `bellum_did` porte déjà un lead
   * saute le formulaire. `getDeviceId` (lecture seule, pas de mint) : sans
   * cookie, il n'y a rien à chercher — c'est un visiteur qui n'a jamais
   * soumis le formulaire sur ce navigateur.
   */
  @Post('lead/touch')
  @HttpCode(200)
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async touchLead(@Req() req: Request): Promise<{ found: boolean; firstName?: string }> {
    const deviceId = getDeviceId(req)
    if (!deviceId) return { found: false }
    const touched = await this.demoLead.touchByDevice(deviceId)
    if (!touched) return { found: false }
    return { found: true, firstName: touched.firstName }
  }
}
