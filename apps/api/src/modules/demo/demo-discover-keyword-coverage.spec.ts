import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4045.1 (lot DISCOVER-MOTCLE, 12/10) — parité démo (craft rule n°9) du tri par mot-clé :
 * la salle ORDONNE les signaux d'un compte selon le mot-clé de la recherche, comme le vrai
 * chemin (`_rank_signals_by_keywords`, `discover.py`), sans retirer aucun compte ni signal.
 */
type RawCandidate = {
  name: string
  signals: Array<{ label: string; keywordMatch?: boolean }>
}

const run = (query: Record<string, unknown>) =>
  (demoDiscoverResponse(query) as { candidates: RawCandidate[] }).candidates

describe('#4045.1 — le mot-clé trie les signaux de la démo', () => {
  it('« cybersécurité » met le recrutement cyber en tête et pose keywordMatch', () => {
    const withKeyword = run({ keywords: ['cybersécurité'] }).find(c => c.signals.some(s => s.keywordMatch))
    expect(withKeyword).toBeDefined()
    expect(withKeyword?.signals[0]?.keywordMatch).toBe(true)
    expect(withKeyword?.signals.length).toBeGreaterThan(1)
  })

  it('sait dire NON : sans mot-clé, aucun drapeau et l’ordre scripté est intact', () => {
    expect(run({}).some(c => c.signals.some(s => s.keywordMatch))).toBe(false)
  })

  it('ne retire aucun compte', () => {
    expect(run({ keywords: ['cybersécurité'] }).map(c => c.name)).toEqual(run({}).map(c => c.name))
  })
})
