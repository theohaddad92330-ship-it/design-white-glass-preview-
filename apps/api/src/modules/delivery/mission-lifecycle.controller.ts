import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import {
  addDays,
  endMissionInputSchema,
  extendMissionInputSchema,
  type EndMissionInput,
  type ExtendMissionInput,
  type MissionLifecycleResult,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ConsultantEngagementService } from '../consultants/consultant-engagement.service'
import { DeliveryService } from './delivery.service'
import { MissionAmendmentService } from './mission-amendment.service'
import { MissionEndService } from './mission-end.service'
import { MissionStatusService } from './mission-status.service'

/** Une mission dans ces statuts a fini sa vie : on ne la termine pas deux fois, on ne la prolonge pas. */
const FINISHED_STATUSES = ['completed', 'cancelled']

/**
 * #4196 (épopée #4191, lot L5) — terminer et prolonger une mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ORCHESTRATION VIT ICI, ET PAS DANS UN SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un geste « Terminer » traverse trois domaines : la mission (statut, motif,
 * échéance), l'avenant (historique) et la fiche du consultant (qui redevient
 * disponible). GA-07 interdit qu'un service en appelle un d'un autre module :
 * le CONTRÔLEUR est la couche où un geste utilisateur traverse légitimement
 * plusieurs domaines.
 *
 * Le NO-GO de `MissionAmendmentService` (#2423.10) reste respecté : il n'écrit
 * toujours que `mission_amendments`. L'APPLICATION de l'avenant accepté à
 * `missions.ends_on` / `daily_rate` passe ici par `DeliveryService.updateMission`
 * — qui ferme au passage la fenêtre de l'ancien TJM dans `mission_rate_history`,
 * sans jamais recalculer une période déjà facturée.
 *
 * Même permission que le statut de mission (`records:write`) : c'est le même
 * geste de fond.
 */
@Controller('delivery/missions/:missionId')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionLifecycleController {
  constructor(
    private readonly statuses: MissionStatusService,
    private readonly missionEnd: MissionEndService,
    private readonly amendments: MissionAmendmentService,
    private readonly delivery: DeliveryService,
    private readonly engagement: ConsultantEngagementService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** Terminer : statut « terminée », motif typé, consultants libérés au lendemain de la fin. */
  @Post('end')
  @RequirePermission('records:write')
  async end(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body(new ZodValidationPipe(endMissionInputSchema)) body: EndMissionInput,
  ): Promise<MissionLifecycleResult> {
    const workspaceId = await this.scope(user.userId)
    const facts = await this.statuses.lifecycleFacts(workspaceId, missionId)
    if (!facts) throw new NotFoundException('Mission introuvable')
    if (FINISHED_STATUSES.includes(facts.status)) {
      throw new ConflictException('Cette mission est déjà terminée ou annulée.')
    }

    // La table de statuts a le dernier mot : si elle refuse (409), rien d'autre n'est écrit.
    await this.statuses.changeMissionStatus(workspaceId, user.userId, missionId, { to: 'completed' })
    await this.missionEnd.setEndReason(workspaceId, missionId, { reason: body.reason })
    if (facts.endsOn !== body.endedOn) {
      await this.delivery.updateMission(user.userId, missionId, { endsOn: body.endedOn })
    }
    const consultants = await this.engagement.release(
      workspaceId,
      user.userId,
      missionId,
      facts.consultantIds,
      body.endedOn,
    )
    return { missionId, status: 'completed', endsOn: body.endedOn, consultants }
  }

  /**
   * Prolonger : un avenant `end_date_change` proposé puis accepté (c'est
   * l'HISTORIQUE), l'échéance — et le TJM s'il change — appliqués à la mission,
   * la disponibilité du consultant repoussée au lendemain de la nouvelle fin.
   */
  @Post('extend')
  @RequirePermission('records:write')
  async extend(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body(new ZodValidationPipe(extendMissionInputSchema)) body: ExtendMissionInput,
  ): Promise<MissionLifecycleResult> {
    const workspaceId = await this.scope(user.userId)
    const facts = await this.statuses.lifecycleFacts(workspaceId, missionId)
    if (!facts) throw new NotFoundException('Mission introuvable')
    if (FINISHED_STATUSES.includes(facts.status)) {
      throw new ConflictException('Une mission terminée ou annulée ne se prolonge pas.')
    }
    if (facts.endsOn && body.newEndsOn <= facts.endsOn) {
      throw new BadRequestException('La nouvelle échéance doit être postérieure à l’échéance actuelle.')
    }

    const proposed = await this.amendments.propose(workspaceId, user.userId, missionId, {
      eventType: 'end_date_change',
      effectiveFrom: facts.endsOn ? addDays(facts.endsOn, 1) : new Date().toISOString().slice(0, 10),
      proof: body.proof,
      previousTerm: { endsOn: facts.endsOn, dailyRate: facts.dailyRate },
      newTerm: { endsOn: body.newEndsOn, ...(body.newDailyRate !== undefined ? { dailyRate: body.newDailyRate } : {}) },
    })
    await this.amendments.changeStatus(workspaceId, user.userId, missionId, proposed.id, { to: 'accepted' })

    await this.delivery.updateMission(user.userId, missionId, {
      endsOn: body.newEndsOn,
      ...(body.newDailyRate !== undefined ? { dailyRate: body.newDailyRate } : {}),
    })
    const consultants = await this.engagement.startEngagement(
      workspaceId,
      user.userId,
      facts.consultantIds,
      body.newEndsOn,
    )
    return { missionId, status: facts.status, endsOn: body.newEndsOn, consultants }
  }
}
