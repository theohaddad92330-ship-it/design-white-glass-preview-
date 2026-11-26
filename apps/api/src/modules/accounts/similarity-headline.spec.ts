import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { AccountsController } from './accounts.controller'
import { success } from '@bellum/utils'

/**
 * #1576 / #1632 — LA RAISON PRINCIPALE D'UNE SUGGESTION, ET LE COMPTE QU'ELLE
 * NOMME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SUITE PROUVE, ET QU'AUCUN TEST DE COMPOSANT NE PEUT PROUVER
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux raisons fortes se lisent dans d'AUTRES modules — les missions signées
 * dans `delivery`, les piles observées dans `market-memory`. Le service des
 * comptes ne les voit pas ; c'est le CONTRÔLEUR qui compose. Un test du service
 * seul resterait donc vert avec les deux modules débranchés, et l'écran
 * n'afficherait jamais que la raison la plus faible : c'est très exactement la
 * forme du défaut n°1 de ce dépôt — du code juste que personne n'appelle.
 *
 * Chaque test ci-dessous exerce donc `AccountsController`, avec ses dépendances
 * optionnelles POSÉES puis RETIRÉES : la dégradation est une propriété testée,
 * pas une intention écrite en commentaire.
 */

const WORKSPACE = { workspaceId: 'ws-1', role: 'owner' }
const USER = { userId: 'user-1', email: 'user@esn.fr' } as never

function suggestion(overrides: Partial<SimilarAccountSuggestion> = {}): SimilarAccountSuggestion {
  return {
    id: '123456789',
    company_name: 'KEOLIS',
    sector: 'Transport',
    description: 'LYON · Transport',
    similarity_headline: { kind: 'sector', referenceAccount: 'SNCF' },
    ...overrides,
  }
}

type Build = {
  suggestions?: SimilarAccountSuggestion[]
  portfolio?: { id: string; company_name: string; website: string | null; registry_country: string | null }[]
  missions?: { accountIds: Set<string>; missionsTotal: number } | Error
  stacks?:
    | {
        status: 'ok'
        stacks: Map<string, readonly string[] | null>
        technoFrequency: Map<string, number>
        corpusCompanies: number
      }
    | { status: 'unavailable'; reason: string }
  // #2127.30 — même patron que `stacks`, lecture SÉPARÉE : une entreprise peut
  // être couverte côté familles de rôles sans l'être côté piles observées.
  families?:
    { status: 'ok'; families: Map<string, readonly string[] | null> } | { status: 'unavailable'; reason: string }
  withMissionsModule?: boolean
  withMarketMemory?: boolean
}

