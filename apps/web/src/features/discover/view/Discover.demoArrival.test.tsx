import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4556 (craft rule n°9) puis #4628 — EN DÉMONSTRATION, /discover s'ouvre avec la première recherche enregistrée de
 * l'espace PROPOSÉE (un bouton), jamais jouée seule : #4490 tient (« une piste POSE les critères et s'arrête là :
 * aucun appel sans geste »), et un prospect ne doit pas croire que le produit décide à la place du commercial.
 * Un clic la joue — la salle répond alors une liste SCRIPTÉE, gratuite. HORS démo, rien ne change (#4490.1, #4493.7).
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
const demo = vi.hoisted(() => ({ isDemo: true, saved: [] as unknown[] }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.isDemo }))
vi.mock('@/features/discover/hooks/useSavedSearches', () => ({
  useSavedSearches: () => ({ searches: demo.saved, save: vi.fn(), remove: vi.fn(), markRun: vi.fn() }),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: demo.saved }),
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
const { emptyUnifiedFilters } = await import('@/features/discover/lib/discover-filters')

const savedSearch = (id: string, keywords: string) => ({
  id,
  label: `Recherche ${id}`,
  filters: { ...emptyUnifiedFilters(), keywords },
  savedAt: 0,
  objective: null,
  alertFrequency: 'manual',
  alertChannel: null,
  resultType: null,
  newItems: null,
  sourceNatures: [],
})

describe('#4556 / #4628 — la démonstration propose une recherche à l’ouverture, elle ne la lance pas seule (#4490)', () => {
  beforeEach(() => {
    localStorage.clear()
    useDiscoverSearchSpy.mockClear()
    demo.isDemo = true
    demo.saved = [savedSearch('s1', 'banque assurance'), savedSearch('s2', 'sap')]
  })

  it('en démo, une URL nue PROPOSE la première recherche enregistrée : rien ne part avant le clic (#4490, #4628)', async () => {
    renderWithRouter(<Discover />, '/discover')
    const play = await screen.findByRole('button', { name: /Recherche s1/ })
    // Aucun appel sans geste : la proposition est posée, la requête n'existe pas.
    expect(lastRequest() ?? null).toBeNull()
    fireEvent.click(play)
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    expect(JSON.stringify((lastRequest()?.query as DiscoverRegistryQuery).filters)).toContain('banque')
  })

  it('sait dire NON : hors démo, la même URL nue reste au repos et ne propose pas la recherche de la démo', async () => {
    demo.isDemo = false
    renderWithRouter(<Discover />, '/discover')
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    expect(lastRequest() ?? null).toBeNull()
    expect(screen.queryByRole('button', { name: /Recherche s1/ })).not.toBeInTheDocument()
  })

  it('en démo, une URL qui précise sa demande n’est pas remplacée par la recherche enregistrée', async () => {
    renderWithRouter(<Discover />, '/discover?sectors=automotive')
    fireEvent.click(await screen.findByRole('button', { name: discoverFr.explore.submit }))
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    const filters = JSON.stringify((lastRequest()?.query as DiscoverRegistryQuery).filters)
    expect(filters).toContain('29.10Z')
    expect(filters).not.toContain('banque')
  })

  it('en démo, « Reprendre ta dernière recherche » MONTRE la liste : la requête part au clic, sans Explorer', async () => {
    demo.saved = []
    rememberLastSearch('u-1', { sectors: 'ecommerce' }, Date.now())
    renderWithRouter(<Discover />, '/discover')
    fireEvent.click(await screen.findByRole('button', { name: discoverFr.lastSearch.resume }))
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    expect(JSON.stringify((lastRequest()?.query as DiscoverRegistryQuery).filters)).toContain('47.91')
  })

  it('en démo sans aucune recherche enregistrée : rien ne part (jamais une liste inventée)', async () => {
    demo.saved = []
    renderWithRouter(<Discover />, '/discover')
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    expect(lastRequest() ?? null).toBeNull()
  })
})
