import { roomAttendeesOf } from '@bellum/contracts'
import { demoAgendaEvents } from './demo-agenda'

/**
 * LA PARITÉ DÉMO DE LA SALLE RÉSERVÉE (#2390.9, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET CE QU'ELLE NE PROMET PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `roomAttendeesOf` (`@bellum/contracts`) lit `AgendaAttendee.resource` — un
 * invité que Google/Microsoft marquent eux-mêmes comme une SALLE, jamais un
 * lieu en texte libre deviné. Cette garde prouve que le jeu de démonstration
 * porte réellement un tel invité, et que la fonction le retrouve.
 * `AgendaGrid.tsx` (grille journalière de `/briefing`) lit ce champ depuis le
 * 29/09 (#2390.9) — voir `demo-coverage.ts` pour la preuve complète. La
 * CAPACITÉ de la salle n'est, elle, sourcée par AUCUN des deux fournisseurs
 * sur l'évènement lui-même (vérifié sur leur doc publique) : ce point reste
 * hors périmètre, documenté plutôt que deviné.
 */
describe('parité démo — salle réservée', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')

  it('la garde LIT quelque chose — la semaine porte plusieurs évènements', () => {
    expect(demoAgendaEvents(NOW).length).toBeGreaterThan(5)
  })

  it('au moins un évènement de la semaine porte un invité marqué salle', () => {
    const events = demoAgendaEvents(NOW)
    const withRoom = events.filter(event => roomAttendeesOf(event).length > 0)
    expect(withRoom.length).toBeGreaterThan(0)
  })

  it('la garde sait dire NON — un invité ordinaire n’est jamais lu comme une salle', () => {
    const events = demoAgendaEvents(NOW)
    const ordinaryAttendees = events.flatMap(event => event.attendees).filter(attendee => attendee.resource !== true)
    expect(ordinaryAttendees.length).toBeGreaterThan(0)
    expect(roomAttendeesOf({ attendees: ordinaryAttendees })).toEqual([])
  })

  it('#2390.9 — la salle de démo porte son nombre de places', () => {
    const rooms = demoAgendaEvents(NOW).flatMap(event => roomAttendeesOf(event))
    expect(rooms.some(room => typeof room.capacity === 'number' && room.capacity > 0)).toBe(true)
  })
})
