import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WatchlistAccountGroup, WatchlistItem } from '../model/watchlist'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const { WatchlistTable } = await import('./WatchlistTable')

const group = (accountId: string, companyName: string, signals = 3): WatchlistAccountGroup => {
  const latest = {
    accountId,
    companyName,
    id: `s-${accountId}`,
    sector: 'Services',
    signalDate: '2026-10-10',
    signalLabel: `Recrute chez ${companyName}`,
    signalSource: 'Communiqué',
    signalType: 'Recrutement',
    score: 8,
    status: 'new',
    archived: false,
    firstDetectedAt: null,
    firstDetectionExact: false,
    lastSeenAt: null,
    changeCount: 0,
    resolved: false,
    resolvedAt: null,
    importance: null,
    triggeredActionLabel: null,
    lastVerifiedAt: null,
    temporalStatus: null,
    salesImplication: null,
    impact: null,
    logoUrl: null,
    website: null,
  } as WatchlistItem
  return {
    accountId,
    companyName,
    sector: 'Services',
    score: 8,
    latest,
    others: Array.from({ length: signals - 1 }, (_, i) => ({ ...latest, id: `${latest.id}-${i}` })),
    decisionMaker: null,
    discardReason: null,
    activeSignalCount: signals,
    totalSignalCount: signals,
    status: 'new',
  }
}

beforeEach(() => apiFetch.mockReset())

/** #4072.4 — la récurrence d'un signal par cible, comme la cloche, lue PAR LOT. */
describe('WatchlistTable — récurrence du signal (#4072.4)', () => {
  it('dit « 3e signal de recrutement en 30 jours » sur la cible concernée, en UNE requête pour toutes', async () => {
    apiFetch.mockResolvedValue({ recurrences: { 'a-1': { kind: 'hiring', count: 3, windowDays: 30 } } })
    renderWithRouter(
      <WatchlistTable groups={[group('a-1', 'Nordia'), group('a-2', 'Datafab')]} onSelect={vi.fn()} />,
      '/watchlist',
    )
    expect((await screen.findAllByText('3e signal de recrutement en 30 jours')).length).toBeGreaterThan(0)
    const calls = apiFetch.mock.calls.filter(([arg]) => String(arg.path).includes('/account-facts/recurrence'))
    expect(calls).toHaveLength(1)
    expect(String(calls[0]?.[0].path)).toContain('a-1,a-2')
  })

  it('sait dire NON : sans récurrence (ou à 1), aucune ligne — jamais « 0e » ni « 1er »', async () => {
    apiFetch.mockResolvedValue({ recurrences: { 'a-1': { kind: 'hiring', count: 1, windowDays: 30 } } })
    renderWithRouter(<WatchlistTable groups={[group('a-1', 'Nordia')]} onSelect={vi.fn()} />, '/watchlist')
    await screen.findAllByText('Recrute chez Nordia')
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByText(/signal de recrutement en/)).not.toBeInTheDocument()
  })

  // #4088 R25 — « 29e signal en 30 jours » pour UN signal listé : compteur ≠ liste.
  it('SAIT DIRE NON : un rang supérieur au nombre de signaux de la ligne ne s’affiche pas', async () => {
    apiFetch.mockResolvedValue({ recurrences: { 'a-9': { kind: 'hiring', count: 29, windowDays: 30 } } })
    renderWithRouter(<WatchlistTable groups={[group('a-9', 'Nordia', 1)]} onSelect={vi.fn()} />, '/watchlist')
    await screen.findAllByText('Recrute chez Nordia')
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByText(/e signal de recrutement en/)).not.toBeInTheDocument()
  })
})
