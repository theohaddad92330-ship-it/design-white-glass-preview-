import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #4758 / #4761 — l'APPELANT : l'écran /discover range les comptes en « Signaux récents » puis
 * « Comptes à historique » dès qu'un compte remonte sur son seul historique, et la carte dit pourquoi.
 * Un test de la seule fonction laisserait passer un câblage manquant.
 *
 * Patron : `Discover.accessClassSearch.test.tsx` (route, navigation et
 * recherche mockées ; on lit ce que l'écran RENDRE, pas le réseau).
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
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

beforeEach(() => {
  cleanup()
  searchResult.mockReset()
  savedSearches.mockReturnValue({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() })
})

describe('#4761 — les deux blocs sur /discover', () => {
  it('un compte à historique seul passe dans « Comptes à historique » et sa carte nomme la raison', async () => {
    mockResponse(
      responseOf(3, index =>
        index === 3
          ? {
              signals: [
                { type: 'hiring', label: 'Développeur Java', date: daysAgo(200) },
                { type: 'hiring', label: 'Architecte Java', date: daysAgo(400) },
              ],
            }
          : { signals: [{ type: 'hiring', label: 'Développeur Java', date: daysAgo(10) }] },
      ),
    )
    await openResults()

    const recent = screen.getByTestId('discover-block-recent')
    const history = screen.getByTestId('discover-block-history')
    expect(within(recent).getAllByTestId('candidate-row')).toHaveLength(2)
    expect(within(history).getAllByTestId('candidate-row')).toHaveLength(1)
    expect(within(history).getByTestId('candidate-history-reason').textContent).toMatch(/^2 (offres|besoins)/)
    // Le frein de crédits reste implicite : aucun chiffre de crédit sur l'historique.
    expect(history.textContent ?? '').not.toMatch(/crédit/i)
  })

  it('sans compte à historique, l’écran garde sa liste paginée : pas de bloc, pas de « 0 »', async () => {
    mockResponse(responseOf(3, () => ({ signals: [{ type: 'hiring', label: 'Développeur Java', date: daysAgo(10) }] })))
    await openResults()
    expect(screen.queryByTestId('discover-history-blocks')).toBeNull()
    expect(screen.queryByTestId('discover-block-history')).toBeNull()
    expect(rows()).toHaveLength(3)
  })
})
