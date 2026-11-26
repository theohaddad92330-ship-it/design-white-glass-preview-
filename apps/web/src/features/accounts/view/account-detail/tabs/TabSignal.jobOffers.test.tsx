import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'

/**
 * #5000.1 #5000.2 — `AccountJobOffersPanel` (type de contrat par offre) n'avait AUCUN appelant : la Veille du
 * compte doit le MONTER, sous « Tous » et sous « Recrutements » — pas sous les autres catégories.
 */
const filters = vi.hoisted(() => ({ category: 'all' as string }))

vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({
  useHiringDomainProfileState: () => ({ profile: null, failed: false }),
}))
vi.mock('@/features/accounts/hooks/useAccountCrmSignals', () => ({ useAccountCrmSignals: () => [] }))
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: undefined }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined }),
}))
vi.mock('@/features/accounts/hooks/useAccountRecentHires', () => ({
  useAccountRecentHires: () => ({ data: undefined, isError: false }),
}))
vi.mock('@/features/accounts/model/watchData', () => ({
  buildAccountWatchData: () => ({ scenario: 'none', signals: [], hypotheses: [] }),
  buildInsights: () => [],
}))
vi.mock('./opportunities/useLeadCoveredFacts', () => ({ useLeadCoveredFacts: () => [] }))
vi.mock('../components/SignalFreshnessLine', () => ({ SignalFreshnessLine: () => null }))
vi.mock('../components/SegmentStaleCollectionNotice', () => ({ SegmentStaleCollectionNotice: () => null }))
vi.mock('./veille/DeclareLinkedInSignalDialog', () => ({ DeclareLinkedInSignalDialog: () => null }))
vi.mock('./veille/WatchFilters', () => ({
  WatchFilters: ({ children }: { children: (api: Record<string, unknown>) => React.ReactNode }) =>
    children({ filteredSignals: [], activeCategory: filters.category, narrowed: false, openCategory: () => {} }),
}))
vi.mock('./veille/WatchInsightsPanel', () => ({ WatchInsightsPanel: () => null }))
vi.mock('./veille/WatchOverviewStats', () => ({ WatchOverviewStats: () => null }))
vi.mock('./veille/WatchHiringTrendPanel', () => ({ WatchHiringTrendPanel: () => null }))
vi.mock('./veille/WatchRecentHiresPanel', () => ({ WatchRecentHiresPanel: () => null }))
vi.mock('./veille/WatchHypothesesPanel', () => ({ WatchHypothesesPanel: () => null }))
vi.mock('./veille/OffersCascadeNotice', () => ({ OffersCascadeNotice: () => null }))
vi.mock('./veille/WatchSignalTimeline', () => ({ WatchSignalTimeline: () => null }))
vi.mock('./veille/AccountHistoryFactsSection', () => ({ AccountHistoryFactsSection: () => null }))
vi.mock('./veille/WatchSourcesPanel', () => ({ WatchSourcesPanel: () => null }))
vi.mock('./veille/AccountJobOffersPanel', () => ({
  AccountJobOffersPanel: ({ accountId }: { accountId: string }) => <div data-testid="job-offers">{accountId}</div>,
}))

const { TabSignal } = await import('./TabSignal')

const account = { id: 'a-1', raw_analysis: null } as unknown as Account
const mount = () =>
  render(<TabSignal account={account} isPersisting={false} onAddToPlan={() => {}} onCreateAngle={() => {}} />)

describe('TabSignal — les offres d’emploi du compte (#5000.1 / #5000.2)', () => {
  it('monte le panneau des offres sous « Tous » et « Recrutements »', () => {
    for (const category of ['all', 'recruitments']) {
      filters.category = category
      const { unmount } = mount()
      expect(screen.getByTestId('job-offers').textContent).toBe('a-1')
      unmount()
    }
  })

  it('NON : pas sous une autre catégorie', () => {
    filters.category = 'tenders'
    mount()
    expect(screen.queryByTestId('job-offers')).toBeNull()
  })
})
