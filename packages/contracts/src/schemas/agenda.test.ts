import { describe, expect, it } from 'vitest'
import type { AgendaEvent } from './agenda.js'
import {
  AGENDA_EVENT_STATUSES,
  agendaEventDraftSchema,
  agendaEventSchema,
  AGENDA_OBJECT_KINDS,
  agendaEventStatusSchema,
  agendaRangeRequestSchema,
  classifyAgendaObject,
  freeSlotsRequestSchema,
  hasMeetingInProgress,
  isConfirmedAgendaEvent,
  isOwnerUnavailable,
  normalizeAgendaEventStatus,
  normalizeAgendaEventVisibility,
  personAttendeesOf,
  roomAttendeesOf,
  roomCapacityShortfalls,
} from './agenda.js'

/** Un évènement d'agenda minimal, complété par les champs que le test fait varier. */
function event(overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id: 'evt-1',
    summary: 'RDV',
    description: null,
    location: null,
    start: '2026-09-27T14:00:00.000Z',
    end: '2026-09-27T15:00:00.000Z',
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...overrides,
  }
}

describe('isOwnerUnavailable — #2390.6', () => {
  it('lit outOfOffice (Google)', () => {
    expect(isOwnerUnavailable({ providerEventType: 'outOfOffice', showAs: null })).toBe(true)
  })

  it('lit oof (Microsoft)', () => {
    expect(isOwnerUnavailable({ providerEventType: null, showAs: 'oof' })).toBe(true)
  })

  it('ne devine jamais à la hausse — tout autre couple reste disponible', () => {
    expect(isOwnerUnavailable({ providerEventType: 'default', showAs: 'busy' })).toBe(false)
    expect(isOwnerUnavailable({ providerEventType: null, showAs: null })).toBe(false)
    expect(isOwnerUnavailable({ providerEventType: undefined, showAs: undefined })).toBe(false)
  })
})

describe('roomAttendeesOf — #2390.9', () => {
  const attendee = (overrides: Partial<AgendaEvent['attendees'][number]> = {}): AgendaEvent['attendees'][number] => ({
    email: 'a@bellum.fr',
    displayName: null,
    responseStatus: null,
    external: false,
    ...overrides,
  })

  it('rend les invités marqués ressource, et eux seuls', () => {
    const rooms = roomAttendeesOf(
      event({
        attendees: [
          attendee({ email: 'j.dupont@bellum.fr' }),
          attendee({ email: 'salle-paris-3e@bellum.fr', resource: true }),
        ],
      }),
    )
    expect(rooms.map(room => room.email)).toEqual(['salle-paris-3e@bellum.fr'])
  })

  it('ne devine jamais une salle — sans le champ, personne n’est une salle', () => {
    expect(roomAttendeesOf(event({ attendees: [attendee({ email: 'salle@bellum.fr' })] }))).toEqual([])
  })

  it('personAttendeesOf exclut les salles — une salle n’est jamais comptée comme une personne invitée', () => {
    const persons = personAttendeesOf(
      event({
        attendees: [
          attendee({ email: 'j.dupont@bellum.fr' }),
          attendee({ email: 'salle-paris-3e@bellum.fr', resource: true }),
        ],
      }),
    )
    expect(persons.map(person => person.email)).toEqual(['j.dupont@bellum.fr'])
  })

  it('personAttendeesOf garde tout le monde quand personne n’est marqué ressource', () => {
    const attendees = [attendee({ email: 'a@bellum.fr' }), attendee({ email: 'b@bellum.fr' })]
    expect(personAttendeesOf(event({ attendees }))).toEqual(attendees)
  })
})

