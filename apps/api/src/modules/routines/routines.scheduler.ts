import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { EgressIpProbe } from './egress-ip-probe'
import { RoutinesService } from './routines.service'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * Le balayeur des routines.
 *
 * Un seul cron, toutes les quinze minutes, plutôt qu'un cron par routine.
 * Raison : les horaires appartiennent aux UTILISATEURS, pas au serveur. Un cron
 * « 08:30 Europe/Paris » ne saurait pas servir quelqu'un qui a réglé son brief
 * à 7 h, et ajouter un cron par heure possible produirait vingt-quatre tâches
 * qui font toutes la même chose.
 *
 * Le balayage est donc bête : il demande à chaque utilisateur abonné « as-tu
 * quelque chose de dû à cette minute ? » et laisse le service trancher. Toute
 * l'intelligence — heure locale, cadence, idempotence — est dans du code pur et
 * testé (`routine-schedule.ts`), pas dans une expression cron.
 *
 * Kill-switch : `ROUTINES_DISABLED=true`. Il existe pour la même raison que
 * celui de la purge RGPD — pouvoir geler des envois pendant une investigation
 * sans redéployer.
 */
@Injectable()
export class RoutinesScheduler {
  private readonly logger = new Logger(RoutinesScheduler.name)

  constructor(
    private readonly routines: RoutinesService,
    @Optional() private readonly locks?: SingletonLockService,
    // #4694 — la sonde d'IP sortante : un rendez-vous horaire de plus sur l'ordonnanceur existant, pas un ordonnanceur neuf.
    @Optional() private readonly egressProbe?: EgressIpProbe,
  ) {}

  private get disabled(): boolean {
    return killSwitchCut('routines.sweep')
  }

  @Cron('*/15 * * * *', { name: 'routines-sweep' })
  @Correlated('cron:routines.sweep')
  async sweep(): Promise<void> {
    if (this.disabled) return
    // Verrou singleton : à N replicas, exactement un processus balaye. La clé
    // d'idempotence par occurrence protège quand même en cas de course, mais
    // autant ne pas faire le travail trois fois.
    await withSingletonLock(this.locks, 'routines-sweep', async () => {
      const userIds = await this.routines.subscribedUserIds()
      if (!userIds.length) return

      let executed = 0
      for (const userId of userIds) {
        try {
          executed += await this.routines.runDueFor(userId)
        } catch (error) {
          // L'échec d'un utilisateur ne doit pas priver les autres de leur brief.
          this.logger.warn('Routine sweep failed for user (non-fatal)', {
            user: { id: userId },
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (executed) this.logger.log(`Routines sweep: ${executed} occurrence(s) exécutée(s)`)
    })
  }

  /**
   * #4694 — une fois par HEURE : une adresse sortante ne change pas à la minute. Sans `BOONDMANAGER_DECLARED_EGRESS_IPS` la
   * sonde est un no-op strict (aucun appel réseau). Un échec de lecture est `unknown`, jamais une alerte ; et rien ici ne
   * doit pouvoir faire tomber le balayage des routines, qui est un autre @Cron.
   */
  @Cron('0 * * * *', { name: 'egress-ip-probe' })
  @Correlated('cron:egress.ip_probe')
  async probeEgressIp(): Promise<void> {
    if (!this.egressProbe) return
    await withSingletonLock(this.locks, 'egress-ip-probe', async () => {
      try {
        await this.egressProbe?.run()
      } catch (error) {
        this.logger.warn('Egress IP probe failed (non-fatal)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }
}
