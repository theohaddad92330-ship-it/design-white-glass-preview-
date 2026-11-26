import { CopilotTerritoryPlanController } from './copilot-territory-plan.controller'
import { CopilotTerritoryPlanDto } from './dto/copilot-bridge.dto'

const USER = '99999999-9999-4999-8999-999999999999'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('CopilotTerritoryPlanController (#2337)', () => {
  it('lit les faits dans l’espace ACTIF du demandeur, jamais un espace passé par l’appelant', async () => {
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role: 'member' })) }
    const facts = { collect: jest.fn(async () => ({ talents: [], accounts: [] })) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotTerritoryPlanController(workspaceContext as any, facts as any)
    await controller.territoryPlan({ userId: USER, consultantIds: [A, B] })
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith(USER)
    expect(facts.collect).toHaveBeenCalledWith([A, B], 'ws-1', USER)
  })

  it('refuse un seul talent (le marché inversé y répond) et plus de quatre', () => {
    const schema = CopilotTerritoryPlanDto.schema
    expect(schema.safeParse({ userId: USER, consultantIds: [A] }).success).toBe(false)
    expect(schema.safeParse({ userId: USER, consultantIds: [A, B] }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, consultantIds: [A, B, A, B, A] }).success).toBe(false)
    // `.strict()` : un espace glissé par l'appelant n'est pas lu, il est refusé.
    expect(schema.safeParse({ userId: USER, consultantIds: [A, B], workspaceId: 'x' }).success).toBe(false)
  })
})
