/**
 * #2452.2 / #2452.4 / #2452.5 — L'APPELANT du devis d'approfondissement.
 *
 * `POST /analysis/deepen/quote` résout les comptes que l'appelant VOIT (espace
 * actif + périmètre d'unité, sinon propriétaire), son solde, et les passe au
 * service. Un identifiant écrit par le modèle dans une réponse de /chat n'est
 * qu'une candidature : un compte hors périmètre n'arrive jamais au devis.
 */
import { ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { failure, success } from '@bellum/utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { CreditsService } from '../credits/credits.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountVocabularyService } from './account-vocabulary.service'
import { AnalysisDeepenService } from './analysis-deepen.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AnalysisRefreshService } from './analysis-refresh.service'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'
import { OrgEnrichmentPlannerService } from './org-enrichment-planner.service'
import { OrgFocusWeightsService } from './org-focus-weights.service'
import { OrgFreshnessService } from './org-freshness.service'
import { ReplanService } from './replan.service'

const USER = { userId: 'u-1' } as CurrentUserPayload
const MINE = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '99999999-9999-4999-8999-999999999999'
const SCOPE = { workspaceId: 'ws-1', businessUnitScope: null }

async function buildController(opts: { withDeepen?: boolean } = {}) {
  const accountsService = {
    findOneForWorkspace: jest.fn(async (id: string) =>
      id === MINE ? success({ id: MINE, company_name: 'Acme' }) : failure({ code: 'not_found', message: 'x' }),
    ),
    findOne: jest.fn(async () => failure({ code: 'not_found', message: 'x' })),
  }
  const deepen = { quote: jest.fn(async () => ({ lines: [], delta: 0 })) }
  const credits = { getCredits: jest.fn(async () => ({ credits_remaining: 7 })) }
  const providers = [
    { provide: AnalysisService, useValue: {} },
    { provide: AnalysisOnDemandService, useValue: {} },
    { provide: AnalysisRefreshService, useValue: {} },
    { provide: AccountsService, useValue: accountsService },
    { provide: AccountVocabularyService, useValue: {} },
    {
      provide: WorkspaceContextService,
      useValue: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) },
    },
    { provide: ReplanService, useValue: {} },
    { provide: OrgEnrichmentPlannerService, useValue: {} },
    { provide: OrgEnrichmentJobService, useValue: {} },
    { provide: OrgFreshnessService, useValue: {} },
    { provide: OrgFocusWeightsService, useValue: {} },
    { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
    ...(opts.withDeepen === false
      ? []
      : [
          { provide: AnalysisDeepenService, useValue: deepen },
          { provide: CreditsService, useValue: credits },
        ]),
  ]
  const moduleRef = await Test.createTestingModule({ controllers: [AnalysisController], providers }).compile()
  return { controller: moduleRef.get(AnalysisController), deepen, accountsService }
}

describe('POST /analysis/deepen/quote (#2452)', () => {
  it('ne passe au devis QUE les comptes visibles de l’appelant, avec son périmètre et son solde', async () => {
    const { controller, deepen } = await buildController()
    const targets = [
      { accountId: MINE, dimension: 'signals' as const },
      { accountId: FOREIGN, dimension: 'signals' as const },
    ]
    await controller.deepenQuote({ targets }, USER)
    expect(deepen.quote).toHaveBeenCalledWith({
      scope: SCOPE,
      targets,
      accounts: [expect.objectContaining({ id: MINE })],
      remaining: 7,
    })
  })

  it('sans le service de devis, la route le DIT (503) — jamais un devis vide qui ressemblerait à « rien à payer »', async () => {
    const { controller } = await buildController({ withDeepen: false })
    await expect(
      controller.deepenQuote({ targets: [{ accountId: MINE, dimension: 'signals' }] }, USER),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
