import type { ImpersonationReasonCode } from '@bellum/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ImpersonationAuditEntity, type ImpersonationAction } from '../../database/entities/impersonation-audit.entity'
import { joinImpersonationSessions, type ImpersonationSession } from './impersonation-sessions'

type ImpersonationAuditInput = {
  jti: string
  impersonatorActor: string
  targetUserId: string
  targetEmail: string | null
  /** Le libellé lisible, DÉRIVÉ du code — jamais saisi. */
  reason: string
  /** Le code de catalogue (#1670). `null` sur `stop` : l'arrêt n'a pas de motif. */
  reasonCode: ImpersonationReasonCode | null
  /** LUDOVIC-D LC.10 — la précision libre et facultative du motif (`start`). */
  reasonDetail?: string | null
  action: ImpersonationAction
  ip: string | null
  correlationId: string | null
  expiresAt: Date | null
  /** LUDOVIC-D LC.10 — sur un `stop` posé depuis la console : l'admin qui a terminé. */
  endedBy?: string | null
}

/**
 * Writes the immutable impersonation audit trail. `start` is a HARD requirement —
 * the caller mints the token only after this insert commits, so a failure here
 * aborts the whole operation (no untraced impersonation). `stop`/`refused` are
 * best-effort so an audit hiccup never traps an operator inside a session or
 * hides a refusal.
 */
@Injectable()
export class ImpersonationAuditService {
  private readonly logger = new Logger(ImpersonationAuditService.name)

  constructor(
    @InjectRepository(ImpersonationAuditEntity)
    private readonly repo: Repository<ImpersonationAuditEntity>,
  ) {}

  /** Persist a row. Throws on failure — callers decide whether to swallow. */
  async record(input: ImpersonationAuditInput): Promise<void> {
    await this.repo.insert({
      jti: input.jti,
      impersonator_actor: input.impersonatorActor,
      target_user_id: input.targetUserId,
      target_email: input.targetEmail,
      reason: input.reason,
      reason_code: input.reasonCode,
      reason_detail: input.reasonDetail ?? null,
      action: input.action,
      ip: input.ip,
      correlation_id: input.correlationId,
      expires_at: input.expiresAt,
      ended_by: input.endedBy ?? null,
    })
  }

  /** LUDOVIC-D LC.10 — toutes les lignes d'UNE session (`start`, `stop`), pour la terminer. */
  async rowsForJti(jti: string): Promise<ImpersonationAuditEntity[]> {
    return this.repo.find({ where: { jti }, order: { created_at: 'ASC' } })
  }

  /** Best-effort variant for stop/refused: logs + swallows a write failure. */
  async recordBestEffort(input: ImpersonationAuditInput): Promise<void> {
    try {
      await this.record(input)
    } catch (err) {
      this.logger.error(`Failed to write impersonation audit row (${input.action})`, {
        error: err,
        tags: { 'impersonation.audit': input.action },
      })
    }
  }

  /**
   * #1665.2 — « aucun GET n'expose les sessions d'impersonation ». Fetch +
   * jointure (déléguée à `joinImpersonationSessions`, pure et testée sans
   * base) pour dériver Qui · Espace · Début · Durée · Motif.
   *
   * ⚠️ Plafonné comme le reste du dépôt (`recent()` du journal d'accès) : un
   * plafond haut sans borne finirait par sortir la table entière.
   */
  async listSessions(limit = 200): Promise<ImpersonationSession[]> {
    const borne = Math.min(Math.max(Math.floor(limit) || 0, 1), 500)
    const rows = await this.repo.find({ order: { created_at: 'DESC' }, take: borne })
    return joinImpersonationSessions(rows, new Date())
  }
}
