import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingletonLockService } from '../locks/singleton-lock.service'
import { DependencyProbeService } from './dependency-probe.service'
import { StatusService, type StatusReport } from './status.service'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Lock TTL for the 5-min schedule. It must sit BELOW the schedule (the helper's
 * 10-min default would make every other tick find the previous lock alive and
 * skip), while still absorbing replica clock skew on the same tick.
 */
const LOCK_TTL_SECONDS = 4 * 60

/**
 * Internal alerting for the system status — know before the customer does,
 * without any external monitoring account.
 *
 * Every 5 minutes (one replica per tick, via the #497 singleton lock) the
 * monitor re-reads {@link StatusService}. On a NEW failure (transition, or a
 * different set of down components) it emits ONE structured `logger.error` —
 * per the repo convention that is the Sentry capture path, and Sentry already
 * emails on new errors. While the same failure persists it logs `warn` only
 * (a trace per tick, no alert spam); recovery is logged at `log` level and
 * re-arms the alert.
 *
 * Deliberately NOT included:
 * - In-app notifications: the backoffice (`dashboard-manager`) is an operator
 *   panel behind a shared secret with no in-app user identity to notify.
 * - External pingers: a dead API cannot self-report, so an external uptime
 *   monitor (UptimeRobot or similar, polling `GET /status`) remains the
 *   recommended complement — documented, not wired here (no account to create).
 *
 * The dedup memory (`lastAlertSignature`) is per-process: after a deploy or
 * restart an ongoing incident re-alerts once. That is a feature, not a bug —
 * a fresh signal after a restart is exactly what an operator wants.
 */
@Injectable()
export class StatusMonitorService {
  private readonly logger = new Logger(StatusMonitorService.name)

  /** `"<overall>:<down components>"` of the last alert; null = healthy/armed. */
  private lastAlertSignature: string | null = null

  constructor(
    private readonly status: StatusService,
    // `@Optional()` mirrors the other cron hosts: specs construct directly,
    // and without the lock the tick runs unlocked (single-instance behaviour).
    @Optional() private readonly locks?: SingletonLockService,
    /**
     * #1660 — la passe DÉPOSE aussi l'historique des sondes, dont l'écran tire
     * la latence médiane 24 h et la disponibilité 7 jours.
     *
     * ⚠️ Elle est greffée ICI, sur la passe qui existait, et ce n'est pas une
     * économie de lignes : un second `@Cron` aurait eu besoin de son propre
     * verrou d'unicité, donc d'importer `SingletonLockService` dans un fichier
     * NEUF — ce qui fait monter le compteur de FICHIERS de GA-07, au plafond
     * depuis le 02/09. La passe existante prend déjà ce verrou.
     *
     * `@Optional()` pour la même raison que le verrou : les specs à
     * constructeur nu restent valides, et sans le service la passe se contente
     * d'alerter comme avant.
     */
    @Optional() private readonly dependencies?: DependencyProbeService,
  ) {}

  @Cron('*/5 * * * *', { name: 'status-monitor' })
  @Correlated('cron:status.run')
  async run(): Promise<void> {
    if (this.locks) {
      await this.locks.withLock('status-monitor', () => this.tick(), LOCK_TTL_SECONDS)
      return
    }
    await this.tick()
  }

  private async tick(): Promise<void> {
    // ⚠️ AVANT la lecture de l'état, et sans `await` conditionnel plus bas : les
    // trois sorties anticipées de cette méthode (récupération, panne connue,
    // lecture impossible) auraient chacune sauté l'enregistrement, et
    // l'historique se serait creusé exactement pendant les incidents — c'est-à-
    // dire précisément quand on le lit.
    await this.recordDependencies()

    let report: StatusReport
    try {
      report = await this.status.getStatus()
    } catch (error) {
      // The check itself failing must never crash the scheduler.
      this.logger.warn('Status monitor tick failed to read the status', {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    if (report.status === 'operational') {
      if (this.lastAlertSignature !== null) {
        this.logger.log('System status recovered — all components operational')
        this.lastAlertSignature = null
      }
      return
    }

    const downComponents = listDownComponents(report)
    const signature = `${report.status}:${downComponents.join(',')}`
    if (this.lastAlertSignature === signature) {
      this.logger.warn(`System status still ${report.status} (${downComponents.join(', ')})`)
      return
    }

    this.lastAlertSignature = signature
    // ERROR level = Sentry capture via the Winston transport (repo convention:
    // never call Sentry.captureException directly — pass meta through the logger).
    this.logger.error(`System status ${report.status} — down: ${downComponents.join(', ')}`, {
      tags: { feature: 'status-monitor', status: report.status },
      contexts: { status: { components: downComponents, checkedAt: report.checkedAt } },
    })
  }

  /**
   * Dépose l'historique des sondes (#1660). Ne lève jamais.
   *
   * Une télémétrie qui casserait la passe d'alerte serait pire que pas de
   * télémétrie : on perdrait l'alerte ET la mesure. « Une mesure ne casse jamais
   * ce qu'elle observe. »
   */
  private async recordDependencies(): Promise<void> {
    if (!this.dependencies) return
    try {
      await this.dependencies.probeAndRecord()
    } catch (error) {
      this.logger.warn('Dependency probes failed to record', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function listDownComponents(report: StatusReport): string[] {
  return Object.entries(report.components)
    .filter(([, component]) => component.status !== 'operational')
    .map(([name]) => name)
}
