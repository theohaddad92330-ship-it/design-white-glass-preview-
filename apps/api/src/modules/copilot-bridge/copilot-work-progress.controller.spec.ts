import { ServiceUnavailableException } from '@nestjs/common'
import { CopilotWorkProgressController } from './copilot-work-progress.controller'

// #4611 — le pont résout l'espace et le périmètre DEPUIS le userId ; il ne les reçoit jamais.
const USER = '11111111-1111-4111-8111-111111111111'
const LOT = '22222222-2222-4222-8222-222222222222'

function build(scope: { businessUnitIds: string[]; includeUnassigned: true } | null = null) {
  const progress = { read: jest.fn().mockResolvedValue({ kind: 'progress', families: [] }) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
  }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(scope) }
  return {
    progress,
    workspaceContext,
    businessUnits,
    controller: new CopilotWorkProgressController(progress as never, workspaceContext as never, businessUnits as never),
  }
}

describe('CopilotWorkProgressController — #4611', () => {
  it('lit avec l’espace et le périmètre RÉSOLUS du userId', async () => {
    const scope = { businessUnitIds: ['bu-1'], includeUnassigned: true as const }
    const { controller, progress, businessUnits } = build(scope)
    await controller.read({ userId: USER })
    expect(businessUnits.scopeFor).toHaveBeenCalledWith('ws-1', USER)
    expect(progress.read).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: USER, businessUnitScope: scope })
  })

  it('transmet le lot demandé au service, qui seul décide du refus', async () => {
    const { controller, progress } = build()
    await controller.read({ userId: USER, lotId: LOT })
    expect(progress.read).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', lotId: LOT }))
  })

  it('sans service de périmètre, LÈVE : jamais l’espace entier ouvert en silence', async () => {
    const progress = { read: jest.fn() }
    const controller = new CopilotWorkProgressController(
      progress as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }) } as never,
    )
    await expect(controller.read({ userId: USER })).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(progress.read).not.toHaveBeenCalled()
  })
})
