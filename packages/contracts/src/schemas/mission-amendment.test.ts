import { describe, expect, it } from 'vitest'
import {
  MISSION_AMENDMENT_EVENT_TYPES,
  MISSION_AMENDMENT_STATUSES,
  MISSION_PAUSE_CAUSES,
  missionAmendmentEventTypeSchema,
  missionAmendmentStatusMove,
  missionAmendmentStatusSchema,
  proposeMissionAmendmentSchema,
} from './mission-amendment.js'

// #2423.2 — seize types d'événements de changement, ni plus ni moins.
describe('MISSION_AMENDMENT_EVENT_TYPES — #2423.2 seize types', () => {
  it('porte exactement seize valeurs, toutes uniques', () => {
    expect(MISSION_AMENDMENT_EVENT_TYPES).toHaveLength(16)
    expect(new Set(MISSION_AMENDMENT_EVENT_TYPES).size).toBe(16)
  })

  it('le TJM et le remplacement de consultant en font partie', () => {
    expect(MISSION_AMENDMENT_EVENT_TYPES).toContain('daily_rate_change')
    expect(MISSION_AMENDMENT_EVENT_TYPES).toContain('consultant_replacement')
  })

  it('le schéma refuse un type hors vocabulaire', () => {
    expect(missionAmendmentEventTypeSchema.safeParse('invente').success).toBe(false)
  })
})

// #2423.5 — cinq statuts de changement.
describe('MISSION_AMENDMENT_STATUSES — #2423.5 cinq statuts', () => {
  it('porte exactement les cinq valeurs proposé/accepté/actif/rejeté/annulé', () => {
    expect(MISSION_AMENDMENT_STATUSES).toEqual(['proposed', 'accepted', 'active', 'rejected', 'cancelled'])
  })

  it.each(MISSION_AMENDMENT_STATUSES)('%s est un statut valide pour le schéma', status => {
    expect(missionAmendmentStatusSchema.safeParse(status).success).toBe(true)
  })
})

// #2423.7 — quatre causes de pause distinguées explicitement.
describe('MISSION_PAUSE_CAUSES — #2423.7 quatre causes', () => {
  it('distingue pause mission, absence consultant, client fermé, jours non facturables', () => {
    expect(MISSION_PAUSE_CAUSES).toEqual(['mission_pause', 'consultant_absence', 'client_closure', 'non_billable_days'])
  })
})

// #2423.1/.5 — la table STRICTE : en avant seulement, jamais de saut.
describe('missionAmendmentStatusMove — #2423.5 transitions strictes', () => {
  it('proposé → accepté/rejeté/annulé passent', () => {
    expect(missionAmendmentStatusMove('proposed', 'accepted')).toBe('forward')
    expect(missionAmendmentStatusMove('proposed', 'rejected')).toBe('forward')
    expect(missionAmendmentStatusMove('proposed', 'cancelled')).toBe('forward')
  })

  it('accepté → actif/annulé passent', () => {
    expect(missionAmendmentStatusMove('accepted', 'active')).toBe('forward')
    expect(missionAmendmentStatusMove('accepted', 'cancelled')).toBe('forward')
  })

  it('un saut proposé → actif est refusé (l’acceptation ne se saute pas)', () => {
    expect(missionAmendmentStatusMove('proposed', 'active')).toBe('refused')
  })

  it('les statuts terminaux (actif/rejeté/annulé) ne repartent nulle part', () => {
    expect(missionAmendmentStatusMove('active', 'cancelled')).toBe('refused')
    expect(missionAmendmentStatusMove('rejected', 'accepted')).toBe('refused')
    expect(missionAmendmentStatusMove('cancelled', 'proposed')).toBe('refused')
  })

  it('le même statut rend "same"', () => {
    expect(missionAmendmentStatusMove('proposed', 'proposed')).toBe('same')
  })
})

// #2423.3 — chaque changement porte date d'effet, preuve, ancien/nouveau terme, approbation.
describe('proposeMissionAmendmentSchema — #2423.3 les attributs exigés à la proposition', () => {
  it('accepte un changement de TJM complet', () => {
    const result = proposeMissionAmendmentSchema.safeParse({
      eventType: 'daily_rate_change',
      effectiveFrom: '2026-10-01',
      proof: 'Avenant signé par le client, PJ jointe',
      previousTerm: { dailyRate: 550 },
      newTerm: { dailyRate: 600 },
    })
    expect(result.success).toBe(true)
  })

  it('refuse sans preuve (aucun changement ne se propose sans preuve)', () => {
    const result = proposeMissionAmendmentSchema.safeParse({
      eventType: 'daily_rate_change',
      effectiveFrom: '2026-10-01',
      proof: '',
    })
    expect(result.success).toBe(false)
  })

  it('refuse sans date d’effet', () => {
    const result = proposeMissionAmendmentSchema.safeParse({
      eventType: 'daily_rate_change',
      proof: 'Avenant signé',
    })
    expect(result.success).toBe(false)
  })

  it('refuse un type d’événement hors vocabulaire', () => {
    const result = proposeMissionAmendmentSchema.safeParse({
      eventType: 'invente',
      effectiveFrom: '2026-10-01',
      proof: 'Avenant signé',
    })
    expect(result.success).toBe(false)
  })
})
