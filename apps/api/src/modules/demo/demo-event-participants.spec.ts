import { DEMO_ACTIVITIES, DEMO_EVENT_PARTICIPANTS } from './demo-dataset'
import { DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE } from './demo-coverage'

/**
 * #2974 (recette prod 02/10) — le sélecteur « Événement » de la source
 * « Participants d'un événement » ne s'affichait jamais en démo : aucune
 * réunion de la salle ne nommait un contact. Les réunions et appels qui ont un
 * contact portent désormais ce contact comme participant, pour que le
 * sélecteur liste de vrais événements (jamais un événement sans personne).
 */
describe('participants d’événement de démo (#2974)', () => {
  it('au moins une réunion ou un appel de la salle nomme un contact participant', () => {
    expect(DEMO_EVENT_PARTICIPANTS.length).toBeGreaterThan(0)
  })

  it('chaque participant vient d’une réunion ou d’un appel qui porte ce contact, jamais d’un autre échange', () => {
    for (const participant of DEMO_EVENT_PARTICIPANTS) {
      const activity = DEMO_ACTIVITIES[participant.activityIndex]
      expect(['meeting', 'call']).toContain(activity.kind)
      expect(activity.contact).toBe(participant.contact)
    }
  })

  it('un seul participant par événement et par contact (pas de doublon)', () => {
    const keys = DEMO_EVENT_PARTICIPANTS.map(p => `${p.activityIndex}:${p.contact}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('la classification ne dit plus que le sélecteur d’événements est vide en démo', () => {
    const reason = DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE.reason
    expect(reason).toContain('#2380.11')
    expect(reason).not.toContain('aucun participant d’événement n’est résolu en contact')
    expect(reason).not.toContain('Aucun événement avec des participants identifiés')
  })
})
