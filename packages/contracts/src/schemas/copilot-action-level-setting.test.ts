import { describe, expect, it } from 'vitest'
import {
  ACTION_LEVEL_PREFERENCE_KEY,
  ROUTINE_ACTION_LEVEL,
  SETTABLE_ACTION_LEVELS,
  actionLevelAtClick,
  actionLevelFromPreferences,
  actionLevelSettingSchema,
} from './copilot-action-level.js'

// #2896 / #2449.34-.37 — le niveau d'action PERSISTÉ, lu partout où il s'affiche.
describe('niveau d’action persisté (#2449.34)', () => {
  it('se lit dans le sac de préférences, sous UNE clé', () => {
    expect(actionLevelFromPreferences({ [ACTION_LEVEL_PREFERENCE_KEY]: 'prepare' })).toBe('prepare')
  })

  it('rend null quand rien n’est réglé — jamais un niveau deviné', () => {
    expect(actionLevelFromPreferences({})).toBeNull()
    expect(actionLevelFromPreferences({ replyTone: 'formal' })).toBeNull()
  })

  it('dit NON à une valeur inconnue ou à « automatiser » écrit à la main dans le sac', () => {
    expect(actionLevelFromPreferences({ [ACTION_LEVEL_PREFERENCE_KEY]: 'yolo' })).toBeNull()
    expect(actionLevelFromPreferences({ [ACTION_LEVEL_PREFERENCE_KEY]: 'automate' })).toBeNull()
  })

  it('ne propose pas « automatiser » comme mandat personnel (#2449.26 : la capacité n’existe pas)', () => {
    expect(SETTABLE_ACTION_LEVELS).toEqual(['respond_only', 'prepare', 'execute'])
    expect(actionLevelSettingSchema.safeParse({ level: 'automate' }).success).toBe(false)
    expect(actionLevelSettingSchema.safeParse({ level: null }).success).toBe(true)
    expect(actionLevelSettingSchema.safeParse({ level: 'prepare' }).success).toBe(true)
  })
})

describe('niveau au moment du clic (#2449.35 / #2449.36)', () => {
  it('sans réglage, le défaut de #2449 : le clic EST la validation (exécuter)', () => {
    expect(actionLevelAtClick(null)).toEqual({ level: 'execute', isDefault: true })
  })

  it('un niveau réglé s’affiche tel quel, et n’est pas le défaut', () => {
    expect(actionLevelAtClick('respond_only')).toEqual({ level: 'respond_only', isDefault: false })
    expect(actionLevelAtClick('prepare')).toEqual({ level: 'prepare', isDefault: false })
  })
})

describe('niveau d’action d’une routine (#2449.37)', () => {
  it('chaque niveau N du catalogue des routines a SON niveau d’action', () => {
    // #4016 L6 (Louis 11/10/2026) — N5 entre au catalogue des routines : elle agit seule, sans plafond,
    // et n'envoie toujours rien dehors — même niveau d'action que N4.
    expect(ROUTINE_ACTION_LEVEL).toEqual({
      n1_prepare: 'prepare',
      n4_bounded_auto: 'automate',
      n5_extended_auto: 'automate',
    })
  })
})
