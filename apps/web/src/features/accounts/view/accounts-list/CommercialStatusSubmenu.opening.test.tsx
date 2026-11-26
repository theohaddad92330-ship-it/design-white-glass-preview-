import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { CommercialStatusSubmenu } from './CommercialStatusSubmenu'

/**
 * #2117.19 — « EN COURS D'OUVERTURE » EST UNE VALEUR AJOUTÉE (account.ts:72),
 * PAS ENCORE UNE CIBLE PROPOSÉE.
 *
 * `COMMERCIAL_LIFECYCLE_VALUES` porte `opening` depuis le 15/09 (CHECK SQL
 * élargi avant le code, GA-08/11), mais `MOVE_TARGETS` — le SEUL endroit
 * (GA-26) qui peuple le sous-menu « Déplacer vers » — ne la listait pas :
 * la valeur existait sans être atteignable par un commercial.
 */

const { mutate, mockHook } = vi.hoisted(() => ({ mutate: vi.fn(), mockHook: vi.fn() }))
vi.mock('@/features/accounts/hooks/useSetCommercialStatus', () => ({
  useSetCommercialStatus: () => mockHook(),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  mutate.mockReset()
  mockHook.mockReset().mockReturnValue({ mutate, isPending: false })
})

function Harness() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <CommercialStatusSubmenu variant="dropdown" accountId="acc-1" current="inbox" onRequestReason={() => {}} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('CommercialStatusSubmenu — « En cours d’ouverture »', () => {
  it('propose la cible « En cours d’ouverture »', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Harness />)
    await user.click(screen.getByText('Déplacer vers'))

    expect(await screen.findByRole('menuitem', { name: "En cours d'ouverture" })).toBeInTheDocument()
  })

  it('la choisir mute directement — aucun motif requis (pas une sortie du pipe)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Harness />)
    await user.click(screen.getByText('Déplacer vers'))
    const item = await screen.findByRole('menuitem', { name: "En cours d'ouverture" })
    fireEvent.click(item)

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({ id: 'acc-1', status: 'opening' })
  })
})
