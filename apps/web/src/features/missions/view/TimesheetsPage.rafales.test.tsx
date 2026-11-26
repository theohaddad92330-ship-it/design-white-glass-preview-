import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * perf P6 (29/09/2026) — `/missions/cra` demandait `timesheets/reminders` et
 * `timesheets/escalations` DEUX fois : une fois « sans mois » (le mois du
 * relevé n'était pas encore arrivé), puis une fois avec `data.month`. Ce test
 * monte l'écran avec les vrais hooks et `apiFetch` espionné.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
vi.mock('@/components/access/useRouteAccess', () => ({ useRouteAccess: () => ({ state: 'ready', missing: [] }) }))
vi.mock('@/components/access/CapabilityBanner', () => ({ CapabilityBanner: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

const { TimesheetsPage } = await import('./TimesheetsPage')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('/missions/cra — appels en double', () => {
  it('ne lit relances et escalades qu’une fois, pour le mois du relevé', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('/delivery/timesheets/reminders')) return { channel: { kind: 'none' }, items: [] }
      if (path.startsWith('/delivery/timesheets/escalations')) return []
      return { month: '2026-08', items: [], summary: { total: 0 } }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TimesheetsPage />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(apiFetch.mock.calls.some(([a]) => (a as { path: string }).path.includes('reminders'))).toBe(true),
    )
    await new Promise(resolve => setTimeout(resolve, 50))
    const paths = apiFetch.mock.calls.map(([a]) => (a as { path: string }).path)
    const pick = (needle: string) => paths.filter(path => path.includes(needle))
    expect(pick('timesheets/reminders')).toEqual(['/delivery/timesheets/reminders?month=2026-08'])
    expect(pick('timesheets/escalations')).toEqual(['/delivery/timesheets/escalations?month=2026-08'])
  })
})
