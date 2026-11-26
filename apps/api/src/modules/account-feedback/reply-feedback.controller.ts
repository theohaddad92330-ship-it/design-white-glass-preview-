import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { ReplyFeedbackAck, ReplyFeedbackItem } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { OrgGraphVersionService } from '../org-graph/org-graph.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountFeedbackService } from './account-feedback.service'
import { CreateReplyFeedbackDto } from './dto/reply-feedback.dto'
import { ReplyFeedbackService } from './reply-feedback.service'

/**
 * #1919 — DIRE À LAURA QU'UNE RÉPONSE NE VA PAS.
 *
 * `@PersonalScope` : un retour sur une réponse est la mémoire de CELUI qui le
 * donne — un `viewer` doit pouvoir dire « pas pertinent » sans `records:write`,
 * et aucun collègue ne lit ces lignes.
 *
 * ⚠️ UNE exception, et elle est écrite en code plutôt que supposée : « Donnée
 * fausse » avec le périmètre « le dossier de ce compte » (#1919.7) corrige une
 * donnée d'ÉQUIPE. Cette branche-là exige `records:write` AVANT toute écriture,
 * puis passe par la porte existante du dossier (`AccountFeedbackService.create`
 * + le versionnement du graphe) — la même que « Signaler › Faux » sur le
 * dossier, jamais une écriture parallèle. L'orchestration vit ici parce qu'un
 * geste d'utilisateur qui traverse deux domaines appartient au contrôleur
 * (GA-07).
 */
@Controller('reply-feedback')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@PersonalScope()
export class ReplyFeedbackController {
  constructor(
    private readonly replyFeedback: ReplyFeedbackService,
    private readonly accountFeedback: AccountFeedbackService,
    private readonly workspaceContext: WorkspaceContextService,
    // Même `@Optional()` que le contrôleur du dossier : absent, la correction
    // est enregistrée sans bump de version du graphe.
    @Optional() private readonly orgGraph?: OrgGraphVersionService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateReplyFeedbackDto,
  ): Promise<ReplyFeedbackAck> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.replyFeedback.assertTargetsInWorkspace({
      workspaceId,
      accountId: dto.accountId ?? null,
      contactId: dto.contactId ?? null,
    })

    let accountFeedbackId: string | null = null
    // #1919.7 — la correction du DOSSIER passe par le mécanisme existant.
    if (dto.verdict === 'donnee_fausse' && dto.correction?.scope === 'account' && dto.accountId) {
      await this.workspaceContext.assertPermission(user.userId, workspaceId, 'records:write')
      const correction = await this.accountFeedback.create({
        accountId: dto.accountId,
        workspaceId,
        userId: user.userId,
        target: 'global',
        targetRef: dto.correction.field,
        verdict: 'faux',
        note: dto.correction.value,
      })
      await this.orgGraph?.recordCorrection({
        accountId: dto.accountId,
        target: 'global',
        targetRef: dto.correction.field,
        verdict: 'faux',
      })
      accountFeedbackId = correction.id
    }

    return this.replyFeedback.create({ workspaceId, userId: user.userId, body: dto, accountFeedbackId })
  }

  /** #1919.17 — les retours de la personne, remontrés sous leurs réponses. */
  @Get('mine')
  async listMine(@CurrentUser() user: CurrentUserPayload): Promise<{ items: ReplyFeedbackItem[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.replyFeedback.listMine({ workspaceId, userId: user.userId }) }
  }

  /** Retirer SON retour. 404 quand il n'est pas le sien ou est déjà retiré. */
  @Post(':id/withdraw')
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ withdrawn: true }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const withdrawn = await this.replyFeedback.withdraw({ id, workspaceId, userId: user.userId })
    if (!withdrawn) throw new NotFoundException('Retour introuvable')
    return { withdrawn: true }
  }
}
