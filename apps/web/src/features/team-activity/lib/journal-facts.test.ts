import { describe, expect, it } from 'vitest'
import { actionTypeSchema } from '@bellum/contracts'
import { isConsultationType, JOURNAL_FAMILIES, journalFamilyOf, NOT_A_JOURNAL_FACT } from './journal-facts'

// Théo D team-activite — « le journal ne trace que des faits métier : jamais une consultation ».
describe('journal d’activité — des faits, jamais une consultation', () => {
  it('reconnaît une consultation à son type, quel que soit le mot (garde qui sait dire NON)', () => {
    for (const type of ['account_viewed', 'account_consulted', 'plan_action_opened', 'contact_seen', 'page_view']) {
      expect(isConsultationType(type), type).toBe(true)
    }
    for (const type of ['analysis_completed', 'rdv_obtained', 'plan_action_assigned', 'deal_signed']) {
      expect(isConsultationType(type), type).toBe(false)
    }
  })

  it('aucun type de fait du journal n’est une consultation', () => {
    const facts = Object.values(JOURNAL_FAMILIES).flat()
    expect(facts.length).toBeGreaterThan(0)
    expect(facts.filter(isConsultationType)).toEqual([])
  })

  it('chaque type d’action connu est classé : un fait du journal, ou écarté avec sa raison', () => {
    const classed = new Set([...Object.values(JOURNAL_FAMILIES).flat(), ...Object.keys(NOT_A_JOURNAL_FACT)])
    expect(actionTypeSchema.options.filter(type => !classed.has(type))).toEqual([])
  })

  it('les gestes d’ouverture sont écartés comme consultations, pas rangés dans une famille', () => {
    expect(journalFamilyOf('plan_action_opened')).toBeNull()
    expect(NOT_A_JOURNAL_FACT['plan_action_opened']).toBeTruthy()
    expect(journalFamilyOf('analysis_completed')).toBe('research')
    expect(journalFamilyOf('rdv_obtained')).toBe('commercial')
    expect(journalFamilyOf('plan_action_assigned')).toBe('actions')
  })

  it('un type inconnu n’entre pas dans le journal', () => {
    expect(journalFamilyOf('something_new')).toBeNull()
  })
})
