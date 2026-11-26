import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  createMessageStyleImportSchema,
  createMessageStyleRuleProposalSchema,
  createMessageStyleTemplateSchema,
  decideMessageStyleRuleProposalRequestSchema,
  messageStylePreviewCompareRequestSchema,
  transitionMessageStyleTemplateRequestSchema,
  type CreateMessageStyleImport,
  type CreateMessageStyleRuleProposal,
  type CreateMessageStyleTemplate,
  type DecideMessageStyleRuleProposalRequest,
  type MessageStyleImportResult,
  type MessageStylePreviewCompareRequest,
  type MessageStylePreviewResult,
  type MessageStyleRuleProposal,
  type MessageStyleTemplate,
  type MessageStyleUsageStats,
  type TransitionMessageStyleTemplateRequest,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MessageStyleService, type MessageStyleCtx } from './message-style.service'

/**
 * #2369.9/.10/.13/.7/.8 (épopée #2768) — la surface HTTP du socle de la
 * mémoire de style. Espace et rôle résolus depuis le TOKEN (GA-07) ; le
 * service ne reçoit que des valeurs.
 */
@Controller('message-style')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MessageStyleController {
  constructor(
    private readonly messageStyle: MessageStyleService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async ctx(user: CurrentUserPayload): Promise<MessageStyleCtx> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { userId: user.userId, workspaceId, role }
  }

  @Post('templates')
  @RequirePermission('records:write')
  async createTemplate(
    @Body(new ZodValidationPipe(createMessageStyleTemplateSchema)) dto: CreateMessageStyleTemplate,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStyleTemplate> {
    return this.messageStyle.createTemplate(await this.ctx(user), dto)
  }

  @Get('templates')
  @WorkspaceRead()
  async listTemplates(@CurrentUser() user: CurrentUserPayload): Promise<MessageStyleTemplate[]> {
    return this.messageStyle.listTemplates(await this.ctx(user))
  }

  /** #2369.12 — AVANT `templates/:id` : sinon `usage` s'y ferait lire comme un UUID (404 deviné). */
  @Get('templates/usage')
  @WorkspaceRead()
  async usageByStyle(@CurrentUser() user: CurrentUserPayload): Promise<MessageStyleUsageStats[]> {
    return this.messageStyle.getUsageByStyle(await this.ctx(user))
  }

  @Get('templates/:id')
  @WorkspaceRead()
  async getTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStyleTemplate> {
    return this.messageStyle.getTemplate(await this.ctx(user), id)
  }

  /** #2369.10 — la route offre une transition, jamais un statut écrit tel quel. */
  @Post('templates/:id/transition')
  @RequirePermission('records:write')
  async transitionTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionMessageStyleTemplateRequestSchema))
    dto: TransitionMessageStyleTemplateRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStyleTemplate> {
    return this.messageStyle.transitionTemplate(await this.ctx(user), id, dto.to)
  }

  /** #2369.7 — naît TOUJOURS `pending` ; #2369.13 — un signal exclu est refusé par le service. */
  @Post('rule-proposals')
  @RequirePermission('records:write')
  async proposeRule(
    @Body(new ZodValidationPipe(createMessageStyleRuleProposalSchema)) dto: CreateMessageStyleRuleProposal,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStyleRuleProposal> {
    return this.messageStyle.proposeRule(await this.ctx(user), dto)
  }

  @Get('rule-proposals')
  @WorkspaceRead()
  async listRuleProposals(@CurrentUser() user: CurrentUserPayload): Promise<MessageStyleRuleProposal[]> {
    return this.messageStyle.listRuleProposals(await this.ctx(user))
  }

  /** #2369.8 — adopter ou refuser engage tout l'espace : `team:manage`, jamais `records:write` seul. */
  @Post('rule-proposals/:id/decide')
  @RequirePermission('team:manage')
  async decideRuleProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideMessageStyleRuleProposalRequestSchema))
    dto: DecideMessageStyleRuleProposalRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStyleRuleProposal> {
    return this.messageStyle.decideRuleProposal(await this.ctx(user), id, dto.decision)
  }

  /**
   * #2369.2/.3/.4/.5 — importer un message pour apprentissage : l'analyse
   * préalable et sa restitution (« je conserve / je ne reproduis pas / je
   * propose ») sont renvoyées directement, sans lecture supplémentaire.
   */
  @Post('imports')
  @RequirePermission('records:write')
  async importMessage(
    @Body(new ZodValidationPipe(createMessageStyleImportSchema)) dto: CreateMessageStyleImport,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStyleImportResult> {
    return this.messageStyle.importAndAnalyze(await this.ctx(user), dto)
  }

  /** #2369.11 — le même exemple sous les quatre couches, un appel Claude par template distinct. */
  @Post('templates/preview-compare')
  @RequirePermission('records:write')
  async previewCompare(
    @Body(new ZodValidationPipe(messageStylePreviewCompareRequestSchema)) dto: MessageStylePreviewCompareRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<MessageStylePreviewResult[]> {
    return this.messageStyle.previewCompare(await this.ctx(user), dto)
  }
}
