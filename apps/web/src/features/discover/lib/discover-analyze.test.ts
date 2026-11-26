import { buildAnalyzeSearch, DISCOVER_SUGGESTION_PREFIX } from './discover-analyze'
import type { DiscoverCandidate } from './discover-types'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME Industries',
    siren: '552100554',
    nafCode: '62.02A',
    sector: 'Conseil en systèmes informatiques',
    city: 'Lyon',
    department: '69',
    headcountRange: '250-999',
    creationDate: '1998-04-12',
    score: 72,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

describe('buildAnalyzeSearch', () => {
  it('carries the company name (the v1 behaviour, preserved)', () => {
    expect(buildAnalyzeSearch(candidate()).company).toBe('ACME Industries')
  })

  /* --- Le fix : le contexte ne doit plus être jeté --- */

  it('carries a suggestionId derived from the SIREN so the origin is traceable', () => {
    expect(buildAnalyzeSearch(candidate()).suggestionId).toBe(`${DISCOVER_SUGGESTION_PREFIX}552100554`)
  })

  it('carries the LLM angle as the suggestionReason when there is one', () => {
    const search = buildAnalyzeSearch(candidate({ angle: 'Modernisation du SI RH après le rachat de Foo' }))
    expect(search.suggestionReason).toBe('Modernisation du SI RH après le rachat de Foo')
  })

  it('never carries the field key in front of the angle (#4655)', () => {
    const search = buildAnalyzeSearch(candidate({ angle: 'prioritizationReason: Commencer par la forme juridique' }))
    expect(search.suggestionReason).toBe('Commencer par la forme juridique')
    expect(search.prioritizationReason).toBe('Commencer par la forme juridique')
  })

  it('falls back to the most recent signal when there is no angle', () => {
    const search = buildAnalyzeSearch(
      candidate({
        angle: null,
        signals: [
          { type: 'hiring', label: '5 postes data ouverts', date: '2026-05-02' },
          { type: 'tender', label: 'AO IT publié', date: '2026-07-07' },
        ],
      }),
    )
    expect(search.suggestionReason).toBe('AO IT publié')
  })

  it('falls back to the top score factors when there is neither angle nor signal', () => {
    const search = buildAnalyzeSearch(
      candidate({
        angle: null,
        signals: [],
        scoreFactors: [
          { label: 'NAF 62.02 exact', points: 25 },
          { label: 'siège dans la zone cible', points: 15 },
          { label: 'effectif dans la cible', points: 10 },
          { label: 'ancienneté > 10 ans', points: 5 },
        ],
      }),
    )
    expect(search.suggestionReason).toBe('NAF 62.02 exact · siège dans la zone cible · effectif dans la cible')
  })

  it('ignores negative factors in the fallback reason', () => {
    const search = buildAnalyzeSearch(
      candidate({
        angle: null,
        signals: [],
        scoreFactors: [
          { label: 'NAF 62.02 exact', points: 25 },
          { label: 'hors zone', points: -10 },
        ],
      }),
    )
    expect(search.suggestionReason).toBe('NAF 62.02 exact')
  })

  it('omits suggestionReason entirely when nothing can justify the suggestion', () => {
    const search = buildAnalyzeSearch(candidate({ angle: null, signals: [], scoreFactors: [] }))
    expect(search.suggestionReason).toBeUndefined()
  })

  it('never sends an empty-string reason (the route would keep a useless param)', () => {
    const search = buildAnalyzeSearch(candidate({ angle: '   ' }))
    expect(search.suggestionReason).toBeUndefined()
  })

  it('caps the reason so the URL stays sane', () => {
    const search = buildAnalyzeSearch(candidate({ angle: 'x'.repeat(400) }))
    expect(search.suggestionReason?.length).toBeLessThanOrEqual(240)
    expect(search.suggestionReason?.endsWith('…')).toBe(true)
  })

  it('produces only keys the /search route schema accepts', () => {
    const search = buildAnalyzeSearch(candidate({ angle: 'un angle' }))
    expect(Object.keys(search).sort()).toEqual([
      'company',
      'preset',
      'prioritizationReason',
      'suggestionId',
      'suggestionReason',
    ])
  })

  /* --- #3910 — la raison de priorisation vient de l'outil, pas d'une saisie --- */

  it('prefills the "strategic" preset\'s prioritizationReason with the SAME computed reason (#3910)', () => {
    const search = buildAnalyzeSearch(candidate({ angle: 'Modernisation du SI RH après le rachat de Foo' }))
    expect(search.preset).toBe('strategic')
    expect(search.prioritizationReason).toBe(search.suggestionReason)
  })

  it('poses no preset when nothing justifies a reason — the composer keeps its own default (#3910)', () => {
    const search = buildAnalyzeSearch(candidate({ angle: null, signals: [], scoreFactors: [] }))
    expect(search.preset).toBeUndefined()
    expect(search.prioritizationReason).toBeUndefined()
  })

  // #3819 (lot RBB) — les critères de Découvrir voyagent avec la raison.
  it('carries the Discover criteria when some were posed and matched (#3819)', () => {
    const search = buildAnalyzeSearch(candidate(), { zone: 'Lille', signals: ['hiring'] })
    expect(search.suggestionCriteria).toEqual({ zone: 'Lille', signals: ['hiring'] })
  })

  it('carries no criteria key when none was posed (#3819)', () => {
    expect(buildAnalyzeSearch(candidate())).not.toHaveProperty('suggestionCriteria')
    expect(buildAnalyzeSearch(candidate(), {})).not.toHaveProperty('suggestionCriteria')
  })
})
