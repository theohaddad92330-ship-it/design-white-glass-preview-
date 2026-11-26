import type { AgendaEvent } from '@bellum/contracts'
import { titleFor } from './agenda.service'
import {
  computeFreeSlots,
  detectConflicts,
  detectDuplicateEvents,
  detectOwnerUnavailableConflicts,
  detectProximityConflicts,
  detectTravelConflicts,
} from './free-slots'
import { zonedDateKey, zonedParts, zonedTimeToInstant } from './time-zone'

/**
 * Un créneau proposé pendant une réunion existante ne se voit qu'au moment où
 * le client répond « je ne suis pas libre ». D'où ces tests.
 */

function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'start' | 'end'>): AgendaEvent {
  return {
    summary: 'Réunion',
    description: null,
    location: null,
    organizer: 'moi@bellum.fr',
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
    ...partial,
  }
}

const PARIS = {
  durationMinutes: 60,
  workdayStartHour: 9,
  workdayEndHour: 18,
  workdays: [1, 2, 3, 4, 5],
  timeZone: 'Europe/Paris',
  limit: 10,
}

describe('computeFreeSlots', () => {
  /**
   * Un marqueur « journée entière » ne prend pas de temps.
   *
   * Trouvé en direct sur un vrai agenda : `GET /agenda/free-slots` rendait `[]`
   * sur une journée dont l'après-midi était entièrement vide. Deux évènements
   * « journée entière » — un prénom, « Office » — suffisaient : sans heure de
   * début, ils s'étendent de minuit à minuit, et la journée entière passait
   * pour occupée.
   *
   * La fonction voisine de ce même fichier, `detectConflicts`, les exclut déjà,
   * avec la raison écrite : « un congé posé ne fait pas d'une réunion un conflit
   * à arbitrer ». La même raison vaut ici — un « journée entière » est presque
   * toujours un marqueur de contexte (présence, télétravail, salon), pas un
   * rendez-vous qui occupe.
   *
   * Le coût d'erreur est asymétrique, et c'est ce qui tranche : bloquer à tort
   * répond « aucun créneau » sur une journée libre, sans rien dire ni laisser
   * de recours. Ne pas bloquer propose un créneau que l'utilisateur VOIT, avec
   * le marqueur affiché juste au-dessus dans sa grille, et qu'il peut refuser.
   */
  it('ne compte PAS un évènement « journée entière » comme du temps occupé', () => {
    const from = new Date('2026-08-05T00:00:00Z')
    const to = new Date('2026-08-05T23:59:00Z')

    const slots = computeFreeSlots(
      [event({ id: 'presence', summary: 'Office', start: '2026-08-05', end: '2026-08-06' })],
      { from, to },
      PARIS,
    )

    // Neuf heures ouvrées entièrement libres : la journée n'est pas prise.
    expect(slots.length).toBeGreaterThan(0)
  })

  it('bloque toujours ce qui a une heure, même à côté d’une journée entière', () => {
    // Le garde ne doit pas ouvrir la porte à des créneaux pendant une vraie
    // réunion sous prétexte qu'un marqueur traîne le même jour.
    const from = new Date('2026-08-05T00:00:00Z')
    const to = new Date('2026-08-05T23:59:00Z')

    const slots = computeFreeSlots(
      [
        event({ id: 'presence', summary: 'Office', start: '2026-08-05', end: '2026-08-06' }),
        event({ id: 'reunion', start: '2026-08-05T07:00:00Z', end: '2026-08-05T16:00:00Z' }),
      ],
      { from, to },
      PARIS,
    )

    // 9 h → 18 h heure de Paris = 07:00 → 16:00 UTC : la réunion couvre tout.
    expect(slots).toEqual([])
  })

  it('ne propose jamais un créneau en dehors des heures ouvrées', () => {
    // Mercredi 5 août 2026, agenda vide.
    const from = new Date('2026-08-05T00:00:00Z')
    const to = new Date('2026-08-05T23:59:00Z')
    const slots = computeFreeSlots([], { from, to }, PARIS)

    expect(slots.length).toBeGreaterThan(0)
    for (const slot of slots) {
      const start = zonedParts(new Date(slot.start), 'Europe/Paris')
      expect(start.hour).toBeGreaterThanOrEqual(9)
      expect(start.hour).toBeLessThan(18)
    }
  })

  it('saute le week-end', () => {
    // Samedi 8 et dimanche 9 août 2026.
    const slots = computeFreeSlots(
      [],
      { from: new Date('2026-08-08T00:00:00Z'), to: new Date('2026-08-09T23:00:00Z') },
      PARIS,
    )
    expect(slots).toEqual([])
  })

  it('évite les plages occupées', () => {
    const busy = event({
      id: 'e1',
      start: '2026-08-05T08:00:00.000Z', // 10 h à Paris
      end: '2026-08-05T12:00:00.000Z', // 14 h à Paris
    })
    const slots = computeFreeSlots(
      [busy],
      { from: new Date('2026-08-05T00:00:00Z'), to: new Date('2026-08-05T22:00:00Z') },
      PARIS,
    )
    for (const slot of slots) {
      const overlaps = Date.parse(slot.start) < Date.parse(busy.end!) && Date.parse(slot.end) > Date.parse(busy.start!)
      expect(overlaps).toBe(false)
    }
  })

  it('ignore un évènement annulé — il ne prend plus de place', () => {
    const cancelled = event({
      id: 'e1',
      start: '2026-08-05T07:00:00.000Z',
      end: '2026-08-05T16:00:00.000Z',
      cancelled: true,
    })
    const slots = computeFreeSlots(
      [cancelled],
      { from: new Date('2026-08-05T00:00:00Z'), to: new Date('2026-08-05T22:00:00Z') },
      PARIS,
    )
    expect(slots.length).toBeGreaterThan(0)
  })

  it('respecte la durée demandée', () => {
    const slots = computeFreeSlots(
      [],
      { from: new Date('2026-08-05T00:00:00Z'), to: new Date('2026-08-05T22:00:00Z') },
      { ...PARIS, durationMinutes: 120, limit: 3 },
    )
    expect(slots.every(slot => slot.minutes === 120)).toBe(true)
  })

  // #5 (recette prod 13/10, « Organise-moi ma journée ») : à durée 5 min (plancher du plan de journée), chaque
  // trou était DÉCOUPÉ en tranches de 5 min — aucun bloc de 30 min ne tenait dans une journée VIDE. `mergeHoles`
  // rend le trou entier.
  it('#5 — mergeHoles rend les trous ENTIERS, pas des tranches de la durée demandée', () => {
    const window = { from: new Date('2026-08-05T00:00:00Z'), to: new Date('2026-08-05T22:00:00Z') }
    const sliced = computeFreeSlots([], window, { ...PARIS, durationMinutes: 5, limit: 50 })
    expect(sliced.every(slot => slot.minutes === 5)).toBe(true)

    const holes = computeFreeSlots([], window, { ...PARIS, durationMinutes: 5, limit: 50, mergeHoles: true })
    expect(holes).toHaveLength(1)
    expect(holes[0]?.minutes).toBe(9 * 60)
  })

  it('#5 — mergeHoles contourne un rendez-vous : deux trous, jamais un créneau qui le recouvre', () => {
    const window = { from: new Date('2026-08-05T00:00:00Z'), to: new Date('2026-08-05T22:00:00Z') }
    const meeting = event({ id: 'm', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' })
    const holes = computeFreeSlots([meeting], window, { ...PARIS, durationMinutes: 5, limit: 50, mergeHoles: true })
    expect(holes.length).toBeGreaterThanOrEqual(1)
    for (const hole of holes) {
      const overlaps =
        Date.parse(hole.start) < Date.parse(meeting.end ?? '') && Date.parse(hole.end) > Date.parse(meeting.start ?? '')
      expect(overlaps).toBe(false)
    }
  })

  it('#5 — un trou plus court que la durée minimale n’est pas rendu', () => {
    const window = { from: new Date('2026-08-05T00:00:00Z'), to: new Date('2026-08-05T22:00:00Z') }
    const holes = computeFreeSlots([], window, { ...PARIS, durationMinutes: 600, limit: 5, mergeHoles: true })
    expect(holes).toHaveLength(0)
  })

  it('borne le nombre de créneaux rendus', () => {
    const slots = computeFreeSlots(
      [],
      { from: new Date('2026-08-03T00:00:00Z'), to: new Date('2026-08-14T22:00:00Z') },
      { ...PARIS, limit: 4 },
    )
    expect(slots).toHaveLength(4)
  })
})

describe('detectConflicts', () => {
  it('signale deux évènements qui se chevauchent', () => {
    const conflicts = detectConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T09:30:00.000Z', end: '2026-08-05T10:30:00.000Z' }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.overlapMinutes).toBe(30)
  })

  it('ne signale rien pour deux évènements qui se touchent', () => {
    const conflicts = detectConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T10:00:00.000Z', end: '2026-08-05T11:00:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ignore les journées entières — sinon tout devient un conflit', () => {
    const conflicts = detectConflicts([
      event({ id: 'holiday', start: '2026-08-05', end: '2026-08-06' }),
      event({ id: 'meeting', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ignore un évènement annulé', () => {
    const conflicts = detectConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T09:30:00.000Z', end: '2026-08-05T10:30:00.000Z', cancelled: true }),
    ])
    expect(conflicts).toEqual([])
  })
})

// #2390.5 — LAU-FINAL-104 : deux rendez-vous qui ne se chevauchent PAS mais
// s'enchaînent sans battement sont un risque distinct du chevauchement, avec
// son propre type (`AgendaProximityConflict`) pour ne pas faire mentir les
// textes qui lisent `overlapMinutes` comme un vrai chevauchement.
describe('detectProximityConflicts', () => {
  it('signale un enchaînement trop serré (moins de 15 minutes de battement)', () => {
    const conflicts = detectProximityConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T10:05:00.000Z', end: '2026-08-05T10:30:00.000Z' }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ gapMinutes: 5 })
    expect(conflicts[0]?.first.id).toBe('a')
    expect(conflicts[0]?.second.id).toBe('b')
  })

  it('ne signale rien à partir de 15 minutes de battement', () => {
    const conflicts = detectProximityConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T10:15:00.000Z', end: '2026-08-05T10:45:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale rien pour deux évènements qui se touchent exactement — comportement préservé de detectConflicts', () => {
    const conflicts = detectProximityConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T10:00:00.000Z', end: '2026-08-05T11:00:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale rien pour un chevauchement — déjà couvert par detectConflicts', () => {
    const conflicts = detectProximityConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T09:30:00.000Z', end: '2026-08-05T10:30:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ignore un évènement annulé', () => {
    const conflicts = detectProximityConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({
        id: 'b',
        start: '2026-08-05T10:05:00.000Z',
        end: '2026-08-05T10:30:00.000Z',
        cancelled: true,
      }),
    ])
    expect(conflicts).toEqual([])
  })
})

// #2390.3 — LAU-FINAL-104 : un temps de déplacement impossible. Sans donnée de
// trajet (aucune carte branchée), le seul cas affirmable sans deviner une
// distance est un battement NUL entre deux rendez-vous en présentiel à des
// lieux différents — zéro minute pour se déplacer est impossible quelle que
// soit la distance réelle.
describe('detectTravelConflicts', () => {
  it('signale deux rendez-vous en présentiel, à des lieux différents, qui s’enchaînent sans battement', () => {
    const conflicts = detectTravelConflicts([
      event({
        id: 'a',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        location: '12 rue de Rivoli, Paris',
      }),
      event({
        id: 'b',
        start: '2026-08-05T10:00:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '8 avenue Foch, Paris',
      }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.first.id).toBe('a')
    expect(conflicts[0]?.second.id).toBe('b')
  })

  it('ne signale rien pour le même lieu — pas de déplacement à faire', () => {
    const conflicts = detectTravelConflicts([
      event({
        id: 'a',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        location: '12 rue de Rivoli, Paris',
      }),
      event({
        id: 'b',
        start: '2026-08-05T10:00:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '  12 RUE DE RIVOLI, PARIS  ',
      }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale rien dès qu’il reste un battement — pas de distance à deviner', () => {
    const conflicts = detectTravelConflicts([
      event({
        id: 'a',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        location: '12 rue de Rivoli, Paris',
      }),
      event({
        id: 'b',
        start: '2026-08-05T10:05:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '8 avenue Foch, Paris',
      }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale rien pour un chevauchement — déjà couvert par detectConflicts', () => {
    const conflicts = detectTravelConflicts([
      event({
        id: 'a',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        location: '12 rue de Rivoli, Paris',
      }),
      event({
        id: 'b',
        start: '2026-08-05T09:30:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '8 avenue Foch, Paris',
      }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ignore un rendez-vous visio — aucun déplacement n’est imposé', () => {
    const conflicts = detectTravelConflicts([
      event({
        id: 'a',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        location: '12 rue de Rivoli, Paris',
        conferenceUrl: 'https://meet.example.com/a',
      }),
      event({
        id: 'b',
        start: '2026-08-05T10:00:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '8 avenue Foch, Paris',
      }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale rien sans lieu renseigné sur l’un des deux — rien à comparer', () => {
    const conflicts = detectTravelConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', location: null }),
      event({
        id: 'b',
        start: '2026-08-05T10:00:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '8 avenue Foch, Paris',
      }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ignore un évènement annulé', () => {
    const conflicts = detectTravelConflicts([
      event({
        id: 'a',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        location: '12 rue de Rivoli, Paris',
      }),
      event({
        id: 'b',
        start: '2026-08-05T10:00:00.000Z',
        end: '2026-08-05T11:00:00.000Z',
        location: '8 avenue Foch, Paris',
        cancelled: true,
      }),
    ])
    expect(conflicts).toEqual([])
  })
})

// #2390.7 — LAU-FINAL-104 : même créneau, même titre, deux identifiants
// différents — le signe d'un doublon (double import, resynchronisation…).
describe('detectOwnerUnavailableConflicts', () => {
  it('signale un rendez-vous minuté qui tombe sur un bloc « outOfOffice » Google, journée entière', () => {
    const conflicts = detectOwnerUnavailableConflicts([
      event({ id: 'ooo', start: '2026-08-05', end: '2026-08-06', providerEventType: 'outOfOffice' }),
      event({ id: 'meeting', start: '2026-08-05T14:00:00.000Z', end: '2026-08-05T15:00:00.000Z' }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.meeting.id).toBe('meeting')
    expect(conflicts[0]?.unavailability.id).toBe('ooo')
    expect(conflicts[0]?.overlapMinutes).toBe(60)
  })

  it('signale un rendez-vous qui tombe sur un `showAs: oof` Microsoft, minuté', () => {
    const conflicts = detectOwnerUnavailableConflicts([
      event({ id: 'oof', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T18:00:00.000Z', showAs: 'oof' }),
      event({ id: 'meeting', start: '2026-08-05T14:00:00.000Z', end: '2026-08-05T15:00:00.000Z' }),
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.meeting.id).toBe('meeting')
  })

  it('ne signale rien quand rien n’est marqué indisponible', () => {
    const conflicts = detectOwnerUnavailableConflicts([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z' }),
      event({ id: 'b', start: '2026-08-05T09:30:00.000Z', end: '2026-08-05T10:30:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale rien sans battement avec le bloc d’indisponibilité', () => {
    const conflicts = detectOwnerUnavailableConflicts([
      event({
        id: 'ooo',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T12:00:00.000Z',
        providerEventType: 'outOfOffice',
      }),
      event({ id: 'meeting', start: '2026-08-05T13:00:00.000Z', end: '2026-08-05T14:00:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ignore un bloc d’indisponibilité annulé', () => {
    const conflicts = detectOwnerUnavailableConflicts([
      event({
        id: 'ooo',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T18:00:00.000Z',
        providerEventType: 'outOfOffice',
        cancelled: true,
        status: 'cancelled',
      }),
      event({ id: 'meeting', start: '2026-08-05T14:00:00.000Z', end: '2026-08-05T15:00:00.000Z' }),
    ])
    expect(conflicts).toEqual([])
  })

  it('ne signale pas deux blocs d’indisponibilité entre eux — seul un vrai rendez-vous compte', () => {
    const conflicts = detectOwnerUnavailableConflicts([
      event({ id: 'ooo-1', start: '2026-08-05', end: '2026-08-06', providerEventType: 'outOfOffice' }),
      event({ id: 'ooo-2', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T18:00:00.000Z', showAs: 'oof' }),
    ])
    expect(conflicts).toEqual([])
  })
})

describe('detectDuplicateEvents', () => {
  it('signale deux évènements au même créneau et au même titre', () => {
    const duplicates = detectDuplicateEvents([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: 'Cadrage Nova' }),
      event({ id: 'b', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: 'Cadrage Nova' }),
    ])
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0]?.first.id).toBe('a')
    expect(duplicates[0]?.second.id).toBe('b')
  })

  it('compare le titre normalisé — casse et espaces ne comptent pas', () => {
    const duplicates = detectDuplicateEvents([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: 'Cadrage Nova' }),
      event({
        id: 'b',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        summary: '  cadrage nova  ',
      }),
    ])
    expect(duplicates).toHaveLength(1)
  })

  it('ne signale rien pour deux titres différents au même créneau', () => {
    const duplicates = detectDuplicateEvents([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: 'Cadrage Nova' }),
      event({
        id: 'b',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        summary: 'Cadrage Alchimmy',
      }),
    ])
    expect(duplicates).toEqual([])
  })

  it('ne signale rien pour deux évènements sans titre — rien à comparer, pas de faux positif inventé', () => {
    const duplicates = detectDuplicateEvents([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: null }),
      event({ id: 'b', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: null }),
    ])
    expect(duplicates).toEqual([])
  })

  it('ignore un évènement annulé', () => {
    const duplicates = detectDuplicateEvents([
      event({ id: 'a', start: '2026-08-05T09:00:00.000Z', end: '2026-08-05T10:00:00.000Z', summary: 'Cadrage Nova' }),
      event({
        id: 'b',
        start: '2026-08-05T09:00:00.000Z',
        end: '2026-08-05T10:00:00.000Z',
        summary: 'Cadrage Nova',
        cancelled: true,
      }),
    ])
    expect(duplicates).toEqual([])
  })
})

describe('time-zone', () => {
  it('lit l’heure locale de Paris en été (UTC+2)', () => {
    expect(zonedParts(new Date('2026-08-05T08:00:00Z'), 'Europe/Paris').hour).toBe(10)
  })

  it('lit l’heure locale de Paris en hiver (UTC+1)', () => {
    expect(zonedParts(new Date('2026-01-05T08:00:00Z'), 'Europe/Paris').hour).toBe(9)
  })

  it('retrouve l’instant d’une heure murale', () => {
    const instant = zonedTimeToInstant({ year: 2026, month: 8, day: 5, hour: 9 }, 'Europe/Paris')
    expect(instant.toISOString()).toBe('2026-08-05T07:00:00.000Z')
  })

  it('donne le jour calendaire local, pas le jour UTC', () => {
    // 22 h 30 UTC un 4 août = déjà le 5 août à Paris.
    expect(zonedDateKey(new Date('2026-08-04T22:30:00Z'), 'Europe/Paris')).toBe('2026-08-05')
  })
})

describe('titleFor', () => {
  it('préfixe le titre par la société — un agenda plein de « Point » est illisible', () => {
    expect(titleFor({ summary: 'Cadrage Data', accountName: 'Groupe Helios' })).toBe('Groupe Helios — Cadrage Data')
  })

  it('ne double PAS la société quand le titre la nomme déjà', () => {
    // « ACME — ACME : cadrage » serait pire que pas de préfixe du tout.
    expect(titleFor({ summary: 'ACME : cadrage', accountName: 'ACME' })).toBe('ACME : cadrage')
  })

  it('compare sans tenir compte de la casse ni des espaces multiples', () => {
    expect(titleFor({ summary: 'Point  groupe   helios', accountName: 'Groupe Helios' })).toBe('Point  groupe   helios')
  })

  it('laisse le titre intact sans société', () => {
    expect(titleFor({ summary: 'Point interne' })).toBe('Point interne')
  })
})
