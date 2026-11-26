import { describe, expect, it } from 'vitest'
import { analysisRunSteps, analysisStepPosition, analysisStepsBefore } from './analysis-step-progress'

// #2164.4/.5/.6 — l'avancement suit l'ORDRE D'AFFICHAGE, pas l'index d'enum.
describe('ordre d’affichage des étapes', () => {
  it('étape facultative absente ⇒ non comptée (9 étapes obligatoires + 2 de fin d’enum… seulement les 9)', () => {
    expect(analysisRunSteps()).toHaveLength(9)
    expect(analysisStepPosition('account_sheet')).toMatchObject({ index: 3, total: 9 })
  })

  it('une étape de FIN d’enum émise en 2e position ne coche pas les étapes d’avant d’enum', () => {
    // reuse_existing est en 1er à l'écran ; current_research arrive après scope.
    const emitted = ['reuse_existing', 'current_research'] as const
    expect(analysisStepsBefore('current_research', emitted)).toEqual(['reuse_existing', 'scope'])
    expect(analysisStepPosition('current_research', emitted)).toEqual({ index: 3, total: 11, step: 'current_research' })
  })

  it('étape facultative non émise jamais cochée, même quand une étape postérieure est atteinte', () => {
    expect(analysisStepsBefore('account_sheet')).toEqual(['scope', 'crosscheck'])
    expect(analysisStepsBefore('account_sheet', ['thematic_research'])).toEqual([
      'scope',
      'crosscheck',
      'thematic_research',
    ])
  })

  it('l’étape en cours compte même si l’on ne l’a pas encore listée comme émise', () => {
    expect(analysisStepPosition('reuse_existing')).toEqual({ index: 1, total: 10, step: 'reuse_existing' })
  })
})
