import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import type { DiscoverCandidate, DiscoverResponse } from '@/features/discover/lib/discover-types'

/**
 * #4493 (Louis 24/10, maquette V22) — la PAGE Découvrir, du haut en bas :
 * « Découvrir. » + sous-titre + Mes recherches · Nouvelle recherche → « Quel marché veux-tu explorer ? »
 * (champ libre, Explorer, puces) → TROIS pistes illustrées → (après une recherche) quatre compteurs →
 * « Répartition des comptes » → onglets de résultats avec leur compte → « Ton marché ».
 * Ce qui est défait : les quatre cartes de pistes d'avant (« Pour ton offre », « Tes références »,
 * « Détectés ») et la puce « Toutes les tailles ». Rien ne part à l'arrivée (#4490).
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
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: { priority_expertise: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'] } }),
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

const axes = (n: number): DiscoverCandidate['sourceAxes'] => ({
  score: 6,
  max: 10,
  unmeasured: [],
  axes: [
    {
      key: 'dataforge',
      max: 10,
      measured: true,
      points: 6,
      evidence: `${n} besoin(s) passé(s)`,
      label_key: 'reference_needs',
      label_params: { n, won: 0 },
      latestAt: null,
    },
  ],
})

function candidate(over: Partial<DiscoverCandidate>): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: 'Banque',
    city: 'Paris',
    department: '75',
    headcountRange: '250 à 499 salariés',
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

function response(): DiscoverResponse {
  return {
    candidates: [
      candidate({ name: 'Alpha Banque', siren: '111111111', knownNeedsCount: 2, sourceAxes: axes(3) }),
      candidate({ name: 'Beta Énergie', siren: '222222222', sector: 'Énergie', portfolioState: 'customer' }),
    ],
    query: {},
    degraded: [],
    coverage: null,
  }
}

beforeEach(() => {
  navigate.mockReset()
  searchResult.mockReturnValue({ data: response(), isFetching: false, isError: false, refetch: vi.fn() })
})

const O = discoverFr.overview
const explore = async (text: string) => {
  fireEvent.change(await screen.findByRole('searchbox', { name: discoverFr.explore.label }), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
}
/** L'ordre RÉEL des blocs dans le document : l'un précède l'autre (sait dire NON si l'ordre change). */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('#4493 — la page Découvrir au dessin de la maquette V22', () => {
  it('l’en-tête : « Découvrir. », le sous-titre, Mes recherches · Nouvelle recherche', async () => {
    renderWithRouter(<Discover />)
    const title = await screen.findByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('Découvrir.')
    expect(screen.getByText(discoverFr.subtitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: discoverFr.mySearches.entry })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: O.newSearch })).toBeInTheDocument()
  })

  it('TROIS pistes illustrées (territoire · expertise · type de client) remplacent les quatre cartes d’avant', async () => {
    renderWithRouter(<Discover />)
    const tracks = within(await screen.findByRole('list', { name: O.tracksAria })).getAllByRole('listitem')
    expect(tracks).toHaveLength(3)
    expect(tracks.map(track => track.querySelector('[data-testid]')?.getAttribute('data-testid'))).toEqual([
      'discover-track-territory',
      'discover-track-expertise',
      'discover-track-client',
    ])
    expect(screen.getByText(O.trackTerritory)).toBeInTheDocument()
    expect(screen.getByText(O.trackExpertise)).toBeInTheDocument()
    expect(screen.getByText(O.trackClient)).toBeInTheDocument()
    for (const gone of ['Pour ton offre', 'Tes références', 'Détectés']) expect(screen.queryByText(gone)).toBeNull()
  })

  it('la piste « Une expertise » montre l’expertise DÉCLARÉE et ouvre « Cadrer la recherche » sur Expertises, sans rien lancer', async () => {
    renderWithRouter(<Discover />)
    const track = await screen.findByTestId('discover-track-expertise')
    expect(track).toHaveTextContent('Cloud & Infrastructure')
    expect(track).toHaveTextContent('CI')
    fireEvent.click(track)
    const dialog = within(screen.getByRole('dialog', { name: discoverFr.framing.title }))
    expect(dialog.getByRole('heading', { name: discoverFr.framing.expertiseTitle })).toBeInTheDocument()
    expect((dialog.getByPlaceholderText(/^ex\. SAP, data, cloud/) as HTMLInputElement).value).toBe(
      'Cloud & Infrastructure',
    )
    expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ search: expect.anything() }))
  })

  it('une piste sans donnée déclarée (aucune offre) dit quoi renseigner et ne part pas', async () => {
    renderWithRouter(<Discover />)
    const territory = await screen.findByTestId('discover-track-territory')
    expect(territory).toBeDisabled()
    expect(territory).toHaveTextContent(discoverFr.presets.disabledReason.no_offer_sectors)
  })

  it('#4490 — avant toute recherche : aucun compteur, aucune répartition (jamais « 0 »)', async () => {
    renderWithRouter(<Discover />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('list', { name: O.kpisAria })).toBeNull()
    expect(screen.queryByRole('heading', { name: O.breakdownTitle })).toBeNull()
  })

  it('après « Explorer » : les compteurs mesurés, dans l’ordre de la maquette, puis répartition, onglets, « Ton marché »', async () => {
    renderWithRouter(<Discover />)
    await explore('banque')
    const kpis = within(await screen.findByRole('list', { name: O.kpisAria }))
    const labels = kpis.getAllByRole('button').map(button => button.textContent ?? '')
    expect(labels[0]).toContain(O.kpiAccounts)
    expect(labels[0]).toContain('2')
    expect(labels[0]).toContain('1 nouveau pour ton espace')
    expect(labels[1]).toContain(O.kpiNeeds)
    expect(labels[2]).toContain(O.kpiHistorical)
    expect(labels[2]).toContain('3')
    // Interlocuteurs : non mesurés ici (aucune liste de personnes) — aucun compteur, jamais « 0 ».
    expect(labels.some(label => label.includes(O.kpiContacts))).toBe(false)

    // Lot U — la répartition est REPLIÉE par défaut sur une ligne « Répartition · N secteur(s) » ; plus de « Ton marché ».
    const breakdown = screen.getByRole('button', { name: /^Répartition · \d+ secteur/ })
    expect(breakdown).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(O.breakdownNote)).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Ton marché' })).toBeNull()
    const tabs = screen.getByRole('radiogroup', { name: discoverFr.resultType.groupLabel })
    const search = screen.getByRole('search')
    const kpiList = screen.getByRole('list', { name: O.kpisAria })
    expect(before(search, kpiList)).toBe(true)
    expect(before(kpiList, breakdown)).toBe(true)
    expect(before(breakdown, tabs)).toBe(true)
    expect(within(tabs).getByTestId('result-type-count-accounts')).toHaveTextContent('2')
  })

  it('un compteur cliquable ouvre son type de résultat', async () => {
    renderWithRouter(<Discover />)
    await explore('banque')
    const kpis = within(await screen.findByRole('list', { name: O.kpisAria }))
    fireEvent.click(kpis.getByRole('button', { name: new RegExp(O.kpiNeeds) }))
    expect(navigate).toHaveBeenCalled()
  })

  it('#4495 — au-dessus des cartes : Filtrer · Trier par · Cette page ; Enregistrer · Exporter · liste / colonnes / radar', async () => {
    renderWithRouter(<Discover />)
    await explore('banque')
    await screen.findByTestId('discover-account-list')
    expect(screen.getByRole('searchbox', { name: discoverFr.listControls.filterLabel })).toBeInTheDocument()
    expect(screen.getAllByText(discoverFr.results.sortLabel).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: discoverFr.market.save })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: discoverFr.results.export })).toBeInTheDocument()
    const views = within(screen.getByRole('group', { name: discoverFr.market.viewAria }))
    expect(views.getByRole('button', { name: discoverFr.market.viewList })).toHaveAttribute('aria-pressed', 'true')
    expect(views.queryByRole('link', { name: discoverFr.market.viewRadar })).toBeNull()
    fireEvent.click(views.getByRole('button', { name: discoverFr.market.viewColumns }))
    expect(screen.getByTestId('discover-account-list')).toHaveAttribute('data-view', 'columns')
    // Les MÊMES comptes, dans les deux vues.
    expect(screen.getAllByTestId('candidate-row')).toHaveLength(2)
    // Le radar et « Cette page » restent joignables : le menu ⋯ et le panneau « Filtres ».
    await userEvent.click(screen.getByRole('button', { name: discoverFr.market.moreActions }))
    expect(await screen.findByRole('menuitem', { name: discoverFr.market.viewRadar })).toHaveAttribute(
      'href',
      '/discover/radar',
    )
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${discoverFr.listControls.filters}`) }))
    expect(await screen.findByText(discoverFr.listControls.selectPage)).toBeInTheDocument()
  })
  it('lot U — rien ne se perd : chaque filtre, action et vue d’avant est joignable (barre, panneau « Filtres » ou menu ⋯)', async () => {
    renderWithRouter(<Discover />)
    await explore('banque')
    await screen.findByTestId('discover-account-list')
    const F = discoverFr.filters
    // Barre : filtre texte, tri, compteur, UN bouton « Filtres » (aucun nombre sans filtre actif — GA-18/19), actions, vues.
    expect(screen.getByRole('searchbox', { name: discoverFr.listControls.filterLabel })).toBeInTheDocument()
    expect(screen.getAllByText(discoverFr.results.sortLabel).length).toBeGreaterThan(0)
    const filtres = screen.getByRole('button', { name: discoverFr.listControls.filters })
    expect(filtres.textContent).not.toMatch(/\d/)
    // GA-26 — « Comptes » n'est rendu que dans UNE barre ; plus de rangée de pilules ni d'onglet « Partenaires ».
    expect(screen.getAllByRole('radio', { name: /^Comptes/ })).toHaveLength(1)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('radio', { name: /^Partenaires/ })).toBeNull()
    // Panneau « Filtres » : tout le reste, et lui seul (un seul panneau de filtres — GA-26).
    await userEvent.click(filtres)
    const panel = within(await screen.findByRole('dialog'))
    expect(panel.getByRole('combobox', { name: discoverFr.family.filter })).toBeInTheDocument()
    expect(panel.getByRole('combobox', { name: discoverFr.barrier.filter })).toBeInTheDocument()
    expect(panel.getByRole('checkbox', { name: F.hideOwned })).toBeInTheDocument()
    expect(panel.getByRole('checkbox', { name: F.hideWorked })).toBeInTheDocument()
    expect(panel.getByRole('combobox', { name: F.roleFamily })).toBeInTheDocument()
    expect(panel.getByRole('combobox', { name: F.signalNature })).toBeInTheDocument()
    expect(panel.getByRole('checkbox', { name: F.directSignalsOnly })).toBeInTheDocument()
    expect(panel.getByRole('checkbox', { name: discoverFr.listControls.selectPage })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    // Un filtre actif : le bouton en porte le nombre, une puce retirable apparaît.
    await userEvent.click(panel.getByRole('checkbox', { name: F.directSignalsOnly }))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /^Filtres\s*1$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Retirer le filtre : ${F.directSignalsOnly}` })).toBeInTheDocument()
    // Menu ⋯ : comparables, méthode, radar (GA-32 : bouton nommé, tabulable).
    await userEvent.click(screen.getByRole('button', { name: discoverFr.market.moreActions }))
    expect(await screen.findByRole('menuitemcheckbox', { name: discoverFr.rail.similarToggle })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: discoverFr.market.viewRadar })).toBeInTheDocument()
  })
})
