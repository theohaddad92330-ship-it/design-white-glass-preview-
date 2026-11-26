import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMemberStats } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/** Théo D team-business › Portefeuilles : une ligne par compte, sa situation, « Attribuer ». */

const accounts = vi.fn()
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => accounts() }))
const assign = vi.fn()
vi.mock('../../hooks/useAssignAccount', () => ({ useAssignAccount: () => ({ mutate: assign, isPending: false }) }))

const { TeamPortfolios } = await import('./TeamPortfolios')

const account = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  company_name: `Compte ${id}`,
  sector: 'Banque',
  owner: { user_id: 'u1', name: 'Maëlle Lorquin' },
  next_action_label: `Relancer ${id}`,
  next_action_horizon: 'Aujourd’hui',
  ...extra,
})
const MEMBERS = [
  { user_id: 'u1', name: 'Maëlle Lorquin' },
  { user_id: 'u2', name: 'Léa Marchand' },
] as ManagerMemberStats[]
const page = (rows: unknown[]) => ({
  isLoading: false,
  isError: false,
  hasNextPage: false,
  data: { pages: [{ data: rows, pagination: { totalItems: rows.length, hasNext: false, currentPage: 1, size: 50 } }] },
})

beforeEach(() => {
  vi.clearAllMocks()
  accounts.mockReturnValue(
    page([
      account('a1'),
      account('a2', { owner: null }),
      account('a3', { next_action_label: null, next_action_horizon: null }),
    ]),
  )
})

describe('Portefeuilles', () => {
  it('le panneau de Théo : titre, phrase, « Ouvrir Comptes », recherche, situation, compte', async () => {
    renderWithRouter(<TeamPortfolios members={MEMBERS} />)
    expect(
      await screen.findByRole('heading', { name: 'Le bon responsable, la bonne prochaine action.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir Comptes' })).toHaveAttribute('href', '/accounts')
    expect(screen.getByLabelText('Rechercher un compte')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Situation du portefeuille' })).toBeInTheDocument()
    expect(screen.getByText('3 comptes')).toBeInTheDocument()
  })

  it('chaque ligne : le compte (lien), son responsable, sa prochaine action — une absence se nomme', async () => {
    renderWithRouter(<TeamPortfolios members={MEMBERS} />)
    const a1 = (await screen.findByText('Compte a1')).closest('li') as HTMLElement
    expect(within(a1).getByRole('link', { name: /Compte a1/ })).toHaveAttribute('href', '/accounts/a1')
    expect(within(a1).getByText('Relancer a1')).toBeInTheDocument()
    expect(within(a1).getByText('Aujourd’hui')).toBeInTheDocument()
    const a2 = screen.getByText('Compte a2').closest('li') as HTMLElement
    expect(within(a2).getByText('Sans responsable')).toBeInTheDocument()
    const a3 = screen.getByText('Compte a3').closest('li') as HTMLElement
    expect(within(a3).getByText('Aucune action ouverte')).toBeInTheDocument()
    expect(within(a3).getByText('La suite reste à décider')).toBeInTheDocument()
  })

  it('la situation se choisit en multi-sélection', async () => {
    renderWithRouter(<TeamPortfolios members={MEMBERS} />)
    const group = await screen.findByRole('group', { name: 'Situation du portefeuille' })
    fireEvent.click(within(group).getByRole('button', { name: /Sans responsable/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(within(group).getByRole('button', { name: /Sans action ouverte/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('2 comptes affichés')).toBeInTheDocument()
  })

  it('« Attribuer » ouvre sa fenêtre ; rien ne change sans « Confirmer l’attribution »', async () => {
    renderWithRouter(<TeamPortfolios members={MEMBERS} />)
    const a2 = (await screen.findByText('Compte a2')).closest('li') as HTMLElement
    fireEvent.click(within(a2).getByRole('button', { name: 'Attribuer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Attribuer Compte a2' })
    expect(within(dialog).getByRole('button', { name: 'Confirmer l’attribution' })).toBeDisabled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('aucun compte : une phrase, jamais une liste vide muette', async () => {
    accounts.mockReturnValue(page([]))
    renderWithRouter(<TeamPortfolios members={MEMBERS} />)
    expect(await screen.findByTestId('team-portfolios-empty')).toHaveTextContent('Aucun compte dans l’espace')
  })
})
