import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DoNotContactEntry } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #4504.3 (contrat Louis 24/10) — « Ne pas contacter » vit dans la ligne « Préférence de sollicitation » de la fiche,
 * avec ses droits d'équipe INCHANGÉS : tout membre propose une entrée ; RETIRER reste réservé à `team:manage`
 * (owner / admin / sales_ops — la même règle que Réglages › Ne pas contacter, `useCanLiftDoNotContact`).
 */
const { guard, liftMutate, addMutate, role } = vi.hoisted(() => ({
  guard: { entry: null as DoNotContactEntry | null },
  liftMutate: vi.fn(),
  addMutate: vi.fn(),
  role: { value: 'member' as string },
}))
vi.mock('../hooks', () => ({
  useContactGuardrails: (ids: readonly string[]) => ({
    data: { items: ids.map(id => ({ contact_id: id, do_not_contact: guard.entry, contacted: null })) },
  }),
  useLiftDoNotContact: () => ({ mutate: liftMutate, isPending: false }),
  useAddDoNotContact: () => ({ mutate: addMutate, isPending: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [{ userId: 'u-moi', fullName: 'Moi', email: null, role: role.value }] }),
}))

const { DoNotContactPreference } = await import('./DoNotContactPreference')

const listed: DoNotContactEntry = {
  id: 'dnc-1',
  kind: 'contact',
  contact_id: 'c1',
  contact_name: 'Paul Ferrer',
  domain: null,
  reason: 'Attend la fin de son appel d’offres',
  added_by: 'u-2',
  added_by_name: 'Maëva Coet',
  created_at: '2026-10-12T09:00:00.000Z',
}

describe('#4504.3 — Préférence de sollicitation : droits d’équipe inchangés', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    liftMutate.mockClear()
    addMutate.mockClear()
    guard.entry = null
    role.value = 'member'
  })

  it('rien de consigné : « Aucune opposition consignée » et le geste « Ne pas contacter (équipe) », ouvert à tout membre', () => {
    render(<DoNotContactPreference contactId="c1" />)
    expect(screen.getByText('Aucune opposition consignée')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ne pas contacter (équipe)' })).toBeInTheDocument()
  })

  it('REFUS : un membre sans `team:manage` voit l’opposition et son motif, mais ne peut pas la retirer', () => {
    guard.entry = listed
    render(<DoNotContactPreference contactId="c1" />)
    expect(screen.getByText('Ne pas contacter')).toBeInTheDocument()
    expect(screen.getByText('Attend la fin de son appel d’offres')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ne pas contacter (équipe)' })).not.toBeInTheDocument()
  })

  it('un gestionnaire de l’équipe (admin) peut retirer l’entrée, par son identifiant', async () => {
    guard.entry = listed
    role.value = 'admin'
    render(<DoNotContactPreference contactId="c1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(liftMutate).toHaveBeenCalledWith('dnc-1')
  })
})
