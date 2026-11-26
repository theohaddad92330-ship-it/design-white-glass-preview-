import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_DEPTH_PRESETS,
  ANALYSIS_RUN_DEPTHS,
  analysisScopeSelectionSchema,
  CREDIT_WEIGHTS,
  DEFAULT_ANALYSIS_DEPTH,
  estimateAnalysisCredits,
  isScopeSelectionEmpty,
  medianDurationSeconds,
  SELECTABLE_ANALYSIS_RUN_DEPTHS,
} from '../index.js'

/**
 * #3944 (retour bêta Louis 08/10/2026) — DEUX paliers seulement au lancement.
 * `verified` sort du CHOIX (`SELECTABLE_ANALYSIS_RUN_DEPTHS`), pas du TYPE
 * (`ANALYSIS_RUN_DEPTHS`) : une analyse déjà lancée dans ce palier avant ce
 * lot reste une valeur valide, lisible (on archive, on ne supprime pas).
 */
describe('#3944 — deux paliers SÉLECTIONNABLES, trois paliers VALIDES', () => {
  it('le lancement ne propose que « quick » et « deep » — jamais « verified »', () => {
    expect(SELECTABLE_ANALYSIS_RUN_DEPTHS).toEqual(['quick', 'deep'])
  })

  it('« verified » reste un palier VALIDE du type et du schéma, pour un run déjà lancé avant ce lot', () => {
    expect(ANALYSIS_RUN_DEPTHS).toContain('verified')
    expect(analysisScopeSelectionSchema.safeParse({ depth: 'verified' }).success).toBe(true)
  })

  it('« Approfondie » (deep) coûte EXACTEMENT 10 crédits — pas le double de « vérifiée »', () => {
    expect(estimateAnalysisCredits('france', 0, 'deep')).toBe(10)
    expect(ANALYSIS_DEPTH_PRESETS.deep.costMultiplier).toBe(1.25)
  })

  // Louis 10/10 — « approfondi devient la norme à 10 crédits et le rapide en coûte 5 ».
  it('« Rapide » (quick) coûte 5 crédits — revient sur l’ancien tarif Rapide 4, délibérément (Louis 10/10)', () => {
    expect(estimateAnalysisCredits('france', 0, 'quick')).toBe(5)
    expect(estimateAnalysisCredits('groupe', 0, 'quick')).toBe(5)
  })

  it('Louis 10/10 — sans palier choisi, le prix est celui d’« Approfondie » (10), jamais l’ancien 8', () => {
    expect(DEFAULT_ANALYSIS_DEPTH).toBe('deep')
    expect(estimateAnalysisCredits('france', 0)).toBe(10)
    expect(estimateAnalysisCredits('france', 0, undefined)).toBe(10)
    expect(estimateAnalysisCredits('france', 0, null)).toBe(10)
  })
})

describe('profondeur d’analyse à trois paliers (#3288)', () => {
  it('« vérifiée » reste le prix d’avant (poids plein), lisible pour un run historique — mais n’est plus le défaut (Louis 10/10)', () => {
    expect(estimateAnalysisCredits('france', 0, 'verified')).toBe(CREDIT_WEIGHTS.account_analysis)
    expect(ANALYSIS_DEPTH_PRESETS.verified.pages).toBe(12)
  })

  it('rapide coûte moins, approfondie coûte plus — jamais le même prix à trois profondeurs', () => {
    const quick = estimateAnalysisCredits('france', 0, 'quick')
    const verified = estimateAnalysisCredits('france', 0, 'verified')
    const deep = estimateAnalysisCredits('france', 0, 'deep')
    expect(quick).toBeLessThan(verified)
    expect(deep).toBeGreaterThan(verified)
    expect(Number.isInteger(quick) && Number.isInteger(deep)).toBe(true)
  })

  it('les exclusions réduisent toujours d’un crédit par entité, plancher à 1', () => {
    expect(estimateAnalysisCredits('france', 2, 'deep')).toBe(estimateAnalysisCredits('france', 0, 'deep') - 2)
    expect(estimateAnalysisCredits('france', 99, 'quick')).toBe(1)
  })

  it('plus de pages à chaque palier', () => {
    expect(ANALYSIS_DEPTH_PRESETS.quick.pages).toBeLessThan(ANALYSIS_DEPTH_PRESETS.verified.pages)
    expect(ANALYSIS_DEPTH_PRESETS.deep.pages).toBeGreaterThan(ANALYSIS_DEPTH_PRESETS.verified.pages)
  })

  it('le cadrage porte la profondeur, et refuse une valeur inconnue', () => {
    expect(analysisScopeSelectionSchema.safeParse({ depth: 'deep' }).success).toBe(true)
    expect(analysisScopeSelectionSchema.safeParse({ depth: 'turbo' }).success).toBe(false)
  })

  it('une profondeur choisie est un cadrage — jamais jetée comme « vide »', () => {
    expect(isScopeSelectionEmpty({ depth: 'deep' })).toBe(false)
    expect(isScopeSelectionEmpty({})).toBe(true)
  })

  it('durée médiane : « non mesurée » sous trois runs, jamais une durée inventée', () => {
    expect(medianDurationSeconds([])).toBeNull()
    expect(medianDurationSeconds([120, 200])).toBeNull()
    expect(medianDurationSeconds([100, 300, 200])).toBe(200)
    expect(medianDurationSeconds([100, 200, 300, 400])).toBe(250)
  })
})
