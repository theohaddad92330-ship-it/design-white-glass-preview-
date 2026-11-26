import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PARTNER_CV_PUSH_OUTCOMES } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PartnerCvPushService } from './partner-cv-push.service'

const prepareSchema = z.object({ consultantId: z.string().guid() })
class PrepareCvPushDto extends createZodDto(prepareSchema) {}

const outcomeSchema = z.object({ outcome: z.enum(PARTNER_CV_PUSH_OUTCOMES) })
class RecordOutcomeDto extends createZodDto(outcomeSchema) {}

/**
 * #2887 (#2371.8) — la revue d'un CV poussé à un partenaire.
 *
 * Module SÉPARÉ de `/partners` (craft rule #7 : chaque module NestJS est
 * indépendant, le retirer ne casse pas le reste) — `PartnerPipelineService`
 * ne connaît que deux jetons (GA-07 au plafond, voir son docblock) ; ajouter
 * les dépôts consultant/partenaire ici plutôt que là-bas évite d'y toucher.
 */
@Controller('partners/:partnerId/cv-pushes')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class PartnerCvPushController {
  constructor(
    private readonly cvPushes: PartnerCvPushService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload, @Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.cvPushes.listCvPushes(await this.workspaceOf(user.userId), partnerId)
  }

  @RequirePermission('records:write')
  @Post()
  async prepare(
    @CurrentUser() user: CurrentUserPayload,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() dto: PrepareCvPushDto,
  ) {
    const workspaceId = await this.workspaceOf(user.userId)
    return this.cvPushes.prepareCvPush(workspaceId, partnerId, dto.consultantId, user.userId)
  }

  @RequirePermission('records:write')
  @Patch(':id/declare-sent')
  async declareSent(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.cvPushes.declareSent(await this.workspaceOf(user.userId), id)
  }

  @RequirePermission('records:write')
  @Patch(':id/outcome')
  async recordOutcome(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordOutcomeDto,
  ) {
    return this.cvPushes.recordOutcome(await this.workspaceOf(user.userId), id, dto.outcome)
  }
}
