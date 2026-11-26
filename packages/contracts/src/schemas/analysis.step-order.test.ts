import { describe, expect, it } from 'vitest'
import { ANALYSIS_OPTIONAL_STEPS, ANALYSIS_STEP_ORDER, ANALYSIS_STEPS, analysisStepSchema } from './analysis.js'

// #2164.4 / #2164.5 / #2164.6 — l'ORDRE D'AFFICHAGE des étapes est découplé de l'index d'enum.
describe('ANALYSIS_STEP_ORDER', () => {
  it('contient chaque étape de ANALYSIS_STEPS exactement une fois (aucune étape sans rang)', () => {
    expect([...ANALYSIS_STEP_ORDER].sort()).toEqual([...ANALYSIS_STEPS].sort())
    expect(new Set(ANALYSIS_STEP_ORDER).size).toBe(ANALYSIS_STEP_ORDER.length)
  })

  it('les trois étapes neuves sont EN FIN d’enum (GA-08) mais PAS en fin d’affichage', () => {
    const tail = ANALYSIS_STEPS.slice(-3)
    expect(tail).toEqual(['reuse_existing', 'current_research', 'thematic_research'])
    expect(ANALYSIS_STEP_ORDER[0]).toBe('reuse_existing')
    expect(ANALYSIS_STEP_ORDER.indexOf('current_research')).toBeLessThan(ANALYSIS_STEP_ORDER.indexOf('crosscheck'))
    expect(ANALYSIS_STEP_ORDER.indexOf('thematic_research')).toBeGreaterThan(ANALYSIS_STEP_ORDER.indexOf('crosscheck'))
    expect(ANALYSIS_STEP_ORDER.indexOf('thematic_research')).toBeLessThan(ANALYSIS_STEP_ORDER.indexOf('account_sheet'))
  })

  it('les étapes facultatives sont exactement les trois neuves : une étape non exécutée ne se compte pas', () => {
    expect([...ANALYSIS_OPTIONAL_STEPS]).toEqual(['reuse_existing', 'current_research', 'thematic_research'])
    for (const s of ANALYSIS_OPTIONAL_STEPS) expect(analysisStepSchema.safeParse(s).success).toBe(true)
    expect(analysisStepSchema.safeParse('scope').success).toBe(true)
  })
})
