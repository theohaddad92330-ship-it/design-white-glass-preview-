import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * Lot T point 5 (recette prod 01/11) — « Data Nice » tapé dans la BARRE (champ « Explorer ») : la commune ambiguë en fin
 * de phrase sans marqueur doit PROPOSER « Chercher à Nice ? » ; le clic pose la ville et garde « Data » en compétence.
 * Le test passe par le composant de la barre, pas seulement par `ambiguousCitySuggestion`.
 *
 * #4493 (décision Louis 24/10) — REVIENT SUR #3646 : la barre « Quel marché veux-tu explorer ? » retrouve son
 * champ libre et « Explorer ». Le champ écrit `filters.freetext` (le MÊME champ du contrat : URL, recherche
 * enregistrée, `q=`) ; un texte ancien s'ouvre DANS le champ, sans erreur, et part toujours. Rien ne part seul
 * à l'arrivée (#4490).
 *
 * Patron de mocks copié sur `Discover.filterRailCollapse.test.tsx`.
 */

vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

const useDiscoverSearchSpy = vi.fn((_request: DiscoverRequest | null) => ({
  data: {
    candidates: [
      {
        name: 'TREASURE DATA',
        siren: '123456782',
        nafCode: '62.01Z',
        sector: null,
        city: 'PARIS',
        department: '75',
        headcountRange: null,
        creationDate: null,
        establishmentCount: null,
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
      },
    ],
    query: { reading: { activities: [], place: null, name: 'Data Nice', notApplied: [] } },
    degraded: [],
    coverage: null,
  } as unknown as DiscoverResponse | undefined,
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

// #4490.1 — l'URL pré-remplit le rail, elle ne lance plus : la recherche part au clic.
const launchFromRail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: discoverFr.explore.submit }))
}
const exploreField = () => screen.getByRole('searchbox', { name: discoverFr.explore.label }) as HTMLInputElement

describe('lot T — « Data Nice » dans la barre propose « Chercher à Nice ? »', () => {
  it('la suggestion sort, et son clic relance avec la ville Nice et « Data » en mot-clé', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.change(exploreField(), { target: { value: 'Data Nice' } })
    await launchFromRail()
    const suggestion = await screen.findByTestId('city-suggestion')
    expect(suggestion.textContent).toContain('Nice')
    fireEvent.click(suggestion)
    const filters = (lastRequest()?.query as DiscoverRegistryQuery).filters
    expect(filters.city).toBe('Nice')
    expect(JSON.stringify(lastRequest()?.query)).toMatch(/Data/)
  })

  it('« Data Strasbourg » (commune non ambiguë) ne propose rien', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.change(exploreField(), { target: { value: 'Data Strasbourg' } })
    await launchFromRail()
    expect(screen.queryByTestId('city-suggestion')).toBeNull()
  })

  it('la même phrase arrivée par l’URL (?freetext=Data+Nice, lien ou recherche enregistrée) propose aussi Nice', async () => {
    renderWithRouter(<Discover />, '/discover?freetext=Data+Nice')
    await launchFromRail()
    expect((await screen.findByTestId('city-suggestion')).textContent).toContain('Nice')
  })

  it('filtres de la recherche précédente conservés (Java, Hauts-de-France) : la suggestion sort quand même', async () => {
    renderWithRouter(<Discover />, '/discover?freetext=Data+Nice&region=32&keywords=Java')
    await launchFromRail()
    expect((await screen.findByTestId('city-suggestion')).textContent).toContain('Nice')
  })
})