function buildController(options: Build = {}) {
  const {
    suggestions = [suggestion()],
    portfolio = [{ id: 'acc-sncf', company_name: 'SNCF', website: 'https://sncf.com', registry_country: 'FR' }],
    missions = { accountIds: new Set<string>(), missionsTotal: 0 },
    stacks = { status: 'ok' as const, stacks: new Map(), technoFrequency: new Map(), corpusCompanies: 0 },
    families = { status: 'ok' as const, families: new Map() },
    withMissionsModule = true,
    withMarketMemory = true,
  } = options

  const accountsService = {
    listSimilarCompaniesToExplore: jest.fn().mockResolvedValue(suggestions),
    listSimilarToAccount: jest.fn().mockResolvedValue(suggestions),
    listPortfolioLookups: jest.fn().mockResolvedValue(portfolio),
    // `GET /accounts/:id/similar` vérifie d'abord que le compte est dans
    // l'espace ET dans le périmètre de l'appelant (revue sécurité 15/09/2026).
    findOneForWorkspace: jest.fn().mockResolvedValue(success({ id: 'acc-1' })),
    // #2127.37 — masquer / démasquer une suggestion.
    dismissSimilarSuggestion: jest.fn().mockResolvedValue(undefined),
    restoreSimilarSuggestion: jest.fn().mockResolvedValue(undefined),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue(WORKSPACE) }
  const marketMemory = {
    observedStacksFor: jest.fn().mockResolvedValue(stacks),
    roleFamiliesManyFor: jest.fn().mockResolvedValue(families),
  }
  const accountMissions = {
    signedMissionsByAccount: jest.fn(() => (missions instanceof Error ? Promise.reject(missions) : missions)),
  }

  const controller = new AccountsController(
    accountsService as never,
    {} as never, // analysisService
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext as never,
    {} as never, // needPlay
    undefined, // analytics
    undefined, // esnProfile
    undefined, // stockSnapshots
    undefined, // firstEuro
    withMarketMemory ? (marketMemory as never) : undefined,
    withMissionsModule ? (accountMissions as never) : undefined,
    undefined, // intelligence
    // Le cloisonnement de périmètre (revue sécurité 15/09/2026). `@Optional()`
    // au constructeur, jamais optionnel pour la RÈGLE : absent, le contrôleur
    // LÈVE au lieu de servir tout l'espace. Ici, « pas de cloisonnement » se
    // dit `null` — le niveau d'accès historique.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )

  return { controller, accountsService, marketMemory, accountMissions }
}

const headlineOf = (rows: SimilarAccountSuggestion[]) => rows[0]!.similarity_headline

describe('la raison principale — « compte jumeau » (#1576)', () => {
  it('remonte à `twin` quand une mission est signée sur le compte de référence', async () => {
    const { controller } = buildController({
      missions: { accountIds: new Set(['acc-sncf']), missionsTotal: 4 },
    })

    const rows = await controller.listSimilarCompaniesToExplore(USER)

    expect(headlineOf(rows)).toEqual({ kind: 'twin', referenceAccount: 'SNCF' })
  })

  it('ne dit RIEN sous trois missions dans l’espace — « pas de ressemblance sur deux observations »', async () => {
    const { controller } = buildController({
      missions: { accountIds: new Set(['acc-sncf']), missionsTotal: 2 },
    })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))).toEqual({
      kind: 'sector',
      referenceAccount: 'SNCF',
    })
  })

  it('ne remonte pas un compte de référence SANS mission, même si l’espace en a beaucoup', async () => {
    const { controller } = buildController({
      missions: { accountIds: new Set(['acc-autre']), missionsTotal: 12 },
    })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
  })

  it('garde la raison la plus faible quand le module des missions est absent', async () => {
    const { controller } = buildController({ withMissionsModule: false })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
  })

  it('garde la raison la plus faible quand la lecture des missions ÉCHOUE', async () => {
    const { controller } = buildController({ missions: new Error('base indisponible') })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
  })

  it('n’applique JAMAIS `twin` sur le dossier d’un compte — la référence y est le compte lui-même', async () => {
    const { controller, accountMissions } = buildController({
      missions: { accountIds: new Set(['acc-sncf']), missionsTotal: 9 },
    })

    const rows = await controller.listSimilar('acc-sncf', USER)

    expect(headlineOf(rows)!.kind).toBe('sector')
    expect(accountMissions.signedMissionsByAccount).not.toHaveBeenCalled()
  })
})

