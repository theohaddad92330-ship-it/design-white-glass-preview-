import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { MARKET_MEMORY_MIN_PATHS, EMPTY_MARKET_MEMORY_COVERAGE } from '@bellum/contracts'
import type { MarketMemoryCoverage, MarketMemoryRead } from '@bellum/contracts'
import { AccountsController } from './accounts.controller'
import type { AccountsService } from './accounts.service'
import type { MarketCompanyLookup, MarketMemoryService } from '../market-memory/market-memory.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/**
 * #1582 — LE CONTEXTE MARCHÉ D'UN COMPTE, derrière le popover de sa ligne.
 *
 * Ce que cette suite garde est la même distinction que #1577, appliquée à une
 * lecture UNITAIRE : « je n'ai pas pu lire la mémoire », « ce compte n'est pas
 * couvert » et « ce compte est couvert et aucune ESN n'a été observée » sont
 * TROIS phrases, et l'écran doit pouvoir les distinguer sans les deviner.
 *
 * ⚠️ La troisième est celle qu'on rate. `esn_observed: 0` sur un compte COUVERT
 * est une vraie mesure — la mémoire a bien été lue sur lui, elle n'a vu passer
 * aucune société de services. Le rendre `null` « pour être prudent » ferait
 * disparaître l'information que l'écosystème est **à qualifier**, qui est
 * précisément ce que #1582 demande d'afficher.
 */

const USER: CurrentUserPayload = { userId: 'user-1', email: 'user@esn.fr' }
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

const COMPTE = {
  id: ACCOUNT_ID,
  company_name: 'THALES',
  website: 'thalesgroup.com',
  registry_country: 'FR',
}

function couverture(overrides: Partial<MarketMemoryCoverage>): MarketMemoryCoverage {
  return { ...EMPTY_MARKET_MEMORY_COVERAGE, ...overrides }
}

function build(read: MarketMemoryRead | 'absent', account: typeof COMPTE | 'introuvable' = COMPTE) {
  const coverageFor = jest.fn(async (_lookup: MarketCompanyLookup) => read as MarketMemoryRead)
  // #1640.2 — l'index par cohorte. Jamais appelé tant que
  // `MARKET_MEMORY_SCORING_ENABLED` est `false` : c'est ce que le test du bas
  // mesure, plutôt que de le supposer.
  const cohortIndexFor = jest.fn(async (_lookup: MarketCompanyLookup) => ({ status: 'ok', index: null }) as const)

  const accountsService = {
    findOneForWorkspace: jest
      .fn()
      .mockResolvedValue(
        account === 'introuvable'
          ? { type: 'failure', problem: { code: 'not_found', message: 'Compte introuvable' } }
          : { type: 'success', output: account },
      ),
  } as unknown as AccountsService

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  } as unknown as WorkspaceContextService

  const marketMemory = (
    read === 'absent' ? undefined : ({ coverageFor, cohortIndexFor } as unknown as MarketMemoryService)
  ) as MarketMemoryService | undefined

  // Construction POSITIONNELLE, comme les autres suites de ce contrôleur :
  // `marketMemory` est le 13e paramètre. Le 14e (`accountMissions`, #1576) est
  // `@Optional()` et simplement omis ici — cette suite ne lit pas les missions.
  const controller = new AccountsController(
    accountsService,
    {} as never, // analysisService
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext,
    {} as never, // needPlay
    {} as never, // analytics
    {} as never, // esnProfile
    {} as never, // stockSnapshots
    {} as never, // firstEuro
    marketMemory,
    undefined, // accountMissions
    undefined, // intelligence
    // Le cloisonnement de périmètre (revue sécurité 15/09/2026). `@Optional()`
    // au constructeur, jamais optionnel pour la RÈGLE : absent, le contrôleur
    // LÈVE au lieu de servir tout l'espace. Ici, « pas de cloisonnement » se
    // dit `null` — le niveau d'accès historique.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, coverageFor, cohortIndexFor }
}

