import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  countTargetListItems,
  deriveTargetListType,
  type SessionUser,
  type TargetList,
  type TargetListItem,
} from '@bellum/contracts'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/crm-core/view/CreateContactDialog', () => ({ CreateContactDialog: () => null }))

const { ContactListsContent, ContactListsPage } = await import('./ContactListsPage')

const STAMP = '2026-09-01T00:00:00.000Z'

function item(
  id: string,
  listId: string,
  kind: 'account' | 'contact',
  over: Partial<TargetListItem> = {},
): TargetListItem {
  return {
    id,
    target_list_id: listId,
    kind,
    ref_id: `ref-${id}`,
    label: `Fiche ${id}`,
    sublabel: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'in_progress',
    provenance: 'manual',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...over,
  } as TargetListItem
}

function list(id: string, name: string, items: TargetListItem[], over: Partial<TargetList> = {}): TargetList {
  return {
    id,
    name,
    objective: `Objectif de ${name}`,
    type: deriveTargetListType(items),
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'manual',
    source_query: null,
    status: 'in_progress',
    counts: countTargetListItems(items),
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    items,
    ...over,
  } as TargetList
}

const LISTS = [
  list('l1', 'Interlocuteurs Data & BI', [item('a', 'l1', 'contact'), item('b', 'l1', 'contact')]),
  list('l2', 'Comptes prioritaires T4', [
    item('c', 'l2', 'account', {
      label: 'Altiver Industries',
      tier_label: 'A',
      selection_reason: 'Programme SAP en cours',
    } as Partial<TargetListItem>),
    item('d', 'l2', 'contact'),
  ]),
  list('l3', 'Salon Data Paris 2025', [item('e', 'l3', 'contact')], { status: 'archived' }),
]

function renderContent() {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: 'u1' } as SessionUser, loading: false }}>
      <ContactListsContent />
    </SessionContext.Provider>,
    '/contacts/lists',
  )
}

beforeEach(() => {
  resetTestQueryClient()
  apiFetch.mockReset()
  apiFetch.mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
    if (path === '/target-lists' && !method) return { lists: LISTS }
    return {}
  })
})

describe('Théo B c2-mes-listes — Contacts › Mes listes', () => {
  it('A1 — range les listes sous Contacts / Comptes, avec leur effectif', async () => {
    renderContent()
    expect(await screen.findByText('Interlocuteurs Data & BI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contacts · 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comptes · 1' })).toBeInTheDocument()
    expect(screen.getByText('2 contacts')).toBeInTheDocument()
    expect(screen.queryByText('Comptes prioritaires T4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Comptes · 1' }))
    expect(await screen.findByText('Comptes prioritaires T4')).toBeInTheDocument()
    expect(screen.getByText('1 compte · 1 contact')).toBeInTheDocument()
  })

  it('A1 — « Ouvrir » une liste de comptes montre tier et raison, et renvoie vers Comptes', async () => {
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: 'Comptes · 1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Altiver Industries')).toBeInTheDocument()
    expect(within(dialog).getByText('Tier A')).toBeInTheDocument()
    expect(within(dialog).getByText('Programme SAP en cours')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Ouvrir dans Comptes' })).toBeInTheDocument()
  })

  it('A2 — l’archive tient en une ligne discrète, et « Ressortir » remet la liste en cours', async () => {
    renderContent()
    expect(screen.queryByText('Salon Data Paris 2025')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '1 liste archivée' }))
    expect(await screen.findByText('Salon Data Paris 2025')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ressortir' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/target-lists/l3', method: 'PATCH', body: { status: 'in_progress' } }),
      ),
    )
  })

  it('N1 / N2 — renommer écrit le nom ET la description', async () => {
    renderContent()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Gestes sur la liste Interlocuteurs Data & BI' }))
    await u.click(await screen.findByRole('menuitem', { name: 'Renommer la liste' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Data & BI T4' } })
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Responsables Data.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/target-lists/l1',
          method: 'PATCH',
          body: { name: 'Data & BI T4', objective: 'Responsables Data.' },
        }),
      ),
    )
  })

  it('« Supprimer la liste uniquement » demande confirmation et dit que les fiches restent', async () => {
    renderContent()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Gestes sur la liste Interlocuteurs Data & BI' }))
    await u.click(await screen.findByRole('menuitem', { name: 'Supprimer la liste uniquement' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Les 2 fiches restent dans le répertoire/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer la liste' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/target-lists/l1', method: 'DELETE' })),
    )
  })

  it('R5 — sans liste, l’état vide dit quoi faire', async () => {
    apiFetch.mockImplementation(async () => ({ lists: [] }))
    renderContent()
    expect(await screen.findByText('Aucune liste pour l’instant.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sélectionner des contacts' })).toBeInTheDocument()
  })
})

// #4503.a (PR 12C) — `/contacts/lists` porte l'en-tête COMMUN de Contacts et ses trois onglets, comme /contacts.
describe('#4503.a — /contacts/lists sous les onglets de Contacts', () => {
  function renderPage() {
    return renderWithRouter(
      <SessionContext.Provider value={{ user: { id: 'u1' } as SessionUser, loading: false }}>
        <ContactListsPage />
      </SessionContext.Provider>,
      '/contacts/lists',
    )
  }

  it('les trois onglets, « Mes listes » courant, le même composant que /contacts', async () => {
    renderPage()
    const tabs = await screen.findByTestId('contacts-tabs')
    const links = within(tabs).getAllByRole('link')
    expect(links.map(link => link.textContent?.replace(/\d+$/, ''))).toEqual([
      'Répertoire',
      'Mes listes',
      'Imports & sources',
    ])
    expect(within(tabs).getByRole('link', { name: /Mes listes/ })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Répertoire' })).not.toHaveAttribute('aria-current')
  })

  it('l’en-tête de Contacts est celui de /contacts : « Ajouter un contact » et « Importer des contacts »', async () => {
    renderPage()
    const intro = await screen.findByTestId('contacts-intro')
    expect(within(intro).getByRole('button', { name: 'Ajouter un contact' })).toBeInTheDocument()
    expect(within(intro).getByRole('link', { name: /Importer des contacts/ })).toBeInTheDocument()
  })

  it('un seul titre de page : l’en-tête de la liste n’en pose pas un second', async () => {
    renderPage()
    await screen.findByTestId('contacts-tabs')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('l’en-tête (avec ses onglets) vient AVANT les listes', async () => {
    renderPage()
    const tabs = await screen.findByTestId('contacts-tabs')
    const firstList = await screen.findByText('Interlocuteurs Data & BI')
    expect(Boolean(tabs.compareDocumentPosition(firstList) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('le geste « choisir des contacts dans le répertoire » reste offert', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: /Sélectionner des contacts/ })).toHaveAttribute('href', '/contacts')
  })
})