describe('la raison principale — « environnement technologique proche » (#1632)', () => {
  const covered = (candidate: readonly string[], reference: readonly string[]) => ({
    status: 'ok' as const,
    stacks: new Map<string, readonly string[] | null>([
      ['account:acc-sncf', reference],
      ['candidate:0', candidate],
    ]),
    technoFrequency: new Map([
      ['java', 20],
      ['c++', 4],
      ['python', 12],
      ['sql', 90],
    ]),
    corpusCompanies: 100,
  })

  it('remonte à `tech` et NOMME les technologies communes discriminantes', async () => {
    const { controller } = buildController({
      stacks: covered(['java', 'c++', 'python', 'sql'], ['python', 'java', 'c++', 'sql']),
    })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))).toEqual({
      kind: 'tech',
      referenceAccount: 'SNCF',
      // `sql` est sur 90 entreprises sur 100 : il ne distingue rien.
      technologies: ['c++', 'python', 'java'],
    })
  })

  it('remonte aussi sur le dossier d’un compte — la même raison sur les deux surfaces', async () => {
    const { controller } = buildController({
      stacks: covered(['java', 'c++', 'python'], ['java', 'c++', 'python']),
    })

    expect(headlineOf(await controller.listSimilar('acc-sncf', USER))!.kind).toBe('tech')
  })

  it('#2127.29 — « recours à des externes observé des deux côtés » quand les DEUX entreprises sont couvertes', async () => {
    const { controller } = buildController({ stacks: covered(['java'], ['python']) })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]!.reference_shared).toEqual(['external_use'])
    // La raison principale ne bouge pas : un critère partagé n'est pas une raison.
    expect(rows[0]!.similarity_headline!.kind).toBe('sector')
  })

  it('#2127.29 — garde les critères vérifiés par le service, dans l’ordre du contrat', async () => {
    const { controller } = buildController({
      suggestions: [suggestion({ reference_shared: ['geo'] })],
      stacks: covered(['java'], ['python']),
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]!.reference_shared).toEqual(['geo', 'external_use'])
  })

  it('#2127.29 — se TAIT quand un côté n’est pas couvert — jamais « n’externalise pas »', async () => {
    const { controller } = buildController({
      stacks: {
        status: 'ok',
        stacks: new Map<string, readonly string[] | null>([
          ['account:acc-sncf', ['java']],
          ['candidate:0', null],
        ]),
        technoFrequency: new Map(),
        corpusCompanies: 100,
      },
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]).not.toHaveProperty('reference_shared')
  })

  it('#2127.30 — « métiers recrutés en commun » quand une famille se recoupe des deux côtés', async () => {
    const { controller } = buildController({
      families: {
        status: 'ok',
        families: new Map<string, readonly string[] | null>([
          ['account:acc-sncf', ['Data / IA', 'PMO']],
          ['candidate:0', ['PMO', 'Infra / Cloud']],
        ]),
      },
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]!.reference_shared).toEqual(['role_family'])
  })

  it('#2127.30 — ne dépend PAS de la couverture des piles techno : une lecture séparée', async () => {
    const { controller } = buildController({
      stacks: { status: 'unavailable', reason: 'read_failed' },
      families: {
        status: 'ok',
        families: new Map<string, readonly string[] | null>([
          ['account:acc-sncf', ['Data / IA']],
          ['candidate:0', ['Data / IA']],
        ]),
      },
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]!.reference_shared).toEqual(['role_family'])
  })

  it('#2127.30 — se TAIT quand un côté n’est pas couvert — jamais deviné', async () => {
    const { controller } = buildController({
      families: {
        status: 'ok',
        families: new Map<string, readonly string[] | null>([
          ['account:acc-sncf', ['Data / IA']],
          ['candidate:0', null],
        ]),
      },
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]).not.toHaveProperty('reference_shared')
  })

  it('#2127.30 — garde le géo/taille du service ET la famille de rôles, dans l’ordre du contrat', async () => {
    const { controller } = buildController({
      suggestions: [suggestion({ reference_shared: ['geo'] })],
      families: {
        status: 'ok',
        families: new Map<string, readonly string[] | null>([
          ['account:acc-sncf', ['Data / IA']],
          ['candidate:0', ['Data / IA']],
        ]),
      },
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]!.reference_shared).toEqual(['geo', 'role_family'])
  })

  it('#2127.30 — ne dit RIEN quand la lecture des familles est en PANNE — une panne n’est pas une absence', async () => {
    const { controller } = buildController({
      suggestions: [suggestion({ reference_shared: ['geo'] })],
      families: { status: 'unavailable', reason: 'read_failed' },
    })
    const rows = await controller.listSimilar('acc-sncf', USER)
    expect(rows[0]!.reference_shared).toEqual(['geo'])
  })

  it('ne dit RIEN quand le corpus ne couvre pas le CANDIDAT', async () => {
    const { controller } = buildController({
      stacks: {
        status: 'ok',
        stacks: new Map<string, readonly string[] | null>([
          ['account:acc-sncf', ['java', 'c++', 'python']],
          ['candidate:0', null],
        ]),
        technoFrequency: new Map([
          ['java', 2],
          ['c++', 2],
          ['python', 2],
        ]),
        corpusCompanies: 100,
      },
    })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
  })

  it('ne dit RIEN quand la mémoire marché est en PANNE — une panne n’est pas une absence', async () => {
    const { controller } = buildController({ stacks: { status: 'unavailable', reason: 'read_failed' } })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
  })

  it('garde la raison la plus faible quand la mémoire marché est absente', async () => {
    const { controller } = buildController({ withMarketMemory: false })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
  })

  it('`twin` PRIME sur `tech` — une seule raison par carte, la plus forte', async () => {
    const { controller, marketMemory } = buildController({
      missions: { accountIds: new Set(['acc-sncf']), missionsTotal: 5 },
      stacks: covered(['java', 'c++', 'python'], ['java', 'c++', 'python']),
    })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('twin')
    // Toutes les cartes étant déjà au maximum, la lecture du corpus ne part pas.
    expect(marketMemory.observedStacksFor).not.toHaveBeenCalled()
  })
})

