import { describe, expect, it } from 'vitest'
import {
  clientTeamSummary,
  consultantsExpected,
  deliveryModeProblems,
  supervisedForfaitFieldsSchema,
} from './mission-delivery-mode.js'

describe('#3547 — forfait encadré : consultants facultatifs', () => {
  it('seul le mode encadré rend les consultants facultatifs ; le défaut historique les attend', () => {
    expect(consultantsExpected('supervised')).toBe(false)
    expect(consultantsExpected('staffed')).toBe(true)
    expect(consultantsExpected(undefined)).toBe(true)
    expect(consultantsExpected(null)).toBe(true)
  })

  it('le mode encadré n’existe qu’au forfait : une nature inconnue ou absente ne le déduit pas', () => {
    expect(deliveryModeProblems({ contract_kind: 'forfait', delivery_mode: 'supervised' })).toEqual([])
    expect(deliveryModeProblems({ contract_kind: 'regie', delivery_mode: 'supervised' })).toEqual([
      'supervised_needs_forfait',
    ])
    expect(deliveryModeProblems({ delivery_mode: 'supervised' })).toEqual(['supervised_needs_forfait'])
  })

  it('un rôle ou une équipe sans le mode seraient des champs orphelins', () => {
    expect(deliveryModeProblems({ contract_kind: 'forfait', supervision_role: 'framing' })).toEqual([
      'role_without_supervised',
    ])
    expect(deliveryModeProblems({ client_team_names: ['Marie'] })).toEqual(['team_without_supervised'])
    expect(deliveryModeProblems({ contract_kind: 'regie' })).toEqual([])
  })

  it('l’équipe côté client se dit par noms, par nombre, ou pas du tout — jamais « 0 »', () => {
    expect(clientTeamSummary({ client_team_names: ['Marie', ' Paul '] })).toEqual({
      count: 2,
      names: ['Marie', 'Paul'],
    })
    expect(clientTeamSummary({ client_team_size: 12 })).toEqual({ count: 12, names: [] })
    expect(clientTeamSummary({ client_team_size: 12, client_team_names: ['Marie'] })).toEqual({
      count: 12,
      names: ['Marie'],
    })
    expect(clientTeamSummary({})).toBeNull()
    expect(clientTeamSummary({ client_team_size: null, client_team_names: [] })).toBeNull()
    expect(clientTeamSummary({ client_team_size: 0 })).toBeNull()
  })

  it('le schéma refuse une équipe de zéro et accepte l’absence', () => {
    expect(supervisedForfaitFieldsSchema.safeParse({}).success).toBe(true)
    expect(supervisedForfaitFieldsSchema.safeParse({ client_team_size: 0 }).success).toBe(false)
    expect(supervisedForfaitFieldsSchema.safeParse({ supervision_role: 'both', client_team_size: 4 }).success).toBe(
      true,
    )
    expect(supervisedForfaitFieldsSchema.safeParse({ supervision_role: 'coach' }).success).toBe(false)
  })
})
