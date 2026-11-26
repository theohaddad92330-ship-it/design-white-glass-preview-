import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/accounts.json'
import { TEAM_DECISION_LABEL_KEY, teamDecisionOf } from './teamDecision'

describe('teamDecisionOf — la décision d’équipe, en mots', () => {
  it('lit la porte de priorité telle quelle', () => {
    expect(teamDecisionOf({ priority_gate: 'prioritised', commercial_status: 'inbox' })).toBe('prioritised')
    expect(teamDecisionOf({ priority_gate: 'parked', commercial_status: 'watching' })).toBe('parked')
    expect(teamDecisionOf({ priority_gate: 'pending', commercial_status: 'inbox' })).toBe('pending')
  })

  it('« En observation » : porte non tranchée ET statut commercial en observation', () => {
    expect(teamDecisionOf({ priority_gate: 'pending', commercial_status: 'watching' })).toBe('watching')
  })

  it('SAIT DIRE NON : une porte absente ne devient jamais « À trancher »', () => {
    expect(teamDecisionOf({ commercial_status: 'inbox' })).toBeNull()
    expect(teamDecisionOf({})).toBeNull()
  })

  it('chaque état a un libellé fr qui existe et ne contient aucun chiffre', () => {
    const lookup = (key: string) => key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], fr)
    for (const key of Object.values(TEAM_DECISION_LABEL_KEY)) {
      const label = lookup(key)
      expect(typeof label).toBe('string')
      expect(label as string).not.toMatch(/\d/)
    }
  })
})
