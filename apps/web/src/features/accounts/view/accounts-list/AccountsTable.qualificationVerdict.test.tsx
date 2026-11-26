import { screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import { useQualificationSummary } from './useQualificationSummary'
import type { AccountRow } from './types'

/**
 * LA COLONNE « GRILLE DE QUALIFICATION » — #3749.
 *
 * La fiche compte lit déjà le verdict de la grille (`AccountQualificationCard`,
 * `TabEvaluation.tsx`) ; rien ne le montrait au niveau de la LISTE des
 * comptes. `row.qualificationVerdict` arrive FUSIONNÉ par `AccountContent.tsx`
 * (voir `useQualificationSummary.ts`) — cette table se contente de le LIRE,
 * jamais de le recalculer. Même garde de panne que la colonne Accessibilité
 * voisine (`AccountsTable.accessClass.test.tsx`) : une lecture en échec ne se
 * lit jamais comme « aucune grille évaluée ».
 */
vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))
vi.mock('./useAccessSummary', () => ({ useAccessSummary: vi.fn() }))
vi.mock('./useQualificationSummary', () => ({ useQualificationSummary: vi.fn() }))
const useAccessSummaryMock = vi.mocked(useAccessSummary)
const useQualificationSummaryMock = vi.mocked(useQualificationSummary)

beforeEach(() => {
  useAccessSummaryMock.mockReturnValue({ isError: false } as ReturnType<typeof useAccessSummary>)
  useQualificationSummaryMock.mockReturnValue({ isError: false } as ReturnType<typeof useQualificationSummary>)
})

function makeRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    ...overrides,
  }
}

function renderTable(rows: AccountRow[]) {
  return renderWithRouter(
    <AccountsTable
      rows={rows}
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

describe('AccountsTable — colonne Grille de qualification', () => {
  it.each([
    ['GO', 'GO'],
    ['PRUDENT', 'PRUDENT'],
    ['NO-GO', 'NO-GO'],
  ] as const)('affiche le verdict %s', async (verdict, label) => {
    renderTable([makeRow({ qualificationVerdict: verdict })])

    await screen.findByText('Edf')
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  // #3749.1 — recette prod (8d7c6957f0) : 25/25 lignes rendaient un tiret nu,
  // sans dire pourquoi. La cellule NOMME désormais la raison (« Grille non
  // remplie »), jamais un tiret muet — doctrine « on nomme ce qu'on n'a pas ».
  it('nomme « Grille non remplie », jamais un tiret nu, quand aucune grille n’a été évaluée pour ce compte', async () => {
    renderTable([makeRow({ qualificationVerdict: null })])

    await screen.findByText('Edf')
    expect(screen.getByText('Grille non remplie')).toBeInTheDocument()
  })

  it('nomme aussi « Grille non remplie » tant que le résumé n’a pas encore été fusionné (champ absent)', async () => {
    renderTable([makeRow()])

    await screen.findByText('Edf')
    expect(screen.getByText('Grille non remplie')).toBeInTheDocument()
  })

  it('dit que la LECTURE a échoué — jamais « — », jamais un verdict deviné', async () => {
    useQualificationSummaryMock.mockReturnValue({ isError: true } as ReturnType<typeof useQualificationSummary>)
    renderTable([makeRow({ qualificationVerdict: undefined })])

    await screen.findByText('Edf')
    expect(screen.queryByTitle('Aucune grille évaluée')).not.toBeInTheDocument()
    expect(screen.queryByText('GO')).not.toBeInTheDocument()
    expect(screen.getByText('Non lu')).toBeInTheDocument()
    expect(screen.getByTitle('Le verdict de la grille n’a pas pu être lu.')).toBeInTheDocument()
  })

  it('une panne de la grille n’affecte pas la colonne Accessibilité voisine, et réciproquement', async () => {
    useAccessSummaryMock.mockReturnValue({ isError: true } as ReturnType<typeof useAccessSummary>)
    renderTable([makeRow({ qualificationVerdict: 'GO', accessClass: 'A' })])

    await screen.findByText('Edf')
    // Accessibilité EN PANNE : jamais « Ouvert ».
    expect(screen.queryByText('Ouvert')).not.toBeInTheDocument()
    // Grille : lecture réussie, le verdict se lit normalement.
    expect(screen.getByText('GO')).toBeInTheDocument()
  })
})
