import { describe, expect, it } from 'vitest'
import {
  EMPTY_RENEWAL_CLIENT_RAIL,
  EMPTY_RENEWAL_CONSULTANT_RAIL,
  RENEWAL_RAIL_ANSWERS,
  canConfirmRenewal,
  renewalClientOpenQuestions,
  renewalClientRailSchema,
  renewalConsultantOpenQuestions,
  renewalConsultantRailSchema,
  setRenewalClientRailRequestSchema,
  setRenewalConsultantRailRequestSchema,
} from './mission-renewal-rail.js'

describe('canConfirmRenewal — #2413.57 / #2413.67', () => {
  it('refuse quand aucun rail n’a été ouvert', () => {
    expect(canConfirmRenewal(null, null)).toBe(false)
  })

  it('refuse quand un seul rail est positif — le NO-GO qui remplace l’oral manager seul', () => {
    const client = { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' as const }
    expect(canConfirmRenewal(client, EMPTY_RENEWAL_CONSULTANT_RAIL)).toBe(false)
    expect(canConfirmRenewal(EMPTY_RENEWAL_CLIENT_RAIL, { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'oui' })).toBe(
      false,
    )
  })

  it('refuse quand un rail dit explicitement non, même si l’autre dit oui', () => {
    const client = { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' as const }
    const consultant = { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'non' as const }
    expect(canConfirmRenewal(client, consultant)).toBe(false)
  })

  it('confirme uniquement quand les deux rails répondent oui', () => {
    const client = { ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'oui' as const }
    const consultant = { ...EMPTY_RENEWAL_CONSULTANT_RAIL, intent: 'oui' as const }
    expect(canConfirmRenewal(client, consultant)).toBe(true)
  })
})

describe('renewalClientRailSchema / renewalConsultantRailSchema', () => {
  it('accepte le rail vide', () => {
    expect(renewalClientRailSchema.safeParse(EMPTY_RENEWAL_CLIENT_RAIL).success).toBe(true)
    expect(renewalConsultantRailSchema.safeParse(EMPTY_RENEWAL_CONSULTANT_RAIL).success).toBe(true)
  })

  it('rejette une réponse fermée hors énumération', () => {
    const result = renewalClientRailSchema.safeParse({ ...EMPTY_RENEWAL_CLIENT_RAIL, intent: 'probablement' })
    expect(result.success).toBe(false)
  })

  it('rejette un champ inconnu (strict)', () => {
    const result = renewalClientRailSchema.safeParse({ ...EMPTY_RENEWAL_CLIENT_RAIL, probability: 0.8 })
    expect(result.success).toBe(false)
  })

  it('les trois réponses sont non_demande, oui, non — jamais une probabilité', () => {
    expect([...RENEWAL_RAIL_ANSWERS]).toEqual(['non_demande', 'oui', 'non'])
  })
})

describe('setRenewalClientRailRequestSchema / setRenewalConsultantRailRequestSchema', () => {
  it('accepte une réponse fermée seule, les trois champs ouverts à null', () => {
    const result = setRenewalClientRailRequestSchema.safeParse({
      intent: 'oui',
      scope: null,
      budget: null,
      process: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejette un champ hors de ce que le rail connaît', () => {
    const result = setRenewalConsultantRailRequestSchema.safeParse({
      intent: 'oui',
      conditions: null,
      availability: 'oui',
      otherOptions: null,
      probability: 0.9,
    })
    expect(result.success).toBe(false)
  })
})

// #2413.60 (épopée #2965) — « Action : préparer questions » : la liste des
// questions OUVERTES d'un rail dont il n'a pas encore de réponse, dérivée des
// mêmes champs que `RenewalRailGroup` (web) affiche déjà — jamais un artefact
// séparé qui dupliquerait le rail.
describe('renewalClientOpenQuestions / renewalConsultantOpenQuestions', () => {
  it('rail client vide → les trois questions sont ouvertes', () => {
    expect(renewalClientOpenQuestions(EMPTY_RENEWAL_CLIENT_RAIL)).toEqual(['scope', 'budget', 'process'])
  })

  it('rail client → seules les questions SANS réponse restent', () => {
    expect(renewalClientOpenQuestions({ ...EMPTY_RENEWAL_CLIENT_RAIL, scope: 'Même périmètre' })).toEqual([
      'budget',
      'process',
    ])
  })

  it('rail client jamais ouvert (`null`) → les trois questions sont ouvertes', () => {
    expect(renewalClientOpenQuestions(null)).toEqual(['scope', 'budget', 'process'])
  })

  it('rail client entièrement répondu → aucune question ouverte', () => {
    expect(renewalClientOpenQuestions({ ...EMPTY_RENEWAL_CLIENT_RAIL, scope: 'X', budget: 'Y', process: 'Z' })).toEqual(
      [],
    )
  })

  it('rail consultant vide → les trois questions sont ouvertes, `availability` inclus tant que `non_demande`', () => {
    expect(renewalConsultantOpenQuestions(EMPTY_RENEWAL_CONSULTANT_RAIL)).toEqual([
      'conditions',
      'availability',
      'otherOptions',
    ])
  })

  it('rail consultant → `availability` répondue (oui/non, jamais `non_demande`) sort de la liste', () => {
    expect(renewalConsultantOpenQuestions({ ...EMPTY_RENEWAL_CONSULTANT_RAIL, availability: 'oui' })).toEqual([
      'conditions',
      'otherOptions',
    ])
  })

  it('rail consultant jamais ouvert (`null`) → les trois questions sont ouvertes', () => {
    expect(renewalConsultantOpenQuestions(null)).toEqual(['conditions', 'availability', 'otherOptions'])
  })
})
