import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CommercialAuditFeedback, CreateCommercialAuditFeedbackRequest } from '@bellum/contracts'
import { CommercialAuditFeedbackEntity } from '../../database/entities/commercial-audit-feedback.entity'

/**
 * #2075.12 / #2075.13 (épopée #2774) — commenter une conclusion de l'audit
 * commercial, refuser une recommandation.
 *
 * APPEND-ONLY (migration `1796322160100`, même patron que
 * `outreach_transitions`) : `create` insère toujours une ligne NEUVE, jamais
 * une mise à jour — « on archive, on ne supprime pas », et une correction
 * humaine (reconsidérer un refus, reformuler un commentaire) reste lisible
 * comme un second geste daté, pas une ligne réécrite qui effacerait le
 * premier. `listForUser` ne garde que la plus RÉCENTE par cible : l'écran
 * affiche l'état courant, jamais l'historique complet.
 *
 * ⚠️ Volontairement distinct de `profiles.audit_move_decisions` (JSONB,
 * `ProfileContextService.recordAuditMoveDecision`) : cette colonne ÉCRASE la
 * décision précédente au même geste, un choix qui tient pour « valider /
 * modifier / écarter » un mouvement proposé (une seule décision a un sens à
 * la fois). Un commentaire ou un refus sur une conclusion est une note
 * PERSONNELLE qui peut se répéter ou se corriger dans le temps — l'écraser
 * perdrait la trace que la doctrine demande de garder.
 */
@Injectable()
export class CommercialAuditFeedbackService {
  constructor(
    @InjectRepository(CommercialAuditFeedbackEntity)
    private readonly feedback: Repository<CommercialAuditFeedbackEntity>,
  ) {}

  async create(userId: string, workspaceId: string | null, input: CreateCommercialAuditFeedbackRequest): Promise<void> {
    await this.feedback.insert({
      user_id: userId,
      workspace_id: workspaceId,
      target_key: input.target_key,
      kind: input.kind,
      comment_text: input.kind === 'comment' ? input.comment_text : null,
    })
  }

  /**
   * La note la plus RÉCENTE par `target_key` — jamais l'historique complet
   * (celui-là reste en base, append-only, mais aucun écran ne le demande
   * aujourd'hui). Les lignes sont lues triées `created_at DESC` : la première
   * rencontrée pour une cible EST la plus récente, un `Map` la garde et ignore
   * les suivantes de la même cible plutôt qu'une seconde requête par cible
   * (`DISTINCT ON`, réservé au SQL brut — inutile ici pour un volume par
   * utilisateur qui reste celui de SES notes).
   */
  async listForUser(userId: string): Promise<Record<string, CommercialAuditFeedback>> {
    const rows = await this.feedback.find({ where: { user_id: userId }, order: { created_at: 'DESC' } })
    const byTarget: Record<string, CommercialAuditFeedback> = {}
    for (const row of rows) {
      if (byTarget[row.target_key]) continue
      byTarget[row.target_key] = {
        target_key: row.target_key,
        kind: row.kind,
        comment_text: row.comment_text,
        created_at: row.created_at.toISOString(),
      }
    }
    return byTarget
  }
}