describe('GET /accounts/:id/market-context — trois réponses, jamais deux', () => {
  it('compte couvert : les parcours observés et le nombre d’ESN vues', async () => {
    const { controller, coverageFor } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        esnObserved: [
          { esnName: 'ESN A', persons: 12, certainty: 'forte' },
          { esnName: 'ESN B', persons: 4, certainty: 'moyenne' },
        ] satisfies MarketMemoryCoverage['esnObserved'],
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toEqual({
      paths_observed: 41,
      esn_observed: 2,
      observed_zone: null,
      observed_stack: [],
      observed_stack_detail: [],
      role_families: [],
      // #1607.3 — les MÊMES entrées, NOMMÉES cette fois : `esn_observed`
      // ci-dessus n'est que leur longueur.
      esn_observed_detail: [
        { esnName: 'ESN A', persons: 12, certainty: 'forte' },
        { esnName: 'ESN B', persons: 4, certainty: 'moyenne' },
      ],
    })

    // Le pays voyage : deux homonymes ne se départagent pas sans lui, et la
    // fiche de compte le porte — contrairement à la ligne de liste (#1617).
    expect(coverageFor).toHaveBeenCalledWith({
      ref: ACCOUNT_ID,
      name: 'THALES',
      website: 'thalesgroup.com',
      country: 'FR',
    })
  })

  it('compte couvert SANS ESN observée : zéro est une mesure, pas une absence', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({ covered: true, marketPaths: MARKET_MEMORY_MIN_PATHS, esnObserved: [] }),
    })

    // L'écran écrira « À qualifier », jamais « aucune ESN » : on n'en a pas vu,
    // ce n'est pas qu'il n'y en a pas.
    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toEqual({
      paths_observed: MARKET_MEMORY_MIN_PATHS,
      esn_observed: 0,
      observed_zone: null,
      observed_stack: [],
      observed_stack_detail: [],
      role_families: [],
      esn_observed_detail: [],
    })
  })

  /**
   * #1608 / #1630.10 — l'empreinte de zone observée traverse jusqu'à cette
   * réponse, pour l'onglet Sites. Elle est un simple PASS-THROUGH de
   * `coverage.observedZone` : `MarketMemoryService` a déjà décidé si elle est
   * `null` ou pas (voir `market-memory.service.spec.ts`).
   */
  it('compte couvert avec une zone observée : elle voyage jusqu’à la réponse, telle quelle', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        observedZone: { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' },
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toEqual({
      paths_observed: 41,
      esn_observed: 0,
      observed_zone: { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' },
      observed_stack: [],
      observed_stack_detail: [],
      role_families: [],
      esn_observed_detail: [],
    })
  })

  it('compte NON couvert : `null`, et l’écran ne rend rien', async () => {
    const { controller } = build({ status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE })
    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toBeNull()
  })

  it('mémoire en PANNE : 503, jamais un `null` qui se lirait « pas couvert »', async () => {
    const { controller } = build({ status: 'unavailable', reason: 'timeout' })
    await expect(controller.marketContext(ACCOUNT_ID, USER)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('mémoire ABSENTE du montage : 503 aussi — une panne muette reste une panne', async () => {
    const { controller } = build('absent')
    await expect(controller.marketContext(ACCOUNT_ID, USER)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('compte hors de l’espace : 404 AVANT toute lecture de la mémoire', async () => {
    const { controller, coverageFor } = build({ status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE }, 'introuvable')
    await expect(controller.marketContext(ACCOUNT_ID, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(coverageFor).not.toHaveBeenCalled()
  })

  it('compte sans raison sociale : `null`, on n’interroge pas la mémoire sur un nom vide', async () => {
    const { controller, coverageFor } = build(
      { status: 'ok', coverage: EMPTY_MARKET_MEMORY_COVERAGE },
      {
        ...COMPTE,
        company_name: '',
      },
    )
    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toBeNull()
    expect(coverageFor).not.toHaveBeenCalled()
  })
})

/**
 * #1607.2 — la pile observée voyage jusqu'à la réponse.
 *
 * Elle s'affichait AVANT de dépenser un crédit (l'aperçu de `/search`) et
 * disparaissait dès que le compte entrait au portefeuille : `coverageFor` la
 * calculait, cette façade la jetait.
 */
describe('market-context — l’environnement technologique observé (#1607.2)', () => {
  it('rend les technologies observées, dans l’ordre du service', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        observedStack: [
          { techno: 'java', persons: 30 },
          { techno: 'python', persons: 12 },
        ],
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      observed_stack: ['java', 'python'],
    })
  })

  it('rend une liste VIDE sur un compte couvert sans techno observée — on a regardé', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({ covered: true, marketPaths: 41, observedStack: [] }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({ observed_stack: [] })
  })
})

/**
 * #1609 — les FAMILLES de rôles observées, comme piste de recherche.
 *
 * ⚠️ Ce que cette suite garde en creux : le corpus ne porte NI nom, NI date, NI
 * identifiant de personne. La façade rend des libellés et des comptages, et il
 * n'y a rien d'autre à laisser fuir — ce n'est pas une précaution d'écran.
 */
describe('market-context — le COMPTAGE de la pile observée (#1611.3)', () => {
  it('rend `{ techno, persons }` À CÔTÉ de la liste de libellés, sans la remplacer', async () => {
    // La façade appliquait `.map(entry => entry.techno)` et JETAIT `persons`,
    // que `coverageFor` calcule pourtant. Conséquence à l'écran : la
    // corroboration ne pouvait être que binaire — soit le renforcement plein,
    // soit le silence, jamais « peu de corroboration ».
    //
    // ⚠️ Les DEUX champs coexistent, et c'est le point du test : `observed_stack`
    // ne change pas de forme. Un onglet resté ouvert sur l'ancien front continue
    // de le lire exactement comme avant — ce dépôt a déjà payé un champ qui
    // change de forme pendant un déploiement.
    const { controller } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        observedStack: [
          { techno: 'java', persons: 7 },
          { techno: 'aws', persons: 2 },
        ],
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      observed_stack: ['java', 'aws'],
      observed_stack_detail: [
        { techno: 'java', persons: 7 },
        { techno: 'aws', persons: 2 },
      ],
    })
  })

  it('un compte couvert SANS techno observée rend deux listes vides — on a regardé', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({ covered: true, marketPaths: 41, observedStack: [] }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      observed_stack: [],
      observed_stack_detail: [],
    })
  })
})

