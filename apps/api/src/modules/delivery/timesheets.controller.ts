import { Body, Controller, Get, Logger, Optional, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  explainGapSchema,
  internalReviewSchema,
  markTimesheetNotApplicableSchema,
  rejectTimesheetSchema,
  timelineSystemSubject,
  type TimesheetExceptionTimelineKey,
  timesheetMonthQuerySchema,
  timesheetReviewQuerySchema,
  validateByClientSchema,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActivitiesService } from '../activities/activities.service'
import { ContactStopService } from '../contact-stop/contact-stop.service'
import { TimesheetsService, type TimesheetExceptionTrace } from './timesheets.service'

class TimesheetMonthQueryDto extends createZodDto(timesheetMonthQuerySchema) {}
class ExplainGapDto extends createZodDto(explainGapSchema) {}
class ValidateByClientDto extends createZodDto(validateByClientSchema) {}
class InternalReviewDto extends createZodDto(internalReviewSchema) {}
class RejectTimesheetDto extends createZodDto(rejectTimesheetSchema) {}
class TimesheetReviewQueryDto extends createZodDto(timesheetReviewQuerySchema) {}
class MarkNotApplicableDto extends createZodDto(markTimesheetNotApplicableSchema) {}
class OpenExpectedDto extends createZodDto(
  z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM') }).strict(),
) {}

/**
 * Le relevé d'activité, à la maille mission × consultant (PDF 5 §7).
 *
 * Aucune route ne valide À LA PLACE du client : `client-validation` enregistre
 * une validation obtenue ailleurs. Le produit ne signe rien pour personne.
 */
