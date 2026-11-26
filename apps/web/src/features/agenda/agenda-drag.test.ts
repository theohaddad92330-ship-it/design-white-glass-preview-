import type { AgendaEvent } from '@bellum/contracts'
import {
  guestCount,
  isNoopDrag,
  MIN_DURATION_MINUTES,
  proposeDrag,
  proposeMoveAfter,
  toIsoRange,
  withStartMinutes,
} from './agenda-drag'

const BOUNDS = { fromMinutes: 8 * 60, toMinutes: 20 * 60 }
/** 14 h 00 → 15 h 00. */
const EVENT = { startMinutes: 14 * 60, endMinutes: 15 * 60 }

describe('proposeDrag — déplacer', () => {
  it('conserve la durée : c’est la promesse du geste', () => {
    const next = proposeDrag(EVENT, 'move', 60, BOUNDS)
    expect(next).toEqual({ startMinutes: 15 * 60, endMinutes: 16 * 60 })
  })

  it('aimante au quart d’heure', () => {
    // Personne ne fixe une réunion à 14 h 07, et un geste à la souris n'a pas
    // cette précision : le résultat doit être prévisible, pas pixel-exact.
    expect(proposeDrag(EVENT, 'move', 7, BOUNDS).startMinutes).toBe(14 * 60)
    expect(proposeDrag(EVENT, 'move', 8, BOUNDS).startMinutes).toBe(14 * 60 + 15)
  })

  it('ne sort pas par le haut de la grille', () => {
    // Un rendez-vous tiré au-delà du bord ne doit pas atterrir à 3 h du matin,
    // heure que l'utilisateur n'a même pas sous les yeux quand il lâche.
    const next = proposeDrag(EVENT, 'move', -10 * 60, BOUNDS)
    expect(next.startMinutes).toBe(BOUNDS.fromMinutes)
    expect(next.endMinutes - next.startMinutes).toBe(60)
  })

  it('ne RACCOURCIT pas la réunion en butant sur le bas', () => {
    // La borne s'applique au couple : rabotter la fin ferait perdre une demi-
    // heure de réunion sans que personne ne l'ait demandé.
    const next = proposeDrag(EVENT, 'move', 10 * 60, BOUNDS)
    expect(next.endMinutes).toBe(BOUNDS.toMinutes)
    expect(next.endMinutes - next.startMinutes).toBe(60)
  })
})

describe('proposeDrag — étirer', () => {
  it('ne déplace jamais le début', () => {
    // L'heure de rendez-vous est celle que les invités ont notée : étirer le bas
    // ne doit pas la changer dans leur dos.
    const next = proposeDrag(EVENT, 'resize-end', 60, BOUNDS)
    expect(next.startMinutes).toBe(EVENT.startMinutes)
    expect(next.endMinutes).toBe(16 * 60)
  })

  it('refuse de réduire en deçà de la durée minimale', () => {
    const next = proposeDrag(EVENT, 'resize-end', -10 * 60, BOUNDS)
    expect(next.endMinutes - next.startMinutes).toBe(MIN_DURATION_MINUTES)
  })

  it('ne dépasse pas le bas de la grille', () => {
    expect(proposeDrag(EVENT, 'resize-end', 10 * 60, BOUNDS).endMinutes).toBe(BOUNDS.toMinutes)
  })
})

describe('isNoopDrag', () => {
  it('reconnaît un geste qui ne change rien', () => {
    // Sans ce garde, un simple clic — capté comme un déplacement de deux pixels,
    // aimanté à zéro — ouvrirait une confirmation puis préviendrait les invités
    // d'un changement inexistant.
    expect(isNoopDrag(EVENT, proposeDrag(EVENT, 'move', 2, BOUNDS))).toBe(true)
    expect(isNoopDrag(EVENT, proposeDrag(EVENT, 'move', 30, BOUNDS))).toBe(false)
  })
})

function event(partial: Partial<AgendaEvent>): AgendaEvent {
  return {
    id: 'e1',
    summary: 'Cadrage',
    description: null,
    location: null,
    start: '2026-08-18T14:00:00.000Z',
    end: '2026-08-18T15:00:00.000Z',
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: null,
    isExternal: false,
    cancelled: false,
    ...partial,
  }
}

describe('toIsoRange', () => {
  it('garde le JOUR du rendez-vous, pas celui d’aujourd’hui', () => {
    // On peut regarder l'agenda de demain : un rendez-vous déplacé doit rester
    // le sien, pas atterrir aujourd'hui.
    const range = toIsoRange(event({ start: '2026-09-03T09:00:00.000Z' }), {
      startMinutes: 16 * 60,
      endMinutes: 17 * 60,
    })
    expect(range?.startsAt.slice(0, 10)).toBe('2026-09-03')
  })

  it('rend null quand la date d’origine est inexploitable', () => {
    // Pas de repli sur aujourd'hui : déplacer un rendez-vous dont on ne sait pas
    // le jour, c'est en créer un ailleurs.
    expect(toIsoRange(event({ start: null }), { startMinutes: 600, endMinutes: 660 })).toBeNull()
    expect(toIsoRange(event({ start: 'pas-une-date' }), { startMinutes: 600, endMinutes: 660 })).toBeNull()
  })
})

