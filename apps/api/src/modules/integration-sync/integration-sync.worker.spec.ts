import { CRM_PHASE_DEADLINE_MS, IntegrationSyncWorker } from './integration-sync.worker'

function build(
  opts: {
    crmSyncWorkspace?: jest.Mock
    canceledAfter?: string[]
    listEvents?: jest.Mock
    readSyncProvider?: jest.Mock
  } = {},
) {
  const advanceCalls: string[] = []
  const canceledAfter = new Set(opts.canceledAfter ?? [])
  const syncs = {
    advance: jest.fn(async (_runId: string, status: string) => {
      advanceCalls.push(status)
    }),
    isCanceled: jest.fn(async () => canceledAfter.has(advanceCalls[advanceCalls.length - 1] ?? '')),
    finishRun: jest.fn().mockResolvedValue(undefined),
    failRun: jest.fn().mockResolvedValue(undefined),
  }
  const crmSync = { syncWorkspace: opts.crmSyncWorkspace ?? jest.fn().mockResolvedValue(undefined) }
  const agenda = { listEvents: opts.listEvents ?? jest.fn().mockResolvedValue([]) }
  const readSync = { syncProvider: opts.readSyncProvider ?? jest.fn().mockResolvedValue({ ran: true, outcomes: [] }) }
  const worker = new IntegrationSyncWorker(syncs as never, crmSync as never, agenda as never, readSync as never)
  return { worker, syncs, crmSync, readSync, agenda, advanceCalls }
}

const jobFor = (provider: string) =>
  ({ data: { runId: 'run-1', workspaceId: 'ws-1', userId: 'user-1', provider } }) as never

describe('IntegrationSyncWorker — le job réel derrière la première synchronisation (#2980)', () => {
  it('traverse detecting_events/preparing_summary et referme le run pour un provider sans CRM (notion)', async () => {
    const { worker, syncs, crmSync, advanceCalls } = build()
    await worker.process(jobFor('notion'))
    expect(crmSync.syncWorkspace).not.toHaveBeenCalled()
    expect(advanceCalls).toEqual(['reading_sources', 'detecting_events', 'preparing_summary'])
    expect(syncs.finishRun).toHaveBeenCalledWith('run-1', 'ws-1', 0)
  })

  it('#2388.42 — thread le nombre de rendez-vous à préparer vers `finishRun`', async () => {
    const listEvents = jest.fn().mockResolvedValue([{ id: 'e-1' }, { id: 'e-2' }])
    const { worker, syncs, agenda } = build({ listEvents })
    await worker.process(jobFor('notion'))
    expect(agenda.listEvents).toHaveBeenCalledWith('user-1', expect.objectContaining({ limit: 50 }))
    expect(syncs.finishRun).toHaveBeenCalledWith('run-1', 'ws-1', 2)
  })

  it('#2388.42 — un agenda muet ne bloque pas la clôture, `meetingsToPrepare` reste `undefined`', async () => {
    const listEvents = jest.fn().mockRejectedValue(new Error('agenda down'))
    const { worker, syncs } = build({ listEvents })
    await worker.process(jobFor('notion'))
    expect(syncs.finishRun).toHaveBeenCalledWith('run-1', 'ws-1', undefined)
  })

  it('traverse matching_accounts/matching_contacts autour de `crmSync.syncWorkspace` pour un connecteur CRM', async () => {
    const { worker, syncs, crmSync, advanceCalls } = build()
    await worker.process(jobFor('hubspot'))
    expect(crmSync.syncWorkspace).toHaveBeenCalledWith('ws-1')
    expect(advanceCalls).toEqual([
      'reading_sources',
      'matching_accounts',
      'matching_contacts',
      'detecting_events',
      'preparing_summary',
    ])
    expect(syncs.finishRun).toHaveBeenCalled()
  })

  it('referme le run en échec si la synchro CRM échoue — jamais un `finishRun`', async () => {
    const crmSyncWorkspace = jest.fn().mockRejectedValue(new Error('token expired'))
    const { worker, syncs } = build({ crmSyncWorkspace })
    await worker.process(jobFor('hubspot'))
    expect(syncs.failRun).toHaveBeenCalledWith('run-1', 'hubspot', expect.any(Error))
    expect(syncs.finishRun).not.toHaveBeenCalled()
  })

  it('une annulation après `reading_sources` arrête le job avant tout appel fournisseur — rien de plus n’est perdu', async () => {
    const { worker, syncs, crmSync } = build({ canceledAfter: ['reading_sources'] })
    await worker.process(jobFor('hubspot'))
    expect(crmSync.syncWorkspace).not.toHaveBeenCalled()
    expect(syncs.finishRun).not.toHaveBeenCalled()
    expect(syncs.failRun).not.toHaveBeenCalled()
  })

  it('une annulation après le rapprochement arrête le job avant `detecting_events`', async () => {
    const { worker, syncs } = build({ canceledAfter: ['matching_contacts'] })
    await worker.process(jobFor('hubspot'))
    expect(syncs.advance).not.toHaveBeenCalledWith('run-1', 'detecting_events')
    expect(syncs.finishRun).not.toHaveBeenCalled()
  })
})

