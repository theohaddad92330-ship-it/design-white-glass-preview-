import { describe, expect, it } from 'vitest'
import type { WorkspaceSignalHistory } from '@bellum/contracts'
import { buildAccountHistory, historyItemsOf } from './account-history'
import { applyHistoryFilters, EMPTY_HISTORY_FILTERS } from './history-filters'

/** Lot 773 (c) — le compteur de l'Historique compte les LIGNES regroupées, pas les phrases lues. */
const NOW = Date.parse('2026-11-02T10:00:00Z')

const line = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  date: '2026-05-10',
  date_precision: 'day' as const,
  period: 'past' as const,
  type: 'projet' as const,
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})

const HISTORY = {
  accounts: [
    {
      account_id: 'a1',
      company_name: 'TotalEnergies',
      sector: 'Énergie',
      logo_url: null,
      website: null,
      headquarters: null,
      lines: [
        line('p1', 'TotalEnergies a annoncé la signature d’un contrat avec Dell Technologies et NVIDIA pour Pangea 5'),
        line('p2', 'Signature d’un contrat pour le calcul haute performance Pangea 5'),
        line('p3', 'Signature du contrat Pangea 5 avec Dell'),
        line('o1', 'Migration du SI vers Azure pour la filiale Raffinage'),
      ],
    },
  ],
} as unknown as WorkspaceSignalHistory

describe('buildAccountHistory — les reformulations d’un même fait', () => {
  it('3 phrases Pangea 5 + 1 autre besoin → 2 lignes, le compteur compte les lignes regroupées', () => {
    const [row] = buildAccountHistory(historyItemsOf(HISTORY), NOW)
    expect(row!.needCount).toBe(2)
    expect(row!.groups).toHaveLength(2)
    expect(row!.groups.map(group => group.members.length).sort()).toEqual([1, 3])
  })

  it('le total de l’écran compte aussi les lignes regroupées', () => {
    const result = applyHistoryFilters(historyItemsOf(HISTORY), EMPTY_HISTORY_FILTERS, NOW)
    expect(result.needCount).toBe(2)
  })

  it('avec une recherche, la ligne qui correspond passe en tête et le compte de correspondances est en lignes', () => {
    const result = applyHistoryFilters(historyItemsOf(HISTORY), { ...EMPTY_HISTORY_FILTERS, query: 'azure' }, NOW)
    expect(result.rows[0]!.groups[0]!.head.signalLabel).toMatch(/Azure/)
    expect(result.matchNeeds).toBe(1)
    const pangea = applyHistoryFilters(historyItemsOf(HISTORY), { ...EMPTY_HISTORY_FILTERS, query: 'pangea' }, NOW)
    expect(pangea.matchNeeds).toBe(1)
  })
})
