import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * Théo decouvrir-historique — « Mes recherches » est une VUE de Découvrir (`?view=history`), jamais une route
 * neuve : elle remplace la recherche, y revient d'un clic, et l'entrée est visible depuis la recherche.
 *
 * Patron de mocks copié sur `Discover.lastSearch.test.tsx`.
 */

const routeSearch = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routeSearch.value } }))
vi.mock('@/features/accounts/hooks/useBestReference', () => ({
  useBestReferences: () => ({ data: [] }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1' } }),
}))

const useDiscoverSearchSpy = vi.fn((_request: DiscoverRequest | null) => ({
  data: undefined as DiscoverResponse | undefined,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}))
vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: (request: DiscoverRequest | null) => useDiscoverSearchSpy(request),
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

const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

const { Discover } = await import('./Discover')

describe('Découvrir — la vue « Mes recherches »', () => {
  it('à l’arrivée, la recherche est là et l’entrée « Mes recherches » l’ouvre', async () => {
    routeSearch.value = {}
    renderWithRouter(<Discover />, '/discover')
    expect(await screen.findByRole('button', { name: 'Mes recherches' })).toBeInTheDocument()
    expect(screen.queryByTestId('discover-history')).not.toBeInTheDocument()
  })

  it('avec ?view=history, la page Mes recherches remplace la recherche et sait en revenir', async () => {
    routeSearch.value = { view: 'history' }
    renderWithRouter(<Discover />, '/discover')
    expect(await screen.findByTestId('discover-history')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Mes recherches' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revenir à Découvrir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle recherche' })).toBeInTheDocument()
    // Un historique vide dit son état, il n'invente aucune recherche.
    expect(screen.getByText(/Tes recherches des 30 derniers jours apparaîtront ici/)).toBeInTheDocument()
  })
})
