import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import { AccountsController } from '../accounts/accounts.controller'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * GA-335 — LES ROUTES D'UN COMPTE PORTENT LE PÉRIMÈTRE, PAS SEULEMENT LA LISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT (R15N-16, mesuré le 15/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-334 (`business-unit-fiche-scope.spec.ts`) prouve que le SERVICE sait porter
 * le périmètre. Ce fichier-ci tient l'autre moitié, celle qui manquait vraiment :
 * **l'APPELANT le lui transmet**. Le défaut n°1 de ce dépôt est du code juste
 * que personne n'appelle ; une clause de cloisonnement jamais passée est une
 * intention, pas un cloisonnement.
 *
 * Deux formes, et elles sont différentes exprès :
 *  · les routes qui LISENT déjà le compte (`:id`, `:id/cost`, `:id/runs`…)
 *    passent le périmètre à `findOneForWorkspace` — aucune requête de plus ;
 *  · les routes de FRAGMENT, qui adressent un compte sans le lire
 *    (`:id/timeline`, `:id/similar`, `:id/branches`…), passent par une PORTE
 *    (`assertAccountInScope`) qui ne coûte une lecture que lorsqu'un périmètre
 *    existe réellement.
 *
 * ⚠️ CE QUE LA RÉPONSE DIT QUAND L'ACCÈS EST REFUSÉ. On SUIT la convention de
 * chaque route, on ne l'invente pas : `findOneForWorkspace` rend `not_found`
 * hors espace — jamais `forbidden`, parce que « ce compte existe mais tu n'y as
 * pas droit » est déjà une fuite d'information. Les routes qui LÈVENT sur cette
 * défaillance lèvent aussi hors périmètre ; celles qui DÉGRADENT (`[]`,
 * `{ digest: null }`, `null`) dégradent pareil.
 *
 * ⚠️ PREUVE QUE CETTE GARDE SAIT DIRE NON — mesurée le 15/09/2026 : retirer
 * l'argument de périmètre d'un appel `findOneForWorkspace` du contrôleur, ou
 * retirer la porte d'une route de fragment, fait rougir le cas qui NOMME cette
 * route (compte relevé au rapport du lot).
 *
 * ⚠️ TÉMOINS — ce que la garde ne doit PAS attraper : le niveau `'workspace'`,
 * celui de tout le monde à cette heure, ne déclenche aucune lecture
 * supplémentaire et laisse chaque route rendre exactement ce qu'elle rendait.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'commercial@esn.fr' }
const SCOPE_LYON = { businessUnitIds: ['bu-lyon'], includeUnassigned: true } as const

type BuildOptions = {
  /** `null` = `business_unit_access: 'workspace'`, le niveau historique. */
  scope?: { businessUnitIds: readonly string[]; includeUnassigned: true } | null
  /** Le compte est-il dans le périmètre ? `false` ⇒ `findOneForWorkspace` rend `not_found`. */
  found?: boolean
  /** Le service de périmètre est-il câblé ? `false` ⇒ la route doit LEVER. */
  wired?: boolean
}

