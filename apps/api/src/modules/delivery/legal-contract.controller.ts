import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  addLegalContractDocumentSchema,
  can,
  createLegalContractSchema,
  reassignLegalContractOwnerSchema,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { LegalContractService, type LegalContractViewer } from './legal-contract.service'

class CreateLegalContractDto extends createZodDto(createLegalContractSchema) {}
class AddLegalContractDocumentDto extends createZodDto(addLegalContractDocumentSchema) {}
class ReassignLegalContractOwnerDto extends createZodDto(reassignLegalContractOwnerSchema) {}

/**
 * #2422.4 (épopée #2869, LAU-FINAL-136) — le contrat juridique typé d'un
 * compte. Même permission d'écriture que les avenants de mission
 * (`records:write`) : poser un contrat est le même geste de fond — nommer ce
 * qui a été convenu.
 */
@Controller('delivery/accounts/:accountId/contracts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class LegalContractController {
  constructor(
    private readonly contracts: LegalContractService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** Espace + lecteur (#2422.10) : le droit finance décide quelles pièces sortent. */
  private async scopeAndViewer(userId: string): Promise<{ workspaceId: string; viewer: LegalContractViewer }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // `extraPermissionsOf` : les permissions accordées membre par membre comptent.
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return { workspaceId, viewer: { userId, canReadFinance: can(role, extra, 'finance:read') } }
  }

  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload, @Param('accountId', ParseUUIDPipe) accountId: string) {
    const { workspaceId, viewer } = await this.scopeAndViewer(user.userId)
    return this.contracts.list(workspaceId, accountId, viewer)
  }

  @Post()
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: CreateLegalContractDto,
  ) {
    return this.contracts.create(await this.scope(user.userId), user.userId, accountId, body)
  }

  /**
   * #2422.5 (épopée #2869) — réattribuer le propriétaire du contrat. Même
   * permission d'écriture que `create` : c'est le même geste de fond, nommer
   * qui répond de ce contrat.
   */
  @Patch(':contractId/owner')
  @RequirePermission('records:write')
  async reassignOwner(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: ReassignLegalContractOwnerDto,
  ) {
    const { workspaceId, viewer } = await this.scopeAndViewer(user.userId)
    return this.contracts.reassignOwner(workspaceId, accountId, contractId, body.ownerId, viewer)
  }

  /**
   * #2422.10 (lot X54) — déposer une pièce (nouvelle version si le libellé
   * existe). Même permission d'écriture que le reste du contrat.
   */
  @Post(':contractId/documents')
  @RequirePermission('records:write')
  async addDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: AddLegalContractDocumentDto,
  ) {
    const { workspaceId, viewer } = await this.scopeAndViewer(user.userId)
    return this.contracts.addDocument(workspaceId, accountId, contractId, body, viewer)
  }
}
