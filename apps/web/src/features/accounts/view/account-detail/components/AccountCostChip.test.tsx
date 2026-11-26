import type { AccountCostSummary, WorkspaceRole } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountCostChip } from './AccountCostChip'

const useTeamMock = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => useTeamMock(),
}))

const useAccountCostMock = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountCost', () => ({
  useAccountCost: (...args: unknown[]) => useAccountCostMock(...args),
}))

function withRole(role: WorkspaceRole) {
  useTeamMock.mockReturnValue({ team: { workspace: { role } } })
}

function cost(overrides: Partial<AccountCostSummary>): AccountCostSummary {
  return {
    account_id: 'a-1',
    api_cost_euros: null,
    analyses_count: 0,
    total_run_cost_euros: null,
    last_run_cost_euros: null,
    ...overrides,
  }
}

describe('AccountCostChip — la fiche compte annonce le CRÉDIT consommé, jamais un coût fournisseur', () => {
  it('n’affiche jamais un montant en euros, même à un rôle qui gère la facturation', () => {
    // Restitution TF1 p9 : « Le coût fournisseur brut 0,24 EUR ne doit pas être
    // visible au client. Afficher crédit consommé ; garder le coût dans le
    // Manager. » Le montant reste consultable dans le cockpit Manager.
    withRole('owner')
    useAccountCostMock.mockReturnValue({ data: cost({ api_cost_euros: 0.25, analyses_count: 3 }) })
    const { container } = render(<AccountCostChip accountId="a-1" />)
    expect(container.textContent).not.toMatch(/€|EUR/)
    expect(container.textContent).not.toContain('0,25')
  })

  it('annonce le nombre d’analyses consommées', () => {
    withRole('owner')
    useAccountCostMock.mockReturnValue({ data: cost({ api_cost_euros: 0.25, analyses_count: 3 }) })
    render(<AccountCostChip accountId="a-1" />)
    expect(screen.getByText(/3\s*analyses/)).toBeInTheDocument()
  })

  it('reste visible pour un commercial — le crédit consommé n’est pas une donnée de facturation', () => {
    withRole('sales')
    useAccountCostMock.mockReturnValue({ data: cost({ analyses_count: 2 }) })
    render(<AccountCostChip accountId="a-1" />)
    expect(screen.getByText(/2\s*analyses/)).toBeInTheDocument()
  })

  it('reste muet quand aucune analyse n’a été comptée (jamais un « 0 » inventé)', () => {
    withRole('owner')
    useAccountCostMock.mockReturnValue({ data: cost({ analyses_count: 0 }) })
    const { container } = render(<AccountCostChip accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reste muet sans donnée', () => {
    withRole('owner')
    useAccountCostMock.mockReturnValue({ data: undefined })
    const { container } = render(<AccountCostChip accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
