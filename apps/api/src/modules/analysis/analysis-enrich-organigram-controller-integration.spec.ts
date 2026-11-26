import { BadGatewayException, ConflictException } from '@nestjs/common'
import { success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
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
 * #2130.46 (bis) / #2130.50 (bis) (épopée #3000) — même défaut que le lot V21
 * (28/09 matin) a fermé pour `enrichContacts` (`a39e00c610`/`b04a29d4e9`),
 * revérifié ce lot pour la frontière SUIVANTE : `POST :accountId/enrich-organigram`.
 * `analysis-ondemand.service.spec.ts` prouve déjà `classifyAndPersist` au
 * niveau SERVICE (`{code: 'ia_failed'}` quand `IaClient.classify` lève, refus
 * `demoGuard` sans appel réseau) ; `analysis.controller.ts` traduit ces codes
 * en HTTP (`ia_failed` → 502, `precondition_failed` → 409) — mais AUCUNE spec
 * n'appelait le VRAI `AnalysisController` sur CETTE route avant ce lot. Même
 * patron que `analysis-enrich-contacts-controller-integration.spec.ts`.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }

const account = {
  id: 'acc-1',
  user_id: 'u-1',
  company_name: 'Société Générale',
  raw_analysis: { sector: 'Banque' },
} as unknown as AccountEntity

const existingContact = {
  id: 'c-1',
  full_name: 'Jane Doe',
  title: 'DSI',
  linkedin_url: null,
  source: 'apollo',
} as unknown as ContactEntity

const esnProfileStub = () =>
  ({
    getAnswers: jest.fn().mockResolvedValue({}),
    resolveProfileData: jest.fn().mockResolvedValue({}),
  }) as unknown as EsnProfileReader

function buildController(opts: { iaThrows?: Error; demoWorkspace?: boolean } = {}) {
  const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
  const contacts = { findByAccount: jest.fn().mockResolvedValue([existingContact]) }
  const ia = {
    classify: opts.iaThrows
      ? jest.fn().mockRejectedValue(opts.iaThrows)
      : jest.fn().mockResolvedValue({ data: { contacts: [{ full_name: 'Jane Doe' }], org_graph: { nodes: [] } } }),
  }
  const persistence = {
    saveEnriched: jest.fn().mockResolvedValue(undefined),
    saveOrgChart: jest.fn().mockResolvedValue(true),
  }
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demoWorkspace ?? false),
  }

  const onDemand = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    contacts as unknown as ContactsService,
    ia as unknown as IaClient,
    persistence as unknown as AnalysisPersistenceService,
    esnProfileStub(),
    undefined, // accountFeedback
    workspaceContext as unknown as WorkspaceContextService,
  )

  const stub = {} as never
  const controller = new AnalysisController(
    stub, // analysisService — jamais lu par `enrichOrganigram()`
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

  return { controller, ia, persistence }
}

describe('AnalysisController.enrichOrganigram — intégration (#2130.46 bis « source en panne », #2130.50 bis « mode démo »)', () => {
  it('une classification qui aboutit : le graphe se met à jour, jamais un échec silencieux', async () => {
    const { controller, persistence } = buildController()

    const result = await controller.enrichOrganigram('acc-1', USER)

    expect(result).toMatchObject({ matched: 1, total: 1, orgGraphUpdated: true })
    expect(persistence.saveEnriched).toHaveBeenCalledTimes(1)
  })

  // La PORTE : la source (classify IA) tombe → 502, jamais un 200 vide qui
  // laisserait croire à un organigramme réellement reclassé.
  it('la source échoue : BadGatewayException (502), rien n’est persisté', async () => {
    const { controller, persistence } = buildController({ iaThrows: new Error('Claude timeout') })

    await expect(controller.enrichOrganigram('acc-1', USER)).rejects.toBeInstanceOf(BadGatewayException)
    expect(persistence.saveEnriched).not.toHaveBeenCalled()
    expect(persistence.saveOrgChart).not.toHaveBeenCalled()
  })

  // #2130.50 bis — un dossier de DÉMO est figé : refusé AVANT tout appel IA,
  // jamais un run de classification réel sur un organigramme curé.
  it('un espace de démonstration : 409, aucun appel IA, rien n’est persisté', async () => {
    const { controller, ia, persistence } = buildController({ demoWorkspace: true })

    await expect(controller.enrichOrganigram('acc-1', USER)).rejects.toBeInstanceOf(ConflictException)
    expect(ia.classify).not.toHaveBeenCalled()
    expect(persistence.saveEnriched).not.toHaveBeenCalled()
  })
})
