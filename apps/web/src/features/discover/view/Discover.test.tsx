import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverFr from '@/i18n/locales/fr/discover.json'
import { Discover } from './Discover'

// Le module de route est mocké — l'importer pour de vrai ferait une boucle
// (la route importe cet écran, cf. `Discover.tsx`) ET traînerait la coquille
// entière (`CustomerPage` → nav → `@bellum/utils`) dans un test qui ne teste
// que la vue. Même patron que `MissionsPage.test.tsx`. `class` absent =
// « toutes » (comportement inchangé) ; le filtre de classe a ses propres
// tests dans `Discover.accessClassSearch.test.tsx`.
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

/**
 * #2467 — ouvre le rail de recherche, replié à l'arrivée depuis le 16/09/2026.
 * Sans clic, son contenu n'est pas seulement masqué : il n'est pas dans le DOM
 * (`CollapsedSection` ne monte rien tant qu'il est fermé).
 */
async function ouvrirLeRail() {
  const entete = await screen.findByRole('button', { name: /^explorer$/i })
  if (entete.getAttribute('aria-expanded') === 'false') fireEvent.click(entete)
}

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

// `renderWithRouter` provides a session with `user: null`, so no discovery request
// fires here (no network) and the page renders its initial state. Queries are async
// because the router resolves the route on a microtask.
describe('Discover', () => {
  it('renders without crash', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    expect(await screen.findByRole('button', { name: /^explorer$/i })).toBeInTheDocument()
  })

  /**
   * #1903.23 / #1933.7 — « Laura a préparé cette vue » était ABSENT : arriver
   * depuis `find_accounts` (Copilote) posait déjà les critères dans l'URL
   * (`filtersFromSearch`), mais rien à l'écran ne le disait. La mention ne fige
   * rien : le rail reste le composant existant, entièrement modifiable.
   *
   * `laura=1` (#2165.64) : depuis que l'écran ÉCRIT lui-même ses filtres dans
   * l'URL à chaque recherche lancée, les mêmes clés (`keywords`…) peuvent venir
   * soit d'une proposition de Laura, soit d'un rechargement de SA PROPRE
   * recherche — seul ce marqueur distingue les deux (`discoverSearch`,
   * `discover-handoff.tsx`).
   */
  it('#1903.23 / #1933.7 — dit que Laura a préparé cette vue quand elle arrive préremplie', async () => {
    renderWithRouter(<Discover />, '/discover?keywords=cloud&laura=1')
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(await screen.findByText(/préparé par laura depuis ta conversation/i)).toBeInTheDocument()
  })

  /**
   * #2165.64 — LE FILTRE VIT DANS L'URL, PAS DANS LE COMPOSANT.
   *
   * Le geste empêché : un commercial affine son périmètre, recharge la page —
   * et retrouvait un rail vide jusqu'ici (seule la classe d'accès survivait).
   * Sans le marqueur `laura`, ce rechargement ne doit PAS non plus prétendre
   * que Laura a préparé la vue : ce n'est pas elle, c'est le commercial.
   */
  it('#2165.64 — un rechargement restaure les filtres SANS dire que Laura les a préparés', async () => {
    renderWithRouter(<Discover />, '/discover?keywords=cloud')
    // #2467 — sans le marqueur `laura`, le rail reste REPLIÉ (comportement par
    // défaut) : on l'ouvre soi-même pour voir ce qui a été restauré.
    await ouvrirLeRail()
    expect(screen.queryByText(/préparé par laura/i)).toBeNull()
    // La puce « Expertises » dit la compétence restaurée ; sa fenêtre la montre, modifiable.
    expect(screen.getByTestId('discover-chip-skills')).toHaveTextContent('cloud')
    fireEvent.click(screen.getByTestId('discover-chip-skills'))
    expect(screen.getByPlaceholderText(/data, cloud/i)).toHaveValue('cloud')
  })

  it('ne dit rien sans préremplissage — la mention n’est pas un décor permanent', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.queryByText(/préparé par laura/i)).toBeNull()
  })

  /**
   * L'écran s'OUVRE sur ses commandes (Louis, 01/09/2026) : « ça prend de la
   * place pour rien ». Trois lignes de paragraphe expliquaient le rail avant
   * qu'on puisse le voir — et elles répétaient une promesse déjà écrite dans la
   * carte « Notre méthode », à deux cents pixels de là.
   */
  it('n’ouvre pas sur un paragraphe d’explication', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.queryByText(/un seul rail de filtres/i)).toBeNull()
  })

  it('garde la promesse « explorer est libre » — elle vit dans la carte « méthode »', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    // Dite UNE fois, et pas zéro : c'est ce qui distingue « ranger » de « perdre ».
    expect(screen.getAllByText(/Explorer est libre/i).length).toBe(1)
  })

  // Le cœur du chantier §18-19 : UN seul rail croisable en trois groupes remplace
  // les trois modes exclusifs. Perdre un groupe en silence viderait la refonte.
  // Depuis le 01/09/2026 les groupes vivent dans la modale « Tous les filtres »
  // — même rail croisable, rangé pour qu'une recherche se lance sans défiler.
  it('exposes ONE crossable search, framed in the rubrics of « Cadrer la recherche » (#4494)', async () => {
    renderWithRouter(<Discover />)
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    // #4530 — le point de départ UNIQUE est le bouton « Ma cible » dans la barre (plus de panneau « Ta cible »).
    expect(screen.getByRole('button', { name: /^ma cible$/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /tous les filtres/i }))
    const nav = within(screen.getByRole('navigation', { name: discoverFr.framing.navAria }))
    for (const label of ['Entreprises', 'Territoire', 'Expertises', 'Signaux', 'Relation'])
      expect(nav.getByText(label)).toBeInTheDocument()
    // Le pied dit « Appliquer et explorer » : le brouillon devient la recherche, et elle part.
    expect(screen.getByRole('button', { name: discoverFr.framing.apply })).toBeInTheDocument()
    // Plus de trois onglets exclusifs.
    expect(screen.queryByRole('button', { name: /^par critères$/i })).not.toBeInTheDocument()
  })

  // Multi-sélection de secteurs (maquette) ET signaux d'intention dans la MÊME recherche.
  it('crosses sectors (multi) and intent signals in the same search', async () => {
    renderWithRouter(<Discover />)
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    fireEvent.click(screen.getByTestId('discover-chip-sectors'))
    expect(screen.getByRole('region', { name: /^technologies et médias$/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /^banque, finance, assurance$/i })).toBeInTheDocument()
    // Le secteur dans « Entreprises », le signal dans « Signaux » : les deux se cumulent dans le même brouillon.
    fireEvent.click(screen.getByTestId('framing-section-signals'))
    expect(screen.getByRole('button', { name: /^recrutement$/i })).toBeInTheDocument()
  })

  // Restitution V2 §17 : l'accès au panneau « comptes comparables ».
  // #2486 — « Expliquer la méthode » n'est plus offerte à l'ARRIVÉE : la carte
  // méthode y est déjà dépliée, la bascule ne changeait rien. Sa présence après
  // une recherche est tenue par `Discover.commandes.test.tsx`.
  // #3081 (beta, 26/09/2026) — le raccourci « Laisse Bellum proposer tes
  // prochaines cibles » (lancement immédiat, à côté de la saisie libre) est
  // retiré à la demande de Louis : seul reste le point de départ UNIQUE de
  // `DiscoverSidebar`, qui pré-remplit sans jamais lancer seul (#2493).
  it('exposes the top actions: comparable accounts', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.queryByRole('button', { name: /proposer tes prochaines cibles/i })).not.toBeInTheDocument()
    // Lot U — « Comptes comparables » vit dans le menu ⋯ (nommé, tabulable).
    await userEvent.click(screen.getByRole('button', { name: discoverFr.market.moreActions }))
    expect(await screen.findByRole('menuitemcheckbox', { name: /comptes comparables/i })).toBeInTheDocument()
  })

  // L'écran n'ouvre pas sur « choisissez un périmètre » : il propose la recherche
  // que Bellum lancerait, à côté de la méthode qui la produit.
  it('opens on the 3-step method instead of demanding a scope', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.queryByText(/laisse bellum trouver tes meilleures opportunités/i)).not.toBeInTheDocument()
    expect(screen.getByText(/notre méthode en 3 étapes/i)).toBeInTheDocument()
    expect(screen.queryByText(/choisissez un périmètre/i)).not.toBeInTheDocument()
  })
})
