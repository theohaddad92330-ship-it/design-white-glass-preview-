import { screen } from '@testing-library/react'
import { countTargetListItems, deriveTargetListType, type SessionUser } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { TargetListBanner } = await import('./TargetListBanner')

const LIST_ID = '11111111-1111-4111-8111-111111111111'
const STAMP = '2026-09-01T00:00:00.000Z'
const items = [
  {
    id: 'i1',
    target_list_id: LIST_ID,
    kind: 'contact',
    ref_id: 'c1',
    label: 'A',
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
  },
  {
    id: 'i2',
    target_list_id: LIST_ID,
    kind: 'contact',
    ref_id: 'c2',
    label: 'B',
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
  },
] as const

beforeEach(() => {
  resetTestQueryClient()
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({
    lists: [
      {
        id: LIST_ID,
        name: 'Interlocuteurs Data & BI',
        objective: null,
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
      },
    ],
  })
})

const render = (path: string) =>
  renderWithRouter(
    <SessionContext.Provider value={{ user: { id: 'u1' } as SessionUser, loading: false }}>
      <TargetListBanner />
    </SessionContext.Provider>,
    path,
  )

describe('Théo B c2-mes-listes.R3 — le bandeau de la liste ouverte', () => {
  it('nomme la liste filtrante, son effectif, et offre « Quitter cette liste »', async () => {
    render(`/contacts?targetListId=${LIST_ID}`)
    expect(await screen.findByText('Liste : Interlocuteurs Data & BI · 2 contacts enregistrés.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quitter cette liste' })).toBeInTheDocument()
  })

  it('aucun bandeau sans filtre de liste, ni pour une liste inconnue', async () => {
    render('/contacts')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    render('/contacts?targetListId=99999999-9999-4999-8999-999999999999')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
