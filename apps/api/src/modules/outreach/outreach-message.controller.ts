import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { z } from 'zod'
import {
  approveOutreachMessagesRequestSchema,
  createOutreachCallTaskRequestSchema,
  createOutreachMessageRequestSchema,
  flagOutreachMessageQualityRequestSchema,
  outreachApprovalViewSchema,
  reviseOutreachMessageRequestSchema,
  setOutreachMessageVariableRequestSchema,
  transitionOutreachRequestSchema,
  type ApproveOutreachMessagesRequest,
  type ApproveOutreachMessagesResult,
  type CreateOutreachCallTaskRequest,
  type CreateOutreachMessageRequest,
  type FlagOutreachMessageQualityRequest,
  type OutreachApprovalView,
  type OutreachCallTask,
  type OutreachMessage,
  type OutreachMessageVariable,
  type OutreachTransition,
  type ReviseOutreachMessageRequest,
  type SetOutreachMessageVariableRequest,
  type TransitionOutreachRequest,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OutreachMessageService, type OutreachCtx, type StopLookup } from './outreach-message.service'
import { OutreachMessageVariablesService } from './outreach-message-variables.service'

/**
 * #2366 — la surface HTTP du modèle canonique de l'outreach, et #2382 — celle
 * du centre d'approbation qui le lit.
 *
 * L'orchestration vit ICI (GA-07) : l'espace actif et le rôle sont résolus par
 * le contexte d'espace, l'opt-out par la porte « ne me contactez plus » ; le
 * service ne reçoit que des valeurs. AUCUNE route n'envoie : valider n'est
 * jamais exécuter.
 */
const postponeCallTaskSchema = z.object({ scheduled_at: z.string().datetime() })

