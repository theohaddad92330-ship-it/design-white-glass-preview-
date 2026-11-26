import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

const { registry, signals } = vi.hoisted(() => ({ registry: vi.fn(), signals: vi.fn() }))
vi.mock('@/features/discover/api/discover-api', () => ({ discoverApi: { registry, signals } }))

const { useDiscoverSearch, DISCOVER_SEARCH_CEILING_MS } = await import('./useDiscoverSearch')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const EMPTY = { candidates: [], query: {}, degraded: [] }

beforeEach(() => {
  registry.mockReset()
  signals.mockReset()
})

describe('useDiscoverSearch', () => {
  it('fires nothing until the rep explicitly runs a search', () => {
    renderHook(() => useDiscoverSearch(null), { wrapper })
    expect(registry).not.toHaveBeenCalled()
    expect(signals).not.toHaveBeenCalled()
  })

  it('calls the registry endpoint in registry mode', async () => {
    registry.mockResolvedValue(EMPTY)
    const { result } = renderHook(
      () => useDiscoverSearch({ mode: 'registry', query: { filters: { department: '75' }, limit: 24 } }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(registry).toHaveBeenCalledWith({ filters: { department: '75' }, limit: 24 }, expect.anything())
    expect(signals).not.toHaveBeenCalled()
  })

  it('calls the signals endpoint in signals mode', async () => {
    signals.mockResolvedValue(EMPTY)
    const { result } = renderHook(
      () => useDiscoverSearch({ mode: 'signals', query: { sources: ['tender'], sinceDays: 30, limit: 24 } }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(signals).toHaveBeenCalled()
    expect(registry).not.toHaveBeenCalled()
  })

  it('exposes the response, degraded sources included', async () => {
    registry.mockResolvedValue({ ...EMPTY, degraded: [{ source: 'BOAMP', reason: 'timeout' }] })
    const { result } = renderHook(() => useDiscoverSearch({ mode: 'registry', query: { filters: {}, limit: 24 } }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.degraded).toEqual([{ source: 'BOAMP', reason: 'timeout' }])
  })

  /* --- La règle : une panne se voit, elle ne devient jamais une liste vide --- */

  it('surfaces a transport failure as an error state rather than empty results', async () => {
    registry.mockImplementation(() => Promise.reject(new Error('502')))
    const { result } = renderHook(() => useDiscoverSearch({ mode: 'registry', query: { filters: {}, limit: 24 } }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('does not retry a failed run', async () => {
    registry.mockImplementation(() => Promise.reject(new Error('502')))
    const { result } = renderHook(() => useDiscoverSearch({ mode: 'registry', query: { filters: {}, limit: 24 } }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(registry).toHaveBeenCalledTimes(1)
  })

  it('re-runs when the query changes', async () => {
    registry.mockResolvedValue(EMPTY)
    const { result, rerender } = renderHook(
      ({ dept }: { dept: string }) =>
        useDiscoverSearch({ mode: 'registry', query: { filters: { department: dept }, limit: 24 } }),
      { wrapper, initialProps: { dept: '75' } },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ dept: '69' })
    await waitFor(() => expect(registry).toHaveBeenCalledTimes(2))
  })

  /* --- #3874.6 (recette prod 08/10) — deux lancements rapides ne mélangent
     jamais leurs réponses : une réponse TARDIVE d'une ancienne combinaison de
     critères ne doit jamais réécrire le résultat affiché pour la combinaison
     COURANTE. `queryKey` dérive du contenu exact de la requête (une entrée de
     cache par combinaison) ; ce test verrouille l'EFFET observable, pas
     seulement la clé. */
  it('#3874.6 — une réponse tardive de la recherche précédente ne remplace jamais le résultat de la recherche courante', async () => {
    let resolveFirst: (value: typeof EMPTY) => void = () => {}
    registry.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve
        }),
    )
    registry.mockImplementationOnce(() => Promise.resolve({ ...EMPTY, query: { filters: { department: '69' } } }))

    const { result, rerender } = renderHook(
      ({ dept }: { dept: string }) =>
        useDiscoverSearch({ mode: 'registry', query: { filters: { department: dept }, limit: 24 } }),
      { wrapper, initialProps: { dept: '75' } },
    )
    // La seconde recherche (critère différent) part AVANT que la première ait répondu.
    rerender({ dept: '69' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.query).toEqual({ filters: { department: '69' } })

    // La réponse tardive de la PREMIÈRE recherche arrive enfin — elle ne doit
    // rien écraser : l'utilisateur regarde déjà la seconde combinaison.
    resolveFirst(EMPTY)
    await Promise.resolve()
    expect(result.current.data?.query).toEqual({ filters: { department: '69' } })
  })
})

// #4312 — revenir de Laura sur /discover rouvre la liste SANS refaire l'appel : le cache de la recherche
// survit au démontage de l'écran (et à la fraîcheur de 5 min), la clé de cache EST la requête.
describe('useDiscoverSearch — retour sur l’écran (#4312)', () => {
  it('une recherche déjà lue n’est pas refaite quand l’écran se remonte', async () => {
    registry.mockResolvedValue(EMPTY)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const request = { mode: 'registry', query: { filters: { department: '75' }, limit: 24 } } as const
    const first = renderHook(() => useDiscoverSearch(request), { wrapper: shared })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount()
    // Plus de 5 minutes plus tard (donnée périmée au sens de react-query), l'écran se remonte.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 20 * 60_000)
    const second = renderHook(() => useDiscoverSearch(request), { wrapper: shared })
    expect(second.result.current.data).toEqual(EMPTY)
    await Promise.resolve()
    vi.useRealTimers()
    expect(registry).toHaveBeenCalledTimes(1)
  })
})

// #4363.3 — les premières entreprises s'affichent AVANT la fin des enrichissements de la liste complète.
describe('useDiscoverSearch — premier lot (#4363.3)', () => {
  const lotOf = (names: string[]) => ({ ...EMPTY, candidates: names.map(name => ({ name, siren: name })) })
  const request = { mode: 'registry', query: { filters: { department: '75' }, limit: 24 } } as const

  it('#4517 — le premier lot n’est PAS rendu : rien à l’écran avant la liste complète, qui arrive d’un coup', async () => {
    let resolveFull: (value: unknown) => void = () => {}
    registry.mockImplementation((query: { limit: number }) =>
      query.limit === 5
        ? Promise.resolve(lotOf(['A', 'B']))
        : new Promise(resolve => {
            resolveFull = resolve
          }),
    )
    const { result } = renderHook(() => useDiscoverSearch(request, { firstLot: 5 }), { wrapper })

    await waitFor(() => expect(registry).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(result.current.data).toBeUndefined()
    expect(result.current.isFetching).toBe(true)

    resolveFull(lotOf(['A', 'B', 'C', 'D']))
    await waitFor(() => expect(result.current.data?.candidates).toHaveLength(4))
    expect(result.current.data?.partial).toBeUndefined()
  })

  it('lot Q — la liste du premier passage reste affichée PENDANT le second appel, qui la complète en arrière-plan', async () => {
    const cut = {
      ...lotOf(['A']),
      degraded: [{ source: 'recherche-entreprises', reason: 'time_budget' }],
    }
    let resolveSecond: (value: unknown) => void = () => {}
    let calls = 0
    registry.mockImplementation(() => {
      calls += 1
      return calls === 1
        ? Promise.resolve(cut)
        : new Promise(resolve => {
            resolveSecond = resolve
          })
    })
    const { result } = renderHook(() => useDiscoverSearch(request), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Second appel EN VOL : la liste est déjà là, marquée « en cours », jamais vidée ni bloquée.
    expect(registry).toHaveBeenCalledTimes(2)
    expect(result.current.data?.candidates).toHaveLength(1)
    expect(result.current.data?.completing).toBe(true)

    resolveSecond({ ...lotOf(['A', 'B']), degraded: [] })
    await waitFor(() => expect(result.current.data?.candidates).toHaveLength(2))
    expect(result.current.data?.degraded).toEqual([])
    expect(result.current.data?.completing).toBeUndefined()
  })

  it('#4517 — le second passage qui échoue laisse la liste du premier, sans erreur', async () => {
    const cut = { ...lotOf(['A']), degraded: [{ source: 'recherche-entreprises', reason: 'time_budget' }] }
    registry.mockResolvedValueOnce(cut).mockRejectedValueOnce(new Error('502'))
    const { result } = renderHook(() => useDiscoverSearch(request), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.data?.completing).toBe(false))
    expect(result.current.data?.candidates).toHaveLength(1) // jamais vidée
  })

  it('sait dire NON : sans `firstLot`, un seul appel et jamais de `partial`', async () => {
    registry.mockResolvedValue(lotOf(['A']))
    const { result } = renderHook(() => useDiscoverSearch(request), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(registry).toHaveBeenCalledTimes(1)
    expect(result.current.data?.partial).toBeUndefined()
  })

  it('#5212 — une recherche par compétence ne lance PAS le premier lot : un seul appel registre', async () => {
    registry.mockResolvedValue(lotOf(['A']))
    const bySkill = { mode: 'registry', query: { filters: { keywords: ['java'] as string[] }, limit: 25 } } as const
    const { result } = renderHook(() => useDiscoverSearch(bySkill, { firstLot: 5 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(registry).toHaveBeenCalledTimes(1)
    expect(registry.mock.calls[0]?.[0]).toMatchObject({ limit: 25 })
  })

  it.each([
    ['texte libre « Java » (lu en compétence par le moteur)', { freetext: 'Java' }],
    ['technologie observée', { technologiesObserved: ['java'] }],
  ])('#5212 — %s : pas de premier lot, un seul appel registre', async (_label, filters) => {
    registry.mockResolvedValue(lotOf(['A']))
    const request = { mode: 'registry', query: { filters, limit: 25 } } as const
    const { result } = renderHook(() => useDiscoverSearch(request, { firstLot: 5 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(registry).toHaveBeenCalledTimes(1)
  })

  it('#5212 — sans compétence, le premier lot part encore en parallèle (2 appels)', async () => {
    registry.mockResolvedValue(lotOf(['A']))
    const plain = {
      mode: 'registry',
      query: { filters: { department: '75', keywords: [] as string[] }, limit: 25 },
    } as const
    const { result } = renderHook(() => useDiscoverSearch(plain, { firstLot: 5 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(registry).toHaveBeenCalledTimes(2)
  })

  it('le lot court qui échoue se tait : la liste complète fait foi', async () => {
    registry.mockImplementation((query: { limit: number }) =>
      query.limit === 5 ? Promise.reject(new Error('502')) : Promise.resolve(lotOf(['A', 'B', 'C'])),
    )
    const { result } = renderHook(() => useDiscoverSearch(request, { firstLot: 5 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.candidates).toHaveLength(3)
  })
  it('#4962 — une recherche sans réponse ne tourne jamais sans fin : elle échoue en disant `discover_timeout`', async () => {
    vi.useFakeTimers()
    try {
      registry.mockImplementation(() => new Promise(() => undefined))
      const { result } = renderHook(() => useDiscoverSearch(request), { wrapper })
      await vi.advanceTimersByTimeAsync(DISCOVER_SEARCH_CEILING_MS.registry + 1_000)
      await vi.waitFor(() => expect(result.current.isError).toBe(true))
      expect((result.current.error as { code?: string }).code).toBe('discover_timeout')
    } finally {
      vi.useRealTimers()
    }
  })
})
