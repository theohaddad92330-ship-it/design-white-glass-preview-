import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import type { SearchHistoryEntry } from '@/features/discover/lib/discover-search-history'
import { DiscoverHistory } from './DiscoverHistory'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
const targetLists = vi.hoisted(() => ({ data: [] as unknown[] }))
vi.mock('@/features/target-lists/api', () => ({ useTargetLists: () => targetLists }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}${options?.name ?? ''}${options?.source ? `[${String(options.source)}]` : ''}`,
    i18n: { language: 'fr' },
  }),
}))

const entry: SearchHistoryEntry = {
  id: 'h1',
  at: Date.UTC(2026, 9, 19),
  filters: { ...emptyUnifiedFilters(), keywords: 'SAP', technologiesObserved: 'SAP', city: 'Lyon' },
}

function search(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 's1',
    label: 'ETI industrielles 69/38',
    filters: emptyUnifiedFilters(),
    savedAt: Date.parse('2026-09-01T08:00:00.000Z'),
    objective: null,
    alertFrequency: 'manual',
    alertChannel: null,
    resultType: null,
    newItems: null,
    sourceKinds: [],
    lastRunAt: null,
    ownerId: 'u1',
    ownerName: null,
    shared: false,
    ...overrides,
  }
}

function renderPage(props: Partial<React.ComponentProps<typeof DiscoverHistory>> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onReplayHistory: vi.fn(),
    onApplySearch: vi.fn(),
    onDeleteSearch: vi.fn(),
    onCreateTarget: vi.fn(),
  }
  render(<DiscoverHistory history={[]} searches={[]} savedStatus="ready" {...handlers} {...props} />)
  return handlers
}

describe('DiscoverHistory — Mes recherches (Théo decouvrir-historique)', () => {
  it('SAIT DIRE NON : sans recherche passée, une phrase d’état vide et aucune liste', () => {
    renderPage()
    expect(screen.queryByTestId('discover-search-history')).toBeNull()
    expect(screen.getByText('mySearches.recentEmpty')).toBeInTheDocument()
    expect(screen.getByText('mySearches.savedEmptyTitle')).toBeInTheDocument()
  })

  it('liste une recherche récente en mots et la reprend au clic (#4313.1)', async () => {
    const { onReplayHistory } = renderPage({ history: [entry] })
    expect(screen.getByText(/SAP · Lyon/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'mySearches.resume' }))
    expect(onReplayHistory).toHaveBeenCalledWith(entry)
  })

  it('n’écrit jamais « 0 compte » quand le résultat enregistré n’est pas mesuré', () => {
    renderPage({ history: [entry] })
    expect(screen.queryByText(/mySearches\.savedCount/)).toBeNull()
  })

  it('« Revenir à Découvrir » et « Nouvelle recherche » ramènent à la recherche', async () => {
    const { onBack } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'mySearches.back' }))
    await userEvent.click(screen.getByRole('button', { name: 'mySearches.newSearch' }))
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('affiche l’objectif quand il a été écrit (#2151.3), rien sinon', () => {
    renderPage({ searches: [search({ objective: 'Ouvrir trois comptes industriels' })] })
    expect(screen.getByText('Ouvrir trois comptes industriels')).toBeInTheDocument()
    renderPage({ searches: [search({ objective: null })] })
    expect(screen.getAllByTestId('saved-search-objective')).toHaveLength(1)
  })

  it('dit « jamais rejouée » plutôt que de retomber sur la date d’enregistrement (#2151.7)', () => {
    renderPage({ searches: [search({ lastRunAt: null })] })
    expect(screen.getByTestId('saved-search-lastrun')).toHaveTextContent('sidebar.savedNeverRun')
  })

  it('nomme l’auteur et le partage quand la recherche vient de l’espace (#2151.10 / .11)', () => {
    renderPage({ searches: [search({ shared: true, ownerName: 'Sarah Lemoine' })] })
    expect(screen.getByTestId('saved-search-owner')).toHaveTextContent('Sarah Lemoine')
    expect(screen.getByTestId('saved-search-shared')).toBeInTheDocument()
  })

  it('annonce la cadence quand elle n’est plus manuelle, et ne promet aucune alerte sinon (#2151.6)', () => {
    renderPage({ searches: [search({ alertFrequency: 'weekly', alertChannel: 'email' })] })
    expect(screen.getByTestId('saved-search-alert')).toHaveTextContent('sidebar.frequency.weekly')
    renderPage({ searches: [search({ id: 's2', alertFrequency: 'manual' })] })
    expect(screen.getAllByTestId('saved-search-alert')).toHaveLength(1)
  })

  it('reprend et crée une liste depuis une recherche enregistrée (#2157.9)', async () => {
    const saved = search()
    const { onApplySearch, onCreateTarget } = renderPage({ searches: [saved] })
    await userEvent.click(screen.getByRole('button', { name: 'sidebar.savedCreateTargetNamedETI industrielles 69/38' }))
    expect(onCreateTarget).toHaveBeenCalledWith(saved)
    await userEvent.click(screen.getByTitle('sidebar.savedApply'))
    expect(onApplySearch).toHaveBeenCalledWith(saved)
  })

  it('le verrou d’offre est dit à la place du bloc, jamais grisé ligne par ligne', () => {
    renderPage({ savedStatus: 'locked', searches: [search()] })
    expect(screen.getByText('mySearches.lockedTitle')).toBeInTheDocument()
    expect(screen.queryByTestId('saved-searches')).toBeNull()
  })

  it('« je n’ai pas pu regarder » ne se rend pas comme « tu n’as aucune recherche »', () => {
    renderPage({ savedStatus: 'error' })
    expect(screen.getByText('sidebar.savedLoadError')).toBeInTheDocument()
    expect(screen.queryByText('mySearches.savedEmptyTitle')).toBeNull()
  })

  it('le bloc Listes de travail dit son état vide', () => {
    renderPage()
    expect(screen.getByText('mySearches.listsEmpty')).toBeInTheDocument()
  })

  it('Théo — une recherche enregistrée dit d’abord QUAND elle a été enregistrée, puis sa dernière reprise', () => {
    renderPage({ searches: [search({ lastRunAt: null })] })
    const line = screen.getByTestId('saved-search-lastrun')
    expect(line.textContent?.indexOf('mySearches.savedOn')).toBe(0)
    expect(line).toHaveTextContent('sidebar.savedNeverRun')
  })

  it('Théo — une liste de travail dit d’où elle vient (« Créée depuis … ») ; SAIT DIRE NON : sans équipe, aucune équipe', () => {
    targetLists.data = [
      {
        id: 'l1',
        name: 'Cibles Data',
        source: 'saved_search',
        team: null,
        created_at: '2026-10-17T09:00:00.000Z',
        counts: { measured: true, total: 18 },
      },
    ]
    renderPage()
    expect(screen.getByText('Cibles Data')).toBeInTheDocument()
    expect(screen.getByText(/mySearches\.listCreatedFrom\[listSource\.saved_search\]/)).toBeInTheDocument()
    expect(screen.queryByText(/ · /)).toBeNull()
    targetLists.data = []
  })
})
