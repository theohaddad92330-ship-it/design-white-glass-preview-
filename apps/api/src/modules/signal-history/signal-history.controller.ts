import { Body, Controller, Logger, NotFoundException, Optional, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { ActivitiesService } from '../activities/activities.service'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { LinkSignalActionDto } from './dto/link-signal-action.dto'
import { VerifySignalDto } from './dto/verify-signal.dto'
import { SignalHistoryService } from './signal-history.service'

/** Longueur max du libellé d'action, pour qu'il reste lisible dans la checklist. */
const ACTION_LABEL_MAX = 200

/**
 * « Ce signal a déclenché une action » (restitution V2 §20 — l'objet `Signal`
 * exige *type, source, date, fraîcheur, importance, ACTION*).
 *
 * Le lien signal → action n'est jamais deviné : il est posé quand l'utilisateur
 * transforme UN signal précis de la Veille en action de son plan. On réutilise
 * la checklist existante (`action_plan_items` via `ActionPlanItemsService`) —
 * aucun nouveau type d'action n'est créé — puis on estampille `action_id` sur la
 * ligne d'historique du signal.
 *
 * Le signal doit exister dans l'historique du workspace du demandeur : sinon on
 * répond 404 et AUCUNE action n'est laissée derrière (l'appartenance est vérifiée
 * AVANT la création).
 *
 * #2695 — l'écriture laissait `action_plan_items` et `signal_history.action_id`
 * (sans horodatage propre) mais RIEN dans `activities`, la seule table que lisent
 * Historique et Actions exécutées (`useTimeline`). Le geste enregistre donc AUSSI
 * une activité `kind: 'task'` (déjà dans `ACTIVITY_KINDS`, aucune migration) —
 * provenance (`accountId`), heure (`occurredAt`) et lien (`externalId`) posés au
 * même instant que la création, jamais reconstruits après coup.
 */
@Controller('signal-history')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class SignalHistoryController {
  private readonly logger = new Logger(SignalHistoryController.name)

  constructor(
    private readonly signalHistory: SignalHistoryService,
    private readonly planItems: ActionPlanItemsService,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly activities?: ActivitiesService,
  ) {}

  @Post('actions')
  async createAction(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: LinkSignalActionDto,
  ): Promise<{ actionId: string; actionLabel: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)

    // 1) Le signal existe-t-il, dans MON workspace ? (avant toute écriture)
    const known = await this.signalHistory.hasSignal({
      workspaceId,
      accountId: dto.accountId,
      label: dto.label,
    })
    if (!known) throw new NotFoundException('Signal introuvable')

    // 2) L'action, intitulée d'après le signal — jamais un texte libre du client.
    const label = `Traiter le signal : ${dto.label.trim()}`.slice(0, ACTION_LABEL_MAX)
    const item = await this.planItems.createManual(user.userId, dto.accountId, {
      label,
      dueDate: dto.dueDate ?? null,
    })

    // 3) Le lien. Un échec ici laisse l'action en place (elle a bien été créée)
    //    mais ne prétend pas que le signal l'a déclenchée.
    await this.signalHistory.linkAction({
      workspaceId,
      accountId: dto.accountId,
      label: dto.label,
      actionId: item.id,
    })

    // 4) La trace (#2695) : provenance, heure et lien, posés au moment du
    //    geste. Best-effort — une action déjà créée ne doit pas échouer parce
    //    que sa trace, elle, a raté.
    await this.recordActivity(workspaceId, user.userId, dto.accountId, item.label, item.id)

    return { actionId: item.id, actionLabel: item.label }
  }

  /**
   * « Marquer ce signal comme vérifié » (#3206.2 partiel, épopée #3240) — le
   * commercial confirme que le signal tient encore, sans attendre une
   * re-détection. Même garde d'appartenance que `createAction` : le signal
   * doit exister dans l'historique du DEMANDEUR avant toute écriture.
   */
  @Post('verify')
  // #3206.2 — marquer un signal vérifié ÉCRIT dans l'historique de l'espace.
  @RequirePermission('records:write')
  async verify(@CurrentUser() user: CurrentUserPayload, @Body() dto: VerifySignalDto): Promise<{ verified: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)

    const known = await this.signalHistory.hasSignal({
      workspaceId,
      accountId: dto.accountId,
      label: dto.label,
    })
    if (!known) throw new NotFoundException('Signal introuvable')

    const verified = await this.signalHistory.verifySignal({
      workspaceId,
      accountId: dto.accountId,
      label: dto.label,
    })
    return { verified }
  }

  private async recordActivity(
    workspaceId: string,
    userId: string,
    accountId: string,
    label: string,
    actionId: string,
  ): Promise<void> {
    if (!this.activities) return
    try {
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'task',
          source: 'system',
          direction: 'internal',
          subject: label,
          body: null,
          occurredAt: new Date().toISOString(),
          durationSeconds: null,
          accountId,
          contactId: null,
          projectId: null,
          linkReason: 'manual',
          // Une clé stable : rejouer le même clic ne produit pas deux lignes.
          externalId: `signal-action:${actionId}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Signal action not recorded in the timeline: ${(error as Error).message}`)
    }
  }
}
