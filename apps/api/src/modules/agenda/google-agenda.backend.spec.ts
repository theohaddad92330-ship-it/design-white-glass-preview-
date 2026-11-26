import type { GoogleService } from '../google/google.service'
import { GoogleAgendaBackend } from './google-agenda.backend'

/**
 * #2103.29 (épopée #2878) — un évènement récurrent se distingue d'un
 * ponctuel dès la lecture Google, pour que l'écran puisse le nommer.
 *
 * `recurringEventId` n'est posé par Google QUE sur une occurrence d'une
 * série, jamais sur l'évènement maître — c'est ce que `GoogleAgendaBackend`
 * doit traduire en `AgendaEvent.recurring`, sans rien deviner d'autre.
 */

type RawEvent = {
  id: string
  summary: string | null
  description: string | null
  location: string | null
  htmlLink: string | null
  start: string | null
  end: string | null
  attendees: Array<{ email: string; displayName: string | null; responseStatus: string | null; resource: boolean }>
  organizer: string | null
  status: string | null
  conferenceUrl: string | null
  visibility: string | null
  recurringEventId: string | null
  eventType: string | null
}

function rawEvent(partial: Partial<RawEvent> & Pick<RawEvent, 'id'>): RawEvent {
  return {
    summary: 'Point',
    description: null,
    location: null,
    htmlLink: null,
    start: '2026-09-28T09:00:00Z',
    end: '2026-09-28T09:30:00Z',
    attendees: [],
    organizer: null,
    status: 'confirmed',
    conferenceUrl: null,
    visibility: null,
    recurringEventId: null,
    eventType: null,
    ...partial,
  }
}

function fakeGoogleService(events: RawEvent[]): GoogleService {
  return {
    isConfigured: () => true,
    getStatus: async () => ({ configured: true, connected: true, accountLabel: 'moi@bellum.fr' }),
    authorize: async () => ({
      accessToken: 'token',
      workspaceId: 'ws',
      client: {
        listEventsInRange: async () => events,
      },
    }),
  } as unknown as GoogleService
}

describe('GoogleAgendaBackend.listEvents — récurrence (#2103.29)', () => {
  it('marque récurrent un évènement qui porte un recurringEventId', async () => {
    const backend = new GoogleAgendaBackend(
      fakeGoogleService([rawEvent({ id: 'occ-1', recurringEventId: 'series-1' })]),
    )
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.recurring).toBe(true)
  })

  it('ne marque PAS récurrent un évènement sans recurringEventId', async () => {
    const backend = new GoogleAgendaBackend(fakeGoogleService([rawEvent({ id: 'ponctuel-1' })]))
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.recurring).toBe(false)
  })
})

describe('GoogleAgendaBackend.listEvents — nature de l’évènement (#2390.1 / #2390.6)', () => {
  it('relaie eventType brut dans providerEventType, et laisse showAs à null', async () => {
    const backend = new GoogleAgendaBackend(fakeGoogleService([rawEvent({ id: 'ooo-1', eventType: 'outOfOffice' })]))
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.providerEventType).toBe('outOfOffice')
    expect(result?.showAs).toBeNull()
  })

  it('rend providerEventType null quand Google ne le porte pas', async () => {
    const backend = new GoogleAgendaBackend(fakeGoogleService([rawEvent({ id: 'default-1' })]))
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.providerEventType).toBeNull()
  })
})

describe('GoogleAgendaBackend.listEvents — salle réservée (#2390.9)', () => {
  it('relaie resource: true sur l’invité marqué salle par Google, et eux seuls', async () => {
    const backend = new GoogleAgendaBackend(
      fakeGoogleService([
        rawEvent({
          id: 'meeting-1',
          attendees: [
            { email: 'j.dupont@bellum.fr', displayName: null, responseStatus: null, resource: false },
            { email: 'salle-paris-3e@bellum.fr', displayName: null, responseStatus: null, resource: true },
          ],
        }),
      ]),
    )
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.attendees.filter(a => a.resource).map(a => a.email)).toEqual(['salle-paris-3e@bellum.fr'])
  })
})

describe('GoogleAgendaBackend.deleteEvent — #2770.52', () => {
  it('relaie l’identifiant à GoogleService.deleteCalendarEvent, sans rien recalculer', async () => {
    const deleteCalendarEvent = jest.fn().mockResolvedValue(undefined)
    const backend = new GoogleAgendaBackend({ deleteCalendarEvent } as unknown as GoogleService)

    await backend.deleteEvent('user-1', 'evt-9')

    expect(deleteCalendarEvent).toHaveBeenCalledWith('user-1', 'evt-9')
  })
})
