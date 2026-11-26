import { describe, expect, it } from 'vitest'
import { buildBatchAnalyzeRequest } from './discover-batch-analyze'
import type { DiscoverCandidate } from './discover-types'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: 'Ouvre un bureau à Lyon',
    suggestedRoles: [],
    portfolioState: 'analyzed',
    accountId: null,
    sources: [],
    ...over,
  }
}

describe('buildBatchAnalyzeRequest (#2166.56)', () => {
  it('porte le nom, le siren et une raison tracée — jamais un chiffre de crédit', () => {
    const body = buildBatchAnalyzeRequest(candidate({ name: 'Banque Alpha', siren: '123456789' }))
    expect(body.company_name).toBe('Banque Alpha')
    expect(body.siren).toBe('123456789')
    expect(body.suggestion_id).toBe('discover:123456789')
    expect(body.suggestion_reason).toBe('Ouvre un bureau à Lyon')
  })

  it('sans raison exploitable, aucune clé inventée plutôt qu’une chaîne vide', () => {
    const body = buildBatchAnalyzeRequest(candidate({ angle: null, signals: [], scoreFactors: [] }))
    expect(body.suggestion_reason).toBeUndefined()
  })

  // #3819 (lot RBB) — une analyse de lot garde aussi les critères Découvrir.
  it('#3819 — porte les critères posés, et aucune clé sans critère', () => {
    expect(buildBatchAnalyzeRequest(candidate(), { sectors: ['insurance'] }).suggestion_criteria).toEqual({
      sectors: ['insurance'],
    })
    expect(buildBatchAnalyzeRequest(candidate())).not.toHaveProperty('suggestion_criteria')
  })
})
