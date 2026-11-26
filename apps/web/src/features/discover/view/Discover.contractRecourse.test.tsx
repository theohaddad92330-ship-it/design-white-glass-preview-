import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #2291.2 — L'APPELANT RÉEL du filtre « recourt au freelance / à la régie ».
 *
 * `applyRailConstraints` et `FilterRail` sont testés chacun de leur côté ; ce
 * test prouve que l'ÉCRAN les branche : une URL qui porte `contractRecourse=1`
 * (rechargement, lien partagé) ne rend que le compte dont l'indépendant ou la
 * régie est OBSERVÉ, et la modale des filtres DIT combien de comptes ont été
 * retirés faute d'observation — un inconnu n'est jamais un « non ».
 *
 * Mocks : même patron que `Discover.accessClassSearch.test.tsx`.
 */

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
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))
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

function candidate(over: Partial<DiscoverCandidate>): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: '69',
    headcountRange: null,
    creationDate: null,
    score: 50,
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

const jobOffers = (freelance: number) => ({
  source: 'France Travail',
  total: 4 + freelance,
  counts: { permanent: 4, fixedTerm: 0, interim: 0, freelance, other: 0 },
  since: '2026-06-01',
  until: '2026-09-01',
})

function response(): DiscoverResponse {
  return {
    candidates: [
      candidate({
        name: 'Recourt Observé SA',
        siren: '111111111',
        contractModel: { observedAt: '2026-09-19', jobOffers: jobOffers(2), publicContracts: null },
      }),
      candidate({
        name: 'Salariés Seuls SA',
        siren: '222222222',
        contractModel: { observedAt: '2026-09-19', jobOffers: jobOffers(0), publicContracts: null },
      }),
      candidate({ name: 'Jamais Observée SA', siren: '333333333' }),
    ],
    query: {},
    degraded: [],
    coverage: null,
  }
}

beforeEach(() => {
  cleanup()
  navigate.mockReset()
  searchResult.mockReturnValue({ data: response(), isFetching: false, isError: false, refetch: vi.fn() })
})

// #4490.1 — l'URL pré-remplit le rail, elle ne lance plus : la recherche part au clic.
const launchFromRail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: discoverFr.explore.submit }))
}

describe('Découvrir — « recourt au freelance / à la régie » branché sur l’écran (#2291.2)', () => {
  it('l’URL `contractRecourse=1` ne rend que le recours OBSERVÉ, et la modale dit l’inconnu retiré', async () => {
    renderWithRouter(<Discover />, '/discover?department=69&contractRecourse=1')
    await launchFromRail()

    expect(await screen.findByText('Recourt Observé SA')).toBeInTheDocument()
    expect(screen.queryByText('Salariés Seuls SA')).not.toBeInTheDocument()
    expect(screen.queryByText('Jamais Observée SA')).not.toBeInTheDocument()

    // #4494 — le critère vit dans la rubrique « Expertises » de « Cadrer la recherche ».
    fireEvent.click(screen.getByRole('button', { name: /tous les filtres/i }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByTestId('framing-section-expertise'))
    // Un seul INCONNU retiré — « Salariés Seuls » est observé, jamais compté inconnu.
    expect(dialog.getByText(/1 compte retiré faute d’observation/)).toBeInTheDocument()
  })

  it('sans le critère, les trois restent — le filtre décoché ne retire rien', async () => {
    renderWithRouter(<Discover />, '/discover?department=69')
    await launchFromRail()
    expect(await screen.findByText('Recourt Observé SA')).toBeInTheDocument()
    expect(screen.getByText('Salariés Seuls SA')).toBeInTheDocument()
    expect(screen.getByText('Jamais Observée SA')).toBeInTheDocument()
  })
})
