import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalLine } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({ useContactsByAccount: () => ({ data: [] }) }))
vi.mock('@/features/accounts/hooks/useAccountPerimeter', () => ({ useAccountPerimeter: () => undefined }))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn() }),
}))
vi.mock('@/features/watchlist/view/WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: () => <div data-testid="watchlist-signal-detail" />,
}))
const { SignalCompactRow } = await import('./SignalCompactRow')

/** #5000.1 — la ligne MONTÉE de l'onglet « Signaux & besoins » et sa modale disent le type de contrat. */
const offer = (over: Partial<AccountSignalLine> = {}): AccountSignalLine => ({
  id: 'o1',
  date: '2026-10-20',
  date_precision: 'day',
  period: 'now',
  type: 'recrutement',
  origin_kind: 'offre',
  title: 'Joaillier (H/F)',
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})
const ACCOUNT = { id: 'acc-1', companyName: 'Cartier' }

describe('SignalCompactRow — type de contrat d’une offre (#5000.1)', () => {
  it('la ligne d’une offre qui déclare son contrat le dit', () => {
    render(<SignalCompactRow account={ACCOUNT} line={offer({ contract_type: 'CDI' })} people={[]} />)
    expect(screen.getByTestId('signal-contract')).toHaveTextContent('CDI')
  })

  it('une offre sans contrat déclaré dit « Contrat non précisé » (le titre n’est pas lu)', () => {
    render(<SignalCompactRow account={ACCOUNT} line={offer({ title: 'Joaillier (H/F) CDI' })} people={[]} />)
    expect(screen.getByTestId('signal-contract')).toHaveTextContent('Contrat non précisé')
  })

  it('un fait qui n’est pas une offre ne porte aucun contrat', () => {
    render(<SignalCompactRow account={ACCOUNT} line={offer({ type: 'projet', origin_kind: 'analyse' })} people={[]} />)
    expect(screen.queryByTestId('signal-contract')).toBeNull()
  })

  it('la modale ouverte depuis la ligne dit aussi le contrat', async () => {
    render(<SignalCompactRow account={ACCOUNT} line={offer({ contract_type: 'CDD' })} people={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Joaillier/ }))
    const extras = await screen.findByTestId('signal-detail-extras')
    expect(within(extras).getByTestId('signal-detail-meta')).toHaveTextContent('CDD')
  })

  it('la modale d’une offre sans contrat dit « non précisé »', async () => {
    render(<SignalCompactRow account={ACCOUNT} line={offer()} people={[]} />)
    await userEvent.click(screen.getByRole('button', { name: /Joaillier/ }))
    const extras = await screen.findByTestId('signal-detail-extras')
    expect(within(extras).getByTestId('signal-detail-meta')).toHaveTextContent('Contrat non précisé')
  })
})