describe('market-context — les familles de rôles observées (#1609)', () => {
  it('rend les familles telles que le service les ordonne', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        roleFamilies: [
          { family: 'Data / IA', persons: 12 },
          { family: 'Chef de projet', persons: 8 },
        ],
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      role_families: [
        { family: 'Data / IA', persons: 12 },
        { family: 'Chef de projet', persons: 8 },
      ],
    })
  })

  it('ne RETIRE pas le seau résiduel — il se filtre à l’affichage, à un seul endroit', async () => {
    // Le retirer ici en ferait une seconde dérivation, et l'aperçu de /search
    // applique déjà `isResidualRoleFamily` de son côté.
    const { controller } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        roleFamilies: [{ family: 'Autre', persons: 40 }],
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      role_families: [{ family: 'Autre', persons: 40 }],
    })
  })
})

/**
 * #1607.3 — LES ESN OBSERVÉES, NOMMÉES : `IncumbentEsnCard` en a besoin pour
 * corroborer un titulaire que l'analyse a nommé.
 *
 * ⚠️ `esn_observed` (le COMPTAGE, #1582) ne bouge pas : les deux coexistent,
 * comme `observed_stack` / `observed_stack_detail` (#1611.3) juste au-dessus —
 * même discipline, même raison (un onglet resté ouvert sur l'ancien front
 * continue de lire `esn_observed` exactement comme avant).
 */
