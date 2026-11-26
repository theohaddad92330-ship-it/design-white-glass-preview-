import { classifyScoreFactor, dataConfidenceFor, groupScoreFactors, SCORE_BLOCKS } from './discover-score'
import { SCORE_CRITERIA } from './discover-types'
import type { DiscoverCandidate, DiscoverScoreFactor } from './discover-types'

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
    score: 50,
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

/* ------------------------------------------------------------------ */
/*  Blocs de score — les plafonds du barème backend                    */
/* ------------------------------------------------------------------ */

describe('SCORE_BLOCKS', () => {
  it('mirrors the backend scale exactly — the eight blocks, in order', () => {
    expect(SCORE_BLOCKS.map(b => [b.key, b.max])).toEqual([
      ['activity', 10],
      ['geography', 7],
      ['headcount', 5],
      ['age', 3],
      ['it_surface', 20],
      ['signals', 20],
      ['accessibility', 20],
      ['evidence', 15],
    ])
  })

  it('sums to 100 — the same total the score is expressed on', () => {
    expect(SCORE_BLOCKS.reduce((n, b) => n + b.max, 0)).toBe(100)
  })

  it('covers exactly the criteria the backend can declare unmeasured', () => {
    // Deux listes des mêmes blocs cohabitaient : `SCORE_CRITERIA` (huit, juste)
    // et `SCORE_BLOCKS` (cinq, périmé). Elles ne se comparaient nulle part.
    expect([...SCORE_BLOCKS.map(b => b.key)].sort()).toEqual([...SCORE_CRITERIA].sort())
  })
})

describe('classifyScoreFactor — la clé transportée fait foi', () => {
  it('trusts the block carried by the factor over its label', () => {
    // Libellé qui « sent » l'activité, bloc qui dit l'accessibilité : c'est le
    // bloc qui gagne. Sans cette règle, un facteur d'accessibilité nommé
    // « secteur verrouillé » serait rangé dans « activité ».
    expect(classifyScoreFactor({ label: 'secteur public verrouillé', points: 2, block: 'accessibility' })).toBe(
      'accessibility',
    )
  })

  it('classes the three blocks the keyword fallback never could', () => {
    expect(classifyScoreFactor({ label: 'peu importe', points: 3, block: 'it_surface' })).toBe('it_surface')
    expect(classifyScoreFactor({ label: 'peu importe', points: 3, block: 'accessibility' })).toBe('accessibility')
    expect(classifyScoreFactor({ label: 'peu importe', points: 3, block: 'evidence' })).toBe('evidence')
  })

  it('falls back to the label when a snapshot predates the carried key', () => {
    expect(classifyScoreFactor({ label: 'NAF 62.02 exact', points: 10 })).toBe('activity')
  })

  it('ignores a block value the scale does not know', () => {
    // Un bloc inconnu ne doit pas traverser : il finirait en clé i18n brute.
    expect(classifyScoreFactor({ label: 'Bonus mystère', points: 1, block: 'chimere' as never })).toBe('other')
  })
})

describe('classifyScoreFactor', () => {
  it.each([
    ['NAF 62.02 exact', 'activity'],
    ['Secteur cible', 'activity'],
    ['Activité principale conforme', 'activity'],
    ['Siège dans la zone cible', 'geography'],
    ['Département 69', 'geography'],
    ['Ville de Lyon', 'geography'],
    ['Effectif dans la cible', 'headcount'],
    ['250 salariés', 'headcount'],
    ['Taille compatible', 'headcount'],
    ['AO IT publié récemment', 'signals'],
    ["Appel d'offres ouvert", 'signals'],
    ['Marché attribué', 'signals'],
    ['Recrutement data actif', 'signals'],
    ['Ancienneté > 10 ans', 'age'],
    ['Créée en 1998', 'age'],
  ])('classifies %s as %s', (label, expected) => {
    expect(classifyScoreFactor({ label, points: 1 })).toBe(expected)
  })

  it('ignores accents and case', () => {
    expect(classifyScoreFactor({ label: 'ANCIENNETÉ forte', points: 1 })).toBe('age')
  })

  it('falls back to "other" rather than mis-filing an unrecognized factor', () => {
    expect(classifyScoreFactor({ label: 'Bonus mystère', points: 1 })).toBe('other')
  })
})

/* ------------------------------------------------------------------ */
/*  Regroupement                                                       */
/* ------------------------------------------------------------------ */

// Points du barème RÉEL (activité 10, géo 7, effectif 5, ancienneté 3,
// signaux 20). Les anciens fixtures portaient 25 points d'activité sur un
// plafond de 10 : ils décrivaient un barème que le backend n'applique plus.
const FACTORS: DiscoverScoreFactor[] = [
  { label: 'NAF 62.02 exact', points: 9, evidence: '62.02A', block: 'activity' },
  { label: 'Siège dans la zone cible', points: 7, block: 'geography' },
  { label: 'Effectif dans la cible', points: 5, block: 'headcount' },
  { label: 'AO IT publié', points: 12, block: 'signals' },
  { label: 'Ancienneté > 10 ans', points: 3, block: 'age' },
]

