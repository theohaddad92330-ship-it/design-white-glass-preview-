import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { BusinessMetricsService } from './business-metrics.service'
import { SINGLETON_LOCK, type UnderSingletonLock } from './module-tokens'

/**
 * LE PASSAGE QUI FIGE LE MOIS ÉCOULÉ (#1645).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE, ALORS QUE LE BACK-OFFICE A UN BOUTON
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans lui, la table d'instantanés serait « du code juste que personne
 * n'appelle » : elle ne se remplirait que les jours où quelqu'un pense à
 * cliquer, et la série aurait des trous là où personne n'a ouvert la console.
 * Or un trou dans cette série-là ne se rattrape pas — la position d'octobre
 * n'existe plus en novembre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE 1er, ET POURQUOI LE MOIS PRÉCÉDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un instantané pris le 15 photographie un demi-mois, et il se présenterait
 * comme le mois entier. Le passage du 1er fige donc le mois qui VIENT DE FINIR :
 * à cet instant, et à cet instant seulement, sa position est complète.
 *
 * ⚠️ Il ne recalcule jamais un mois déjà figé — `takeSnapshot` rend
 * `frozen: false` et n'écrit rien. Rejouer le passage deux fois n'est pas un
 * incident, c'est le cas normal d'un redémarrage.
 *
 * Interrupteur d'urgence : `BUSINESS_METRICS_SNAPSHOT_DISABLED=true`.
 */
@Injectable()
export class BusinessMetricsSnapshotService {
  private readonly logger = new Logger(BusinessMetricsSnapshotService.name)

  constructor(
    private readonly metrics: BusinessMetricsService,
    // ⚠️ Un JETON, pas le service de verrous : GA-07 est au plafond et ce
    // passage n'a pas besoin du service, il a besoin de « une seule fois ».
    // Voir `module-tokens.ts`. Facultatif, pour que le service se construise nu
    // dans un test.
    @Inject(SINGLETON_LOCK) private readonly underLock: UnderSingletonLock = (_name, run) => run(),
  ) {}

  /** 03:20 Europe/Paris le 1er — après minuit pour que le mois soit clos, avant
   *  que quiconque n'ouvre la console. */
  @Cron('20 3 1 * *', { name: 'business-metrics-snapshot', timeZone: 'Europe/Paris' })
  @Correlated('cron:business_metrics.snapshot')
  async runMonthlySnapshot(): Promise<void> {
    await this.underLock('business-metrics-snapshot', async () => {
      await this.freezeLastMonth(new Date())
    })
  }

  /** L'horloge est un PARAMÈTRE : un test qui lit `new Date()` passe en janvier
   *  et échoue en février. */
  async freezeLastMonth(now: Date): Promise<{ month: string; frozen: boolean } | null> {
    if (killSwitchCut('billing.metrics_snapshot')) {
      this.logger.log('Instantané mensuel des chiffres désactivé (interrupteur posé)')
      return null
    }

    const month = this.metrics.monthToFreeze(now)
    const result = await this.metrics.takeSnapshot(month)
    this.logger.log(result.frozen ? `Instantané ${month} figé` : `Instantané ${month} déjà figé — rien réécrit`)
    return { month, frozen: result.frozen }
  }
}