@Controller('outreach')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OutreachMessageController {
  constructor(
    private readonly messages: OutreachMessageService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly contactStops: ContactStopService,
    private readonly variables: OutreachMessageVariablesService,
  ) {}

  private async ctx(user: CurrentUserPayload): Promise<{ ctx: OutreachCtx; stops: StopLookup }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return {
      ctx: { userId: user.userId, workspaceId, role },
      stops: ids => this.contactStops.stoppedAmong(workspaceId, ids),
    }
  }

  @Post('messages')
  @RequirePermission('messages:send')
  async create(
    @Body(new ZodValidationPipe(createOutreachMessageRequestSchema)) dto: CreateOutreachMessageRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachMessage> {
    const { ctx, stops } = await this.ctx(user)
    return this.messages.create(ctx, dto, stops)
  }

  /**
   * #2382.1 — les messages de l'espace, filtrables par l'une des sept vues.
   * #2366.1 — et par `contact_id` : la fiche Contact lit le MÊME objet que le
   * centre d'approbation, jamais une copie propre à l'écran.
   */
  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05).
  @Get('messages')
  @WorkspaceRead()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('view', new ZodValidationPipe(outreachApprovalViewSchema.optional())) view?: OutreachApprovalView,
    @Query('contact_id', new ZodValidationPipe(z.string().guid().optional())) contactId?: string,
  ): Promise<OutreachMessage[]> {
    const { ctx, stops } = await this.ctx(user)
    return this.messages.list(ctx, stops, view, contactId)
  }

  /** #2382.9 — valider une sélection ou « tout » : chaque élément porte la version affichée. */
  @Post('messages/approve')
  @RequirePermission('messages:send')
  async approve(
    @Body(new ZodValidationPipe(approveOutreachMessagesRequestSchema)) dto: ApproveOutreachMessagesRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ApproveOutreachMessagesResult> {
    const { ctx, stops } = await this.ctx(user)
    return this.messages.approveMany(ctx, dto, stops)
  }

  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05).
  @Get('messages/:id')
  @WorkspaceRead()
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload): Promise<OutreachMessage> {
    const { ctx, stops } = await this.ctx(user)
    return this.messages.get(ctx, id, stops)
  }

  /** #2366.10 — une modification crée une version. */
  @Patch('messages/:id')
  @RequirePermission('messages:send')
  async revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviseOutreachMessageRequestSchema)) dto: ReviseOutreachMessageRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachMessage> {
    const { ctx, stops } = await this.ctx(user)
    return this.messages.revise(ctx, id, dto, stops)
  }

  /**
   * #2877 (#2385.4) — le relecteur DÉCLARE un problème de qualité (faux fait,
   * CTA ou persona incorrect). Un signal, pas une décision : ni l'état ni le
   * texte du message ne bougent, et le corps n'est jamais lu pour le deviner.
   */
  @Post('messages/:id/quality-flag')
  @RequirePermission('messages:send')
  async flagQuality(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(flagOutreachMessageQualityRequestSchema)) dto: FlagOutreachMessageQualityRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ kind: FlagOutreachMessageQualityRequest['kind'] }> {
    const { ctx } = await this.ctx(user)
    return this.messages.flagQuality(ctx, id, dto.kind)
  }

  /**
   * #3419.1 — les variables de la version courante du message : valeur, source,
   * date, confiance, usage externe. Annotation déclarée, jamais déduite du corps.
   */
  @Get('messages/:id/variables')
  @WorkspaceRead()
  async listVariables(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachMessageVariable[]> {
    const { ctx } = await this.ctx(user)
    return this.variables.list(ctx, id)
  }

  @Post('messages/:id/variables')
  @RequirePermission('messages:send')
  async setVariable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setOutreachMessageVariableRequestSchema)) dto: SetOutreachMessageVariableRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachMessageVariable> {
    const { ctx } = await this.ctx(user)
    return this.variables.set(ctx, id, dto)
  }

  @Post('messages/:id/transition')
  @RequirePermission('messages:send')
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionOutreachRequestSchema)) dto: TransitionOutreachRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachMessage> {
    const { ctx } = await this.ctx(user)
    return this.messages.transition(ctx, id, dto)
  }

  /** #2366.8 — l'historique, les dix champs par transition. */
  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05).
  @Get('messages/:id/transitions')
  @WorkspaceRead()
  async messageHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachTransition[]> {
    const { ctx } = await this.ctx(user)
    return this.messages.history(ctx, 'message', id)
  }

  @Post('call-tasks')
  @RequirePermission('messages:send')
  async createCall(
    @Body(new ZodValidationPipe(createOutreachCallTaskRequestSchema)) dto: CreateOutreachCallTaskRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachCallTask> {
    const { ctx, stops } = await this.ctx(user)
    return this.messages.createCallTask(ctx, dto, stops)
  }

  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05).
  @Get('call-tasks')
  @WorkspaceRead()
  async listCalls(@CurrentUser() user: CurrentUserPayload): Promise<OutreachCallTask[]> {
    const { ctx } = await this.ctx(user)
    return this.messages.listCallTasks(ctx)
  }

  @Post('call-tasks/:id/transition')
  @RequirePermission('messages:send')
  async transitionCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionOutreachRequestSchema)) dto: TransitionOutreachRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachCallTask> {
    const { ctx } = await this.ctx(user)
    return this.messages.transitionCallTask(ctx, id, dto)
  }

  /** Lot L-A (#4164) — reporter l'échéance d'un appel (file Aujourd'hui). */
  @Post('call-tasks/:id/postpone')
  @RequirePermission('messages:send')
  async postponeCall(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(postponeCallTaskSchema)) dto: { scheduled_at: string },
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachCallTask> {
    const { ctx } = await this.ctx(user)
    return this.messages.postponeCallTask(ctx, id, dto.scheduled_at)
  }

  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05).
  @Get('call-tasks/:id/transitions')
  @WorkspaceRead()
  async callHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachTransition[]> {
    const { ctx } = await this.ctx(user)
    return this.messages.history(ctx, 'call_task', id)
  }
}
