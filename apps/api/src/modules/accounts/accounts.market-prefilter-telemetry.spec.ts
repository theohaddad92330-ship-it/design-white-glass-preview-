import { Test } from '@nestjs/testing'
import { AccountDeclaredPartnerService } from './account-declared-partner.service'
import { AccountsController } from './accounts.controller'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { AccountsService } from './accounts.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * LE PRÉFILTRE SE COMPTE — ET IL NE COMPTE QUE CE QU'IL A VU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /accounts?marketCovered=covered` est le SEUL endroit du dépôt où la
 * mémoire marché réduit réellement une population AVANT qu'un crédit puisse
 * partir : le commercial part de son portefeuille entier et n'en garde que les
 * comptes sur lesquels le corpus sait dire quelque chose. Les deux nombres
 * — combien entraient, combien sortent — sont relevés là, au même instant,
 * sur la même liste.
 *
 * C'est ce qui rend la démonstration économique VÉRIFIABLE plutôt que
 * rhétorique. Ce qu'on ne relève pas, en revanche, c'est « combien d'appels
 * payants ont été évités » : personne n'a jamais eu à décider de les
 * déclencher, donc le chiffre serait une soustraction contre un monde qui n'a
 * pas eu lieu (`PAID_CALLS_AVOIDED_REFUSAL`).
 *
 * ⚠️ Le compteur ne part PAS quand il n'y a rien à mesurer — portefeuille vide,
 * filtre non demandé, mémoire illisible. « Non mesuré » n'est jamais « mesuré
 * à zéro », et un `market_candidates_before: 0` dans le journal se lirait comme
 * « le préfiltre n'a servi à rien » là où la vérité est « on n'a rien observé ».
 */

const ACCOUNTS = [
  { id: 'a1', company_name: 'Thales', website: 'https://thalesgroup.com', registry_country: 'FR' },
  { id: 'a2', company_name: 'Inconnue', website: null, registry_country: null },
  { id: 'a3', company_name: 'Capgemini', website: 'https://capgemini.com', registry_country: 'FR' },
]

const EMPTY_PAGE = { data: [], total: 0, offset: 0, limit: 25 }

async function buildController(overrides: {
  coveredRefsFor?: jest.Mock
  listPortfolioLookups?: jest.Mock
  withMarketMemory?: boolean
}) {
  const coveredRefsFor = overrides.coveredRefsFor ?? jest.fn().mockResolvedValue(['a1'])
  const listPortfolioLookups = overrides.listPortfolioLookups ?? jest.fn().mockResolvedValue(ACCOUNTS)
  const track = jest.fn().mockResolvedValue(undefined)

  const moduleRef = await Test.createTestingModule({
    providers: [
      AccountsController,
      // #2005.9 — le cloisonnement de périmètre. `@Optional()` au CONSTRUCTEUR,
      // jamais optionnel pour la RÈGLE : absent, le contrôleur lève 503 au lieu de
      // servir tout l’espace. « Pas de cloisonnement » se dit `null`, explicitement.
      { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
      {
        provide: AccountsService,
        useValue: { findAccountsByWorkspace: jest.fn().mockResolvedValue(EMPTY_PAGE), listPortfolioLookups },
      },
      {
        provide: WorkspaceContextService,
        useValue: {
          resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'sales' }),
          portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
        },
      },
      // ⚠️ Fourni EXPLICITEMENT : `useMocker` remplit toute dépendance omise, y
      // compris `@Optional()`. Un `{}` injecté à la place du traceur ferait
      // passer « n'émet rien » sans qu'aucune branche ne soit prise.
      { provide: ProductAnalyticsService, useValue: { track } },
      // #2265.5 — absent ici : `undefined` explicite (pas `{}`).
      { provide: AccountDeclaredPartnerService, useValue: undefined },
      {
        provide: MarketMemoryService,
        useValue: overrides.withMarketMemory === false ? undefined : { coveredRefsFor, pathsFor: jest.fn() },
      },
    ],
  })
    .useMocker(() => ({}))
    .compile()

  return { controller: moduleRef.get(AccountsController), track, coveredRefsFor }
}

const USER = { userId: 'u1' } as never

/** Les appels au compteur du préfiltre, isolés du reste du flux produit. */
function prefilterCalls(track: jest.Mock): unknown[][] {
  return track.mock.calls.filter(call => call[0] === 'market_prefilter_used')
}

describe('le préfiltre mémoire marché se compte', () => {
  it('relève combien de comptes entraient et combien sortent', async () => {
    const { controller, track } = await buildController({
      coveredRefsFor: jest.fn().mockResolvedValue(['a1', 'a3']),
    })

    await controller.findAll(USER, { marketCovered: 'covered' } as never)

    expect(prefilterCalls(track)).toEqual([
      [
        'market_prefilter_used',
        {
          userId: 'u1',
          workspaceId: 'w1',
          properties: {
            market_candidates_before: 3,
            market_candidates_after: 2,
            market_candidates_removed: 1,
          },
        },
      ],
    ])
  })

  it('un préfiltre qui ne retire personne se compte quand même — ce zéro-là est VRAI', async () => {
    const { controller, track } = await buildController({
      coveredRefsFor: jest.fn().mockResolvedValue(['a1', 'a2', 'a3']),
    })

    await controller.findAll(USER, { marketCovered: 'covered' } as never)

    expect(prefilterCalls(track)[0]?.[1]).toMatchObject({
      properties: { market_candidates_before: 3, market_candidates_after: 3, market_candidates_removed: 0 },
    })
  })

  it('n’émet RIEN quand le filtre n’est pas demandé — aucun préfiltre n’a tourné', async () => {
    const { controller, track } = await buildController({})

    await controller.findAll(USER, {} as never)

    expect(prefilterCalls(track)).toEqual([])
  })

  it('n’émet RIEN sur un portefeuille vide — il n’y avait rien à filtrer', async () => {
    // Le cas qui distingue « non mesuré » de « mesuré à zéro » : émettre
    // `before: 0` fabriquerait une ligne de journal qui se lit comme un constat.
    const { controller, track } = await buildController({
      listPortfolioLookups: jest.fn().mockResolvedValue([]),
      coveredRefsFor: jest.fn().mockResolvedValue([]),
    })

    await controller.findAll(USER, { marketCovered: 'covered' } as never)

    expect(prefilterCalls(track)).toEqual([])
  })

  it('n’émet RIEN quand la mémoire est illisible — on ne compte pas ce qu’on n’a pas lu', async () => {
    const { controller, track } = await buildController({
      coveredRefsFor: jest.fn().mockResolvedValue(null),
    })

    await expect(controller.findAll(USER, { marketCovered: 'covered' } as never)).rejects.toThrow()

    expect(prefilterCalls(track)).toEqual([])
  })

  it('un traceur ABSENT ne casse pas la liste — la mesure est best-effort', async () => {
    // Le compteur sert la démonstration économique, jamais l'utilisateur. Une
    // panne de télémétrie ne doit pas faire tomber un écran de portefeuille.
    const { controller } = await buildController({})
    const noAnalytics = await Test.createTestingModule({
      providers: [
        AccountsController,
        // #2005.9 — le cloisonnement de périmètre. `@Optional()` au CONSTRUCTEUR,
        // jamais optionnel pour la RÈGLE : absent, le contrôleur lève 503 au lieu de
        // servir tout l’espace. « Pas de cloisonnement » se dit `null`, explicitement.
        { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
        {
          provide: AccountsService,
          useValue: {
            findAccountsByWorkspace: jest.fn().mockResolvedValue(EMPTY_PAGE),
            listPortfolioLookups: jest.fn().mockResolvedValue(ACCOUNTS),
          },
        },
        {
          provide: WorkspaceContextService,
          useValue: {
            resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'sales' }),
            portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
          },
        },
        { provide: ProductAnalyticsService, useValue: undefined },
        { provide: AccountDeclaredPartnerService, useValue: undefined },
        {
          provide: MarketMemoryService,
          useValue: { coveredRefsFor: jest.fn().mockResolvedValue(['a1']), pathsFor: jest.fn() },
        },
      ],
    })
      .useMocker(() => ({}))
      .compile()

    await expect(
      noAnalytics.get(AccountsController).findAll(USER, { marketCovered: 'covered' } as never),
    ).resolves.toBeDefined()
    expect(controller).toBeDefined()
  })
})
