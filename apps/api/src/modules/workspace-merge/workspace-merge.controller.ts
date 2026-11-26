import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  workspaceMergeHashInputSchema,
  workspaceMergePreviewInputSchema,
  type WorkspaceMergeRequestView,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceMergeService } from './workspace-merge.service'

class WorkspaceMergePreviewDto extends createZodDto(workspaceMergePreviewInputSchema) {}
class WorkspaceMergeHashDto extends createZodDto(workspaceMergeHashInputSchema) {}

/**
 * #4158.57 — « Rapatrier mon espace personnel » (Réglages › Espace). Deux familles de routes (GA-05) :
 *  · `@PersonalScope` — le DEMANDEUR, sur sa propre demande (l'espace personnel est le sien ; le service
 *    vérifie qu'il est membre de la cible) ;
 *  · `@RequirePermission('team:manage')` — l'admin de l'espace CIBLE tranche ; le service exige en plus
 *    le rôle owner/admin sur l'espace de la demande, pas seulement sur l'espace actif.
 */
@Controller('workspace-merge')
@UseGuards(JwtGuard)
export class WorkspaceMergeController {
  constructor(
    private readonly merge: WorkspaceMergeService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** La SIMULATION : l'aperçu persisté avec son empreinte. Aucune donnée n'est déplacée. */
  @Post('preview')
  @HttpCode(200)
  @PersonalScope()
  preview(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: WorkspaceMergePreviewDto,
  ): Promise<WorkspaceMergeRequestView> {
    return this.merge.preview(user.userId, dto.targetWorkspaceId)
  }

  @Get('mine')
  @PersonalScope()
  mine(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceMergeRequestView[]> {
    return this.merge.mine(user.userId)
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @PersonalScope()
  confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkspaceMergeHashDto,
  ): Promise<WorkspaceMergeRequestView> {
    return this.merge.confirm(user.userId, id, dto.hash)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @PersonalScope()
  cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceMergeRequestView> {
    return this.merge.cancel(user.userId, id)
  }

  /** Relancer un job coupé — le demandeur ou un admin de la cible (le service le vérifie). */
  @Post(':id/resume')
  @HttpCode(200)
  @PersonalScope()
  resume(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceMergeRequestView> {
    return this.merge.resume(user.userId, id)
  }

  @Get('pending')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  async pending(@CurrentUser() user: CurrentUserPayload): Promise<WorkspaceMergeRequestView[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.merge.pendingFor(user.userId, workspaceId)
  }

  @Post(':id/approve')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  approve(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkspaceMergeHashDto,
  ): Promise<WorkspaceMergeRequestView> {
    return this.merge.approve(user.userId, id, dto.hash)
  }

  @Post(':id/reject')
  @HttpCode(200)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('team:manage')
  reject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceMergeRequestView> {
    return this.merge.reject(user.userId, id)
  }
}
