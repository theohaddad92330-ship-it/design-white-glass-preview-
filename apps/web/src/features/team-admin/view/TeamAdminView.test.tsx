import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const useTeam = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => useTeam(), TEAM_KEY: ['workspace-team'] as const }))
vi.mock('@/features/team/view/TeamMembersPanel', () => ({
  TeamMembersPanel: () => <div data-testid="members-panel" />,
}))
vi.mock('@/features/team/view/PortfolioVisibilityCard', () => ({
  PortfolioVisibilityCard: () => <div data-testid="portfolio-visibility" />,
}))
vi.mock('@/features/team/view/TeamPolicyCard', () => ({
  TeamPolicyCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="team-policy" data-can-manage={canManage} />
  ),
}))

function team(role = 'owner') {
  return {
    workspace: { id: 'w', name: 'ESN Test', role, memberCount: 3, communityDataSharing: false },
    members: [],
    invitations: [],
    seats: { used: 3, total: 5 },
  }
}

async function view(tab?: 'droits' | 'regles') {
  const { TeamAdminView } = await import('./TeamAdminView')
  return renderWithRouter(<TeamAdminView {...(tab ? { initialTab: tab } : {})} />)
}

// Théo D team-admin — Membres & invitations · Droits & visibilité · Règles d'équipe.
describe('TeamAdminView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeam.mockReturnValue({ team: team(), isLoading: false, isError: false })
  })

  it('dit les sièges : « 3 membres actifs · 5 places dans ton offre »', async () => {
    await view()
    expect((await screen.findAllByText(/3 membres actifs · 5 places dans ton offre/)).length).toBeGreaterThan(0)
    expect(screen.getByTestId('members-panel')).toBeTruthy()
  })

  it('trois onglets, dans l’ordre de Théo', async () => {
    await view()
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual([
      'Membres & invitations',
      'Droits & visibilité',
      'Règles d’équipe',
    ])
  })

  it('la matrice a cinq profils et quatre colonnes ; « Conversations privées » : pas de nouvel accès pour tous', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('tab', { name: 'Droits & visibilité' }))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    for (const column of ['Pilotage collectif', 'Gestion des membres', 'Finance globale', 'Conversations privées']) {
      expect(within(table).getByRole('columnheader', { name: column })).toBeTruthy()
    }
    expect(within(table).getAllByText('Pas de nouvel accès')).toHaveLength(5)
    expect(screen.getByTestId('portfolio-visibility')).toBeTruthy()
  })

  it('« Essayer une autre vue » montre ce que verrait un profil, sans changer ses droits ni ouvrir la messagerie', async () => {
    const user = userEvent.setup()
    await view('droits')
    await user.click(await screen.findByRole('button', { name: 'Essayer une autre vue' }))
    await user.click(screen.getByRole('radio', { name: 'Commercial' }))
    const preview = screen.getByRole('region', { name: 'Aperçu de la vue' })
    expect(within(preview).getByText(/ne change pas tes droits/)).toBeTruthy()
    expect(within(preview).getByText(/Pilotage collectif : Son activité/)).toBeTruthy()
    expect(within(preview).getByText(/Conversations privées : Pas de nouvel accès/)).toBeTruthy()
  })

  it('renvoie vers Mes intégrations et dit que les messages restent à leur place', async () => {
    await view('droits')
    expect((await screen.findByRole('link', { name: 'Mes intégrations' })).getAttribute('href')).toBe('/integrations')
    expect(screen.getByText('Les messages restent à leur place')).toBeTruthy()
  })

  it('Règles d’équipe : la politique d’équipe existante, saisie sous team:manage, et « un seul moteur d’action »', async () => {
    await view('regles')
    expect((await screen.findByTestId('team-policy')).getAttribute('data-can-manage')).toBe('true')
    expect(screen.getByText(/Un seul moteur d’action/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voir les automatisations' }).getAttribute('href')).toBe(
      '/actions/automatisations',
    )
  })

  it('un commercial lit la politique sans pouvoir la saisir', async () => {
    useTeam.mockReturnValue({ team: team('sales'), isLoading: false, isError: false })
    await view('regles')
    expect((await screen.findByTestId('team-policy')).getAttribute('data-can-manage')).toBe('false')
  })
})
