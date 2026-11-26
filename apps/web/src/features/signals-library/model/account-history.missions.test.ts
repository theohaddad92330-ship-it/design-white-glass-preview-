import { describe, expect, it } from 'vitest'
import type { WorkspaceSignalHistory } from '@bellum/contracts'
import { buildAccountHistory, historyItemsOf } from './account-history'
import { applyHistoryFilters, EMPTY_HISTORY_FILTERS } from './history-filters'

/** Lot 775 — les missions observées (mémoire marché, sans identité) vivent dans la liste, pas dans les « faits » repliés. */
const NOW = Date.parse('2026-11-02T10:00:00Z')

const line = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  date: '2024-06-01',
  date_precision: 'month' as const,
  period: 'past' as const,
  type: 'mission_observee' as const,
  origin_kind: 'memoire' as const,
  detail: '2023-2024 · via Alten · Lyon',
  url: null,
  technologies: ['Java', 'Kafka'],
  tjm_eur: 650,
  people_hints: { names: [], roles: ['Data Engineer'], location: 'Lyon' },
  ...over,
})

const HISTORY = {
  accounts: [
    {
      account_id: 'a1',
      company_name: 'Thales',
      sector: null,
      logo_url: null,
      website: null,
      headquarters: null,
      lines: [
        line('m1', 'Un freelance Data Engineer'),
        line('m2', 'Un salarié Architecte cloud', { date: '2025-06-01', technologies: ['Azure'], tjm_eur: undefined }),
        line('m3', 'Un consultant en ESN Développeur Java', { date: '2021-09-01', technologies: ['Spring'] }),
      ],
    },
  ],
} as unknown as WorkspaceSignalHistory

describe('buildAccountHistory — missions observées', () => {
  it('chaque mission est une ligne de la liste (jamais repliée dans les faits)', () => {
    const [row] = buildAccountHistory(historyItemsOf(HISTORY), NOW)
    expect(row!.factCount).toBe(0)
    expect(row!.items).toHaveLength(3)
  })

  it('se trouve par la recherche existante (compétence) et filtre par techno', () => {
    const search = applyHistoryFilters(historyItemsOf(HISTORY), { ...EMPTY_HISTORY_FILTERS, query: 'kafka' }, NOW)
    expect(search.matchNeeds).toBe(1)
    const tech = applyHistoryFilters(historyItemsOf(HISTORY), { ...EMPTY_HISTORY_FILTERS, tech: 'azure' }, NOW)
    expect(tech.rows[0]!.items).toHaveLength(1)
  })

  it('filtre par période', () => {
    const result = applyHistoryFilters(historyItemsOf(HISTORY), { ...EMPTY_HISTORY_FILTERS, period: '12to24m' }, NOW)
    expect(result.rows[0]!.items.map(item => item.signalLabel)).toEqual(['Un salarié Architecte cloud'])
  })
})
