import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DataExit } from '../workspace/data-exit.decorator'
import { BulkExportService } from './bulk-export.service'

/**
 * #1952.6 (épopée #2844, lot SRC5 28/09 soir) — l'export en lot du vivier :
 * un job en tâche de fond, suivi par `bulk-export:progress` (Socket.IO, salle
 * `bulk-export:<jobId>`), récupéré au clic une fois `done`.
 *
 * `@DataExit()` : même règle que `GET talents/export/ats` (#2081.14) — une
 * SORTIE de données, tenue par le réglage d'espace « qui peut exporter »,
 * jamais un second chemin qui la contournerait.
 */
@Controller('talents/export/bulk')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class BulkExportController {
  constructor(
    private readonly bulkExport: BulkExportService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post()
  @DataExit()
  @RequirePermission('records:write')
  async create(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.bulkExport.enqueue(workspaceId, user.userId, 'consultants_csv')
  }

  @Get(':jobId')
  @WorkspaceRead()
  async state(@CurrentUser() user: CurrentUserPayload, @Param('jobId', ParseUUIDPipe) jobId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.bulkExport.state(workspaceId, jobId)
  }

  @Get(':jobId/download')
  @DataExit()
  @RequirePermission('records:write')
  async download(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const { csv, fileName } = await this.bulkExport.download(workspaceId, jobId)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(csv)
  }
}
