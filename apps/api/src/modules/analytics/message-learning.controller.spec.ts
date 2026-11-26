import { MessageLearningController } from './message-learning.controller'
import type { MessageLearningSignalsService } from './message-learning-signals.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

describe('MessageLearningController (#2877)', () => {
  it("lit l'agrégat de l'espace du TOKEN, jamais d'un paramètre", async () => {
    const summaryForWorkspace = jest.fn().mockResolvedValue({
      express: null,
      behavioral: null,
      quality: null,
      proposedRule: null,
      history: [],
    })
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' })
    const controller = new MessageLearningController(
      { summaryForWorkspace } as unknown as MessageLearningSignalsService,
      { resolveActiveWorkspace } as unknown as WorkspaceContextService,
    )
    const result = await controller.summary({ userId: 'u-1' } as never)
    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(summaryForWorkspace).toHaveBeenCalledWith('ws-1')
    expect(result.history).toEqual([])
  })
})