// #4189 — « Synchroniser et comprendre mes données » relit aussi les CRM qui se relisent par l'adaptateur commun.
describe('IntegrationSyncWorker — la lecture incrémentale des autres CRM (#4189)', () => {
  it.each(['salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'])(
    '%s : le rapprochement part depuis le curseur de l’espace',
    async provider => {
      const { worker, readSync, advanceCalls, syncs } = build()
      await worker.process(jobFor(provider))
      expect(readSync.syncProvider).toHaveBeenCalledWith('user-1', provider)
      expect(advanceCalls).toContain('matching_accounts')
      expect(advanceCalls).toContain('matching_contacts')
      expect(syncs.finishRun).toHaveBeenCalled()
    },
  )

  it('HubSpot rejoint le chemin incrémental (SYNC-C C.3) et garde son rapprochement quotidien', async () => {
    const { worker, readSync, crmSync } = build()
    await worker.process(jobFor('hubspot'))
    expect(readSync.syncProvider).toHaveBeenCalledWith('user-1', 'hubspot')
    expect(crmSync.syncWorkspace).toHaveBeenCalled()
  })

  it('un provider sans CRM (notion) n’appelle rien', async () => {
    const { worker, readSync } = build()
    await worker.process(jobFor('notion'))
    expect(readSync.syncProvider).not.toHaveBeenCalled()
  })

  it('une lecture en échec referme le run en échec — jamais un résumé de succès', async () => {
    const readSyncProvider = jest.fn().mockRejectedValue(new Error('401 invalid_grant'))
    const { worker, syncs } = build({ readSyncProvider })
    await worker.process(jobFor('zoho'))
    expect(syncs.failRun).toHaveBeenCalledWith('run-1', 'zoho', expect.any(Error))
    expect(syncs.finishRun).not.toHaveBeenCalled()
  })

  it('une annulation après la lecture arrête le job avant `detecting_events`', async () => {
    const { worker, syncs } = build({ canceledAfter: ['matching_contacts'] })
    await worker.process(jobFor('zoho'))
    expect(syncs.advance).not.toHaveBeenCalledWith('run-1', 'detecting_events')
  })
})

describe('IntegrationSyncWorker — K.2 / K.6', () => {
  afterEach(() => jest.useRealTimers())

  it('K.2 — un CRM qui ne répond plus ferme le run en ÉCHEC à l’échéance, jamais un spinner éternel', async () => {
    jest.useFakeTimers()
    const { worker, syncs } = build({ readSyncProvider: jest.fn(() => new Promise(() => undefined)) })
    const done = worker.process(jobFor('salesforce'))
    await jest.advanceTimersByTimeAsync(CRM_PHASE_DEADLINE_MS + 1)
    await done
    expect(syncs.failRun).toHaveBeenCalledWith(
      'run-1',
      'salesforce',
      expect.objectContaining({ message: expect.stringMatching(/aucune réponse/) }),
    )
    expect(syncs.finishRun).not.toHaveBeenCalled()
  })

  it('K.6 — le résumé d’une synchro CRM ne porte pas l’agenda (aucune lecture de rendez-vous)', async () => {
    const { worker, syncs, agenda } = build()
    await worker.process(jobFor('odoo'))
    expect(agenda.listEvents).not.toHaveBeenCalled()
    expect(syncs.finishRun).toHaveBeenCalledWith('run-1', 'ws-1', undefined)
  })
})