const buildController = (options: BuildOptions = {}) => {
  const found = options.found ?? true
  const account = {
    id: 'acc-1',
    status: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
    assigned_to: null,
    api_cost_euros: null,
  }
  const outOfScope = failure({ code: 'not_found', message: 'Account acc-1 not found' })
  const findOneForWorkspace = jest.fn().mockResolvedValue(found ? success(account) : outOfScope)
  const accountsService = {
    findOneForWorkspace,
    computeAgeDays: jest.fn().mockReturnValue(0),
    resolveOwner: jest.fn().mockResolvedValue(null),
    resolveLastAnalyzedAt: jest.fn().mockResolvedValue(null),
    // #2128.19 — un collègue a-t-il déjà une analyse en cours sur ce compte ?
    // `findOne` (GET :id) l'appelle désormais inconditionnellement.
    resolveActiveAnalysisByColleague: jest.fn().mockResolvedValue(null),
    isFollowed: jest.fn().mockResolvedValue(false),
    changeDigest: jest.fn().mockResolvedValue({ sections: [] }),
    listSimilarToAccount: jest.fn().mockResolvedValue([]),
    listPortfolioLookups: jest.fn().mockResolvedValue([]),
    getBranchesForWorkspace: jest.fn().mockResolvedValue(success({ branches: [], total: 0 })),
    getAccountLinks: jest.fn().mockResolvedValue(success({ links: [] })),
  }
  const analysisRuns = {
    listForAccount: jest.fn().mockResolvedValue([]),
    costSummaryForAccount: jest.fn().mockResolvedValue({ analysesCount: 0, totalCostUsd: null, lastRunCostUsd: null }),
    getProfileProvenance: jest.fn().mockResolvedValue({ esnProfileVersion: 3 }),
  }
  const timeline = { forAccount: jest.fn().mockResolvedValue({ events: [] }) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: 'member' }),
  }
  const scopeFor = jest.fn().mockResolvedValue(options.scope ?? null)
  const businessUnits = options.wired === false ? undefined : { scopeFor }
  const firstEuro = { forAccount: jest.fn().mockResolvedValue({ distance: null }) }
  const intelligence = {
    contextFor: jest.fn().mockResolvedValue({ account_id: 'acc-1' }),
    // #3235 — `GET :id/runs` pose la version DataForge via la façade.
    dataforgeVersionFor: jest.fn().mockResolvedValue(null),
  }
  // #2871 — la porte des actions du plan, lue (jamais semée) par `GET :id/actions`.
  const planItems = { listPersistedForAccount: jest.fn().mockResolvedValue([]) }

  const controller = new AccountsController(
    accountsService as never,
    {} as never, // analysisService
    analysisRuns as never,
    {} as never, // shareService
    timeline as never,
    {} as never, // contactsService
    workspaceContext as never,
    {} as never, // needPlay
    undefined, // analytics
    undefined, // esnProfile
    undefined, // stockSnapshots
    firstEuro as never,
    undefined, // marketMemory
    undefined, // accountMissions
    intelligence as never,
    businessUnits as never,
    planItems as never,
  )
  return { controller, findOneForWorkspace, scopeFor, accountsService, timeline, intelligence, firstEuro }
}

type Appel = (c: AccountsController) => Promise<unknown>

/** Les routes qui LISENT le compte : le périmètre voyage dans l'appel lui-même. */
const ROUTES_QUI_LISENT: ReadonlyArray<[string, Appel]> = [
  ['GET :id (la FICHE — celle qu’on atteint par une URL)', c => c.findOne('acc-1', USER)],
  ['GET :id/cost', c => c.getCost('acc-1', USER)],
  ['GET :id/runs', c => c.listRuns('acc-1', USER)],
  ['GET :id/changes', c => c.changeDigest('acc-1', USER)],
  ['GET :id/profile-provenance', c => c.getProfileProvenance('acc-1', USER)],
  // #2871 — le plan du compte au contrat canonique : une ouverture par id de plus.
  ['GET :id/actions', c => c.listCanonicalActions('acc-1', USER)],
]

/** Les routes de FRAGMENT : elles passent par la porte de périmètre. */
const ROUTES_DE_FRAGMENT: ReadonlyArray<[string, Appel]> = [
  ['GET :id/timeline', c => c.timelineForAccount(USER, 'acc-1')],
  ['GET :id/similar', c => c.listSimilar('acc-1', USER)],
  ['GET :id/branches', c => c.listBranches('acc-1', USER)],
  ['GET :id/links', c => c.links('acc-1', USER)],
  ['GET :id/first-euro', c => c.firstEuroForAccount(USER, 'acc-1')],
  ['GET :id/intelligence-context', c => c.intelligenceContext(USER, 'acc-1')],
]

