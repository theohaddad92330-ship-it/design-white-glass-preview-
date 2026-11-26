import type { MicrosoftService } from '../microsoft/microsoft.service'
import { MicrosoftAgendaBackend } from './microsoft-agenda.backend'

/**
 * #2103.29 (épopée #2878) — le pendant Microsoft de
 * `google-agenda.backend.spec.ts` : `seriesMasterId` n'est posé par Graph que
 * sur une occurrence/exception d'une série, jamais sur le maître.
 */

type RawEvent = {
  id: string
  subject: string | null
  preview: string | null
  location: string | null
  start: string | null
  end: string | null
  organizer: string | null
  attendees: Array<{ email: string; displayName: string | null; responseStatus: string | null; resource: boolean }>
  conferenceUrl: string | null
  webUrl: string | null
  cancelled: boolean
  sensitivity: string | null
  seriesMasterId: string | null
  showAs: string | null
}

function rawEvent(partial: Partial<RawEvent> & Pick<RawEvent, 'id'>): RawEvent {
  return {
    subject: 'Point',
    preview: null,
    location: null,
    start: '2026-09-28T09:00:00Z',
    end: '2026-09-28T09:30:00Z',
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    cancelled: false,
    sensitivity: null,
    seriesMasterId: null,
    showAs: null,
    ...partial,
  }
}

function fakeMicrosoftService(
  events: RawEvent[],
  opts: { scopes?: string[]; capacities?: Record<string, number | null> } = {},
  getRoomCapacity: jest.Mock = jest.fn(async (_token: string, email: string) => opts.capacities?.[email] ?? null),
): MicrosoftService {
  return {
    isConfigured: () => true,
    grantedScopes: async () => new Set(opts.scopes ?? []),
    getStatus: async () => ({ configured: true, connected: true, accountLabel: 'moi@bellum.fr' }),
    authorize: async () => ({
      accessToken: 'token',
      workspaceId: 'ws',
      client: {
        listCalendarView: async () => events,
        getRoomCapacity,
      },
    }),
  } as unknown as MicrosoftService
}

describe('MicrosoftAgendaBackend.listEvents — récurrence (#2103.29)', () => {
  it('marque récurrent un évènement qui porte un seriesMasterId', async () => {
    const backend = new MicrosoftAgendaBackend(
      fakeMicrosoftService([rawEvent({ id: 'occ-1', seriesMasterId: 'series-1' })]),
    )
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.recurring).toBe(true)
  })

  it('ne marque PAS récurrent un évènement sans seriesMasterId', async () => {
    const backend = new MicrosoftAgendaBackend(fakeMicrosoftService([rawEvent({ id: 'ponctuel-1' })]))
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.recurring).toBe(false)
  })
})

describe('MicrosoftAgendaBackend.listEvents — indisponibilité (#2390.6)', () => {
  it('relaie showAs brut, et laisse providerEventType à null — Graph n’a pas de champ nature', async () => {
    const backend = new MicrosoftAgendaBackend(fakeMicrosoftService([rawEvent({ id: 'oof-1', showAs: 'oof' })]))
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.showAs).toBe('oof')
    expect(result?.providerEventType).toBeNull()
  })

  it('rend showAs null quand Graph ne le porte pas', async () => {
    const backend = new MicrosoftAgendaBackend(fakeMicrosoftService([rawEvent({ id: 'busy-1' })]))
    const [result] = await backend.listEvents('user-1', { from: 'a', to: 'b', limit: 10 })
    expect(result?.showAs).toBeNull()
  })
})

describe('MicrosoftAgendaBackend.listEvents — salle réservée (#2390.9)', () => {
  it('relaie resource: true sur l’invité marqué salle par Graph, et eux seuls', async () => {
    const backend = new MicrosoftAgendaBackend(
      fakeMicrosoftService([
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

describe('MicrosoftAgendaBackend.listEvents — capacité de salle (#2390.9)', () => {
  const meeting = rawEvent({
    id: 'm1',
    attendees: [
      { email: 'j@bellum.fr', displayName: null, responseStatus: null, resource: false },
      { email: 'salle@bellum.fr', displayName: null, responseStatus: null, resource: true },
    ],
  })

  it('lit le nombre de places de la salle quand la portée Place.Read.All est accordée', async () => {
    const backend = new MicrosoftAgendaBackend(
      fakeMicrosoftService([meeting], { scopes: ['Place.Read.All'], capacities: { 'salle@bellum.fr': 8 } }),
    )
    const [result] = await backend.listEvents('u', { from: 'a', to: 'b', limit: 10 })
    expect(result?.attendees.find(a => a.resource)?.capacity).toBe(8)
    expect(result?.attendees.find(a => !a.resource)?.capacity).toBeUndefined()
  })

  it('sans la portée : AUCUN appel Places, aucune capacité (no-op strict)', async () => {
    const spy = jest.fn()
    const backend = new MicrosoftAgendaBackend(fakeMicrosoftService([meeting], { scopes: [] }, spy))
    const [result] = await backend.listEvents('u', { from: 'a', to: 'b', limit: 10 })
    expect(spy).not.toHaveBeenCalled()
    expect(result?.attendees.every(a => a.capacity === undefined)).toBe(true)
  })

  it('capacité illisible (null) : le champ reste absent, jamais 0', async () => {
    const backend = new MicrosoftAgendaBackend(fakeMicrosoftService([meeting], { scopes: ['Place.Read.All'] }))
    const [result] = await backend.listEvents('u', { from: 'a', to: 'b', limit: 10 })
    expect(result?.attendees.find(a => a.resource)?.capacity).toBeUndefined()
  })

  it('une même salle n’est interrogée qu’une fois pour plusieurs évènements', async () => {
    const spy = jest.fn(async () => 6)
    const backend = new MicrosoftAgendaBackend(
      fakeMicrosoftService([meeting, { ...meeting, id: 'm2' }], { scopes: ['Place.Read.All'] }, spy),
    )
    await backend.listEvents('u', { from: 'a', to: 'b', limit: 10 })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('MicrosoftAgendaBackend.deleteEvent — #2770.52', () => {
  it('relaie l’identifiant au client Graph autorisé, sans rien recalculer', async () => {
    const deleteEvent = jest.fn().mockResolvedValue(undefined)
    const microsoft = {
      authorize: jest.fn().mockResolvedValue({ client: { deleteEvent }, accessToken: 'AT', workspaceId: 'ws' }),
    } as unknown as MicrosoftService
    const backend = new MicrosoftAgendaBackend(microsoft)

    await backend.deleteEvent('user-1', 'evt-9')

    expect(deleteEvent).toHaveBeenCalledWith('AT', 'evt-9')
  })
})
