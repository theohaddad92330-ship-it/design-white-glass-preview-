import { AnalysisGateway } from './analysis.gateway'
import { InternalProgressController } from './internal-progress.controller'

// Secret validation moved out of the controller into ``InternalSecretGuard``
// (header-based, env secret) — see internal-secret.guard.spec.ts. The
// controller's sole job now is forwarding the validated payload to the gateway.
describe('InternalProgressController', () => {
  let gateway: { emitPhaseProgress: jest.Mock }
  let controller: InternalProgressController

  beforeEach(() => {
    gateway = { emitPhaseProgress: jest.fn() }
    controller = new InternalProgressController(gateway as unknown as AnalysisGateway)
  })

  const payload = {
    accountId: 'acc-1',
    jobId: 'job-1',
    phase: 'research',
    step: 'crosscheck' as const,
    percent: 20,
  }

  it('forwards the progress payload to the gateway', () => {
    controller.progress({ ...payload, message: 'hi' })
    expect(gateway.emitPhaseProgress).toHaveBeenCalledWith('acc-1', 'job-1', 'research', 'crosscheck', 20, 'hi')
  })

  it('forwards without a message (undefined passes through)', () => {
    controller.progress(payload)
    expect(gateway.emitPhaseProgress).toHaveBeenCalledWith('acc-1', 'job-1', 'research', 'crosscheck', 20, undefined)
  })
})
