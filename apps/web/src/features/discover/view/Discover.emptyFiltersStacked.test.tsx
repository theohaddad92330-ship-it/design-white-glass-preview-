import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'
import { chooseOption } from '@/test/select'

/**
 * #3878.1 — recette prod 09/10 : le cas « 3-4 filtres compatibles qui
 * renvoient des résultats, tous masqués par un affinage d'écran » restait
 * « non testé » faute de tirage reproductible en prod (craft rule 9 : un
 * point non prouvé par manque de cas se seede plutôt que de rester une
 * suspicion). Ce test pose ce cas : une recherche registre renvoie des
 * candidats RÉELS (`candidates.length > 0`), et le niveau de « fit » (le
 * SEUL affinage client qui agit AVANT `visible`, voir `Discover.tsx:937`,
 * `passesFit`) les masque tous — l'écran doit dire « Trop de filtres
 * empilés » (un FAIT : les résultats existent), jamais « Aucune entreprise
 * ne correspond » (qui dirait que la SOURCE n'a rien rendu, faux ici).
 *
 * Même patron de mock que `Discover.accessClassSearch.test.tsx`.
 */

const navigate = vi.fn()
let routerSearch: Record<string, unknown> = {}
const searchResult = vi.fn()
const savedSearches = vi.fn()

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
  useSavedSearches: () => savedSearches(),
  useSavedSearchesStatus: () => ({ status: 'ready', searches: [] }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: undefined }),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({ locked: false, guard: (fn: () => void) => fn, dialog: null }),
}))
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routerSearch } }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

// ⚠️ Le Proxy MÉMORISE ses composants — voir `Discover.accessClassSearch.test.tsx`
// pour le détail de ce qu'un Proxy non mémorisé casse ici.
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

function lowFitCandidate(name: string, siren: string): DiscoverCandidate {
  return {
    name,
    siren,
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 20,
    scoreMax: 100,
    // Aucun bloc mesuré : `isHighPotential` (≥ 4 blocs mesurés) rend FAUX
    // par construction — exactement ce qu'un fit « élevé » doit exclure.
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
  }
}

function nonEmptyResponse(): DiscoverResponse {
  // 3-4 filtres compatibles (secteur + zone + effectif) : la SOURCE rend des
  // candidats réels, jamais zéro — le masquage vient uniquement du fit.
  return {
    candidates: [
      lowFitCandidate('ACME', '552100554'),
      lowFitCandidate('BETA SAS', '552100555'),
      lowFitCandidate('GAMMA SARL', '552100556'),
    ],
    query: {},
    degraded: [],
    coverage: null,
  }
}

async function openResults() {
  renderWithRouter(<Discover />)
  fireEvent.click(await screen.findByRole('button', { name: /pistes rapides/i }))
  fireEvent.click(await screen.findByRole('button', { name: /comptes qui recrutent/i }))
}

beforeEach(() => {
  cleanup()
  navigate.mockReset()
  routerSearch = {}
  searchResult.mockReturnValue({ data: nonEmptyResponse(), isFetching: false, isError: false, refetch: vi.fn() })
  savedSearches.mockReturnValue({ searches: [], save: vi.fn(), remove: vi.fn() })
})

describe('Découvrir — « Trop de filtres empilés » quand la source rend des comptes que le fit masque (#3878.1)', () => {
  it('distingue le masquage par le fit d’un marché vide : jamais « Aucune entreprise ne correspond »', async () => {
    await openResults()

    // #4494 — le niveau de fit vit dans la rubrique « Relation » de « Cadrer la recherche », et s'applique
    // avec le brouillon (« Appliquer et explorer »).
    fireEvent.click(await screen.findByRole('button', { name: /tous les filtres/i }))
    fireEvent.click(screen.getByTestId('framing-section-relation'))

    // ⚠️ `ChevronSelect` (FilterRail) ne pose pas de `ariaLabel` sur son
    // `SelectField` — le menu n'a donc pas de nom accessible par lui-même
    // (défaut distinct, hors scope de #3878.1). On repère le champ par son
    // libellé VISIBLE (`Field`), comme le ferait quelqu'un qui lit l'écran.
    const fitField = (await screen.findByText('Niveau de fit')).closest('div')
    const fitSelect = within(fitField as HTMLElement).getByRole('combobox')
    await chooseOption(fitSelect, 'Fit élevé seulement')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer et explorer' }))

    expect(await screen.findByText('Trop de filtres empilés')).toBeInTheDocument()
    expect(screen.queryByText('Aucune entreprise ne correspond')).not.toBeInTheDocument()
  })
})
