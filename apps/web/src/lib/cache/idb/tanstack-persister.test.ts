import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getCacheDb = vi.fn()
vi.mock('./schema', () => ({ getCacheDb: () => getCacheDb() }))

const { createIndexedDbPersister, clearPersistedQueryCache } = await import('./tanstack-persister')

const never = new Promise<never>(() => {})

describe('createIndexedDbPersister — restoreClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getCacheDb.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the persisted snapshot when the read is quick', async () => {
    const snapshot = { timestamp: 1, buster: '', clientState: { mutations: [], queries: [] } }
    getCacheDb.mockResolvedValue({ get: vi.fn().mockResolvedValue(snapshot) })

    await expect(createIndexedDbPersister().restoreClient()).resolves.toEqual(snapshot)
  })

  it('gives up when the DB open hangs', async () => {
    getCacheDb.mockReturnValue(never)

    const restored = createIndexedDbPersister().restoreClient()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(restored).resolves.toBeUndefined()
  })

  it('gives up when the READ hangs — not just the open', async () => {
    // `PersistQueryClientProvider` holds `isRestoring: true` until this resolves,
    // and that pauses EVERY `useQuery` in the app. The timeout used to guard only
    // `getCacheDb()`, leaving `db.get()` unbounded: a stalled read froze every
    // screen behind the shared page gate with no ceiling and no way out.
    getCacheDb.mockResolvedValue({ get: vi.fn().mockReturnValue(never) })

    const restored = createIndexedDbPersister().restoreClient()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(restored).resolves.toBeUndefined()
  })

  it('gives up when open and read are each fast but together exceed the budget', async () => {
    getCacheDb.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ get: () => new Promise(() => {}) }), 2_000)),
    )

    const restored = createIndexedDbPersister().restoreClient()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(restored).resolves.toBeUndefined()
  })
})

// #3068 / SG — un ré-semis serveur est API-only : il ne touche pas l'instantané
// déjà écrit dans IndexedDB. Un visiteur qui reprend la MÊME salle (bail repris,
// ou salle recyclée) porte donc la MÊME clé d'instantané d'une visite à l'autre
// alors que le contenu serveur vient de changer — voir DemoEntryPage/useDemoAccessForm.
describe('clearPersistedQueryCache', () => {
  beforeEach(() => {
    vi.useRealTimers()
    getCacheDb.mockReset()
  })

  it('efface uniquement l’instantané de CETTE identité, jamais tout le magasin', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    getCacheDb.mockResolvedValue({ delete: del })

    await clearPersistedQueryCache('user-42')

    expect(del).toHaveBeenCalledWith('tanstack_query', 'query-client:user-42')
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('n’explose jamais si IndexedDB est indisponible', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCacheDb.mockRejectedValue(new Error('boom'))

    await expect(clearPersistedQueryCache('user-42')).resolves.toBeUndefined()
  })

  it('#3468 — une IndexedDB qui ne répond pas ne fige pas l’entrée en démo', async () => {
    // Une session prod ouverte dans un autre onglet peut tenir la base (montée
    // de version bloquée) : l'ouverture ne se résout alors JAMAIS, et le bouton
    // « Accéder à la démo » tournait sans fin alors que `redeem()` avait réussi.
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getCacheDb.mockReturnValue(never)

    const done = clearPersistedQueryCache('user-42')
    await vi.advanceTimersByTimeAsync(3000)

    await expect(done).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
