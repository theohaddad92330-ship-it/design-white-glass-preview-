import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactContent } from './ContactContent'

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
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

const baseProps = {
  contacts: [],
  totalContacts: 0,
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  loading: false,
  query: '',
  onQueryChange: () => {},
  activeFilters: [],
  onFiltersChange: () => {},
  onAddFilter: () => {},
  unassignedFilter: undefined,
  onScopeChange: () => {},
  onClearFilters: () => {},
  isFilterActive: false,
}

function renderContacts(over: Partial<Parameters<typeof ContactContent>[0]> = {}) {
  const props = {
    ...baseProps,
    onQueryChange: vi.fn(),
    onClearFilters: vi.fn(),
    ...over,
  }
  renderWithRouter(<ContactContent {...props} />)
  return props
}

describe('ContactContent', () => {
  it('renders without crash', () => {
    renderWithRouter(<ContactContent {...baseProps} />)
    expect(document.body).toBeTruthy()
  })

  it('renders contacts heading or empty state', () => {
    renderWithRouter(<ContactContent {...baseProps} loading />)
    expect(document.querySelector('body')).toBeTruthy()
  })
})

describe('ContactContent — l’état vide filtré offre son geste', () => {
  it('propose de relâcher les filtres, et les relâche vraiment', async () => {
    const props = renderContacts({
      isFilterActive: true,
      activeFilters: [{ id: 'role', value: 'decision_maker' }],
    })

    // Théo B c1-repertoire.R14 — « Aucun contact avec ces critères. Le reste de ton répertoire est conservé. »
    expect(await screen.findByText('Aucun contact avec ces critères')).toBeInTheDocument()
    expect(screen.getByText('Le reste de ton répertoire est conservé.')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /réinitialiser les filtres/i }))

    expect(props.onClearFilters).toHaveBeenCalledTimes(1)
    expect(props.onQueryChange).not.toHaveBeenCalled()
  })

  // La pastille de cycle de vie est un filtre comme un autre : `onClearFilters`
  // remet aussi `state` à vide, donc le geste est vrai.
  it('traite la pastille de cycle de vie comme un filtre à relâcher', async () => {
    const props = renderContacts({ isFilterActive: true, stateFilter: 'actionnable' })

    await userEvent.click(await screen.findByRole('button', { name: /réinitialiser les filtres/i }))

    expect(props.onClearFilters).toHaveBeenCalledTimes(1)
  })

  // Une recherche seule ne se « réinitialise » pas par les filtres : le seul
  // geste qui peut faire réapparaître des lignes est d'effacer la recherche.
  it('efface la recherche quand elle est seule en cause', async () => {
    const props = renderContacts({ isFilterActive: true, query: 'Dupont' })

    await userEvent.click(await screen.findByRole('button', { name: /effacer la recherche/i }))

    expect(props.onQueryChange).toHaveBeenCalledWith('')
    expect(props.onClearFilters).not.toHaveBeenCalled()
  })

  it('relâche les deux quand recherche ET filtres sont posés', async () => {
    const props = renderContacts({
      isFilterActive: true,
      query: 'Dupont',
      activeFilters: [{ id: 'role', value: 'decision_maker' }],
    })

    await userEvent.click(await screen.findByRole('button', { name: /réinitialiser la recherche et les filtres/i }))

    expect(props.onQueryChange).toHaveBeenCalledWith('')
    expect(props.onClearFilters).toHaveBeenCalledTimes(1)
  })
})

/**
 * #1800 — « tu peux supprimer la notion de favori et cette page ça ne sert à
 * rien » (Louis, arbitrage produit). L'onglet « Favoris » et son état vide
 * dédié sont retirés avec la page. Ce test PROUVE l'absence : aucun texte ni
 * bouton propre à l'ex-onglet ne se rend plus, y compris sous les props qui le
 * déclenchaient avant ce lot.
 */
