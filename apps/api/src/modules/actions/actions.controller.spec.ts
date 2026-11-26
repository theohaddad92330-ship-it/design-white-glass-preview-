import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActionsController } from './actions.controller'
import type { ActionsService } from './actions.service'
import type { LastSeenService } from './last-seen.service'
import type { TrackActionDto } from './dto/track-action.dto'
import type { ListActionHistoryDto } from './dto/list-action-history.dto'

describe('ActionsController (multi-user Phase 2)', () => {
  const user = { userId: 'user-1' } as CurrentUserPayload

  function build() {
    const actionsService = {
      track: jest.fn().mockResolvedValue({ id: 'a-1' }),
      getWeeklyStats: jest.fn().mockResolvedValue({}),
      listHistory: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
      getHistoryItem: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ActionsService>
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace'>>
    const lastSeen = {
      markSeen: jest.fn().mockResolvedValue({ since: '2026-07-22T18:00:00.000Z' }),
    } as unknown as jest.Mocked<LastSeenService>
    return {
      actionsService,
      workspaceContext,
      lastSeen,
      controller: new ActionsController(
        actionsService as unknown as ActionsService,
        workspaceContext as unknown as WorkspaceContextService,
        lastSeen as unknown as LastSeenService,
      ),
    }
  }

  it('track stamps the JWT user_id (actor) and the resolved workspace_id', async () => {
    const { controller, actionsService, workspaceContext } = build()
    await controller.track({ action_type: 'message_sent' } as TrackActionDto, user)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(actionsService.track).toHaveBeenCalledWith({ action_type: 'message_sent' }, 'user-1', 'ws-1')
  })

  it('weeklyStats reads scoped to the resolved workspace', async () => {
    const { controller, actionsService } = build()
    await controller.weeklyStats(user)
    expect(actionsService.getWeeklyStats).toHaveBeenCalledWith('ws-1')
  })

  it('history reads scoped to the resolved workspace', async () => {
    const { controller, actionsService } = build()
    await controller.history({ limit: 25 } as ListActionHistoryDto, user)
    expect(actionsService.listHistory).toHaveBeenCalledWith('ws-1', { limit: 25 }, 'user-1')
  })

  it('history item reads scoped to the resolved workspace', async () => {
    const { controller, actionsService } = build()
    await controller.historyItem('id-1', user)
    expect(actionsService.getHistoryItem).toHaveBeenCalledWith('ws-1', 'id-1')
  })

  it('mark-seen delegates to the actor (never the workspace) and returns the reference', async () => {
    const { controller, lastSeen } = build()
    const result = await controller.markSeen(user)
    expect(lastSeen.markSeen).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({ since: '2026-07-22T18:00:00.000Z' })
  })
})
