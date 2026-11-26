import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/flexible-search.json'
import { SEARCH_LEXICON, explainFlexibleQuery, matchesFlexibleQuery, searchTokens } from './flexible-search.js'

// #4400.1 — le MÊME fichier est relu par pytest (`apps/ia/tests/test_flexible_search_4400.py`).
type Fixture = {
  lexicon: Record<string, string[]>
  cases: { query: string; text: string; match: boolean; why: string }[]
  explain: { query: string; expanded: string[] }[]
}
const { lexicon, cases, explain } = fixture as Fixture

describe('flexible-search — jeu de cas commun TS / Python', () => {
  it('le lexique du code EST celui du fichier partagé', () => {
    expect(SEARCH_LEXICON).toEqual(lexicon)
  })

  it.each(cases)('« $query » × « $text » ⇒ $match — $why', ({ query, text, match }) => {
    expect(matchesFlexibleQuery(query, text)).toBe(match)
  })

  it.each(explain)('explique « $query »', ({ query, expanded }) => {
    expect(explainFlexibleQuery(query).expanded).toEqual(expanded)
  })

  it('une garde qui sait dire NON : la fixture contient des refus, et le matcher les rend', () => {
    const refusals = cases.filter(c => !c.match)
    expect(refusals.length).toBeGreaterThanOrEqual(4)
    for (const c of refusals) expect(matchesFlexibleQuery(c.query, c.text)).toBe(false)
  })

  it('découpe sans accents ni casse ni pluriel', () => {
    expect(searchTokens('  Développeurs  JAVA ')).toEqual(['developpeur', 'java'])
  })
})
