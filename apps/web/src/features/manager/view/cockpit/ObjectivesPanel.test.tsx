import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMemberStats } from '@bellum/contracts'
import { i18n } from '@/i18n'

// Les panneaux d'objectifs portent leurs propres requêtes ; on les stube via des
// variables mutables (même patron que NeedsAccountSheet.test) pour couvrir chaque état.
let teamStub: { isSuccess: boolean; data: unknown }
let mineStub: { isSuccess: boolean; data: unknown }
const upsertMock = vi.fn()
vi.mock('../../hooks/useObjectives', () => ({
  useTeamObjectives: () => teamStub,
  useMyObjective: () => mineStub,
  useUpsertMyObjective: () => ({ mutate: upsertMock, isPending: false, isSuccess: false }),
}))

const { ObjectivesPanel } = await import('./ObjectivesPanel')

const members: ManagerMemberStats[] = [
  {
    user_id: 'u1',
    name: 'Alice Martin',
    email: 'a@esn.fr',
    role: 'owner',
    accounts: 0,
    contacts: 0,
    emails_sent: 0,
    analyses: 0,
    last_activity_at: null,
  },
]

describe('ObjectivesPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    teamStub = { isSuccess: false, data: undefined }
    mineStub = { isSuccess: false, data: undefined }
    upsertMock.mockReset()
  })

  it('stays hidden until an endpoint answers (deploy-skew)', () => {
    const { container } = render(<ObjectivesPanel members={members} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws attainment bars only for declared axes, from real data', () => {
    teamStub = {
      isSuccess: true,
      data: {
        period_month: '2026-07-01',
        members: [
          {
            user_id: 'u1',
            period_month: '2026-07-01',
            // Cible comptes NON déclarée → pas de barre comptes.
            targets: { meetings: 8, accounts: null, revenue: 50000 },
            achieved: { meetings: 3, accounts: 2, revenue: 20000 },
          },
        ],
      },
    }
    render(<ObjectivesPanel members={members} />)

    expect(screen.getByRole('heading', { name: 'Un objectif choisi, pas imposé en silence' })).toBeInTheDocument()
    // Une carte par membre (Théo `t8-goal-member`), dans la liste nommée de l'équipe.
    const card = within(screen.getByRole('list', { name: 'Atteinte de l’équipe' })).getByRole('listitem')
    expect(within(card).getByText('Alice Martin')).toBeInTheDocument()
    // Barre RDV : réalisé 3 / objectif 8.
    expect(screen.getByText(/3 \/ 8/)).toBeInTheDocument()
    // L'axe comptes n'est pas déclaré → aucune barre « Comptes ».
    expect(screen.queryByText('Comptes')).toBeNull()
  })

  it('shows the empty team state without fabricating rows', () => {
    teamStub = { isSuccess: true, data: { period_month: '2026-07-01', members: [] } }
    render(<ObjectivesPanel members={members} />)
    expect(screen.getByText(/Aucun objectif déclaré ce mois-ci/)).toBeInTheDocument()
  })

  it('lets a member declare their objective; empty fields become null targets', () => {
    mineStub = { isSuccess: true, data: { period_month: '2026-07-01', objective: null } }
    teamStub = { isSuccess: true, data: { period_month: '2026-07-01', members: [] } }
    render(<ObjectivesPanel members={members} />)

    // Théo `dlg-goal` : rien de déclaré → « Définir mon objectif » ouvre l'éditeur en fenêtre.
    expect(screen.queryByText('Mon objectif du mois')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Définir mon objectif' }))
    expect(screen.getByRole('dialog', { name: 'Tes objectifs du mois' })).toBeInTheDocument()
    expect(screen.getByText('Mon objectif du mois')).toBeInTheDocument()
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mon objectif' }))

    // Seul l'axe rempli porte une cible ; les vides restent null (jamais un 0 inventé).
    expect(upsertMock).toHaveBeenCalledWith({ target_meetings: 10, target_accounts: null, target_revenue: null })
  })
})
