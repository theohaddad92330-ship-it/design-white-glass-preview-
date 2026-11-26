import type { ChatConversationDetail, ChatConversationVersion } from '@bellum/contracts'
import { can } from '@bellum/contracts'
import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ChatConversationsService } from './chat-conversations.service'
import {
  ChatConversationAttachDto,
  ChatConversationAuditSnapshotDto,
  ChatConversationBranchDto,
  ChatConversationLegalHoldDto,
  ChatConversationOwnerDto,
  ChatConversationRefDto,
} from './dto/ia-proxy.dto'

/**
 * #2430 — les routes de L'OBJET CONVERSATION (décision de Louis, 22/09/2026
 * soir, §10) : lire, brancher, transférer, rattacher, conserver, figer.
 *
 * Mêmes portes que les gestes sur un fil (`archiveChatThread`,
 * `renameChatThread` dans `ia-proxy.controller.ts`) : palier `chat_ai`,
 * `records:write` pour toute écriture (les fils sont une ressource d'équipe),
 * espace résolu depuis le jeton — jamais depuis le corps. Un contrôleur à part
 * pour ne pas ajouter six routes à un fichier de 2 400 lignes ; même préfixe
 * (`/ia`), mêmes gardes.
 */
@Controller('ia')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ChatConversationsController {
  constructor(
    private readonly conversations: ChatConversationsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** `team:manage` — ce qui fait un GÉRANT de l'espace, la même paire que `deleteChatThread`. */
  private async context(userId: string): Promise<{ workspaceId: string; canManage: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return { workspaceId, canManage: can(role, extra, 'team:manage') }
  }

  /** #2430.11 — ce que la conversation porte. Une lecture : `chat_ai` seul, comme `GET chat/messages`. */
  @RequireFeature('chat_ai')
  @Get('chat/conversations/detail')
  // GA-05 — une LECTURE bornée à l'espace de l'appelant, qui lit déjà ce fil à l'écran.
  @WorkspaceRead()
  async detail(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ChatConversationRefDto,
  ): Promise<ChatConversationDetail & { canManage: boolean }> {
    const { workspaceId, canManage } = await this.context(user.userId)
    const detail = await this.conversations.detail({
      workspaceId,
      userId: user.userId,
      conversationId: query.conversationId,
    })
    if (!detail) throw new NotFoundException('Conversation introuvable dans cet espace.')
    // L'écran n'offre la conservation légale qu'à qui peut la poser.
    return { ...detail, canManage }
  }

  /** #2430.2 — explorer une autre hypothèse dans un fil neuf, relié à son origine. */
  @RequireFeature('chat_ai')
  @Post('chat/conversations/branch')
  @RequirePermission('records:write')
  async branch(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChatConversationBranchDto,
  ): Promise<{ conversationId: string }> {
    const { workspaceId } = await this.context(user.userId)
    return this.conversations.branch({
      workspaceId,
      userId: user.userId,
      fromConversationId: dto.fromConversationId,
      fromMessageId: dto.fromMessageId ?? null,
    })
  }

  /** #2430.12 — transférer la conversation à un membre de l'espace. */
  @RequireFeature('chat_ai')
  @Post('chat/conversations/owner')
  @RequirePermission('records:write')
  async setOwner(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatConversationOwnerDto) {
    const { workspaceId, canManage } = await this.context(user.userId)
    await this.conversations.setOwner({
      workspaceId,
      userId: user.userId,
      canManage,
      // GA-07 — l'appartenance se lit ICI (un service ne va pas chercher le
      // service d'un autre module) ; le service refuse un non-membre.
      ownerIsMember: Boolean(await this.workspaceContext.getMembership(dto.ownerUserId, workspaceId)),
      conversationId: dto.conversationId,
      ownerUserId: dto.ownerUserId,
    })
    return { ownerUserId: dto.ownerUserId }
  }

  /** #2430.12 — rattacher la conversation à un compte de l'espace (ou la détacher). */
  @RequireFeature('chat_ai')
  @Post('chat/conversations/attach')
  @RequirePermission('records:write')
  async attach(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatConversationAttachDto) {
    const { workspaceId } = await this.context(user.userId)
    await this.conversations.attach({
      workspaceId,
      userId: user.userId,
      conversationId: dto.conversationId,
      accountId: dto.accountId,
    })
    return { attachedAccountId: dto.accountId }
  }

  /**
   * #2075.29 / #2075.30 — poser le snapshot audit à l'ouverture du fil depuis
   * l'audit commercial. `records:write` comme les autres écritures de cette
   * table : c'est un fil d'équipe, jamais une donnée privée à l'auteur.
   */
  @RequireFeature('chat_ai')
  @Post('chat/conversations/audit-snapshot')
  @RequirePermission('records:write')
  async attachAuditSnapshot(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatConversationAuditSnapshotDto) {
    const { workspaceId } = await this.context(user.userId)
    await this.conversations.attachAuditSnapshot({
      workspaceId,
      userId: user.userId,
      conversationId: dto.conversationId,
      snapshot: {
        auditVersion: dto.auditVersion,
        strategy: dto.strategy,
        firstActions: dto.firstActions,
        unknowns: dto.unknowns,
      },
    })
    return { conversationId: dto.conversationId }
  }

  /** #2430.10 — poser ou lever la conservation légale (gérant de l'espace seulement). */
  @RequireFeature('chat_ai')
  @Post('chat/conversations/legal-hold')
  @RequirePermission('records:write')
  async setLegalHold(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatConversationLegalHoldDto) {
    const { workspaceId, canManage } = await this.context(user.userId)
    await this.conversations.setLegalHold({
      workspaceId,
      userId: user.userId,
      canManage,
      conversationId: dto.conversationId,
      hold: dto.hold,
      reason: dto.reason,
      reviewBy: dto.reviewBy,
    })
    return { hold: dto.hold }
  }

  /** #2430.4 — figer une version à partager : une borne sur le même fil, jamais une copie. */
  @RequireFeature('chat_ai')
  @Post('chat/conversations/snapshot')
  @RequirePermission('records:write')
  async snapshot(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChatConversationRefDto,
  ): Promise<ChatConversationVersion> {
    const { workspaceId } = await this.context(user.userId)
    return this.conversations.snapshot({ workspaceId, userId: user.userId, conversationId: dto.conversationId })
  }
}
