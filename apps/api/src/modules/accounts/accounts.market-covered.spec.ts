import { Test } from '@nestjs/testing'
import { ServiceUnavailableException } from '@nestjs/common'
import { AccountDeclaredPartnerService } from './account-declared-partner.service'
import { AccountsController } from './accounts.controller'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { AccountsService } from './accounts.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #1575.1 — `GET /accounts?marketCovered=covered`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * La COMPOSITION, et elle seule : le calcul de couverture vit dans
 * `market-memory.service.spec.ts`, le prédicat SQL dans
 * `accounts.market-covered-filter.spec.ts`. Ici, trois décisions du contrôleur.
 *
 * 1. Il interroge la MÊME population que le compteur qui a produit le chiffre
 *    (`listPortfolioLookups`) — sinon « 3 avec des parcours observés » ouvrirait
 *    une liste de 2.
 * 2. Il ne paie RIEN quand le filtre n'est pas demandé.
 * 3. ⚠️ Il ne sert JAMAIS une liste non filtrée sous ce libellé. Mémoire absente
 *    ou illisible ⇒ il le DIT (503), il ne rend ni tout le portefeuille (qui
 *    mentirait dans un sens) ni zéro compte (qui mentirait dans l'autre).
 *    « Je n'ai pas pu lire » n'est pas « aucun compte n'est couvert ».
 */

const ACCOUNTS = [
  { id: 'a1', company_name: 'Thales', website: 'https://thalesgroup.com', registry_country: 'FR' },
  { id: 'a2', company_name: 'Inconnue', website: null, registry_country: null },
]

const EMPTY_PAGE = { data: [], total: 0, offset: 0, limit: 25 }

async function buildController(overrides: {
  coveredRefsFor?: jest.Mock
  findAccountsByWorkspace?: jest.Mock
  listPortfolioLookups?: jest.Mock
  withMarketMemory?: boolean
}) {
  const coveredRefsFor = overrides.coveredRefsFor ?? jest.fn().mockResolvedValue(['a1'])
  const findAccountsByWorkspace = overrides.findAccountsByWorkspace ?? jest.fn().mockResolvedValue(EMPTY_PAGE)
  const listPortfolioLookups = overrides.listPortfolioLookups ?? jest.fn().mockResolvedValue(ACCOUNTS)

  const providers: Parameters<typeof Test.createTestingModule>[0]['providers'] = [
    AccountsController,
    // #2005.9 — le cloisonnement de périmètre. `@Optional()` au CONSTRUCTEUR,
    // jamais optionnel pour la RÈGLE : absent, le contrôleur lève 503 au lieu de
    // servir tout l’espace. « Pas de cloisonnement » se dit `null`, explicitement.
    { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
    { provide: AccountsService, useValue: { findAccountsByWorkspace, listPortfolioLookups } },
    {
      provide: WorkspaceContextService,
      useValue: {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'sales' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      },
    },
    // ⚠️ `undefined` et non omis : `useMocker` remplit toute dépendance omise,
    // et un objet injecté à la place d'un service absent ferait passer le test
    // « rend 503 » sans que la branche testée soit prise.
    {
      provide: MarketMemoryService,
      useValue: overrides.withMarketMemory === false ? undefined : { coveredRefsFor, pathsFor: jest.fn() },
    },
    // #1639 — le traceur produit, fourni EXPLICITEMENT. `useMocker` rendait
    // `{}` pour lui : `this.analytics?.track(...)` passait le `?.` (l'objet
    // existe) puis jetait sur une méthode absente. « Absente » n'est pas
    // « omise », et le compteur du préfiltre émis juste après la résolution
    // traverse ce chemin. Ce qu'il compte est vérifié à côté, dans
    // `accounts.market-prefilter-telemetry.spec.ts`.
    { provide: ProductAnalyticsService, useValue: { track: jest.fn() } },
    // #2265.5 — le badge « partenaire déclaré » : absent ici, `undefined` explicite (pas `{}`).
    { provide: AccountDeclaredPartnerService, useValue: undefined },
  ]

  const moduleRef = await Test.createTestingModule({ providers })
    .useMocker(() => ({}))
    .compile()

  return {
    controller: moduleRef.get(AccountsController),
    coveredRefsFor,
    findAccountsByWorkspace,
    listPortfolioLookups,
  }
}

const USER = { userId: 'u1' } as never

describe('#1575.1 — GET /accounts?marketCovered=covered', () => {
  it('passe au service les comptes couverts, résolus sur la MÊME population que le compteur', async () => {
    const { controller, findAccountsByWorkspace, coveredRefsFor } = await buildController({})

    await controller.findAll(USER, { marketCovered: 'covered' } as never)

    expect(coveredRefsFor).toHaveBeenCalledWith(
      [
        { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com', country: 'FR' },
        { ref: 'a2', name: 'Inconnue', website: null, country: null },
      ],
      // #1617.4 — l'espace voyage avec la lecture : sans lui, une correction
      // humaine ne s'appliquerait jamais à ce chemin.
      { workspaceId: 'w1' },
    )
    expect(findAccountsByWorkspace).toHaveBeenCalledWith('w1', { marketCovered: 'covered' }, null, ['a1'], null, 'u1')
  })

  it('ne lit PAS la mémoire marché quand le filtre n’est pas demandé', async () => {
    const { controller, coveredRefsFor, listPortfolioLookups, findAccountsByWorkspace } = await buildController({})

    await controller.findAll(USER, {} as never)

    expect(coveredRefsFor).not.toHaveBeenCalled()
    expect(listPortfolioLookups).not.toHaveBeenCalled()
    expect(findAccountsByWorkspace).toHaveBeenCalledWith('w1', {}, null, undefined, null, 'u1')
  })

  it('« all » ≡ pas de filtre : aucune lecture non plus', async () => {
    const { controller, coveredRefsFor } = await buildController({})

    await controller.findAll(USER, { marketCovered: 'all' } as never)

    expect(coveredRefsFor).not.toHaveBeenCalled()
  })

  it('DIT que la mémoire est illisible — il ne rend ni tout, ni rien', async () => {
    const { controller, findAccountsByWorkspace } = await buildController({
      coveredRefsFor: jest.fn().mockResolvedValue(null),
    })

    await expect(controller.findAll(USER, { marketCovered: 'covered' } as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(findAccountsByWorkspace).not.toHaveBeenCalled()
  })

  it('DIT que la mémoire est absente, plutôt que de servir un portefeuille entier', async () => {
    const { controller, findAccountsByWorkspace } = await buildController({ withMarketMemory: false })

    await expect(controller.findAll(USER, { marketCovered: 'covered' } as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(findAccountsByWorkspace).not.toHaveBeenCalled()
  })

  it('aucun compte couvert ⇒ la liste est filtrée sur une liste VIDE, pas laissée ouverte', async () => {
    const { controller, findAccountsByWorkspace } = await buildController({
      coveredRefsFor: jest.fn().mockResolvedValue([]),
    })

    await controller.findAll(USER, { marketCovered: 'covered' } as never)

    expect(findAccountsByWorkspace).toHaveBeenCalledWith('w1', { marketCovered: 'covered' }, null, [], null, 'u1')
  })
})
