import { Controller, Get, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceProgressService } from './workspace-progress.service'

/**
 * #5011.1 — l'avancement compté de l'espace actif (comptes analysés, contacts, actions), pour la
 * suite proposée sous une réponse de Laura. Lecture d'espace seule (`@WorkspaceRead`, D39).
 */
@Controller('workspace-progress')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspaceProgressController {
  constructor(
    private readonly progress: WorkspaceProgressService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @WorkspaceRead()
  async read(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.progress.read(workspaceId)
  }
}
