import { describe, expect, it } from 'vitest'
import { BTMMP_AXES, btmmpCompleteness } from './project.js'

/**
 * BTMMP — « un besoin n'est qualifié que si Bellum comprend le budget, timing,
 * mission, management, process et prochaine étape » (annexe méthodo p21).
 *
 * La complétude est déterministe et honnête : un axe vide ne compte pas, un
 * besoin partiellement qualifié le reste.
 */
describe('btmmpCompleteness', () => {
  it('n’est qualifié que lorsque les SIX axes sont remplis', () => {
    const full = {
      budget: 'TJM 600 compatible',
      timing: 'démarrage septembre',
      mission: 'reprise SOC',
      management: 'manager = RSSI',
      process: 'panel via achats',
      nextStep: 'RDV jeudi, décision au comité',
    }
    const r = btmmpCompleteness(full)
    expect(r.qualified).toBe(true)
    expect(r.score).toBe(6)
    expect(r.missing).toEqual([])
  })

  it('reste NON qualifié tant qu’un axe manque', () => {
    const r = btmmpCompleteness({
      budget: 'ok',
      timing: 'Q4',
      mission: 'SOC',
      management: 'RSSI',
      process: 'achats',
      // nextStep manquant
    })
    expect(r.qualified).toBe(false)
    expect(r.score).toBe(5)
    expect(r.missing).toEqual(['nextStep'])
  })

  it('ne compte pas un axe vide ou fait d’espaces', () => {
    const r = btmmpCompleteness({ budget: '   ', timing: '', mission: 'SOC' })
    expect(r.filled).toEqual(['mission'])
    expect(r.score).toBe(1)
  })

  it('gère un BTMMP absent', () => {
    const r = btmmpCompleteness(null)
    expect(r.score).toBe(0)
    expect(r.qualified).toBe(false)
    expect(r.missing).toEqual([...BTMMP_AXES])
  })

  it('couvre exactement les six axes de la page', () => {
    expect(BTMMP_AXES).toEqual(['budget', 'timing', 'mission', 'management', 'process', 'nextStep'])
  })
})
