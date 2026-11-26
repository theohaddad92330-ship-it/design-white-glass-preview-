import { normalizeAgendaEventVisibility } from '@bellum/contracts'
import { demoAgendaEvents } from './demo-agenda'

/**
 * LA PARITÉ DÉMO DE LA CONFIDENTIALITÉ (#2319.10, #2319.18, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement au statut `tentative` (voir `demo-agenda-status-coverage.spec.ts`,
 * qui ne prétend rien voir à l'écran faute de lecteur), `visibility` a un
 * lecteur RÉEL côté web : `MeetingPrepDialog.tsx` appelle
 * `isConfidentialAgendaEvent` / `isPersonalAgendaEvent`
 * (`apps/web/src/features/agenda/meeting-account-match.ts`). Une salle qui ne
 * semait ni CONFIDENTIEL ni PERSONNEL montrerait donc les deux capacités
 * livrées, mais jamais devant un prospect.
 */
describe('parité démo — confidentialité et réunion personnelle', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')

  it('la garde LIT quelque chose — la semaine porte plusieurs évènements', () => {
    expect(demoAgendaEvents(NOW).length).toBeGreaterThan(5)
  })

  it('au moins un évènement de la semaine est CONFIDENTIEL', () => {
    const events = demoAgendaEvents(NOW)
    const confidential = events.filter(event => normalizeAgendaEventVisibility(event.visibility) === 'confidential')
    expect(confidential.length).toBeGreaterThan(0)
  })

  it('au moins un évènement de la semaine est PERSONNEL, et distinct d’un point interne', () => {
    const events = demoAgendaEvents(NOW)
    const personal = events.filter(event => normalizeAgendaEventVisibility(event.visibility) === 'personal')
    expect(personal.length).toBeGreaterThan(0)
    // #2319.18 — la distinction n'a de sens que si l'évènement personnel n'a
    // PAS d'invité externe : sinon rien ne le distingue d'un rendez-vous
    // client normal aux yeux du rattachement.
    for (const event of personal) expect(event.attendees.some(attendee => attendee.external)).toBe(false)
  })

  it('au moins un évènement reste NORMAL — sinon la démo ne montre plus l’état majoritaire', () => {
    const events = demoAgendaEvents(NOW)
    const normal = events.filter(event => normalizeAgendaEventVisibility(event.visibility) === 'normal')
    expect(normal.length).toBeGreaterThan(0)
  })

  it('la garde sait dire NON — une valeur qui n’est ni confidentielle ni personnelle est vue comme NORMALE', () => {
    expect(normalizeAgendaEventVisibility('default')).toBe('normal')
    expect(normalizeAgendaEventVisibility(null)).toBe('normal')
  })
})
