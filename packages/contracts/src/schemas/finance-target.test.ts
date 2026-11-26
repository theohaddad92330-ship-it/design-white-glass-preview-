import { describe, expect, it } from 'vitest'
import {
  MARGIN_ATTAINMENT_GAPS,
  financeMarginTargetSchema,
  marginAttainment,
  setFinanceMarginTargetSchema,
} from './finance-target.js'

/**
 * Ce que cette garde protège : le revirement du 31/08/2026 lève le refus de
 * l'anneau, il ne lève PAS « non mesuré n'est jamais zéro ». Chaque test
 * ci-dessous est une des trois moitiés que Louis a explicitement gardées.
 */
describe('marginAttainment — sans objectif, aucun pourcentage', () => {
  it('rend `no_target` quand rien n’a été saisi, et la branche NE PORTE PAS de `percent`', () => {
    const result = marginAttainment({ marginPercent: 32, targetPercent: null })
    expect(result.measured).toBe(false)
    // ⚠️ Le cœur du lot : on ne peut pas lire un zéro qui n'existe pas.
    expect(result).not.toHaveProperty('percent')
    expect(result).not.toHaveProperty('reached')
    if (!result.measured) expect(result.gap).toBe('no_target')
  })

  it('un objectif à zéro ou négatif n’est pas un objectif — jamais une division par zéro', () => {
    for (const targetPercent of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = marginAttainment({ marginPercent: 30, targetPercent })
      expect(result).toEqual({ measured: false, gap: 'no_target' })
    }
  })

  it('« aucun objectif » passe AVANT « marge non mesurée » — c’est le seul des trois cas qui porte un geste', () => {
    expect(marginAttainment({ marginPercent: null, targetPercent: null })).toEqual({
      measured: false,
      gap: 'no_target',
    })
  })
})

describe('marginAttainment — un objectif ne rend pas une marge mesurable', () => {
  it('se tait quand la marge n’a pas pu être calculée', () => {
    expect(marginAttainment({ marginPercent: null, targetPercent: 25 })).toEqual({
      measured: false,
      gap: 'margin_not_measured',
    })
  })

  it('se tait quand la marge repose sur trop peu de missions', () => {
    expect(marginAttainment({ marginPercent: 61, measurable: false, targetPercent: 25 })).toEqual({
      measured: false,
      gap: 'margin_not_measurable',
    })
  })

  it('`measurable` ABSENT n’est pas `false` — un serveur qui ne porte pas le champ ne fait pas taire l’anneau', () => {
    const result = marginAttainment({ marginPercent: 30, targetPercent: 25 })
    expect(result.measured).toBe(true)
  })
})

describe('marginAttainment — ce qu’il calcule quand tout est là', () => {
  it('rend la part de l’objectif atteinte, à une décimale', () => {
    const result = marginAttainment({ marginPercent: 21.27, measurable: true, targetPercent: 50 })
    expect(result).toEqual({
      measured: true,
      percent: 42.5,
      targetPercent: 50,
      marginPercent: 21.27,
      reached: false,
    })
  })

  it('ne borne PAS un dépassement — le seul bon chiffre de l’écran ne s’écrête pas', () => {
    const result = marginAttainment({ marginPercent: 40, targetPercent: 25 })
    expect(result.measured && result.percent).toBe(160)
    expect(result.measured && result.reached).toBe(true)
  })

  it('« atteint » se juge sur les valeurs RÉELLES, jamais sur le pourcentage arrondi', () => {
    // 24,96 / 25 = 99,84 % → arrondi à 99,8 %. Un `reached` déduit d'un
    // arrondi à 100 aurait dit « objectif atteint » sur un objectif manqué.
    const result = marginAttainment({ marginPercent: 24.96, targetPercent: 25 })
    expect(result.measured && result.reached).toBe(false)
    expect(result.measured && result.percent).toBe(99.8)
  })

  it('une marge négative reste mesurée — perdre de l’argent est un fait, pas une absence', () => {
    const result = marginAttainment({ marginPercent: -12, targetPercent: 25 })
    expect(result.measured).toBe(true)
    expect(result.measured && result.reached).toBe(false)
  })
})

describe('les schémas refusent ce que la base refuse', () => {
  it('un objectif à 0 % est rejeté — la contrainte SQL dit la même chose', () => {
    expect(() => setFinanceMarginTargetSchema.parse({ month: '2026-08', targetPercent: 0 })).toThrow()
    expect(() => setFinanceMarginTargetSchema.parse({ month: '2026-08', targetPercent: 101 })).toThrow()
  })

  it('effacer l’objectif est un geste légitime', () => {
    expect(setFinanceMarginTargetSchema.parse({ month: '2026-08', targetPercent: null })).toEqual({
      month: '2026-08',
      targetPercent: null,
    })
  })

  it('le mois est borné à AAAA-MM', () => {
    expect(() => setFinanceMarginTargetSchema.parse({ month: '2026-8', targetPercent: 25 })).toThrow()
    expect(() => financeMarginTargetSchema.parse({ month: 'août', targetPercent: null, setAt: null })).toThrow()
  })
})

describe('la garde LIT quelque chose', () => {
  it('les trois raisons sont NOMMÉES, et le test échouerait sur une liste vide', () => {
    expect(MARGIN_ATTAINMENT_GAPS.length).toBe(3)
    expect([...MARGIN_ATTAINMENT_GAPS]).toEqual(['no_target', 'margin_not_measured', 'margin_not_measurable'])
  })
})
