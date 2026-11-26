import { describe, expect, it } from 'vitest'
import { PARTNER_STAGES, partnerRelationScore, type PartnerScoreInput } from './partner-pipeline.js'

const NEW_RELATION: PartnerScoreInput = {
  needsReceived12m: null,
  missionsCompleted: null,
  missionsTotal: null,
  averageMarginPct: null,
  accountsOpened: null,
  needsGiven12m: null,
  placementsTotal: 0,
}

const MATURE: PartnerScoreInput = {
  needsReceived12m: 14,
  missionsCompleted: 9,
  missionsTotal: 10,
  averageMarginPct: 18,
  accountsOpened: 4,
  needsGiven12m: 3,
  placementsTotal: 9,
}

describe('le cycle partenaire', () => {
  it('porte huit étapes, dont « flux actif » qui est un régime et non une fin', () => {
    expect(PARTNER_STAGES).toHaveLength(8)
    expect(PARTNER_STAGES).toContain('flux_actif')
    expect(PARTNER_STAGES).toContain('dormant')
  })
})

describe('le score partenaire (tome 4 §23)', () => {
  it('n’existe pas sur une relation neuve, et le DIT', () => {
    // « Reviens après trois placements » : un zéro se lirait « mauvais
    // partenaire » alors qu'on n'a simplement rien vécu ensemble.
    const result = partnerRelationScore(NEW_RELATION)
    expect(result.score).toBeNull()
    expect(result.reason).toContain('assez d’historique'.replace('’', "'"))
  })

  it('classe une relation mûre et recommande de la renforcer', () => {
    const result = partnerRelationScore(MATURE)
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.recommendation).toBe('renforcer')
  })

  it('sort du dénominateur un axe qu’on ne sait pas mesurer', () => {
    const result = partnerRelationScore({ ...MATURE, averageMarginPct: null })
    expect(result.unmeasured).toEqual(['marge'])
    expect(result.scoreMax).toBe(100 - 20)
  })

  it('recommande de réduire quand la fiabilité s’effondre', () => {
    const result = partnerRelationScore({ ...MATURE, missionsCompleted: 2, missionsTotal: 10 })
    expect(result.recommendation).toBe('reduire')
  })

  it('propose de viser le rang 1 quand les quatre conditions sont réunies', () => {
    const result = partnerRelationScore({
      ...MATURE,
      averageMarginPct: 8,
      accountsOpened: 5,
      hasProof: true,
      hasDirectDecisionMaker: true,
    })
    expect(result.recommendation).toBe('viser_rang_1')
    expect(result.rank1Blocked).toBeNull()
  })

  it('BLOQUE le rang 1 sur une clause de non-sollicitation', () => {
    const result = partnerRelationScore({
      ...MATURE,
      averageMarginPct: 8,
      accountsOpened: 5,
      hasProof: true,
      hasDirectDecisionMaker: true,
      nonSolicitation: true,
    })
    expect(result.recommendation).not.toBe('viser_rang_1')
    expect(result.rank1Blocked).toContain('non-sollicitation')
  })

  it('BLOQUE le rang 1 quand le partenaire est aussi notre client', () => {
    // Court-circuiter celui qui nous a ouvert la porte se fait une fois, et
    // coûte le canal entier.
    const result = partnerRelationScore({
      ...MATURE,
      averageMarginPct: 8,
      accountsOpened: 5,
      hasProof: true,
      hasDirectDecisionMaker: true,
      isAlsoClient: true,
    })
    expect(result.rank1Blocked).toContain('aussi notre client')
  })

  it('ne vise pas le rang 1 sans preuve ni décideur, même avec un bel accès', () => {
    const result = partnerRelationScore({ ...MATURE, averageMarginPct: 8, accountsOpened: 5 })
    expect(result.recommendation).not.toBe('viser_rang_1')
  })

  /**
   * Le repli `?? 100` (marge) / `?? 0` (accès) MENTAIT dans les deux sens :
   * il empêchait la garde de se déclencher sur une valeur inconnue, mais
   * n'importe qui aurait pu le remplacer un jour par une valeur qui, elle,
   * la ferait passer (`?? 0` sur la marge, `?? 25` sur l'accès) — une marge
   * ou un accès INCONNUS se seraient alors lus comme excellents. Ces deux
   * tests ne bougent pas de résultat par rapport au repli numérique — ils
   * gèlent le résultat sous sa forme EXPLICITE (`!== null && …`), qui ne
   * peut plus dépendre du choix d'une valeur de repli.
   */
  it('« inconnue » ne vise jamais le rang 1 — la marge, même avec tout le reste réuni', () => {
    const result = partnerRelationScore({
      ...MATURE,
      averageMarginPct: null,
      accountsOpened: 5,
      hasProof: true,
      hasDirectDecisionMaker: true,
    })
    expect(result.recommendation).not.toBe('viser_rang_1')
  })

  it('« inconnu » ne vise jamais le rang 1 — l’accès, même avec tout le reste réuni', () => {
    const result = partnerRelationScore({
      ...MATURE,
      averageMarginPct: 8,
      accountsOpened: null,
      hasProof: true,
      hasDirectDecisionMaker: true,
    })
    expect(result.recommendation).not.toBe('viser_rang_1')
  })
})
