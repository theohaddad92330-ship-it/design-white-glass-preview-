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
import type { EnrichContactsDto } from './dto/enrich-contacts.dto'

/**
 * #2130.46 / #2130.50 (épopée #3000) — « source en panne » et « mode démo » :
 * `ContactsEmptyState` rend « Source indisponible » (jamais « aucun contact »)
 * quand la mutation `POST :accountId/enrich-contacts` échoue ;
 * `DemoModeBanner` promet qu'un dossier de démo est figé — aucun appel IA
 * réel. `analysis-ondemand.service.spec.ts` prouve déjà CHAQUE règle au niveau
 * SERVICE (`{code: 'ia_failed'}` quand `IaClient.contacts` lève, refus sans
 * appel réseau en espace de démo) ; `analysis.controller.ts` traduit ces codes
 * en HTTP (`throwOnDemandFailure` : `ia_failed` → 502, `precondition_failed` →
 * 409) — mais AUCUNE spec n'appelait le VRAI contrôleur pour vérifier que ces
 * traductions ont effectivement lieu sur la route `enrichContacts`, plutôt
 * qu'un 200 vide qui se lirait « aucun contact » côté client (exactement la
 * confusion que #2126.8 interdit) ou qu'un appel IA réel payé sur un dossier
 * figé. Même patron que `analysis-refresh-controller-integration.spec.ts`
 * (#2130.42) : le VRAI contrôleur, le VRAI service, seule la frontière d'E/S
 * (compte, IA, persistance, espace) est bouchée.
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
  const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
  const contacts = { findByAccount: jest.fn() }
  const ia = {
    contacts: opts.iaThrows
      ? jest.fn().mockRejectedValue(opts.iaThrows)
      : jest.fn().mockResolvedValue({ data: { contacts: [{ full_name: 'Jane Doe' }] } }),
  }
  const persistence = {
    saveContacts: jest.fn().mockResolvedValue(1),
    saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
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
    stub, // analysisService — jamais lu par `enrichContacts()`
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

describe('AnalysisController.enrichContacts — intégration (#2130.46 « source en panne », #2130.50 « mode démo »)', () => {
  it('une recherche qui aboutit : les contacts entrent au dossier, jamais un échec silencieux', async () => {
    const { controller, persistence } = buildController()
    const dto = {} as EnrichContactsDto

    const result = await controller.enrichContacts('acc-1', dto, USER)

    expect(result).toMatchObject({ count: 1, identified: 1 })
    expect(persistence.saveContacts).toHaveBeenCalledTimes(1)
  })

  // La PORTE : la source (Apollo/LLM) tombe → 502, jamais un 200 vide qui se
  // lirait « aucun contact » côté client (`ContactsEmptyState` distinguerait
  // alors, à tort, une panne d'une absence — #2126.8).
  it('la source échoue : BadGatewayException (502), rien n’est persisté', async () => {
    const { controller, persistence } = buildController({ iaThrows: new Error('Apollo timeout') })
    const dto = {} as EnrichContactsDto

    await expect(controller.enrichContacts('acc-1', dto, USER)).rejects.toBeInstanceOf(BadGatewayException)
    expect(persistence.saveContacts).not.toHaveBeenCalled()
  })

  // #2130.50 — un dossier de DÉMO est figé : refusé AVANT tout appel IA,
  // jamais un 200 qui rejouerait une recherche Apollo sur une entreprise
  // fictive (doctrine « jamais de donnée fictive hors démo curée »).
  it('un espace de démonstration : 409, aucun appel IA, rien n’est persisté', async () => {
    const { controller, ia, persistence } = buildController({ demoWorkspace: true })
    const dto = {} as EnrichContactsDto

    await expect(controller.enrichContacts('acc-1', dto, USER)).rejects.toBeInstanceOf(ConflictException)
    expect(ia.contacts).not.toHaveBeenCalled()
    expect(persistence.saveContacts).not.toHaveBeenCalled()
  })
})
