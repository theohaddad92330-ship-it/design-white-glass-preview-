import { describe, expect, it } from 'vitest'
import {
  GENERIC_JUDGE_AGREEMENT_THRESHOLD_PERCENT,
  GENERIC_JUDGE_CALIBRATION,
  GENERIC_JUDGE_MIN_LABELLED_CASES,
  genericJudgeReliability,
} from './generic-recommendation-judge.js'

const cal = (measurement: (typeof GENERIC_JUDGE_CALIBRATION)['measurement']) => ({
  judgeVersion: 'j1',
  labelSetVersion: 'l1',
  labelledCases: 30,
  measurement,
})
const m = (agreed: number, judged: number, failed = 0) => ({
  agreed,
  judged,
  failed,
  measuredAt: '2026-10-11',
  model: 'claude-x',
})

describe('genericJudgeReliability — le juge n’est jamais « fiable » par défaut (#3223)', () => {
  it('sans mesure : non fiable, aucun accord inventé', () => {
    const r = genericJudgeReliability(cal(null))
    expect(r).toEqual({
      state: 'unreliable',
      reason: 'not_measured',
      judgeVersion: 'j1',
      thresholdPercent: GENERIC_JUDGE_AGREEMENT_THRESHOLD_PERCENT,
    })
    expect('agreementPercent' in r).toBe(false)
  })

  it('accord au seuil, cas suffisants, rien d’échoué : fiable', () => {
    const r = genericJudgeReliability(cal(m(26, 30)))
    expect(r.state).toBe('reliable')
    expect(r.agreementPercent).toBe(86.67)
  })

  it('sait dire NON : sous le seuil, l’accord se montre mais la mesure est non fiable', () => {
    const r = genericJudgeReliability(cal(m(25, 30)))
    expect(r).toMatchObject({ state: 'unreliable', reason: 'below_threshold', agreementPercent: 83.33 })
  })

  it('une calibration où des cas n’ont pas été jugés est incomplète, même à 100 %', () => {
    expect(genericJudgeReliability(cal(m(28, 28, 2)))).toMatchObject({ state: 'unreliable', reason: 'incomplete' })
  })

  it('sous le plancher de cas, un accord parfait ne suffit pas', () => {
    const n = GENERIC_JUDGE_MIN_LABELLED_CASES - 1
    expect(genericJudgeReliability(cal(m(n, n)))).toMatchObject({ state: 'unreliable', reason: 'too_few_cases' })
  })

  it('la calibration livrée porte ses deux empreintes et le nombre de cas étiquetés', () => {
    expect(GENERIC_JUDGE_CALIBRATION.judgeVersion).toMatch(/^[0-9a-f]{12}$/)
    expect(GENERIC_JUDGE_CALIBRATION.labelSetVersion).toMatch(/^[0-9a-f]{12}$/)
    expect(GENERIC_JUDGE_CALIBRATION.labelledCases).toBeGreaterThanOrEqual(GENERIC_JUDGE_MIN_LABELLED_CASES)
  })
})
