import { describe, expect, it } from 'vitest'
import type { AnalysisContextPreset } from '@bellum/contracts'
import { ANALYSIS_CONTEXT_PRESETS } from '@bellum/contracts'
import { objectiveLabelKeyForPreset, OBJECTIVE_LABEL_KEY_BY_PRESET } from './objectiveMapping'

describe('objectiveLabelKeyForPreset — #2163.31-36', () => {
  it('couvre les 7 presets existants, sans en inventer un 8e', () => {
    const covered = Object.keys(OBJECTIVE_LABEL_KEY_BY_PRESET).sort()
    expect(covered).toEqual([...ANALYSIS_CONTEXT_PRESETS].sort())
  })

  it('mappe chaque preset sur un libellé distinct — pas deux objectifs qui se confondent', () => {
    const keys = ANALYSIS_CONTEXT_PRESETS.map(preset => objectiveLabelKeyForPreset(preset))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each([
    ['known-account', 'confirm.objective.values.understand'],
    ['strategic', 'confirm.objective.values.findPeople'],
    ['push-offer', 'confirm.objective.values.findEntryPoint'],
    ['signal', 'confirm.objective.values.verifyNeed'],
    ['retry', 'confirm.objective.values.prepareAction'],
    ['incumbent', 'confirm.objective.values.compare'],
    ['free', 'confirm.objective.values.other'],
  ] satisfies [AnalysisContextPreset, string][])('%s → %s', (preset, expected) => {
    expect(objectiveLabelKeyForPreset(preset)).toBe(expected)
  })
})
