import type { AgendaEvent } from '@bellum/contracts'
import { ActivityCaptureService } from './activity-capture.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'

function event(overrides: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
  return {
    summary: 'Point client',
    description: null,
    location: null,
    start: '2026-08-20T09:00:00.000Z',
    end: '2026-08-20T09:30:00.000Z',
    organizer: 'moi@bellum-it.example',
    attendees: [{ email: 'client@acme.example', displayName: null, responseStatus: 'accepted', external: true }],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...overrides,
  }
}

/**
 * `ActivityCaptureService` a de nombreuses dépendances injectées ; seules
 * celles que `captureAgenda` touche réellement sont mockées ici, les deux
 * autres sources (messagerie, téléphonie) étant coupées d'entrée pour isoler
 * le sujet du test.
 */
function makeService(events: AgendaEvent[]) {
  const ingest = jest.fn(async (_workspaceId: string, _userId: string | null, inputs: readonly unknown[]) => ({
    ingested: inputs.length,
    duplicates: 0,
  }))

  const activities = { ingest } as never
  const mailbox = { listRecentMessages: jest.fn(async () => null) } as never
  const agenda = {
    status: jest.fn(async () => ({ connected: true, provider: 'google', capabilities: { read: true, write: true } })),
    listEvents: jest.fn(async () => events),
  } as never
  const telephony = { status: jest.fn(async () => ({ connected: false })) } as never
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })),
    isDemoWorkspace: jest.fn(async () => false),
  } as never
  const syncStateManager = {
    query: jest.fn(async (sql: string) => {
      // Contacts et comptes de l'index de rattachement : un compte suffit à
      // rattacher l'unique participant externe des évènements de test.
      if (sql.includes('FROM contacts')) return []
      if (sql.includes('FROM accounts WHERE workspace_id')) return [{ id: ACCOUNT, website: 'acme.example' }]
      if (sql.includes('FROM profiles p')) return [{ email: 'moi@bellum-it.example' }]
      if (sql.includes('FROM profiles WHERE user_id')) return [{ email: 'moi@bellum-it.example' }]
      return []
    }),
  }
  const syncState = { manager: syncStateManager } as never

  const service = new ActivityCaptureService(activities, mailbox, agenda, telephony, workspaceContext, syncState)
  return { service, ingest }
}

describe('ActivityCaptureService — un rendez-vous PROPOSÉ n’est pas un rendez-vous FIXÉ', () => {
  it('capture un évènement CONFIRMÉ comme un rendez-vous', async () => {
    const { service, ingest } = makeService([event({ id: 'evt-confirmed', status: 'confirmed' })])
    const result = await service.sync(USER)
    const agendaResult = result.sources.find(source => source.source === 'agenda')
    expect(agendaResult?.ingested).toBe(1)
    expect(agendaResult?.skipped).toEqual([])
    expect(ingest).toHaveBeenCalledWith(
      WORKSPACE,
      USER,
      expect.arrayContaining([expect.objectContaining({ kind: 'meeting' })]),
    )
  })

  it('ÉCARTE un créneau TENTATIVE (proposé) — il ne compte plus comme un rendez-vous fixé', async () => {
    const { service, ingest } = makeService([event({ id: 'evt-tentative', status: 'tentative' })])
    const result = await service.sync(USER)
    const agendaResult = result.sources.find(source => source.source === 'agenda')
    expect(agendaResult?.ingested).toBe(0)
    expect(agendaResult?.skipped).toEqual([
      { ref: 'evt-tentative', reason: 'Rendez-vous proposé, pas encore confirmé' },
    ])
    expect(ingest).toHaveBeenCalledWith(WORKSPACE, USER, [])
  })

  it('ÉCARTE une ligne dont le statut est une chaîne héritée inconnue — jamais comptée confirmée', async () => {
    const { service } = makeService([event({ id: 'evt-legacy', status: 'needsAction' })])
    const result = await service.sync(USER)
    const agendaResult = result.sources.find(source => source.source === 'agenda')
    expect(agendaResult?.ingested).toBe(0)
    expect(agendaResult?.skipped[0]?.reason).toBe('Rendez-vous proposé, pas encore confirmé')
  })

  it('garde le motif « annulé » distinct de « proposé »', async () => {
    const { service } = makeService([event({ id: 'evt-cancelled', status: 'cancelled', cancelled: true })])
    const result = await service.sync(USER)
    const agendaResult = result.sources.find(source => source.source === 'agenda')
    expect(agendaResult?.skipped).toEqual([{ ref: 'evt-cancelled', reason: 'Rendez-vous annulé' }])
  })

  it('AVANT/APRÈS sur un lot mêlant propositions et confirmations : seules les confirmations comptent', async () => {
    const { service } = makeService([
      event({ id: 'evt-1', status: 'confirmed' }),
      event({ id: 'evt-2', status: 'confirmed' }),
      event({ id: 'evt-3', status: 'tentative' }),
      event({ id: 'evt-4', status: 'tentative' }),
    ])
    const result = await service.sync(USER)
    const agendaResult = result.sources.find(source => source.source === 'agenda')
    // Avant ce correctif, les quatre évènements (non annulés) auraient été
    // comptés — le compteur de « Rendez-vous » aurait affiché 4 au lieu de 2.
    expect(agendaResult?.ingested).toBe(2)
  })
})

describe('ActivityCaptureService — #2126.6 : « connecteur absent » se distingue d’une panne', () => {
  it('marque `reason: "not_connected"` quand la téléphonie n’est pas branchée', async () => {
    const { service } = makeService([])
    const result = await service.sync(USER)
    const telephonyResult = result.sources.find(source => source.source === 'telephony')
    expect(telephonyResult?.unavailable).not.toBeNull()
    expect(telephonyResult?.reason).toBe('not_connected')
  })

  it('marque `reason: "not_connected"` quand la messagerie n’est pas branchée', async () => {
    const { service } = makeService([])
    const result = await service.sync(USER)
    const mailboxResult = result.sources.find(source => source.source === 'mailbox')
    expect(mailboxResult?.unavailable).not.toBeNull()
    expect(mailboxResult?.reason).toBe('not_connected')
  })

  it('marque `reason: "error"` — jamais `not_connected` — quand l’agenda est branché mais que la lecture échoue', async () => {
    const ingest = jest.fn(async (_workspaceId: string, _userId: string | null, inputs: readonly unknown[]) => ({
      ingested: inputs.length,
      duplicates: 0,
    }))
    const activities = { ingest } as never
    const mailbox = { listRecentMessages: jest.fn(async () => null) } as never
    const agenda = {
      status: jest.fn(async () => ({ connected: true, provider: 'google', capabilities: { read: true, write: true } })),
      listEvents: jest.fn(async () => {
        throw new Error('Graph 503')
      }),
    } as never
    const telephony = { status: jest.fn(async () => ({ connected: false })) } as never
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })),
      isDemoWorkspace: jest.fn(async () => false),
    } as never
    const syncState = { manager: { query: jest.fn(async () => []) } } as never
    const service = new ActivityCaptureService(activities, mailbox, agenda, telephony, workspaceContext, syncState)

    const result = await service.sync(USER)
    const agendaResult = result.sources.find(source => source.source === 'agenda')
    expect(agendaResult?.unavailable).toBe('Graph 503')
    expect(agendaResult?.reason).toBe('error')
  })
})
