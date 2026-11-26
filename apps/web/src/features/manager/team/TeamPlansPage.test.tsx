import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerTeamPlans } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

let plansStub: { isPending: boolean; isError: boolean; data: ManagerTeamPlans | undefined }
const updateMock = vi.fn()
vi.mock('../hooks/useTeamViews', () => ({
  useTeamPlans: () => plansStub,
  useUpdateTeamAction: () => ({ mutate: updateMock, isPending: false }),
  useCreateTeamAction: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { TeamPlansPage } = await import('./TeamPlansPage')

const DATA: ManagerTeamPlans = {
  open: 3,
  overdue: 1,
  delegated: 1,
  items: [
    {
      id: 'i1',
      label: 'Obtenir le bon de commande',
      account_id: 'a1',
      company_name: 'SNCF Voyageurs',
      due_date: '2020-01-01',
      overdue: true,
      owner_user_id: 'u1',
      assigned_to: null,
      delegated_by: null,
    },
    {
      id: 'i2',
      label: 'Vérifier le processus fournisseur',
      account_id: 'a2',
      company_name: 'Thales',
      due_date: null,
      overdue: false,
      owner_user_id: 'u1',
      assigned_to: 'u2',
      delegated_by: 'u1',
    },
    {
      id: 'i3',
      label: 'Préparer le cadrage',
      account_id: 'a3',
      company_name: 'Société Générale',
      due_date: null,
      overdue: false,
      owner_user_id: 'u2',
      assigned_to: null,
      delegated_by: null,
    },
  ],
  members: [
    { user_id: 'u1', name: 'Maëlle Lorquin' },
    { user_id: 'u2', name: 'Léa Marchand' },
  ],
  accounts: [
    { id: 'a1', company_name: 'SNCF Voyageurs' },
    { id: 'a2', company_name: 'Thales' },
    { id: 'a3', company_name: 'Société Générale' },
  ],
}

const renderPage = (status: 'todo' | 'overdue' | 'today' | 'delegated' | 'all', layout: 'list' | 'split' | 'week') =>
  renderWithRouter(
    <TeamPlansPage status={status} layout={layout} onStatusChange={() => {}} onLayoutChange={() => {}} />,
  )

describe('TeamPlansPage (Théo D team-plans)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    plansStub = { isPending: false, isError: false, data: DATA }
    updateMock.mockReset()
  })

  it('R1 — la liste porte les filtres d’état, « Créer une action » et la phrase du glisser-déposer', async () => {
    renderPage('todo', 'list')
    expect(await screen.findByText('Obtenir le bon de commande')).toBeTruthy()
    for (const label of ['À faire', 'En retard', 'Aujourd’hui', 'Déléguées', 'Toutes']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Créer une action' })).toBeTruthy()
    expect(screen.getByText(/Tu peux aussi modifier chaque action au clavier/)).toBeTruthy()
  })

  it('N3 — « Déléguées » ne garde que les actions confiées, et dit par qui', async () => {
    renderPage('delegated', 'list')
    expect(await screen.findByText('Vérifier le processus fournisseur')).toBeTruthy()
    expect(screen.queryByText('Obtenir le bon de commande')).toBeNull()
    expect(screen.getByText(/confiée par Maëlle Lorquin/)).toBeTruthy()
  })

  it('R1 — « En retard » ne garde que le retard', async () => {
    renderPage('overdue', 'list')
    expect(await screen.findByText('Obtenir le bon de commande')).toBeTruthy()
    expect(screen.queryByText('Préparer le cadrage')).toBeNull()
  })

  it('R3 — « Préparer » est un lien vers le plan du compte : rien ne part', async () => {
    renderPage('todo', 'list')
    const links = await screen.findAllByRole('link', { name: 'Préparer' })
    expect(links.length).toBe(3)
    expect(links[0]!.getAttribute('href')).toContain('tab=plan')
  })

  it('N2 — « Modifier » (clavier) ouvre une confirmation : rien n’est écrit avant « Confirmer »', async () => {
    renderPage('todo', 'list')
    fireEvent.click((await screen.findAllByRole('button', { name: 'Modifier' }))[0]!)
    expect(await screen.findByText('Confirmer le changement')).toBeTruthy()
    expect(updateMock).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Confirmer' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('N1 — la Répartition range chaque action sous son responsable', async () => {
    renderPage('todo', 'split')
    expect(await screen.findByRole('region', { name: 'Maëlle Lorquin' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Léa Marchand' })).toBeTruthy()
  })

  it('N1 — la Semaine garde une section « Hors de cette semaine / sans date »', async () => {
    renderPage('todo', 'week')
    expect(await screen.findByRole('region', { name: 'Hors de cette semaine / sans date' })).toBeTruthy()
  })
})
