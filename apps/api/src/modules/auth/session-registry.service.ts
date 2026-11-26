import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MAX_ACTIVE_DEVICES, type ActiveSession } from '@bellum/contracts'
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'

/** Two distinct IPs seen within this window count as concurrent use (sharing). */
const CONCURRENT_WINDOW_MS = 15 * 60 * 1000
/** At most one sharing nudge per user per this window. */
const SHARING_SIGNAL_COOLDOWN_MS = 24 * 60 * 60 * 1000

/**
 * Registry powering the concurrent-device cap. Every sign-in / non-revoked
 * refresh records the device (the `bellum_did` cookie) and evicts the
 * least-recently-used devices beyond {@link MAX_ACTIVE_DEVICES}; an evicted
 * device is rejected on its next refresh, so a shared password can only keep
 * {@link MAX_ACTIVE_DEVICES} sessions alive at once (five since R15-7, 15/09/2026 —
 * the cap lives in `@bellum/contracts`). Concurrent use from distinct IPs raises an in-app
 * "add a seat" nudge (the manager/owner is the account holder here).
 */
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name)

  constructor(
    @InjectRepository(UserSessionEntity)
    private readonly sessions: Repository<UserSessionEntity>,
    // Direct repo (not NotificationsService) to avoid an Auth↔Notifications module cycle.
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    // Direct repo (not WorkspaceContextService) for the same reason: the cap
    // needs one boolean about the account, not the workspace module.
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
  ) {}

  async registerAndEnforce(
    userId: string,
    deviceId: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const now = new Date()
    await this.sessions.upsert(
      { user_id: userId, device_id: deviceId, ip, user_agent: userAgent, last_seen_at: now, revoked_at: null },
      { conflictPaths: ['user_id', 'device_id'], skipUpdateIfNoValuesChanged: false },
    )

    // A DEMO account is shared BY DESIGN: one link, many prospects at once. The
    // cap exists to stop colleagues sharing a paid password — applied here it
    // would revoke prospect #1 the second prospect #3 opens the link (they get
    // "Session révoquée sur cet appareil" on their next refresh), and the
    // sharing nudge would fire on every visit. The device is still REGISTERED
    // above, so the sessions list stays truthful; only eviction and the nudge
    // are skipped.
    if (await this.isSharedDemoAccount(userId)) return

    const active = await this.sessions.find({
      where: { user_id: userId, revoked_at: IsNull() },
      order: { last_seen_at: 'DESC' },
    })
    const excess = active.slice(MAX_ACTIVE_DEVICES)
    if (excess.length > 0) {
      await this.sessions.update({ id: In(excess.map(s => s.id)) }, { revoked_at: now })
      this.logger.log(`Evicted ${excess.length} device(s) over the cap for user ${userId}`)
    }
    await this.maybeSignalSharing(userId, active.slice(0, MAX_ACTIVE_DEVICES), now)
  }

  /** True when the user owns a demo workspace (`is_demo`) — the shared demo
   *  link. Fails CLOSED for the exemption (a repo error means "not demo", so a
   *  real account can never lose its cap because of a DB hiccup). */
  private async isSharedDemoAccount(userId: string): Promise<boolean> {
    try {
      return (await this.workspaces.count({ where: { owner_user_id: userId, is_demo: true } })) > 0
    } catch {
      return false
    }
  }

  /** True when the device has a row AND it is revoked. A missing row (a
   *  session predating this feature) is NOT revoked by itself, so shipping never
   *  mass-logs-out existing users.
   *
   *  Audit H2 : sans ligne d'appareil exploitable (cookie `bellum_did` absent, ou
   *  UUID neuf choisi par l'appelant), la révocation se rattache au JETON : si une
   *  session du compte a été révoquée depuis l'émission du jeton (`issuedAt`),
   *  il est refusé. Un client légitime sans cookie (mobile, MCP) repart avec un
   *  jeton neuf (iat postérieur à la révocation). Sans `issuedAt`, pas de contrôle. */
  async isRevoked(userId: string, deviceId: string | null, issuedAt?: Date): Promise<boolean> {
    if (deviceId) {
      const row = await this.sessions.findOne({ where: { user_id: userId, device_id: deviceId } })
      if (row) return Boolean(row.revoked_at)
    }
    if (!issuedAt) return false
    return (await this.sessions.count({ where: { user_id: userId, revoked_at: MoreThanOrEqual(issuedAt) } })) > 0
  }

  async list(userId: string, currentDeviceId: string | null): Promise<ActiveSession[]> {
    const rows = await this.sessions.find({
      where: { user_id: userId, revoked_at: IsNull() },
      order: { last_seen_at: 'DESC' },
    })
    return rows.map(r => ({
      id: r.id,
      ip: r.ip,
      user_agent: r.user_agent,
      last_seen_at: r.last_seen_at.toISOString(),
      created_at: r.created_at.toISOString(),
      current: currentDeviceId !== null && r.device_id === currentDeviceId,
    }))
  }

  /** Revoke one session the caller owns (manual sign-out of another device). */
  async revoke(userId: string, sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId, user_id: userId }, { revoked_at: new Date() })
  }

  /**
   * Révoque la session de l'appareil COURANT (finding #6). Appelée au logout :
   * sans elle, la ligne d'appareil restait active et la vérification de
   * révocation par requête (JwtStrategy) laissait un jeton d'accès volé valide
   * jusqu'à son `exp` malgré la déconnexion. Idempotente : rien à révoquer =
   * no-op silencieux.
   */
  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    await this.sessions.update({ user_id: userId, device_id: deviceId }, { revoked_at: new Date() })
  }

  private async maybeSignalSharing(userId: string, active: UserSessionEntity[], now: Date): Promise<void> {
    const recent = active.filter(
      s => s.ip && now.getTime() - new Date(s.last_seen_at).getTime() <= CONCURRENT_WINDOW_MS,
    )
    const distinctIps = new Set(recent.map(s => s.ip))
    if (distinctIps.size < 2) return
    try {
      const since = new Date(now.getTime() - SHARING_SIGNAL_COOLDOWN_MS)
      const recentlyNotified = await this.notifications.count({
        where: { user_id: userId, type: 'system', created_at: MoreThanOrEqual(since) },
      })
      if (recentlyNotified > 0) return
      await this.notifications.save(
        this.notifications.create({
          user_id: userId,
          type: 'system',
          title: 'Connexions simultanées détectées',
          body:
            'Votre compte est utilisé depuis plusieurs appareils et lieux en même temps. ' +
            'Si votre équipe partage cet accès, ajoutez un siège pour rester en règle.',
          link: '/settings/team',
          read_at: null,
        }),
      )
    } catch (err) {
      this.logger.warn('sharing signal failed (non-fatal)', { error: err })
    }
  }
}
