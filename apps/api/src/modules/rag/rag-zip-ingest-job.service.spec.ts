import { RagZipIngestJobService, ragZipIngestJobId } from './rag-zip-ingest-job.service'

const WS = 'w-1'
const OTHER_WS = 'w-2'

type FakeJob = {
  data: { workspaceId: string }
  progress: unknown
  returnvalue: unknown
  failedReason?: string
  getState: () => Promise<string>
  remove: jest.Mock
}

function fakeJob(state: string, extra: Partial<FakeJob> = {}, workspaceId = WS): FakeJob {
  return {
    data: { workspaceId },
    progress: 0,
    returnvalue: undefined,
    getState: async () => state,
    remove: jest.fn(),
    ...extra,
  }
}

function build(existing?: FakeJob) {
  const queue = { add: jest.fn().mockResolvedValue(undefined), getJob: jest.fn().mockResolvedValue(existing) }
  return { queue, service: new RagZipIngestJobService(queue as never) }
}

describe('RagZipIngestJobService.enqueue — #3623.11 : la requête ne dépaquette plus', () => {
  it('met en file et rend tout de suite un identifiant, sans ouvrir l’archive', async () => {
    const { queue, service } = build()
    // Octets qui ne sont PAS un zip : si la requête dépaquetait, elle lèverait.
    const started = await service.enqueue('u-1', WS, Buffer.from('pas un zip').toString('base64'), {})
    expect(started.status).toBe('pending')
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add.mock.calls[0][2]).toMatchObject({ jobId: started.jobId })
    expect(queue.add.mock.calls[0][1]).toMatchObject({ workspaceId: WS, userId: 'u-1' })
  })

  it('même archive, même espace : même identifiant, aucun second job', async () => {
    const b64 = Buffer.from('archive').toString('base64')
    expect(ragZipIngestJobId(WS, b64, {})).toBe(ragZipIngestJobId(WS, b64, {}))
    const { queue, service } = build(fakeJob('active'))
    const started = await service.enqueue('u-1', WS, b64, {})
    expect(started.status).toBe('running')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('un identifiant n’a pas de « : » (séparateur de clés Redis) et dépend de l’espace', () => {
    const b64 = Buffer.from('archive').toString('base64')
    expect(ragZipIngestJobId(WS, b64, {})).not.toContain(':')
    expect(ragZipIngestJobId(WS, b64, {})).not.toBe(ragZipIngestJobId(OTHER_WS, b64, {}))
  })

  it('un job terminé libère la place pour une nouvelle tentative', async () => {
    const done = fakeJob('failed')
    const { queue, service } = build(done)
    await service.enqueue('u-1', WS, 'YQ==', {})
    expect(done.remove).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledTimes(1)
  })
})

describe('RagZipIngestJobService.status — vocabulaire des opérations (#3666.3)', () => {
  const report = { total: 1, outcomes: [{ status: 'ingested', file: 'a.txt', id: 'd1', partial: false }] }

  it.each([
    ['waiting', 'pending'],
    ['active', 'running'],
  ])('%s → %s', async (state, expected) => {
    const { service } = build(fakeJob(state))
    expect((await service.status(WS, 'j')).status).toBe(expected)
  })

  it('terminée : rend le rapport', async () => {
    const { service } = build(fakeJob('completed', { returnvalue: report }))
    expect(await service.status(WS, 'j')).toMatchObject({ status: 'completed', report })
  })

  it('terminée avec une entrée en échec : partielle', async () => {
    const partial = { total: 2, outcomes: [...report.outcomes, { status: 'failed', file: 'b', reason: 'x' }] }
    const { service } = build(fakeJob('completed', { returnvalue: partial }))
    expect((await service.status(WS, 'j')).status).toBe('partial')
  })

  it('échec du job : interrompue, avec la raison NOMMÉE', async () => {
    const { service } = build(fakeJob('failed', { failedReason: 'Archive ZIP illisible ou corrompue.' }))
    expect(await service.status(WS, 'j')).toMatchObject({
      status: 'interrupted',
      reason: 'Archive ZIP illisible ou corrompue.',
    })
  })

  it('progression réelle relayée, jamais inventée', async () => {
    const { service } = build(fakeJob('active', { progress: { processed: 3, total: 10 } }))
    expect((await service.status(WS, 'j')).progress).toEqual({ processed: 3, total: 10 })
    const none = build(fakeJob('active', { progress: 0 }))
    expect((await none.service.status(WS, 'j')).progress).toBeUndefined()
  })

  it('identifiant d’un autre espace ou inconnu : unknown, sans rien révéler', async () => {
    const { service } = build(fakeJob('completed', { returnvalue: report }, OTHER_WS))
    expect(await service.status(WS, 'j')).toEqual({ jobId: 'j', status: 'unknown' })
    const missing = build(undefined)
    expect((await missing.service.status(WS, 'j')).status).toBe('unknown')
  })
})
