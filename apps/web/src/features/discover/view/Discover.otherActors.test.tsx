import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #4746.2 (lot P, Louis 31/10) — UNE liste, deux onglets : « Comptes » ne montre que des clients finaux ;
 * EXTIA (ESN) et FRANCE TRAVAIL (site d'annonces) vivent dans « Autres acteurs ». Patron : `Discover.listeUnique`.
 */

const searchResult = vi.fn()
const savedSearches = vi.fn()

vi.mock('@/features/discover/hooks/useDiscoverSearch', () => ({
  useDiscoverSearch: (request: DiscoverRequest | null, options?: unknown) => searchResult(request, options),
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
  useSavedSearches: () => savedSearches(),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => vi.fn() }
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

function candidate(index: number, over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  const n = String(index).padStart(2, '0')
  return {
    name: `Compte ${n}`,
    siren: `5521005${n}`,
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    // Scores décroissants : le tri par défaut garde l'ordre d'index.
    score: 90 - index,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

function responseOf(count: number, over: (index: number) => Partial<DiscoverCandidate> = () => ({})): DiscoverResponse {
  return {
    candidates: Array.from({ length: count }, (_, index) => candidate(index + 1, over(index + 1))),
    query: {},
    degraded: [],
    coverage: null,
  }
}

function mockResponse(response: DiscoverResponse) {
  searchResult.mockReturnValue({ data: response, isFetching: false, isError: false, refetch: vi.fn() })
}

/** Lance la recherche « Comptes qui recrutent » (seul moyen, sans critère saisi, de poser une requête). */
async function openResults() {
  renderWithRouter(<Discover />)
  fireEvent.click(await screen.findByRole('button', { name: /pistes rapides/i }))
  fireEvent.click(await screen.findByRole('button', { name: /comptes qui recrutent/i }))
  // #4490 (26/10) — une piste POSE désormais les critères et s'arrête là : aucun appel
  // sans geste. C'est « Explorer » qui lance la recherche, donc le test le clique aussi.
  fireEvent.click(await screen.findByRole('button', { name: 'Explorer' }))
  await screen.findAllByTestId('candidate-row')
}

const rows = () => screen.queryAllByTestId('candidate-row')

beforeEach(() => {
  cleanup()
  searchResult.mockReset()
  savedSearches.mockReturnValue({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() })
})

const mixed = () =>
  responseOf(4, index =>
    index === 1
      ? { name: 'EXTIA', actorKind: 'esn', isEsnPeer: true }
      : index === 2
        ? { name: 'FRANCE TRAVAIL', actorKind: 'adsite', isIntermediary: true }
        : {},
  )

describe('#4746.2 — Comptes = clients finaux seulement', () => {
  it('EXTIA et FRANCE TRAVAIL ne sont PAS dans « Comptes »', async () => {
    mockResponse(mixed())
    await openResults()
    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('EXTIA')).toBeNull()
    expect(screen.queryByText('FRANCE TRAVAIL')).toBeNull()
    expect(screen.getByRole('radio', { name: /^Comptes\s*2$/ })).toHaveAttribute('aria-checked', 'true')
    // aucun compteur d'« Autres acteurs » avant que l'onglet soit chargé : jamais un « 0 » d'une non-mesure
    expect(screen.getByRole('radio', { name: 'Autres acteurs' })).toBeInTheDocument()
  })

  it('« Autres acteurs » les montre, avec leur type, et le compteur apparaît une fois ouvert', async () => {
    mockResponse(mixed())
    await openResults()
    fireEvent.click(screen.getByRole('radio', { name: 'Autres acteurs' }))
    expect(await screen.findByRole('radio', { name: /^Autres acteurs\s*2$/ })).toHaveAttribute('aria-checked', 'true')
    const table = within(screen.getByTestId('other-actors'))
    expect(table.getByText('EXTIA')).toBeInTheDocument()
    expect(table.getByText('FRANCE TRAVAIL')).toBeInTheDocument()
    expect(rows()).toHaveLength(0)
    // revenir à « Comptes » : la liste des clients est intacte
    fireEvent.click(screen.getByRole('radio', { name: /^Comptes/ }))
    expect(rows()).toHaveLength(2)
  })

  it('aucune requête de plus au clic sur « Autres acteurs » (lecture de ce qui est déjà reçu)', async () => {
    mockResponse(mixed())
    await openResults()
    const callsBefore = searchResult.mock.calls.length
    const requestBefore = JSON.stringify(searchResult.mock.calls.at(-1)?.[0])
    fireEvent.click(screen.getByRole('radio', { name: 'Autres acteurs' }))
    expect(JSON.stringify(searchResult.mock.calls.at(-1)?.[0])).toBe(requestBefore)
    expect(searchResult.mock.calls.length).toBeGreaterThanOrEqual(callsBefore)
  })
})
