import { demoAgendaEvents } from './demo-agenda'

/**
 * PARITÉ DÉMO (craft rule n°9) — #2390.16 : la semaine de démo porte UN
 * évènement privé, réduit à son créneau « Indisponible ». Sans lui, l'écran
 * livré ne montrerait jamais le masque en réunion.
 */
describe('parité démo — évènement privé masqué', () => {
  const NOW = new Date('2026-08-18T08:00:00Z')
  const events = demoAgendaEvents(NOW)
  const busy = events.filter(e => e.busyOnly === true)

  it('la garde LIT quelque chose — la semaine porte des évènements', () => {
    expect(events.length).toBeGreaterThan(5)
  })

  it('un créneau privé existe et ne révèle RIEN que son heure', () => {
    expect(busy).toHaveLength(1)
    const [slot] = busy
    expect(slot?.start).toBeTruthy()
    expect(JSON.stringify(slot)).not.toMatch(/privé \(démo\)/)
    expect(slot?.summary).toBeNull()
    expect(slot?.attendees).toEqual([])
  })

  it('la garde sait dire NON — aucun évènement ordinaire n’est masqué', () => {
    const ordinary = events.filter(e => e.busyOnly !== true)
    expect(ordinary.length).toBeGreaterThan(5)
    expect(ordinary.some(e => e.summary !== null)).toBe(true)
  })
})
