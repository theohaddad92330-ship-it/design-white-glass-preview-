import { Test } from '@nestjs/testing'
import type { MarketPortfolioRead } from '@bellum/contracts'
import { AccountsController } from './accounts.controller'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { AccountsService } from './accounts.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'

/**
 * #1633 / #1635 — `GET /accounts/market-memory-portfolio`.
 *
 * Ce que ces tests gardent n'est PAS le calcul (il vit dans
 * `market-memory.service.spec.ts`) mais les trois décisions du contrôleur :
 * la POPULATION interrogée, ce qu'il PASSE au service, et ce qu'il rend quand
 * une dépendance manque.
 */

const OK: MarketPortfolioRead = {
  status: 'ok',
  coverage: { accounts: 2, covered: 1, insufficientObservations: 0, ambiguous: 0, unresolved: 1, homonyms: 0 },
  review: [],
  structuralFit: null,
  computedAt: '2026-09-08T10:00:00.000Z',
}

const ACCOUNTS = [
  { id: 'a1', company_name: 'Thales', website: 'https://thalesgroup.com', registry_country: 'FR' },
  { id: 'a2', company_name: 'Inconnue', website: null, registry_country: null },
]

async function buildController(overrides: {
  listPortfolioLookups?: jest.Mock
  portfolioFor?: jest.Mock
  portfolioVisibilityOf?: jest.Mock
  getAnswers?: jest.Mock
  withMarketMemory?: boolean
  withEsnProfile?: boolean
}) {
  const listPortfolioLookups = overrides.listPortfolioLookups ?? jest.fn().mockResolvedValue(ACCOUNTS)
  const portfolioFor = overrides.portfolioFor ?? jest.fn().mockResolvedValue(OK)

  const providers: Parameters<typeof Test.createTestingModule>[0]['providers'] = [
    AccountsController,
    // #2005.9 — le cloisonnement de périmètre. `@Optional()` au CONSTRUCTEUR,
    // jamais optionnel pour la RÈGLE : absent, le contrôleur lève 503 au lieu de
    // servir tout l’espace. « Pas de cloisonnement » se dit `null`, explicitement.
    { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
    { provide: AccountsService, useValue: { listPortfolioLookups } },
    {
      provide: WorkspaceContextService,
      useValue: {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'sales' }),
        portfolioVisibilityOf: overrides.portfolioVisibilityOf ?? jest.fn().mockResolvedValue('open'),
      },
    },
  ]
  // ⚠️ Une dépendance ABSENTE se déclare `undefined`, elle ne s'omet pas : le
  // `useMocker` ci-dessous répond à tout jeton non fourni, et un `{}` injecté
  // à la place d'un service absent aurait fait passer le test « rend
  // `unavailable` » sans que la branche testée soit jamais prise.
  providers.push({
    provide: MarketMemoryService,
    useValue: overrides.withMarketMemory === false ? undefined : { portfolioFor },
  })
  providers.push({
    provide: EsnProfileReader,
    useValue:
      overrides.withEsnProfile === false
        ? undefined
        : { getAnswers: overrides.getAnswers ?? jest.fn().mockResolvedValue({ expertise_areas: ['Data'] }) },
  })

  const moduleRef = await Test.createTestingModule({ providers })
    // Les dépendances non concernées par cette route : le contrôleur en déclare
    // une douzaine, et les monter toutes ferait de ce fichier un test du module.
    .useMocker(() => ({}))
    .compile()

  return { controller: moduleRef.get(AccountsController), listPortfolioLookups, portfolioFor }
}

const USER = { userId: 'u1' } as never

describe('#1633 / #1635 — GET /accounts/market-memory-portfolio', () => {
  it('interroge la MÊME population que la liste de comptes — le cloisonnement compris', async () => {
    const { controller, listPortfolioLookups } = await buildController({
      portfolioVisibilityOf: jest.fn().mockResolvedValue('restricted'),
    })

    await controller.marketMemoryPortfolio(USER)

    // #1408 : un agrégat qui annonce « 62 comptes » quand la liste en montre 58
    // refait la faute de « deux populations, deux vérités, le même mot ».
    expect(listPortfolioLookups).toHaveBeenCalledWith('w1', { ownerId: 'u1', includeUnassigned: true }, null)
  })

  it('ne cloisonne pas quand l’espace est ouvert', async () => {
    const { controller, listPortfolioLookups } = await buildController({})

    await controller.marketMemoryPortfolio(USER)

    expect(listPortfolioLookups).toHaveBeenCalledWith('w1', null, null)
  })

  it('passe le PAYS de chaque compte — le seul départage entre deux homonymes (#1617)', async () => {
    const { controller, portfolioFor } = await buildController({})

    await controller.marketMemoryPortfolio(USER)

    expect(portfolioFor).toHaveBeenCalledWith(
      [
        { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com', country: 'FR' },
        { ref: 'a2', name: 'Inconnue', website: null, country: null },
      ],
      // #1617.4 — l'espace voyage avec la lecture : sans lui, une correction
      // humaine ne s'appliquerait jamais à ce chemin.
      { expertises: ['Data'], workspaceId: 'w1' },
    )
  })

  it('rend `unavailable` quand la mémoire marché n’est pas montée — jamais un portefeuille à zéro', async () => {
    const { controller, listPortfolioLookups } = await buildController({ withMarketMemory: false })

    const read = await controller.marketMemoryPortfolio(USER)

    expect(read).toEqual({ status: 'unavailable', reason: 'market_memory_unavailable' })
    // Et il n'a même pas lu le portefeuille : rien à lire pour rien.
    expect(listPortfolioLookups).not.toHaveBeenCalled()
  })

  it('rend le fit sans expertise quand le lecteur de profil est absent — pas un fit « à zéro »', async () => {
    const { controller, portfolioFor } = await buildController({ withEsnProfile: false })

    await controller.marketMemoryPortfolio(USER)

    expect(portfolioFor).toHaveBeenCalledWith(expect.any(Array), { expertises: [], workspaceId: 'w1' })
  })

  it('survit à un lecteur de profil qui JETTE — le portefeuille se rend quand même', async () => {
    const { controller, portfolioFor } = await buildController({
      getAnswers: jest.fn().mockRejectedValue(new Error('profil illisible')),
    })

    const read = await controller.marketMemoryPortfolio(USER)

    expect(read.status).toBe('ok')
    expect(portfolioFor).toHaveBeenCalledWith(expect.any(Array), { expertises: [], workspaceId: 'w1' })
  })
})
