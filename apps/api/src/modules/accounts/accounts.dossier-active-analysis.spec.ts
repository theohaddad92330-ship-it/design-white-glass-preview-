import { AccountsController } from './accounts.controller'
import type { AccountsService } from './accounts.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * #2128.19 — UN COLLÈGUE A DÉJÀ UNE ANALYSE EN COURS SUR CE COMPTE, NOMMÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux commerciaux du même espace peuvent relancer la MÊME entreprise sans le
 * savoir — chacun paie son propre run pendant que l'autre tourne déjà.
 * `AnalysisService.start` dédoublonne déjà PAR UTILISATEUR
 * (`findAnalyzingByUserAndCompany`), jamais entre collègues : ce chevauchement-
 * ci n'avait aucune détection.
 *
 * Trois propriétés :
 *
 *  1. un run `analyzing` lancé par un AUTRE utilisateur du même espace rend
 *     `active_analysis_by_colleague` nommé ;
 *  2. aucun run en cours (ou seulement le sien) rend
 *     `active_analysis_by_colleague: null` — jamais un champ absent
 *     (GA-18/GA-19) ;
 *  3. la dérivation est appelée avec l'id du compte, le workspace ET
 *     l'utilisateur courant — c'est ce qui l'exclut lui-même du résultat.
 */

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function build(activeAnalysis: { colleague: { user_id: string; name: string }; started_at: string } | null) {
  const resolveActiveAnalysisByColleague = jest.fn().mockResolvedValue(activeAnalysis)
  const accountsService = {
    findOneForWorkspace: jest.fn().mockResolvedValue({
      type: 'success',
      output: {
        id: ACCOUNT_ID,
        company_name: 'THALES',
        status: 'completed',
        assigned_to: null,
        updated_at: '2026-09-14T08:00:00.000Z',
      },
    }),
    computeAgeDays: jest.fn(() => 3),
    resolveLastAnalyzedAt: jest.fn().mockResolvedValue(null),
    resolveOwner: jest.fn().mockResolvedValue(null),
    resolveActiveAnalysisByColleague,
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
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, resolveActiveAnalysisByColleague }
}

describe('GET /accounts/:id — l’analyse en cours d’un collègue, NOMMÉE', () => {
  it('rend le collègue et la date quand une analyse tourne déjà, lancée par un autre', async () => {
    const { controller } = build({
      colleague: { user_id: 'user-2', name: 'Sarah Martin' },
      started_at: '2026-09-24T09:00:00.000Z',
    })

    const dossier = (await controller.findOne(ACCOUNT_ID, USER)) as { active_analysis_by_colleague: unknown }

    expect(dossier.active_analysis_by_colleague).toEqual({
      colleague: { user_id: 'user-2', name: 'Sarah Martin' },
      started_at: '2026-09-24T09:00:00.000Z',
    })
  })

  it('rend `null` — jamais un champ absent — quand aucun collègue n’a de run en cours', async () => {
    const { controller } = build(null)

    const dossier = (await controller.findOne(ACCOUNT_ID, USER)) as { active_analysis_by_colleague: unknown }

    expect(dossier.active_analysis_by_colleague).toBeNull()
  })

  it('appelle la dérivation avec le compte, le workspace ET l’utilisateur courant', async () => {
    const { controller, resolveActiveAnalysisByColleague } = build(null)

    await controller.findOne(ACCOUNT_ID, USER)

    expect(resolveActiveAnalysisByColleague).toHaveBeenCalledWith(ACCOUNT_ID, 'ws-1', USER.userId)
  })
})

// #4267.1 — la cadence de veille affichée sur la fiche suit le SUIVI EXPLICITE, plus le statut commercial.
describe('GET /accounts/:id — la cadence de veille suit le suivi explicite', () => {
  it('un compte suivi explicitement : « daily » ; non suivi : `null`', async () => {
    const followed = build(null)
    ;(
      followed.controller as unknown as { accountsService: { isFollowed: jest.Mock } }
    ).accountsService.isFollowed.mockResolvedValue(true)
    expect(((await followed.controller.findOne(ACCOUNT_ID, USER)) as { watch_cadence: unknown }).watch_cadence).toBe(
      'daily',
    )

    const notFollowed = build(null)
    expect(
      ((await notFollowed.controller.findOne(ACCOUNT_ID, USER)) as { watch_cadence: unknown }).watch_cadence,
    ).toBeNull()
  })
})
