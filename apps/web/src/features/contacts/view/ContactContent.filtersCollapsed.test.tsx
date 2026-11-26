import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContactLifecycleTally } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'
import { CONTACTS_FILTERS_PANEL_ID } from './contacts-filters-panel-id'

/**
 * #2477 — « mettre tous les filtres dans une section repliée par défaut et
 * les organiser pour les afficher plus astucieusement en prenant moins de
 * place pour rien » (Louis, 16/09/2026). L'élément mesuré en production
 * faisait 3 219 px de haut, AVANT la première ligne de contact.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #3376 — retour bêta 30/09 : PLUS DE BOUTON D'EN-TÊTE ICI
 * ─────────────────────────────────────────────────────────────────────────
 * La carte « Filtres » pleine largeur (bouton 44 px, sa propre bordure)
 * coincée entre l'entête et la barre d'outils prenait « de la place pour
 * rien ». Son déclencheur vit désormais dans `ContactsIntro`, petit, à
 * gauche du CTA « Traiter » (voir `ContactsIntro.test.tsx`) : cet écran-ci ne
 * possède plus que le CONTENU, contrôlé de l'extérieur (`filtersOpen` /
 * `onFiltersOpenChange`, `CollapsedSection` en mode `hideTrigger`) — jamais
 * un second bouton « Filtres ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ENTRE DANS LA SECTION, ET CE QUI N'Y ENTRE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le bandeau de funnel, le bouton « Ajouter un filtre » + ses chips actives
 * (`FilterBar`), et la pastille de cycle de vie (« un filtre comme un autre »,
 * cf `Contacts.test.tsx`) : repliés par défaut, comptés sur le déclencheur
 * externe (`useContactsActiveFilterCount`).
 *
 * L'onglet de PORTÉE (« Tous » / « À qualifier ») et les VUES
 * (`ContactsViewChips`) restent HORS de la section — ce sont des témoins
 * protégés ailleurs (#1800 dans `Contacts.test.tsx`) : les retirer de la vue
 * immédiate casserait un geste déjà livré pour un problème qu'il n'a pas.
 */

vi.mock('framer-motion', () => {
  const motionTags = new Map<string, any>()
  return {
    motion: new Proxy(
      {},
      {
        get: (_target: unknown, prop: string) => {
          if (typeof prop !== 'string') return undefined
          if (!motionTags.has(prop)) {
            const Component = prop
            motionTags.set(prop, ({ children, ...props }: any) => <Component {...props}>{children}</Component>)
          }
          return motionTags.get(prop)
        },
      },
    ),
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useInView: () => true,
    useReducedMotion: () => false,
    useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
    useTransform: () => 0,
  }
})

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

const tally: ContactLifecycleTally = {
  detecte: 100,
  identite_verifiee: 80,
  qualifie: 60,
  enrichi: 40,
  actionnable: 20,
  historique: 5,
  rejete: 5,
}

const CONTACT: GlobalContact = {
  id: 'c1',
  account_id: 'a1',
  full_name: 'Alice Martin',
  title: 'DSI',
  entity: null,
  decision_role: null,
  priority: 5,
  email: null,
  phone: null,
  linkedin_url: null,
  why_contact: null,
  user_status: 'new',
  source: 'apollo',
  created_at: '2026-07-01T10:00:00.000Z',
  updated_at: '2026-07-10T10:00:00.000Z',
  company_name: 'Corp',
}

const baseProps = {
  contacts: [],
  totalContacts: 0,
  lifecycleTally: undefined as ContactLifecycleTally | undefined,
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
  filtersOpen: false,
  onFiltersOpenChange: () => {},
}

function renderContacts(over: Partial<Parameters<typeof ContactContent>[0]> = {}) {
  const props = { ...baseProps, onQueryChange: vi.fn(), onClearFilters: vi.fn(), ...over }
  renderWithRouter(<ContactContent {...props} />)
  return props
}

