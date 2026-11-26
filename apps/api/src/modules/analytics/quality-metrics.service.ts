import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { computeQualityIndicators, type ActionRecord, type QualityIndicator } from './quality-metrics'

/**
 * Les neuf indicateurs du §12, pour le back-office.
 *
 * Arbitrage Louis du 03/08 : back-office uniquement. La qualité mesurée est une
 * donnée d'exploitation — affichée à un utilisateur elle devient une promesse
 * chiffrée qu'il faut tenir, affichée à l'opérateur elle devient un outil pour
 * la tenir.
 *
 * Les traces existantes ne portent pas toutes un `outcome` : `user_actions`
 * précède cette mesure. C'est justement pourquoi les indicateurs comptent leur
 * ÉCHANTILLON — un taux sur douze actions n'est pas un taux, et l'écran doit
 * pouvoir le dire plutôt que d'afficher un chiffre rond sur rien.
 */

const DEFAULT_DAYS = 30

@Injectable()
export class QualityMetricsService {
  private readonly logger = new Logger(QualityMetricsService.name)

  constructor(
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(RoutineSubscriptionEntity)
    private readonly routines: Repository<RoutineSubscriptionEntity>,
  ) {}

  async overview(days = DEFAULT_DAYS): Promise<{ days: number; indicators: QualityIndicator[] }> {
    const window = Math.min(Math.max(Number.isFinite(days) ? days : DEFAULT_DAYS, 1), 365)
    const since = new Date(Date.now() - window * 86_400_000)

    const rows = await this.actions.find({ where: { created_at: MoreThan(since) }, take: 20_000 })
    const records: ActionRecord[] = rows.map(row => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      const outcome = metadata['outcome']
      const duration = Number(metadata['durationMs'])
      return {
        actionType: row.action_type,
        // Une trace ancienne ne dit pas comment ça s'est terminé. `null` la sort
        // du dénominateur : la compter comme un succès gonflerait le taux, la
        // compter comme un échec l'effondrerait. Ni l'un ni l'autre n'est vrai.
        outcome: outcome === 'success' || outcome === 'failed' || outcome === 'partial' ? outcome : null,
        durationMs: Number.isFinite(duration) ? duration : null,
        errorExplained: typeof metadata['errorExplained'] === 'boolean' ? Boolean(metadata['errorExplained']) : null,
        userId: row.user_id,
      }
    })

    const routinesByUser = new Map<string, number>()
    try {
      const subscriptions = await this.routines.find({ where: { enabled: true } })
      for (const subscription of subscriptions) {
        routinesByUser.set(subscription.user_id, (routinesByUser.get(subscription.user_id) ?? 0) + 1)
      }
    } catch (error) {
      // Sans abonnements lisibles, l'adoption reste non mesurée — pas à zéro.
      this.logger.warn('Abonnements aux routines illisibles — adoption non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return { days: window, indicators: computeQualityIndicators({ actions: records, routinesByUser }) }
  }
}