describe('agendaEventStatusSchema — une énumération FERMÉE', () => {
  it('accepte les trois états connus', () => {
    for (const value of ['confirmed', 'tentative', 'cancelled'] as const) {
      expect(agendaEventStatusSchema.parse(value)).toBe(value)
    }
  })

  it('accepte `unknown` — c’est la lecture des lignes héritées', () => {
    expect(agendaEventStatusSchema.parse('unknown')).toBe('unknown')
  })

  it('REFUSE une valeur hors énumération', () => {
    expect(() => agendaEventStatusSchema.parse('needsAction')).toThrow()
    expect(() => agendaEventStatusSchema.parse('')).toThrow()
  })

  it('n’a pas de doublon', () => {
    expect(new Set(AGENDA_EVENT_STATUSES).size).toBe(AGENDA_EVENT_STATUSES.length)
  })
})

describe('normalizeAgendaEventStatus — lit une valeur brute sans planter', () => {
  it('reconnaît les trois valeurs que les fournisseurs rendent réellement', () => {
    expect(normalizeAgendaEventStatus('confirmed')).toBe('confirmed')
    expect(normalizeAgendaEventStatus('tentative')).toBe('tentative')
    expect(normalizeAgendaEventStatus('cancelled')).toBe('cancelled')
  })

  it('lit une ligne héritée (chaîne libre inconnue) comme `unknown` — jamais `confirmed`', () => {
    // C'est exactement la forme du champ avant cette énumération :
    // `status: z.string().nullable()` laissait passer n'importe quoi.
    expect(normalizeAgendaEventStatus('needsAction')).toBe('unknown')
    expect(normalizeAgendaEventStatus('en attente')).toBe('unknown')
  })

  it('lit `null` et `undefined` comme `unknown`, jamais `confirmed` par défaut', () => {
    expect(normalizeAgendaEventStatus(null)).toBe('unknown')
    expect(normalizeAgendaEventStatus(undefined)).toBe('unknown')
  })
})

describe('isConfirmedAgendaEvent — seul le CONFIRMÉ compte comme un rendez-vous fixé', () => {
  it('rend `true` uniquement sur `confirmed`', () => {
    expect(isConfirmedAgendaEvent('confirmed')).toBe(true)
  })

  it('rend `false` sur un créneau PROPOSÉ — ne pas confondre proposition et engagement', () => {
    expect(isConfirmedAgendaEvent('tentative')).toBe(false)
  })

  it('rend `false` sur un rendez-vous annulé', () => {
    expect(isConfirmedAgendaEvent('cancelled')).toBe(false)
  })

  it('rend `false` sur une ligne héritée ou absente — ne JAMAIS gonfler l’activité sur de l’inconnu', () => {
    expect(isConfirmedAgendaEvent('needsAction')).toBe(false)
    expect(isConfirmedAgendaEvent(null)).toBe(false)
    expect(isConfirmedAgendaEvent(undefined)).toBe(false)
  })
})

describe('hasMeetingInProgress — #2403.13, la variante conforme au synced agenda', () => {
  const NOW = new Date('2026-09-27T14:30:00.000Z')

  it('rend `true` quand `now` tombe entre le début et la fin d’un rendez-vous CONFIRMÉ', () => {
    expect(hasMeetingInProgress([event()], NOW)).toBe(true)
  })

  it('rend `false` avant le début ou après la fin — un rendez-vous fini ne fait plus taire Laura', () => {
    const before = new Date('2026-09-27T13:59:00.000Z')
    const after = new Date('2026-09-27T15:01:00.000Z')
    expect(hasMeetingInProgress([event()], before)).toBe(false)
    expect(hasMeetingInProgress([event()], after)).toBe(false)
  })

  it('ignore un rendez-vous PROPOSÉ (tentative) — pas encore un engagement pris', () => {
    expect(hasMeetingInProgress([event({ status: 'tentative' })], NOW)).toBe(false)
  })

  it('ignore un rendez-vous ANNULÉ, même au statut brut confirmé', () => {
    expect(hasMeetingInProgress([event({ cancelled: true })], NOW)).toBe(false)
  })

  it('ignore un évènement sans date lisible — « imminent » ne se devine pas', () => {
    expect(hasMeetingInProgress([event({ start: null, end: null })], NOW)).toBe(false)
    expect(hasMeetingInProgress([event({ start: 'pas une date' })], NOW)).toBe(false)
  })

  it('rend `false` sur une liste vide — aucun agenda synchronisé n’invente pas une réunion', () => {
    expect(hasMeetingInProgress([], NOW)).toBe(false)
  })

  it('rend `true` dès qu’UN évènement parmi plusieurs est en cours', () => {
    const events = [event({ id: 'past', start: '2026-09-27T09:00:00.000Z', end: '2026-09-27T10:00:00.000Z' }), event()]
    expect(hasMeetingInProgress(events, NOW)).toBe(true)
  })
})

