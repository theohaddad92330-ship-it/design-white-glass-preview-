import { CompaniesController } from './companies.controller'

/**
 * #1626 — LA RECHERCHE PAR CONTEXTE MARCHÉ OBSERVÉ, DEPUIS DÉCOUVRIR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketMemoryService.searchByFilters` existe déjà (#1596.6-10) et applique
 * déjà tout ce qui compte — le seuil, le vocabulaire d'absence, l'exclusion de
 * toute identité. Ce que #1626 ajoute est une SECONDE porte devant lui, pour un
 * écran JWT plutôt que pour le pont interne. Ces tests prouvent donc que le
 * contrôleur RELAIE — jamais qu'il recalcule.
 */

const marketMemory = { searchByFilters: jest.fn() }

/** #2288.2 — l'appelant, dont le portefeuille sert à DATER ce qui peut l'être. */
const USER = { userId: 'u-1' } as never

/**
 * #2288.2 — SANS portefeuille résolvable, par défaut.
 *
 * Les deux dépendances sont `@Optional()` : ce double les laisse absentes, et
 * la recherche doit alors rendre exactement ce qu'elle rendait avant le lot —
 * les mêmes entreprises, sans date.
 */
function build(portfolio?: { accountsService: unknown; workspaceContext: unknown }) {
  const companies = { search: jest.fn() }
  return new CompaniesController(
    companies as never,
    marketMemory as never,
    portfolio?.accountsService as never,
    portfolio?.workspaceContext as never,
  )
}

describe('CompaniesController.marketContextSearch (#1626)', () => {
  beforeEach(() => {
    marketMemory.searchByFilters.mockReset()
  })

  it('relaie les six filtres, tels quels, à `MarketMemoryService.searchByFilters`', async () => {
    marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [] })
    const controller = build()
    await controller.marketContextSearch(USER, {
      technology: 'Java',
      location: 'Lyon',
      esn: 'Capgemini',
      roleFamily: 'Data',
      employeeMin: 250,
      employeeMax: 1000,
      limit: 10,
    } as never)
    expect(marketMemory.searchByFilters).toHaveBeenCalledWith(
      {
        technology: 'Java',
        location: 'Lyon',
        esn: 'Capgemini',
        roleFamily: 'Data',
        employeeMin: 250,
        employeeMax: 1000,
        limit: 10,
      },
      // #2288.2 — le portefeuille n'est pas résolvable ici : la recherche part
      // quand même, et rendra des entreprises SANS date. Une absence
      // d'outillage ne se rend pas comme une absence de fait.
      { portfolio: [], workspaceId: null },
    )
  })

  /**
   * #2288.2 — LE PORTEFEUILLE TRAVERSE, ET C'EST LUI QUI PERMET DE DATER.
   *
   * Sans ce passage, `searchByFilters` ne rapproche AUCUN compte de l'appelant,
   * donc aucune entreprise ne peut porter de date — et la colonne « signal
   * actuel » reste à « aucun signal actuel » pour toujours, sans que rien
   * n'échoue. C'est exactement le défaut n°1 du dépôt.
   */
  it('passe le portefeuille et l’espace de l’appelant, pour que la date soit CALCULABLE', async () => {
    marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [] })
    const controller = build({
      accountsService: {
        listPortfolioLookups: jest
          .fn()
          .mockResolvedValue([
            { id: 'a-1', company_name: 'DECATHLON', website: 'https://decathlon.fr', registry_country: 'France' },
          ]),
      },
      workspaceContext: {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: 'admin' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('all'),
      },
    })

    await controller.marketContextSearch(USER, { technology: 'Java' } as never)

    expect(marketMemory.searchByFilters).toHaveBeenCalledWith(expect.anything(), {
      portfolio: [{ ref: 'a-1', name: 'DECATHLON', website: 'https://decathlon.fr', country: 'France' }],
      workspaceId: 'w-1',
    })
  })

  it('un portefeuille ILLISIBLE ne perd pas la recherche — elle part sans date', async () => {
    marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [] })
    const controller = build({
      accountsService: { listPortfolioLookups: jest.fn() },
      workspaceContext: {
        resolveActiveWorkspace: jest.fn().mockRejectedValue(new Error('espace illisible')),
        portfolioVisibilityOf: jest.fn(),
      },
    })

    const res = await controller.marketContextSearch(USER, { technology: 'Java' } as never)

    expect(res).toEqual({ status: 'ok', matches: [] })
    expect(marketMemory.searchByFilters).toHaveBeenCalledWith(expect.anything(), {
      portfolio: [],
      workspaceId: null,
    })
  })

  it('rend les MÊMES valeurs que le service — aucune seconde dérivation (copie superficielle pour la variance readonly→mutable)', async () => {
    const read = {
      status: 'ok',
      matches: [
        {
          companyName: 'DECATHLON',
          coverage: {
            covered: true,
            marketPaths: 41,
            esnObserved: [{ esnName: 'Capgemini', persons: 9, certainty: 'observed' }],
            observedStack: [{ techno: 'Java', persons: 7 }],
            roleFamilies: [{ family: 'Data', persons: 12 }],
            exEsnPresent: null,
            observedZone: null,
          },
        },
      ],
    }
    marketMemory.searchByFilters.mockResolvedValue(read)
    const res = await build().marketContextSearch(USER, { technology: 'Java' } as never)
    expect(res).toEqual(read)
  })

  it('#2288.2 — la DATE du signal traverse telle quelle, jamais recalculée ici', async () => {
    const read = {
      status: 'ok',
      matches: [
        {
          companyName: 'DECATHLON',
          coverage: {
            covered: true,
            marketPaths: 41,
            esnObserved: [],
            observedStack: [],
            roleFamilies: [],
            exEsnPresent: null,
            observedZone: null,
          },
          currentSignal: { nature: 'shared', observedMonth: '2026-08' },
        },
      ],
    }
    marketMemory.searchByFilters.mockResolvedValue(read)
    const res = await build().marketContextSearch(USER, { technology: 'Java' } as never)
    expect(res).toEqual(read)
  })

  it('⚠️ une PANNE de lecture n’est pas une liste vide — le statut `unavailable` traverse intact', async () => {
    marketMemory.searchByFilters.mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })
    const res = await build().marketContextSearch(USER, { technology: 'Java' } as never)
    expect(res).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })

  it('ne débite AUCUN crédit — le contrôleur n’a aucune dépendance vers les crédits', async () => {
    // Le constructeur ne prend QUE ces quatre-là : `CompaniesService`,
    // `MarketMemoryService`, et (#2288.2, `@Optional()`) `AccountsService` +
    // `WorkspaceContextService` — le portefeuille de l'appelant, pour dater.
    // Il n'y a structurellement pas de chemin vers un débit, et une cinquième
    // dépendance fait rougir ce test plutôt que de passer inaperçue.
    expect(CompaniesController.length).toBe(4)
  })
})
