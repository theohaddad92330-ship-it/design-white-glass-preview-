import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  importSequenceLibraryRequestSchema,
  setContentVisibilitySchema,
  type SetContentVisibility,
  type ImportSequenceLibraryRequest,
  type ImportSequenceLibraryResult,
  type SequenceTemplate,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { SequenceTemplatesService } from './sequence-templates.service'

/**
 * #3756 — la bibliothèque de modèles de séquence de l'espace. Importer ou
 * retirer un modèle programme des relances futures : même permission que créer
 * une séquence (`messages:send`). Aucune route n'envoie quoi que ce soit.
 */
@Controller('outreach/sequence-templates')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class SequenceTemplatesController {
  constructor(
    private readonly templates: SequenceTemplatesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @RequirePermission('crm:read')
  async list(@CurrentUser() user: CurrentUserPayload): Promise<SequenceTemplate[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.templates.list(workspaceId, user.userId)
  }

  @Post('import')
  @RequirePermission('messages:send')
  async importLibrary(
    @Body(new ZodValidationPipe(importSequenceLibraryRequestSchema)) body: ImportSequenceLibraryRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ImportSequenceLibraryResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.templates.importLibrary(workspaceId, user.userId, body)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('messages:send')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.templates.remove(workspaceId, user.userId, id)
  }

  /**
   * #4158.30 — l'auteur partage son modèle avec l'équipe, ou le reprend en personnel.
   * Même droit que le reste de l'écriture de la bibliothèque (`messages:send`), plus la règle
   * « l'auteur seul » vérifiée dans le service.
   */
  @Patch(':id/visibility')
  @RequirePermission('messages:send')
  async setVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setContentVisibilitySchema)) body: SetContentVisibility,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SequenceTemplate> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.templates.setVisibility(workspaceId, user.userId, id, body.visibility)
  }
}
