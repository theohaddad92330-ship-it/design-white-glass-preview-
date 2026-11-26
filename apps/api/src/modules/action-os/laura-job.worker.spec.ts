import type { Job } from 'bullmq'
import { LAURA_JOB_OPTIONS, LauraJobWorker } from './laura-job.worker'
import type { LauraJobQueueData } from './laura-job.port'

/** #2276 tranche 2 — le worker ne fait qu'appeler l'exécuteur ; une panne rend `unknown`, jamais un retry. */
describe('LauraJobWorker', () => {
  const data: LauraJobQueueData = { jobId: 'j', workspaceId: 'w', userId: 'u', email: 'rep@esn.fr' }

  it('exécute le passage par l’exécuteur', async () => {
    const executor = { run: jest.fn(async () => undefined), markUnknown: jest.fn(async () => undefined) }
    await new LauraJobWorker(executor as never).process({ data } as Job<LauraJobQueueData>)
    expect(executor.run).toHaveBeenCalledWith(data)
  })

  it('un passage tombé rend l’étape en cours `unknown` — un timeout n’est pas un échec', async () => {
    const executor = { run: jest.fn(), markUnknown: jest.fn(async () => undefined) }
    await new LauraJobWorker(executor as never).onFailed({ data } as Job<LauraJobQueueData>, new Error('stalled'))
    expect(executor.markUnknown).toHaveBeenCalledWith(data)
  })

  it('NON : jamais de nouvelle tentative automatique (une étape peut être partie)', () => {
    expect(LAURA_JOB_OPTIONS.attempts).toBe(1)
  })
})
