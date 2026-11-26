import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4572 — la carte de territoire et le filtre de zone nomment les MÊMES régions : celles que le clic pose.
 * Recette démo 25/10 : clic sur « Île-de-France » → `region=11,84`, filtre « Auvergne-Rhône-Alpes +1 ».
 * La zone de l'offre porte deux régions (volontaire : union portefeuille + profil) ; chaque libellé les nomme TOUTES.
 */
let routeSearch: Record<string, unknown> = {}
const navigate = vi.fn((options: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  if (options.search) routeSearch = options.search(routeSearch)
})
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
  useOfferPortfolio: () => ({ data: { target_geographies: ['IDF', 'AURA'], target_application_sectors: ['rail'] } }),
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

beforeEach(() => {
  navigate.mockClear()
  routeSearch = {}
  searchResult.mockReturnValue({ data: undefined, isFetching: false, isError: false, refetch: vi.fn() })
})

describe('#4572 — le libellé de zone suit le clic', () => {
  // #4572.5 — revient sur l'union volontaire de #4572 : la zone de l'offre porte deux régions, le clic n'en pose qu'UNE.
  it('un clic sur la carte Territoire pose UNE région, la carte et le filtre ne nomment que celle-là', async () => {
    renderWithRouter(<Discover />)
    const card = await screen.findByTestId('discover-track-territory')
    expect(card).toHaveTextContent('Île-de-France')
    expect(card).not.toHaveTextContent('Auvergne-Rhône-Alpes')
    fireEvent.click(card)
    await waitFor(() => expect(screen.getByTestId('discover-chip-territory')).not.toHaveTextContent('Toute la France'))
    const chip = screen.getByTestId('discover-chip-territory')
    expect(chip).toHaveTextContent('Île-de-France')
    expect(chip).not.toHaveTextContent('Auvergne-Rhône-Alpes')
    expect(chip.textContent).not.toMatch(/\+\d/)
  })
})
