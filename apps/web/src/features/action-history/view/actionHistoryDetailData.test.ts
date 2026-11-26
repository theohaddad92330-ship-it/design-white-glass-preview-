import type { TFunction } from 'i18next'
import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { accountAnalysisStatusLabel, buildAccountSummaryRows, formatRunDuration } from './actionHistoryDetailData'

// Fake `t`: echoes the key, interpolates the duration templates, and honours
// `defaultValue`. Enough to assert the shaping logic without real i18n.
const t = ((key: string, opts?: Record<string, unknown>) => {
  if (key === 'detail.durationMinSec') return `${opts?.min} min ${opts?.sec} s`
  if (key === 'detail.durationSec') return `${opts?.sec} s`
  return key
}) as unknown as TFunction<'actions'>

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    company_name: 'Société Générale',
    sector: 'Banque',
    employees: null,
    revenue: null,
    headquarters: null,
    website: null,
    subsidiaries: [],
    it_challenges: [],
    recent_signals: [],
    priority_score: 8,
    priority_justification: null,
    raw_analysis: null,
    status: 'completed',
    error_message: null,
    user_context: null,
    api_cost_euros: null,
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    ...overrides,
  } as unknown as Account
}

describe('buildAccountSummaryRows', () => {
  it('returns no rows when there is no account', () => {
    expect(buildAccountSummaryRows(t, null, 0)).toEqual([])
  })

  it('always leads with the analysis status and ends with the refresh date', () => {
    const rows = buildAccountSummaryRows(t, makeAccount({ priority_score: null, sector: null }), 0)
    expect(rows[0]?.label).toBe('detail.analysisStatus')
    expect(rows[0]?.value).toBe('detail.accountStatus.completed')
    expect(rows.at(-1)?.label).toBe('detail.refreshedAt')
  })

  it('adds the verdict IN WORDS (never a score in points), the sector, the contacts count and the dominant signal when present', () => {
    const account = makeAccount({
      priority_score: 8,
      sector: 'Banque',
      raw_analysis: { recent_signals: [{ signal: '   ' }, { signal: 'Levée de fonds 50M€' }] },
    })
    const rows = buildAccountSummaryRows(t, account, 3)
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]))

    expect(byLabel['detail.verdict']).toBe('GO')
    // Refonte Théo (Louis 23/10) : aucun score en points — le /10 ne s'affiche plus.
    expect(rows.some(r => r.value.includes('/10'))).toBe(false)
    expect(byLabel['detail.sector']).toBe('Banque')
    expect(byLabel['detail.contactsCount']).toBe('3')
    // Skips the blank first signal, keeps the first real one.
    expect(byLabel['detail.dominantSignal']).toBe('Levée de fonds 50M€')
  })

  it('drops rows whose fact is missing (no invented data)', () => {
    const rows = buildAccountSummaryRows(t, makeAccount({ priority_score: null, sector: null, raw_analysis: null }), 0)
    const labels = rows.map(r => r.label)
    expect(labels).not.toContain('detail.verdict')
    expect(labels).not.toContain('detail.sector')
    expect(labels).not.toContain('detail.contactsCount')
    expect(labels).not.toContain('detail.dominantSignal')
  })
})

describe('accountAnalysisStatusLabel', () => {
  it('builds the i18n key for a known status', () => {
    expect(accountAnalysisStatusLabel(t, 'analyzing')).toBe('detail.accountStatus.analyzing')
  })

  it('falls back to the raw value for an unknown status', () => {
    // With defaultValue honoured, an unmapped status shows itself rather than a key.
    const tWithDefault = ((key: string, opts?: Record<string, unknown>) =>
      opts && 'defaultValue' in opts ? String(opts.defaultValue) : key) as unknown as TFunction<'actions'>
    expect(accountAnalysisStatusLabel(tWithDefault, 'weird_state')).toBe('weird_state')
  })
})

describe('formatRunDuration', () => {
  it('returns null when the run never completed', () => {
    expect(formatRunDuration(t, '2026-07-01T10:00:00.000Z', null)).toBeNull()
  })

  it('returns null for a non-positive or invalid delta', () => {
    expect(formatRunDuration(t, '2026-07-01T10:00:10.000Z', '2026-07-01T10:00:05.000Z')).toBeNull()
    expect(formatRunDuration(t, 'not-a-date', '2026-07-01T10:00:05.000Z')).toBeNull()
  })

  it('formats minutes and seconds past a minute', () => {
    expect(formatRunDuration(t, '2026-07-01T10:00:00.000Z', '2026-07-01T10:03:12.000Z')).toBe('3 min 12 s')
  })

  it('formats seconds only under a minute', () => {
    expect(formatRunDuration(t, '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:45.000Z')).toBe('45 s')
  })
})
