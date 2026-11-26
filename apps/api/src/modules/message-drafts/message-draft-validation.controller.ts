import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import type { MessageDraftValidation, MyMessageDraftItem } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { MessageDraftValidationService } from './message-draft-validation.service'

const DEFAULT_PAGE = 20
const MAX_PAGE = 100

/**
 * Théo B C6.N2 / M2.N1 — valider une version de brouillon et lister « mes brouillons ». Le workspace et
 * l'utilisateur viennent TOUJOURS du jeton. Aucune de ces routes n'envoie quoi que ce soit.
 */
@Controller('message-drafts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MessageDraftValidationController {
  constructor(
    private readonly validation: MessageDraftValidationService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get('mine')
  @RequirePermission('records:write')
  async mine(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ items: MyMessageDraftItem[]; total: number }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const parsedLimit = Number.parseInt(limit ?? '', 10)
    const parsedOffset = Number.parseInt(offset ?? '', 10)
    return this.validation.listMine(workspaceId, user.userId, {
      limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_PAGE) : DEFAULT_PAGE,
      offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
    })
  }

  @Post(':versionId/validate')
  @HttpCode(200)
  @RequirePermission('records:write')
  async validate(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ validation: MessageDraftValidation }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { validation: await this.validation.validate(versionId, workspaceId, user.userId) }
  }

  /** Archiver : on archive, on ne supprime pas, et rien ne part. */
  @Post(':versionId/archive')
  @HttpCode(200)
  @RequirePermission('records:write')
  async archive(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ archival: { versionId: string; archivedAt: string } }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { archival: await this.validation.archive(versionId, workspaceId, user.userId) }
  }
}
