import { createHash, timingSafeEqual } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { SessionResponse } from '@bellum/contracts'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import { InFlight } from '../../common/short-ttl-cache'
import { SessionService } from '../auth/session.service'
import { DemoPoolService, isDemoPreparing } from './demo-pool.service'
import type { DemoRoomVariant } from './demo-room-variant'

export type DemoLinkFailure = {
  code: 'demo_disabled' | 'invalid_token' | 'no_demo_workspace' | 'session_failed' | 'no_lease' | 'demo_preparing'
  message: string
  /** `demo_preparing` seulement : quand redemander. */
  retryAfterSeconds?: number
}

/** Constant-time secret comparison. Both sides are hashed first so a length
 *  difference can't throw (or leak the expected length through timing). */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Redeems the SHARED demo link — the URL Théo hands to prospects
 * (`<FRONTEND_URL>/demo?t=<DEMO_LINK_TOKEN>`).
 *
 * One redemption = one clean demo ROOM: the visitor is leased their own demo
 * workspace (see {@link DemoPoolService}), purged and re-seeded while it was
 * free, BEFORE the browser is signed in. Several prospects can therefore be in
 * the demo at the same time without seeing each other's dossiers, copilot
 * threads or notifications — and without anyone's space being wiped mid-call.
 *
 * Env-gated: with no `DEMO_LINK_TOKEN` set, this is a strict no-op. That matters
 * more here than for other optional features — the endpoint mints a session
 * without a password, so an unconfigured deployment must refuse outright rather
 * than fall back to anything.
 */
@Injectable()
export class DemoLinkService {
  private readonly logger = new Logger(DemoLinkService.name)
  /**
   * R35 (16/10/2026) — UN seul lien magique consommé par navigateur à la fois. Le lien que GoTrue génère pour
   * ouvrir la session est À USAGE UNIQUE : trois appels simultanés du même navigateur (un renouvellement par
   * écran qui reçoit un 401, ou un visiteur qui insiste) le consommaient trois fois, et deux sur trois tombaient
   * sur « Email link is invalid or has expired » — le 500 « Impossible de renouveler la session de démo » de
   * 13:25:05. Les appels concurrents attendent donc le résultat du premier. Rien n'est retenu une fois fini.
   */
  private readonly inFlight = new InFlight<Result<SessionResponse, DemoLinkFailure>>()

  constructor(
    private readonly config: ConfigService,
    private readonly pool: DemoPoolService,
    private readonly session: SessionService,
  ) {}

  /** Lien ouvert : `<FRONTEND_URL>/demo` suffit, sans clé dans l'URL. */
  private isPublic(): boolean {
    return this.config.get<string>('demoPublic') === 'true'
  }

  isEnabled(): boolean {
    return this.isPublic() || Boolean(this.config.get<string>('demoLinkToken'))
  }

  /**
   * @param deviceId cookie `bellum_did` du navigateur. C'est ce qui fait qu'un
   * rechargement de la page de démo retrouve LA MÊME salle, intacte, au lieu
   * d'en consommer (et d'en effacer) une seconde.
   */
  async redeem(
    token?: string,
    deviceId?: string | null,
    variant: DemoRoomVariant = 'staffing',
  ): Promise<Result<SessionResponse, DemoLinkFailure>> {
    if (!deviceId) return this.redeemOnce(token, deviceId, variant)
    return this.inFlight.run(`redeem:${deviceId}:${variant}`, () => this.redeemOnce(token, deviceId, variant))
  }

  private async redeemOnce(
    token: string | undefined,
    deviceId: string | null | undefined,
    variant: DemoRoomVariant,
  ): Promise<Result<SessionResponse, DemoLinkFailure>> {
    const expected = this.config.get<string>('demoLinkToken')
    const isPublic = this.isPublic()

    if (!isPublic && !expected) {
      return failure({ code: 'demo_disabled', message: 'Le mode démo n’est pas configuré sur cet environnement.' })
    }
    // Lien ouvert : personne n'a de clé à porter, donc on n'en demande pas.
    // Ce qui rend ça tenable n'est pas le secret mais ce qu'il y a AU BOUT :
    // des dossiers fictifs, aucun appel IA, aucun crédit, aucun fournisseur
    // contacté — et l'espace est remis à neuf entre les visiteurs.
    if (!isPublic && (!token || !secretsMatch(token, expected!))) {
      // Deliberately vague: the caller learns nothing beyond "not this link".
      return failure({ code: 'invalid_token', message: 'Lien de démo invalide ou expiré.' })
    }

    // Une SALLE par visiteur : le pool en loue une libre (et la remet à neuf
    // pendant qu'elle l'est), ou rend au navigateur celle qu'il occupe déjà.
    // #4291 J — la variante (staffing ou forfait / conseil) choisit parmi les salles du MÊME pool.
    const slot = await this.pool.acquire(deviceId ?? null, variant)
    // #3578 — aucune salle à jour n'est prête (re-semis d'arrière-plan en cours après un
    // déploiement) : un état NOMMÉ que l'écran dit honnêtement et reprend seul, jamais une panne.
    if (slot && isDemoPreparing(slot)) {
      return failure({
        code: 'demo_preparing',
        message: 'La démo se prépare, environ une minute.',
        retryAfterSeconds: slot.retryAfterSeconds,
      })
    }
    if (!slot) {
      return failure({
        code: 'no_demo_workspace',
        message: 'Aucun espace de démo n’a encore été créé sur cet environnement.',
      })
    }

    const minted = await this.session.mintSessionForUserId(slot.ownerUserId)
    if (isFailure(minted)) {
      this.logger.error('Demo link: session minting failed', { error: minted.problem })
      return failure({ code: 'session_failed', message: 'Impossible d’ouvrir la session de démo.' })
    }

    this.logger.log(
      `Demo link redeemed: room=${slot.slotIndex} workspace=${slot.workspaceId} reused=${slot.reused} provisioned=${slot.provisioned}`,
    )
    return success(minted.output)
  }

  /**
   * #3511 — renouvellement SILENCIEUX de la session d'une salle déjà occupée.
   * La session de démo ne doit jamais mettre dehors quelqu'un qui navigue : le
   * navigateur qui tient la salle (cookie `bellum_did`) reçoit une session
   * neuve ET son bail est re-daté, sans purge ni nouvelle salle. Un navigateur
   * qui n'en tient plus (la salle est partie à un autre visiteur) est refusé :
   * une vraie expiration reste une expiration. Ne touche que les salles
   * `is_demo` — aucune règle de session de production n'est concernée.
   */
  async renew(deviceId: string | null): Promise<Result<SessionResponse, DemoLinkFailure>> {
    if (!this.isEnabled()) {
      return failure({ code: 'demo_disabled', message: 'Le mode démo n’est pas configuré sur cet environnement.' })
    }
    if (!deviceId) return this.renewOnce(deviceId)
    return this.inFlight.run(`renew:${deviceId}`, () => this.renewOnce(deviceId))
  }

  private async renewOnce(deviceId: string | null): Promise<Result<SessionResponse, DemoLinkFailure>> {
    const slot = deviceId ? await this.pool.renewLease(deviceId) : null
    if (!slot) {
      return failure({ code: 'no_lease', message: 'Cette salle de démo n’est plus la vôtre.' })
    }
    const minted = await this.session.mintSessionForUserId(slot.ownerUserId)
    if (isFailure(minted)) {
      this.logger.error('Demo link: session renewal failed', { error: minted.problem })
      return failure({ code: 'session_failed', message: 'Impossible de renouveler la session de démo.' })
    }
    return success(minted.output)
  }
}
