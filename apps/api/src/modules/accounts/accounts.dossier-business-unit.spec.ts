import { AccountsController } from './accounts.controller'
import type { AccountsService } from './accounts.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * #2128.2 — LA BU DU COMPTE VOYAGE JUSQU'AU DOSSIER, NOMMÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SUITE GARDE, ET POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /accounts/:id` répond `SELECT a.*` : la colonne `business_unit_id`
 * arrivait donc DÉJÀ au navigateur (`account.entity.ts:288`), sans être au
 * contrat et sans qu'aucun écran ne la lise — `AccountCollaborationBand`
 * n'y jetait aucun coup d'œil. Même motif que le porteur (#2128.1,
 * `accounts.dossier-owner.spec.ts`) : ce qui manquait n'était pas la donnée,
 * c'était la dérivation qui la NOMME.
 *
 * Trois propriétés :
 *
 *  1. un compte rattaché à une BU connue rend `business_unit` nommé ;
 *  2. un compte sans BU posée rend `business_unit: null` — une lecture qui a
 *     eu lieu et qui dit « aucune » (GA-18/GA-19) ;
 *  3. **la dérivation n'est appelée qu'AVEC l'identifiant de la BU.** Sans
 *     BU posée, aucune requête vers `business_units` ne part.
 */

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const BU_ID = '33333333-3333-4333-8333-333333333333'

function build(businessUnitId: string | null) {
  const findByIds = jest.fn(async (_workspaceId: string, ids: readonly string[]) =>
    ids.includes(BU_ID) ? [{ id: BU_ID, name: 'Agence Lyon', territory: null, specialties: [] }] : [],
  )
  const accountsService = {
    findOneForWorkspace: jest.fn().mockResolvedValue({
      type: 'success',
      output: {
        id: ACCOUNT_ID,
        company_name: 'THALES',
        status: 'completed',
        assigned_to: null,
        business_unit_id: businessUnitId,
        updated_at: '2026-09-14T08:00:00.000Z',
      },
    }),
    computeAgeDays: jest.fn(() => 3),
    resolveLastAnalyzedAt: jest.fn().mockResolvedValue(null),
    resolveOwner: jest.fn().mockResolvedValue(null),
    // #2128.19 — chevauchement hors du périmètre de cette suite (voir
    // `accounts.dossier-active-analysis.spec.ts`), neutralisé ici.
    resolveActiveAnalysisByColleague: jest.fn().mockResolvedValue(null),
    isFollowed: jest.fn().mockResolvedValue(false),
  } as unknown as AccountsService

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  } as unknown as WorkspaceContextService

  // Construction POSITIONNELLE, comme les autres suites de ce contrôleur.
  const controller = new AccountsController(
    accountsService,
    {} as never, // analysisService
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext,
    {} as never, // needPlay,
    undefined, // analytics
    undefined, // esnProfile
    undefined, // stockSnapshots
    undefined, // firstEuro
    undefined, // marketMemory
    undefined, // accountMissions
    undefined, // intelligence
    { scopeFor: jest.fn().mockResolvedValue(null), findByIds } as never,
  )
  return { controller, findByIds }
}

describe('GET /accounts/:id — la BU, NOMMÉE', () => {
  it('rend la BU nommée quand le compte est rattaché à une BU connue', async () => {
    const { controller } = build(BU_ID)

    const dossier = (await controller.findOne(ACCOUNT_ID, USER)) as { business_unit: unknown }

    expect(dossier.business_unit).toEqual({ id: BU_ID, name: 'Agence Lyon' })
  })

  it('rend `null` — jamais un champ absent — quand aucune BU n’est posée', async () => {
    const { controller } = build(null)

    const dossier = (await controller.findOne(ACCOUNT_ID, USER)) as { business_unit: unknown }

    expect(dossier).toHaveProperty('business_unit', null)
  })

  it('n’interroge JAMAIS les BU pour un compte sans `business_unit_id`', async () => {
    const { controller, findByIds } = build(null)

    await controller.findOne(ACCOUNT_ID, USER)

    expect(findByIds).not.toHaveBeenCalled()
  })
})
