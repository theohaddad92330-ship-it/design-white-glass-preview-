import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverRegistryQuery, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4493 (décision Louis 24/10) — REVIENT SUR #3646 : la barre « Quel marché veux-tu explorer ? » retrouve son
 * champ libre et « Explorer ». Le champ écrit `filters.freetext` (le MÊME champ du contrat : URL, recherche
 * enregistrée, `q=`) ; un texte ancien s'ouvre DANS le champ, sans erreur, et part toujours. Rien ne part seul
 * à l'arrivée (#4490).
 *
 * Patron de mocks copié sur `Discover.filterRailCollapse.test.tsx`.
 */

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

// #4490.1 — l'URL pré-remplit le rail, elle ne lance plus : la recherche part au clic.
const launchFromRail = async () => {
  fireEvent.click(await screen.findByRole('button', { name: discoverFr.explore.submit }))
}
const exploreField = () => screen.getByRole('searchbox', { name: discoverFr.explore.label }) as HTMLInputElement

describe('#4493 — la saisie libre revient, « Explorer » lance (revient sur #3646)', () => {
  it('le champ et « Explorer » sont là ; rien ne part à l’arrivée', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    expect(exploreField()).toBeInTheDocument()
    expect(lastRequest() ?? null).toBeNull()
  })

  it('un mot-clé tapé puis « Explorer » part en `freetext`', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.change(exploreField(), { target: { value: 'SAP' } })
    await launchFromRail()
    expect(lastRequest()?.mode).toBe('registry')
    expect((lastRequest()?.query as DiscoverRegistryQuery).filters.freetext).toBe('SAP')
  })

  it('#4419.29 — « dev vue à lille » part en compétence Vue + ville Lille (25 km par défaut, #4515), plus en texte libre', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.change(exploreField(), { target: { value: 'dev vue à lille' } })
    await launchFromRail()
    const filters = (lastRequest()?.query as DiscoverRegistryQuery).filters
    expect(filters).toMatchObject({ city: 'Lille', radiusKm: 25 })
    expect(filters.freetext ?? '').toBe('')
    expect(JSON.stringify(lastRequest()?.query)).toMatch(/"vue"/)
    expect(JSON.stringify(lastRequest()?.query)).not.toMatch(/java/i)
  })

  it('les critères seuls lancent aussi, sans texte libre (« Appliquer et explorer »)', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('button', { name: discoverFr.explore.submit })
    fireEvent.click(screen.getByTestId('discover-chip-sectors'))
    fireEvent.click(screen.getAllByRole('button', { name: /^tout choisir dans /i })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: discoverFr.framing.apply }))
    expect(lastRequest()?.mode).toBe('registry')
    expect((lastRequest()?.query as DiscoverRegistryQuery).filters.freetext).toBeUndefined()
  })
})

describe('#4841 — la zone dite dans la phrase arrive dans le rail', () => {
  it('« talend en occitanie » : région 76 dans la requête, « occitanie » ne reste pas dans le texte', async () => {
    const search = '?freetext=' + encodeURIComponent('talend en occitanie')
    renderWithRouter(<Discover />, `/discover${search}`)
    await launchFromRail()
    const filters = (lastRequest()?.query as DiscoverRegistryQuery).filters
    expect(filters.region).toBe('76')
    expect(filters.freetext ?? '').not.toMatch(/occitanie/i)
    // Lot D (#4419.1, revient sur ce témoin) : la zone lue, le reste est le besoin — « talend » devient la compétence.
    expect(JSON.stringify(lastRequest()?.query)).toMatch(/talend/i)
    expect(exploreField().value).toBe('')
  })
})

