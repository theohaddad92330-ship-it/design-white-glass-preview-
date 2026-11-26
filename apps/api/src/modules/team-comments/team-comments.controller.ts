import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import type { TeamCommentsResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { CreateTeamCommentDto } from './dto/create-team-comment.dto'
import { SetTeamThreadResolutionDto } from './dto/set-team-thread-resolution.dto'
import { TeamCommentsService } from './team-comments.service'

/**
 * Commentaire d'équipe (cockpit manager §10 — « Capitalisation & collaboration »).
 * Ouvert à tout membre du workspace : chacun lit et alimente le fil de son espace.
 *
 * #1940.6 — LA MÊME route sert un commentaire de conversation `/chat`
 * (`?conversation_id=`) : pas de route neuve, donc aucun mouvement sur le
 * cliquet GA-05 des routes nues (ce contrôleur y est déjà, en l'état).
 */
@Controller('team-comments')
// Commenter à plusieurs suppose l'espace partagé.
@RequireFeature('team_workspace')
@UseGuards(JwtGuard, PlanFeatureGuard)
export class TeamCommentsController {
  constructor(private readonly comments: TeamCommentsService) {}

  /**
   * La tête du fil de l'espace, plus récent d'abord — ou, avec
   * `conversation_id`, les commentaires de CE fil `/chat`, ou, avec
   * `account_id` (#2914), les commentaires de CE compte — dans les deux cas
   * du plus ancien au plus récent (accès re-vérifié comme l'ouverture du fil
   * ou du compte, #1955.12).
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('conversation_id') conversationId?: string,
    @Query('account_id') accountId?: string,
    @Query('open_mine') openMine?: string,
  ): Promise<TeamCommentsResponse> {
    // #4158.31 — `open_mine=true` : mes fils ouverts (non résolus, où je suis auteur, mentionné ou intervenu).
    return { items: await this.comments.list(user.userId, conversationId, accountId, openMine === 'true') }
  }

  /** Partager une idée / un commentaire. */
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateTeamCommentDto) {
    return this.comments.create(user.userId, body)
  }

  /**
   * #4158.31 — marquer un fil résolu (ou le rouvrir). Écriture : `records:write`
   * (un lecteur seul ne résout pas). Tranché sans Louis : même droit que modifier une fiche.
   */
  @Patch(':id/resolution')
  @UseGuards(WorkspacePermissionGuard)
  @RequirePermission('records:write')
  setResolution(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetTeamThreadResolutionDto,
  ) {
    return this.comments.setResolution(user.userId, id, body.resolved)
  }
}
