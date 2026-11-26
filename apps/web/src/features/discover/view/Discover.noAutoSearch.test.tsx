import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4490.1 — une recherche ne part JAMAIS seule à l'arrivée sur /discover : ni depuis la mémoire, ni depuis
 * l'URL, ni depuis le relais de Laura. Les critères sont pré-remplis ; la requête ne part qu'au clic.
 *
 * Patron de mocks copié sur `Discover.freetextSearch.test.tsx`.
 */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))
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
const { discoverSearch } = await import('@/features/chat/view/discover-handoff')

const lastRequest = () => useDiscoverSearchSpy.mock.calls.at(-1)?.[0] as DiscoverRequest | null | undefined
const { rememberLastSearch } = await import('@/features/discover/lib/discover-last-search')

describe('#4490.1 — aucune recherche ne part sans le clic « Lancer la recherche »', () => {
  beforeEach(() => {
    localStorage.clear()
    useDiscoverSearchSpy.mockClear()
  })

  it('la dernière recherche mémorisée est PROPOSÉE, ni restaurée ni lancée (#4493.7, point 31)', async () => {
    rememberLastSearch('u-1', { sectors: 'ecommerce' }, Date.now())
    renderWithRouter(<Discover />, '/discover')
    // #4493.7 — le rail s'ouvre VIDE ; le geste « Reprendre » remet les critères, toujours sans lancer.
    expect(await screen.findByTestId('discover-chip-sectors')).not.toHaveTextContent(/commerce/i)
    fireEvent.click(await screen.findByRole('button', { name: discoverFr.lastSearch.resume }))
    await waitFor(() => expect(screen.getByTestId('discover-chip-sectors')).toHaveTextContent(/commerce/i))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(useDiscoverSearchSpy.mock.calls.every(([request]) => request === null)).toBe(true)
  })

  it('une URL avec critères pré-remplit sans lancer, puis le clic lance UNE recherche', async () => {
    renderWithRouter(<Discover />, '/discover?sectors=automotive')
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(useDiscoverSearchSpy.mock.calls.every(([request]) => request === null)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    expect(JSON.stringify((lastRequest()?.query as DiscoverRegistryQuery).filters)).toContain('29.10Z')
  })

  it('le relais de Laura (laura=1) pré-remplit sans lancer', async () => {
    renderWithRouter(<Discover />, '/discover?keywords=cloud&laura=1')
    await screen.findByText(/préparé par laura depuis ta conversation/i)
    expect(useDiscoverSearchSpy.mock.calls.every(([request]) => request === null)).toBe(true)
  })
})
