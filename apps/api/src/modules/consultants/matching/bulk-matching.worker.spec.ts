import type { Job } from 'bullmq'
import type { AutoNeedMatchingService } from './auto-need-matching.service'
import { AUTO_NEED_MATCH_JOB } from './auto-need-matching.queue'
import type { BulkMatchingService } from './bulk-matching.service'
import { BulkMatchingWorker } from './bulk-matching.worker'

/**
 * #2916 / #2399.2 (c93) — la file `bulk-matching` porte deux natures de job :
 * le lot lancé à la main (`match`) et le besoin entrant (`auto-need-match`).
 * Le worker les ROUTE ; il n'en confond jamais une pour l'autre.
 */
function harness() {
  const bulk = { process: jest.fn(async () => undefined), markFailed: jest.fn(async () => undefined) }
  const auto = { process: jest.fn(async () => 'done'), markFailed: jest.fn(async () => undefined) }
  const worker = new BulkMatchingWorker(
    bulk as unknown as BulkMatchingService,
    undefined,
    auto as unknown as AutoNeedMatchingService,
  )
  return { worker, bulk, auto }
}

const autoJob = (attemptsMade = 0) =>
  ({
    name: AUTO_NEED_MATCH_JOB,
    data: { needId: 'n-1', workspaceId: 'w-1', userId: 'u-1' },
    attemptsMade,
    opts: { attempts: 3 },
  }) as unknown as Job

const bulkJob = {
  name: 'match',
  data: { jobId: 'j-1', workspaceId: 'w-1', userId: 'u-1', canReadFinance: false },
} as Job

describe('BulkMatchingWorker — deux natures de job sur une file', () => {
  it('un besoin entrant part au matching automatique, jamais au lot', async () => {
    const { worker, bulk, auto } = harness()
    await worker.process(autoJob())
    expect(auto.process).toHaveBeenCalledWith({ needId: 'n-1', workspaceId: 'w-1', userId: 'u-1' })
    expect(bulk.process).not.toHaveBeenCalled()
  })

  it('un lot reste un lot', async () => {
    const { worker, bulk, auto } = harness()
    await worker.process(bulkJob)
    expect(bulk.process).toHaveBeenCalledTimes(1)
    expect(auto.process).not.toHaveBeenCalled()
  })

  it('un besoin entrant n’est marqué `failed` qu’après sa DERNIÈRE tentative', async () => {
    const { worker, auto, bulk } = harness()
    await worker.onFailed(autoJob(1), new Error('db_gone'))
    expect(auto.markFailed).not.toHaveBeenCalled()
    await worker.onFailed(autoJob(3), new Error('db_gone'))
    expect(auto.markFailed).toHaveBeenCalledTimes(1)
    expect(bulk.markFailed).not.toHaveBeenCalled()
  })
})
