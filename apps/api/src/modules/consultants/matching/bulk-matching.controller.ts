import { Body, Controller, Param, ParseUUIDPipe, Post, Get, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { can } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../../auth/jwt.guard'
import { PlanFeatureGuard } from '../../plan-features/plan-feature.guard'
import { RequireFeature } from '../../plan-features/require-feature.decorator'
import { RequirePermission } from '../../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../../workspace/workspace-permission.guard'
import { BulkMatchingService, BULK_MATCHING_MAX_NEEDS } from './bulk-matching.service'

const bulkMatchingBodySchema = z.object({
  needIds: z.array(z.string().guid()).min(1).max(BULK_MATCHING_MAX_NEEDS),
})
export class BulkMatchingBodyDto extends createZodDto(bulkMatchingBodySchema) {}

/**
 * #1952.3 (épopée #2844, lot SRC5 28/09 soir) — le matching massif : un lot de
 * besoins classés en tâche de fond, suivi par `bulk-matching:progress`
 * (Socket.IO, salle `bulk-matching:<jobId>`), jamais bloqué dans la requête.
 *
 * Même coût que le matching unitaire (ZÉRO crédit) et même permission
 * (`records:write`) — un lot n'ouvre aucun second chemin de débit.
 */
@Controller('needs/match/bulk')
@RequireFeature('talent_pool')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class BulkMatchingController {
  constructor(
    private readonly bulkMatching: BulkMatchingService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post()
  @RequirePermission('records:write')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: BulkMatchingBodyDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.bulkMatching.enqueue(workspaceId, user.userId, body.needIds, can(role, [], 'finance:read'))
  }

  @Get(':jobId')
  @WorkspaceRead()
  async state(@CurrentUser() user: CurrentUserPayload, @Param('jobId', ParseUUIDPipe) jobId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.bulkMatching.state(workspaceId, jobId)
  }
}
