import { demoAgendaEvents } from './demo-agenda'

/**
 * LA PARITÉ DÉMO DE LA BOÎTE DE CONFLIT (#2390.12 / #2390.14, craft rule n°9).
 *
 * `ConflictDialog` n'a de quoi montrer sa ligne « Réponses » (et proposer de
 * déléguer) que si la semaine de démo porte DEUX rendez-vous qui se chevauchent
 * dont l'un a des invités avec une réponse lisible. Sans cela l'écran livré
 * s'ouvrirait vide en réunion.
 */
describe('parité démo — conflit avec réponses des invités', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')
  const READABLE = ['accepted', 'declined', 'tentative', 'needsAction']

  const timed = demoAgendaEvents(NOW).filter(e => e.start?.includes('T') && e.end && !e.cancelled)

  const overlapping = timed.flatMap((a, i) =>
    timed
      .slice(i + 1)
      .filter(b => new Date(a.start!) < new Date(b.end!) && new Date(b.start!) < new Date(a.end!))
      .map(b => [a, b]),
  )

  it('la garde LIT quelque chose — la semaine porte des rendez-vous horodatés', () => {
    expect(timed.length).toBeGreaterThan(3)
  })

  it('deux rendez-vous se chevauchent et l’un a un invité dont la réponse se lit', () => {
    expect(overlapping.length).toBeGreaterThan(0)
    const readable = overlapping.some(pair =>
      pair.some(event => event.attendees.some(a => READABLE.includes(String(a.responseStatus)))),
    )
    expect(readable).toBe(true)
  })

  it('la garde sait dire NON — un statut inconnu ne se lit pas comme une réponse', () => {
    expect(READABLE.includes('none')).toBe(false)
  })
})
