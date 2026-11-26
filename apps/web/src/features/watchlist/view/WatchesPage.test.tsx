import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import watchlistFr from '@/i18n/locales/fr/watchlist.json'

/**
 * Refonte Théo (23/10) — a/signaux-veilles.html : retour à la bibliothèque, « Veilles par compte / Les sujets
 * que tu suis. », « Configurer une veille », puis des ONGLETS (jamais des blocs empilés). Ce fichier sait dire
 * NON sur l'ordre des onglets, sur un onglet qui montrerait le contenu d'un autre, et sur un compteur « 0 ».
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('@/features/account-follows/api', () => ({
  useAccountFollows: () => ({ isPending: false, isError: false, data: { followed: [], suggestion: null, max: 30 } }),
  useToggleAccountFollow: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/discover/hooks/useSavedSearches', () => ({ useSavedSearches: () => ({ searches: [] }) }))
vi.mock('@/features/watchlist/rules/useWatchlistRules', () => ({
  useWatchlistRules: () => ({
    rules: [],
    isLoading: false,
    isError: false,
    createRule: vi.fn(),
    isCreating: false,
    createError: null,
    removeRule: vi.fn(),
    removingId: null,
  }),
}))

const { WatchesPage } = await import('./WatchesPage')
const w = watchlistFr.watches

describe('Mes veilles (refonte Théo)', () => {
  it('en-tête, « Configurer une veille », onglets dans l’ordre — sans compteur « 0 »', () => {
    render(<WatchesPage />)
    expect(screen.getByRole('heading', { level: 1, name: w.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: w.configure })).toBeInTheDocument()
    const tabs = within(screen.getByRole('tablist', { name: w.tabsAria })).getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual([w.tabs.rules, w.tabs.follows, w.tabs.alerts])
  })

  it('un onglet ne montre que SON contenu', () => {
    render(<WatchesPage />)
    expect(screen.getByText(w.rules.intro)).toBeInTheDocument()
    expect(screen.queryByTestId('watches-follows')).toBeNull()
  })

  it('« Configurer une veille » ramène à l’éditeur des règles et y met le focus', () => {
    render(<WatchesPage />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: w.tabs.follows }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: w.configure }))
    })
    expect(screen.getByRole('tab', { name: w.tabs.rules })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: watchlistFr.rules.valueInputLabel }))
  })
})
