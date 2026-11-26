import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

/**
 * #2518 — « l'encart à droite est moche avec le tableau qui paraît coupé : le
 * remplacer par une MODALE, qui permettra de ne pas couper le tableau ».
 *
 * Avant ce lot, `ContactSelectionPanel` vivait en COLONNE, sibling direct du
 * tableau dans une rangée flex (`lg:w-[340px]` face à `min-w-0 flex-1`) : le
 * panneau prenait 340 px sur la largeur de l'écran, exactement ce que GA-118 /
 * GA-119 visent à éviter en bornant les COLONNES — sauf qu'ici c'est le
 * CONTENEUR du tableau entier qui rétrécissait. Le même geste (sélectionner un
 * contact) ouvre désormais une fenêtre SUPERPOSÉE (`Sheet`, `role="dialog"`) :
 * le tableau garde sa largeur pleine, la sélection ne la partage plus.
 *
 * Contenu et gestes du panneau restent ceux de `ContactSelectionPanel`,
 * inchangé — ces tests portent sur son ENVELOPPE, pas sur ce qu'il affiche.
 */

/**
 * ⚠️ Le Proxy MÉMORISE ses composants — voir `Contacts.test.tsx` pour la
 * raison complète : sans lui, `motion.div` change de type à chaque rendu et
 * React démonte tout le sous-arbre, rendant le test aveugle aux interactions.
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
  useInView: () => true,
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

function makeContact(overrides: Partial<GlobalContact> = {}): GlobalContact {
  return {
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
    ...overrides,
  }
}

const baseProps = {
  totalContacts: 0,
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  // #2158.72 — le défaut de `ContactContent` est désormais « à contacter »,
  // pas « Toutes » : les contacts de ce fichier sont SANS canal (donc hors
  // « à contacter »), la vue est épinglée sur « Toutes » pour rester
  // découplée de ce défaut.
  viewFilter: 'all' as const,
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

async function renderAndSelectAll(contacts: GlobalContact[]) {
  renderWithRouter(<ContactContent {...baseProps} contacts={contacts} totalContacts={contacts.length} />)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))
  // Théo B c1-repertoire.R13 — la sélection ouvre une BARRE ; « Plus » ouvre le panneau existant.
  await userEvent.click(within(screen.getByTestId('contacts-selection-bar')).getByRole('button', { name: 'Plus' }))
  // Deux titres portent désormais le même texte : le `SheetTitle` (`sr-only`,
  // exigé par Radix pour nommer la fenêtre) et l'entête PROPRE du panneau
  // (`ContactSelectionPanel`, visible, inchangée). On retient la dernière —
  // c'est celle du panneau, la seule que les tests suivants inspectent.
  const headings = await screen.findAllByRole('heading', { name: /contacts? sélectionné/i })
  return headings[headings.length - 1]
}

describe('ContactContent — le panneau de sélection devient une fenêtre (#2518)', () => {
  // Théo B c1-repertoire.R13 — cocher une ligne montre la barre de sélection, pas le panneau.
  it('Théo c1.R13 — une sélection montre la barre (compte, gestes), le panneau attend « Plus »', async () => {
    renderWithRouter(<ContactContent {...baseProps} contacts={[makeContact()]} totalContacts={1} />)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner Alice Martin' }))
    const bar = screen.getByTestId('contacts-selection-bar')
    expect(within(bar).getByText('1 contact sélectionné')).toBeInTheDocument()
    for (const name of ['Enregistrer une liste', 'Préparer un message', 'Préparer une séquence', 'Plus']) {
      expect(within(bar).getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Vider la sélection' }))
    expect(screen.queryByTestId('contacts-selection-bar')).not.toBeInTheDocument()
  })

  it('aucune sélection : aucune fenêtre ne se monte', () => {
    renderWithRouter(<ContactContent {...baseProps} contacts={[makeContact()]} totalContacts={1} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('une sélection ouvre le panneau dans une fenêtre superposée, pas une colonne du tableau', async () => {
    const heading = await renderAndSelectAll([makeContact()])
    // La fenêtre superposée (Radix `role="dialog"`) — pas un `<aside>` empilé
    // à côté du tableau, qui rétrécissait son conteneur.
    const dialog = heading.closest('[role="dialog"]')
    expect(dialog).not.toBeNull()
  })

  it('le tableau garde sa pleine largeur — il ne partage plus sa rangée avec le panneau', async () => {
    await renderAndSelectAll([makeContact()])
    // `{ hidden: true }` — depuis #3471 la fenêtre est NON-modale
    // (`modal={false}`, voir le test dédié plus bas) : le tableau n'est plus
    // `aria-hidden` pendant que le panneau est ouvert, l'option est donc sans
    // effet ici. On la garde pour vérifier une propriété STRUCTURELLE du DOM
    // (le panneau ne contient pas le tableau) quel que soit l'état
    // d'accessibilité du reste de la page.
    const table = screen.getByRole('table', { hidden: true })
    // #2518 — avant ce lot, le tableau et le panneau étaient tous deux DANS le
    // même conteneur flex-row (`lg:flex-row`) : le tableau était le frère
    // direct de la fenêtre. Une fenêtre en PORTAIL (Sheet) sort du DOM normal
    // de la page — elle n'est donc plus un sibling du tableau, qui redevient
    // libre de toute sa largeur.
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(table)).toBe(false)
    expect(table.closest('.lg\\:flex-row')).toBeNull()
  })

  it('la croix du panneau referme la fenêtre — c’est le même geste qu’avant, la sélection se vide', async () => {
    await renderAndSelectAll([makeContact()])
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le panneau de sélection' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // #3471 — la fenêtre était modale : son fond couvrait toute la page et
  // interceptait le clic destiné à la case d'une 2e ligne, qui ne pouvait
  // donc jamais s'ajouter à la sélection à la souris.
  it('#3471 — cocher une 2e ligne depuis le tableau l’ajoute à la sélection sans fermer le panneau', async () => {
    const alice = makeContact({ id: 'c1', full_name: 'Alice Martin' })
    const bob = makeContact({ id: 'c2', full_name: 'Bob Dupont' })
    renderWithRouter(<ContactContent {...baseProps} contacts={[alice, bob]} totalContacts={2} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner Alice Martin' }))
    await userEvent.click(within(screen.getByTestId('contacts-selection-bar')).getByRole('button', { name: 'Plus' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Bob Dupont' }))

    // Le panneau reste ouvert — le clic sur la 2e case n'a pas été intercepté
    // par le fond de la fenêtre, et ne l'a donc pas refermée.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Bob Dupont' })).toBeChecked()
    const headings = await screen.findAllByRole('heading', { name: /2 contacts sélectionnés/i })
    expect(headings.length).toBeGreaterThan(0)
  })

  // #3471 (recette 01/10, partiel) — le panneau fixe recouvrait ~350 px du
  // tableau. Le tableau doit se réserver la largeur du panneau tant qu'une
  // sélection existe, et la rendre quand elle est vide.
  it('#3471 — le tableau réserve la largeur du panneau seulement pendant une sélection', async () => {
    const alice = makeContact({ id: 'c1', full_name: 'Alice Martin' })
    renderWithRouter(<ContactContent {...baseProps} contacts={[alice]} totalContacts={1} />)
    const area = await screen.findByTestId('contacts-list-area')
    expect(screen.getByTestId('contacts-content-root').className).not.toContain('lg:pr-')
    expect(area.className).not.toContain('min-w-')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner Alice Martin' }))
    // Théo c1.R13 — sans « Plus », la barre seule : aucune réserve de largeur.
    expect(screen.getByTestId('contacts-content-root').className).not.toContain('lg:pr-')
    await userEvent.click(within(screen.getByTestId('contacts-selection-bar')).getByRole('button', { name: 'Plus' }))
    // #3471 (reste) — la réserve est posée sur TOUT le contenu (barre d'outils
    // et boutons d'en-tête compris), pas seulement sur le tableau : sinon le
    // panneau fixe masque Kanban / Laura / Export.
    await waitFor(() => expect(screen.getByTestId('contacts-content-root').className).toContain('lg:pr-[25.75rem]'))
    expect(screen.getByTestId('contacts-list-area').className).not.toContain('lg:pr-')
    // #3471 — et il ne s'écrase pas : plancher de largeur sur le tableau (défilement horizontal).
    // #3713.b — (52 rem avant la recette 10/10) (5 colonnes composées, plus 11 : le 72 rem d'origine poussait « Suivi »
    // hors de l'écran dès qu'un panneau de 25,75 rem était réservé à droite, à 1512 px).
    // #3713 (recette 10/10) — le plancher de 52 rem (832 px) dépassait le conteneur (722 px à 1512 px) : « Suivi »
    // coupé. Pendant une sélection, la colonne SECONDAIRE « Relation » cède (data-column) et le plancher tombe à 40 rem.
    const areaClass = screen.getByTestId('contacts-list-area').className
    expect(areaClass).toContain('lg:[&_table]:min-w-[40rem]')
    expect(areaClass).toContain('lg:[&_[data-column=relation]]:hidden')
    // #3713 (recette 10/10, reste) — à 1440 px, « Suivi » mesurait 137 px (19 % de 722) : en sélection, les parts
    // sont redistribuées sur les 4 colonnes restantes (somme 100 %) et « Suivi » monte à 28 % (≥ 200 px de 722).
    for (const part of ['identity]]:w-[32%]', 'contact]]:w-[18%]', 'company]]:w-[22%]', 'commercial]]:w-[28%]']) {
      expect(areaClass).toContain(`lg:[&_[data-column=${part}`)
    }
    expect(areaClass).not.toContain('52rem')
    expect(areaClass).not.toContain('72rem')
    // Et le panneau est borné au viewport dynamique, pas à un 100% qui déborde.
    expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-1.5rem)]')
  })

  // #3471 (recette 02/10) — « Ajouter un contact / Importer / Créer une cible » vivent dans `ContactsIntro`,
  // FRÈRE de `ContactContent` : sa réserve de largeur ne les couvrait pas. La sélection est annoncée au parent.
  it('#3471 — la sélection est annoncée au parent, pour qu’il réserve aussi la largeur de l’en-tête', async () => {
    const onSelectionActiveChange = vi.fn()
    const alice = makeContact({ id: 'c1', full_name: 'Alice Martin' })
    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={[alice]}
        totalContacts={1}
        onSelectionActiveChange={onSelectionActiveChange}
      />,
    )
    await screen.findByTestId('contacts-list-area')
    expect(onSelectionActiveChange).toHaveBeenLastCalledWith(false)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner Alice Martin' }))
    await waitFor(() => expect(onSelectionActiveChange).toHaveBeenLastCalledWith(true))
  })
})
