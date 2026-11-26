import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CommercialLifecycle } from '@bellum/contracts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { CommercialStatusReasonDialog } from './CommercialStatusReasonDialog'
import { CommercialStatusSubmenu } from './CommercialStatusSubmenu'

/**
 * #2117.23 — LE MOTIF, AVANT L'ÉCRITURE (le branchement).
 *
 * `CommercialStatusReasonDialog` existait, complet, sans appelant : rien dans
 * le menu de statut n'ouvrait le dialogue. Ce fichier tient le contrat entre
 * les deux — `onRequestReason` — qui rend « Hors priorité » et « En veille »
 * réellement ATTEIGNABLES depuis le sous-menu « Déplacer vers », sans jamais
 * écrire le statut avant que le motif n'existe.
 */

const { mutate, mockHook } = vi.hoisted(() => ({ mutate: vi.fn(), mockHook: vi.fn() }))
vi.mock('@/features/accounts/hooks/useSetCommercialStatus', () => ({
  useSetCommercialStatus: () => mockHook(),
}))

// Radix menus need these pointer APIs, which jsdom doesn't implement.
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

/** Le même montage que la ligne réelle : le dialogue vit HORS du menu, chez
 *  le parent (voir le commentaire de `CommercialStatusReasonDialog`). */
function Harness({ current }: { current?: CommercialLifecycle }) {
  const [target, setTarget] = useState<CommercialLifecycle | null>(null)
  return (
    <>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <CommercialStatusSubmenu variant="dropdown" accountId="acc-1" current={current} onRequestReason={setTarget} />
        </DropdownMenuContent>
      </DropdownMenu>
      <CommercialStatusReasonDialog accountId="acc-1" target={target} onClose={() => setTarget(null)} />
    </>
  )
}

/** Ouvre « Déplacer vers » puis clique la cible demandée.
 *
 *  ⚠️ Le clic sur l'item se fait par `fireEvent`, pas `userEvent` : la
 *  séquence de pointeur de ce dernier fait re-rendre le contenu du sous-menu
 *  Radix, si bien que le nœud trouvé juste avant est détaché quand le clic
 *  arrive (même piège que `ContactOutcomeSubmenu.test.tsx`). */
async function chooseTarget(label: string, current?: CommercialLifecycle) {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<Harness current={current} />)
  await user.click(screen.getByText('Déplacer vers'))
  const item = await screen.findByRole('menuitem', { name: label })
  fireEvent.click(item)
  return user
}

describe('CommercialStatusSubmenu — « Hors priorité » / « En veille », avec motif', () => {
  it('choisir « En veille » n’écrit RIEN — ça ouvre le dialogue, ça ne mute pas', async () => {
    await chooseTarget('En veille')

    expect(await screen.findByText('Pourquoi « En veille » ?')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('choisir « Hors priorité » ouvre le MÊME dialogue', async () => {
    await chooseTarget('Hors priorité')

    expect(await screen.findByText('Pourquoi « Hors priorité » ?')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('le motif vide n’autorise pas la confirmation', async () => {
    await chooseTarget('En veille')
    await screen.findByText('Pourquoi « En veille » ?')

    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('« Annuler » ferme le dialogue et laisse le statut inchangé', async () => {
    const user = await chooseTarget('En veille')
    await screen.findByText('Pourquoi « En veille » ?')

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByText('Pourquoi « En veille » ?')).not.toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('Échap ferme le dialogue sans rien écrire', async () => {
    const user = await chooseTarget('En veille')
    await screen.findByText('Pourquoi « En veille » ?')

    await user.keyboard('{Escape}')

    expect(screen.queryByText('Pourquoi « En veille » ?')).not.toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('valider envoie le motif ET le statut en UN SEUL appel', async () => {
    const user = await chooseTarget('En veille')
    await screen.findByText('Pourquoi « En veille » ?')

    await user.type(screen.getByLabelText('Motif'), 'Injoignable depuis deux mois')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      { id: 'acc-1', status: 'dormant', reason: 'Injoignable depuis deux mois' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('un statut qui n’exige PAS de motif n’ouvre aucun dialogue — il mute directement', async () => {
    await chooseTarget('En observation', 'inbox')

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith({ id: 'acc-1', status: 'watching' })
    expect(screen.queryByText(/^Pourquoi/)).not.toBeInTheDocument()
  })
})
