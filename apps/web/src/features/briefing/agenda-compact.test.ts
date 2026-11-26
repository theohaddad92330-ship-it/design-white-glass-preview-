import { describe, expect, it } from 'vitest'
import type { AgendaEvent } from '@bellum/contracts'
import { agendaCompactSummary, computeAgendaCapacity, AGENDA_CAPACITY_MINUTES_PER_DOSSIER } from './agenda-compact'

function makeEvent(overrides: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'start' | 'end'>): AgendaEvent {
  return {
    summary: null,
    description: null,
    location: null,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: null,
    isExternal: true,
    cancelled: false,
    ...overrides,
  }
}

/**
 * #2101.33/.34/.35 — CAPACITÉ D'AGENDA : moins de temps disponible entre les
 * rendez-vous confirmés donne moins de dossiers ouvrables aujourd'hui, jamais
 * tous les créneaux libres, et une réserve reste toujours retenue.
 *
 * `computeAgendaCapacity` ne connaît que ce que `agenda-compact.ts` sait déjà
 * (les trous entre rendez-vous CONFIRMÉS) — pas le temps protégé (#2101.13),
 * qui n'existe pas encore dans le produit : voir le commentaire du fichier.
 */
describe('#2101.33/.34/.35 — computeAgendaCapacity', () => {
  it('zéro minute libre → zéro dossier ouvrable', () => {
    expect(computeAgendaCapacity(0)).toBe(0)
  })

  it('moins de temps disponible = moins de dossiers simultanés (monotone)', () => {
    const low = computeAgendaCapacity(AGENDA_CAPACITY_MINUTES_PER_DOSSIER * 2)
    const high = computeAgendaCapacity(AGENDA_CAPACITY_MINUTES_PER_DOSSIER * 6)
    expect(high).toBeGreaterThan(low)
  })

  it('ne remplit jamais tous les créneaux libres — une réserve reste retenue', () => {
    const slotsWorthOfTime = AGENDA_CAPACITY_MINUTES_PER_DOSSIER * 3
    const capacity = computeAgendaCapacity(slotsWorthOfTime)
    const fullSlotCount = Math.floor(slotsWorthOfTime / AGENDA_CAPACITY_MINUTES_PER_DOSSIER)
    expect(capacity).toBeLessThan(fullSlotCount)
  })

  it('jamais négatif même avec très peu de temps libre', () => {
    expect(computeAgendaCapacity(AGENDA_CAPACITY_MINUTES_PER_DOSSIER)).toBe(0)
  })
})

describe('#2101.33 — capacité exposée par agendaCompactSummary', () => {
  it('compte les minutes libres entre deux rendez-vous confirmés, pas les proposés', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
      // Trou de 4h entre les deux confirmés → largement de quoi ouvrir un dossier.
      makeEvent({ id: '2', start: '2026-09-25T13:30:00.000Z', end: '2026-09-25T14:00:00.000Z' }),
    ]

    const summary = agendaCompactSummary(events, now)
    expect(summary.capacity).toBeGreaterThan(0)
  })

  it('aucun trou significatif → capacité nulle', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
    ]

    expect(agendaCompactSummary(events, now).capacity).toBe(0)
  })
})

/**
 * #2101.13 — LE TEMPS PROTÉGÉ, réglé par la personne, borne les deux trous que
 * `freeGaps` ne voit pas : avant le premier rendez-vous du jour, après le
 * dernier. Absent (le défaut), `agendaCompactSummary` rend EXACTEMENT ce
 * qu'elle rendait avant ce lot — les deux suites de tests ci-dessus le
 * couvrent déjà sans passer ce troisième argument.
 *
 * ⚠️ Les horaires sont construits en heure LOCALE (`new Date(2026, 8, 25, …)`),
 * jamais en ISO UTC : `protectedTime` compte des minutes depuis MINUIT LOCAL,
 * et un test écrit en UTC mentirait selon le fuseau de la machine qui le lance
 * (même règle que `chat-quota-text.test.ts`).
 */
