import { describe, expect, it } from 'vitest'
import { OUTREACH_PERSONA_PROFILES, OUTREACH_PERSONAS, personaForHierarchyLevel } from './outreach-scenarios.js'

/**
 * #2887 (#2371.2) — le moteur de classification persona × palier : les SEPT
 * paliers réels de `classify_hierarchy_level` (`hierarchy_level.py`) reçoivent
 * désormais chacun SON persona, plutôt que d'être collapsés sur trois — la
 * granularité existait déjà côté classification, elle était jetée en aval.
 * Aucune donnée nouvelle : `hierarchy_level` est déjà une classification RÉELLE,
 * déterministe, testée sur des postes réels.
 */
describe('personaForHierarchyLevel — moteur de classification (#2887, #2371.2)', () => {
  it('donne un persona DISTINCT à chacun des sept paliers réels — aucun palier orphelin', () => {
    const levels = ['governance', 'c_level', 'achats', 'direction', 'management', 'expert', 'operationnel']
    const personas = levels.map(level => personaForHierarchyLevel(level))
    expect(personas.every(p => p !== null)).toBe(true)
    expect(new Set(personas).size).toBe(levels.length)
  })

  it('un palier `unknown` ou absent rend `null` — jamais un persona deviné', () => {
    expect(personaForHierarchyLevel('unknown')).toBeNull()
    expect(personaForHierarchyLevel(null)).toBeNull()
    expect(personaForHierarchyLevel(undefined)).toBeNull()
    expect(personaForHierarchyLevel('')).toBeNull()
  })

  it('chaque persona listé dans OUTREACH_PERSONAS porte un profil complet', () => {
    for (const persona of OUTREACH_PERSONAS) {
      const profile = OUTREACH_PERSONA_PROFILES[persona]
      expect(profile.lever.length).toBeGreaterThan(0)
      expect(profile.speaksIn.length).toBeGreaterThan(0)
      expect(profile.turnsOff.length).toBeGreaterThan(0)
    }
  })

  it('OUTREACH_PERSONAS porte exactement sept valeurs, une par palier réel', () => {
    expect(OUTREACH_PERSONAS.length).toBe(7)
  })
})
