import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  AUDIT_INTERPRETATION_FIELD_KEY,
  esnAnswersSchema,
  hasPermission,
  type CreateEsnProfileCorrectionRequest,
  type EsnProfileCorrectionRequest,
} from '@bellum/contracts'
import { EsnProfileCorrectionRequestEntity } from '../../database/entities/esn-profile-correction-request.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Clés réelles du contrat `EsnAnswers` — un signalement ne peut viser QUE
 *  l'une d'elles, jamais une clé fabriquée. */
const ANSWER_KEYS = new Set(Object.keys(esnAnswersSchema.shape))

function toResponse(row: EsnProfileCorrectionRequestEntity): EsnProfileCorrectionRequest {
  return {
    id: row.id,
    fieldKey: row.field_key,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
  }
}

/**
 * #2018.7/.8 — SIGNALER une information d'entreprise fausse, SANS l'écraser.
 *
 * ⚠️ Cette classe n'injecte AUCUN dépôt `EsnProfileEntity` : structurellement,
 * elle ne peut pas écrire le profil canonique. La correction reste le geste de
 * qui a `team:manage`, sur `PUT /esn-profile` (`EsnProfileService`).
 */
@Injectable()
export class EsnProfileCorrectionRequestService {
  private readonly logger = new Logger(EsnProfileCorrectionRequestService.name)

  constructor(
    @InjectRepository(EsnProfileCorrectionRequestEntity)
    private readonly requests: Repository<EsnProfileCorrectionRequestEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateEsnProfileCorrectionRequest): Promise<EsnProfileCorrectionRequest> {
    // #2010.15 — une interprétation de l'audit se signale sur la MÊME porte,
    // avec une clé fixe hors du contrat `EsnAnswers` (voir le docblock de
    // `AUDIT_INTERPRETATION_FIELD_KEY`) — jamais une clé fabriquée librement.
    if (dto.fieldKey !== AUDIT_INTERPRETATION_FIELD_KEY && !ANSWER_KEYS.has(dto.fieldKey)) {
      throw new BadRequestException(`Champ inconnu : ${dto.fieldKey}`)
    }

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const saved = await this.requests.save(
      this.requests.create({
        workspace_id: workspaceId,
        reporter_user_id: userId,
        field_key: dto.fieldKey,
        reason: dto.reason,
        status: 'pending',
      }),
    )

    await this.notifyAdmins(userId, dto.fieldKey)
    return toResponse(saved)
  }

  /**
   * #2018.8 — LE CANAL DE NOTIFICATION EXISTE DÉJÀ (`modules/notifications`) :
   * un réglage vit à UN seul endroit (GA-26). Réutilisé tel quel, jamais un
   * second système.
   *
   * `origin: 'user_triggered'`, comme `playbook-send.sweeper.ts` (« un playbook
   * armé attend une validation ») : le plafond de proactivité protège d'une
   * SUGGESTION de trop, pas d'une décision qui attend un administrateur — une
   * notification avalée ici laisserait une information fausse sans correction,
   * invisible.
   *
   * Best-effort : un canal en panne ne doit jamais faire échouer le
   * signalement, déjà persisté et visible pour son auteur.
   */
  private async notifyAdmins(reporterId: string, fieldKey: string): Promise<void> {
    try {
      const members = await this.workspaceContext.listMembers(reporterId)
      const admins = members.filter(member => !member.isSelf && hasPermission(member.role, 'team:manage'))
      // #2010.15 — une interprétation de l'audit signalée renvoie vers
      // l'écran de l'audit, pas vers Réglages › Profil : le lien doit
      // ouvrir ce que l'administrateur doit relire.
      const isAuditInterpretation = fieldKey === AUDIT_INTERPRETATION_FIELD_KEY
      for (const admin of admins) {
        await this.notifications.createNotification(admin.userId, {
          type: 'system',
          title: isAuditInterpretation
            ? 'Une interprétation de l’audit est signalée comme fausse'
            : "Une information d'entreprise est signalée comme fausse",
          body: isAuditInterpretation
            ? "Un membre a signalé qu'une interprétation de l'audit ne lui semble pas juste — rien n'a été modifié, la relecture reste à faire."
            : `Champ concerné : ${fieldKey}. Un membre a signalé une erreur — rien n'a été modifié, la correction reste à faire.`,
          link: isAuditInterpretation ? '/settings/profile/audit' : '/settings/profile',
          origin: 'user_triggered',
        })
      }
    } catch (error) {
      this.logger.warn('Notification des administrateurs impossible pour un signalement de profil (non bloquant)', {
        error,
        fieldKey,
      })
    }
  }
}
