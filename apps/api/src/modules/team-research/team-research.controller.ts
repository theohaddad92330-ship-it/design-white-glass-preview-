import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { teamResearchKindSchema, type TeamResearchResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { RecordTeamResearchDto } from './dto/record-team-research.dto'
import { TeamResearchService } from './team-research.service'

/**
 * Équipe › Recherches (Théo D team-recherches). Ouvert à TOUT membre de l'espace (Louis 22/10, Q3) :
 * chacun lit les recherches conservées de l'équipe et alimente la sienne.
 */
@Controller('team-research')
@RequireFeature('team_workspace')
@UseGuards(JwtGuard, PlanFeatureGuard)
export class TeamResearchController {
  constructor(
    private readonly research: TeamResearchService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** `?kind=discover|analysis` filtre ; sans filtre, les deux natures. */
  @Get()
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload, @Query('kind') kind?: string): Promise<TeamResearchResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const parsed = teamResearchKindSchema.safeParse(kind)
    return this.research.list(workspaceId, parsed.success ? parsed.data : undefined)
  }

  /** Découvrir poste chaque recherche lancée. */
  @Post()
  @HttpCode(204)
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('records:write')
  async record(@CurrentUser() user: CurrentUserPayload, @Body() body: RecordTeamResearchDto): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.research.record(workspaceId, user.userId, body)
  }
}