describe('#4493 — un texte libre ancien s’ouvre dans le champ et n’est jamais effacé', () => {
  it('une recherche enregistrée / une URL portant `freetext` part toujours, texte conservé', async () => {
    const search = '?freetext=' + encodeURIComponent('cabinets qui recrutent des devs Python à Lyon')
    renderWithRouter(<Discover />, `/discover${search}`)
    // #4490.1 — le pré-remplissage ne lance rien : la requête part au clic.
    await launchFromRail()
    expect((lastRequest()?.query as DiscoverRegistryQuery).filters.freetext).toBe(
      'cabinets qui recrutent des devs Python à Lyon',
    )
  })

  it('le texte conservé se VOIT dans le champ (critères affichés = critères transmis) et se retire en le vidant', async () => {
    const search = '?freetext=' + encodeURIComponent('entreprises dans le secteur public')
    renderWithRouter(<Discover />, `/discover${search}`)
    await launchFromRail()
    expect(exploreField().value).toBe('entreprises dans le secteur public')
    fireEvent.change(exploreField(), { target: { value: '' } })
    expect(exploreField().value).toBe('')
  })
})

/**
 * #2489.3/D1 (décision Louis, 18/09/2026) — la mesure `?freetext=entreprises+
 * dans+le+75` : 24 résultats, 0 dans les 5 secteurs cibles. Ce test tient le
 * bout ÉCRAN : le compteur s'affiche, le bouton « chercher hors de ma cible »
 * pose `includeOutOfTarget: true` sur la requête suivante.
 */
describe('#2489.3/D1 — la cible déclarée filtre même un texte ancien, un bouton l’ignore', () => {
  it('affiche le compteur non décoratif, et le bouton bascule includeOutOfTarget', async () => {
    useDiscoverSearchSpy.mockImplementation(() => ({
      data: {
        candidates: [],
        query: {},
        degraded: [],
        coverage: null,
        targetSectorFilter: { applied: true, excludedCount: 5, excludedSectors: ['Restauration traditionnelle'] },
      },
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }))
    const search = '?freetext=' + encodeURIComponent('entreprises dans le 75')

    renderWithRouter(<Discover />, `/discover${search}`)
    await launchFromRail()
    expect(await screen.findByText(/5 résultats hors cible écartés/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /chercher hors de ma cible/i }))

    expect((lastRequest()?.query as DiscoverRegistryQuery).includeOutOfTarget).toBe(true)
  })
})

/**
 * #3646 — « Laura comprend toujours une demande de découverte ». On REJOUE le
 * tour : entrée (« cabinets du secteur tech à Paris ») → outil `find_accounts`
 * (critères composés par Laura) → lien `discoverSearch` → Découvrir : les
 * critères arrivent sur le rail, sans AUCUNE saisie libre, et la recherche part.
 *
 * Question exacte à poser en recette, dans /chat : « Trouve-moi des ESN du
 * secteur tech à Paris » → la carte propose Découvrir ; son clic ouvre /discover
 * avec « préparé par Laura », secteur + département visibles dans le rail, et
 * des résultats — jamais une grande saisie pré-remplie.
 */
describe('#3646 — Laura prépare la recherche par les critères (tour rejoué)', () => {
  it('find_accounts → /discover : critères posés, recherche lancée, champ libre laissé vide', async () => {
    useDiscoverSearchSpy.mockImplementation(() => ({
      data: undefined,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    }))
    const search = discoverSearch({
      action: 'find_accounts',
      sectors: ['software_tech'],
      department: '75',
    } as Parameters<typeof discoverSearch>[0])
    expect(search.laura).toBe('1')
    expect(search.freetext).toBeUndefined()

    renderWithRouter(<Discover />, `/discover?${new URLSearchParams(search).toString()}`)

    expect(await screen.findByText(/Préparé par .* depuis ta conversation/)).toBeInTheDocument()
    // #4490.1 — Laura pré-remplit, rien ne part avant le clic.
    expect(lastRequest() ?? null).toBeNull()
    expect(exploreField().value).toBe('')
    expect(screen.getByRole('group', { name: discoverFr.chips.aria })).toBeInTheDocument()
    await launchFromRail()
    expect(lastRequest()?.mode).toBe('registry')
    expect((lastRequest()?.query as DiscoverRegistryQuery).filters.department).toBe('75')
  })
})