describe('le rapprochement du compte de référence', () => {
  it('ÉCARTE un nom porté par deux comptes plutôt que de le départager au hasard', async () => {
    const { controller, marketMemory } = buildController({
      portfolio: [
        { id: 'acc-a', company_name: 'SNCF', website: null, registry_country: 'FR' },
        { id: 'acc-b', company_name: 'SNCF', website: null, registry_country: 'FR' },
      ],
      missions: { accountIds: new Set(['acc-a', 'acc-b']), missionsTotal: 9 },
    })

    expect(headlineOf(await controller.listSimilarCompaniesToExplore(USER))!.kind).toBe('sector')
    // Le compte ambigu n'entre pas non plus dans la lecture du corpus.
    const lookups = marketMemory.observedStacksFor.mock.calls[0]![0] as { ref: string }[]
    expect(lookups.some(lookup => lookup.ref.startsWith('account:'))).toBe(false)
  })

  it('passe le site et le pays du compte de référence à la mémoire marché (#1617)', async () => {
    const { controller, marketMemory } = buildController()

    await controller.listSimilarCompaniesToExplore(USER)

    expect(marketMemory.observedStacksFor).toHaveBeenCalledWith([
      { ref: 'account:acc-sncf', name: 'SNCF', website: 'https://sncf.com', country: 'FR' },
      { ref: 'candidate:0', name: 'KEOLIS', website: null },
    ])
  })

  it('ne lit RIEN quand aucune suggestion ne porte de raison (réponse antérieure au champ)', async () => {
    const { controller, accountsService, marketMemory } = buildController({
      suggestions: [suggestion({ similarity_headline: undefined })],
    })

    const rows = await controller.listSimilarCompaniesToExplore(USER)

    expect(rows[0]!.similarity_headline).toBeUndefined()
    expect(accountsService.listPortfolioLookups).not.toHaveBeenCalled()
    expect(marketMemory.observedStacksFor).not.toHaveBeenCalled()
  })

  it('ne lit RIEN sur une liste vide', async () => {
    const { controller, accountsService } = buildController({ suggestions: [] })

    expect(await controller.listSimilarCompaniesToExplore(USER)).toEqual([])
    expect(accountsService.listPortfolioLookups).not.toHaveBeenCalled()
  })
})

/**
 * #2127.37 — « MASQUER CETTE SUGGESTION », PERSISTANT ET PAR PERSONNE.
 */
describe('dismissSimilarSuggestion / restoreSimilarSuggestion (#2127.37)', () => {
  it('passe `userId` à `listSimilarToAccount` — le filtre est PAR PERSONNE', async () => {
    const { controller, accountsService } = buildController()

    await controller.listSimilar('acc-sncf', USER)

    expect(accountsService.listSimilarToAccount).toHaveBeenCalledWith('acc-sncf', 'ws-1', 'user-1')
  })

  it('masque : résout l’espace de l’appelant, puis délègue au service', async () => {
    const { controller, accountsService } = buildController()

    const result = await controller.dismissSimilarSuggestion('acc-sncf', '552049447', USER)

    expect(accountsService.dismissSimilarSuggestion).toHaveBeenCalledWith('ws-1', 'user-1', 'acc-sncf', '552049447')
    expect(result).toEqual({ dismissed: true })
  })

  it('démasque : résout l’espace de l’appelant, puis délègue au service', async () => {
    const { controller, accountsService } = buildController()

    const result = await controller.restoreSimilarSuggestion('acc-sncf', '552049447', USER)

    expect(accountsService.restoreSimilarSuggestion).toHaveBeenCalledWith('ws-1', 'user-1', 'acc-sncf', '552049447')
    expect(result).toEqual({ dismissed: false })
  })
})
