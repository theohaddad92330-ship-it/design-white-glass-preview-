import { rankSimilar, scoreSimilarity, significantTerms } from './project-similarity'

/**
 * The comparison is what the rep sees ("ce besoin existe aussi chez X") — so the
 * rules that produce it are pinned here: what counts as a significant word, what
 * counts as a match, and what a NON-match looks like (an empty list, never a
 * best-effort guess).
 */
describe('significantTerms', () => {
  it('lowercases, strips accents and drops stopwords, short tokens and bare numbers', () => {
    expect(significantTerms('Refonte du système de données RH 2026')).toEqual(['refonte', 'rh'])
  })

  it('keeps short but meaningful technical tokens (ERP, SAP, C++)', () => {
    expect(significantTerms('Migration ERP SAP')).toEqual(['migration', 'erp', 'sap'])
    expect(significantTerms('Compétences C++')).toEqual(['competences', 'c++'])
  })

  it('deduplicates across the label and the offer, first occurrence wins', () => {
    expect(significantTerms('Migration Cloud', 'Cloud & migration')).toEqual(['migration', 'cloud'])
  })

  it('returns nothing for an empty or stopword-only text', () => {
    expect(significantTerms(null, '', 'le projet de la plateforme')).toEqual([])
  })
})

describe('scoreSimilarity', () => {
  const reference = { kind: 'pain', label: 'Migration ERP SAP S/4HANA', offer: 'TMA SAP' }

  it('scores an overlapping need and reports the shared words', () => {
    const verdict = scoreSimilarity(reference, {
      kind: 'pain',
      label: 'Refonte SAP et migration du socle',
      offer: null,
    })
    expect(verdict.sharedTerms).toEqual(['migration', 'sap'])
    expect(verdict.score).toBeGreaterThan(0)
  })

  it('gives 0 and no shared terms when nothing overlaps', () => {
    expect(
      scoreSimilarity(reference, { kind: 'pain', label: 'Recrutement de développeurs Java', offer: null }),
    ).toEqual({ score: 0, sharedTerms: [] })
  })

  it('does not match on a stopword alone', () => {
    expect(
      scoreSimilarity(
        { kind: 'program', label: 'Projet data', offer: null },
        {
          kind: 'program',
          label: 'Projet data',
          offer: null,
        },
      ).sharedTerms,
    ).toEqual([])
  })

  it('rewards the same nature of need over a cross-kind echo', () => {
    const candidate = { label: 'Migration ERP', offer: null }
    const sameKind = scoreSimilarity(reference, { ...candidate, kind: 'pain' })
    const otherKind = scoreSimilarity(reference, { ...candidate, kind: 'program' })
    expect(sameKind.score).toBeGreaterThan(otherKind.score)
  })

  it('never exceeds 1 even when everything matches', () => {
    expect(scoreSimilarity(reference, reference).score).toBeLessThanOrEqual(1)
  })
})

describe('rankSimilar', () => {
  const reference = { kind: 'pain', label: 'Migration ERP SAP', offer: null }
  const rows = [
    { id: 'a', kind: 'pain', label: 'Recrutement Java', offer: null },
    { id: 'b', kind: 'program', label: 'Migration ERP', offer: null },
    { id: 'c', kind: 'pain', label: 'Migration ERP SAP', offer: null },
  ]

  it('keeps only the needs sharing a word, best first', () => {
    const ranked = rankSimilar(reference, rows, 5)
    expect(ranked.map(row => row.id)).toEqual(['c', 'b'])
    expect(ranked[0].shared_terms).toEqual(['migration', 'erp', 'sap'])
  })

  it('caps the shortlist', () => {
    expect(rankSimilar(reference, rows, 1)).toHaveLength(1)
  })

  it('returns an empty list rather than a weak best guess', () => {
    expect(rankSimilar(reference, [rows[0]], 5)).toEqual([])
    expect(rankSimilar(reference, [], 5)).toEqual([])
  })
})
