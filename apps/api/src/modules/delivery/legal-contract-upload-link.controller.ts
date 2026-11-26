import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { createLegalContractUploadLinkSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { LegalContractUploadLinkService } from './legal-contract-upload-link.service'

class CreateLegalContractUploadLinkDto extends createZodDto(createLegalContractUploadLinkSchema) {}

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — le CÔTÉ COMMERCIAL du lien
 * signé : générer, lister, révoquer. Même permission d'écriture que le reste
 * du contrat (`records:write`) — c'est le même geste de fond, ouvrir une
 * porte sur ce qui a été convenu.
 *
 * ⚠️ Le copilote ne génère ni n'envoie jamais ce lien (doctrine : il prépare,
 * le commercial envoie) — ces routes n'existent QUE pour un geste humain
 * explicite, posé depuis l'écran (bouton « Demander une pièce »).
 */
@Controller('delivery/accounts/:accountId/contracts/:contractId/upload-links')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class LegalContractUploadLinkController {
  constructor(
    private readonly links: LegalContractUploadLinkService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  @WorkspaceRead()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    const workspaceId = await this.scope(user.userId)
    return { links: await this.links.list(workspaceId, accountId, contractId) }
  }

  @Post()
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: CreateLegalContractUploadLinkDto,
  ) {
    const workspaceId = await this.scope(user.userId)
    return this.links.create(workspaceId, user.userId, accountId, contractId, body.missionId)
  }

  @Patch(':linkId/revoke')
  @RequirePermission('records:write')
  async revoke(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<{ revoked: true }> {
    const workspaceId = await this.scope(user.userId)
    await this.links.revoke(workspaceId, accountId, contractId, linkId)
    return { revoked: true }
  }
}
