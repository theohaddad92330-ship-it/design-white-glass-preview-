import type { CrmFirstImportState } from '@bellum/contracts'
import { CrmFirstImportEnqueuer } from './crm-first-import.enqueuer'
import { crmFirstImportJobId } from './crm-first-import.queue'

const DATA = { userId: 'u1', workspaceId: 'w1', provider: 'pipedrive' as const }
const done: CrmFirstImportState = {
  provider: 'pipedrive',
  state: 'done',
  startedAt: '2026-10-19T08:00:00.000Z',
  finishedAt: '2026-10-19T08:02:00.000Z',
  message: null,
  reconnectNeeded: false,
  objects: [{ object: 'contacts', status: 'done', count: 1240, conflicts: 0, truncated: false, error: null }],
}

function build(job?: {
  state: string
  finishedOn?: number
  returnvalue?: unknown
  progress?: unknown
  failedReason?: string
}) {
  const remove = jest.fn()
  const queue = {
    getJob: jest.fn().mockResolvedValue(
      job
        ? {
            getState: async () => job.state,
            remove,
            returnvalue: job.returnvalue,
            progress: job.progress,
            failedReason: job.failedReason,
            finishedOn: job.finishedOn,
          }
        : undefined,
    ),
    add: jest.fn().mockResolvedValue(undefined),
  }
  return { enqueuer: new CrmFirstImportEnqueuer(queue as never), queue, remove }
}

describe('CrmFirstImportEnqueuer', () => {
  it('met la reprise en file sous un identifiant (espace, CRM)', async () => {
    const { enqueuer, queue } = build()
    expect(await enqueuer.enqueue(DATA)).toBe('queued')
    expect(queue.add).toHaveBeenCalledWith('first-import', DATA, { jobId: crmFirstImportJobId('w1', 'pipedrive') })
  })

  it('ne double rien quand un job tourne déjà', async () => {
    const { enqueuer, queue } = build({ state: 'active' })
    expect(await enqueuer.enqueue(DATA)).toBe('already_running')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('remplace une reprise terminée lors d’un rebranchement', async () => {
    const { enqueuer, queue, remove } = build({ state: 'completed' })
    expect(await enqueuer.enqueue(DATA)).toBe('queued')
    expect(remove).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalled()
  })

  it('ne lève jamais quand Redis est indisponible', async () => {
    const { enqueuer, queue } = build()
    queue.add.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await enqueuer.enqueue(DATA)).toBe('failed')
  })

  it('relit l’état terminé, la progression en cours, et l’échec nommé', async () => {
    expect(await build({ state: 'completed', returnvalue: done }).enqueuer.states('w1', ['pipedrive'])).toEqual([done])
    const running = { ...done, state: 'running' as const, finishedAt: null }
    expect(
      await build({ state: 'active', progress: running }).enqueuer.states(
        'w1',
        ['pipedrive'],
        Date.parse(done.startedAt ?? '') + 60_000,
      ),
    ).toEqual([running])
    const failed = await build({ state: 'failed', failedReason: 'boom' }).enqueuer.states('w1', ['pipedrive'])
    expect(failed[0]).toMatchObject({ state: 'failed', message: 'boom' })
    expect(await build().enqueuer.states('w1', ['pipedrive'])).toEqual([])
  })

  it('un job « en cours » abandonné par son travailleur passe à failed, pas à un spinner éternel', async () => {
    const running = { ...done, state: 'running' as const, finishedAt: null }
    const late = Date.parse(done.startedAt ?? '') + 3 * 60 * 60 * 1000
    const [state] = await build({ state: 'active', progress: running }).enqueuer.states('w1', ['pipedrive'], late)
    expect(state?.state).toBe('failed')
  })
})

describe('CrmFirstImportEnqueuer.enqueueCatchUp — CRM-SYNC-D.1', () => {
  const NOW = Date.parse('2026-10-19T20:00:00.000Z')

  it('met en file la reprise d’un CRM qui n’en a jamais eu', async () => {
    const { enqueuer, queue } = build()
    expect(await enqueuer.enqueueCatchUp(DATA, NOW)).toBe('queued')
    expect(queue.add).toHaveBeenCalledTimes(1)
  })

  it('un job en file ou actif ne se double jamais', async () => {
    const { enqueuer, queue } = build({ state: 'waiting' })
    expect(await enqueuer.enqueueCatchUp(DATA, NOW)).toBe('already_running')
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('une reprise en échec depuis moins d’une heure recule : au plus une fois par heure', async () => {
    const { enqueuer, queue, remove } = build({ state: 'failed', finishedOn: NOW - 20 * 60_000 })
    expect(await enqueuer.enqueueCatchUp(DATA, NOW)).toBe('backoff')
    expect(queue.add).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('une reprise en échec depuis plus d’une heure se reprend (l’ancien job est remplacé)', async () => {
    const { enqueuer, queue, remove } = build({ state: 'failed', finishedOn: NOW - 61 * 60_000 })
    expect(await enqueuer.enqueueCatchUp(DATA, NOW)).toBe('queued')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledTimes(1)
  })

  it('une reprise terminée sans curseur recule aussi (pas de boucle toutes les 15 min)', async () => {
    const { enqueuer, queue } = build({ state: 'completed', finishedOn: NOW - 5 * 60_000 })
    expect(await enqueuer.enqueueCatchUp(DATA, NOW)).toBe('backoff')
    expect(queue.add).not.toHaveBeenCalled()
  })
})
