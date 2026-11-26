import { describe, expect, it } from 'vitest'
import {
  COMMITTEE_ENTRY_LEVELS,
  isAboveCommitteeEntryLevel,
  setCommitteeEntryLevelSchema,
} from './committee-entry-level.js'

describe('#3282 / #3263.30 — niveau d’entrée du comité d’achat (liste fermée)', () => {
  it('la liste est fermée : C-level / Direction / Manager / Opérationnel, rien d’autre', () => {
    expect([...COMMITTEE_ENTRY_LEVELS]).toEqual(['c_level', 'direction', 'manager', 'operational'])
    expect(setCommitteeEntryLevelSchema.safeParse({ level: 'direction' }).success).toBe(true)
    expect(setCommitteeEntryLevelSchema.safeParse({ level: null }).success).toBe(true)
    // Plus de texte libre.
    expect(setCommitteeEntryLevelSchema.safeParse({ level: 'directeur général' }).success).toBe(false)
    expect(setCommitteeEntryLevelSchema.safeParse({}).success).toBe(false)
  })

  it('« trop haut » se calcule sur la valeur saisie : un niveau au-dessus de celui déclaré', () => {
    expect(isAboveCommitteeEntryLevel('L1', 'manager')).toBe(true)
    expect(isAboveCommitteeEntryLevel('L0', 'direction')).toBe(true)
    expect(isAboveCommitteeEntryLevel('L2', 'manager')).toBe(true)
    expect(isAboveCommitteeEntryLevel('L3', 'manager')).toBe(false)
    expect(isAboveCommitteeEntryLevel('L4', 'manager')).toBe(false)
    expect(isAboveCommitteeEntryLevel('L1', 'c_level')).toBe(false)
  })

  it('sans niveau déclaré, ou pour un niveau non comparable, rien n’est signalé', () => {
    expect(isAboveCommitteeEntryLevel('L1', null)).toBe(false)
    expect(isAboveCommitteeEntryLevel('L1', undefined)).toBe(false)
    // Achats/contrôle (L5) est un axe parallèle, pas un échelon.
    expect(isAboveCommitteeEntryLevel('L5', 'operational')).toBe(false)
    expect(isAboveCommitteeEntryLevel(null, 'operational')).toBe(false)
    expect(isAboveCommitteeEntryLevel(undefined, 'operational')).toBe(false)
  })
})