describe('GA-335 — les routes qui LISENT un compte transmettent le périmètre', () => {
  it.each(ROUTES_QUI_LISENT)('%s passe le périmètre à la lecture du compte', async (_name, call) => {
    const { controller, findOneForWorkspace, scopeFor } = buildController({ scope: SCOPE_LYON })

    await call(controller)

    expect(scopeFor).toHaveBeenCalledWith('w-1', 'u-1')
    // ⚠️ TROIS arguments : l'identifiant, l'espace, ET le périmètre. Les deux
    // premiers seuls sont exactement le défaut que ce lot répare.
    expect(findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'w-1', SCOPE_LYON)
  })

  it('la FICHE rend « introuvable » hors périmètre — jamais « interdit »', async () => {
    const { controller } = buildController({ scope: SCOPE_LYON, found: false })

    await expect(controller.findOne('acc-1', USER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('le COÛT d’un compte hors périmètre rend « introuvable », pas un montant', async () => {
    const { controller } = buildController({ scope: SCOPE_LYON, found: false })

    await expect(controller.getCost('acc-1', USER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('les routes qui DÉGRADENT gardent leur convention hors périmètre', async () => {
    // `:id/runs`, `:id/changes` et `:id/profile-provenance` rendaient déjà une
    // réponse vide pour un compte hors ESPACE. Hors PÉRIMÈTRE, elles rendent la
    // même chose : on suit la convention, on n'en invente pas une seconde.
    const { controller } = buildController({ scope: SCOPE_LYON, found: false })

    await expect(controller.listRuns('acc-1', USER)).resolves.toEqual([])
    await expect(controller.changeDigest('acc-1', USER)).resolves.toEqual({ digest: null })
    await expect(controller.getProfileProvenance('acc-1', USER)).resolves.toBeNull()
  })
})

describe('GA-335 — les routes de FRAGMENT passent par la porte de périmètre', () => {
  it.each(ROUTES_DE_FRAGMENT)('%s refuse un compte hors périmètre', async (_name, call) => {
    const { controller, findOneForWorkspace } = buildController({ scope: SCOPE_LYON, found: false })

    await expect(call(controller)).rejects.toBeInstanceOf(NotFoundException)
    expect(findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'w-1', SCOPE_LYON)
  })

  it.each(ROUTES_DE_FRAGMENT)('%s sert normalement un compte DANS le périmètre', async (_name, call) => {
    const { controller, findOneForWorkspace } = buildController({ scope: SCOPE_LYON, found: true })

    await expect(call(controller)).resolves.toBeDefined()
    expect(findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'w-1', SCOPE_LYON)
  })
})

describe('GA-335 — TÉMOIN : le niveau « workspace » ne change pas d’un octet', () => {
  it.each(ROUTES_DE_FRAGMENT)('%s ne fait AUCUNE lecture de plus sans cloisonnement', async (_name, call) => {
    // `'workspace'` est le niveau de TOUT LE MONDE à cette heure. La porte doit
    // s'effacer complètement : pas une lecture de compte de plus.
    const { controller, findOneForWorkspace, scopeFor } = buildController({ scope: null })

    await call(controller)

    expect(scopeFor).toHaveBeenCalledWith('w-1', 'u-1')
    expect(findOneForWorkspace).not.toHaveBeenCalled()
  })

  it.each(ROUTES_QUI_LISENT)('%s lit le compte avec un périmètre `null`, comme avant', async (_name, call) => {
    const { controller, findOneForWorkspace } = buildController({ scope: null })

    await call(controller)

    expect(findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'w-1', null)
  })
})

describe('GA-335 — un cloisonnement qui se désactive tout seul n’est pas un cloisonnement', () => {
  it.each([...ROUTES_QUI_LISENT, ...ROUTES_DE_FRAGMENT])(
    '%s LÈVE quand le service de périmètre manque, au lieu de servir tout l’espace',
    async (_name, call) => {
      const { controller } = buildController({ wired: false })

      await expect(call(controller)).rejects.toBeInstanceOf(ServiceUnavailableException)
    },
  )
})

describe('GA-335 — la garde LIT du code réel : le corpus n’est pas vide', () => {
  it('les deux familles de routes sont peuplées, et elles sont disjointes', () => {
    expect(ROUTES_QUI_LISENT.length).toBeGreaterThanOrEqual(5)
    expect(ROUTES_DE_FRAGMENT.length).toBeGreaterThanOrEqual(6)
    const noms = [...ROUTES_QUI_LISENT, ...ROUTES_DE_FRAGMENT].map(([nom]) => nom)
    expect(new Set(noms).size).toBe(noms.length)
  })
})
