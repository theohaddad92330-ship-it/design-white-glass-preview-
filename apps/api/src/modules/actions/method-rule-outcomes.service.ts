import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { workspaceDeactivatedRuleIds } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'

/**
 * #3289 (suivi #3264.41) — les règles du corpus méthode que CET espace a
 * CONTREDITES par ses propres résultats.
 *
 * La donnée : `action_plan_items.method_rule` (posée par l'écrivain qui applique
 * la règle, #3287.2) × `outcome` (déclaré à la complétion). Le calcul est pur
 * (`workspaceDeactivatedRuleIds` → `resolveRuleActivation`, `@bellum/contracts`) ; ce service ne fait que
 * LIRE, bornée à l'espace par le compte. Relayé à `apps/ia` par le pont Laura
 * (`POST /internal/copilot/method/contradicted-rules`).
 */
@Injectable()
export class MethodRuleOutcomesService {
  private readonly logger = new Logger(MethodRuleOutcomesService.name)

  constructor(
    @InjectRepository(ActionPlanItemEntity)
    private readonly items: Repository<ActionPlanItemEntity>,
  ) {}

  /** `null` = lecture impossible : un échec n'est jamais rendu comme « rien de contredit ». */
  async contradictedRuleIds(workspaceId: string): Promise<string[] | null> {
    try {
      const rows = await this.items
        .createQueryBuilder('item')
        .innerJoin('accounts', 'account', 'account.id = item.account_id')
        .select(['item.method_rule AS method_rule', 'item.outcome AS outcome'])
        .where("item.execution_status = 'done'")
        .andWhere('item.method_rule IS NOT NULL')
        .andWhere('account.workspace_id = :workspaceId', { workspaceId })
        .getRawMany<{ method_rule: string | null; outcome: string | null }>()
      return workspaceDeactivatedRuleIds(rows)
    } catch (err) {
      this.logger.warn('method rule outcomes failed', { error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }
}
