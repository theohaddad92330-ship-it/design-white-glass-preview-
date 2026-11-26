import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceTeam } from '@bellum/contracts'

/**
 * #2081.1 / .2 / .3 / .7 / .11 / .12 — LA COLLABORATION APRÈS L'AUDIT.
 *
 * Ce fichier garde : la question posée, les trois blocs d'explication DANS
 * L'ORDRE partagé → personnel → visibilité, l'invitation qui n'arrive
 * qu'APRÈS ces trois blocs (#2081.12), le report qui masque la carte
 * (#2081.11), et le silence quand l'espace collabore déjà.
 */

// Le lien vers /settings/team n'est pas le sujet ici : sans routeur monté,
// `Link` lève (même convention que `RestitutionPanel.test.tsx`).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const useTeamMock = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => useTeamMock(),
}))

const dismiss = vi.fn()
const isDismissed = vi.fn((_workspaceId: string) => false)
vi.mock('../lib/collaboration-prompt-dismissal', () => ({
  dismissCollaborationPrompt: (workspaceId: string) => dismiss(workspaceId),
  isCollaborationPromptDismissed: (workspaceId: string) => isDismissed(workspaceId),
}))

const { AuditCollaborationCard } = await import('./AuditCollaborationCard')

function team(overrides: Partial<WorkspaceTeam['workspace']> = {}): WorkspaceTeam {
  return {
    workspace: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'ESN Test',
      role: 'owner',
      memberCount: 1,
      communityDataSharing: false,
      portfolioVisibility: 'open',
      lexicon: {},
      ...overrides,
    },
    members: [{ userId: 'me', email: 'moi@esn.fr', fullName: 'Moi', role: 'owner', joinedAt: null }],
    invitations: [],
    seats: { used: 1, total: 5 },
  } as unknown as WorkspaceTeam
}

beforeEach(() => {
  useTeamMock.mockReset()
  dismiss.mockReset()
  isDismissed.mockReset().mockReturnValue(false)
})

describe('AuditCollaborationCard — #2081', () => {
  it('ne rend rien tant que l’équipe charge', () => {
    useTeamMock.mockReturnValue({ team: undefined, isLoading: true })
    const { container } = render(<AuditCollaborationCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien quand l’espace collabore déjà (plusieurs membres)', () => {
    useTeamMock.mockReturnValue({ team: team({ memberCount: 3 }), isLoading: false })
    const { container } = render(<AuditCollaborationCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien quand la proposition a déjà été reportée sur cet espace', () => {
    isDismissed.mockReturnValue(true)
    useTeamMock.mockReturnValue({ team: team(), isLoading: false })
    const { container } = render(<AuditCollaborationCard />)
    expect(container).toBeEmptyDOMElement()
    expect(isDismissed).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('#2081.1 pose la question exacte', () => {
    useTeamMock.mockReturnValue({ team: team(), isLoading: false })
    render(<AuditCollaborationCard />)
    expect(screen.getByText('Ton collègue gère-t-il une partie de ces comptes ?')).toBeInTheDocument()
  })

  it('#2081.2 / .3 / .7 / .12 — partagé, personnel, visibilité, PUIS l’invitation, dans cet ordre', () => {
    useTeamMock.mockReturnValue({ team: team({ portfolioVisibility: 'open' }), isLoading: false })
    const { container } = render(<AuditCollaborationCard />)
    const text = container.textContent ?? ''
    const iShared = text.indexOf('Ce qui est partagé')
    const iPersonal = text.indexOf('Ce qui reste personnel')
    const iVisibility = text.indexOf('Qui voit quoi')
    const iInvite = text.indexOf('Inviter un collègue')
    expect(iShared).toBeGreaterThan(-1)
    expect(iPersonal).toBeGreaterThan(iShared)
    expect(iVisibility).toBeGreaterThan(iPersonal)
    expect(iInvite).toBeGreaterThan(iVisibility)
  })

  it('#2081.7 lit la visibilité RÉELLE de l’espace (restricted)', () => {
    useTeamMock.mockReturnValue({ team: team({ portfolioVisibility: 'restricted' }), isLoading: false })
    render(<AuditCollaborationCard />)
    expect(screen.getByText(/chaque commercial voit son portefeuille et les comptes libres/)).toBeInTheDocument()
    expect(screen.queryByText(/chaque membre de ton espace voit tout le portefeuille/)).not.toBeInTheDocument()
  })

  it('l’invitation NAVIGUE vers /settings/team, elle n’envoie rien elle-même', () => {
    useTeamMock.mockReturnValue({ team: team(), isLoading: false })
    render(<AuditCollaborationCard />)
    expect(screen.getByRole('link', { name: 'Inviter un collègue' })).toHaveAttribute('href', '/settings/team')
  })

  it('#2081.11 « Plus tard » reporte la proposition et masque la carte', () => {
    useTeamMock.mockReturnValue({ team: team(), isLoading: false })
    render(<AuditCollaborationCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(dismiss).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(screen.queryByText('Ton collègue gère-t-il une partie de ces comptes ?')).not.toBeInTheDocument()
  })
})
