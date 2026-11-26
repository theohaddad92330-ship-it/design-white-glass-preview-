import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4490.2 — « Arrêter » pendant la recherche : coupe la requête (AbortSignal via le cache de requêtes), rend
 * la main tout de suite, garde les critères ; ce qui est arrivé reste, nommé « recherche arrêtée ».
 */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@/features/accounts/hooks/useBestReference', () => ({ useBestReferences: () => ({ data: [] }) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

const { stopSpy, forgetSpy } = vi.hoisted(() => ({ stopSpy: vi.fn(), forgetSpy: vi.fn() }))
vi.mock('@/features/discover/lib/discover-stop', () => ({
  stopDiscoverSearch: (...args: unknown[]) => {
    stopSpy(...args)
    return Promise.resolve()
  },
  forgetStoppedSearch: (...args: unknown[]) => forgetSpy(...args),
}))

const state = vi.hoisted(() => ({
  stopped: false,
  partial: undefined as DiscoverResponse | undefined,
}))
vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: (request: DiscoverRequest | null) => ({
    data: state.partial,
    isFetching: request !== null && !state.stopped,
    isError: request !== null && state.stopped,
    error: state.stopped ? new Error('CancelledError') : null,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/features/discover/hooks/useDiscoverShortlist', () => ({
  useDiscoverShortlist: () => ({
    followed: new Set<string>(),
    dismissed: new Set<string>(),
    toggleFollow: vi.fn(),
    dismiss: vi.fn(),
    restoreAllDismissed: vi.fn(),
  }),
}))
vi.mock('@/features/discover/hooks/useSavedSearches', () => ({
  useSavedSearches: () => ({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() }),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))

const { Discover } = await import('./Discover')

// #4494 : la puce « Secteurs » ouvre « Cadrer la recherche » sur Entreprises ; « Appliquer et explorer » lance.
const pickTechSectorAndExplore = () => {
  fireEvent.click(screen.getByTestId('discover-chip-sectors'))
  fireEvent.click(screen.getByRole('button', { name: /^tout choisir dans technologies et médias$/i }))
  fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
}

const stopButton = () => screen.getByRole('button', { name: discoverFr.states.stop })

beforeEach(() => {
  localStorage.clear()
  state.stopped = false
  state.partial = undefined
  stopSpy.mockClear()
  forgetSpy.mockClear()
})

describe('#4490.2 — le bouton « Arrêter »', () => {
  it('n’existe pas avant la recherche, apparaît pendant, et coupe la requête au clic', async () => {
    renderWithRouter(<Discover />, '/discover')
    await screen.findByTestId('discover-chip-sectors')
    expect(screen.queryByRole('button', { name: discoverFr.states.stop })).toBeNull()

    pickTechSectorAndExplore()
    await screen.findByRole('button', { name: discoverFr.states.stop })

    state.stopped = true
    fireEvent.click(stopButton())
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect((stopSpy.mock.calls[0]?.[1] as DiscoverRequest).mode).toBe('registry')
  })

  it('sans résultat reçu : « recherche arrêtée », pas d’erreur, critères gardés, bouton revenu à « Rechercher »', async () => {
    renderWithRouter(<Discover />, '/discover')
    await screen.findByTestId('discover-chip-sectors')
    pickTechSectorAndExplore()
    await screen.findByRole('button', { name: discoverFr.states.stop })
    state.stopped = true
    fireEvent.click(stopButton())

    expect(await screen.findByText(discoverFr.states.stopped.title)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: discoverFr.states.stop })).toBeNull()
    // La barre reste visible, « Explorer » revenu, critères intacts : la puce « Secteurs » les LIT.
    await waitFor(() => expect(screen.getByRole('button', { name: discoverFr.explore.submit })).toBeEnabled())
    expect(screen.getByTestId('discover-chip-sectors')).not.toHaveTextContent(discoverFr.chips.sectorsAll)
  })

  it('relancer après l’arrêt oublie l’entrée coupée', async () => {
    renderWithRouter(<Discover />, '/discover')
    await screen.findByTestId('discover-chip-sectors')
    pickTechSectorAndExplore()
    await screen.findByRole('button', { name: discoverFr.states.stop })
    state.stopped = true
    fireEvent.click(stopButton())
    await screen.findByText(discoverFr.states.stopped.title)
    fireEvent.click(await screen.findByRole('button', { name: discoverFr.explore.submit }))
    expect(forgetSpy).toHaveBeenCalledTimes(1)
  })
})
