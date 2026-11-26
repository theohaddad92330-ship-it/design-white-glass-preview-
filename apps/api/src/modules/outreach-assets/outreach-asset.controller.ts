import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  UseGuards,
} from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import type { OutreachAsset } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateOutreachAssetDto, UpdateOutreachAssetDto, UploadOutreachAssetFileDto } from './dto/outreach-asset.dto'
import { OutreachAssetService, type OutreachAssetFailure } from './outreach-asset.service'

function throwOutreachAssetFailure(failure: OutreachAssetFailure): never {
  const { code, message, cause } = failure
  switch (code) {
    case 'not_found':
    case 'no_file':
      throw new NotFoundException(message, { cause })
    case 'file_too_large':
      throw new PayloadTooLargeException(message, { cause })
    case 'create_failed':
    case 'update_failed':
    case 'delete_failed':
      throw new BadRequestException(message, { cause })
    default: {
      const _exhaustive: never = code
      throw new BadRequestException(`Unknown outreach asset failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Browser-facing CRUD for the workspace outreach asset catalog (#2838). A
 * team-shared resource: reads are scoped to the caller's active workspace;
 * writes stamp `user_id` from the JWT (never the body). No send gate lives
 * here — `usageRights` only NAMES the future rule (#2372.6).
 */
@Controller('outreach-assets')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OutreachAssetController {
  constructor(
    private readonly outreachAssets: OutreachAssetService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<OutreachAsset[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.outreachAssets.listForWorkspace(workspaceId, user.userId)
  }

  @Post()
  @RequirePermission('records:write')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOutreachAssetDto): Promise<OutreachAsset> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return unwrap(await this.outreachAssets.create(workspaceId, user.userId, dto), throwOutreachAssetFailure)
  }

  @Patch(':id')
  @RequirePermission('records:write')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateOutreachAssetDto,
  ): Promise<OutreachAsset> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return unwrap(await this.outreachAssets.update(id, workspaceId, dto), throwOutreachAssetFailure)
  }

  /**
   * #3699.6 — rattache le fichier RÉEL d'un asset (la bibliothèque de documents
   * joignables à un e-mail individuel). Même dépôt base64 que les autres pièces
   * (`storageUploadSchema`, `.strict()` : aucun espace choisi dans le corps).
   */
  @Post(':id/file')
  @RequirePermission('records:write')
  async attachFile(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UploadOutreachAssetFileDto,
  ): Promise<OutreachAsset> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const today = new Date().toISOString().slice(0, 10)
    return unwrap(
      await this.outreachAssets.attachFile(id, workspaceId, user.userId, dto, today),
      throwOutreachAssetFailure,
    )
  }

  /** #3699.6 — retire le fichier : l'asset reste, annoncé sans fichier. */
  @Delete(':id/file')
  @RequirePermission('records:write')
  async detachFile(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<OutreachAsset> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return unwrap(await this.outreachAssets.detachFile(id, workspaceId), throwOutreachAssetFailure)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('records:write')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    unwrap(await this.outreachAssets.delete(id, workspaceId), throwOutreachAssetFailure)
  }
}