// #2319.10 / #2319.18 — la confidentialité, normalisée depuis DEUX fournisseurs
// qui ne parlent pas le même vocabulaire : Google (`visibility`) ne connaît pas
// `personal`, Microsoft (`sensitivity`) si. `private` n'atteint jamais cette
// fonction : `isPrivateAgendaEvent` l'a déjà exclu de la synchronisation.
describe('normalizeAgendaEventVisibility — lit deux vocabulaires fournisseur sans les mélanger', () => {
  it('reconnaît CONFIDENTIAL chez les deux fournisseurs', () => {
    expect(normalizeAgendaEventVisibility('confidential')).toBe('confidential')
  })

  it('reconnaît PERSONAL — un rendez-vous chez le dentiste, distinct d’un point interne', () => {
    expect(normalizeAgendaEventVisibility('personal')).toBe('personal')
  })

  it('lit le NORMAL des deux fournisseurs (`default`/`public` chez Google, `normal` chez Microsoft) comme `normal`', () => {
    expect(normalizeAgendaEventVisibility('default')).toBe('normal')
    expect(normalizeAgendaEventVisibility('public')).toBe('normal')
    expect(normalizeAgendaEventVisibility('normal')).toBe('normal')
  })

  it('lit `null`/`undefined`/une valeur imprévue comme `normal` — jamais une confidentialité inventée à la hausse', () => {
    expect(normalizeAgendaEventVisibility(null)).toBe('normal')
    expect(normalizeAgendaEventVisibility(undefined)).toBe('normal')
    expect(normalizeAgendaEventVisibility('recurring')).toBe('normal')
  })
})

/** Un brouillon minimal valide, pour ne faire varier qu'un seul champ par test. */
function baseDraft() {
  return {
    summary: 'Point ACME',
    startsAt: '2026-10-01T09:00:00Z',
    endsAt: '2026-10-01T09:30:00Z',
  }
}

describe('agendaEventDraftSchema — calendarId (#2101.27, calendrier cible)', () => {
  it('accepte un brouillon SANS calendarId — le comportement historique (agenda par défaut)', () => {
    const parsed = agendaEventDraftSchema.parse(baseDraft())
    expect(parsed.calendarId).toBeUndefined()
  })

  it('accepte un identifiant de calendrier explicite, opaque chez le fournisseur', () => {
    const parsed = agendaEventDraftSchema.parse({ ...baseDraft(), calendarId: 'team-shared@group.calendar.google.com' })
    expect(parsed.calendarId).toBe('team-shared@group.calendar.google.com')
  })

  it('REFUSE une chaîne vide — un calendrier « choisi » ne peut pas être rien', () => {
    expect(() => agendaEventDraftSchema.parse({ ...baseDraft(), calendarId: '' })).toThrow()
  })
})