describe('guestCount', () => {
  it('compte qui recevra la notification, et combien sont externes', () => {
    const counted = guestCount(
      event({
        attendees: [
          { email: 'a@client.fr', displayName: null, responseStatus: null, external: true },
          { email: 'b@bellum.fr', displayName: null, responseStatus: null, external: false },
        ],
      }),
    )
    expect(counted).toEqual({ total: 2, external: 1 })
  })

  it('rend zéro plutôt que d’échouer quand la liste manque', () => {
    expect(guestCount(event({ attendees: [] }))).toEqual({ total: 0, external: 0 })
  })

  it('#2390.9 — une salle réservée n’est jamais comptée comme une personne prévenue', () => {
    const counted = guestCount(
      event({
        attendees: [
          { email: 'a@client.fr', displayName: null, responseStatus: null, external: true },
          {
            email: 'salle-paris-3e@bellum.fr',
            displayName: null,
            responseStatus: null,
            external: false,
            resource: true,
          },
        ],
      }),
    )
    expect(counted).toEqual({ total: 1, external: 1 })
  })

  // #2390.9 — une salle réservée (`resource: true`) n'est pas une personne qui
  // « recevra la notification » : elle ne compte ni dans le total, ni dans les
  // externes, même quand le fournisseur la marque externe.
  it('#2390.9 — ne compte jamais une salle réservée comme un invité', () => {
    const counted = guestCount(
      event({
        attendees: [
          { email: 'a@client.fr', displayName: null, responseStatus: null, external: true },
          {
            email: 'salle-paris-3e@bellum.fr',
            displayName: 'Salle Paris 3e',
            responseStatus: null,
            external: false,
            resource: true,
          },
        ],
      }),
    )
    expect(counted).toEqual({ total: 1, external: 1 })
  })
})

describe('proposeMoveAfter (#2938)', () => {
  it('propose de démarrer juste après la FIN de l’autre rendez-vous, durée conservée', () => {
    const otherEnd = new Date(2026, 8, 18, 10, 30)
    const other = event({ start: new Date(2026, 8, 18, 9, 45).toISOString(), end: otherEnd.toISOString() })
    const mine = event({
      start: new Date(2026, 8, 18, 10, 0).toISOString(),
      end: new Date(2026, 8, 18, 11, 0).toISOString(),
    })
    const expectedStart = otherEnd.getHours() * 60 + otherEnd.getMinutes()
    // La durée d'1 h de `mine` est CONSERVÉE — même promesse que `proposeDrag`.
    expect(proposeMoveAfter(mine, other)).toEqual({ startMinutes: expectedStart, endMinutes: expectedStart + 60 })
  })

  it('rend null sans date de fin exploitable, sur l’un OU l’autre rendez-vous', () => {
    expect(proposeMoveAfter(event({ end: null }), event({}))).toBeNull()
    expect(proposeMoveAfter(event({}), event({ end: null }))).toBeNull()
  })

  it('rend null si l’événement à déplacer n’a pas de durée positive', () => {
    const zeroDuration = event({ start: '2026-09-18T10:00:00.000Z', end: '2026-09-18T10:00:00.000Z' })
    expect(proposeMoveAfter(zeroDuration, event({}))).toBeNull()
  })
})

describe('withStartMinutes — le créneau HORS GRILLE (#2938)', () => {
  const proposal = { startMinutes: 10 * 60, endMinutes: 11 * 60 }

  it('déplace le départ à l’heure tapée, la durée conservée — même promesse que proposeDrag', () => {
    expect(withStartMinutes(proposal, 14 * 60 + 30)).toEqual({ startMinutes: 14 * 60 + 30, endMinutes: 15 * 60 + 30 })
  })

  it('ne descend jamais sous minuit', () => {
    expect(withStartMinutes(proposal, -30)).toEqual({ startMinutes: 0, endMinutes: 60 })
  })

  it('ne pousse jamais la fin au-delà du jour', () => {
    expect(withStartMinutes(proposal, 23 * 60 + 45)).toEqual({ startMinutes: 23 * 60, endMinutes: 24 * 60 })
  })
})

// Théo A today-agenda.A2 — reprogrammer par une modale : le JOUR aussi se change.
describe('toIsoRange — jour choisi dans la modale', () => {
  const base = event({
    start: new Date(2026, 9, 22, 14, 0).toISOString(),
    end: new Date(2026, 9, 22, 15, 0).toISOString(),
  })

  it('garde le jour de l’évènement quand aucun jour n’est choisi', () => {
    const range = toIsoRange(base, { startMinutes: 15 * 60, endMinutes: 16 * 60 })
    expect(new Date(range!.startsAt).getDate()).toBe(22)
  })

  it('pose le rendez-vous sur le jour choisi, heure et durée conservées', () => {
    const range = toIsoRange(base, { startMinutes: 15 * 60, endMinutes: 16 * 60, date: '2026-10-26' })
    const start = new Date(range!.startsAt)
    expect(start.getDate()).toBe(26)
    expect(start.getHours()).toBe(15)
    expect(new Date(range!.endsAt).getHours()).toBe(16)
  })
})
