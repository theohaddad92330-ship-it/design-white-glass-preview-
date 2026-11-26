import type { TerritorySnapshot } from '@bellum/contracts'
import { MarketWatchController } from './market-watch.controller'

/**
 * L'ÉCRAN MARCHÉ — CE QUE CHAQUE CHIFFRE PORTE AVEC LUI.
 *
 * Ce fichier n'existait pas, et c'est exactement pour cette raison que « Offres
 * IT : 100 » a pu s'afficher pendant des semaines comme un dénombrement sur deux
 * départements différents. Le contrôleur recopiait `latest.offers` dans la
 * réponse ; rien ne testait ce que ce nombre VAUT.
 */
describe('l’écran Marché — chaque mesure porte sa borne, sa date et sa destination', () => {
  const photo = (over: Partial<TerritorySnapshot> = {}): TerritorySnapshot => ({
    takenOn: '2026-08-24',
    offers: 42,
    esnPresent: 340,
    openTenders: 6,
    awardedContracts: 12,
    esnHiring: [],
    collectionLimits: { offers: 100, esnPresent: 10_000, openTenders: 50, awardedContracts: 50 },
    ...over,
  })

  const make = (history: TerritorySnapshot[], opts: { demo?: boolean } = {}) => {
    const subscriptions = {
      find: jest.fn().mockResolvedValue([{ department: '31' }]),
      manager: {
        query: jest.fn(async (sql: string) => {
          if (/FROM accounts/.test(sql)) return [{ here: 3, with_site: 11 }]
          if (/partner_relations/.test(sql)) return [{ name: 'Astréa' }]
          return []
        }),
      },
    }
    const snapshots = { findOne: jest.fn().mockResolvedValue({ topTechnologies: [{ term: 'java', count: 12 }] }) }
    const watch = { history: jest.fn().mockResolvedValue(history) }
    const directory = {
      coverage: jest.fn().mockResolvedValue({ total: 477, resolved: 312, byStatus: {} }),
      departmentBreakdown: jest.fn().mockResolvedValue({
        known: 18,
        bySize: [{ sizeClass: 'eti', count: 12 }],
        byOpenness: [{ openness: 'inconnu', count: 18 }],
        entries: [],
      }),
      factsByName: jest.fn().mockResolvedValue(new Map([['astrea', { headquartersDepartment: '31' }]])),
    }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
    }
    return {
      controller: new MarketWatchController(
        subscriptions as never,
        snapshots as never,
        watch as never,
        directory as never,
        workspaceContext as never,
      ),
      watch,
      directory,
    }
  }

  const measureOf = (result: Awaited<ReturnType<MarketWatchController['marketWatch']>>, key: string) =>
    result.territories[0]?.measures.find(measure => measure.key === key)

  it('DIT que « 100 offres » est un plafond, pas un dénombrement', async () => {
    // La faute d'origine : la collecte s'arrête à 100 (`list_hiring_companies(…,
    // 100)`), et l'écran affichait « 100 » sur deux départements incomparables.
    const { controller } = make([photo({ offers: 100 })])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')).toEqual(
      expect.objectContaining({ value: 100, bounded: true, ceiling: 100, registry: 'France Travail' }),
    )
  })

  it('ne borne PAS un chiffre qui n’a pas atteint son plafond', async () => {
    const { controller } = make([photo({ offers: 42 })])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')).toEqual(expect.objectContaining({ value: 42, bounded: false }))
  })

  it('rend `null` — jamais 0 — quand la source n’a pas répondu', async () => {
    const { controller } = make([photo({ openTenders: null })])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'openTenders')?.value).toBeNull()
  })

  it('nomme la DATE de la photo qui porte le chiffre', async () => {
    const { controller } = make([photo({ takenOn: '2026-08-24' })])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')?.observedOn).toBe('2026-08-24')
  })

  it('donne à chaque mesure une DESTINATION cadrée sur le territoire', async () => {
    // « 8 appels d'offres ouverts » doit ouvrir ces appels d'offres — donc
    // l'écran Découvrir filtré sur les annonces BOAMP de CE département.
    const { controller } = make([photo()])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'openTenders')?.target).toEqual({
      kind: 'route',
      route: '/discover',
      search: { signals: 'tender', department: '31' },
    })
    expect(measureOf(result, 'esnPresent')?.target).toEqual({ kind: 'panel', panel: 'esn' })
  })

  it('ne prétend à AUCUNE tendance sur une seule photo — et surtout pas « +0 »', async () => {
    const { controller } = make([photo()])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')?.trend).toEqual({ measured: false, gap: 'no_previous_snapshot' })
  })

  it('REFUSE la tendance entre deux mesures BORNÉES', async () => {
    // « 100 → 100 » n'est pas une stabilité : ce sont deux plafonds.
    const { controller } = make([
      photo({ takenOn: '2026-08-17', offers: 100 }),
      photo({ takenOn: '2026-08-24', offers: 100 }),
    ])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')?.trend).toEqual({ measured: false, gap: 'bounded_reading' })
  })

  it('lit la tendance quand les deux mesures sont de vrais dénombrements', async () => {
    const { controller } = make([
      photo({ takenOn: '2026-08-17', openTenders: 10 }),
      photo({ takenOn: '2026-08-24', openTenders: 15 }),
    ])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'openTenders')?.trend).toEqual(
      expect.objectContaining({ measured: true, change: 5, percent: 50 }),
    )
  })

  // #2206.42 — l'horizon STRUCTUREL, entre la plus ANCIENNE photo et la plus
  // RÉCENTE, distinct de `trend` (les deux dernières).
  it('l’horizon STRUCTUREL dit « pas assez de recul » sur une seule photo', async () => {
    const { controller } = make([photo()])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')?.structuralTrend).toEqual({ measured: false, gap: 'not_enough_history' })
  })

  it('l’horizon STRUCTUREL mesure depuis la plus ANCIENNE photo, pas l’avant-dernière', async () => {
    const { controller } = make([
      photo({ takenOn: '2026-05-01', offers: 40 }),
      photo({ takenOn: '2026-08-10', offers: 60 }), // un point du milieu, ignoré par le structurel
      photo({ takenOn: '2026-08-24', offers: 90 }),
    ])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')?.structuralTrend).toEqual(
      expect.objectContaining({ measured: true, from: 40, to: 90, fromDate: '2026-05-01', toDate: '2026-08-24' }),
    )
    // L'horizon ACTUEL, lui, ne voit que les deux dernières — inchangé.
    expect(measureOf(result, 'offers')?.trend).toEqual(
      expect.objectContaining({ measured: true, from: 60, to: 90, fromDate: '2026-08-10', toDate: '2026-08-24' }),
    )
  })

  it('l’horizon STRUCTUREL refuse aussi sur un fond de moins de 30 jours', async () => {
    const { controller } = make([
      photo({ takenOn: '2026-08-10', offers: 70 }),
      photo({ takenOn: '2026-08-17', offers: 80 }),
      photo({ takenOn: '2026-08-24', offers: 90 }),
    ])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(measureOf(result, 'offers')?.structuralTrend).toEqual({ measured: false, gap: 'not_enough_history' })
  })

  it('accompagne le référentiel de sa COUVERTURE — jamais un compte nu', async () => {
    const { controller } = make([photo()])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(result.territories[0]?.esn).toEqual(expect.objectContaining({ known: 18, resolved: 312, total: 477 }))
  })

  it('rend le portefeuille AVEC son dénominateur', async () => {
    // « 3 comptes ici » sans « sur 11 comptes qui ont un site déclaré » se lit
    // « je n'ai que trois comptes », ce qui est faux.
    const { controller } = make([photo()])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(result.territories[0]?.portfolio).toEqual({ accountsHere: 3, accountsWithSite: 11, partnersHere: 1 })
  })

  it('lit les photos de la SALLE pour la salle, et celles du balayage pour un client', async () => {
    // Les deux jeux coexistent dans la même table partagée : un client ne doit
    // jamais voir un décor, et la salle ne doit jamais montrer un chiffre
    // qu'elle n'a pas fabriqué.
    const client = make([photo()])
    await client.controller.marketWatch({ userId: 'u1' } as never)
    expect(client.watch.history).toHaveBeenCalledWith('31', expect.any(Number), 'sweep')

    const demo = make([photo()], { demo: true })
    await demo.controller.marketWatch({ userId: 'u1' } as never)
    expect(demo.watch.history).toHaveBeenCalledWith('31', expect.any(Number), 'demo')
  })

  it('ne lit RIEN quand aucun territoire n’est suivi', async () => {
    const { controller, directory } = make([])
    ;(controller as unknown as { subscriptions: { find: jest.Mock } }).subscriptions.find.mockResolvedValue([])
    const result = await controller.marketWatch({ userId: 'u1' } as never)
    expect(result.territories).toEqual([])
    expect(directory.coverage).not.toHaveBeenCalled()
  })
})