describe('groupScoreFactors', () => {
  it('places each factor in its block, in scale order', () => {
    const groups = groupScoreFactors(FACTORS)
    // L'ordre est celui du barème, où l'ancienneté précède les signaux.
    expect(groups.map(g => g.key)).toEqual(['activity', 'geography', 'headcount', 'age', 'signals'])
  })

  it('totals the points per block and carries the block maximum', () => {
    const activity = groupScoreFactors(FACTORS).find(g => g.key === 'activity')
    expect(activity?.points).toBe(9)
    expect(activity?.max).toBe(10)
  })

  it('omits blocks that scored nothing rather than showing empty rows', () => {
    const groups = groupScoreFactors([{ label: 'NAF 62.02 exact', points: 9, block: 'activity' }])
    expect(groups.map(g => g.key)).toEqual(['activity'])
  })

  it('groups unrecognized factors into a maxless "other" block, listed last', () => {
    const groups = groupScoreFactors([...FACTORS, { label: 'Bonus mystère', points: 3 }])
    const last = groups[groups.length - 1]
    expect(last?.key).toBe('other')
    expect(last?.max).toBeNull()
  })

  it('keeps the underlying factors so the evidence stays visible', () => {
    const activity = groupScoreFactors(FACTORS).find(g => g.key === 'activity')
    expect(activity?.factors[0]?.evidence).toBe('62.02A')
  })

  it('sums negative contributions correctly', () => {
    const groups = groupScoreFactors([
      { label: 'NAF exact', points: 25 },
      { label: 'Secteur hors cible', points: -10 },
    ])
    expect(groups[0]?.points).toBe(15)
  })

  it('returns nothing for an empty factor list', () => {
    expect(groupScoreFactors([])).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  Confiance dans la donnée                                           */
/*                                                                     */
/*  Un 90/100 bâti sur un registre maigre n'est pas un 90/100 adossé à */
/*  trois signaux datés. Le score dit « à quel point ça matche », la    */
/*  confiance dit « à quel point on en sait quelque chose ».           */
/* ------------------------------------------------------------------ */

describe('dataConfidenceFor', () => {
  const rich = candidate({
    nafCode: '62.02A',
    sector: 'Conseil',
    city: 'Lyon',
    department: '69',
    headcountRange: '250-999',
    creationDate: '1998-04-12',
    signals: [
      { type: 'tender', label: 'AO', date: '2026-07-07' },
      { type: 'hiring', label: 'recrute', date: '2026-06-01' },
    ],
    scoreFactors: [{ label: 'NAF 62.02 exact', points: 25, evidence: '62.02A' }],
  })

  it('rates a fully-documented candidate with dated signals as high', () => {
    expect(dataConfidenceFor(rich).level).toBe('high')
  })

  it('rates a bare registry hit with no signal as low', () => {
    expect(dataConfidenceFor(candidate()).level).toBe('low')
  })

  it('rates a well-filled registry hit with no signal as medium, not high', () => {
    const registryOnly = candidate({
      nafCode: '62.02A',
      sector: 'Conseil',
      city: 'Lyon',
      department: '69',
      headcountRange: '250-999',
      creationDate: '1998-04-12',
      scoreFactors: [{ label: 'NAF exact', points: 25, evidence: '62.02A' }],
    })
    expect(dataConfidenceFor(registryOnly).level).toBe('medium')
  })

  it('reports the counts that justify the level — auditable like the score', () => {
    const confidence = dataConfidenceFor(rich)
    expect(confidence.datedSignals).toBe(2)
    expect(confidence.registryFields).toBe(6)
    expect(confidence.factorsWithEvidence).toBe(1)
  })

  it('does not count a factor without evidence', () => {
    const c = candidate({ scoreFactors: [{ label: 'NAF exact', points: 25 }] })
    expect(dataConfidenceFor(c).factorsWithEvidence).toBe(0)
  })

  it('never rates a signal-less candidate as high, however complete the registry', () => {
    const noSignals = candidate({
      nafCode: '62.02A',
      sector: 'Conseil',
      city: 'Lyon',
      department: '69',
      headcountRange: '250-999',
      creationDate: '1998-04-12',
      scoreFactors: [
        { label: 'NAF exact', points: 25, evidence: 'x' },
        { label: 'Zone cible', points: 20, evidence: 'y' },
      ],
    })
    expect(dataConfidenceFor(noSignals).level).not.toBe('high')
  })
})

/* Un bloc MESURÉ qui ne rapporte aucun point disparaissait de la rubrique : la
 * carte affichait « 32/60 » au-dessus d'une liste de blocs dont les plafonds
 * totalisaient 50, sans que rien n'explique les 10 manquants. « Évalué, aucun
 * point » (le secteur ne correspond pas) et « non évalué » (on n'a pas pu
 * regarder) sont deux affirmations différentes — c'est la règle du module, et
 * l'affichage la perdait. */
describe('groupScoreFactors — un bloc mesuré à zéro', () => {
  it('keeps a measured block that scored nothing, so the maxima add up to the badge', () => {
    const groups = groupScoreFactors(
      [{ label: 'Effectif dans la tranche', points: 5, block: 'headcount' }],
      ['headcount', 'activity'],
    )
    expect(groups.map(g => g.key)).toEqual(['activity', 'headcount'])
    const activity = groups.find(g => g.key === 'activity')
    expect(activity).toMatchObject({ points: 0, max: 10, factors: [] })
  })

  it('never invents a block that was not measured', () => {
    const groups = groupScoreFactors([{ label: 'x', points: 5, block: 'headcount' }], ['headcount'])
    expect(groups.map(g => g.key)).toEqual(['headcount'])
  })

  it('behaves exactly as before when no measured list is given', () => {
    const groups = groupScoreFactors([{ label: 'x', points: 5, block: 'headcount' }])
    expect(groups.map(g => g.key)).toEqual(['headcount'])
  })
})
