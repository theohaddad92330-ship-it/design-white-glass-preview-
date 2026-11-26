import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { contactsWorkState } from '@/features/contacts/selection/contactsWorkState'
import { ContactContent } from './ContactContent'

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

const makeContact = (n: number): GlobalContact => ({
  id: `c${n}`,
  account_id: 'a1',
  full_name: `Contact ${n}`,
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
})

const baseProps = {
  contacts: [] as GlobalContact[],
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
  filtersOpen: false,
  onFiltersOpenChange: () => {},
}

function renderContacts(over: Partial<Parameters<typeof ContactContent>[0]> = {}) {
  renderWithRouter(<ContactContent {...baseProps} {...over} />)
}

describe('#3713.8 — erreur de chargement avec 0 ligne', () => {
  it('affiche l’erreur, jamais « aucun contact »', async () => {
    renderContacts({ error: true })
    expect(await screen.findByRole('alert')).toHaveTextContent(/n.ont pas pu être chargés/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/ce n.est pas « aucun contact »/i)
  })
})

// Théo B c1-repertoire.R13 — la portée vit dans la barre de sélection : « Sur cette page » quand la sélection
// tient dans la page affichée, « Sélectionner les N résultats » quand il en existe au-delà.
describe('#3701.2 — le périmètre de la sélection est nommé', () => {
  it('lignes chargées ≠ tous les résultats : « Sur cette page » et « Sélectionner les 47 résultats »', async () => {
    renderContacts({
      contacts: [1, 2, 3].map(makeContact),
      totalContacts: 47,
      hasNextPage: true,
      onLoadNextPageRows: async () => ({ rows: [], hasNextPage: false, failed: false }),
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    const bar = await screen.findByTestId('contacts-selection-bar')
    expect(within(bar).getByText('3 contacts sélectionnés')).toBeInTheDocument()
    expect(within(bar).getByText('Sur cette page')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: /sélectionner les 47 résultats/i })).toBeInTheDocument()
  })

  it('tout est chargé et coché : aucun « Sélectionner les N » qui ne sélectionnerait rien de plus', async () => {
    renderContacts({ contacts: [1, 2, 3].map(makeContact), totalContacts: 3, hasNextPage: false })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    const bar = await screen.findByTestId('contacts-selection-bar')
    expect(within(bar).queryByRole('button', { name: /sélectionner les 3/i })).not.toBeInTheDocument()
  })
})

const nextPageRows = (total: number) => async () => ({
  rows: Array.from({ length: total }, (_, i) => makeContact(i + 1)),
  hasNextPage: false,
  failed: false,
})

describe('#3701.3 — « Tous les résultats » avec revue avant traitement (47 / 250)', () => {
  it('47 résultats : revue du nombre exact, puis sélection de 47', async () => {
    renderContacts({
      contacts: [1, 2, 3].map(makeContact),
      totalContacts: 47,
      hasNextPage: true,
      onLoadNextPageRows: nextPageRows(47),
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    fireEvent.click(await screen.findByRole('button', { name: /sélectionner les 47 résultats/i }))
    const dialog = await screen.findByRole('dialog', { name: /revue/i })
    expect(within(dialog).getByText(/revue : 47 contacts/i)).toBeInTheDocument()
    // La revue lit : rien n'est coché tant que l'accord n'est pas donné.
    expect(screen.getAllByText('3 contacts sélectionnés').length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('button', { name: /sélectionner ces 47 contacts/i }))
    await waitFor(() => expect(screen.getAllByText('47 contacts sélectionnés').length).toBeGreaterThan(0))
  })

  it('250 résultats : lot exact, le bouton annonce 250', async () => {
    renderContacts({
      contacts: [1, 2, 3].map(makeContact),
      totalContacts: 250,
      hasNextPage: true,
      onLoadNextPageRows: nextPageRows(250),
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    expect(await screen.findByRole('button', { name: /sélectionner les 250 résultats/i })).toBeInTheDocument()
  })

  it('300 résultats : plafonné à 250 et dit « les autres ne sont PAS inclus »', async () => {
    renderContacts({
      contacts: [1, 2, 3].map(makeContact),
      totalContacts: 300,
      hasNextPage: true,
      onLoadNextPageRows: async () => ({
        rows: Array.from({ length: 275 }, (_, i) => makeContact(i + 1)),
        hasNextPage: true,
        failed: false,
      }),
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    fireEvent.click(await screen.findByRole('button', { name: /sélectionner les 250 premiers résultats sur 300/i }))
    const dialog = await screen.findByRole('dialog', { name: /revue/i })
    expect(within(dialog).getByText(/250 contacts sur 300 résultats/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/les autres ne sont pas inclus/i)).toBeInTheDocument()
  })

  it('annuler la revue ne change pas la sélection', async () => {
    renderContacts({
      contacts: [1, 2, 3].map(makeContact),
      totalContacts: 47,
      hasNextPage: true,
      onLoadNextPageRows: nextPageRows(47),
    })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    fireEvent.click(await screen.findByRole('button', { name: /sélectionner les 47 résultats/i }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: /revue/i })).getByRole('button', { name: /annuler/i }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /revue/i })).not.toBeInTheDocument())
    expect(screen.getAllByText('3 contacts sélectionnés').length).toBeGreaterThan(0)
  })
})

describe('#3701.8 — la revue nomme homonymes, sans e-mail et exclus, sans rien fusionner', () => {
  it('liste chaque cas à part', async () => {
    const contacts = [
      { ...makeContact(1), full_name: 'Claire Dubois', email: 'claire@a.fr' },
      { ...makeContact(2), full_name: 'Claire Dubois', email: null },
      { ...makeContact(3), full_name: 'Marc Petit', email: 'marc@a.fr', excluded_at: '2026-09-01T00:00:00Z' },
    ]
    renderContacts({ contacts, totalContacts: 3 })
    fireEvent.click(await screen.findByRole('checkbox', { name: /tout sélectionner/i }))
    fireEvent.click(await screen.findByRole('button', { name: /revoir la sélection/i }))
    const dialog = await screen.findByRole('dialog', { name: /revue/i })
    expect(within(dialog).getByText(/revue : 3 contacts/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 contact désinscrit/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 contact sans e-mail/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 nom partagé par plusieurs fiches \(jamais fusionnées\)/i)).toBeInTheDocument()
    // Les trois restent sélectionnées : la revue ne retire rien en silence.
    expect(within(dialog).queryByRole('button', { name: /sélectionner ces/i })).not.toBeInTheDocument()
  })
})

describe('#3713.9 — retour de fiche : la sélection est rendue', () => {
  it('une sélection mémorisée avant l’ouverture d’une fiche revient', async () => {
    const rows = [1, 2, 3].map(makeContact)
    contactsWorkState.save({ selected: new Map([[rows[1]!.id, rows[1]!]]), scrollY: 0 })
    renderContacts({ contacts: rows, totalContacts: 3 })
    expect((await screen.findAllByText(/1 contact sélectionné/i)).length).toBeGreaterThan(0)
    // Lue une fois, puis le magasin est vidé : une visite neuve ne la ressuscite pas.
    expect(contactsWorkState.read().selected.size).toBe(0)
  })
})
