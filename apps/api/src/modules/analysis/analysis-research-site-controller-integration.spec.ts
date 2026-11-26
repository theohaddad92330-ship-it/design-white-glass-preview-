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
 * #2130.46 (ter) / #2130.50 (quater) (épopée #3000) — même défaut refermé
 * pour `enrichContacts` (lot V21 matin) et `enrichOrganigram`/
 * `proposeOrgPeopleFromText` (ce lot, plus haut), sur la frontière SUIVANTE :
 * `POST :accountId/research-site` (« Rechercher les sites », l'état vide de
 * l'onglet Sites). Partage le même chemin privé `runResearch` qu'utilise
 * `refreshResearch` (déjà couvert au niveau SERVICE par
 * `analysis-ondemand.service.spec.ts`), mais aucune spec n'appelait le VRAI
 * `AnalysisController` sur CETTE route avant ce lot.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }

const account = {
  id: 'acc-1',
  user_id: 'u-1',
  company_name: 'Société Générale',
  raw_analysis: { sector: 'Banque' },
} as unknown as AccountEntity

const esnProfileStub = () =>
  ({
    getAnswers: jest.fn().mockResolvedValue({}),
    resolveProfileData: jest.fn().mockResolvedValue({}),
  }) as unknown as EsnProfileReader

function buildController(opts: { iaThrows?: Error; demoWorkspace?: boolean } = {}) {
  const accounts = {
    findOne: jest.fn().mockResolvedValue(success(account)),
    refreshResearch: jest.fn().mockResolvedValue(undefined),
  }
  const ia = {
    research: opts.iaThrows
      ? jest.fn().mockRejectedValue(opts.iaThrows)
      : jest.fn().mockResolvedValue({
          data: { sitesFrance: [{ city: 'Paris' }] },
        }),
  }
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demoWorkspace ?? false),
  }

  const onDemand = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    {} as ContactsService, // jamais lu par `researchSites`
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService, // jamais lu par `researchSites` (écrit via `accounts.refreshResearch`)
    esnProfileStub(),
    undefined, // accountFeedback
    workspaceContext as unknown as WorkspaceContextService,
  )

  const stub = {} as never
  const controller = new AnalysisController(
    stub, // analysisService — jamais lu par `researchSite()`
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

  return { controller, ia, accounts }
}

describe('AnalysisController.researchSite — intégration (#2130.46 ter « source en panne », #2130.50 quater « mode démo »)', () => {
  it('une recherche qui aboutit : les sites entrent au dossier, jamais un échec silencieux', async () => {
    const { controller, accounts } = buildController()

    const result = await controller.researchSite('acc-1', USER)

    expect(result).toMatchObject({ matched: 1, total: 1 })
    expect(accounts.refreshResearch).toHaveBeenCalledTimes(1)
  })

  // La PORTE : la source (recherche Phase 1) tombe → 502, jamais un 200 vide
  // qui se lirait « aucun site » côté état vide de l'onglet Sites.
  it('la source échoue : BadGatewayException (502), rien n’est persisté', async () => {
    const { controller, accounts } = buildController({ iaThrows: new Error('Pappers indisponible') })

    await expect(controller.researchSite('acc-1', USER)).rejects.toBeInstanceOf(BadGatewayException)
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })

  // #2130.50 quater — un dossier de DÉMO est figé : refusé AVANT tout appel
  // IA, jamais une recherche Pappers/INSEE réelle sur une entreprise figée.
  it('un espace de démonstration : 409, aucun appel IA, rien n’est persisté', async () => {
    const { controller, ia, accounts } = buildController({ demoWorkspace: true })

    await expect(controller.researchSite('acc-1', USER)).rejects.toBeInstanceOf(ConflictException)
    expect(ia.research).not.toHaveBeenCalled()
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })
})