@Controller('delivery/timesheets')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class TimesheetsController {
  private readonly logger = new Logger(TimesheetsController.name)

  constructor(
    private readonly timesheets: TimesheetsService,
    private readonly workspaceContext: WorkspaceContextService,
    // #2196.31 — le JOURNAL de la mission. `@Optional()` : sans lui, le geste
    // se comporte exactement pareil, seule la ligne d'historique manque.
    @Optional() private readonly activities?: ActivitiesService,
    // #2416.37 — la porte PERSONNE. `@Optional()` même raison : sans elle, les
    // relances restent dues, aucune n'est coupée par un opt-out.
    @Optional() private readonly contactStops?: ContactStopService,
  ) {}

  /** Un seul endroit résout l'espace actif — le service n'a pas à connaître le
   *  module Workspace (règle §3.2, garde GA-07). */
  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  async month(@CurrentUser() user: CurrentUserPayload, @Query() query: TimesheetMonthQueryDto) {
    return this.timesheets.month(await this.scope(user.userId), query)
  }

  /** Ouvre les relevés attendus d'un mois. Idempotent : rejouer ne double rien. */
  @Post('open')
  @RequirePermission('records:write')
  async open(@CurrentUser() user: CurrentUserPayload, @Body() body: OpenExpectedDto) {
    return this.timesheets.openExpected(await this.scope(user.userId), body.month)
  }

  /**
   * LE DOSSIER D'UN RELEVÉ, pour le tiroir de validation.
   *
   * ⚠️ Un segment LITTÉRAL, et déclaré AVANT toute route paramétrée de ce
   * contrôleur : Nest ordonne par déclaration, pas par spécificité, et une
   * route littérale capturée par un `:id` rend 500 en production sans jamais
   * échouer en test — le défaut est déjà passé ici.
   *
   * ⚠️ La maille passe par la QUERY (mission × mois × consultant) et non par un
   * `:id` : un mois sans dépôt n'a pas d'identifiant de relevé, et c'est
   * précisément le mois qu'il faut pouvoir ouvrir.
   */
  @Get('review')
  async review(@CurrentUser() user: CurrentUserPayload, @Query() query: TimesheetReviewQueryDto) {
    return this.timesheets.review(await this.scope(user.userId), query)
  }

  /**
   * #2196.31 — MARQUE un relevé « non applicable » : une exception TRACÉE
   * (qui, quand, pourquoi — motif exigé par le DTO), qui prime sur la
   * déduction du contrat pour CE mois. La maille passe par le CORPS : un mois
   * sans dépôt n'a pas d'identifiant de relevé.
   *
   * Segment LITTÉRAL, déclaré avant les routes paramétrées de ce contrôleur.
   */
  @Post('not-applicable')
  @RequirePermission('records:write')
  async markNotApplicable(@CurrentUser() user: CurrentUserPayload, @Body() body: MarkNotApplicableDto) {
    const workspaceId = await this.scope(user.userId)
    const trace = await this.timesheets.markNotApplicable(workspaceId, user.userId, body)
    await this.journal(workspaceId, user.userId, trace, 'timesheet_not_applicable')
    return trace
  }

  /**
   * #2196.31 — ANNULE l'exception : elle est RÉVOQUÉE (on archive, on ne
   * supprime pas), la déduction du contrat reprend.
   */
  @Post('not-applicable/:exceptionId/revoke')
  @RequirePermission('records:write')
  async revokeNotApplicable(
    @CurrentUser() user: CurrentUserPayload,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
  ) {
    const workspaceId = await this.scope(user.userId)
    const trace = await this.timesheets.revokeNotApplicable(workspaceId, user.userId, exceptionId)
    await this.journal(workspaceId, user.userId, trace, 'timesheet_not_applicable_revoked')
    return trace
  }

  /**
   * #2196.31 — la ligne du JOURNAL de la mission : l'historique du compte
   * porteur (l'onglet « Historique » de la fiche mission). Objet système
   * `<mission · mois> — <clé>` que l'écran traduit ; le MOTIF en corps ;
   * l'auteur est l'utilisateur. Idempotente par `externalId`.
   *
   * Best-effort : la trace qui/quand/pourquoi vit déjà dans
   * `mission_timesheet_exceptions` — un journal en panne ne défait pas le geste.
   */
  private async journal(
    workspaceId: string,
    userId: string,
    trace: TimesheetExceptionTrace,
    key: TimesheetExceptionTimelineKey,
  ): Promise<void> {
    if (!this.activities || !trace.accountId) return
    try {
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'workflow',
          source: 'system',
          direction: 'internal',
          subject: timelineSystemSubject(`${trace.missionLabel ?? 'Mission'} · ${trace.periodMonth.slice(0, 7)}`, key),
          body: trace.reason,
          occurredAt: trace.at,
          durationSeconds: null,
          accountId: trace.accountId,
          contactId: null,
          projectId: null,
          linkReason: null,
          externalId: `timesheet-exception:${trace.id}:${key}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Timesheet exception journal not recorded: ${(error as Error).message}`)
    }
  }

  /**
   * Les relances DUES, et par quel canal. Le produit les liste ; il n'en
   * envoie aucune — écrire à quelqu'un reste un geste humain.
   *
   * #2416.37 — la CINQUIÈME condition d'arrêt (l'opt-out) traverse la porte
   * PERSONNE ici, dans le CONTRÔLEUR (§3.2, GA-07 : le service des relevés
   * n'importe pas le service d'un module voisin). Le contact CRA à qui
   * chaque relance s'adresse réellement vient de `craContactIdsFor` — une
   * lecture propre au module des relevés.
   */
  @Get('reminders')
  async reminders(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    const workspaceId = await this.scope(user.userId)
    const due = await this.timesheets.dueReminders(workspaceId, user.userId, month)
    if (due.items.length === 0 || !this.contactStops) return due

    const contactByKey = await this.timesheets.craContactIdsFor(
      workspaceId,
      due.items.map(item => ({ timesheetId: item.line.timesheetId, missionId: item.line.missionId })),
    )
    const contactIds = [...new Set([...contactByKey.values()].filter((id): id is string => !!id))]
    const stoppedContactIds = contactIds.length
      ? await this.contactStops.stoppedAmong(workspaceId, contactIds)
      : new Set<string>()

    return {
      channel: due.channel,
      items: due.items.filter(item => {
        const contactId = contactByKey.get(item.line.timesheetId ?? `mission:${item.line.missionId}`)
        return !contactId || !stoppedContactIds.has(contactId)
      }),
    }
  }

  /**
   * #2972 — les relevés ESCALADÉS, et vers quel PORTEUR de mission le sujet
   * remonte. Jamais un envoi : le produit le DIT, Laura prépare, un humain
   * agit.
   */
  @Get('escalations')
  async escalations(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    return this.timesheets.dueEscalations(await this.scope(user.userId), user.userId, month)
  }

  /** Enregistre qu'une relance est PARTIE — le compteur est ce qui empêche
   *  d'en envoyer une quatrième. */
  @Post(':id/reminder')
  @RequirePermission('records:write')
  async recordReminder(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.timesheets.recordReminder(await this.scope(user.userId), id)
  }

  @Post(':id/explain-gap')
  @RequirePermission('records:write')
  async explain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ExplainGapDto,
  ) {
    return this.timesheets.explainGap(await this.scope(user.userId), id, body.explanation)
  }

  /**
   * REJETTE un relevé. Le motif, la quantité CONTESTÉE et la DEADLINE de
   * correction sont exigés par le DTO, donc par le serveur (#2415.7) — un
   * champ grisé côté écran n'est pas une garantie, un appel direct le
   * contournerait. Le corps est `.strict()` : rien d'autre n'entre.
   */
  @Post(':id/reject')
  @RequirePermission('records:write')
  async reject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectTimesheetDto,
  ) {
    return this.timesheets.reject(
      await this.scope(user.userId),
      user.userId,
      id,
      body.reason,
      body.contestedDays,
      body.correctionDeadline,
    )
  }

  @Post(':id/client-validation')
  @RequirePermission('records:write')
  async validate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ValidateByClientDto,
  ) {
    return this.timesheets.validateByClient(await this.scope(user.userId), user.userId, id, body.at)
  }

  /**
   * #2415.6 — MARQUE la revue INTERNE, distincte de la validation client
   * (`:id/client-validation` ci-dessus). Un geste séparé, additif.
   */
  @Post(':id/internal-review')
  @RequirePermission('records:write')
  async reviewInternally(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InternalReviewDto,
  ) {
    return this.timesheets.reviewInternally(await this.scope(user.userId), user.userId, id, body.at)
  }
}
