import { demoAgendaEvents } from './demo-agenda'

/**
 * LA PARITÉ DÉMO DE L'IMPORTANCE D'UN CONFLIT (#2102.4, craft rule n°9).
 *
 * `ConflictDialog` dérive l'importance du TYPE de réunion (`isExternal` : client vs interne). La ligne
 * « le rendez-vous client pèse davantage » n'a de quoi se montrer que si la semaine de démo porte un
 * conflit entre UN rendez-vous client et UN point interne. Le conflit Verdal/Pharmatek est client/client :
 * il ne montre que le cas « même type ».
 */
describe('parité démo — conflit client / interne (#2102.4)', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')
  const timed = demoAgendaEvents(NOW).filter(e => e.start?.includes('T') && e.end && !e.cancelled)
  const overlaps = (a: (typeof timed)[number], b: (typeof timed)[number]) =>
    new Date(a.start!) < new Date(b.end!) && new Date(b.start!) < new Date(a.end!)
  const pairs = timed.flatMap((a, i) =>
    timed
      .slice(i + 1)
      .filter(b => overlaps(a, b))
      .map(b => [a, b] as const),
  )

  it('un rendez-vous client et un point interne se chevauchent', () => {
    expect(pairs.some(([a, b]) => a.isExternal !== b.isExternal)).toBe(true)
  })

  it('le conflit client/client existant reste là : le cas « même type » se voit aussi', () => {
    expect(pairs.some(([a, b]) => a.isExternal && b.isExternal)).toBe(true)
  })

  it('la garde sait dire NON — deux rendez-vous disjoints ne sont pas un conflit', () => {
    const [first, second] = timed
    expect(overlaps({ ...first!, end: first!.start }, second!)).toBe(false)
  })
})