describe('#2101.13 — protectedTime borne les trous avant le premier et après le dernier rendez-vous', () => {
  it('sans rendez-vous dans la fenêtre, toute la fenêtre restante compte comme un trou', () => {
    const now = new Date(2026, 8, 25, 8, 0) // 08:00 local
    const protectedTime = { startMinute: 9 * 60, endMinute: 18 * 60 } // 09:00–18:00

    const withoutWindow = agendaCompactSummary([], now)
    const withWindow = agendaCompactSummary([], now, protectedTime)

    expect(withoutWindow.freeSlots).toBe(0)
    expect(withWindow.freeSlots).toBe(1)
    expect(withWindow.capacity).toBeGreaterThan(withoutWindow.capacity)
  })

  it('compte le trou AVANT le premier rendez-vous et APRÈS le dernier, jamais celui déjà compté ENTRE deux confirmés', () => {
    const now = new Date(2026, 8, 25, 8, 0)
    const protectedTime = { startMinute: 9 * 60, endMinute: 18 * 60 }
    const events: AgendaEvent[] = [
      // 10:00–10:30 : entre le début de fenêtre (9h) et ce rendez-vous, une heure — un trou.
      makeEvent({
        id: '1',
        start: new Date(2026, 8, 25, 10, 0).toISOString(),
        end: new Date(2026, 8, 25, 10, 30).toISOString(),
      }),
      // 11:00–11:30 : trou de 30 min avec le précédent — sous le seuil de 45, `freeGaps` ne le compte pas.
      makeEvent({
        id: '2',
        start: new Date(2026, 8, 25, 11, 0).toISOString(),
        end: new Date(2026, 8, 25, 11, 30).toISOString(),
      }),
      // Fin de fenêtre à 18h : de 11h30 à 18h, six heures et demie — un trou.
    ]

    const without = agendaCompactSummary(events, now)
    const withWindow = agendaCompactSummary(events, now, protectedTime)

    // Sans fenêtre : aucun trou (le seul entre les deux confirmés est sous le seuil).
    expect(without.freeSlots).toBe(0)
    // Avec fenêtre : deux bords de plus, jamais un troisième qui redoublerait
    // le trou de 30 min déjà écarté par `freeGaps`.
    expect(withWindow.freeSlots).toBe(2)
  })

  it('ne compte rien au-delà de la fenêtre — un rendez-vous du soir ne prolonge pas le temps protégé', () => {
    const now = new Date(2026, 8, 25, 8, 0)
    const protectedTime = { startMinute: 9 * 60, endMinute: 18 * 60 }
    const events: AgendaEvent[] = [
      makeEvent({
        id: '1',
        start: new Date(2026, 8, 25, 20, 0).toISOString(),
        end: new Date(2026, 8, 25, 21, 0).toISOString(),
      }),
    ]

    // Le rendez-vous de 20h tombe HORS fenêtre (9h–18h) : la fenêtre entière
    // (9h–18h, personne dedans) compte comme UN seul trou, pas deux.
    expect(agendaCompactSummary(events, now, protectedTime).freeSlots).toBe(1)
  })

  it('déjà dans la fenêtre protégée mais rien avant `now` : le bord ne commence jamais avant l’instant présent', () => {
    const now = new Date(2026, 8, 25, 15, 0) // 15:00, DANS la fenêtre 9h–18h
    const protectedTime = { startMinute: 9 * 60, endMinute: 18 * 60 }

    // De 15h (maintenant) à 18h (fin de fenêtre) : trois heures, un seul trou —
    // jamais compté depuis 9h, qui est déjà passé.
    expect(agendaCompactSummary([], now, protectedTime).freeSlots).toBe(1)
    expect(agendaCompactSummary([], now, protectedTime).capacity).toBe(
      agendaCompactSummary([], now, { startMinute: 15 * 60, endMinute: 18 * 60 }).capacity,
    )
  })
})

/**
 * #2101.17 — LES PRÉFÉRENCES D'AGENDA (au-delà du seul temps protégé) :
 * `dossierDurationMinutes` et `reserveSlots` remplacent les DEUX constantes
 * globales quand la personne les a réglées — absentes, comportement
 * inchangé (les suites ci-dessus le couvrent déjà sans ce quatrième
 * argument).
 */
describe('#2101.17 — agendaPreferences remplace les défauts globaux, champ par champ', () => {
  it('une durée de dossier plus courte ouvre plus de dossiers pour le même temps libre', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
      makeEvent({ id: '2', start: '2026-09-25T13:30:00.000Z', end: '2026-09-25T14:00:00.000Z' }),
    ]

    const defaultCapacity = agendaCompactSummary(events, now).capacity
    const shorterDossier = agendaCompactSummary(events, now, null, { dossierDurationMinutes: 15 }).capacity
    expect(shorterDossier).toBeGreaterThan(defaultCapacity)
  })

  it('une réserve plus grande retire des dossiers ouvrables, jamais en dessous de zéro', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
      makeEvent({ id: '2', start: '2026-09-25T13:30:00.000Z', end: '2026-09-25T14:00:00.000Z' }),
    ]

    const defaultCapacity = agendaCompactSummary(events, now).capacity
    const bigReserve = agendaCompactSummary(events, now, null, { reserveSlots: 10 }).capacity
    expect(bigReserve).toBeLessThan(defaultCapacity)
    expect(bigReserve).toBe(0)
  })

  it('un seul champ réglé laisse l’autre à son défaut global', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
      makeEvent({ id: '2', start: '2026-09-25T13:30:00.000Z', end: '2026-09-25T14:00:00.000Z' }),
    ]

    expect(
      agendaCompactSummary(events, now, null, { dossierDurationMinutes: AGENDA_CAPACITY_MINUTES_PER_DOSSIER }),
    ).toEqual(agendaCompactSummary(events, now))
  })

  it('un trou plus court que le défaut global devient significatif avec une durée de dossier personnelle plus courte', () => {
    const now = new Date('2026-09-25T08:00:00.000Z')
    const events: AgendaEvent[] = [
      makeEvent({ id: '1', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T09:30:00.000Z' }),
      // Trou de 20 minutes : sous le seuil global (45), au-dessus d'un seuil personnel de 15.
      makeEvent({ id: '2', start: '2026-09-25T09:50:00.000Z', end: '2026-09-25T10:20:00.000Z' }),
    ]

    expect(agendaCompactSummary(events, now).freeSlots).toBe(0)
    expect(agendaCompactSummary(events, now, null, { dossierDurationMinutes: 15 }).freeSlots).toBe(1)
  })
})
