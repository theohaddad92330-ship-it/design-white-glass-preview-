import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4312 — « ma recherche elle est disparue, vu que ça m'a amené sur Laura » : revenir sur `/discover` NU
 * (bouton de menu) rouvre la dernière recherche — critères et type de résultat — sans la relancer à la main.
 *
 * Patron de mocks copié sur `Discover.freetextSearch.test.tsx`.
 */

const navigation = vi.hoisted(() => ({ blocked: false }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => {
      const real = actual.useNavigate()
      return ((options: Parameters<typeof real>[0]) =>
        navigation.blocked ? Promise.resolve() : real(options)) as typeof real
    },
  }
})
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

const { readLastSearch, rememberLastSearch } = await import('@/features/discover/lib/discover-last-search')

describe('#4312 — la dernière recherche revient au retour sur /discover', () => {
  beforeEach(() => {
    localStorage.clear()
    useDiscoverSearchSpy.mockClear()
  })

  it('#4493.7 (point 31) — une URL nue s’ouvre SANS requête : la dernière recherche est PROPOSÉE, jamais restaurée', async () => {
    rememberLastSearch('u-1', { sectors: 'ecommerce' }, Date.now())
    renderWithRouter(<Discover />, '/discover')
    const resume = await screen.findByRole('button', { name: discoverFr.lastSearch.resume })
    expect(lastRequest() ?? null).toBeNull()
    // Rien n'est restauré d'office : Explorer, avant le geste, ne porte PAS les critères mémorisés.
    fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
    expect(JSON.stringify(lastRequest()?.query ?? null)).not.toContain('47.91')
    // Le geste reprend les critères ; la recherche part au clic sur Explorer seulement (#4490.1).
    fireEvent.click(resume)
    await waitFor(() => expect(screen.queryByRole('button', { name: discoverFr.lastSearch.resume })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    const query = lastRequest()?.query as DiscoverRegistryQuery
    expect(JSON.stringify(query.filters)).toContain('47.91')
  })

  // #4628.4 — « Reprendre » rend RÉELLEMENT les critères promis (Louis 27/10 : « Tes critères reviennent », puis un rail
  // vide — « Toute la France », « Tous les secteurs »). Le rail est posé DANS LE GESTE : la navigation est coupée ici,
  // car en production le détour par l'URL ne tenait pas sa promesse. Aucune recherche ne part (#4490).
  it('#4628.4 — le clic sur « Reprendre » pose les critères dans le rail même si l’URL ne suit pas, sans rien lancer', async () => {
    rememberLastSearch('u-1', { sectors: 'ecommerce', department: '75' }, Date.now())
    renderWithRouter(<Discover />, '/discover')
    const resume = await screen.findByRole('button', { name: discoverFr.lastSearch.resume })
    navigation.blocked = true
    try {
      fireEvent.click(resume)
      await waitFor(() => expect(screen.queryByRole('button', { name: discoverFr.lastSearch.resume })).toBeNull())
      expect(screen.getByTestId('discover-chip-sectors').textContent ?? '').toMatch(/e-commerce/i)
      expect(screen.getByTestId('discover-chip-territory').textContent ?? '').toContain('75')
      expect(lastRequest() ?? null).toBeNull()
    } finally {
      navigation.blocked = false
    }
  })

  it('une URL nue SANS mémoire reste au repos : aucune recherche ne part, rien n’est proposé', async () => {
    renderWithRouter(<Discover />, '/discover')
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    expect(lastRequest() ?? null).toBeNull()
    expect(screen.queryByRole('button', { name: discoverFr.lastSearch.resume })).toBeNull()
  })

  it('une URL qui précise sa demande n’est JAMAIS remplacée par la mémoire', async () => {
    rememberLastSearch('u-1', { sectors: 'ecommerce' }, Date.now())
    renderWithRouter(<Discover />, '/discover?sectors=automotive')
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    const filters = JSON.stringify((lastRequest()?.query as DiscoverRegistryQuery).filters)
    expect(filters).toContain('29.10Z')
    expect(filters).not.toContain('47.91')
  })

  it('une recherche lancée depuis le rail est mémorisée pour le retour', async () => {
    renderWithRouter(<Discover />, '/discover')
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.click(screen.getByTestId('discover-chip-sectors'))
    fireEvent.click(screen.getByRole('button', { name: /^tout choisir dans technologies et médias$/i }))
    fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
    await waitFor(() => expect(readLastSearch('u-1', Date.now())).not.toBeNull())
  })
})