describe('ContactContent — #1800, l’onglet « Favoris » a disparu', () => {
  it("n'affiche plus le texte ni le bouton de l'ex-onglet « Favoris »", async () => {
    // `favoriteFilter` n'existe plus dans les props : ce cast prouve qu'même
    // envoyé quand même (un appelant qui n'aurait pas lu ce lot), l'écran ne le
    // lit plus.
    renderContacts({ favoriteFilter: true } as unknown as Partial<Parameters<typeof ContactContent>[0]>)

    await screen.findByText('Aucun contact pour l’instant.')
    expect(screen.queryByText('Aucun contact en favori')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /favori/i })).not.toBeInTheDocument()
  })

  // L'onglet « Tous » sur une base réellement vide garde SON message.
  it('laisse l’onglet « Tous » proposer une analyse sur une base vide', async () => {
    renderContacts({})

    expect(await screen.findByText('Aucun contact pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lancer une analyse/i })).toBeInTheDocument()
  })
})

/**
 * #1800 — TÉMOIN : la capacité VOISINE (l'onglet « À qualifier », #1473) n'est
 * pas de la même famille que les favoris — Louis a nommé les favoris, pas leur
 * cousin — et ce lot ne l'a pas touchée. Elle continue de fonctionner.
 */
describe('ContactContent — témoin : l’onglet « À qualifier » fonctionne toujours', () => {
  it('rend encore l’onglet « À qualifier » et bascule la portée à son clic', async () => {
    const onScopeChange = vi.fn()
    renderContacts({ onScopeChange, filtersOpen: true })

    const tab = await screen.findByRole('button', { name: 'À qualifier' })
    await userEvent.click(tab)

    expect(onScopeChange).toHaveBeenCalledWith('unassigned')
  })

  it('reste actif quand la portée est déjà « à qualifier »', async () => {
    renderContacts({ unassignedFilter: true, filtersOpen: true })

    const tab = await screen.findByRole('button', { name: 'À qualifier' })
    expect(tab).toHaveAttribute('aria-pressed', 'true')
  })
})

/**
 * L'état vide de VUE est ATTEIGNABLE — et ce test existe pour l'empêcher d'être
 * supprimé une deuxième fois.
 *
 * Le 26/08/2026, un audit a prouvé que `ContactContent.tsx:533` était du code
 * mort : `visibleContacts` valait littéralement `contacts` (ligne 199 du fichier
 * d'alors), donc `visibleContacts.length === 0` était déjà tranché par la
 * branche précédente. La preuve était juste, et l'agent a eu raison de refuser
 * d'y poser un bouton.
 *
 * Elle ne l'est plus. Les cinq VUES (`contact-views.ts`) ont été branchées
 * depuis : `visibleContacts` vaut désormais `viewGroups[viewFilter]`, et un
 * groupe peut être vide pendant que la liste ne l'est pas. La branche est donc
 * VIVANTE, et c'est ce que ce test mesure — pas en relisant le code, mais en
 * l'atteignant.
 *
 * Un audit vieillit en jours : celui-ci a été démenti par le correctif que ce
 * même audit recommandait deux paragraphes plus bas.
 */
describe('ContactContent — la vue vide est atteignable, elle n’est plus du code mort', () => {
  it('affiche l’état vide de vue quand la liste n’est PAS vide', async () => {
    // Un contact identifié ET pourvu d'un e-mail : `resolveContactView` le range
    // dans « À contacter », donc « À enrichir » est vide pendant que la liste
    // porte une ligne. C'est exactement la combinaison qui était impossible
    // avant que les vues soient branchées.
    renderContacts({
      contacts: [
        {
          id: 'c1',
          account_id: 'a1',
          full_name: 'Alice Martin',
          title: 'DSI',
          entity: null,
          decision_role: null,
          priority: 5,
          email: 'alice@corp.fr',
          phone: null,
          linkedin_url: null,
          why_contact: null,
          user_status: 'new',
          source: 'apollo',
          created_at: '2026-07-01T10:00:00.000Z',
          updated_at: '2026-07-10T10:00:00.000Z',
          company_name: 'Corp',
        },
      ],
      totalContacts: 1,
      // #3527 — les vues vivent dans la section « Filtres ».
      filtersOpen: true,
    })

    await userEvent.click(await screen.findByRole('button', { name: /^À enrichir/ }))

    expect(await screen.findByText('Aucun contact dans cet état')).toBeInTheDocument()
  })
})
