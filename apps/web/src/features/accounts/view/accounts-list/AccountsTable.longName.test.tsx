import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountsTable } from './AccountsTable'
import type { AccountRow } from './types'

// #3666.c (recette prod 09/10) — « THALES COMMUNICATION & SECURITE… » coupé à 174 px sur 381 px
// disponibles, sans infobulle : le nom prend la largeur dont il dispose (2 lignes au plus) et
// porte son nom COMPLET en infobulle.
function stubDesktop(): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

const LONG = 'THALES COMMUNICATION & SECURITE SAS'

function row(): AccountRow {
  return {
    id: 'acc-thales',
    company_name: LONG,
    sector: 'Défense',
    priority_score: 8,
    status: 'completed',
    created_at: '2026-07-01T10:00:00.000Z',
    primary_signal: 'Recrute',
  }
}

describe('#3666.c — le nom long d’un compte se lit, sur 2 lignes au plus, avec son infobulle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('desktop : line-clamp-2 (pas truncate), title = nom complet', async () => {
    stubDesktop()
    renderWithRouter(
      <AccountsTable
        rows={[row()]}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        sortKey="date_desc"
        onSortKeyChange={vi.fn()}
        selectedIds={new Set<string>()}
        onSelectionChange={vi.fn()}
        onToggleAll={vi.fn()}
      />,
    )
    const name = await screen.findByTitle(/Thales communication & securite sas/i)
    expect(name.className).toContain('line-clamp-2')
    expect(name.className).not.toMatch(/(^|\s)truncate(\s|$)/)
    expect(name).toHaveAttribute('title', name.textContent ?? '')
  })
})