describe('agendaEventDraftSchema — recurrence (#2101.26, RRULE)', () => {
  it('accepte un brouillon SANS recurrence — le comportement historique (évènement unique)', () => {
    const parsed = agendaEventDraftSchema.parse(baseDraft())
    expect(parsed.recurrence).toBeUndefined()
  })

  it('accepte une RRULE hebdomadaire, dans la forme RFC 5545 exacte attendue par Google', () => {
    const parsed = agendaEventDraftSchema.parse({ ...baseDraft(), recurrence: 'RRULE:FREQ=WEEKLY;COUNT=5' })
    expect(parsed.recurrence).toBe('RRULE:FREQ=WEEKLY;COUNT=5')
  })

  it('REFUSE une chaîne qui ne commence pas par `RRULE:FREQ=` — un contrat non vérifiable ne se devine pas', () => {
    expect(() => agendaEventDraftSchema.parse({ ...baseDraft(), recurrence: 'every week' })).toThrow()
    expect(() => agendaEventDraftSchema.parse({ ...baseDraft(), recurrence: 'FREQ=WEEKLY' })).toThrow()
  })
})

describe('agendaEventSchema — createdByBellum (#2770, #2101.19/.21/.22/.37)', () => {
  it('accepte un évènement SANS le champ — comportement historique (rien calculé encore)', () => {
    const parsed = agendaEventSchema.parse(event())
    expect(parsed.createdByBellum).toBeUndefined()
  })

  it('accepte le champ à `true` ou `false` — jamais autre chose qu’un booléen', () => {
    expect(agendaEventSchema.parse(event({ createdByBellum: true })).createdByBellum).toBe(true)
    expect(agendaEventSchema.parse(event({ createdByBellum: false })).createdByBellum).toBe(false)
  })
})

describe('freeSlotsRequestSchema — ce que Laura envoie réellement (#2770, recette Y9)', () => {
  // Le plan de journée / de semaine lit les trous dès 5 minutes, avec les
  // bornes du jour LOCAL (`2026-10-05T00:00:00+02:00`). Le contrat refusait
  // les deux : 400 à chaque lecture, et Laura disait « l'agenda n'a pas
  // répondu » sur un agenda parfaitement connecté.
  it('accepte une durée de 5 minutes et un décalage horaire explicite', () => {
    const parsed = freeSlotsRequestSchema.parse({
      from: '2026-10-05T00:00:00+02:00',
      to: '2026-10-06T00:00:00+02:00',
      durationMinutes: 5,
      limit: 50,
    })
    expect(parsed.durationMinutes).toBe(5)
  })

  it('SAIT DIRE NON : en dessous de 5 minutes ou une date illisible', () => {
    expect(freeSlotsRequestSchema.safeParse({ durationMinutes: 4 }).success).toBe(false)
    expect(freeSlotsRequestSchema.safeParse({ from: 'demain' }).success).toBe(false)
  })
})

describe('roomCapacityShortfalls — #2390.9, capacité de salle insuffisante', () => {
  const attendee = (overrides: Partial<AgendaEvent['attendees'][number]> = {}): AgendaEvent['attendees'][number] => ({
    email: 'a@bellum.fr',
    displayName: null,
    responseStatus: null,
    external: false,
    ...overrides,
  })
  const room = (capacity?: number) =>
    attendee({
      email: 'salle@bellum.fr',
      resource: true,
      ...(capacity === undefined ? {} : { capacity }),
    })
  const people = (n: number) => Array.from({ length: n }, (_, i) => attendee({ email: `p${i}@bellum.fr` }))

  it('signale une salle dont les places sont inférieures au nombre de personnes (organisateur compris)', () => {
    const result = roomCapacityShortfalls(event({ organizer: 'orga@bellum.fr', attendees: [...people(4), room(4)] }))
    expect(result).toEqual([{ room: expect.objectContaining({ email: 'salle@bellum.fr' }), capacity: 4, people: 5 }])
  })

  it('ne compte pas l’organisateur deux fois quand il figure déjà parmi les invités', () => {
    const attendees = [attendee({ email: 'orga@bellum.fr' }), ...people(3), room(4)]
    expect(roomCapacityShortfalls(event({ organizer: 'ORGA@bellum.fr', attendees }))).toEqual([])
  })

  it('ne dit RIEN quand la capacité est inconnue — jamais traitée comme 0', () => {
    expect(roomCapacityShortfalls(event({ attendees: [...people(10), room()] }))).toEqual([])
  })

  it('ne dit rien quand la salle suffit', () => {
    expect(roomCapacityShortfalls(event({ attendees: [...people(2), room(8)] }))).toEqual([])
  })
})

