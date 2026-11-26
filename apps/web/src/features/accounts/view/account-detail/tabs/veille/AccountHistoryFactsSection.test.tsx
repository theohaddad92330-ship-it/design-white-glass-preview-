import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const brief = vi.fn()
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({ useAccountFactsBrief: () => brief() }))

const noLinkedDeal = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountCrmSignals', () => ({
  useAccountHasNoLinkedCrmDeal: () => noLinkedDeal(),
}))

const { AccountHistoryFactsSection } = await import('./AccountHistoryFactsSection')

beforeEach(async () => {
  brief.mockReset()
  noLinkedDeal.mockReset()
  noLinkedDeal.mockReturnValue(false)
  await i18n.changeLanguage('fr')
})

describe('#4068.6 — l’historique daté de la carte se retrouve sur la veille du compte', () => {
  it('montre les besoins récurrents datés', () => {
    brief.mockReturnValue({
      deals: [],
      missions: [],
      exchanges: [],
      recurringNeeds: [{ label: 'Infogérance', occurrences: 3, lastDate: '2026-02-28' }],
    })
    render(<AccountHistoryFactsSection accountId="a-1" />)
    expect(screen.getByTestId('account-facts-brief')).toHaveTextContent('Infogérance')
    expect(screen.getByTestId('account-facts-brief')).toHaveTextContent('3 fois')
  })

  it('sans aucun fait, ou lecture muette : aucun bloc', () => {
    brief.mockReturnValue({ deals: [], missions: [], exchanges: [], recurringNeeds: [] })
    const { container, rerender } = render(<AccountHistoryFactsSection accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
    brief.mockReturnValue(null)
    rerender(<AccountHistoryFactsSection accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#3918.2 (r40) — aucune affaire CRM rattachée : la veille le DIT', () => {
  it('SAIT DIRE NON puis OUI : la phrase n’existe que si un CRM est lu et qu’aucune affaire n’est rattachée', async () => {
    brief.mockReturnValue(null)
    const { rerender } = render(<AccountHistoryFactsSection accountId="a-1" />)
    expect(screen.queryByText(/Aucune affaire du CRM rattachée à ce compte/)).not.toBeInTheDocument()

    noLinkedDeal.mockReturnValue(true)
    rerender(<AccountHistoryFactsSection accountId="a-1" />)
    expect(screen.getByText('Aucune affaire du CRM rattachée à ce compte.')).toBeInTheDocument()
  })

  it('des affaires passées déjà montrées : pas de phrase contradictoire', () => {
    noLinkedDeal.mockReturnValue(true)
    brief.mockReturnValue({
      deals: [{ id: 'd1', label: 'TMA', date: '2025-01-01', kind: 'deal' }],
      missions: [],
      exchanges: [],
      recurringNeeds: [],
    })
    render(<AccountHistoryFactsSection accountId="a-1" />)
    expect(screen.queryByText(/Aucune affaire du CRM rattachée/)).not.toBeInTheDocument()
  })
})
