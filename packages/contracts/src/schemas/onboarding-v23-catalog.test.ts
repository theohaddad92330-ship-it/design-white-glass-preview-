import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_ESSENTIAL_V23,
  ONBOARDING_GROUPS_V23,
  ONBOARDING_GUIDED_V23,
  ONBOARDING_THEMES_V23,
  V23_NEW_KEYS,
  V23_RENAMED_KEYS,
} from './onboarding-v23-catalog.js'
import { RESPONSE_STATUSES_V23, responseStatusOf, UNKNOWN_ANSWER_LABELS } from './onboarding-unknown-answers.js'

const allKeys = ONBOARDING_GROUPS_V23.flatMap(group => group.keys)

describe('catalogue d’onboarding V23 (Théo O onboarding-couverture)', () => {
  it('porte 16 thèmes et 94 groupes (92 de Théo + les 2 réintégrés)', () => {
    expect(ONBOARDING_THEMES_V23).toHaveLength(16)
    expect(ONBOARDING_GROUPS_V23).toHaveLength(94)
  })

  it('range chaque clé dans UN seul groupe, 230 clés au total', () => {
    expect(new Set(allKeys).size).toBe(allKeys.length)
    expect(allKeys).toHaveLength(230)
  })

  it('relie chaque thème à ses groupes, et chaque groupe à son thème', () => {
    const groupIds = new Set(ONBOARDING_GROUPS_V23.map(group => group.id))
    const themeIds = new Set(ONBOARDING_THEMES_V23.map(theme => theme.id))
    for (const theme of ONBOARDING_THEMES_V23) for (const id of theme.groups) expect(groupIds.has(id)).toBe(true)
    for (const group of ONBOARDING_GROUPS_V23) {
      expect(themeIds.has(group.theme)).toBe(true)
      expect(ONBOARDING_THEMES_V23.find(theme => theme.id === group.theme)?.groups).toContain(group.id)
    }
  })

  it('compte 5 blocs essentiels de 18 clés, tous dans le catalogue', () => {
    expect(ONBOARDING_ESSENTIAL_V23).toHaveLength(5)
    const keys = ONBOARDING_ESSENTIAL_V23.flatMap(block => block.keys)
    expect(keys).toHaveLength(18)
    for (const key of keys) expect(allKeys).toContain(key)
  })

  it('compte 8 étapes guidées : 32 questions de Théo + workspace_profile réintégrée', () => {
    expect(ONBOARDING_GUIDED_V23).toHaveLength(8)
    const keys = ONBOARDING_GUIDED_V23.flatMap(step => step.keys)
    expect(keys).toHaveLength(33)
    expect(keys).toContain('workspace_profile')
    for (const key of keys) expect(allKeys).toContain(key)
  })

  it('garde workspace_profile et placed_roles (rien de notre catalogue ne disparaît)', () => {
    expect(allKeys).toContain('workspace_profile')
    expect(allKeys).toContain('placed_roles')
  })

  it('nomme 8 clés renommées (même clé, mêmes réponses) et 26 clés neuves, toutes dans le catalogue', () => {
    expect(V23_RENAMED_KEYS).toHaveLength(8)
    expect(V23_NEW_KEYS).toHaveLength(26)
    for (const key of [...V23_RENAMED_KEYS, ...V23_NEW_KEYS]) expect(allKeys).toContain(key)
  })

  it('tutoie partout', () => {
    const text = JSON.stringify([
      ONBOARDING_THEMES_V23,
      ONBOARDING_GROUPS_V23,
      ONBOARDING_GUIDED_V23,
      ONBOARDING_ESSENTIAL_V23,
    ])
    expect(text).not.toMatch(/\b(vous|votre|vos)\b/i)
  })
})

describe('les cinq statuts d’une réponse', () => {
  it('« répondue » + les quatre incertitudes, jamais confondues avec une valeur mesurée', () => {
    expect(RESPONSE_STATUSES_V23).toEqual([
      'answered',
      'not_yet_known',
      'not_applicable',
      'to_verify_with_team',
      'answer_later',
    ])
    expect(responseStatusOf('Staffing')).toBe('answered')
    expect(responseStatusOf(UNKNOWN_ANSWER_LABELS.answer_later)).toBe('answer_later')
    expect(responseStatusOf(UNKNOWN_ANSWER_LABELS.not_applicable)).toBe('not_applicable')
    expect(responseStatusOf('')).toBeNull()
    expect(responseStatusOf(null)).toBeNull()
  })
})
