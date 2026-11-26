import { useLocation } from '@tanstack/react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4317 — « Réinitialiser les filtres » repart VRAIMENT de zéro (recherche, URL, tranche posée depuis le
 * profil) ; un zéro résultat dit la taille du profil appliquée.
 *
 * Patron de mocks copié sur `Discover.lastSearch.test.tsx`.
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
const profileSize = vi.hoisted(() => ({ value: 'eti' as string | null }))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({
    data: profileSize.value
      ? {
          profile_context: {
            idealAccountProfile: {
              size: profileSize.value,
              sectorsPriority: [],
              decisionLevel: 'director',
              entryStrategy: 'topDown',
            },
          },
        }
      : undefined,
    isLoading: false,
  }),
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

const lastRequest = () => useDiscoverSearchSpy.mock.calls.at(-1)?.[0] as DiscoverRequest | null | undefined

/** Lit l'URL courante du routeur de test : la preuve que « Réinitialiser » a vidé la barre d'adresse. */
function LocationProbe() {
  const { searchStr } = useLocation()
  return <output data-testid="url-search">{searchStr}</output>
}
const currentSearch = () => decodeURIComponent(screen.getByTestId('url-search').textContent ?? '')

const emptyResponse = {
  candidates: [],
  query: {},
  degraded: [],
  coverage: null,
} as unknown as DiscoverResponse

const openAllFiltersAndReset = async () => {
  // Refonte Théo — la puce « Tous les filtres » porte le NOMBRE de critères posés : son nom commence par le libellé.
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${discoverFr.rail.moreFilters}`) }))
  // #4494 — « Réinitialiser les critères » vide le brouillon ; appliqué vide, il repart de zéro (#4317).
  fireEvent.click(screen.getAllByRole('button', { name: discoverFr.framing.reset })[0]!)
  fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
}

// #4490.1 — l'URL pré-remplit le rail, elle ne lance plus : la recherche part au clic.
const launchFromRail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^explorer$/i }))
}

describe('#4317 — Réinitialiser les filtres repart vraiment de zéro', () => {
  beforeEach(() => {
    localStorage.clear()
    useDiscoverSearchSpy.mockClear()
    profileSize.value = 'eti'
    useDiscoverSearchSpy.mockImplementation((request: DiscoverRequest | null) => ({
      data: request ? emptyResponse : undefined,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }))
  })

  it('vide la recherche lancée ET l’URL (compétence, technologie, effectif)', async () => {
    renderWithRouter(
      <>
        <Discover />
        <LocationProbe />
      </>,
      '/discover?keywords=SAP&technologiesObserved=SAP&headcount=250-999',
    )
    await launchFromRail()
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    expect(currentSearch()).toContain('keywords=SAP')
    await openAllFiltersAndReset()
    await waitFor(() => expect(lastRequest() ?? null).toBeNull())
    await waitFor(() => expect(currentSearch()).not.toMatch(/keywords|technologiesObserved|headcount/))
    expect(screen.queryByText(/Ton profil vise/)).toBeNull()
  })
})

describe('#4317 — un zéro résultat dit la taille posée depuis le profil', () => {
  beforeEach(() => {
    localStorage.clear()
    useDiscoverSearchSpy.mockClear()
    useDiscoverSearchSpy.mockImplementation((request: DiscoverRequest | null) => ({
      data: request ? emptyResponse : undefined,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }))
  })

  it('#4516.6 — la taille du profil est PROPOSÉE : la requête part sans tranche, le geste la pose', async () => {
    profileSize.value = 'eti'
    renderWithRouter(
      <>
        <Discover />
        <LocationProbe />
      </>,
      '/discover?sectors=automotive',
    )
    await launchFromRail()
    expect(await screen.findByText(/Ton profil vise les ETI/)).toBeTruthy()
    expect(JSON.stringify(lastRequest()?.query)).not.toMatch(/headcount/)
    fireEvent.click(screen.getByRole('button', { name: /Filtrer sur ETI/ }))
    await waitFor(() => expect(JSON.stringify(lastRequest()?.query)).toMatch(/headcount/))
    await waitFor(() => expect(screen.queryByText(/Ton profil vise/)).toBeNull())
  })

  it('sait dire NON : sans taille du profil → aucune proposition', async () => {
    profileSize.value = null
    renderWithRouter(<Discover />, '/discover?sectors=automotive')
    await launchFromRail()
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    expect(screen.queryByText(/Ton profil vise/)).toBeNull()
  })

  it('le rail réinitialisé retire aussi la proposition', async () => {
    profileSize.value = 'eti'
    renderWithRouter(
      <>
        <Discover />
        <LocationProbe />
      </>,
      '/discover?sectors=automotive',
    )
    await launchFromRail()
    await screen.findByText(/Ton profil vise les ETI/)
    await openAllFiltersAndReset()
    await waitFor(() => expect(screen.queryByText(/Ton profil vise/)).toBeNull())
    expect(currentSearch()).not.toMatch(/sectors|headcount/)
  })
})

const { readLastSearch } = await import('@/features/discover/lib/discover-last-search')

describe('R22-DV6 — la taille du profil retirée ne revient pas à la réouverture', () => {
  beforeEach(() => {
    localStorage.clear()
    useDiscoverSearchSpy.mockClear()
    profileSize.value = 'eti'
    useDiscoverSearchSpy.mockImplementation((request: DiscoverRequest | null) => ({
      data: request ? emptyResponse : undefined,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }))
  })

  it('« Ignorer » est écrit dans l’URL ET dans la dernière recherche (TTL 24 h existant)', async () => {
    renderWithRouter(
      <>
        <Discover />
        <LocationProbe />
      </>,
      '/discover?sectors=automotive',
    )
    await launchFromRail()
    await screen.findByText(/Ton profil vise les ETI/)
    fireEvent.click(screen.getByRole('button', { name: discoverFr.profileSize.dismiss }))
    await waitFor(() => expect(currentSearch()).toContain('profileSize=off'))
    await waitFor(() => expect(readLastSearch('u-1', Date.now())?.profileSize).toBe('off'))
  })

  it('#4516.8 — une URL enregistrée avec profileSize=off reste valide : ni taille, ni proposition', async () => {
    renderWithRouter(<Discover />, '/discover?sectors=automotive&profileSize=off')
    await launchFromRail()
    await waitFor(() => expect(lastRequest()).toBeTruthy())
    expect(screen.queryByText(/Ton profil vise/)).toBeNull()
    expect(JSON.stringify(lastRequest()?.query)).not.toMatch(/headcount/)
  })

  it('sait dire NON : sans retrait, la recherche vierge reçoit la PROPOSITION (jamais la tranche)', async () => {
    renderWithRouter(<Discover />, '/discover?sectors=automotive')
    await launchFromRail()
    expect(await screen.findByText(/Ton profil vise les ETI/)).toBeTruthy()
    expect(JSON.stringify(lastRequest()?.query)).not.toMatch(/headcount/)
  })
})
