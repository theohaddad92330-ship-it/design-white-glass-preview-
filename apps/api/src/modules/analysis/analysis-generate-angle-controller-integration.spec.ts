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
 * #2130.46 (quater) / #2130.50 (quinquies) (épopée #3000) — quatrième
 * frontière refermée ce lot (après enrichOrganigram, proposeOrgPeopleFromText,
 * researchSite) : POST :accountId/generate-angle (« Générer un angle
 * d'attaque à la demande », Théo TF1 p31) partage le MÊME chemin privé
 * `runResearch` que `refreshResearch`/`researchSites` — même patron, même
 * gap : aucune spec n'appelait le VRAI `AnalysisController` sur cette route.
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

function buildController(opts: { iaThrows?: Error; demoWorkspace?: boolean; noAngle?: boolean } = {}) {
  const accounts = {
    findOne: jest.fn().mockResolvedValue(success(account)),
    refreshResearch: jest.fn().mockResolvedValue(undefined),
    appendUserAttackAngle: jest.fn().mockResolvedValue({
      ...account,
      raw_analysis: { ...account.raw_analysis, user_attack_angles: [{ title: 'Angle frais' }] },
    }),
  }
  const ia = {
    research: opts.iaThrows
      ? jest.fn().mockRejectedValue(opts.iaThrows)
      : jest.fn().mockResolvedValue({
          data: opts.noAngle ? { angles: [] } : { angles: [{ title: 'Angle frais', strategy: 'Approche fraîche' }] },
        }),
  }
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demoWorkspace ?? false),
  }

  const onDemand = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    {} as ContactsService, // jamais lu par `generateAttackAngle`
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService, // jamais lu — l'angle est persisté via `accounts.appendUserAttackAngle`
    esnProfileStub(),
    undefined, // accountFeedback
    workspaceContext as unknown as WorkspaceContextService,
  )

  const stub = {} as never
  const controller = new AnalysisController(
    stub, // analysisService — jamais lu par `generateAngle()`
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

describe('AnalysisController.generateAngle — intégration (#2130.46 quater « source en panne », #2130.50 quinquies « mode démo »)', () => {
  it('une recherche qui aboutit : l’angle s’ACCUMULE au dossier, jamais un échec silencieux', async () => {
    const { controller, accounts } = buildController()

    const result = await controller.generateAngle('acc-1', USER)

    expect(result).toMatchObject({ angle: { title: 'Angle frais' }, added: true })
    expect(accounts.appendUserAttackAngle).toHaveBeenCalledTimes(1)
  })

  // La PORTE : la source (recherche Phase 1) tombe → 502, jamais un angle
  // vide qui se lirait « rien à proposer ».
  it('la source échoue : BadGatewayException (502), rien n’est persisté', async () => {
    const { controller, accounts } = buildController({ iaThrows: new Error('Claude timeout') })

    await expect(controller.generateAngle('acc-1', USER)).rejects.toBeInstanceOf(BadGatewayException)
    expect(accounts.appendUserAttackAngle).not.toHaveBeenCalled()
  })

  // L'IA répond sans le moindre angle exploitable : un refus nommé, jamais un
  // angle inventé pour combler le vide (doctrine « jamais de donnée fictive »).
  it('aucun angle exploitable : BadGatewayException nommée, rien n’est persisté', async () => {
    const { controller, accounts } = buildController({ noAngle: true })

    await expect(controller.generateAngle('acc-1', USER)).rejects.toThrow(/aucun angle/i)
    expect(accounts.appendUserAttackAngle).not.toHaveBeenCalled()
  })

  // #2130.50 quinquies — un dossier de DÉMO est figé : refusé AVANT tout
  // appel IA, jamais une recherche réelle sur un dossier curé.
  it('un espace de démonstration : 409, aucun appel IA, rien n’est persisté', async () => {
    const { controller, ia, accounts } = buildController({ demoWorkspace: true })

    await expect(controller.generateAngle('acc-1', USER)).rejects.toBeInstanceOf(ConflictException)
    expect(ia.research).not.toHaveBeenCalled()
    expect(accounts.appendUserAttackAngle).not.toHaveBeenCalled()
  })
})