describe('#3376 — /contacts : la section « Filtres » est un contenu piloté de l’extérieur', () => {
  it('`filtersOpen: false` : le contenu n’est pas dans le DOM', async () => {
    renderContacts({ lifecycleTally: tally, totalContacts: 100, filtersOpen: false })

    expect(screen.queryByRole('region', { name: /^filtres$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ajouter un filtre/i })).not.toBeInTheDocument()
    // Plus de bouton d'en-tête « Filtres » ICI (déplacé dans `ContactsIntro`).
    expect(screen.queryByRole('button', { name: /^filtres$/i })).not.toBeInTheDocument()
  })

  it('#3933 (retour bêta 08/10) — replié : plus de bandeau d’entonnoir, la liste vient d’abord', async () => {
    renderContacts({ lifecycleTally: tally, totalContacts: 100, filtersOpen: false })

    expect(await screen.findByTestId('contacts-content-root')).toBeInTheDocument()
    expect(screen.queryByText(/détectés/i)).not.toBeInTheDocument()
  })

  it('`filtersOpen: true` : « Ajouter un filtre » apparaît, sous le MÊME id que le déclencheur externe', async () => {
    renderContacts({ lifecycleTally: tally, totalContacts: 100, filtersOpen: true })

    const region = await screen.findByRole('dialog', { name: /affiner le répertoire/i })
    expect(region).toHaveAttribute('id', CONTACTS_FILTERS_PANEL_ID)
    expect(screen.getByRole('button', { name: /ajouter un filtre/i })).toBeInTheDocument()
  })

  // #3527 (Louis 01/10) — « une section filtres, à la place de tous ces
  // boutons qui traînent » : portée, état de travail et maturité de la donnée
  // vivent DANS la section (renverse #1800 / #3483.3a).
  it('#3527 — replié : ni portée, ni état de travail, ni maturité ne traînent à l’écran', async () => {
    renderContacts({ lifecycleTally: tally, totalContacts: 100, contacts: [CONTACT], filtersOpen: false })

    expect(screen.queryByRole('group', { name: 'Portée' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Maturité de la donnée/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'À qualifier' })).not.toBeInTheDocument()
  })

  it('#3527 — le déclencheur « Filtres » est à côté du champ de recherche', async () => {
    renderContacts()

    const trigger = await screen.findByRole('button', { name: /^filtres$/i })
    const search = screen.getByPlaceholderText('Nom, compte, fonction ou e-mail…')
    const toolbar = search.closest('.flex-wrap') as HTMLElement
    expect(toolbar).toContainElement(trigger)
    expect(search.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // #3527.2 (recette prod 02/10) — champ x273-529, bouton x1106 : le champ
  // grandissait seul, le bouton partait au bout de la ligne. Les deux partagent
  // un groupe, et le champ ne prend pas toute la place.
  it('#3527 — le déclencheur est COLLÉ au champ : même groupe, champ à largeur bornée', async () => {
    renderContacts()

    const trigger = await screen.findByRole('button', { name: /^filtres$/i })
    const search = screen.getByPlaceholderText('Nom, compte, fonction ou e-mail…')
    const group = trigger.closest('[data-search-group]') as HTMLElement
    expect(group).not.toBeNull()
    expect(group).toContainElement(search)
    expect(group.className).toMatch(/sm:flex-none/)
  })

  // Théo B c1-repertoire.R8 — le pli sous la recherche devient la modale « Affiner le répertoire » :
  // elle se nomme, dit que chaque critère s'applique tout de suite, et se referme par son bouton.
  it('Théo c1.R8 — ouvert : une modale nommée, décrite, qui se referme par « Voir les N contacts »', async () => {
    const onFiltersOpenChange = vi.fn()
    renderContacts({ filtersOpen: true, totalContacts: 100, onFiltersOpenChange })

    const dialog = await screen.findByRole('dialog', { name: /affiner le répertoire/i })
    expect(within(dialog).getByText(/s’applique tout de suite/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voir les 100 contacts' }))
    expect(onFiltersOpenChange).toHaveBeenCalledWith(false)
  })

  it('#3527 — ouvert : la portée « À qualifier » reste cliquable, légendée', async () => {
    const onScopeChange = vi.fn()
    renderContacts({ onScopeChange, filtersOpen: true })

    const group = await screen.findByRole('group', { name: 'Portée' })
    expect(within(group).getByRole('button', { name: 'Tous' })).toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: 'À qualifier' }))
    expect(onScopeChange).toHaveBeenCalledWith('unassigned')
  })

  it('#3527 — ouvert : « Maturité de la donnée » vit dans la section, une seule fois', async () => {
    renderContacts({
      lifecycleTally: tally,
      totalContacts: 100,
      contacts: [CONTACT],
      stateFilter: 'actionnable',
      filtersOpen: true,
    })

    const region = await screen.findByRole('dialog', { name: /affiner le répertoire/i })
    expect(within(region).getByText(/Maturité de la donnée/)).toBeInTheDocument()
    expect(screen.getAllByText(/Maturité de la donnée/)).toHaveLength(1)
  })

  it('#3527 — l’état de travail est sur « Toutes » par défaut', async () => {
    renderContacts({ lifecycleTally: tally, totalContacts: 100, contacts: [CONTACT], filtersOpen: true })

    const region = await screen.findByRole('dialog', { name: /affiner le répertoire/i })
    const all = within(region).getByRole('button', { name: /^Toutes/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(within(region).getByRole('button', { name: /^À contacter/ })).toHaveAttribute('aria-pressed', 'false')
  })
})

/**
 * #2484 — « /contacts, c'est super moche : applique les règles de design ».
 * Deux défauts MESURÉS sur la section que le widget désignait.
 */
describe('#2484 — la section des filtres suit les règles de design', () => {
  // Le plus grand nombre de colonnes que la grille DÉCLARE, tous paliers confondus.
  const declaredColumns = (className: string) =>
    Math.max(...[...className.matchAll(/(?:^|\s)(?:[a-z0-9]+:)?grid-cols-(\d+)/g)].map(match => Number(match[1])))

  // Théo B c1-repertoire.R8 — devenue modale, la section ne prend plus la gouttière de page : elle est
  // bornée en hauteur (`dvh`, jamais `vh`, GA-30) et défile dans sa fenêtre.
  it('la modale est bornée en hauteur (dvh) et défile, sans gouttière de page recopiée', async () => {
    renderContacts({ lifecycleTally: tally, totalContacts: 100, filtersOpen: true })

    const card = await screen.findByRole('dialog', { name: /affiner le répertoire/i })
    expect(card.className).toMatch(/max-h-\[85dvh\]/)
    expect(card.className).toMatch(/overflow-y-auto/)
    expect(card.className).not.toMatch(/(?:^|\s)md:mx-6(?:\s|$)/)
  })

  it('témoin — le compteur de colonnes lit le palier le plus large, et ignore le reste', () => {
    expect(declaredColumns('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3')).toBe(3)
    expect(declaredColumns('grid grid-cols-1 gap-3 md:grid-cols-2')).toBe(2)
    expect(declaredColumns('grid grid-cols-1 gap-3 col-span-4')).toBe(1)
  })
})
