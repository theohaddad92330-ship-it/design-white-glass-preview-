import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent } from '@bellum/ui'

/**
 * #3387.10 — le « renfort transversal » désigné sur l'écran Équipe est LU par
 * un geste réel : le menu « Attribuer » d'une ligne de compte le nomme. Sans
 * cet appelant, le drapeau serait une colonne que personne ne lit.
 */
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'me', email: 'moi@esn.fr', fullName: 'Moi', role: 'owner', isSelf: true },
      {
        userId: 'marie',
        email: 'marie@esn.fr',
        fullName: 'Marie',
        role: 'sales',
        isSelf: false,
        crossTeamSupport: true,
      },
      { userId: 'paul', email: 'paul@esn.fr', fullName: 'Paul', role: 'sales', isSelf: false, crossTeamSupport: false },
    ],
  }),
}))
vi.mock('@/features/manager/hooks/useAssignAccount', () => ({ useAssignAccount: () => ({ mutate: vi.fn() }) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'me' } }) }))

const { AccountAssignSubmenu } = await import('./AccountAssignSubmenu')

describe('AccountAssignSubmenu — renfort transversal', () => {
  it('nomme le renfort, et seulement lui, sans retirer personne de la liste', async () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <AccountAssignSubmenu accountId="acc-1" currentOwnerId={undefined} variant="dropdown" />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.click(screen.getByText(/Attribuer/i))
    const marie = await screen.findByRole('menuitem', { name: /Marie/ })
    expect(marie).toHaveTextContent(/renfort/)
    expect(screen.getByRole('menuitem', { name: /Paul/ })).not.toHaveTextContent(/renfort/)
    expect(screen.getByRole('menuitem', { name: /Moi/ })).toBeInTheDocument()
  })
})
