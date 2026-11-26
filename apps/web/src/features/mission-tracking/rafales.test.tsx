import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * perf P6 (29/09/2026) — `/missions/suivi` partait 41 appels au rechargement,
 * dont `finance/margin` ×7 et `invoice-readiness` ×13 : la lecture « sans
 * mois » du serveur (= mois précédent) et la même lecture nommée par la
 * fenêtre de 12 mois / la tendance de 6 mois avaient DEUX clés de cache pour
 * UNE réponse. Ce test monte les hooks réels de l'écran avec `apiFetch`
 * espionné et compte les appels par chemin : aucun chemin identique deux fois.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))

const { useMissionTrackingData } = await import('./rows')
const { useAggregateMargin } = await import('@/features/missions/api')
const { ProfitabilityPanel } = await import('./view/ProfitabilityPanel')

const NOW = new Date('2026-09-29T09:00:00Z')

function Screen() {
  useMissionTrackingData(NOW)
  useAggregateMargin()
  return <ProfitabilityPanel now={NOW} />
}

// L'horloge système suit NOW : `useAggregateMargin()` lit le mois courant réel, et le
// 1er octobre il est sorti de la fenêtre figée au 29/09 (un appel de plus, 7 au lieu de 6).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('/missions/suivi — appels en double', () => {
  it('ne demande jamais deux fois le même chemin', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('/delivery/invoice-readiness')) return { items: [], canReadFinance: false }
      if (path.startsWith('/delivery/missions')) return { missions: [], canReadFinance: false, items: [] }
      return { items: [], missions: [] }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 50))

    const perMonthPath = (path: string) => path.split('?')[0]?.replace(/\/$/, '') ?? path
    const paths = apiFetch.mock.calls.map(([args]) => (args as { path: string }).path)
    const counts = new Map<string, number>()
    for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1)
    const doubled = [...counts].filter(([, count]) => count > 1)
    expect(doubled).toEqual([])

    // Et le mois par défaut du serveur (`month` absent) ne repart plus en plus
    // des mois nommés : ni `margin` sans mois, ni `invoice-readiness` sans mois.
    expect(paths.filter(path => perMonthPath(path) === path && path.includes('finance/margin'))).toEqual([])
    expect(paths.filter(path => path === '/delivery/invoice-readiness')).toEqual([])
    expect(paths.filter(path => path.startsWith('/delivery/finance/margin?')).length).toBe(6)
    // BELLUM-WEB-2 (20/10/2026) — la fenêtre de 12 mois part en UN appel groupé, plus en douze
    // `GET ?month=` : il ne reste que la lecture du mois de l'écran.
    const windowCalls = paths.filter(path => path.startsWith('/delivery/invoice-readiness/collections?'))
    expect(windowCalls).toHaveLength(1)
    expect(new URLSearchParams(windowCalls[0]?.split('?')[1]).get('months')?.split(',')).toHaveLength(12)
    expect(paths.filter(path => path.startsWith('/delivery/invoice-readiness?')).length).toBe(1)
  })
})
