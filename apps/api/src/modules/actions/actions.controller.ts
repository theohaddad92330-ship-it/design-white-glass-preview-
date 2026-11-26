import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import type { ActionHistoryItem, ActionHistoryResponse, SinceLastSeen, WeeklyStats } from '@bellum/contracts'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActionsService } from './actions.service'
import { LastSeenService } from './last-seen.service'
import { TrackActionDto } from './dto/track-action.dto'
import { ListActionHistoryDto } from './dto/list-action-history.dto'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'

@Controller('actions')
@UseGuards(JwtGuard)
export class ActionsController {
  constructor(
    private readonly actionsService: ActionsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly lastSeen: LastSeenService,
  ) {}

  @Post('track')
  async track(
    @Body() dto: TrackActionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{
    id: string
  }> {
    // Multi-user Phase 2: the activity feed is team-scoped. Stamp the actor
    // (`user_id` from the JWT) and the active workspace (read scope).
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.actionsService.track(dto, user.userId, workspaceId)
  }

  @Get('weekly-stats')
  async weeklyStats(@CurrentUser() user: CurrentUserPayload): Promise<WeeklyStats> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.actionsService.getWeeklyStats(workspaceId)
  }

  @Get('history')
  async history(
    @Query() query: ListActionHistoryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ActionHistoryResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.actionsService.listHistory(workspaceId, query, user.userId)
  }

  @Get('history/:id')
  async historyItem(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<ActionHistoryItem> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.actionsService.getHistoryItem(workspaceId, id)
  }

  /**
   * Pose/rafraîchit le repère « depuis ma dernière connexion » et renvoie
   * l'instant de la visite précédente. Appelé une fois à l'ouverture du Journal
   * (pas à chaque requête) : le repère n'avance que sur une vraie nouvelle
   * session, jamais sur un rechargement. `since: null` = première visite.
   */
  @Post('mark-seen')
  @HttpCode(200)
  async markSeen(@CurrentUser() user: CurrentUserPayload): Promise<SinceLastSeen> {
    return this.lastSeen.markSeen(user.userId)
  }
}
