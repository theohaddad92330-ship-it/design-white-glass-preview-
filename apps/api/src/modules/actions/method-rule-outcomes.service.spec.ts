import { METHOD_RULE_CONTRADICTION_MIN_OUTCOMES } from '@bellum/contracts'
import { MethodRuleOutcomesService } from './method-rule-outcomes.service'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('MethodRuleOutcomesService — #3289 (#3264.41)', () => {
  let items: MockRepository<ActionPlanItemEntity>
  let service: MethodRuleOutcomesService

  beforeEach(() => {
    items = createMockRepository<ActionPlanItemEntity>()
    service = new MethodRuleOutcomesService(items as never)
  })

  it('lit les actions FAITES de CET espace posées sous une règle, par le compte', async () => {
    items._qb.getRawMany.mockResolvedValueOnce([])
    await service.contradictedRuleIds('ws-1')
    expect(items._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
    expect(items._qb.where).toHaveBeenCalledWith("item.execution_status = 'done'")
    expect(items._qb.andWhere).toHaveBeenCalledWith('item.method_rule IS NOT NULL')
  })

  it('rend la règle suivie sans aucun résultat positif', async () => {
    items._qb.getRawMany.mockResolvedValueOnce(
      Array.from({ length: METHOD_RULE_CONTRADICTION_MIN_OUTCOMES }, () => ({
        method_rule: 'couverture_multi_roles_niveaux_entites',
        outcome: 'no_response',
      })),
    )
    await expect(service.contradictedRuleIds('ws-1')).resolves.toEqual(['couverture_multi_roles_niveaux_entites'])
  })

  it('une règle déjà désactivée globalement n’est pas rendue : elle n’a rien à écarter pour l’espace', async () => {
    items._qb.getRawMany.mockResolvedValueOnce(
      Array.from({ length: METHOD_RULE_CONTRADICTION_MIN_OUTCOMES }, () => ({
        method_rule: 'regle_inventee',
        outcome: 'no_response',
      })),
    )
    await expect(service.contradictedRuleIds('ws-1')).resolves.toEqual([])
  })

  it('une lecture impossible rend null — jamais « aucune règle contredite »', async () => {
    items._qb.getRawMany.mockRejectedValueOnce(new Error('db down'))
    await expect(service.contradictedRuleIds('ws-1')).resolves.toBeNull()
  })
})
