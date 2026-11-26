import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { MEMBER_OBJECTIVE_MONTH_PATTERN, parseManagerPeriodDays } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { SaveTeamReviewDto } from './dto/team-review.dto'
import { ManagerService } from './manager.service'
import { TeamReviewService } from './team-review.service'
import { ManagerTeamViewsService } from './manager-team-views.service'

/**
 * Manager / Head-of-Sales dashboard. Owner/admin-only consolidated team view.
 * The role gate lives in the service (via the caller's resolved workspace role).
 */
@Controller('manager')
// Le cockpit d'équipe est une surface de palier.
@RequireFeature('manager_cockpit')
// La porte DÉCLARÉE, et non un test de rôle enfoui dans le service : c'est elle
// que lit l'écran des permissions, et c'est elle qui accorde le cockpit à
// `sales_ops` — dont la définition même est « commercial + gestion d'équipe ».
@RequirePermission('team:manage')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ManagerController {
  constructor(
    private readonly manager: ManagerService,
    private readonly teamReview: TeamReviewService,
    private readonly views: ManagerTeamViewsService,
  ) {}

  /**
   * #4158.37 — `?periode=7|30|90` (défaut 7) : UNE période pour tout l'écran.
   * Une valeur hors liste retombe sur 7 j plutôt qu'un 400 sur une lecture.
   */
  @Get('team-stats')
  getTeamStats(@CurrentUser() user: CurrentUserPayload, @Query('periode') periode?: string) {
    return this.manager.getTeamStats(user.userId, parseManagerPeriodDays(periode))
  }

  /**
   * Théo D team-review.N1 — enregistre le « point d'équipe » : les décisions
   * deviennent des actions du plan (mises à jour, jamais dupliquées). Rien ne
   * part, aucune affaire ne change d'étape.
   */
  @Post('team-review')
  saveTeamReview(@CurrentUser() user: CurrentUserPayload, @Body() body: SaveTeamReviewDto) {
    return this.teamReview.save(user.userId, body)
  }

  /** Théo D team-business — objectifs du mois, affaires ouvertes, portefeuille de comptes. */
  @Get('team-business')
  getTeamBusiness(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    return this.views.getBusiness(user.userId, month && MONTH.test(month) ? month : undefined)
  }

  /** Théo D team-plans — les actions ouvertes de l'équipe, avec qui les a confiées. */
  @Get('team-plans')
  getTeamPlans(@CurrentUser() user: CurrentUserPayload) {
    return this.views.getPlans(user.userId)
  }
}

/** Un mois `YYYY-MM-01` bien formé ; toute autre valeur retombe sur le mois courant. */
const MONTH = MEMBER_OBJECTIVE_MONTH_PATTERN
