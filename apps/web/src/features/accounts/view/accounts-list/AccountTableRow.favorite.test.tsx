import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import type { AccountRow } from './types'

/**
 * #2150.14/.18 — L'ÉTOILE DE LIGNE.
 *
 * Ce que ce fichier prouve, à l'écran :
 *  1. l'étoile n'apparaît PLEINE que si `row.is_favorite` est vrai ;
 *  2. le clic appelle l'API avec le BON compte et la BONNE cible, et
 *     n'ouvre PAS le dossier (la ligne entière navigue par ailleurs).
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS, ET POURQUOI : la bascule optimiste et
 * son retour arrière vivent dans le CACHE react-query (`useSetAccountFavorite`
 * écrit dans TOUTES les requêtes `accounts.list.*`), pas dans un état local de
 * la ligne — `AccountTableRow` ne fait que LIRE `row.is_favorite`, une prop
 * fournie par `AccountsPage` via `useAccountsCache(infiniteData)`, elle-même
 * abonnée à CE cache. Un rendu isolé de `AccountsTable` avec des `rows`
 * statiques (comme ici) n'a pas cet abonnement : écrire dans le cache ne
 * changerait aucune prop, et un test qui l'affirmerait serait soit un faux
 * rouge (timeout), soit un faux vert qui compare l'état final à l'état
 * initial sans avoir bougé entre les deux (le défaut qu'une garde borgne ne
 * doit pas reproduire). La preuve du couple optimiste/retour-arrière est donc
 * à `useSetAccountFavorite.test.tsx`, contre la MÊME forme de cache que
 * `useAccounts` alimente réellement.
 */

vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))
vi.mock('./useAccessSummary', () => ({ useAccessSummary: vi.fn() }))
const useAccessSummaryMock = vi.mocked(useAccessSummary)

const mockSetFavorite = vi.fn()
vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: { ...actual.accountsApi, setFavorite: (...args: unknown[]) => mockSetFavorite(...args) },
  }
})

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  useAccessSummaryMock.mockReturnValue({ isError: false } as ReturnType<typeof useAccessSummary>)
  mockSetFavorite.mockReset()
})

function makeRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    company_name: 'edf',
    sector: 'Énergie',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    employees: null,
    commercial_status: 'opportunity',
    primary_signal: null,
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

describe('#2150.14/.18 — l’étoile de ligne', () => {
  it('n’apparaît PLEINE que si `is_favorite` est vrai', async () => {
    renderTable([makeRow({ is_favorite: true })])
    const star = await screen.findByRole('button', { name: 'Retirer des favoris' })
    expect(star).toHaveAttribute('aria-pressed', 'true')
  })

  it('reste creuse quand `is_favorite` est absent ou faux', async () => {
    renderTable([makeRow({ is_favorite: false })])
    const star = await screen.findByRole('button', { name: 'Ajouter aux favoris' })
    expect(star).toHaveAttribute('aria-pressed', 'false')
  })

  it('le clic sur l’étoile n’ouvre PAS le dossier — la ligne entière navigue', async () => {
    mockSetFavorite.mockResolvedValue({ id: 'acc-1', is_favorite: true })
    renderTable([makeRow({ is_favorite: false })])
    const star = await screen.findByRole('button', { name: 'Ajouter aux favoris' })

    fireEvent.click(star)

    await waitFor(() => expect(mockSetFavorite).toHaveBeenCalledWith('acc-1', true))
  })
})
