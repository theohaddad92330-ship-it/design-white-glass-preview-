import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { DiscoverCandidateNote, DiscoverCandidateNotesResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateDiscoverCandidateNoteDto } from './dto/discover-candidate-note.dto'
import { DiscoverCandidateNotesService } from './discover-candidate-notes.service'

/**
 * #2151.59 — les notes de terrain d'un candidat Découvrir, avant qu'il ne
 * devienne un compte (voir `DiscoverCandidateNotesService` pour la
 * « reprise à la conversion »).
 */
@Controller('discover/candidates')
@RequireFeature('discover')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class DiscoverCandidateNotesController {
  constructor(private readonly notes: DiscoverCandidateNotesService) {}

  // GA-05 : lecture d'espace — aucune écriture, aucun crédit, le workspaceId
  // est résolu server-side (`WorkspaceContextService.resolveActiveWorkspace`,
  // jamais pris dans l'URL) et borne le SELECT. `@WorkspaceRead` déclare la
  // route, comme sa voisine `POST` déclare `records:write`.
  @Get(':siren/notes')
  @WorkspaceRead()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('siren') siren: string,
  ): Promise<DiscoverCandidateNotesResponse> {
    return { notes: await this.notes.list(user.userId, siren) }
  }

  @Post(':siren/notes')
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('siren') siren: string,
    @Body() body: CreateDiscoverCandidateNoteDto,
  ): Promise<DiscoverCandidateNote> {
    return this.notes.create(user.userId, siren, body.body)
  }
}
