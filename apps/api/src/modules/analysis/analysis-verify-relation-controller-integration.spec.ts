import { BadGatewayException, ConflictException } from '@nestjs/common'
import { success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisController } from './analysis.controller'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { IaClient } from '../ia/ia.client'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * #2130.46 (quinquies) / #2130.50 (sexies) (épopée #3000) — même défaut
 * refermé pour `enrichContacts`/`enrichOrganigram`/`proposeOrgPeopleFromText`/
 * `researchSite`/`generateAngle`, sur la frontière `POST
 * :accountId/verify-relation` (« Vérifier une relation », annexe
 * organigramme p22).
 *
 * Contrairement aux routes précédentes, ce n'était pas seulement un défaut
 * de TEST : `AnalysisOnDemandService.verifyOrgRelation` n'entourait pas
 * `this.ia.verifyRelation(...)` d'un `try/catch`, contrairement à TOUTES les
 * autres méthodes de ce service qui appellent l'IA (`replan`, `enrichContacts`,
 * `runResearch`, …) — une panne du fournisseur de recherche serait remontée
 * comme une exception NON gérée (500 brut) plutôt que la 502 « source en
 * panne » que le reste du dossier rend systématiquement. Corrigé dans le
 * même commit que ce test (TDD : ce test était rouge avant le correctif).
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }

const account = {
  id: 'acc-1',
  user_id: 'u-1',
  company_name: 'TF1',
  raw_analysis: {},
} as unknown as AccountEntity

const edge = { fromId: 'p-marc', toId: 'p-claire', type: 'reports_to' as const }
const target = { company: 'TF1', website: 'https://tf1.fr', fromName: 'Marc Oliveira', toName: 'Claire Basset' }

const esnProfileStub = () =>
  ({
    getAnswers: jest.fn().mockResolvedValue({}),
    resolveProfileData: jest.fn().mockResolvedValue({}),
  }) as unknown as EsnProfileReader

function buildController(opts: { iaThrows?: Error; demoWorkspace?: boolean } = {}) {
  const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
  const orgGraph = {
    relationToVerify: jest.fn().mockResolvedValue(target),
    applyRelationVerification: jest.fn().mockResolvedValue({ graphVersion: 5, verified: true, confidence: 92 }),
  }
  const ia = {
    verifyRelation: opts.iaThrows
      ? jest.fn().mockRejectedValue(opts.iaThrows)
      : jest.fn().mockResolvedValue({
          verified: true,
          confidence: 92,
          sources: [{ id: 's-0', kind: 'official_site', grounding: 'A', date: '2026-07-23' }],
        }),
  }
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demoWorkspace ?? false),
  }

  const onDemand = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    {} as ContactsService, // jamais lu par `verifyOrgRelation`
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService, // jamais lu par `verifyOrgRelation` (écrit via `orgGraph`)
    esnProfileStub(),
    undefined, // accountFeedback
    workspaceContext as unknown as WorkspaceContextService,
    undefined, // crmRead
    undefined, // signalHistory
    orgGraph as never,
  )

  const stub = {} as never
  const controller = new AnalysisController(
    stub, // analysisService — jamais lu par `verifyRelation()`
    onDemand,
    stub, // refreshService
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
  )

  return { controller, ia, orgGraph }
}

describe('AnalysisController.verifyRelation — intégration (#2130.46 quinquies « source en panne », #2130.50 sexies « mode démo »)', () => {
  it('une preuve trouvée : le lien passe vérifié', async () => {
    const { controller, orgGraph } = buildController()

    const result = await controller.verifyRelation('acc-1', edge, USER)

    expect(result).toMatchObject({ found: true, verified: true, confidence: 92, graphVersion: 5 })
    expect(orgGraph.applyRelationVerification).toHaveBeenCalledTimes(1)
  })

  // La PORTE : la recherche de preuve tombe → 502, jamais un 500 brut ni un
  // succès silencieux qui laisserait croire qu'« aucune preuve » a été trouvée.
  it('la source échoue : BadGatewayException (502), le lien n’est pas touché', async () => {
    const { controller, orgGraph } = buildController({ iaThrows: new Error('Pappers indisponible') })

    await expect(controller.verifyRelation('acc-1', edge, USER)).rejects.toBeInstanceOf(BadGatewayException)
    expect(orgGraph.applyRelationVerification).not.toHaveBeenCalled()
  })

  // #2130.50 sexies — un dossier de DÉMO est figé : refusé AVANT tout appel
  // IA, jamais une recherche de preuve réelle sur un lien figé.
  it('un espace de démonstration : 409, aucun appel IA, le lien n’est pas touché', async () => {
    const { controller, ia, orgGraph } = buildController({ demoWorkspace: true })

    await expect(controller.verifyRelation('acc-1', edge, USER)).rejects.toBeInstanceOf(ConflictException)
    expect(ia.verifyRelation).not.toHaveBeenCalled()
    expect(orgGraph.applyRelationVerification).not.toHaveBeenCalled()
  })
})
