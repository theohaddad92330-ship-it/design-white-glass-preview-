import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/**
 * #3597 — UNE SEULE LISTE sur /discover (comptes), décision Louis 04/10/2026 :
 * « trop compliqué et sincèrement moche » — les mêmes comptes étaient rendus
 * trois fois (prioritaires, passe rapide, cartes pleine largeur).
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

beforeEach(() => {
  cleanup()
  searchResult.mockReset()
  savedSearches.mockReturnValue({ searches: [], save: vi.fn(), remove: vi.fn(), markRun: vi.fn() })
})

describe('#3597.1 — une seule liste, une ligne compacte par compte', () => {
  it('rend chaque compte UNE fois : ni cartes, ni panneau de prioritaires, ni panneau de passe rapide', async () => {
    mockResponse(responseOf(8))
    await openResults()

    expect(rows()).toHaveLength(8)
    for (let index = 1; index <= 8; index += 1) {
      expect(screen.getAllByText(`Compte 0${index}`)).toHaveLength(1)
    }
    expect(screen.queryByTestId('candidate-card')).toBeNull()
    expect(screen.queryByText(/comptes prioritaires/i)).toBeNull()
    expect(screen.queryByText(/remplaçants/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /passe rapide sur/i })).toBeNull()
  })

  it('#3597.4 — plus de sélecteur liste / cartes', async () => {
    mockResponse(responseOf(3))
    await openResults()
    expect(screen.queryByRole('button', { name: /^grille$/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /affichage/i })).toBeNull()
  })
})

describe('Refonte Théo — douze comptes par page (remplace « Voir 10 de plus », #3597.5)', () => {
  const page = (number: number) => screen.getByRole('button', { name: `Page ${number}` })

  it('douze au départ, « 1–12 sur 24 comptes » ; la page 2 montre les douze suivants SANS rappeler la recherche', async () => {
    mockResponse(responseOf(24))
    await openResults()
    expect(rows()).toHaveLength(12)
    expect(screen.getByText('1–12 sur 24 comptes')).toBeInTheDocument()
    expect(page(1)).toHaveAttribute('aria-current', 'page')
    const limitBefore = (searchResult.mock.calls.at(-1)?.[0] as DiscoverRequest).query.limit

    fireEvent.click(page(2))
    expect(rows()).toHaveLength(12)
    expect(screen.getByText('Compte 13')).toBeInTheDocument()
    expect(screen.queryByText('Compte 01')).toBeNull()
    expect(screen.getByText('13–24 sur 24 comptes')).toBeInTheDocument()
    // Changer de page dans le chargé est gratuit et instantané : la requête ne change pas.
    expect((searchResult.mock.calls.at(-1)?.[0] as DiscoverRequest).query.limit).toBe(limitBefore)
  })

  it('au bout du chargé, la page était pleine : « Charger d’autres comptes » élargit la requête', async () => {
    mockResponse(responseOf(24))
    await openResults()
    const limitBefore = (searchResult.mock.calls.at(-1)?.[0] as DiscoverRequest).query.limit
    expect(limitBefore).toBe(24)
    // Pas sur la première page : il reste du chargé à lire.
    expect(screen.queryByTestId('discover-show-more')).toBeNull()

    fireEvent.click(page(2))
    fireEvent.click(screen.getByTestId('discover-show-more'))
    const limitAfter = (searchResult.mock.calls.at(-1)?.[0] as DiscoverRequest).query.limit
    expect(limitAfter).toBeGreaterThan(limitBefore)
    expect(limitAfter).toBeLessThanOrEqual(50)
  })

  it('SAIT DIRE NON — une seule page : ni numéros ni « Charger d’autres comptes »', async () => {
    mockResponse(responseOf(8))
    await openResults()
    expect(rows()).toHaveLength(8)
    expect(screen.queryByRole('button', { name: 'Page 1' })).toBeNull()
    expect(screen.queryByTestId('discover-show-more')).toBeNull()
  })

  it('la source épuisée (17 < 24 demandés) : la dernière page montre le reste, aucun bouton pour en charger', async () => {
    mockResponse(responseOf(17))
    await openResults()
    expect(rows()).toHaveLength(12)
    fireEvent.click(page(2))
    expect(rows()).toHaveLength(5)
    expect(screen.queryByTestId('discover-show-more')).toBeNull()
  })

  it('« Filtrer les résultats affichés… » ne garde que les noms qui correspondent, sans relancer la recherche', async () => {
    mockResponse(responseOf(24))
    await openResults()
    const calls = searchResult.mock.calls.length
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrer les résultats affichés' }), {
      target: { value: 'compte 2' },
    })
    expect(rows().map(row => row.getAttribute('aria-label'))).toEqual([
      'Compte 20',
      'Compte 21',
      'Compte 22',
      'Compte 23',
      'Compte 24',
    ])
    const lastLimit = (searchResult.mock.calls.at(-1)?.[0] as DiscoverRequest).query.limit
    expect(searchResult.mock.calls.length).toBeGreaterThanOrEqual(calls)
    expect(lastLimit).toBe(24)
  })

  // #4631.4 / #4631.5 — l'en-tête, la tuile « Comptes à explorer » et le badge de l'onglet comptent les lignes RENDUES
  // (`listed`, filtre d'écran compris), et l'en-tête dit quelle tranche de la page est montrée (« 1–12 »).
  it('#4631.5 — la tuile et le badge d’onglet suivent le filtre d’écran : 5 lignes rendues, 5 partout', async () => {
    mockResponse(responseOf(24))
    await openResults()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrer les résultats affichés' }), {
      target: { value: 'compte 2' },
    })
    expect(rows()).toHaveLength(5)
    const tile = within(screen.getByRole('list', { name: discoverFr.overview.kpisAria })).getAllByRole('button')[0]!
    expect(tile).toHaveTextContent('5')
    expect(tile).not.toHaveTextContent('24')
    expect(screen.getByTestId('result-type-count-accounts')).toHaveTextContent('5')
  })

  it('#4631.4 — l’en-tête ajoute la tranche rendue : « 1–12 » page 1, « 13–24 » page 2, rien quand tout tient en une page', async () => {
    mockResponse(responseOf(24))
    await openResults()
    expect(screen.getByTestId('results-range')).toHaveTextContent('1–12')
    fireEvent.click(screen.getByRole('button', { name: /page suivante|suivante/i }))
    expect(screen.getByTestId('results-range')).toHaveTextContent('13–24')
  })

  it('#4631.4 — une seule page : aucune tranche (jamais « 1–5 sur 5 »)', async () => {
    mockResponse(responseOf(5))
    await openResults()
    expect(screen.queryByTestId('results-range')).toBeNull()
  })

  it('« Cette page » coche les douze comptes de la page, et les décoche', async () => {
    mockResponse(responseOf(24))
    await openResults()
    // Lot U — « Cette page » vit dans la feuille « Filtres ».
    fireEvent.click(screen.getByRole('button', { name: /^Filtres/ }))
    const box = await screen.findByRole('checkbox', { name: 'Cette page' })
    fireEvent.click(box)
    expect(screen.getByRole('checkbox', { name: 'Cette page' })).toBeChecked()
    expect(screen.getByText(/12 sélectionn/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cette page' }))
    expect(screen.getByRole('checkbox', { name: 'Cette page' })).not.toBeChecked()
  })
})

describe('#3597.3 — le verdict de passe rapide est un badge sur la ligne', () => {
  it('apparaît sur un compte dont le verdict se calcule, et manque sur un compte sans score', async () => {
    mockResponse(
      responseOf(2, index =>
        index === 1
          ? { score: 65, scoreMax: 70, signalsSearched: true, people: [], signals: [] }
          : { score: null, scoreMax: null },
      ),
    )
    await openResults()
    const [first, second] = rows()
    // #4068.3 — le badge de passe rapide a quitté la ligne : il vit dans le repliable.
    expect(within(first as HTMLElement).queryByTestId('quick-pass-badge')).toBeNull()
    // Théo decouvrir.R6 — le détail s'ouvre en tiroir « Aperçu du compte » : un compte à la fois.
    fireEvent.click(within(first as HTMLElement).getByRole('button', { name: /voir le détail du compte/i }))
    expect(screen.getByTestId('quick-pass-badge')).toHaveTextContent(/passe rapide/i)
    fireEvent.click(screen.getByRole('button', { name: /fermer l’aperçu/i }))
    // #3597.12 — sans verdict calculable, AUCUN badge : dans une liste, une
    // absence ne fait aucune ligne (doctrine, Louis 20/09/2026).
    fireEvent.click(within(second as HTMLElement).getByRole('button', { name: /voir le détail du compte/i }))
    expect(screen.queryByTestId('quick-pass-badge')).toBeNull()
  })

  // #3597.12 — recette 04/10 : une recherche registre (score seul, ni accès, ni
  // signaux interrogés, ni personnes) n'a pas de verdict — la ligne n'invente rien.
  it('#3597.12 — un compte de registre sans verdict calculable ne porte aucun badge', async () => {
    mockResponse(responseOf(3))
    await openResults()
    for (const row of rows()) {
      expect(within(row).queryByTestId('quick-pass-badge')).toBeNull()
    }
  })
})

describe('#3597.11 — l’en-tête suit la réponse la plus récente', () => {
  it('après « Charger d’autres comptes » (24 → 40), l’en-tête dit 40', async () => {
    mockResponse(responseOf(24))
    await openResults()
    // #3877 — « affichées », jamais « trouvées » ; refonte Théo — tout le chargé est atteignable par les pages.
    expect(screen.getByText(/24 entreprises affichées/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))
    mockResponse(responseOf(40))
    fireEvent.click(screen.getByTestId('discover-show-more'))
    expect(screen.getByText(/40 entreprises affichées/i)).toBeInTheDocument()
    expect(screen.queryByText(/24 entreprises affichées/i)).toBeNull()
  })
})

// Intégration XIV (#4631 / #4627) — le bandeau de zone compte les lignes que `listWindow` rend, filtre d'écran compris :
// un seul prédicat pour tout nombre annoncé au-dessus de la liste.
describe('#4627 × #4419 — le bandeau de zone sort du même prédicat que la liste (listWindow)', () => {
  const zoned = () => {
    const response = responseOf(24, index =>
      index <= 10
        ? { zone: { tier: 'city' as const } }
        : { zone: { tier: 'radius_50' as const, distanceKm: 40, place: 'Blagnac' } },
    )
    return {
      ...response,
      zoneWidening: { place: 'Toulouse', tier: 'radius_50' as const, exactCount: 10, widenedCount: 14 },
    }
  }

  it('sans filtre d’écran : « 14 ajoutés par l’élargissement »', async () => {
    mockResponse(zoned())
    await openResults()
    expect(screen.getByText(/14 ajoutés par l’élargissement/)).toBeInTheDocument()
  })

  it('le filtre d’écran ne garde que des comptes de la ville : le bandeau ne promet plus d’ajoutés', async () => {
    mockResponse(zoned())
    await openResults()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrer les résultats affichés' }), {
      target: { value: 'compte 0' },
    })
    expect(rows()).toHaveLength(9)
    expect(screen.queryByText(/ajoutés par l’élargissement/)).toBeNull()
  })
})
