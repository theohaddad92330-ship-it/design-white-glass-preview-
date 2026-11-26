import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerTeamBusiness } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

let businessStub: { isPending: boolean; isError: boolean; data: ManagerTeamBusiness | undefined }
const proposeMock = vi.fn()
vi.mock('../hooks/useTeamViews', () => ({
  useTeamBusiness: () => businessStub,
  useProposeObjective: () => ({ mutate: proposeMock, isPending: false }),
}))
vi.mock('../hooks/useObjectives', () => ({
  useUpsertMyObjective: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useAssignAccount', () => ({
  useAssignAccount: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { TeamBusinessPage } = await import('./TeamBusinessPage')

const DATA: ManagerTeamBusiness = {
  period_month: '2026-10-01',
  cap: {
    signed_amount: 71000,
    target_amount: 150000,
    contributors_with_target: 2,
    members_total: 2,
    won_without_amount: 0,
  },
  members: [
    {
      user_id: 'u1',
      name: 'Maëlle Lorquin',
      role: 'owner',
      signed_amount: 71000,
      target_revenue: 90000,
      target_meetings: 8,
      achieved_meetings: 1,
      target_accounts: 4,
      achieved_accounts: 6,
      pending_proposal: false,
    },
    {
      user_id: 'u2',
      name: 'Léa Marchand',
      role: 'sales',
      signed_amount: null,
      target_revenue: 60000,
      target_meetings: null,
      achieved_meetings: 1,
      target_accounts: null,
      achieved_accounts: 2,
      pending_proposal: true,
    },
  ],
  deals: [
    {
      opportunity_id: 'o1',
      label: 'Renfort SAP',
      account_id: 'a1',
      company_name: 'Airbus',
      owner_user_id: 'u1',
      stage: 'qualified',
      estimated_amount: 78000,
      expected_close_on: '2026-10-28',
      next_action_label: 'Retour client',
    },
    {
      opportunity_id: 'o2',
      label: 'Qualité des données',
      account_id: 'a2',
      company_name: 'Crédit Agricole',
      owner_user_id: 'u1',
      stage: 'detected',
      estimated_amount: null,
      expected_close_on: null,
      next_action_label: null,
    },
  ],
  deals_total: 2,
  deals_amount: 78000,
  deals_without_amount: 1,
  accounts: [
    {
      id: 'a1',
      company_name: 'Airbus',
      sector: 'Aéronautique',
      city: 'Toulouse',
      assigned_to: 'u1',
      next_action: { id: 'i1', label: 'Relancer Paul', due_date: '2026-10-22' },
    },
    { id: 'a2', company_name: 'EDF', sector: 'Énergie', city: null, assigned_to: null, next_action: null },
  ],
  accounts_total: 2,
}

describe('TeamBusinessPage (Théo D team-business)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    businessStub = { isPending: false, isError: false, data: DATA }
    proposeMock.mockReset()
  })

  it('R1/N1 — le cap, les trois lectures à ne pas confondre et le lien vers les encaissements', async () => {
    renderWithRouter(<TeamBusinessPage view="objectives" onViewChange={() => {}} />)
    expect(await screen.findByText(/de contrats gagnés/)).toBeTruthy()
    expect(screen.getByText('Ne pas confondre')).toBeTruthy()
    expect(screen.getByText('Le chiffre réellement encaissé')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Consulter les encaissements' })).toBeTruthy()
  })

  it("N8 — un montant signé absent s'écrit « Rien de signé », jamais « 0 € »", async () => {
    renderWithRouter(<TeamBusinessPage view="objectives" onViewChange={() => {}} />)
    expect(await screen.findByText('Rien de signé en octobre 2026')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/(^|[^\d\s\u202f\u00a0])\s?0[\s\u202f\u00a0]?€/)
  })

  it('N4 — RDV et comptes en « fait / cible », une cible absente reste « sans cible »', async () => {
    renderWithRouter(<TeamBusinessPage view="objectives" onViewChange={() => {}} />)
    expect(await screen.findByText('1 / 8')).toBeTruthy()
    expect(screen.getByText('6 / 4')).toBeTruthy()
    expect(screen.getAllByText('1 · sans cible').length).toBeGreaterThan(0)
  })

  it('N2 — une proposition en attente est signalée, et « Proposer une cible » ouvre le formulaire', async () => {
    renderWithRouter(<TeamBusinessPage view="objectives" onViewChange={() => {}} />)
    expect(await screen.findByText(/Une cible est proposée/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Proposer une cible' })[0]!)
    expect(await screen.findByText('Une proposition, pas une modification silencieuse')).toBeTruthy()
  })

  it('R2/N5 — une affaire sans montant reste visible, la date de décision absente est « à préciser »', async () => {
    renderWithRouter(<TeamBusinessPage view="deals" onViewChange={() => {}} />)
    expect(await screen.findByText('Qualité des données')).toBeTruthy()
    expect(screen.getByText('Sans montant')).toBeTruthy()
    expect(screen.getByText('Date de décision à préciser')).toBeTruthy()
    expect(screen.getByText('Retour client')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Revoir' })).toHaveLength(2)
  })

  it('N6 — « Comprendre les montants » déplie l’aide chiffrée', async () => {
    renderWithRouter(<TeamBusinessPage view="deals" onViewChange={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comprendre les montants' }))
    expect(screen.getByText(/jamais comptée comme 0 €|jamais compté comme 0 €/)).toBeTruthy()
  })

  it('R3/N7 — les portefeuilles filtrent « Sans responsable » et gardent « Attribuer »', async () => {
    renderWithRouter(<TeamBusinessPage view="portfolio" onViewChange={() => {}} />)
    expect(await screen.findByText('Airbus')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sans responsable' }))
    expect(screen.queryByText('Airbus')).toBeNull()
    expect(screen.getByText('EDF')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Attribuer' }).length).toBe(1)
  })
})
