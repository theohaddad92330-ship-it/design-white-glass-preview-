import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import { useAccessSummary } from './useAccessSummary'
import type { AccountRow } from './types'

/**
 * #1417.4 — LE LOGO EST TROP GRAND, PAS TROP PETIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CHAÎNE MESURÉE — le diagnostic du 09/09 s'était trompé
 * ─────────────────────────────────────────────────────────────────────────────
 * `AccountTableRow.tsx` passait `size="md"` à `CompanyAvatar`, qui traduit
 * `'md'` en `'sm'` pour `EntityAvatar` (`CompanyAvatar.tsx:16`), et
 * `entity-avatar.tsx` rend `sm` en `size-9` — soit **36px** (`size-N` = N × 4px
 * dans l'échelle Tailwind par défaut), pas les 28px que le retour du 09/09
 * annonçait à tort.
 *
 * ⚠️ jsdom NE MET RIEN EN PAGE : `getBoundingClientRect()` y rend toujours des
 * zéros, et un test qui s'y fierait passerait au vert sur n'importe quelle
 * taille. Ce test ne lit donc pas une classe au hasard ("contient size-7") —
 * il retrouve l'utilitaire `size-N` réellement rendu sur le nœud et le
 * CONVERTIT en pixels, comme le ferait un navigateur qui appliquerait la
 * feuille Tailwind. C'est la mesure la plus proche d'un pixel réel qu'un test
 * jsdom puisse prouver.
 */

vi.mock('@/features/propagation/hooks', () => ({
  useAccountRevenueColumn: () => ({ visible: false, failed: false, canReadFinance: false, byAccount: new Map() }),
}))
vi.mock('./useAccessSummary', () => ({ useAccessSummary: vi.fn() }))
const useAccessSummaryMock = vi.mocked(useAccessSummary)

beforeEach(() => {
  useAccessSummaryMock.mockReturnValue({ isError: false } as ReturnType<typeof useAccessSummary>)
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

/** Tailwind : `size-N` (comme `h-N` / `w-N`) vaut N × 4px sur l'échelle par
 *  défaut (`--spacing: 0.25rem`, racine à 16px). C'est la conversion qu'un
 *  navigateur ferait en appliquant la feuille — jsdom ne peut pas la faire
 *  lui-même, donc ce test la fait à sa place plutôt que de se fier à une
 *  lecture de classe brute. */
function pixelsFromSizeUtility(className: string): number {
  const match = className.match(/(?:^|\s)size-(\d+)(?:\s|$)/)
  expect(match, `aucun utilitaire size-N dans « ${className} »`).not.toBeNull()
  return Number(match![1]) * 4
}

describe('#1417.4 — le logo de la liste des comptes', () => {
  it('mesure 32px — la borne haute de la fourchette 30-32 demandée par le retour', async () => {
    renderTable([makeRow()])
    await screen.findByText('Edf')

    const row = screen.getByText('Edf').closest('tr')
    expect(row).not.toBeNull()
    // #2150.14/.18 — `span`, précisément : depuis l'étoile de ligne, la ligne
    // porte un second `aria-hidden="true"` (le `<svg>` de l'icône ⭐), plus
    // proche dans le DOM que l'avatar. `[aria-hidden="true"]` seul l'aurait
    // pris pour l'avatar et cassé ce test sur un `className` de type
    // `SVGAnimatedString` (pas une chaîne) plutôt que sur une VRAIE mesure.
    const avatar = row!.querySelector('span[aria-hidden="true"]')
    expect(avatar, 'aucun avatar (span aria-hidden) trouvé sur la ligne').not.toBeNull()

    const px = pixelsFromSizeUtility((avatar as HTMLElement).className)
    // #1417.4 — Louis a tranché « go pour la taille » sur la fourchette 30-32.
    // Les bornes restent assertées des DEUX côtés : c'est ce qui a manqué au
    // lot précédent, qui visait 30-32 et a livré 28.
    expect(px).toBe(32)
    expect(px).toBeGreaterThanOrEqual(30)
    expect(px).toBeLessThanOrEqual(32)
  })
})
