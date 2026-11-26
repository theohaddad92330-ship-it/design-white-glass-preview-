import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMember } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

let memberStub: { isPending: boolean; isError: boolean; data: ManagerMember | undefined }
vi.mock('../hooks/useTeamViews', () => ({
  useTeamMember: () => memberStub,
  useProposeObjective: () => ({ mutate: vi.fn(), isPending: false }),
  useMyObjectiveProposals: () => ({ data: [] }),
  useRespondToProposal: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useAssignAccount', () => ({ useAssignAccount: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'owner', memberCount: 3 }, members: [] } }),
}))

const { TeamMemberPage } = await import('./TeamMemberPage')

const DATA: ManagerMember = {
  member: { user_id: 'u2', name: 'Léa Marchand', email: 'lea@exemple.fr', role: 'sales' },
  period_month: '2026-10-01',
  counts: { accounts: 2, open_opportunities: 1, open_actions: 1 },
  objective: {
    target_revenue: 60000,
    target_meetings: 10,
    target_accounts: null,
    signed_amount: null,
    pending_proposal: false,
  },
  accounts: [
    {
      id: 'a1',
      company_name: 'Thales',
      sector: 'Défense',
      city: 'Paris',
      next_action: { id: 'i1', label: 'Vérifier le processus', due_date: '2026-10-20' },
    },
    { id: 'a2', company_name: 'Alstom', sector: 'Ferroviaire', city: null, next_action: null },
  ],
  actions: [
    {
      id: 'i1',
      label: 'Vérifier le processus',
      account_id: 'a1',
      company_name: 'Thales',
      due_date: '2026-10-20',
      overdue: false,
      delegated_by: null,
    },
  ],
  opportunities: [
    {
      id: 'o1',
      label: 'Sécurité cloud',
      account_id: 'a1',
      company_name: 'Thales',
      stage: 'qualified',
      estimated_amount: null,
    },
  ],
  integrations: [
    { kind: 'mailbox', connected_by_member: true },
    { kind: 'crm', connected_by_member: false },
  ],
}

describe('TeamMemberPage (Théo D team-member)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    memberStub = { isPending: false, isError: false, data: DATA }
  })

  it('R1 — la fiche porte les blocs : objectifs, plan, actions, portefeuille, affaires, rôle, accès', async () => {
    renderWithRouter(<TeamMemberPage memberId="u2" />)
    expect(await screen.findByText('Léa Marchand')).toBeTruthy()
    for (const title of [
      'Ses objectifs',
      'Plan de travail',
      'Les prochaines actions',
      'Le portefeuille',
      'Les affaires en cours',
      'Le rôle dans l’équipe',
      'Accès et intégrations',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
  })

  it('N4/c96 — la fiche dit que voir l’activité ne donne pas la messagerie', async () => {
    renderWithRouter(<TeamMemberPage memberId="u2" />)
    expect(await screen.findByText('Voir son activité ne permet pas de lire sa messagerie privée.')).toBeTruthy()
  })

  it('N3/Q3 — les intégrations sont nommées par capacité et disent qui les a branchées', async () => {
    renderWithRouter(<TeamMemberPage memberId="u2" />)
    expect(await screen.findByText(/Messagerie · branchée par Léa/)).toBeTruthy()
    expect(screen.getByText('CRM')).toBeTruthy()
  })

  it('un montant signé absent est « Rien de signé », un compte sans action le dit', async () => {
    renderWithRouter(<TeamMemberPage memberId="u2" />)
    expect(await screen.findByText('Rien de signé en octobre 2026')).toBeTruthy()
    expect(screen.getByText(/Aucune action ouverte · La suite reste à décider/)).toBeTruthy()
    expect(screen.getByText('Sans montant', { exact: false })).toBeTruthy()
  })

  it('R2 — la direction peut attribuer un compte du portefeuille et proposer un objectif', async () => {
    renderWithRouter(<TeamMemberPage memberId="u2" />)
    expect((await screen.findAllByRole('button', { name: 'Attribuer' })).length).toBe(2)
    expect(screen.getByRole('button', { name: 'Proposer un objectif' })).toBeTruthy()
  })

  it('une fiche introuvable le dit sans planter', async () => {
    memberStub = { isPending: false, isError: true, data: undefined }
    renderWithRouter(<TeamMemberPage memberId="nope" />)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})
