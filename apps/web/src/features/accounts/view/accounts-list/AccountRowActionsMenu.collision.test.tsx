import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// #3166 (recette 29/09) — le menu « … » d'une ligne près du haut de la fenêtre
// s'ouvrait 19 px AU-DESSUS du bord (top = -19) : Radix ne retourne/décale le
// menu que si on lui laisse de la marge et si le menu sait se borner à la
// hauteur disponible. jsdom ne calcule aucune géométrie : on fige donc les
// PROPS de collision, seule chose que ce fichier peut réellement tenir.
const captured: { props: Record<string, unknown> | null } = { props: null }

vi.mock('@bellum/ui', async importOriginal => {
  const original = await importOriginal<typeof import('@bellum/ui')>()
  return {
    ...original,
    DropdownMenuContent: (props: Record<string, unknown>) => {
      captured.props = props
      return null
    },
  }
})

import { AccountRowActionsMenu } from './AccountRowActionsMenu'

describe('AccountRowActionsMenu — le menu reste dans la fenêtre (#3166)', () => {
  it('réserve une marge de collision et se borne à la hauteur disponible', () => {
    render(
      <AccountRowActionsMenu
        actions={[]}
        accountId="acc-1"
        commercialStatus={undefined}
        onRequestStatusReason={() => undefined}
      />,
    )
    expect(captured.props?.avoidCollisions).not.toBe(false)
    expect(Number(captured.props?.collisionPadding)).toBeGreaterThanOrEqual(8)
    expect(String(captured.props?.className)).toContain('max-h-[var(--radix-dropdown-menu-content-available-height)]')
    expect(String(captured.props?.className)).toContain('overflow-y-auto')
  })
})
