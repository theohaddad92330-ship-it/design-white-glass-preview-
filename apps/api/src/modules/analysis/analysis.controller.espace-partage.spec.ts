/**
 * #2704 — L'APPELANT.
 *
 * Le service sait lire un compte à l'échelle de l'espace ; encore faut-il que
 * quelqu'un lui passe le périmètre. Ce fichier tient ce fil-là : les trois
 * routes qui portent une analyse en vol (statut, reprise, annulation) résolvent
 * l'espace ACTIF et le périmètre d'unité de l'appelant, et les transmettent.
 *
 * Sans lui, le correctif est inerte : un paramètre optionnel jamais passé rend
 * exactement le 404 d'hier, sans qu'aucun test ne rougisse.
 */
import { Test } from '@nestjs/testing'
import { success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountVocabularyService } from './account-vocabulary.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AnalysisRefreshService } from './analysis-refresh.service'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'
import { OrgEnrichmentPlannerService } from './org-enrichment-planner.service'
import { OrgFocusWeightsService } from './org-focus-weights.service'
import { OrgFreshnessService } from './org-freshness.service'
import { ReplanService } from './replan.service'

const ADEL = { userId: 'u-adel' } as CurrentUserPayload
const PERIMETRE = {
  workspaceId: 'ws-apricot',
  businessUnitScope: { businessUnitIds: ['bu-1'], includeUnassigned: true },
}

async function buildController() {
  const analysisService = {
    getStatus: jest.fn().mockResolvedValue(success({ jobId: 'j', state: 'active' })),
    resume: jest.fn().mockResolvedValue(success({ jobId: 'j', accountId: 'acc-1', launched: true })),
    cancelByUser: jest.fn().mockResolvedValue(success({ accountId: 'acc-1' })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: PERIMETRE.workspaceId }),
  }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(PERIMETRE.businessUnitScope) }

  const moduleRef = await Test.createTestingModule({
    controllers: [AnalysisController],
    providers: [
      { provide: AnalysisService, useValue: analysisService },
      { provide: AnalysisOnDemandService, useValue: {} },
      { provide: AnalysisRefreshService, useValue: {} },
      { provide: AccountsService, useValue: {} },
      { provide: AccountVocabularyService, useValue: {} },
      { provide: WorkspaceContextService, useValue: workspaceContext },
      { provide: ReplanService, useValue: {} },
      { provide: OrgEnrichmentPlannerService, useValue: {} },
      { provide: OrgEnrichmentJobService, useValue: {} },
      { provide: OrgFreshnessService, useValue: {} },
      { provide: OrgFocusWeightsService, useValue: {} },
      { provide: BusinessUnitService, useValue: businessUnits },
    ],
  }).compile()

  return { controller: moduleRef.get(AnalysisController), analysisService, workspaceContext, businessUnits }
}

describe('#2704 — les routes d’analyse portent le périmètre de l’appelant', () => {
  it('GET status transmet espace actif + périmètre d’unité', async () => {
    const { controller, analysisService, businessUnits } = await buildController()

    await controller.status('acc-1', ADEL)

    expect(analysisService.getStatus).toHaveBeenCalledWith('acc-1', 'u-adel', PERIMETRE)
    // Le périmètre d'unité est RÉSOLU, jamais supposé vide.
    expect(businessUnits.scopeFor).toHaveBeenCalledWith(PERIMETRE.workspaceId, 'u-adel')
  })

  it('POST resume transmet le même périmètre', async () => {
    const { controller, analysisService } = await buildController()

    await controller.resume('acc-1', ADEL)

    expect(analysisService.resume).toHaveBeenCalledWith('acc-1', 'u-adel', PERIMETRE)
  })

  it('POST cancel transmet le même périmètre', async () => {
    const { controller, analysisService } = await buildController()

    await controller.cancel('acc-1', ADEL)

    expect(analysisService.cancelByUser).toHaveBeenCalledWith('acc-1', 'u-adel', PERIMETRE)
  })
})