describe('market-context — les ESN observées, NOMMÉES (#1607.3)', () => {
  it('rend les entrées telles que le service les ordonne, À CÔTÉ du comptage', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({
        covered: true,
        marketPaths: 41,
        esnObserved: [
          { esnName: 'Capgemini', persons: 9, certainty: 'forte' },
          { esnName: 'Sopra Steria', persons: 3, certainty: 'moyenne' },
        ],
      }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      esn_observed: 2,
      esn_observed_detail: [
        { esnName: 'Capgemini', persons: 9, certainty: 'forte' },
        { esnName: 'Sopra Steria', persons: 3, certainty: 'moyenne' },
      ],
    })
  })

  it('lot 773 f) — les ex-ESN présentes voyagent quand elles sont MESURÉES, et sont ABSENTES sinon (jamais 0)', async () => {
    const measured = build({
      status: 'ok',
      coverage: couverture({ covered: true, marketPaths: 41, exEsnPresent: 5 }),
    })
    await expect(measured.controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({ ex_esn_present: 5 })
    const unknown = build({
      status: 'ok',
      coverage: couverture({ covered: true, marketPaths: 41, exEsnPresent: null }),
    })
    const result = await unknown.controller.marketContext(ACCOUNT_ID, USER)
    expect(result).not.toHaveProperty('ex_esn_present')
  })

  it('un compte couvert SANS ESN observée rend une liste VIDE — on a regardé', async () => {
    const { controller } = build({
      status: 'ok',
      coverage: couverture({ covered: true, marketPaths: 41, esnObserved: [] }),
    })

    await expect(controller.marketContext(ACCOUNT_ID, USER)).resolves.toMatchObject({
      esn_observed: 0,
      esn_observed_detail: [],
    })
  })
})

/**
 * #1640.2 — L'INTERDIT DU LOT, MESURÉ PLUTÔT QU'AFFIRMÉ.
 *
 * `MARKET_MEMORY_SCORING_ENABLED` reste `false` : construire l'index par
 * cohorte et l'ALLUMER sont deux décisions, et la seconde attend la
 * calibration sur données réelles. Ce que cette suite tient n'est PAS le
 * drapeau lui-même (`market-memory-score-single-reader.test.ts` le fait, côté
 * web, en lisant sa source) mais ses DEUX conséquences observables ici :
 * aucune lecture de cohorte n'est payée, et le champ ne part pas.
 *
 * ⚠️ Le jour où le drapeau passe à `true`, ces deux tests tombent — à dessein.
 * Ils sont le rappel que la clé i18n `fit.noGrade` (FR et EN) devient FAUSSE
 * dans le même lot : elle dit aujourd'hui, à raison, qu'on ne sait pas encore
 * comparer un compte à des entreprises de taille voisine.
 */
describe('#1640.2 — l’index par cohorte reste éteint, et ça se mesure', () => {
  const COUVERT: MarketMemoryRead = {
    status: 'ok',
    coverage: couverture({ covered: true, marketPaths: 41 }),
  }

  it('ne paie AUCUNE lecture de cohorte tant que le drapeau est éteint', async () => {
    const { controller, cohortIndexFor } = build(COUVERT)

    await controller.marketContext(ACCOUNT_ID, USER)

    expect(cohortIndexFor).not.toHaveBeenCalled()
    // Le témoin qui prouve que la façade EST bien branchée, et que le test
    // ci-dessus ne mesure pas un service absent.
    expect(typeof cohortIndexFor).toBe('function')
  })

  it('n’envoie AUCUN champ `cohort_index` — l’écran continue de dire ce qu’il disait', async () => {
    const { controller } = build(COUVERT)

    const reponse = await controller.marketContext(ACCOUNT_ID, USER)

    expect(reponse).not.toBeNull()
    // ⚠️ Mesuré sur la forme SÉRIALISÉE, celle qui part vraiment : une clé
    // portant `undefined` existe dans l'objet et disparaît du JSON. Lire
    // `Object.keys` sur l'objet répondrait à une autre question que « qu'est-ce
    // que le navigateur reçoit ? ».
    const surLeFil = JSON.parse(JSON.stringify(reponse)) as Record<string, unknown>
    expect(Object.keys(surLeFil)).not.toContain('cohort_index')
    // Et le reste de la réponse n'a pas bougé d'un octet.
    expect(surLeFil['paths_observed']).toBe(41)
  })
})
