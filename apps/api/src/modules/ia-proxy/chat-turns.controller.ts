import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ChatTurnRegistry, type RunningChatTurn } from '../chat-turns/chat-turn-registry'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ChatTurnsRunningQueryDto } from './dto/ia-proxy.dto'

/**
 * #4967 (lot L6) — LES RECHERCHES DE LAURA EN ARRIÈRE-PLAN, vues du navigateur.
 *
 * `GET chat/turns/running` : l'écran qui revient sur un fil (autre écran, rechargement, nouvel onglet)
 * sait qu'un tour y tourne encore, et le relit quand il a fini. `POST chat/turns/:turnId/stop` :
 * « Arrêter », le SEUL geste qui abolit un tour en arrière-plan. Les deux ne voient que les tours de
 * l'appelant (le registre filtre par auteur) : un tour d'un autre n'existe pas, il ne s'arrête pas.
 */
@Controller('ia')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ChatTurnsController {
  constructor(private readonly registry: ChatTurnRegistry) {}

  @RequireFeature('chat_ai')
  @Get('chat/turns/running')
  @WorkspaceRead()
  running(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ChatTurnsRunningQueryDto,
  ): { turns: RunningChatTurn[] } {
    return { turns: this.registry.running(user.userId, query.conversationId ?? undefined) }
  }

  @RequireFeature('chat_ai')
  @Post('chat/turns/:turnId/stop')
  @HttpCode(200)
  @WorkspaceRead()
  stop(
    @CurrentUser() user: CurrentUserPayload,
    @Param('turnId', new ParseUUIDPipe()) turnId: string,
  ): { stopped: boolean } {
    return { stopped: this.registry.stop(user.userId, turnId) }
  }
}
