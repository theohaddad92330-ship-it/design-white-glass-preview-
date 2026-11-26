import { screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Discover } from './Discover'

/** #3646 — le rail ouvre DÉPLIÉ sans recherche : on ne clique que s'il est fermé. */
async function ouvrirLeRailSiFerme() {
  const entete = await screen.findByRole('button', { name: /^explorer$/i })
  if (entete.getAttribute('aria-expanded') === 'false') fireEvent.click(entete)
}

/**
 * #2165.7 à #2165.10 / #2165.61 — le TYPE DE RÉSULTAT, de l'URL jusqu'à l'écran.
 *
 * Les projections et le sélecteur ont chacun leurs tests unitaires. Ce qu'ils ne
 * peuvent PAS prouver, et qui est précisément ce qui casse en silence : que
 * l'URL atteint l'écran, et que choisir un type CHANGE ce qui est rendu. Le
 * dépôt a déjà payé cette leçon — du code juste, calculé, testé, que personne
 * n'appelle.
 */

const routeSearch = { value: {} as Record<string, unknown> }
// L'agrégat de l'espace (lecture « Partenaires ») : hors sujet ici, rendu vide.
vi.mock('@/features/discover/hooks/usePartnerCoverage', () => ({
  usePartnerCoverage: () => ({ data: [], isLoading: false, isError: false }),
}))
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => routeSearch.value } }))

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

describe('Découvrir — le type de résultat', () => {
  beforeEach(() => {
    routeSearch.value = {}
  })

  it('#2165.61 — le sélecteur est rendu au-dessus de la liste, avec ses cinq types', async () => {
    // #2545.1 — le tableau d'appels est le cinquième type.
    renderWithRouter(<Discover />)
    // #2467 — le rail ouvre REPLIÉ depuis le 16/09/2026 : on l'ouvre comme un
    // utilisateur, d'un clic sur son en-tête, avant d'atteindre son contenu.
    await ouvrirLeRailSiFerme()
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.getByRole('radiogroup', { name: /type de résultat/i })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('#2165.10 — sans rien dans l’URL, l’écran ouvre sur les Comptes et sur eux seuls', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail ouvre REPLIÉ depuis le 16/09/2026 : on l'ouvre comme un
    // utilisateur, d'un clic sur son en-tête, avant d'atteindre son contenu.
    await ouvrirLeRailSiFerme()
    await screen.findByRole('button', { name: /^explorer$/i })
    const checked = screen.getAllByRole('radio').filter(option => option.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]).toHaveTextContent(/comptes/i)
  })

  it('#2165.7 — `?type=contacts` rend la liste de PERSONNES, et dit d’où elles viennent', async () => {
    routeSearch.value = { type: 'contacts' }
    renderWithRouter(<Discover />)
    expect(await screen.findByText(/ces personnes viennent de ton espace/i)).toBeInTheDocument()
    const checked = screen.getAllByRole('radio').filter(option => option.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]).toHaveTextContent(/contacts/i)
  })

  it('#2165.62 — le type « Contacts » n’expose PAS les commandes des comptes', async () => {
    routeSearch.value = { type: 'contacts' }
    renderWithRouter(<Discover />)
    await screen.findByText(/ces personnes viennent de ton espace/i)
    // Le tri par score et l'export sont des commandes de COMPTES : les laisser
    // là ferait croire qu'on peut trier des personnes par intérêt commercial.
    expect(screen.queryByRole('button', { name: /exporter/i })).toBeNull()
    // Les filtres de personnes, eux, sont là.
    expect(screen.getByRole('textbox', { name: /^fonction$/i })).toBeInTheDocument()
  })

  it('lot U — `?type=partners` (lien existant) ouvre « Autres acteurs », pastille Partenaires active, sans onglet mort', async () => {
    routeSearch.value = { type: 'partners' }
    renderWithRouter(<Discover />)
    await screen.findAllByRole('radio')
    const checked = screen.getAllByRole('radio').filter(option => option.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]).toHaveTextContent(/autres acteurs/i)
    expect(screen.queryByRole('radio', { name: /^partenaires/i })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Partenaires' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cabinets' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('un `?type=` inconnu rouvre sur les Comptes plutôt que de casser la page', async () => {
    routeSearch.value = { type: 'esn' }
    renderWithRouter(<Discover />)
    // #2467 — le rail ouvre REPLIÉ depuis le 16/09/2026 : on l'ouvre comme un
    // utilisateur, d'un clic sur son en-tête, avant d'atteindre son contenu.
    await ouvrirLeRailSiFerme()
    await screen.findByRole('button', { name: /^explorer$/i })
    const checked = screen.getAllByRole('radio').filter(option => option.getAttribute('aria-checked') === 'true')
    expect(checked[0]).toHaveTextContent(/comptes/i)
  })
})

/**
 * #4634 (décision Louis 26/10/2026) — « tout ce qui concerne la recherche de contact doit être fait en haut, dans le
 * volet principal de recherche ». Prouvé SUR L'ÉCRAN, projection par projection : les champs de la projection sont
 * DANS la carte de recherche, une seule fois — plus aucun sous les onglets de résultats.
 */
describe('#4634 — les critères de Contacts, Besoins et Liste d’appels vivent dans le volet', () => {
  beforeEach(() => {
    routeSearch.value = {}
  })

  const volet = () => screen.getByRole('region', { name: /quel marché veux-tu explorer/i })

  it.each([
    ['contacts', /^fonction$/i],
    ['needs', /^entreprise$/i],
    ['calls', /^fonction$/i],
  ])('?type=%s — le champ de la projection est dans le volet, et nulle part ailleurs', async (type, name) => {
    routeSearch.value = { type }
    renderWithRouter(<Discover />)
    await screen.findByTestId(`projection-search-fields-${type}`)
    const fields = screen.getAllByRole('textbox', { name })
    expect(fields).toHaveLength(1)
    expect(volet()).toContainElement(fields[0] as HTMLElement)
  })

  it('?type=contacts — la portée de l’espace se lit DEPUIS le volet', async () => {
    routeSearch.value = { type: 'contacts' }
    renderWithRouter(<Discover />)
    const scope = await screen.findByText(/ces personnes viennent de ton espace/i)
    expect(volet()).toContainElement(scope)
  })

  it('SAIT DIRE NON — en Comptes, aucun champ de projection ne s’ajoute au rail', async () => {
    renderWithRouter(<Discover />)
    await ouvrirLeRailSiFerme()
    expect(screen.queryByTestId(/^projection-search-fields-/)).toBeNull()
  })
})
