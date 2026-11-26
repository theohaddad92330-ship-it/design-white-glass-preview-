import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountRow } from './types'

/**
 * #4497 (PR 12C, maquette V22 `.a4-score-pill`) — la colonne « Intérêt », GARDÉE avec ses axes : un score
 * n'est jamais nu. La pastille porte son échelle ; un clic ouvre les axes notés et NOMME ceux qui n'ont pas pu
 * être évalués. Sans score, rien — ni « 0 », ni « - ».
 */

const getOne = vi.fn()
vi.mock('@/features/accounts/api', () => ({
  accountKeys: { detail: (id: string) => ['account', id] },
  accountsApi: { getOne: (id: string) => getOne(id) },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}))

const { AccountInterestCell, interestScoreOf } = await import('./AccountInterestCell')

const row = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: 'sg',
  company_name: 'Société Générale',
  sector: 'Banque',
  priority_score: 8,
  score_25: 18,
  status: 'completed',
  created_at: '2026-10-01',
  ...over,
})

function renderCell(r: AccountRow) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccountInterestCell row={r} />
    </QueryClientProvider>,
  )
}

describe('AccountInterestCell — l’intérêt et ses axes (#4497)', () => {
  it('le /25 de la fiche quand il existe, sinon le /10 ; rien sans score', () => {
    expect(interestScoreOf({ priority_score: 8, score_25: 18 })).toEqual({ value: 18, max: 25 })
    expect(interestScoreOf({ priority_score: 7.5 })).toEqual({ value: 7.5, max: 10 })
    expect(interestScoreOf({ priority_score: null })).toBeNull()
  })

  it('la pastille porte son échelle — jamais un nombre nu', () => {
    renderCell(row())
    const pill = screen.getByRole('button', { name: 'Intérêt commercial 18 sur 25 : voir ses axes' })
    expect(pill).toHaveTextContent('18/25Intérêt')
  })

  it('un clic ouvre les axes notés, et NOMME ceux qui n’ont pas pu être évalués', async () => {
    getOne.mockResolvedValue({
      id: 'sg',
      raw_analysis: {
        score_factors: [
          { label: 'Besoin', weight: 4, max: 5, kind: 'axis', proof_type: 'signal' },
          { label: 'Accessibilité', weight: 3, max: 5, kind: 'axis', proof_type: 'contact' },
          { label: 'Timing', weight: null, max: 5, kind: 'axis', proof_type: 'signal' },
          { label: 'Total', weight: 7, max: 25, kind: 'total', proof_type: 'business_rule' },
        ],
      },
    })
    renderCell(row())
    await userEvent.click(screen.getByTestId('account-interest'))
    expect(await screen.findByText('Besoin')).toBeInTheDocument()
    expect(screen.getByText('4/5')).toBeInTheDocument()
    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByTestId('account-interest-excluded')).toHaveTextContent('Non évaluables, hors du total : Timing')
    // Le facteur « total » n'est pas un axe.
    expect(screen.queryByText('Total')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON : sans score, ou pendant une analyse, aucune pastille', () => {
    const { container, rerender } = renderCell(row({ priority_score: null, score_25: undefined }))
    expect(container).toBeEmptyDOMElement()
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AccountInterestCell row={row({ status: 'analyzing' })} />
      </QueryClientProvider>,
    )
    expect(screen.queryByTestId('account-interest')).not.toBeInTheDocument()
  })
})
