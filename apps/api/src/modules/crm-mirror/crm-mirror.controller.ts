import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { can, type CrmMirrorAccountView } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmMirrorReader } from './crm-mirror.reader'

/**
 * SYNC-A — la fiche compte lit le MIROIR CRM : les affaires et les activités du compte, tous CRM branchés
 * de l'espace. Bornée par l'espace ACTIF (un compte d'un autre espace ne rend rien) et par la permission
 * `crm:read` (celle de Laura sur les affaires).
 */
@Controller('crm/mirror')
@UseGuards(JwtGuard)
export class CrmMirrorController {
  constructor(
    private readonly reader: CrmMirrorReader,
    private readonly workspace: WorkspaceContextService,
  ) {}

  @Get('accounts/:accountId')
  @WorkspaceRead()
  async account(
    @CurrentUser() user: CurrentUserPayload,
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
  ): Promise<CrmMirrorAccountView> {
    const { workspaceId, role } = await this.workspace.resolveActiveWorkspace(user.userId)
    const extra = await this.workspace.extraPermissionsOf(workspaceId, user.userId)
    if (!can(role, extra, 'crm:read')) throw new ForbiddenException('Lecture du CRM non autorisée dans cet espace.')
    return this.reader.accountView(workspaceId, accountId)
  }
}
