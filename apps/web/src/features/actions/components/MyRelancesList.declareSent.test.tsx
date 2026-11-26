import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyPlanAction } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { MyRelancesList } from './MyRelancesList'

/**
 * #4418.1 (recette prod 26/10, 38e9fc6e8a) — `/actions` rendait 0 occurrence de « Marquer envoyé » : le geste n'existait
 * que sur le message d'un contact. Sur une relance, il DÉCLARE (Louis 21/09 : « Fait » ne porte jamais de preuve
 * d'envoi) et le serveur planifie J+3 / J+6 / J+9 — Bellum n'envoie rien, aucune date d'envoi n'est inventée.
 */
const { declareSent, update, mineCount } = vi.hoisted(() => ({
  declareSent: vi.fn(),
  update: vi.fn(),
  mineCount: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/features/contacts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/contacts/api')>()
  return { ...actual, contactsApi: { ...actual.contactsApi, declareSent } }
})
vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: { list: vi.fn(), mine: vi.fn(), mineCount, update },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const relance = (over: Record<string, unknown> = {}): MyPlanAction =>
  ({
    id: 'r1',
    account_id: 'a1',
    company_name: 'ACME',
    label: 'Relancer la DSI',
    due_date: '2026-10-30',
    done: false,
    execution_status: 'todo',
    channel: 'email',
    target: { kind: 'contact', id: 'c1', label: 'Claire Martin' },
    ...over,
  }) as unknown as MyPlanAction

describe('#4418.1 — « Marquer envoyé » sur une relance de /actions', () => {
  beforeEach(() => {
    declareSent.mockReset()
    declareSent.mockResolvedValue({ contact_id: 'c1', declared: true })
    update.mockReset()
  })

  it('déclare l’envoi au contact visé, sur le canal de la relance, et n’écrit AUCUNE preuve d’envoi', async () => {
    renderWithRouter(<MyRelancesList actions={[relance()]} loading={false} />, '/actions')
    await userEvent.click(await screen.findByRole('button', { name: /Marquer envoyé/ }))
    await waitFor(() => expect(declareSent).toHaveBeenCalledWith('c1', 'email'))
    // Déclaratif : aucune date d'envoi inventée (pas de 3e argument), la relance n'est pas close « par preuve ».
    expect(declareSent.mock.calls[0]).toHaveLength(2)
    expect(update).not.toHaveBeenCalled()
    expect(screen.queryByText(/envoyé par/i)).toBeNull()
  })

  it('sait dire NON : un appel, une réunion ou une action sans contact visé n’ont pas ce geste', async () => {
    renderWithRouter(
      <MyRelancesList
        actions={[
          relance({ id: 'r2', channel: 'phone' }),
          relance({ id: 'r3', channel: 'meeting' }),
          relance({ id: 'r4', target: null }),
          relance({ id: 'r5', target: { kind: 'project', id: 'p1', label: 'Projet' } }),
        ]}
        loading={false}
      />,
      '/actions',
    )
    await screen.findAllByTestId('my-relance-row').catch(() => undefined)
    expect(screen.queryByRole('button', { name: /Marquer envoyé/ })).toBeNull()
  })
})
