import { describe, expect, it } from 'vitest'
import {
  createWatchlistRuleSchema,
  normalizeWatchlistText,
  watchlistRuleKinds,
  watchlistRuleMatches,
  watchlistRuleSchema,
  WATCHLIST_RULE_VALUE_MAX,
} from './watchlist-rules.js'

describe('watchlistRuleKinds', () => {
  it('exposes the five personalisation axes of §11 in order', () => {
    expect(watchlistRuleKinds).toEqual(['sector', 'techno', 'account', 'need', 'person'])
  })
})

describe('createWatchlistRuleSchema', () => {
  it('accepts a well-formed rule and trims the value', () => {
    const parsed = createWatchlistRuleSchema.parse({ kind: 'techno', value: '  ServiceNow  ' })
    expect(parsed).toEqual({ kind: 'techno', value: 'ServiceNow' })
  })

  it('rejects an empty / whitespace-only value (no rule that matches everything)', () => {
    expect(createWatchlistRuleSchema.safeParse({ kind: 'sector', value: '   ' }).success).toBe(false)
    expect(createWatchlistRuleSchema.safeParse({ kind: 'sector', value: '' }).success).toBe(false)
  })

  it('rejects an unknown kind', () => {
    expect(createWatchlistRuleSchema.safeParse({ kind: 'budget', value: 'x' }).success).toBe(false)
  })

  it('bounds the value length', () => {
    const tooLong = 'a'.repeat(WATCHLIST_RULE_VALUE_MAX + 1)
    expect(createWatchlistRuleSchema.safeParse({ kind: 'need', value: tooLong }).success).toBe(false)
  })
})

describe('watchlistRuleSchema', () => {
  it('validates an API rule row', () => {
    const ok = watchlistRuleSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'account',
      value: 'SNCF Connect',
      created_at: '2026-07-23T10:00:00.000Z',
    })
    expect(ok.success).toBe(true)
  })
})

describe('normalizeWatchlistText', () => {
  it('folds accents, case and whitespace', () => {
    expect(normalizeWatchlistText('  Cybersécurité   IoT ')).toBe('cybersecurite iot')
  })
})

describe('watchlistRuleMatches', () => {
  it('matches on a normalised substring across several haystacks', () => {
    expect(watchlistRuleMatches('cybersecurite', 'Banque', 'Nouvelle offre Cybersécurité managée')).toBe(true)
  })

  it('does not match when the needle is absent', () => {
    expect(watchlistRuleMatches('kubernetes', 'Recrutement DAF', 'Secteur assurance')).toBe(false)
  })

  it('never matches on an empty / whitespace rule value', () => {
    expect(watchlistRuleMatches('   ', 'anything at all')).toBe(false)
  })

  it('ignores null / undefined haystacks', () => {
    expect(watchlistRuleMatches('sncf', null, undefined, 'Groupe SNCF')).toBe(true)
  })
})
