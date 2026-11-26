import { OUTREACH_PLAYBOOK_KEYS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { PLAYBOOK_FAMILY_ORDER, familiesPresent, familyOfPlaybook } from './playbook-families'

// Théo C sequences-bibliotheque.N3 — « Filtre par famille » : Prospection · Développement · Rendez-vous · Staffing ·
// Suivi de mission · Administratif. Une famille est une lecture de la bibliothèque, jamais une donnée stockée.
describe('Théo C sequences-bibliotheque.N3 — les familles de modèles', () => {
  it('chaque modèle de la bibliothèque a UNE famille — aucun ne disparaît du filtre', () => {
    for (const key of OUTREACH_PLAYBOOK_KEYS) expect(PLAYBOOK_FAMILY_ORDER).toContain(familyOfPlaybook(key))
  })

  it('seule une famille qui a des modèles fait une pastille (jamais une famille vide, jamais « 0 »)', () => {
    const present = familiesPresent(OUTREACH_PLAYBOOK_KEYS)
    for (const family of PLAYBOOK_FAMILY_ORDER) {
      const has = OUTREACH_PLAYBOOK_KEYS.some(key => familyOfPlaybook(key) === family)
      expect(present.includes(family)).toBe(has)
    }
    expect(familiesPresent([])).toEqual([])
  })

  it('rend les familles dans l’ordre de Théo', () => {
    expect(PLAYBOOK_FAMILY_ORDER).toEqual([
      'prospecting',
      'development',
      'meeting',
      'staffing',
      'mission_follow_up',
      'admin',
    ])
  })
})
