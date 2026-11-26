import type { AgendaConflict, AgendaEvent } from '@bellum/contracts'
import { resolveOverlap } from './conflict-resolution'

/**
 * #2390.11 / #2390.12 (LAU-FINAL-104) — DES OPTIONS CONCRÈTES, PAS UN CONSTAT.
 *
 * `agendaConflictSchema` porte deux rendez-vous qui se chevauchent, mais
 * aucun code n'en tirait d'action : `ConflictDialog` se contentait de les
 * montrer (#2102.1/.2). Cette fonction calcule les résolutions qui ne
 * demandent RIEN d'autre que les horaires déjà connus des deux évènements —
 * jamais une durée de trajet, une salle ou une disponibilité inventée
 * (doctrine « jamais de donnée fictive »).
 *
 * `detectConflicts` (`free-slots.ts`) garantit `first` trié avant `second`
 * (`first.start <= second.start`) et un chevauchement réel
 * (`second.start < first.end`) : les tests ci-dessous s'appuient sur cette
 * garantie plutôt que de la redémontrer.
 */
function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
  return {
    summary: 'Point client',
    description: null,
    location: null,
    start: null,
    end: null,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
    ...partial,
  }
}

function conflict(first: AgendaEvent, second: AgendaEvent, overlapMinutes = 15): AgendaConflict {
  return { first, second, overlapMinutes }
}

describe('resolveOverlap — chevauchement partiel', () => {
  // 9h-10h / 9h45-10h45 : 15 min de chevauchement.
  const first = event({ id: 'e1', start: '2026-09-28T09:00:00.000Z', end: '2026-09-28T10:00:00.000Z' })
  const second = event({ id: 'e2', start: '2026-09-28T09:45:00.000Z', end: '2026-09-28T10:45:00.000Z' })

  it('propose de décaler le second juste après la fin du premier, durée inchangée', () => {
    const options = resolveOverlap(conflict(first, second))
    const moveSecond = options.find(o => o.kind === 'moveSecond')
    expect(moveSecond).toEqual({
      kind: 'moveSecond',
      eventId: 'e2',
      startsAt: '2026-09-28T10:00:00.000Z',
      endsAt: '2026-09-28T11:00:00.000Z',
    })
  })

  it('propose de décaler le premier juste après la fin du second, durée inchangée', () => {
    const options = resolveOverlap(conflict(first, second))
    const moveFirst = options.find(o => o.kind === 'moveFirst')
    expect(moveFirst).toEqual({
      kind: 'moveFirst',
      eventId: 'e1',
      startsAt: '2026-09-28T10:45:00.000Z',
      endsAt: '2026-09-28T11:45:00.000Z',
    })
  })

  it('propose de raccourcir le premier jusqu’au début du second', () => {
    const options = resolveOverlap(conflict(first, second))
    const shortenFirst = options.find(o => o.kind === 'shortenFirst')
    expect(shortenFirst).toEqual({
      kind: 'shortenFirst',
      eventId: 'e1',
      startsAt: '2026-09-28T09:00:00.000Z',
      endsAt: '2026-09-28T09:45:00.000Z',
    })
  })
})

describe('resolveOverlap — le second est ENTIÈREMENT contenu dans le premier', () => {
  // 9h-12h / 10h-10h30 : raccourcir le premier jusqu'à 10h laisserait le
  // second orphelin de 10h30 à 12h — ce n'est pas une résolution, c'est
  // inventer une troisième réunion. Aucune option « raccourcir » ici.
  const first = event({ id: 'e1', start: '2026-09-28T09:00:00.000Z', end: '2026-09-28T12:00:00.000Z' })
  const second = event({ id: 'e2', start: '2026-09-28T10:00:00.000Z', end: '2026-09-28T10:30:00.000Z' })

  it('ne propose PAS de raccourcir : ça couperait le premier en deux', () => {
    const options = resolveOverlap(conflict(first, second, 30))
    expect(options.some(o => o.kind === 'shortenFirst')).toBe(false)
  })

  it('propose quand même de décaler chacun des deux', () => {
    const options = resolveOverlap(conflict(first, second, 30))
    expect(options.map(o => o.kind).sort()).toEqual(['moveFirst', 'moveSecond'])
  })
})

describe('resolveOverlap — #2390.12 le battement (buffer), CHOISI par l’utilisateur', () => {
  // 9h-10h / 9h45-10h45 : 15 min de chevauchement.
  const first = event({ id: 'e1', start: '2026-09-28T09:00:00.000Z', end: '2026-09-28T10:00:00.000Z' })
  const second = event({ id: 'e2', start: '2026-09-28T09:45:00.000Z', end: '2026-09-28T10:45:00.000Z' })

  it('sans battement demandé (comportement d’avant), aucune option `moveSecondWithBuffer`', () => {
    const options = resolveOverlap(conflict(first, second))
    expect(options.some(o => o.kind === 'moveSecondWithBuffer')).toBe(false)
  })

  it('un battement DEMANDÉ décale le second après la fin du premier PLUS ce battement, durée inchangée', () => {
    const options = resolveOverlap(conflict(first, second), { bufferMinutes: [15] })
    const buffered = options.find(o => o.kind === 'moveSecondWithBuffer')
    expect(buffered).toEqual({
      kind: 'moveSecondWithBuffer',
      eventId: 'e2',
      bufferMinutes: 15,
      // firstEnd (10:00) + 15 min = 10:15, durée inchangée (1h) → 11:15.
      startsAt: '2026-09-28T10:15:00.000Z',
      endsAt: '2026-09-28T11:15:00.000Z',
    })
    // Les options SANS battement restent proposées à côté — jamais un remplacement.
    expect(options.some(o => o.kind === 'moveSecond')).toBe(true)
  })

  it('plusieurs battements demandés donnent plusieurs options, une par valeur', () => {
    const options = resolveOverlap(conflict(first, second), { bufferMinutes: [15, 30] })
    const buffered = options.filter(o => o.kind === 'moveSecondWithBuffer')
    expect(buffered.map(o => (o.kind === 'moveSecondWithBuffer' ? o.bufferMinutes : null))).toEqual([15, 30])
  })

  it('un battement à zéro ou négatif n’est jamais proposé — ce n’est pas un battement', () => {
    const options = resolveOverlap(conflict(first, second), { bufferMinutes: [0, -5] })
    expect(options.some(o => o.kind === 'moveSecondWithBuffer')).toBe(false)
  })
})

describe('resolveOverlap — donnée absente : jamais une heure inventée', () => {
  it('sans horaire sur un des deux évènements, aucune option (pas de repli deviné)', () => {
    const first = event({ id: 'e1', start: null, end: null })
    const second = event({ id: 'e2', start: '2026-09-28T09:45:00.000Z', end: '2026-09-28T10:45:00.000Z' })
    expect(resolveOverlap(conflict(first, second))).toEqual([])
  })
})
