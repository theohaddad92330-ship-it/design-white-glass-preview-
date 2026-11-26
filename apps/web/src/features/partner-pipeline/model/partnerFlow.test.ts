import { describe, expect, it } from 'vitest'
import { daysSinceActivity, partnerFlow, type PartnerFlowInput } from './partnerFlow'

const NOW = new Date('2026-09-04T12:00:00.000Z')

function input(overrides: Partial<PartnerFlowInput> = {}): PartnerFlowInput {
  return {
    needsReceived90d: 0,
    needsGiven90d: 0,
    placementsActive: 0,
    placementsTotal: 0,
    lastActivityAt: null,
    ...overrides,
  }
}

describe('partnerFlow — quatre compteurs que personne n’écrit', () => {
  it('quatre zéros ne se lisent PAS « zéro échange » mais « personne ne compte »', () => {
    const flow = partnerFlow(input(), NOW)
    expect(flow.state).toBe('uncounted')
    // La carte n'a rien à afficher : c'est ce qui remplace « 0 besoin(s)
    // reçu(s) · 0 confié(s) en retour, sur 90 jours ».
    expect(flow.counted).toBeNull()
    expect(flow.reciprocity).toBeNull()
  })

  it('une date d’activité fraîche ne suffit PAS à déclarer un flux', () => {
    // La date d'activité EST écrite en production (création, changement
    // d'étape). Les compteurs, non. Conclure « actif » sur la seule date ferait
    // dire « flux actif » à une relation qu'on vient de saisir.
    const flow = partnerFlow(input({ lastActivityAt: '2026-09-03T12:00:00.000Z' }), NOW)
    expect(flow.state).toBe('uncounted')
  })

  it('un seul compteur renseigné suffit à sortir de « non compté »', () => {
    const flow = partnerFlow(input({ placementsTotal: 2 }), NOW)
    expect(flow.state).not.toBe('uncounted')
    expect(flow.counted).not.toBeNull()
  })
})

describe('partnerFlow — actif ou dormant, une fois qu’on compte', () => {
  it('des échanges comptés et une activité récente ⇒ actif', () => {
    const flow = partnerFlow(
      input({ needsReceived90d: 7, needsGiven90d: 3, lastActivityAt: '2026-08-20T09:00:00.000Z' }),
      NOW,
    )
    expect(flow.state).toBe('active')
  })

  it('des échanges comptés mais AUCUNE date lisible ⇒ dormant, jamais actif', () => {
    const flow = partnerFlow(input({ needsReceived90d: 7, lastActivityAt: null }), NOW)
    expect(flow.state).toBe('dormant')
  })

  it('une activité vieille de plus de 90 jours ⇒ dormant', () => {
    const flow = partnerFlow(
      input({ needsReceived90d: 4, needsGiven90d: 1, lastActivityAt: '2026-01-05T09:00:00.000Z' }),
      NOW,
    )
    expect(flow.state).toBe('dormant')
  })

  it('des placements sans aucun besoin échangé ⇒ dormant (rien ne circule)', () => {
    const flow = partnerFlow(input({ placementsTotal: 5, placementsActive: 1, lastActivityAt: NOW.toISOString() }), NOW)
    expect(flow.state).toBe('dormant')
    expect(flow.counted?.missionsCompleted).toBe(4)
  })
})

describe('partnerFlow — les dérivations ne fabriquent rien', () => {
  it('« menées à terme » ne descend jamais sous zéro', () => {
    // Deux compteurs indépendants peuvent se croiser ; une soustraction nue
    // afficherait « -2 missions menées à terme ».
    const flow = partnerFlow(input({ placementsTotal: 1, placementsActive: 3 }), NOW)
    expect(flow.counted?.missionsCompleted).toBe(0)
  })

  it('la réciprocité est une PART, et elle est nulle quand rien n’a circulé', () => {
    expect(partnerFlow(input({ needsReceived90d: 3, needsGiven90d: 1 }), NOW).reciprocity).toBeCloseTo(0.75)
    // Des placements comptés mais aucun besoin échangé : 0/0 rendu « 0 % » se
    // lirait « aucune réciprocité », qui est un jugement et non une mesure.
    expect(partnerFlow(input({ placementsTotal: 4 }), NOW).reciprocity).toBeNull()
  })
})

describe('daysSinceActivity', () => {
  it('rend null sur une date absente ou illisible — jamais « aujourd’hui »', () => {
    expect(daysSinceActivity(null, NOW)).toBeNull()
    expect(daysSinceActivity('pas une date', NOW)).toBeNull()
  })

  it('une date dans le futur (horloge décalée) vaut zéro jour, jamais un négatif', () => {
    expect(daysSinceActivity('2026-12-01T00:00:00.000Z', NOW)).toBe(0)
  })

  it('compte les jours entiers écoulés', () => {
    expect(daysSinceActivity('2026-08-30T12:00:00.000Z', NOW)).toBe(5)
  })
})
