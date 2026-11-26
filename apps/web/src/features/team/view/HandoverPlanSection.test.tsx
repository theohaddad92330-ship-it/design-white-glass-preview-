import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandoverPlanResult, MemberPortfolio } from '@bellum/contracts'

// #4158.29 — répartir par lots : récapitulatif AVANT validation, `null` ≠ « 0 ».
const recapMutate = vi.fn()
const confirmMutate = vi.fn()
let recapData: HandoverPlanResult | undefined
vi.mock('@/features/team/hooks/useHandoverPlan', () => ({
  useHandoverPlan: () => ({
    recap: { mutate: recapMutate, reset: vi.fn(), isPending: false, data: recapData },
    confirm: { mutate: confirmMutate, isPending: false },
  }),
}))

const { HandoverPlanRecap, HandoverRecipientSelect, allocationsOf } = await import('./HandoverPlanSection')

const FROM = '11111111-1111-4111-8111-111111111111'
const ALIX = '22222222-2222-4222-8222-222222222222'

const DATA: MemberPortfolio = {
  userId: FROM,
  email: 'partant@esn.fr',
  fullName: 'Camille Partant',
  holdings: [
    { kind: 'accounts', count: 12 },
    { kind: 'contacts', count: 0 },
    { kind: 'actions', count: null },
  ],
  personal: ['mailbox'],
  eligibleSuccessors: [
    {
      userId: ALIX,
      email: 'alix@esn.fr',
      fullName: 'Alix Reprend',
      role: 'sales',
      joinedAt: '2026-01-05T09:00:00.000Z',
    },
  ],
}

beforeEach(() => {
  recapMutate.mockReset()
  confirmMutate.mockReset()
  recapData = undefined
})

describe('la répartition par lots', () => {
  it('allocationsOf : ne fait AUCUN lot pour une nature à zéro, garde celle dont le comptage a échoué', () => {
    const lots = allocationsOf(DATA, { accounts: ALIX, contacts: ALIX, actions: ALIX })
    expect(lots).toEqual([
      { kind: 'accounts', toUserId: ALIX },
      { kind: 'actions', toUserId: ALIX },
    ])
  })

  it('le sélecteur n’existe pas pour une nature à zéro', () => {
    render(<HandoverRecipientSelect kind="contacts" count={0} data={DATA} value={undefined} onChange={vi.fn()} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('le récapitulatif reste désactivé tant qu’aucun destinataire n’est choisi', () => {
    render(<HandoverPlanRecap fromUserId={FROM} data={DATA} allocations={[]} onValidated={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Voir le récapitulatif/ })).toBeDisabled()
    expect(recapMutate).not.toHaveBeenCalled()
  })

  it('demande le récapitulatif PUIS affiche nombre par type et destinataire, « non abouti » à la place d’un faux 0', async () => {
    recapData = {
      fromUserId: FROM,
      confirmed: false,
      lines: [
        { kind: 'accounts', toUserId: ALIX, count: 12 },
        { kind: 'actions', toUserId: ALIX, count: null },
      ],
    }
    const allocations = allocationsOf(DATA, { accounts: ALIX, actions: ALIX })
    render(<HandoverPlanRecap fromUserId={FROM} data={DATA} allocations={allocations} onValidated={vi.fn()} />)

    // Avant le clic : aucun récapitulatif, donc aucune validation possible.
    expect(screen.queryByTestId('handover-recap')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /Voir le récapitulatif/ }))
    expect(recapMutate).toHaveBeenCalledWith(allocations)

    const recap = screen.getByTestId('handover-recap')
    expect(recap).toHaveTextContent('Alix Reprend')
    expect(recap).toHaveTextContent('12 · Comptes portés')
    expect(recap).toHaveTextContent('comptage non abouti')
    expect(recap).not.toHaveTextContent('0 · Actions')
    expect(confirmMutate).not.toHaveBeenCalled()
  })
})
