import { detectConflicts } from '../agenda/free-slots'
import { demoAgendaCalendars, demoAgendaEvents, demoAgendaWindow } from './demo-agenda'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

// Décision Louis 04/10/2026 — le rendez-vous de livraison invite une VRAIE personne
// du brief SNCF (coordonnées en clair) : seules ces adresses-là, semées, sortent du `.example`.
const DELIVERY_REAL_ADDRESSES = new Set(
  DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.email).filter((email): email is string => Boolean(email)),
)

/**
 * La règle de parité démo veut qu'une fonctionnalité livrée soit AUSSI remplie
 * en démonstration. Les vues jour/semaine et le choix multiple d'agendas sont
 * précisément ce qu'on montre à un prospect : un écran d'agenda vide devant lui
 * se découvre en réunion, pas en CI.
 */
describe('démo — agenda', () => {
  // Un mardi, en milieu de matinée.
  const NOW = new Date('2026-08-18T08:00:00Z')

  it('remplit la SEMAINE, pas seulement les prochaines heures', () => {
    // La vue « Semaine » est ce qu'on veut montrer ; une semaine avec deux
    // rendez-vous ne démontre rien.
    const week = demoAgendaWindow({
      now: NOW,
      from: new Date(NOW.getTime() - 12 * 3600_000),
      to: new Date(NOW.getTime() + 6 * 86400_000),
      calendarIds: null,
    })

    expect(week.length).toBeGreaterThanOrEqual(8)
    const days = new Set(week.map(event => (event.start ?? '').slice(0, 10)))
    expect(days.size).toBeGreaterThanOrEqual(4)
  })

  it('n’expose que des adresses et des liens visiblement fictifs', () => {
    // RFC 2606 : `.example` n'est attribuable à personne, et aucun de ces liens
    // ne peut atteindre une vraie salle de visioconférence.
    for (const event of demoAgendaEvents(NOW)) {
      for (const address of [event.organizer, ...event.attendees.map(guest => guest.email)]) {
        if (address) expect(address.endsWith('.example') || DELIVERY_REAL_ADDRESSES.has(address)).toBe(true)
      }
      if (event.conferenceUrl) expect(event.conferenceUrl).toMatch(/^https:\/\/meet\.example\//)
    }
  })

  it('date les rendez-vous à partir de la visite, pas d’un jour figé', () => {
    // Un jeu figé afficherait « réunion du 18 août » à un prospect de novembre.
    const later = new Date(NOW.getTime() + 30 * 86400_000)
    const first = demoAgendaEvents(NOW)[0]?.start
    const second = demoAgendaEvents(later)[0]?.start

    expect(first).not.toEqual(second)
  })

  it('propose plusieurs agendas, dont un qu’on ne veut PAS voir dans sa journée', () => {
    // « Jours fériés » est l'argument même de la sélection multiple.
    const names = demoAgendaCalendars().map(calendar => calendar.name)

    expect(names.length).toBeGreaterThanOrEqual(3)
    expect(names.some(name => /férié/i.test(name))).toBe(true)
  })

  it('un agenda décoché ne remonte pas — sinon la démonstration se contredit', () => {
    const range = {
      now: NOW,
      from: new Date(NOW.getTime() - 12 * 3600_000),
      to: new Date(NOW.getTime() + 6 * 86400_000),
    }
    const all = demoAgendaWindow({ ...range, calendarIds: null })
    const clientsOnly = demoAgendaWindow({ ...range, calendarIds: ['demo-cal-clients'] })

    expect(clientsOnly.length).toBeGreaterThan(0)
    expect(clientsOnly.length).toBeLessThan(all.length)
  })

  it('aucun agenda de démonstration n’autorise l’écriture', () => {
    // Un évènement créé depuis une démonstration atterrirait dans l'agenda de
    // l'opérateur, avec les invités que le visiteur aurait tapés.
    expect(demoAgendaCalendars().every(calendar => calendar.canWrite === false)).toBe(true)
  })

  it('porte un rendez-vous en cours ET un chevauchement — les deux mécaniques à montrer', () => {
    const events = demoAgendaEvents(NOW)
    const overlapping = events.filter(event => /verdal|pharmatek/i.test(event.summary ?? ''))

    expect(overlapping.length).toBeGreaterThanOrEqual(2)
    expect(events.some(event => event.conferenceUrl)).toBe(true)
    expect(events.some(event => !event.start?.includes('T'))).toBe(true)
  })

  /**
   * #2938 — la fenêtre de conflit (Déplacer / Prévenir / Replanifier, #2102)
   * n'est démontrable QUE si `detectConflicts` — le même calcul que la
   * production, `agenda.service.ts:644` — trouve vraiment deux évènements qui
   * se chevauchent dans ce jeu. Le test au-dessus ne vérifie que leurs NOMS
   * (deux évènements « verdal »/« pharmatek »), pas leurs horaires : il
   * passerait encore si un futur lot les décalait l'un après l'autre. Celui-ci
   * prouve le chevauchement lui-même, avec la fonction qui sert l'écran.
   */
  it('le chevauchement Verdal/Pharmatek est un CONFLIT détecté par le calcul de production (#2938)', () => {
    const conflicts = detectConflicts(
      demoAgendaWindow({ now: NOW, from: NOW, to: new Date(NOW.getTime() + 7 * 86400_000), calendarIds: null }),
    )
    const namesOf = (pair: (typeof conflicts)[number]) => [pair.first.summary, pair.second.summary].join(' / ')

    expect(conflicts.some(pair => /verdal/i.test(namesOf(pair)) && /pharmatek/i.test(namesOf(pair)))).toBe(true)
  })

  it('porte un rendez-vous ANNULÉ, nommé plutôt que simplement filtré (#2103.27)', () => {
    const cancelled = demoAgendaEvents(NOW).find(event => event.id === 'demo-event-annule')

    expect(cancelled?.cancelled).toBe(true)
  })

  // E25 (recette démo 04/10) — « Actualisé à 20:54 » / « Rendez-vous à 22:54 » sur le brief n'est PAS un
  // décalage de fuseau : le rendez-vous NOVA est semé à « maintenant + 2 h » (UTC absolu, formaté dans le
  // fuseau du navigateur des deux côtés). Ce test dit NON à un changement qui le semerait en heure locale lue UTC.
  it('le rendez-vous NOVA démarre exactement 2 h après la visite, en instant absolu (pas un décalage de fuseau)', () => {
    const nova = demoAgendaEvents(NOW).find(event => event.id === 'demo-event-nova')

    expect(new Date(nova?.start ?? '').getTime() - NOW.getTime()).toBe(2 * 3600_000)
  })

  // #2985 — le pré-brief affiche « récurrent » : il faut un évènement récurrent qui offre
  // « Préparer le rendez-vous » (compte rattaché, donc le rendez-vous SNCF, pas le point interne).
  it('#2985 le rendez-vous préparable (SNCF) est récurrent', () => {
    const events = demoAgendaEvents(NOW)
    const preparable = events.find(event => event.id === 'demo-event-nova')
    expect(preparable?.summary).toContain('SNCF')
    expect(preparable?.recurring).toBe(true)
    // la garde sait dire NON : un évènement ordinaire n'est pas récurrent
    expect(events.find(event => event.id === 'demo-event-verdal')?.recurring).toBeFalsy()
  })
})
