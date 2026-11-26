import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/** #5212 — un seul appui sur Entrée dans la barre de recherche lance la requête. Mocks : `Discover.freetextSearch.test.tsx`. */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

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

describe('#5212 — Entrée lance la recherche dès le premier appui', () => {
  it('taper « SAP » puis {Enter} UNE fois envoie la requête', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Discover />)
    const field = (await screen.findByRole('searchbox', { name: discoverFr.explore.label })) as HTMLInputElement
    await user.type(field, 'SAP{Enter}')
    expect(lastRequest()?.mode).toBe('registry')
    expect((lastRequest()?.query as DiscoverRegistryQuery).filters.freetext).toBe('SAP')
  })
})
