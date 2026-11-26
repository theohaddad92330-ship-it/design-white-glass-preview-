import { describe, expect, it } from 'vitest'
import type { AccountSignalItem, WatchlistRule } from '@bellum/contracts'
import { buildWatchlistItems, matchWatchlistRules } from '../model/watchlist'

const rule = (over: Partial<WatchlistRule>): WatchlistRule => ({
  id: 'r1',
  kind: 'need',
  value: 'cybersécurité',
  created_at: '2026-07-23T10:00:00.000Z',
  ...over,
})

const signal = (over: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 'account-1-signal-0',
  account_id: '11111111-1111-4111-8111-111111111111',
  account_created_at: '2026-07-01T08:00:00.000Z',
  account_score: 8,
  company_name: 'Groupe SNCF',
  date: '2026-07-05T09:00:00.000Z',
  label: 'Nouvelle offre Cybersécurité managée',
  sector: 'Transport',
  source: 'Communiqué',
  type: 'Projet',
  ...over,
})

function itemFrom(over: Partial<AccountSignalItem>) {
  const [item] = buildWatchlistItems([signal(over)])
  return item!
}

describe('matchWatchlistRules', () => {
  it('tags a signal that matches a rule (accent/case-insensitive, across fields)', () => {
    const item = itemFrom({})
    const matched = matchWatchlistRules(item, [
      rule({ value: 'Cybersecurite' }),
      rule({ id: 'r2', value: 'kubernetes' }),
    ])
    expect(matched.map(r => r.id)).toEqual(['r1'])
  })

  it('matches a rule on the account name', () => {
    const item = itemFrom({})
    const matched = matchWatchlistRules(item, [rule({ id: 'acc', kind: 'account', value: 'SNCF' })])
    expect(matched.map(r => r.id)).toEqual(['acc'])
  })

  it('returns nothing when no rule matches (never an invented tag)', () => {
    const item = itemFrom({})
    expect(matchWatchlistRules(item, [rule({ value: 'SAP' })])).toEqual([])
  })

  it('returns nothing with no rules at all', () => {
    expect(matchWatchlistRules(itemFrom({}), [])).toEqual([])
  })
})