describe("classifyAgendaObject — #2390.1, les 11 natures d'objet calendrier", () => {
  const person = (external: boolean) => ({ email: 'a@x.fr', displayName: null, responseStatus: null, external })

  it('nomme exactement 11 natures', () => {
    expect(AGENDA_OBJECT_KINDS).toHaveLength(11)
  })

  it('classe chaque nature depuis les seuls champs que le fournisseur rend', () => {
    expect(classifyAgendaObject(event({ busyOnly: true }))).toBe('private_busy')
    expect(classifyAgendaObject(event({ cancelled: true }))).toBe('cancelled')
    expect(classifyAgendaObject(event({ providerEventType: 'outOfOffice' }))).toBe('out_of_office')
    expect(classifyAgendaObject(event({ showAs: 'oof' }))).toBe('out_of_office')
    expect(classifyAgendaObject(event({ providerEventType: 'focusTime' }))).toBe('focus_time')
    expect(classifyAgendaObject(event({ providerEventType: 'workingLocation' }))).toBe('working_location')
    expect(classifyAgendaObject(event({ providerEventType: 'birthday' }))).toBe('birthday')
    expect(classifyAgendaObject(event({ providerEventType: ['from', 'Gmail'].join('') }))).toBe('email_event')
    expect(classifyAgendaObject(event({ status: 'tentative' }))).toBe('proposed')
    expect(classifyAgendaObject(event({ status: 'confirmed', isExternal: true, attendees: [person(true)] }))).toBe(
      'external_meeting',
    )
    expect(classifyAgendaObject(event({ status: 'confirmed', isExternal: false, attendees: [person(false)] }))).toBe(
      'internal_meeting',
    )
    expect(classifyAgendaObject(event({ status: 'confirmed' }))).toBe('personal_block')
  })

  it("un créneau masqué reste masqué : rien d'autre n'est lu dessus", () => {
    expect(classifyAgendaObject(event({ busyOnly: true, isExternal: true, providerEventType: 'focusTime' }))).toBe(
      'private_busy',
    )
  })

  it("une salle seule n'est pas une réunion : sans personne invitée, c'est un bloc personnel", () => {
    const room = { email: 'salle@x.fr', displayName: 'Salle', responseStatus: null, external: false, resource: true }
    expect(classifyAgendaObject(event({ status: 'confirmed', attendees: [room] }))).toBe('personal_block')
  })

  it('un statut illisible ne se lit jamais « proposé » ni « externe » par défaut', () => {
    expect(classifyAgendaObject(event({ status: null }))).toBe('personal_block')
  })
})

describe('agendaRangeRequestSchema — #4064, une fenêtre écrite avec son fuseau', () => {
  // Laura écrit l'heure de Paris (`+02:00`) : le contrat ne lisait que `Z`, le
  // pont répondait 400 et l'outil disait « ton agenda n'a pas répondu ».
  it('accepte une borne avec décalage horaire', () => {
    const parsed = agendaRangeRequestSchema.safeParse({
      from: '2026-07-12T00:00:00+02:00',
      to: '2026-10-12T23:59:59+02:00',
    })
    expect(parsed.success).toBe(true)
  })

  it('accepte toujours une borne en UTC', () => {
    expect(agendaRangeRequestSchema.safeParse({ from: '2026-07-12T00:00:00Z' }).success).toBe(true)
  })

  it('refuse toujours une date illisible', () => {
    expect(agendaRangeRequestSchema.safeParse({ from: 'le 12 juillet' }).success).toBe(false)
  })
})
