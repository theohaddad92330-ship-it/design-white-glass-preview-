import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminQueuesController } from './admin-queues.controller'
import { AdminQueuesService } from './admin-queues.service'

type MockService = {
  listQueues: jest.Mock
  listJobs: jest.Mock
  retryJob: jest.Mock
  removeJob: jest.Mock
  cleanState: jest.Mock
}

describe('AdminQueuesController', () => {
  let svc: MockService
  let controller: AdminQueuesController

  beforeEach(() => {
    svc = {
      listQueues: jest.fn().mockResolvedValue([]),
      listJobs: jest.fn().mockResolvedValue({ queue: 'analysis', state: 'failed', jobs: [], total: 0 }),
      retryJob: jest.fn().mockResolvedValue({ ok: true }),
      removeJob: jest.fn().mockResolvedValue({ ok: true }),
      cleanState: jest.fn().mockResolvedValue({ removed: 2 }),
    }
    controller = new AdminQueuesController(svc as unknown as AdminQueuesService)
  })

  it('is guarded by InternalSecretGuard at the class level', () => {
    // Losing the guard would expose the pipeline queues (and their mutations) to
    // the whole internet — regression tripwire, mirroring AdminOpsController.
    const guards = Reflect.getMetadata('__guards__', AdminQueuesController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('lists queues', async () => {
    await controller.list()
    expect(svc.listQueues).toHaveBeenCalledTimes(1)
  })

  it('lists jobs for a queue+state with pagination', async () => {
    await controller.jobs('analysis', { state: 'failed', limit: 20, offset: 40 })
    expect(svc.listJobs).toHaveBeenCalledWith('analysis', 'failed', 20, 40)
  })

  it('defaults pagination when not provided', async () => {
    await controller.jobs('analysis', { state: 'waiting' })
    const [, , limit, offset] = svc.listJobs.mock.calls[0]!
    expect(typeof limit).toBe('number')
    expect(offset).toBe(0)
  })

  it('forwards the operator actor to the retry mutation', async () => {
    await controller.retry('analysis', 'job-1', { actor: 'ops@bellum' })
    expect(svc.retryJob).toHaveBeenCalledWith('analysis', 'job-1', 'ops@bellum')
  })

  it('forwards the remove mutation', async () => {
    await controller.remove('mailer', 'job-2', {})
    expect(svc.removeJob).toHaveBeenCalledWith('mailer', 'job-2', 'backoffice')
  })

  it('forwards the clean mutation with the state from the query', async () => {
    await controller.clean('analysis', { state: 'failed' }, { actor: 'ops' })
    expect(svc.cleanState).toHaveBeenCalledWith('analysis', 'failed', 'ops')
  })
})
