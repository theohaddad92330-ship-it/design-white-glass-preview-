import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import * as hooks from '../hooks'
import { DoNotContactView } from './DoNotContactView'

vi.mock('../hooks', () => ({
  useDoNotContactList: vi.fn(),
  useAddDoNotContact: vi.fn(),
  useLiftDoNotContact: vi.fn(),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-me' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [{ userId: 'u-me', role: 'owner' }] }),
}))

const q = <R,>(value: unknown): R => value as R

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  vi.mocked(hooks.useAddDoNotContact).mockReturnValue(q({ mutate: vi.fn(), isPending: false }))
  vi.mocked(hooks.useLiftDoNotContact).mockReturnValue(q({ mutate: vi.fn(), isPending: false }))
})

describe('Théo D settings-espace — « Ne pas contacter » en bloc de Réglages', () => {
  it('un bloc titré (h2, jamais un second h1) et un tableau Personne ou domaine · Motif · Ajouté par', () => {
    vi.mocked(hooks.useDoNotContactList).mockReturnValue(
      q({
        isLoading: false,
        isError: false,
        data: {
          items: [
            {
              id: 'e1',
              kind: 'domain',
              domain: 'groupe-lumiere.fr',
              contact_name: null,
              reason: 'Client sous contrat-cadre',
              added_by_name: 'Théo Haddad',
              created_at: '2026-09-03T10:00:00Z',
            },
          ],
        },
      }),
    )
    render(<DoNotContactView />)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Ne pas contacter' })).toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map(cell => cell.textContent)
    expect(headers.slice(0, 3)).toEqual(['Personne ou domaine', 'Motif', 'Ajouté par'])
    const row = screen.getByText('groupe-lumiere.fr').closest('tr') as HTMLElement
    expect(within(row).getByText('Client sous contrat-cadre')).toBeInTheDocument()
    expect(within(row).getByText('Théo Haddad')).toBeInTheDocument()
  })

  it('« Ajouter » ouvre la fenêtre de saisie ; la liste vide le dit sans tableau', async () => {
    vi.mocked(hooks.useDoNotContactList).mockReturnValue(q({ isLoading: false, isError: false, data: { items: [] } }))
    render(<DoNotContactView />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Motif', { selector: 'textarea' })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
