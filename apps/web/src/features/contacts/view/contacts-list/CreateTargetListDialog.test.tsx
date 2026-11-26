import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessionUser } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { CreateTargetListDialog } = await import('./CreateTargetListDialog')

/**
 * #2157.5 / #2157.57 — « Créer une cible » depuis la sélection de Contacts : le
 * MÊME aperçu que depuis Comptes. Les désinscrits sont écartés et nommés, les
 * fiches sans e-mail nommées, rien n'est ajouté tant que rien n'est validé.
 */
const contact = (id: string, over: Partial<GlobalContact> = {}) =>
  ({ id, full_name: `Contact ${id}`, email: `${id}@x.fr`, ...over }) as GlobalContact

type FetchArgs = { path: string; method?: string; body?: unknown }

beforeEach(() => {
  apiFetch.mockReset()
  resetTestQueryClient()
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    if (args?.path === '/target-lists' && (args.method ?? 'GET') === 'GET') return { lists: [] }
    if (args?.path === '/target-lists' && args.method === 'POST')
      return {
        id: 'new-1',
        name: 'x',
        objective: null,
        type: null,
        owner_user_id: null,
        team: null,
        visibility: 'workspace',
        source: 'manual',
        source_query: null,
        status: 'draft',
        counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
        next_action: null,
        sequence_id: null,
        prospecting_session_id: null,
        created_by: 'u1',
        created_at: '2026-10-31T00:00:00.000Z',
        updated_at: '2026-10-31T00:00:00.000Z',
        items: [],
      }
    if (args?.path === '/workspaces/members') return []
    return {
      id: 'item-1',
      target_list_id: 'new-1',
      kind: 'contact',
      ref_id: 'c-1',
      label: 'x',
      sublabel: null,
      selection_reason: null,
      priority: null,
      owner_user_id: null,
      work_status: 'to_review',
      provenance: 'manual',
      refreshed_at: null,
      removed_at: null,
      removal_reason: null,
      next_action: null,
      notes: null,
      created_at: '2026-10-31T00:00:00.000Z',
      updated_at: '2026-10-31T00:00:00.000Z',
    }
  })
})

function renderDialog(contacts: GlobalContact[]) {
  const onOpenChange = vi.fn()
  renderWithRouter(
    <SessionContext.Provider value={{ user: { id: 'u1' } as SessionUser, loading: false }}>
      <CreateTargetListDialog open contacts={contacts} onOpenChange={onOpenChange} />
    </SessionContext.Provider>,
  )
  return { onOpenChange }
}

describe('CreateTargetListDialog (#2157.5/.57)', () => {
  it('écarte les désinscrits (nommés) et n’ajoute que les autres contacts', async () => {
    const { onOpenChange } = renderDialog([
      contact('c-1'),
      contact('c-2', { email: null }),
      contact('c-3', { excluded_at: '2026-10-01T00:00:00.000Z' }),
    ])
    expect(await screen.findByText(/1 fiche écartée/)).toBeInTheDocument()
    expect(screen.getByText(/Contact c-3 \(désinscrit\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 fiche sans e-mail : Contact c-2/)).toBeInTheDocument()

    // Le nom proposé arrive par un effet : le bouton s'active une fois posé.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer la cible' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Créer la cible' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    const added = apiFetch.mock.calls
      .map(call => call[0] as FetchArgs)
      .filter(call => call.path === '/target-lists/new-1/items')
      .map(call => (call.body as { ref_id: string }).ref_id)
    expect(added).toEqual(['c-1', 'c-2'])
  })
})
