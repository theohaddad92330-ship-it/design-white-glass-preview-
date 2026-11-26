import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import type { Activity, ActivitySyncResult, EngagementSummary } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ActivitiesService } from './activities.service'
import { ActivityCaptureService } from './activity-capture.service'
import { ActivityQueryDto, ActivitySyncDto, LogActivityDto } from './dto/activity.dto'

/**
 * La timeline d'un objet, et ce qui la remplit.
 *
 * Un contrôleur à part plutôt qu'une route de plus sur `/accounts` : la
 * timeline vaut pour un compte, un contact ET un projet, et trois copies de la
 * même route sur trois préfixes finiraient par diverger.
 */
@Controller('activities')
@RequireFeature('crm_native')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ActivitiesController {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly capture: ActivityCaptureService,
  ) {}

  /** « Que s'est-il passé ici, dans l'ordre ? » */
  @Get()
  timeline(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ActivityQueryDto,
  ): Promise<{ items: Activity[]; engagement: EngagementSummary }> {
    return this.activities.timeline(user.userId, query.scope, query.id, {
      kind: query.kind,
      limit: query.limit,
    })
  }

  /** La saisie à la main — le geste du commercial qui raccroche. */
  @Post()
  @RequirePermission('records:write')
  log(@CurrentUser() user: CurrentUserPayload, @Body() body: LogActivityDto): Promise<Activity> {
    return this.activities.log(user.userId, body)
  }

  /**
   * Retirer une saisie faite par erreur. Réservé aux activités MANUELLES et à
   * leur auteur — un échange capturé chez un fournisseur reviendrait à la
   * prochaine récupération, et un bouton qui ne tient pas est pire que rien.
   */
  @Delete(':id')
  @RequirePermission('records:write')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.activities.remove(user.userId, id)
  }

  /**
   * Va chercher ce que les outils connectés savent déjà.
   *
   * `records:write` parce que la capture ÉCRIT dans l'espace : elle n'est pas
   * une lecture, même si tout ce qu'elle écrit vient d'ailleurs.
   */
  @Post('sync')
  @RequirePermission('records:write')
  sync(@CurrentUser() user: CurrentUserPayload, @Body() body: ActivitySyncDto): Promise<ActivitySyncResult> {
    return this.capture.sync(user.userId, { windowDays: body.windowDays })
  }
}
