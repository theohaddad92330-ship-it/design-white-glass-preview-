import { describe, expect, it } from 'vitest'
import { PROJECT_NEED_STATUSES } from './project.js'
import { NEED_THEO_STATUSES, needStatusTag, needStoredStatusesFor, needTheoStatus } from './need-theo-status.js'

// Théo C projects-besoins.R3 — trois statuts affichés, rien de perdu : chaque
// état stocké (17) a UNE correspondance écrite et son étiquette.
describe('needTheoStatus — correspondance des états stockés vers les trois statuts', () => {
  it('range chaque état stocké dans un des trois statuts, ou dans « clos »', () => {
    for (const status of PROJECT_NEED_STATUSES) {
      expect([...NEED_THEO_STATUSES, 'closed']).toContain(needTheoStatus(status))
    }
  })

  it('À qualifier : détecté, à qualifier, ancien « open »', () => {
    expect(needTheoStatus('detected')).toBe('to_qualify')
    expect(needTheoStatus('to_qualify')).toBe('to_qualify')
    expect(needTheoStatus('open')).toBe('to_qualify') // ancienne valeur, reprise comme normaliseNeedStatus
  })

  it('Ouvert : tout le travail en cours, y compris veille et réactivation', () => {
    for (const s of [
      'qualified',
      'to_match',
      'matching',
      'shortlist_ready',
      'submitted',
      'client_review',
      'interview',
      'negotiation',
      'on_hold',
      'to_reactivate',
    ] as const) {
      expect(needTheoStatus(s)).toBe('open')
    }
  })

  it('Couvert : gagné et pourvu', () => {
    expect(needTheoStatus('won')).toBe('covered')
    expect(needTheoStatus('staffed')).toBe('covered')
  })

  it('perdu et annulé restent clos : jamais présentés comme couverts', () => {
    expect(needTheoStatus('lost')).toBe('closed')
    expect(needTheoStatus('cancelled')).toBe('closed')
  })

  it('un état inconnu tombe sur À qualifier, comme normaliseNeedStatus', () => {
    expect(needTheoStatus('???')).toBe('to_qualify')
  })
})

describe('needStatusTag — l’état stocké devient une étiquette quand il en dit plus', () => {
  it('pas d’étiquette quand le statut affiché dit déjà tout', () => {
    expect(needStatusTag('to_qualify')).toBeNull()
    expect(needStatusTag('open')).toBeNull()
    expect(needStatusTag('won')).toBeNull()
  })
  it('l’état précis voyage en étiquette', () => {
    expect(needStatusTag('matching')).toBe('matching')
    expect(needStatusTag('on_hold')).toBe('on_hold')
    expect(needStatusTag('lost')).toBe('lost')
  })
  it('une étape candidat/affaire se replie comme sur le board', () => {
    expect(needStatusTag('interview')).toBe('shortlist_ready')
  })
})

describe('needStoredStatusesFor — la correspondance inverse, pour filtrer côté serveur', () => {
  it('partitionne les états stockés : chacun est dans exactement un statut, ou dans aucun (clos)', () => {
    const seen = new Map<string, number>()
    for (const theo of NEED_THEO_STATUSES) {
      for (const stored of needStoredStatusesFor(theo)) {
        seen.set(stored, (seen.get(stored) ?? 0) + 1)
        expect(needTheoStatus(stored)).toBe(theo)
      }
    }
    expect([...seen.values()].every(count => count === 1)).toBe(true)
    expect(seen.has('lost')).toBe(false)
    expect(seen.has('cancelled')).toBe(false)
  })
  it('Couvert = gagné et pourvu', () => {
    expect([...needStoredStatusesFor('covered')].sort()).toEqual(['staffed', 'won'])
  })
})
