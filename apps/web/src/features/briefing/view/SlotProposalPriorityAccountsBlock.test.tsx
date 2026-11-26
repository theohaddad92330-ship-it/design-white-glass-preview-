import type { SlotProposalPriorityAccount } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAccountLastOutcome } from '@/features/briefing/hooks/useAccountLastOutcome'
import { SlotProposalPriorityAccountsBlock } from './SlotProposalPriorityAccountsBlock'

// #3287 — chaque ligne lit le dernier résultat déclaré du compte.
// #3818 — l'objectif de l'espace, réglé par test (défaut : renseigné, comportement d'avant).
const mockHasObjective = vi.hoisted(() => ({ value: true }))
vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => mockHasObjective.value }))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: vi.fn(() => ({ items: [] })) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function account(partial: Partial<SlotProposalPriorityAccount>): SlotProposalPriorityAccount {
  return { accountId: 'acc-1', companyName: 'ACME', priorityScore: 20, ...partial }
}

/**
 * #2770 (#2101.14) — le classement par priorité, pour choisir à qui proposer
 * un rendez-vous en premier.
 */
describe('SlotProposalPriorityAccountsBlock', () => {
  it('rend chaque compte, avec le MÊME libellé de verdict que /accounts — jamais le score nu', () => {
    render(<SlotProposalPriorityAccountsBlock accounts={[account({ companyName: 'ACME', priorityScore: 20 })]} />)

    expect(screen.getByText('ACME')).toBeInTheDocument()
    // #2932 — `getRecommendation` rend un LIBELLÉ (GO/prudent/etc.), jamais
    // le nombre 20 affiché tel quel.
    expect(screen.queryByText('20')).not.toBeInTheDocument()
  })

  // #3818 — sans objectif renseigné, le classement ne dit pas « ÉCARTER POUR CET OBJECTIF ».
  it('#3818 — sans objectif : un score bas ne devient jamais « ÉCARTER POUR CET OBJECTIF »', () => {
    mockHasObjective.value = true
    const { unmount } = render(
      <SlotProposalPriorityAccountsBlock accounts={[account({ companyName: 'ACME', priorityScore: 3 })]} />,
    )
    expect(screen.getByText(/ÉCARTER POUR CET OBJECTIF/)).toBeInTheDocument()
    unmount()
    mockHasObjective.value = false
    try {
      render(<SlotProposalPriorityAccountsBlock accounts={[account({ companyName: 'ACME', priorityScore: 3 })]} />)
      expect(screen.queryByText(/ÉCARTER POUR CET OBJECTIF/)).not.toBeInTheDocument()
      expect(screen.getByText(/ÉVALUATION PERSONNALISÉE INDISPONIBLE/)).toBeInTheDocument()
    } finally {
      mockHasObjective.value = true
    }
  })

  it('rend PLUSIEURS comptes, dans l’ordre reçu (déjà classé par le service)', () => {
    render(
      <SlotProposalPriorityAccountsBlock
        accounts={[
          account({ accountId: 'acc-1', companyName: 'ACME' }),
          account({ accountId: 'acc-2', companyName: 'Globex' }),
        ]}
      />,
    )

    expect(screen.getByText('ACME')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('vide à dessein : `undefined` rend un message, jamais un rectangle muet', () => {
    render(<SlotProposalPriorityAccountsBlock accounts={undefined} />)

    expect(screen.getByText('Aucun compte à score mesuré à prioriser pour l’instant.')).toBeInTheDocument()
  })

  it('vide à dessein : une liste VIDE rend le même message qu’`undefined` — jamais un « 0 »', () => {
    render(<SlotProposalPriorityAccountsBlock accounts={[]} />)

    expect(screen.getByText('Aucun compte à score mesuré à prioriser pour l’instant.')).toBeInTheDocument()
  })

  it('#3287 — nomme le dernier résultat déclaré du compte listé', () => {
    vi.mocked(useAccountLastOutcome).mockReturnValue({
      id: 'i1',
      execution_status: 'done',
      outcome: 'qualified',
      completed_at: '2026-09-30T10:00:00Z',
    } as unknown as ReturnType<typeof useAccountLastOutcome>)
    render(<SlotProposalPriorityAccountsBlock accounts={[account({ companyName: 'SNCF' })]} />)
    expect(screen.getByText('Dernier résultat déclaré : Qualifié')).toBeInTheDocument()
  })
})
