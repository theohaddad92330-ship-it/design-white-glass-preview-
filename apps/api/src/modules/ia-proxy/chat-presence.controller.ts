import type { ChatPresenceMember } from '@bellum/contracts'
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ChatPresenceService } from './chat-presence.service'
import { ChatPresenceHeartbeatDto, ChatPresenceQueryDto } from './dto/ia-proxy.dto'

/**
 * #3086 — présence sur un fil de Laura. Un contrôleur à part, comme les routes
 * de l'objet conversation (`chat-conversations.controller.ts`) : même préfixe
 * (`/ia`), même garde `chat_ai` que le reste du fil qu'elle décrit — n'importe
 * quel membre qui peut LIRE ou ÉCRIRE dans le fil peut y signaler sa présence,
 * jamais une permission à part pour un signal qui ne touche aucun contenu
 * d'équipe (`@WorkspaceRead`, D39 : ni l'écriture ni la lecture n'ont de
 * permission MUTANTE à déclarer ici).
 */
@Controller('ia')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ChatPresenceController {
  constructor(
    private readonly presence: ChatPresenceService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Le navigateur bat toutes les 10 s tant que le fil reste ouvert (`useChatPresence.ts`). */
  @RequireFeature('chat_ai')
  @Post('chat/presence')
  @WorkspaceRead()
  async heartbeat(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ChatPresenceHeartbeatDto,
  ): Promise<{ ok: true }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.presence.heartbeat({
      userId: user.userId,
      workspaceId,
      accountId: body.accountId ?? null,
      conversationId: body.conversationId ?? null,
      isDemoWorkspace: await this.workspaceContext.isDemoWorkspace(user.userId),
    })
    return { ok: true }
  }

  /** Qui d'autre, dans l'espace, a ce même fil ouvert MAINTENANT. */
  @RequireFeature('chat_ai')
  @Get('chat/presence')
  @WorkspaceRead()
  async activeMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ChatPresenceQueryDto,
  ): Promise<{ members: ChatPresenceMember[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const members = await this.presence.activeMembers({
      userId: user.userId,
      workspaceId,
      accountId: query.accountId ?? null,
      conversationId: query.conversationId ?? null,
      isDemoWorkspace: await this.workspaceContext.isDemoWorkspace(user.userId),
    })
    return { members }
  }
}
