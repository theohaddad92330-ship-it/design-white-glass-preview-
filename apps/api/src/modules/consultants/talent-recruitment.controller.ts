import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { changeRecruitmentStageSchema, type RecruitmentColumn, type RecruitmentHistoryEntry } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { TalentRecruitmentService } from './talent-recruitment.service'

class ChangeRecruitmentStageDto extends createZodDto(changeRecruitmentStageSchema) {}

/** Théo C talents-recrutement — l'écran Recrutement : cinq étapes pour une personne, indépendantes de ses présentations. */
@Controller('talent-recruitment')
@RequireFeature('talent_pool')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class TalentRecruitmentController {
  constructor(
    private readonly recruitment: TalentRecruitmentService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Les cinq colonnes du kanban, vides comprises. */
  @Get()
  @WorkspaceRead()
  async board(@CurrentUser() user: CurrentUserPayload): Promise<{ columns: RecruitmentColumn[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { columns: await this.recruitment.boardColumns(workspaceId) }
  }

  /** Le journal d'une personne : chaque changement d'étape, son motif, qui l'a fait. */
  @Get(':id/history')
  @WorkspaceRead()
  async history(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ items: RecruitmentHistoryEntry[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.recruitment.history(workspaceId, id) }
  }

  /** Change l'étape d'une personne. N'écrit ni ses présentations ni ses affectations. */
  @Put(':id')
  @RequirePermission('records:write')
  async change(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeRecruitmentStageDto,
  ): Promise<{ id: string; createdAt: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.recruitment.change(workspaceId, user.userId, id, body)
  }
}
