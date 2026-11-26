import { TerritoryWatchService } from './territory-watch.service'

/**
 * Le chemin d'ÉCRITURE de la photo hebdomadaire.
 *
 * Il ne tourne qu'une fois par semaine, à cinq heures du matin : un défaut de
 * forme y resterait invisible jusqu'au lundi suivant, et la moyenne du score de
 * débordement se construirait avec un trou que personne ne verrait.
 */
describe('la photo hebdomadaire d’un territoire', () => {
  const overview = (over: Record<string, unknown> = {}) => ({
    department: '31',
    sinceDays: 90,
    market: { state: 'ready', reason: null, offers: 145, technologies: [{ term: 'java', count: 12 }] },
    competition: { state: 'ready', reason: null, esnPresent: 340 },
    accessible: { state: 'ready', reason: null, openTenders: 6, awardedContracts: 12, buyersWithIncumbent: 9 },
    overflow: { state: 'ready', reason: null, esn: [{ name: 'SII', offers: 8 }] },
    unknowns: [],
    ...over,
  })

  const make = (over: Record<string, unknown> = {}, existing: unknown = null) => {
    const saved: Record<string, unknown>[] = []
    const snapshots = {
      findOne: jest.fn().mockResolvedValue(existing),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => {
        saved.push(row)
        return row
      }),
      manager: { query: jest.fn().mockResolvedValue([]) },
    }
    const directory = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), manager: { query: jest.fn() } }
    const ia = { territoryOverview: jest.fn().mockResolvedValue(overview(over)) }
    const service = new TerritoryWatchService(
      snapshots as never,
      { manager: { query: jest.fn().mockResolvedValue([]) } } as never,
      directory as never,
      ia as never,
    )
    return { service, saved, snapshots }
  }

  it('enregistre les cinq mesures d’une semaine lisible', async () => {
    const { service, saved } = make()
    await expect(service.snapshot('31')).resolves.toBe(true)
    expect(saved[0]).toEqual(
      expect.objectContaining({
        department: '31',
        offers: 145,
        esnPresent: 340,
        openTenders: 6,
        awardedContracts: 12,
        buyersWithIncumbent: 9,
        esnHiring: [{ name: 'SII', offers: 8 }],
      }),
    )
  })

  it('écrit `null` — jamais 0 — sur un bloc indisponible', async () => {
    // C'est LA règle de la veille : une source en maintenance un lundi ne doit
    // pas se lire « le marché s'est effondré » le lundi suivant.
    const { service, saved } = make({
      market: { state: 'unavailable', reason: 'France Travail n’a pas répondu' },
      accessible: { state: 'unavailable', reason: 'DECP muet' },
    })
    await service.snapshot('31')
    expect(saved[0]).toEqual(
      expect.objectContaining({ offers: null, openTenders: null, awardedContracts: null, esnPresent: 340 }),
    )
  })

  it('ne compte pas deux fois la même semaine', async () => {
    // Rejouer le balayage doublerait le poids d'une semaine dans une médiane.
    const { service, saved } = make({}, { id: 'x' })
    await expect(service.snapshot('31')).resolves.toBe(false)
    expect(saved).toEqual([])
  })

  it('un département en échec n’arrête pas les autres', async () => {
    const { service } = make()
    jest.spyOn(service, 'snapshot').mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(true)
    jest.spyOn(service, 'followedDepartments').mockResolvedValue(['31', '69'])
    await expect(service.takeWeeklySnapshots()).resolves.toBeUndefined()
    expect(service.snapshot).toHaveBeenCalledTimes(2)
  })
})

/**
 * Le verrou du lundi matin.
 *
 * Ce qu'un double passage coûte n'est PAS une ligne en base : l'index unique
 * `(department, taken_on)` la refuse déjà. C'est l'appel à `territoryOverview`,
 * qui interroge quatre sources publiques PAR DÉPARTEMENT, et qui part AVANT
 * l'écriture — donc N répliques paient N fois la même semaine. Et la réplique
 * perdante journalise « Photo du département 31 manquée » sur une photo qui a
 * bel et bien été prise : un opérateur lit un échec qui n'existe pas.
 */
describe('la veille territoriale ne part qu’une fois par tick', () => {
  const makeWithLocks = (locks: unknown) => {
    const snapshots = { manager: { query: jest.fn().mockResolvedValue([]) } }
    const service = new TerritoryWatchService(
      snapshots as never,
      { manager: { query: jest.fn().mockResolvedValue([{ department: '31' }]) } } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { territoryOverview: jest.fn() } as never,
      locks as never,
    )
    jest.spyOn(service, 'snapshot').mockResolvedValue(true)
    return service
  }

  afterEach(() => {
    delete process.env['TERRITORY_WATCH_DISABLED']
  })

  it('demande le verrou nommé `territory-watch`', async () => {
    const withLock = jest.fn(async (_name: string, fn: () => Promise<void>) => {
      await fn()
      return true
    })
    const service = makeWithLocks({ withLock })
    await service.takeWeeklySnapshots()
    expect(withLock).toHaveBeenCalledTimes(1)
    expect(withLock.mock.calls[0]?.[0]).toBe('territory-watch')
    expect(service.snapshot).toHaveBeenCalledTimes(1)
  })

  it('ne prend AUCUNE photo quand une autre réplique tient le tick', async () => {
    // Le point du verrou : pas d'écriture, et surtout pas quatre interrogations
    // de sources publiques payées une seconde fois.
    const service = makeWithLocks({ withLock: jest.fn().mockResolvedValue(false) })
    await service.takeWeeklySnapshots()
    expect(service.snapshot).not.toHaveBeenCalled()
  })

  it('tourne quand même sans service de verrou — mono-instance inchangé', async () => {
    const service = makeWithLocks(undefined)
    await service.takeWeeklySnapshots()
    expect(service.snapshot).toHaveBeenCalledTimes(1)
  })

  it('le bris de glace passe AVANT le verrou', async () => {
    // Éteindre la veille ne doit pas consommer un tick de verrou : sinon
    // rallumer en cours de journée resterait sans effet jusqu'à expiration.
    process.env['TERRITORY_WATCH_DISABLED'] = 'true'
    const withLock = jest.fn()
    const service = makeWithLocks({ withLock })
    await service.takeWeeklySnapshots()
    expect(withLock).not.toHaveBeenCalled()
    expect(service.snapshot).not.toHaveBeenCalled()
  })
})
