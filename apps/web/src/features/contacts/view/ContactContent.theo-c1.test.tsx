import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

/**
 * Théo B c1-repertoire / #4503 (contrat Louis 24/10) — la STRUCTURE de l'écran, du haut en bas : en-tête → bandeau
 * de liste → synthèse « Un réseau à faire vivre » → barre d'outils → puces (+ bascule Tous · Recommandés) →
 * tableau (Contact & fonction · Compte · Coordonnées · Relation · Origine) → pied paginé. Le bandeau des doublons
 * a QUITTÉ la liste (#4503.7, onglet Imports & sources).
 *
 * Ce test sait dire NON : un bloc déplacé, une colonne remise dans l'ancien ordre, une puce disparue, le bandeau
 * des doublons revenu ou le pied « Charger plus » revenu le font tomber.
 */

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) =>
        typeof prop === 'string'
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ children, ...props }: any) => {
              const Component = prop as 'div'
              return <Component {...props}>{children}</Component>
            }
          : undefined,
    },
  ),
  useInView: () => true,
  useReducedMotion: () => false,
}))

// #4503.4 — la liste « ne pas contacter » de l'espace : `c2` y figure (contact), `c3` par le domaine de son adresse.
vi.mock('@/features/team-guardrails/hooks', () => ({
  useDoNotContactList: () => ({
    data: {
      items: [
        {
          id: 'd1',
          kind: 'contact',
          contact_id: 'c2',
          contact_name: null,
          domain: null,
          reason: 'Refus',
          added_by: 'u',
          added_by_name: 'Théo',
          created_at: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'd2',
          kind: 'domain',
          contact_id: null,
          contact_name: null,
          domain: 'opposant.fr',
          reason: 'Client',
          added_by: 'u',
          added_by_name: 'Théo',
          created_at: '2026-10-01T00:00:00.000Z',
        },
      ],
    },
  }),
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

function contact(index: number): GlobalContact {
  return {
    id: `c${index}`,
    account_id: 'a1',
    full_name: `Personne ${index}`,
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: `p${index}@corp.fr`,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
  }
}

const baseProps = {
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
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

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Théo B c1-repertoire — l’ordre des blocs et des colonnes', () => {
  it('en-tête → synthèse → barre d’outils → puces → tableau → pied ; plus de bandeau des doublons', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => contact(i + 1))
    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={rows}
        totalContacts={30}
        renderIntro={laura => (
          <header data-testid="intro">
            <h1>Contacts</h1>
            {laura}
          </header>
        )}
      />,
    )
    const intro = await screen.findByTestId('intro')
    const overview = screen.getByTestId('contacts-network-overview')
    // #4503.3 — la recherche dit ce qu'elle cherche : nom, compte, fonction, e-mail.
    const search = screen.getByPlaceholderText('Nom, compte, fonction ou e-mail…')
    const chips = screen.getByTestId('contacts-quick-chips')
    const toggle = screen.getByTestId('contacts-recommended-toggle')
    const table = screen.getByRole('table')
    const foot = screen.getByTestId('contacts-table-foot')
    const order = [intro, overview, search, chips, toggle, table, foot]
    for (let i = 0; i < order.length - 1; i += 1) expect(before(order[i]!, order[i + 1]!), `bloc ${i}`).toBe(true)
    // « Demander à Laura » n'est plus dans la barre d'outils : l'en-tête le reçoit (`renderIntro`).
    expect(screen.queryByText(/Demander à .* sur mes contacts/)).toBeNull()
    expect(within(overview).getByText('Un réseau à faire vivre')).toBeInTheDocument()
    // #4503.7 — « N doublons à relire » a quitté la liste.
    expect(screen.queryByText(/doublons? à relire/)).not.toBeInTheDocument()
  })

  it('#4527.3 — liste vide sous critères : ni héro « 0 » ni tuiles à 0, seul l’état vide parle', async () => {
    renderWithRouter(<ContactContent {...baseProps} query="zzzqqxx" isFilterActive contacts={[]} totalContacts={0} />)
    expect(await screen.findByText('Aucun contact avec ces critères')).toBeInTheDocument()
    expect(screen.queryByTestId('contacts-network-overview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('contacts-overview-total')).not.toBeInTheDocument()
  })

  it('les colonnes, dans l’ordre de la maquette', async () => {
    renderWithRouter(<ContactContent {...baseProps} contacts={[contact(1)]} totalContacts={1} />)
    await screen.findByRole('table')
    const headers = screen.getAllByRole('columnheader').map(header => header.textContent?.trim())
    expect(headers).toEqual(['Contact & fonction', 'Compte', 'Coordonnées', 'Relation', 'Origine'])
  })

  it('les puces : Tous, À contacter, Avec e-mail, Avec téléphone, À rattacher, Ne pas solliciter, puis les quatre vues gardées', async () => {
    renderWithRouter(<ContactContent {...baseProps} contacts={[contact(1)]} totalContacts={1} />)
    const chips = await screen.findByTestId('contacts-quick-chips')
    expect(
      within(chips)
        .getAllByRole('button')
        .map(chip => chip.textContent),
    ).toEqual([
      'Tous',
      'À contacter',
      'Avec e-mail',
      'Avec téléphone',
      'À rattacher',
      'Ne pas solliciter',
      'À enrichir',
      'À vérifier',
      'Déjà connus',
      'Masqués',
    ])
  })

  it('une puce écrit le réglage existant : « Avec téléphone » pose le filtre canal, « À rattacher » la portée', async () => {
    const onAddFilter = vi.fn()
    const onScopeChange = vi.fn()
    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={[contact(1)]}
        totalContacts={1}
        onAddFilter={onAddFilter}
        onScopeChange={onScopeChange}
      />,
    )
    const chips = await screen.findByTestId('contacts-quick-chips')
    fireEvent.click(within(chips).getByRole('button', { name: 'Avec téléphone' }))
    expect(onAddFilter).toHaveBeenCalledWith('channel', 'with_phone')
    fireEvent.click(within(chips).getByRole('button', { name: 'À rattacher' }))
    expect(onScopeChange).toHaveBeenCalledWith('unassigned')
  })

  it('#4503.4 — « Ne pas solliciter » garde les contacts visés par la liste de l’espace (contact ou domaine)', async () => {
    const rows = [contact(1), contact(2), { ...contact(3), email: 'x@opposant.fr' }, contact(4)]
    renderWithRouter(<ContactContent {...baseProps} contacts={rows} totalContacts={4} />)
    const chips = await screen.findByTestId('contacts-quick-chips')
    expect(screen.getAllByRole('checkbox', { name: /^Sélectionner Personne/ })).toHaveLength(4)
    fireEvent.click(within(chips).getByRole('button', { name: 'Ne pas solliciter' }))
    const kept = screen
      .getAllByRole('checkbox', { name: /^Sélectionner Personne/ })
      .map(box => box.getAttribute('aria-label'))
    expect(kept).toEqual(['Sélectionner Personne 2', 'Sélectionner Personne 3'])
    // « Tous » la retire, comme les autres puces.
    fireEvent.click(within(chips).getByRole('button', { name: 'Tous' }))
    expect(screen.getAllByRole('checkbox', { name: /^Sélectionner Personne/ })).toHaveLength(4)
  })

  it('#4503.4 — la bascule Tous · Recommandés reste, hors de la barre d’outils, sous sa forme sobre', async () => {
    const onRecommendedFilterChange = vi.fn()
    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={[contact(1)]}
        totalContacts={1}
        recommendedFilter="recommended"
        onRecommendedFilterChange={onRecommendedFilterChange}
      />,
    )
    const toggle = await screen.findByRole('group', { name: 'Filtrer les contacts recommandés' })
    expect(
      within(toggle)
        .getAllByRole('button')
        .map(button => button.textContent?.replace(/\d+/g, '')),
    ).toEqual(['Tous collectés', 'Recommandés'])
    expect(within(toggle).getByRole('button', { name: /^Recommandés/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(toggle).getByRole('button', { name: /^Tous collectés/ }))
    expect(onRecommendedFilterChange).toHaveBeenCalledWith('all')
  })

  it('pied paginé : 25 par page, « Suivant » montre la suite, « Précédent » revient', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => contact(i + 1))
    renderWithRouter(<ContactContent {...baseProps} contacts={rows} totalContacts={30} />)
    const foot = await screen.findByTestId('contacts-table-foot')
    expect(foot).toHaveTextContent('1–25 sur 30 contacts · 25 par page')
    expect(within(foot).getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /^Sélectionner Personne/ })).toHaveLength(25)
    expect(screen.queryByRole('button', { name: /charger plus/i })).not.toBeInTheDocument()
    fireEvent.click(within(foot).getByRole('button', { name: 'Suivant' }))
    expect(foot).toHaveTextContent('26–30 sur 30 contacts')
    expect(screen.getAllByRole('checkbox', { name: /^Sélectionner Personne/ })).toHaveLength(5)
    fireEvent.click(within(foot).getByRole('button', { name: 'Précédent' }))
    expect(foot).toHaveTextContent('1–25 sur 30 contacts')
  })

  it('« Suivant » au-delà des lignes chargées appelle la page serveur suivante', async () => {
    const onLoadMore = vi.fn()
    const rows = Array.from({ length: 25 }, (_, i) => contact(i + 1))
    renderWithRouter(
      <ContactContent {...baseProps} contacts={rows} totalContacts={60} hasNextPage onLoadMore={onLoadMore} />,
    )
    const foot = await screen.findByTestId('contacts-table-foot')
    expect(within(foot).getByText('1 / 3')).toBeInTheDocument()
    fireEvent.click(within(foot).getByRole('button', { name: 'Suivant' }))
    expect(onLoadMore).toHaveBeenCalled()
  })

  it('une liste ouverte se nomme et se quitte (C2.R3)', async () => {
    const onFiltersChange = vi.fn()
    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={[contact(1)]}
        totalContacts={4}
        activeFilters={[{ id: 'targetListId', value: 'l1' }]}
        onFiltersChange={onFiltersChange}
      />,
    )
    // Sans liste chargée (nom inconnu), le bandeau se tait : jamais « Liste : » orphelin.
    await screen.findByRole('table')
    expect(screen.queryByTestId('contacts-list-banner')).not.toBeInTheDocument()
  })

  it('erreur de première page : « Réessayer » relance, ce n’est pas « aucun contact »', async () => {
    const onRetry = vi.fn()
    renderWithRouter(<ContactContent {...baseProps} contacts={[]} totalContacts={0} error onRetry={onRetry} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Les contacts n'ont pas pu être chargés")
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.queryByText('Aucun contact pour l’instant.')).not.toBeInTheDocument()
  })
})
