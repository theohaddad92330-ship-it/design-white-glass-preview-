import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceRole } from '@bellum/contracts'

/**
 * #2150.60 — « la fiche Contact conserve les permissions. »
 *
 * `hasPermission` (packages/contracts/workspace.ts) est déjà la source
 * UNIQUE des permissions, côté serveur (les trois `@RequirePermission`
 * de ContactsController) ET côté web (MissionDetailTabs.tsx). Ce badge ne
 * calcule rien de nouveau : il lit `records:write` et se tait quand le rôle
 * l'a — seule l'EXCEPTION se nomme (même doctrine que
 * `effectiveExtraPermissions`, workspace.ts).
 */
let mockRole: WorkspaceRole | undefined

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({
    team: mockRole ? { workspace: { role: mockRole } } : undefined,
    isLoading: false,
    isError: false,
  }),
}))

const { ContactPermissionBadge } = await import('./ContactPermissionBadge')

describe('ContactPermissionBadge — #2150.60', () => {
  it('se tait quand le rôle peut écrire (cas courant, rien à annoncer)', () => {
    mockRole = 'admin'
    render(<ContactPermissionBadge />)
    expect(screen.queryByText(/Lecture seule/)).not.toBeInTheDocument()
  })

  it('nomme l’exception — un viewer ne peut pas modifier cette fiche', () => {
    mockRole = 'viewer'
    render(<ContactPermissionBadge />)
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument()
  })

  it('ne devine rien tant que le rôle n’est pas résolu', () => {
    mockRole = undefined
    render(<ContactPermissionBadge />)
    expect(screen.queryByText(/Lecture seule/)).not.toBeInTheDocument()
  })
})
