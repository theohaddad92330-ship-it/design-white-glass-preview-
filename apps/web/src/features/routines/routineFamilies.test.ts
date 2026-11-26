import { routineKeySchema, routineRequirementSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { ROUTINE_FAMILIES, ROUTINE_FAMILY_OF, routineToolsOf } from './routineFamilies'

// Théo C automations-bibliotheque.R1 / N1 — la bibliothèque se filtre par FAMILLE MÉTIER et nomme les outils LUS.
describe('familles de routines (Théo C automations-bibliotheque.R1)', () => {
  it('range CHAQUE routine du catalogue dans une famille : aucune ne disparaît du filtre', () => {
    for (const key of routineKeySchema.options) {
      expect(ROUTINE_FAMILIES).toContain(ROUTINE_FAMILY_OF[key])
    }
  })

  it('n’invente aucune routine : toute clé rangée existe au catalogue', () => {
    expect(Object.keys(ROUTINE_FAMILY_OF).sort()).toEqual([...routineKeySchema.options].sort())
  })

  it('les six familles de la maquette sont toutes peuplées (un filtre vide serait un piège)', () => {
    expect(ROUTINE_FAMILIES).toHaveLength(6)
    for (const family of ROUTINE_FAMILIES) {
      expect(Object.values(ROUTINE_FAMILY_OF)).toContain(family)
    }
  })

  it('trois exemples de la maquette tombent dans la bonne famille', () => {
    expect(ROUTINE_FAMILY_OF.mission_ending).toBe('missions_invoices')
    expect(ROUTINE_FAMILY_OF.bench_alert).toBe('talents_staffing')
    expect(ROUTINE_FAMILY_OF.agenda_conflicts).toBe('meetings')
  })
})

describe('outils lus (Théo C automations-bibliotheque.N1)', () => {
  it('chaque besoin du catalogue a un outil nommé, ceux de l’ESPACE du client', () => {
    for (const requirement of routineRequirementSchema.options) {
      expect(routineToolsOf([requirement]).length).toBe(1)
    }
  })

  it('une routine qui ne lit que l’espace dit « Espace » plutôt que rien', () => {
    expect(routineToolsOf([])).toEqual(['workspace'])
  })

  it('plusieurs besoins, plusieurs outils, sans doublon (comptes et espace ne font qu’un)', () => {
    expect(routineToolsOf(['agenda_read', 'mailbox_read', 'accounts'])).toEqual(['mailbox', 'agenda', 'workspace'])
    expect(routineToolsOf(['accounts', 'accounts'])).toEqual(['workspace'])
  })
})
