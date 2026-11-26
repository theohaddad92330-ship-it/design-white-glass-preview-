import { cleanup, fireEvent, screen } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabSites } from './TabSites'

/**
 * #2130.57 — `scope_changed` : le SEUL des 15 événements nommés par le corps
 * de #3000 qui n'était pas encore câblé. Le sélecteur de périmètre lui-même
 * (`EntitiesGraphCard`, #2966/#2119.52-56 — choisir/retirer une filiale comme
 * cible) était déjà livré ; cette suite garde le BRANCHEMENT du traceur sur
 * ses deux gestes (`chooseTargetPerimeter`/`clearTargetPerimeter`), pas le
 * rendu du bouton lui-même — déjà gardé par `EntitiesGraphCard.test.tsx`.
 */

const tracker = vi.hoisted(() => ({ trackActionStarted: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

// Même substitution que `TabSites.observedZone.test.tsx` : `renderWithRouter`
// ne monte qu'une route catch-all, insuffisante pour `useSearch({ from:
// '/accounts/$id' })`.
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useSearch: () => null }
})

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null, isPending: false, isError: false }),
}))

// Isole le BRANCHEMENT : `EntitiesGraphCard` a sa propre suite pour le rendu
// réel du bouton « Choisir ce périmètre comme cible » (ligne 289, déjà verte).
vi.mock('../components/EntitiesGraphCard', () => ({
  EntitiesGraphCard: (props: { onChooseTarget?: (name: string) => void; onClearTarget?: () => void }) => (
    <div>
      <button onClick={() => props.onChooseTarget?.('DSI Groupe')}>choisir</button>
      <button onClick={() => props.onClearTarget?.()}>retirer</button>
    </div>
  ),
}))

function account(id: string): Account {
  return {
    id,
    company_name: 'Thales',
    raw_analysis: { sites_france: [{ city: 'Paris', is_headquarters: true, latitude: 48.8566, longitude: 2.3522 }] },
  } as unknown as Account
}

describe('TabSites — #2130.57, `scope_changed`', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({
      data: [],
      pagination: { currentPage: 1, size: 50, totalItems: 0, totalPages: 1, hasNext: false, hasPrev: false },
    })
    tracker.trackActionStarted.mockClear()
  })
  afterEach(() => cleanup())

  it('émet `scope_changed` quand un périmètre est choisi comme cible — jamais son nom', async () => {
    renderWithRouter(<TabSites account={account('a-scope-1')} />)

    fireEvent.click(await screen.findByText('choisir'))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('scope_changed', '/accounts/$id')
    // Le NOM de l'entité choisie ('DSI Groupe') n'est jamais passé au traceur.
    expect(tracker.trackActionStarted).not.toHaveBeenCalledWith(expect.anything(), 'DSI Groupe')
  })

  it('émet aussi `scope_changed` quand la cible est retirée', async () => {
    renderWithRouter(<TabSites account={account('a-scope-2')} />)

    fireEvent.click(await screen.findByText('retirer'))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('scope_changed', '/accounts/$id')
  })
})
