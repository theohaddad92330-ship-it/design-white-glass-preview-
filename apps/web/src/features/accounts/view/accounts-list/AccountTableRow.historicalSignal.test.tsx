import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import type { AccountRow } from './types'

/**
 * #3682.2 — un fait ancien ne se présente pas comme une actualité : la cellule
 * « Signal dominant » le dit « Contexte historique », avec sa date réelle.
 * Un fait actuel (ou sans fraîcheur posée) ne porte aucune mention.
 */
vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))
vi.mock('./useAccessSummary', () => ({ useAccessSummary: vi.fn() }))

beforeEach(() => {
  vi.mocked(useAccessSummary).mockReturnValue({ isError: false } as ReturnType<typeof useAccessSummary>)
})

function row(freshness: 'current' | 'archive' | 'undated' | null): AccountRow {
  return {
    id: 'acc-tf1',
    company_name: 'tf1',
    sector: 'Médias',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    employees: null,
    commercial_status: 'opportunity',
    primary_signal: 'Programme de transformation SI',
    signal_preview: { label: 'Programme de transformation SI', date: '2024-03', freshness },
  }
}

function renderTable(r: AccountRow) {
  return renderWithRouter(
    <AccountsTable
      rows={[r]}
      onDelete={vi.fn()}
      onArchive={vi.fn()}
      sortKey="date_desc"
      onSortKeyChange={vi.fn()}
      selectedIds={new Set<string>()}
      onSelectionChange={vi.fn()}
      onToggleAll={vi.fn()}
    />,
  )
}

describe('#3682.2 — Contexte historique', () => {
  it('un fait ancien est annoncé « Contexte historique »', async () => {
    renderTable(row('archive'))
    expect(await screen.findByText('Contexte historique')).toBeInTheDocument()
  })

  it('un fait actuel ne porte aucune mention d’ancienneté', async () => {
    renderTable(row('current'))
    await screen.findByText('Programme de transformation SI')
    expect(screen.queryByText('Contexte historique')).toBeNull()
  })
})
