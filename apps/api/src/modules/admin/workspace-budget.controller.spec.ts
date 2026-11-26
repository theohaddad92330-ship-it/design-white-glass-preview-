import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceBudgetController } from './workspace-budget.controller'
import { WorkspaceBudgetService } from './workspace-budget.service'

type MockService = {
  getLevers: jest.Mock
  setLevers: jest.Mock
  checkGate: jest.Mock
  getToolQuotas: jest.Mock
}

describe('WorkspaceBudgetController', () => {
  let svc: MockService
  let controller: WorkspaceBudgetController

  beforeEach(() => {
    svc = {
      getLevers: jest.fn().mockResolvedValue({
        monthlyBudgetUsd: null,
        perMemberCapUsd: null,
        perActionCapUsd: null,
        alertOnOverage: true,
        blockAtCap: false,
      }),
      setLevers: jest.fn().mockResolvedValue(undefined),
      checkGate: jest.fn().mockResolvedValue({ allowed: true, overCap: null }),
      getToolQuotas: jest
        .fn()
        .mockResolvedValue([{ tool: 'analysis', capUsd: 5, spentTodayUsd: 2, unpricedLines: 0, reached: false }]),
    }
    controller = new WorkspaceBudgetController(svc as unknown as WorkspaceBudgetService)
  })

  it('est gardé par InternalSecretGuard — jamais atteignable par un JWT utilisateur', () => {
    const guards = Reflect.getMetadata('__guards__', WorkspaceBudgetController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('lit les leviers d’un espace', async () => {
    const result = await controller.getLevers('w1')
    expect(svc.getLevers).toHaveBeenCalledWith('w1')
    expect(result.monthlyBudgetUsd).toBeNull()
  })

  it('écrit les leviers d’un espace', async () => {
    const body = {
      monthlyBudgetUsd: 500,
      perMemberCapUsd: null,
      perActionCapUsd: null,
      alertOnOverage: true,
      blockAtCap: true,
    }
    await controller.setLevers('w1', body)
    expect(svc.setLevers).toHaveBeenCalledWith('w1', body)
  })

  it('appelle la porte avec le coût ESTIMÉ avant l’action', async () => {
    const body = { actorUserId: 'u1', actionKey: 'chat', estimatedCostUsd: 3 }
    const verdict = await controller.checkGate('w1', body)
    expect(svc.checkGate).toHaveBeenCalledWith('w1', 'u1', 'chat', 3)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })

  it('#2440.45 — lit le quota quotidien par outil d’UN espace (mesure back-office)', async () => {
    const result = await controller.getToolQuotas('w1')
    expect(svc.getToolQuotas).toHaveBeenCalledWith('w1')
    expect(result).toEqual([{ tool: 'analysis', capUsd: 5, spentTodayUsd: 2, unpricedLines: 0, reached: false }])
  })
})
