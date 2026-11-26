import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { recordPanelKindSchema, type RecordLinksResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { RecordLinksService } from './record-links.service'

/**
 * #4194 (lot L3) — `GET /record-links/:kind/:id` : propriétés, historique et
 * objets liés du panneau latéral unique. Lecture seule, scopée à l'espace actif.
 */
@Controller('record-links')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class RecordLinksController {
  constructor(
    private readonly links: RecordLinksService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get(':kind/:id')
  @WorkspaceRead()
  async read(
    @CurrentUser() user: CurrentUserPayload,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecordLinksResponse> {
    const parsed = recordPanelKindSchema.safeParse(kind)
    if (!parsed.success) throw new NotFoundException()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.links.read(workspaceId, parsed.data, id)
  }
}
