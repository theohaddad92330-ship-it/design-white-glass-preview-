import { DropdownMenu, DropdownMenuContent } from '@bellum/ui'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountFollowMenuItem } from './AccountHeaderMenuItems'

const { followsMock, toggleMutate } = vi.hoisted(() => ({ followsMock: vi.fn(), toggleMutate: vi.fn() }))
vi.mock('@/features/account-follows/api', () => ({
  useAccountFollows: () => followsMock(),
  useToggleAccountFollow: () => ({ mutate: toggleMutate, isPending: false }),
}))

function renderItem() {
  render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <AccountFollowMenuItem accountId="acc-1" />
      </DropdownMenuContent>
    </DropdownMenu>,
  )
}

/** #4283.8 (recette prod 25/10) — « Suivre » manquait dans l'en-tête de la fiche : il vit sous « … ». */
describe('AccountFollowMenuItem', () => {
  beforeEach(() => {
    toggleMutate.mockReset()
  })

  it('propose « Suivre ce compte » et suit au clic quand le compte ne l’est pas', async () => {
    followsMock.mockReturnValue({ data: { max: 3, followed: [], archived: [] } })
    renderItem()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('menuitem', { name: /Suivre ce compte/i }))
    expect(toggleMutate).toHaveBeenCalledWith({ accountId: 'acc-1', follow: true }, expect.anything())
  })

  it('dit « suivi » et arrête le suivi au clic quand le compte est déjà suivi', async () => {
    followsMock.mockReturnValue({ data: { max: 3, followed: [{ account_id: 'acc-1' }], archived: [] } })
    renderItem()
    const item = screen.getByRole('menuitem', { name: /Suivre ce compte.*suivi/i })
    await userEvent.setup({ pointerEventsCheck: 0 }).click(item)
    expect(toggleMutate).toHaveBeenCalledWith({ accountId: 'acc-1', follow: false }, expect.anything())
  })

  it('ne rend rien tant que la liste des suivis n’a pas répondu — jamais un état deviné', () => {
    followsMock.mockReturnValue({ data: undefined })
    renderItem()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })
})
