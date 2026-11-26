import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecentSignal } from '@bellum/contracts'
import { AccountCrmSignalsSection } from './AccountCrmSignalsSection'

const read = vi.hoisted(() => ({ signals: [] as RecentSignal[], noLinkedDeal: false }))
vi.mock('@/features/accounts/hooks/useAccountCrmSignals', () => ({
  useAccountCrmSignals: () => read.signals,
  useAccountHasNoLinkedCrmDeal: () => read.noLinkedDeal,
}))

// #3918.2 (R41) — Servier `?tab=veille` : ni signal d'affaire CRM daté nommant l'objet, ni « aucune affaire du CRM
// rattachée à ce compte ». Le test dit NON tant que l'écran d'ouverture (l'écran Opportunités) ne monte pas la lecture.
describe('AccountCrmSignalsSection — #3918.2 (R41)', () => {
  beforeEach(() => {
    read.signals = []
    read.noLinkedDeal = false
  })

  it('un signal d’affaire CRM se lit avec son objet et sa date', () => {
    read.signals = [
      {
        signal: 'Affaire « Migration cloud Servier » perdue',
        type: 'Affaire perdue',
        date: '2026-08-01',
        source: 'Votre CRM',
      } as RecentSignal,
    ]
    render(<AccountCrmSignalsSection accountId="a1" />)
    const list = screen.getByTestId('account-crm-signals')
    expect(list).toHaveTextContent('Migration cloud Servier')
    expect(list).toHaveTextContent('Affaire perdue')
    expect(list).toHaveTextContent(/2026/)
  })

  it('aucune affaire rattachée (CRM branché et lu) : la phrase, pas un blanc', () => {
    read.noLinkedDeal = true
    render(<AccountCrmSignalsSection accountId="a1" />)
    expect(screen.getByTestId('account-crm-no-linked-deal')).toBeInTheDocument()
  })

  it('CRM non branché ou lecture en échec : rien d’inventé', () => {
    const { container } = render(<AccountCrmSignalsSection accountId="a1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
