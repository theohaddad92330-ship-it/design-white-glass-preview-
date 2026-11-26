import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { recordContactStopSchema, type ContactStop, type RecordContactStopRequest } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ContactStopService } from './contact-stop.service'

/**
 * Déclarer, et relire, le refus d'une personne.
 *
 * ## La permission, et pourquoi c'est celle-là
 *
 * `messages:send`. Poser un arrêt n'envoie rien — mais c'est le geste de
 * quelqu'un qui PARLE aux contacts, et c'est le seul rôle qui sait de quoi il
 * retourne. Un lecteur ne prononce pas l'arrêt d'un interlocuteur qu'il n'a
 * jamais appelé ; et exiger un rôle de responsable mettrait une validation
 * entre une personne qui a dit « cessez » et le moment où l'on cesse.
 *
 * ## Le clic EST la décision
 *
 * Aucune porte d'approbation : c'est un geste d'utilisateur, donc auto-approuvé
 * — et la seule direction possible est la retenue. Une écriture qui ne fait
 * qu'arrêter n'a jamais besoin d'être freinée.
 *
 * ## Pas de route de LEVÉE
 *
 * Volontairement. Défaire un refus est un geste dont le titulaire est la
 * personne, pas nous, et le produit n'offre déjà aucun moyen de retirer un
 * désabonnement. Décision D351 — le jour où elle est tranchée, elle arrive avec
 * sa migration.
 */
@Controller('contacts/:id/stop')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContactStopController {
  constructor(
    private readonly stops: ContactStopService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Pose l'arrêt — et retire le moyen (l'adresse part à la liste de suppression). */
  @Post()
  @RequirePermission('messages:send')
  async record(
    @Param('id', ParseUUIDPipe) contactId: string,
    @Body(new ZodValidationPipe(recordContactStopSchema)) body: RecordContactStopRequest,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ContactStop> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.stops.record({
      workspaceId,
      contactId,
      declaredBy: user.userId,
      motion: body.motion ?? null,
      outcome: body.outcome ?? null,
      ...(body.reason ? { reason: body.reason } : {}),
      note: body.note ?? null,
    })
  }

  /**
   * L'arrêt de ce contact, ou `null`.
   *
   * `null` et non un objet à faux : « aucun arrêt » et « un arrêt levé » ne sont
   * pas la même chose, et un booléen les confondrait le jour où la levée
   * existera.
   */
  @Get()
  async read(
    @Param('id', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ContactStop | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.stops.verdict(workspaceId, contactId)
  }
}
