import { describe, expect, it } from 'vitest'
import {
  excludedAxisLabels,
  measuredAxisCount,
  normalizeScoreFactors,
  proofTypeMeta,
  sumAxisFactors,
  sumAxisMax,
  totalAxisCount,
  totalFactor,
} from './scoreFactors'

// The EDF factor list as production returned it: 5 axes on /5 whose sum IS the
// /25 total that the verdict factor restates.
const EDF_FACTORS = [
  { label: 'Budget / investissement visible', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
  { label: 'Accessibilité commerciale', proof_type: 'contact', weight: 2, kind: 'axis', max: 5 },
  { label: 'Urgence business', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
  { label: 'Maturité outsourcing / ESN', proof_type: 'source', weight: 3, kind: 'axis', max: 5 },
  { label: "Fit avec l'offre ESN", proof_type: 'profile', weight: 3, kind: 'axis', max: 5 },
  { label: 'Verdict PRUDENT — règle /25', proof_type: 'business_rule', weight: 16, kind: 'total', max: 25 },
]

describe('normalizeScoreFactors', () => {
  it('maps raw snake_case factors into the display shape', () => {
    const factors = normalizeScoreFactors([
      { label: 'Budget / investissement visible', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
      { label: 'Accessibilité commerciale', proof_type: 'contact', weight: 5, kind: 'axis', max: 5 },
    ])
    expect(factors).toEqual([
      { label: 'Budget / investissement visible', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
      { label: 'Accessibilité commerciale', proofType: 'contact', weight: 5, kind: 'axis', max: 5 },
    ])
  })

  it('tolerates camelCase proofType and a missing weight', () => {
    expect(normalizeScoreFactors([{ label: 'Fit offre', proofType: 'profile' }])).toEqual([
      { label: 'Fit offre', proofType: 'profile', weight: null, kind: 'axis', max: null },
    ])
  })

  it('reads a legacy factor (no kind) as an additive axis', () => {
    expect(normalizeScoreFactors([{ label: 'Budget', proof_type: 'signal', weight: 4 }])[0]?.kind).toBe('axis')
  })

  it('drops factors without a label and never throws on junk', () => {
    expect(normalizeScoreFactors([{ proof_type: 'signal' }, null, 'x', { label: '' }])).toEqual([])
    expect(normalizeScoreFactors(undefined)).toEqual([])
    expect(normalizeScoreFactors('nope')).toEqual([])
  })
})

describe('score factor arithmetic', () => {
  it('makes the axes add up to the total the verdict states', () => {
    // Regression: the verdict factor was rendered "+16" like an axis, so adding
    // the column gave 4+2+4+3+3+16 = 32 for a 16/25 score.
    const factors = normalizeScoreFactors(EDF_FACTORS)
    expect(sumAxisFactors(factors)).toBe(16)
    expect(totalFactor(factors)?.weight).toBe(16)
    expect(totalFactor(factors)?.max).toBe(25)
  })

  it('excludes the total from the additive sum', () => {
    const factors = normalizeScoreFactors(EDF_FACTORS)
    expect(factors.filter(f => f.kind === 'axis')).toHaveLength(5)
    expect(sumAxisFactors(factors)).not.toBe(32)
  })

  it('returns no total when the run produced none', () => {
    expect(totalFactor(normalizeScoreFactors([{ label: 'Budget', weight: 4 }]))).toBeNull()
  })

  // #2091 — un axe non évaluable (`weight: null`) SORT du dénominateur, sinon
  // le score mesure la complétude de nos données, pas le compte (doctrine
  // ScoreWithAxes). `sumAxisFactors` doit exclure l'axe, `sumAxisMax` doit
  // réduire le dénominateur d'autant, et l'axe doit être NOMMÉ.
  it('exclut un axe non mesuré de la somme ET de son dénominateur (GA-18/19)', () => {
    const factors = normalizeScoreFactors([
      { label: 'Budget / investissement visible', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
      { label: 'Signal récent — pas assez de données', proof_type: 'signal', weight: null, kind: 'axis', max: 5 },
      { label: 'Urgence business', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
    ])
    expect(sumAxisFactors(factors)).toBe(8)
    // Avant : max fixe (souvent 25 ou 5×nombre d'axes), qui compterait les 5
    // points de l'axe non évalué comme perdus plutôt que comme non mesurés.
    expect(sumAxisMax(factors)).toBe(10)
    expect(excludedAxisLabels(factors)).toEqual(['Signal récent — pas assez de données'])
  })

  it('sumAxisMax rend null quand un axe compté n’a pas de max connu — jamais un dénominateur inventé', () => {
    const factors = normalizeScoreFactors([
      { label: 'Budget', proof_type: 'signal', weight: 4, kind: 'axis' },
      { label: 'Urgence', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
    ])
    expect(sumAxisMax(factors)).toBeNull()
  })

  it('excludedAxisLabels rend un tableau vide quand tout a été mesuré', () => {
    const factors = normalizeScoreFactors(EDF_FACTORS)
    expect(excludedAxisLabels(factors)).toEqual([])
  })

  // #4016.L9.a (recette prod 14/10, Sanofi) — l'onglet Score affichait « 15/25 »
  // sans jamais dire sur combien d'axes, alors que la Vue d'ensemble le dit déjà
  // (`dossierRead.axesEvaluated`, DossierReadBlocks.tsx). Même doctrine (GA-26 —
  // un score n'est jamais nu), même compte à tenir ici.
  it('totalAxisCount compte TOUS les axes (mesurés ET exclus), measuredAxisCount seulement les mesurés', () => {
    const factors = normalizeScoreFactors([
      { label: 'Budget', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
      { label: 'Signal récent — pas assez de données', proof_type: 'signal', weight: null, kind: 'axis', max: 5 },
      { label: 'Urgence business', proof_type: 'signal', weight: 4, kind: 'axis', max: 5 },
      { label: 'Verdict — règle /25', proof_type: 'business_rule', weight: 8, kind: 'total', max: 25 },
    ])
    expect(totalAxisCount(factors)).toBe(3)
    expect(measuredAxisCount(factors)).toBe(2)
  })

  it('totalAxisCount et measuredAxisCount rendent 0 sans axe', () => {
    expect(totalAxisCount([])).toBe(0)
    expect(measuredAxisCount([])).toBe(0)
  })
})

describe('proofTypeMeta (proof-type badge)', () => {
  it('gives a distinct label per known proof type', () => {
    expect(proofTypeMeta('signal').label).toBe('Signal')
    expect(proofTypeMeta('source').label).toBe('Source')
    expect(proofTypeMeta('contact').label).toBe('Contact')
    expect(proofTypeMeta('profile').label).toBe('Profil')
    expect(proofTypeMeta('business_rule').label).toBe('Règle métier')
  })

  it('falls back to a neutral badge for an unknown proof type', () => {
    const meta = proofTypeMeta('future_kind')
    expect(meta.label).toBe('future_kind')
    expect(meta.className).toContain('bellum-border')
  })

  it("ne colore PAS le type de preuve — c'est une catégorie, pas un état (§26.1)", () => {
    // Les cinq types portaient cinq teintes ; il fallait une légende pour les
    // lire, et l'ambre dépensé sur « Signal » ne disait plus « ça demande une
    // décision ». Le MOT porte le type ; le badge reste neutre.
    const classNames = ['signal', 'source', 'contact', 'profile', 'business_rule'].map(
      type => proofTypeMeta(type).className,
    )
    expect(new Set(classNames).size).toBe(1)
    expect(classNames[0]).toBe(proofTypeMeta('future_kind').className)
  })
})
