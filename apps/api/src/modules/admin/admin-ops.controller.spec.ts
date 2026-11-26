import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminOpsController } from './admin-ops.controller'
import { AdminOpsService } from './admin-ops.service'

type MockOps = {
  getUsage: jest.Mock
  getHealth: jest.Mock
  getMigrations: jest.Mock
  getModelRouting: jest.Mock
  declareModelRoutingEval: jest.Mock
  getPromptRegistry: jest.Mock
  getPromptRegistryDiff: jest.Mock
  getRightsMatrix: jest.Mock
  getMethodCorpusGovernance: jest.Mock
  getRouteMigration: jest.Mock
}

describe('AdminOpsController', () => {
  let ops: MockOps
  let controller: AdminOpsController

  beforeEach(() => {
    ops = {
      getUsage: jest.fn().mockResolvedValue({ totals: {}, byUser: [], byWorkspace: [] }),
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy', queues: [] }),
      getMigrations: jest.fn().mockResolvedValue({ total: 0, applied: [], pending: [] }),
      getModelRouting: jest.fn().mockResolvedValue({ available: true, routes: [] }),
      declareModelRoutingEval: jest.fn().mockResolvedValue({ ok: true }),
      getPromptRegistry: jest.fn().mockResolvedValue({ available: true, prompts: [] }),
      getPromptRegistryDiff: jest.fn().mockResolvedValue({ available: true, diff: '', rollbackCommand: [] }),
      getRightsMatrix: jest.fn().mockResolvedValue({ available: true, tools: [] }),
      getMethodCorpusGovernance: jest.fn().mockResolvedValue({
        corpusVersion: '1.2.0',
        releasedAt: '2026-09-29',
        runtimeCrossCheckAvailable: true,
        rules: [],
        changeLog: [],
      }),
      getRouteMigration: jest.fn().mockReturnValue({
        registry: { total: 0, redirectedCount: 0, entries: [] },
        goNoGo: { canGo: false, noGo: [], go: [] },
      }),
    }
    controller = new AdminOpsController(ops as unknown as AdminOpsService)
  })

  it('is guarded by InternalSecretGuard at the class level', () => {
    // Losing the guard would expose the whole (cross-tenant) database — this is a
    // regression tripwire, mirroring the InternalAdminController spec.
    const guards = Reflect.getMetadata('__guards__', AdminOpsController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('delegates usage to the service', async () => {
    await controller.getUsage()
    expect(ops.getUsage).toHaveBeenCalledTimes(1)
  })

  it('delegates health to the service', async () => {
    await controller.getHealth()
    expect(ops.getHealth).toHaveBeenCalledTimes(1)
  })

  it('delegates migrations to the service', async () => {
    await controller.getMigrations()
    expect(ops.getMigrations).toHaveBeenCalledTimes(1)
  })

  it('delegates model routing to the service', async () => {
    await controller.getModelRouting()
    expect(ops.getModelRouting).toHaveBeenCalledTimes(1)
  })

  it('delegates model routing eval declaration to the service, with destinationKey/declaredBy/note', async () => {
    await controller.declareModelRoutingEval({
      destinationKey: 'openai:gpt-4o',
      declaredBy: 'matteo@bellum-it.com',
      note: 'rejoué',
    })
    expect(ops.declareModelRoutingEval).toHaveBeenCalledWith('openai:gpt-4o', 'matteo@bellum-it.com', 'rejoué')
  })

  it('une note absente passe null à l’IA, jamais undefined', async () => {
    await controller.declareModelRoutingEval({ destinationKey: 'openai', declaredBy: 'matteo@bellum-it.com' })
    expect(ops.declareModelRoutingEval).toHaveBeenCalledWith('openai', 'matteo@bellum-it.com', null)
  })

  it('delegates prompt registry to the service', async () => {
    await controller.getPromptRegistry()
    expect(ops.getPromptRegistry).toHaveBeenCalledTimes(1)
  })

  it('delegates prompt registry diff to the service, with name and refs', async () => {
    await controller.getPromptRegistryDiff('advisor', 'HEAD~1', 'HEAD')
    expect(ops.getPromptRegistryDiff).toHaveBeenCalledWith('advisor', 'HEAD~1', 'HEAD')
  })

  it('delegates rights matrix to the service', async () => {
    await controller.getRightsMatrix()
    expect(ops.getRightsMatrix).toHaveBeenCalledTimes(1)
  })

  it('delegates method corpus governance to the service', async () => {
    await controller.getMethodCorpusGovernance()
    expect(ops.getMethodCorpusGovernance).toHaveBeenCalledTimes(1)
  })

  it('delegates route migration status to the service', () => {
    controller.getRouteMigration()
    expect(ops.getRouteMigration).toHaveBeenCalledTimes(1)
  })
})
