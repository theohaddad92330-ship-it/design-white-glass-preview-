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
import type { ProposeOrgPeopleFromTextDto } from './dto/declare-org-people.dto'

/**
 * #2130.43 (bis) / #2130.50 (ter) (épopée #3000) — même défaut refermé pour
 * `enrichContacts` (lot V21 matin) et `enrichOrganigram` (ce lot, plus haut) :
 * `POST :accountId/org-people/from-text` (« Décris ton organigramme ») est,
 * dit son propre docblock, « la SEULE des trois portes [org-people] qui
 * appelle un modèle, et donc la SEULE refusée en espace de démonstration » —
 * exactement le couple source-en-panne/mode-démo des deux specs sœurs, sur
 * une frontière contrôleur↔service qu'aucune n'avait encore vérifiée.
 * `analysis-ondemand.service.spec.ts` prouve `ia_failed`/`demoGuard` au
 * niveau SERVICE (`proposeOrgPeopleFromText`) ; ici, le VRAI
 * `AnalysisController`.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }

const account = {
  id: 'acc-1',
  user_id: 'u-1',
  company_name: 'Société Générale',
} as unknown as AccountEntity

const esnProfileStub = () =>
  ({
    getAnswers: jest.fn().mockResolvedValue({}),
    resolveProfileData: jest.fn().mockResolvedValue({}),
  }) as unknown as EsnProfileReader

function buildController(opts: { iaThrows?: Error; demoWorkspace?: boolean } = {}) {
  const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
  const ia = {
    declareOrgFromText: opts.iaThrows
      ? jest.fn().mockRejectedValue(opts.iaThrows)
      : jest.fn().mockResolvedValue({ data: { people: [{ full_name: 'Jane Doe' }] } }),
  }
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demoWorkspace ?? false),
  }

  const onDemand = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    {} as ContactsService, // jamais lu par `proposeOrgPeopleFromText`
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService, // écriture réservée à `declareOrgPeople` — jamais appelée ici
    esnProfileStub(),
    undefined, // accountFeedback
    workspaceContext as unknown as WorkspaceContextService,
  )

  const stub = {} as never
  const controller = new AnalysisController(
    stub, // analysisService — jamais lu par `proposeOrgPeopleFromText()`
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

  return { controller, ia }
}

describe('AnalysisController.proposeOrgPeopleFromText — intégration (#2130.43 bis « source en panne », #2130.50 ter « mode démo »)', () => {
  it('un texte mis en forme : une PROPOSITION rendue, jamais déclarée (aucune écriture)', async () => {
    const { controller } = buildController()
    const dto = { text: 'Jane Doe est DSI.' } as ProposeOrgPeopleFromTextDto

    const result = await controller.proposeOrgPeopleFromText('acc-1', dto, USER)

    expect(result).toMatchObject({ people: [{ fullName: 'Jane Doe' }] })
  })

  // La PORTE : la mise en forme (modèle) tombe → 502, jamais une proposition
  // vide qui se lirait « personne trouvé dans le texte ».
  it('la mise en forme échoue : BadGatewayException (502)', async () => {
    const { controller } = buildController({ iaThrows: new Error('Claude timeout') })
    const dto = { text: 'Jane Doe est DSI.' } as ProposeOrgPeopleFromTextDto

    await expect(controller.proposeOrgPeopleFromText('acc-1', dto, USER)).rejects.toBeInstanceOf(BadGatewayException)
  })

  // #2130.50 ter — un dossier de DÉMO est figé : refusé AVANT tout appel IA.
  it('un espace de démonstration : 409, aucun appel IA', async () => {
    const { controller, ia } = buildController({ demoWorkspace: true })
    const dto = { text: 'Jane Doe est DSI.' } as ProposeOrgPeopleFromTextDto

    await expect(controller.proposeOrgPeopleFromText('acc-1', dto, USER)).rejects.toBeInstanceOf(ConflictException)
    expect(ia.declareOrgFromText).not.toHaveBeenCalled()
  })

  // #3740 (reste) — un fichier (PDF/.xlsx/.pptx) suit la MÊME porte que le texte :
  // le contrôleur transmet `file`, jamais `text` (absent du DTO dans ce cas).
  describe('#3740 (reste) — un fichier déposé, pas de texte tapé', () => {
    it('transmet le fichier à l’IA, jamais un texte vide ou deviné', async () => {
      const { controller, ia } = buildController()
      const dto = { fileBase64: 'UERGLWNvbnRlbnQ=', fileName: 'organigramme.pdf' } as ProposeOrgPeopleFromTextDto

      await controller.proposeOrgPeopleFromText('acc-1', dto, USER)

      expect(ia.declareOrgFromText).toHaveBeenCalledWith({
        file: { base64: 'UERGLWNvbnRlbnQ=', name: 'organigramme.pdf' },
        accountName: 'Société Générale',
      })
    })

    // Le point du lot : la garde anti-invention relit le texte EXTRAIT du
    // fichier (`resolvedText`, rendu par l'IA), jamais `body.text` — absent
    // ici — ni une confiance aveugle dans ce que le modèle a proposé.
    it('la garde relit `resolvedText` — une personne hors du texte extrait est retirée', async () => {
      const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
      const ia = {
        declareOrgFromText: jest.fn().mockResolvedValue({
          data: {
            people: [{ full_name: 'Jane Doe' }, { full_name: 'Personne Inventée' }],
            resolvedText: 'Organigramme : Jane Doe, DSI.',
          },
        }),
      }
      const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(false) }
      const onDemand = new AnalysisOnDemandService(
        accounts as unknown as AccountsService,
        {} as ContactsService,
        ia as unknown as IaClient,
        {} as AnalysisPersistenceService,
        esnProfileStub(),
        undefined,
        workspaceContext as unknown as WorkspaceContextService,
      )
      const stub = {} as never
      const controller = new AnalysisController(stub, onDemand, stub, stub, stub, stub, stub, stub, stub, stub, stub)
      const dto = { fileBase64: 'UERGLWNvbnRlbnQ=', fileName: 'organigramme.pdf' } as ProposeOrgPeopleFromTextDto

      const result = await controller.proposeOrgPeopleFromText('acc-1', dto, USER)

      expect(result).toMatchObject({ people: [{ fullName: 'Jane Doe' }], dropped: ['Personne Inventée'] })
    })
  })
})
