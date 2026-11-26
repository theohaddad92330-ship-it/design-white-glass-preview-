import { Body, Controller, Get, Optional, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  createOutreachDelegationRequestSchema,
  createScopedDelegationRequestSchema,
  renewDelegationRequestSchema,
  type CreateOutreachDelegationRequest,
  type CreateScopedDelegationRequest,
  type OutreachDelegationView,
  type RenewDelegationRequest,
} from '@bellum/contracts'
import { PlanFeaturesService } from '../plan-features/plan-features.service'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { MailboxService } from '../mailbox/mailbox.service'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OutreachDelegationService } from './outreach-delegation.service'
import type { OutreachCtx } from './outreach-message.service'

/**
 * #3702.9 — la surface HTTP du mandat d'envoi (c89). Déléguer, suspendre, révoquer
 * sont des gestes EXPLICITES du commercial ; aucune route n'envoie.
 */
@Controller('outreach/delegations')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OutreachDelegationController {
  constructor(
    private readonly delegations: OutreachDelegationService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly contactStops: ContactStopService,
    private readonly mailbox: MailboxService,
    // #4016 L5 — le palier de l'espace, pour les bornes d'un mandat. Absent ⇒ plancher.
    @Optional() private readonly planFeatures?: PlanFeaturesService,
  ) {}

  private async ctx(user: CurrentUserPayload): Promise<OutreachCtx> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { userId: user.userId, workspaceId, role }
  }

  @Post()
  @RequirePermission('messages:send')
  async create(
    @Body(new ZodValidationPipe(createOutreachDelegationRequestSchema)) dto: CreateOutreachDelegationRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ delegation: OutreachDelegationView; excluded: { id: string; reason: string }[] }> {
    const ctx = await this.ctx(user)
    return this.delegations.create(
      ctx,
      dto,
      ids => this.contactStops.stoppedAmong(ctx.workspaceId, ids),
      await this.mailbox.status(user.userId),
    )
  }

  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05).
  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<OutreachDelegationView[]> {
    return this.delegations.list(await this.ctx(user))
  }

  // Lecture seule : le verdict de chaque étape, sans réserver de quota (GA-05).
  @Get(':id/steps')
  @WorkspaceRead()
  async steps(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.delegations.steps(await this.ctx(user), id, await this.mailbox.status(user.userId))
  }

  /**
   * #4016 L5 — SIGNER un mandat d'espace pour une portée (Laura, séquences,
   * relances d'impayé, suivi de rendez-vous). Le geste du commercial, jamais
   * de Laura : `@CurrentUser()`, `signed: true` exigé par le schéma, bornes du
   * plan de l'espace. Aucune route n'envoie.
   */
  @Post('scoped')
  @RequirePermission('messages:send')
  async createScoped(
    @Body(new ZodValidationPipe(createScopedDelegationRequestSchema)) dto: CreateScopedDelegationRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachDelegationView> {
    return this.delegations.createScoped(
      await this.ctx(user),
      dto,
      await this.mailbox.status(user.userId),
      await this.planOf(user.userId),
    )
  }

  /** #4016 L5 — renouveler = re-signer : un nouveau mandat, l'ancien est remplacé. */
  @Post(':id/renew')
  @RequirePermission('messages:send')
  async renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(renewDelegationRequestSchema)) dto: RenewDelegationRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachDelegationView> {
    return this.delegations.renew(await this.ctx(user), id, dto, await this.planOf(user.userId))
  }

  /** Palier illisible ⇒ `null` ⇒ les bornes PLANCHER (`sendBoundsOfPlan`), jamais le plafond. */
  private async planOf(userId: string): Promise<string | null> {
    if (!this.planFeatures) return null
    try {
      return await this.planFeatures.planForUser(userId)
    } catch {
      return null
    }
  }

  @Post(':id/pause')
  @RequirePermission('messages:send')
  async pause(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachDelegationView> {
    return this.delegations.pause(await this.ctx(user), id)
  }

  @Post(':id/resume')
  @RequirePermission('messages:send')
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachDelegationView> {
    return this.delegations.resume(await this.ctx(user), id)
  }

  @Post(':id/revoke')
  @RequirePermission('messages:send')
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OutreachDelegationView> {
    return this.delegations.revoke(await this.ctx(user), id)
  }
}
