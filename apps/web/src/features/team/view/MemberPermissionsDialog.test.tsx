import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceTeamMember } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useTeam } from '@/features/team/hooks/useTeam'
import { MemberPermissionsDialog } from './MemberPermissionsDialog'

vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: vi.fn() }))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

function member(extra: Partial<WorkspaceTeamMember> = {}): WorkspaceTeamMember {
  return {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'amina@acme.co',
    fullName: 'Amina Benali',
    role: 'viewer',
    joinedAt: '2026-05-02T09:00:00.000Z',
    extraPermissions: [],
    ...extra,
  }
}

describe('MemberPermissionsDialog — qui accorde quoi à qui', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useTeam).mockReturnValue({
      setMemberPermissions: { mutate, isPending: false },
    } as unknown as ReturnType<typeof useTeam>)
  })

  it('nomme la personne visée et l’auteur de l’accord', () => {
    render(<MemberPermissionsDialog member={member()} grantedBy="Louis" open onOpenChange={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /Amina Benali/ })).toBeInTheDocument()
    // « Qui accorde » : sans lui, l'écran ne dit que la moitié du geste.
    // La phrase porte les TROIS : à qui, quel rôle, et de la part de qui.
    expect(screen.getByText(/Amina Benali.*Lecteur.*Louis/s)).toBeInTheDocument()
    expect(screen.getByText(/journal d’activité/)).toBeInTheDocument()
  })

  it('distingue ce qui vient du RÔLE de ce qui est accordé en propre', () => {
    // `sales` porte déjà `messages:send` par son rôle : le proposer en
    // exception laisserait croire à un privilège qui n'en est pas un.
    render(<MemberPermissionsDialog member={member({ role: 'sales' })} grantedBy="Louis" open onOpenChange={vi.fn()} />)

    const inherited = screen.getByRole('checkbox', { name: /Envoyer des messages/ })
    expect(inherited).toBeDisabled()
    expect(inherited).toBeChecked()
  })

  it('envoie la liste COMPLÈTE des accords en propre, pas le seul qu’on vient de cocher', async () => {
    render(
      <MemberPermissionsDialog
        member={member({ extraPermissions: ['integrations:manage'] })}
        grantedBy="Louis"
        open
        onOpenChange={vi.fn()}
      />,
    )

    await user().click(screen.getByRole('checkbox', { name: /Exporter des données/ }))
    await user().click(screen.getByRole('button', { name: 'Enregistrer les droits' }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const sent = mutate.mock.calls[0]?.[0] as { userId: string; permissions: string[] }
    expect(sent.userId).toBe('11111111-1111-1111-1111-111111111111')
    // La route REMPLACE : oublier l'accord déjà en place l'effacerait en silence.
    expect([...sent.permissions].sort()).toEqual(['data:export', 'integrations:manage'])
  })

  it('n’ouvre rien sur le propriétaire — il a déjà tout', () => {
    render(<MemberPermissionsDialog member={member({ role: 'owner' })} grantedBy="Louis" open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Le propriétaire a déjà tous les droits.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer les droits' })).not.toBeInTheDocument()
  })
})
