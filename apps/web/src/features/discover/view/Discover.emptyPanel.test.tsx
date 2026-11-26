import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4588.4 — le panneau « Ce qu'il faut savoir » ENTIER (pas seulement `CapabilityNotice`) n'affirme rien sur la
 * couverture quand la liste est vide : ni « N sources interrogées », ni « les sources n'avaient plus rien à rendre ».
 * Avec des cartes, il parle ; ce qui a ARRÊTÉ la recherche (le temps) se dit toujours — c'est la raison du vide.
 */
let routeSearch: Record<string, unknown> = {}
const navigate = vi.fn()
const searchResult = vi.fn()

vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: () => searchResult(),
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
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: {} }),
}))
vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: () => ({ data: undefined }),
}))
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routeSearch } }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})
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

const response = (query: Record<string, unknown>, candidates: unknown[] = []) => ({
  data: { candidates, query, degraded: [] },
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
})

beforeEach(() => {
  navigate.mockClear()
  routeSearch = { sector: 'software_tech' }
})

describe('#4588.4 — le panneau « Ce qu’il faut savoir » sur une liste vide', () => {
  it('SAIT DIRE NON : liste vide → aucune ligne « sources interrogées » ni « plus rien à rendre »', async () => {
    searchResult.mockReturnValue(response({ searchEffort: { sourcesQueried: 3, stoppedBy: 'exhausted' } }))
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.queryByTestId('search-effort')).toBeNull()
    expect(screen.queryByText(/sources interrogées/i)).toBeNull()
  })

  it('une recherche coupée par le temps le dit, même sans carte : c’est la raison du vide', async () => {
    searchResult.mockReturnValue(response({ searchEffort: { sourcesQueried: 3, stoppedBy: 'time' } }))
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.getByTestId('search-effort')).toHaveTextContent(/temps imparti/i)
  })
})
