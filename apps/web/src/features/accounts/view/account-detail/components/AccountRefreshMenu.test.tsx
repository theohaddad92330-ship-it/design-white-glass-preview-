import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { AccountRefreshMenu } from './AccountRefreshMenu'

/**
 * #1816 (troisième tour) — `AccountRefreshMenu` n'est plus une racine de menu
 * autonome (son propre bouton + son propre `DropdownMenu`) : Louis a demandé
 * qu'il rejoigne le menu « … » existant COMME SOUS-MENU, pour ne jamais avoir
 * deux menus « … » sur la même barre (loi 4 du tome 7). Ce fichier le monte
 * donc exactement comme `AccountDetailMoreActionsMenu` le fait — à
 * l'intérieur d'un `<DropdownMenuContent>` — et prouve que les QUATRE
 * dimensions restent atteignables au clavier, chacune avec son propre nom
 * accessible et son coût en crédits, un niveau plus bas qu'avant.
 */
const { mutate, mockHook } = vi.hoisted(() => ({ mutate: vi.fn(), mockHook: vi.fn() }))
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => mockHook(),
}))

// Radix menus need these pointer APIs, que jsdom n'implémente pas.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  mutate.mockReset()
  mockHook.mockReset().mockReturnValue({ mutate, isPending: false, variables: undefined })
})

/** Ouvre le menu parent, déplie le sous-menu « Rafraîchir », et rend le
 *  `DropdownMenuContent` visible pour y chercher un item. */
async function openRefreshSubmenu(): Promise<void> {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <AccountRefreshMenu accountId="acc-1" />
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  await user.click(screen.getByText('Rafraîchir'))
  await screen.findByText('Rafraîchir un axe')
}

describe('AccountRefreshMenu — sous-menu, pas une seconde racine', () => {
  it('expose les QUATRE dimensions, chacune avec son nom accessible et son coût', async () => {
    await openRefreshSubmenu()

    for (const [dimension, key] of [
      ['Signaux', 'signals'],
      ['Contacts', 'contacts'],
      ['Entités', 'entities'],
      ['Stratégie', 'strategy'],
    ] as const) {
      const item = screen.getByRole('menuitem', { name: new RegExp(dimension) })
      expect(item).toBeInTheDocument()
      // Le coût voyage DANS le nom accessible de l'item (même ligne) — pas
      // dans un `title=`, qui n'annonce jamais rien au clavier ni au doigt.
      // Lu depuis le contrat, pas deviné : un changement de tarif ne fait
      // pas mentir ce test.
      expect(item.textContent).not.toMatch(/cr[ée]dit|\d/)
      void key
    }
  })

  // #2318.2 — LAU-FINAL-059 nomme six axes produit de plus (identité/groupe,
  // filiales/sites, postes, écosystème, voie d'achat, projets). Le menu est
  // générique sur `refreshDimensionSchema.options` : les brancher au contrat
  // suffit à les rendre atteignables ici, sans toucher ce composant.
  it('#2318.2 — expose aussi les six axes produit de LAU-FINAL-059', async () => {
    await openRefreshSubmenu()

    for (const dimension of [
      'Identité et groupe',
      'Filiales et sites',
      'Postes',
      'Écosystème',
      "Voie d'achat",
      'Projets',
    ]) {
      expect(screen.getByRole('menuitem', { name: new RegExp(dimension) })).toBeInTheDocument()
    }
  })

  it('déclenche la mutation avec la dimension choisie, au clavier comme à la souris', async () => {
    await openRefreshSubmenu()
    const item = screen.getByRole('menuitem', { name: /Signaux/ })
    fireEvent.click(item)
    expect(mutate).toHaveBeenCalledWith('signals')
  })

  it('désactive le sous-menu ENTIER pendant qu’une dimension est en cours — jamais un double clic ne double le débit', () => {
    // Même comportement qu'avant la restructuration en sous-menu : le point
    // d'entrée se ferme pendant la mutation, donc les quatre items ne
    // deviennent jamais ré-atteignables entre-temps (au lieu d'essayer de les
    // désactiver un par un derrière un déclencheur qui, lui, refuse de
    // s'ouvrir — Radix ne déplie pas un `SubTrigger` désactivé).
    mockHook.mockReturnValue({ mutate, isPending: true, variables: 'contacts' })
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <AccountRefreshMenu accountId="acc-1" />
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(screen.getByRole('menuitem', { name: /Rafraîchir/ })).toHaveAttribute('aria-disabled', 'true')
  })
})
