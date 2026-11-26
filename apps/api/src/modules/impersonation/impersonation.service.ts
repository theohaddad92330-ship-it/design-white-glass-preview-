import { IMPERSONATION_REASON_LABELS, type ImpersonationReasonCode } from '@bellum/contracts'
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { readImpersonationConfig } from '../auth/impersonation-config'
import { ImpersonationAuditService } from './impersonation-audit.service'
import { ImpersonationTokenService } from './impersonation-token.service'

type StartImpersonationInput = {
  targetUserId: string
  /** Le motif, en CODE de catalogue (#1670). Le libellé en est dérivé ici. */
  reasonCode: ImpersonationReasonCode
  /** LUDOVIC-D LC.10 — la précision libre et facultative du motif. */
  reasonDetail?: string | null
  impersonatorActor: string
  ip: string | null
  correlationId: string | null
}

type TerminateImpersonationInput = {
  jti: string
  /** L'admin de la console qui termine — enregistré comme `ended_by`. */
  adminActor: string
  ip: string | null
  correlationId: string | null
}

type TerminateImpersonationResult = 'terminated' | 'not_found' | 'not_ongoing'

export type StartImpersonationResult = {
  /** Full web URL the operator opens; the token rides in the URL FRAGMENT so it
   *  never hits a server log or Referer header. */
  redirectUrl: string
  targetEmail: string | null
  /** Unix seconds. */
  expiresAt: number
}

type StopImpersonationInput = {
  jti: string
  targetUserId: string
  impersonatorActor: string
  ip: string | null
  correlationId: string | null
}

/**
 * Orchestrates the admin impersonation lifecycle: scope checks → audit → token.
 *
 * Guardrails enforced here:
 *  - The target must be a real user (profile exists).
 *  - Protected users (other operators / superadmins listed in
 *    `IMPERSONATION_PROTECTED_USER_IDS`) can NEVER be impersonated; the refusal is
 *    audited + logged.
 *  - The `start` audit row is committed BEFORE the token is minted, so no token
 *    exists without a trace.
 *
 * The admin identity is authenticated upstream by `InternalSecretGuard` (the DM
 * super-admin console holds the internal secret); `impersonatorActor` is the
 * operator attribution label forwarded by the console.
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly tokens: ImpersonationTokenService,
    private readonly audit: ImpersonationAuditService,
    private readonly config: ConfigService,
  ) {}

  async start(input: StartImpersonationInput): Promise<StartImpersonationResult> {
    const profile = await this.profiles.findOne({ where: { user_id: input.targetUserId } })
    if (!profile) {
      throw new NotFoundException(`Utilisateur ${input.targetUserId} introuvable`)
    }

    const { protectedUserIds, frontendUrl } = readImpersonationConfig(this.config)
    if (protectedUserIds.includes(input.targetUserId)) {
      // Audit the refusal (best-effort) then reject — never mint a token.
      await this.audit.recordBestEffort({
        jti: '00000000-0000-0000-0000-000000000000',
        impersonatorActor: input.impersonatorActor,
        targetUserId: input.targetUserId,
        targetEmail: profile.email ?? null,
        reason: IMPERSONATION_REASON_LABELS[input.reasonCode],
        reasonCode: input.reasonCode,
        action: 'refused',
        ip: input.ip,
        correlationId: input.correlationId,
        expiresAt: null,
      })
      this.logger.warn(`Impersonation REFUSED: ${input.impersonatorActor} → protected user ${input.targetUserId}`)
      throw new ForbiddenException('Cet utilisateur est protégé contre l’incarnation.')
    }

    const minted = this.tokens.mint({
      targetUserId: input.targetUserId,
      targetEmail: profile.email ?? '',
      impersonatorActor: input.impersonatorActor,
    })

    // NON-NEGOTIABLE: commit the audit trail BEFORE the token is usable. If this
    // insert throws, the token is discarded (never returned) — no untraced session.
    await this.audit.record({
      jti: minted.jti,
      impersonatorActor: input.impersonatorActor,
      targetUserId: input.targetUserId,
      targetEmail: profile.email ?? null,
      reason: IMPERSONATION_REASON_LABELS[input.reasonCode],
      reasonCode: input.reasonCode,
      reasonDetail: input.reasonDetail?.trim() || null,
      action: 'start',
      ip: input.ip,
      correlationId: input.correlationId,
      expiresAt: new Date(minted.expiresAt * 1000),
    })

    this.logger.warn(
      `Impersonation STARTED: ${input.impersonatorActor} → ${input.targetUserId} (jti=${minted.jti}, expires ${new Date(
        minted.expiresAt * 1000,
      ).toISOString()})`,
    )

    // Token in the FRAGMENT — the SPA reads it client-side and immediately
    // consumes it; the fragment is never transmitted to any server.
    const redirectUrl = `${frontendUrl}/#imp_token=${encodeURIComponent(minted.token)}`
    return { redirectUrl, targetEmail: profile.email ?? null, expiresAt: minted.expiresAt }
  }

  async stop(input: StopImpersonationInput): Promise<void> {
    await this.audit.recordBestEffort({
      jti: input.jti,
      impersonatorActor: input.impersonatorActor,
      targetUserId: input.targetUserId,
      targetEmail: null,
      reason: 'stop',
      // L'arrêt n'a pas de motif : il n'y a rien à choisir dans un catalogue.
      reasonCode: null,
      action: 'stop',
      ip: input.ip,
      correlationId: input.correlationId,
      expiresAt: null,
    })
    this.logger.warn(`Impersonation STOPPED: ${input.impersonatorActor} → ${input.targetUserId} (jti=${input.jti})`)
  }

  /**
   * LUDOVIC-D LC.10 — « Terminer » une session EN COURS depuis la console /impersonations. Le journal
   * reste append-only : une ligne `stop` est AJOUTÉE (date de fin + `ended_by` = l'admin), rien n'est
   * modifié ni supprimé. Écriture DURE (pas best-effort) : l'admin doit savoir si c'est fait. Le jeton
   * est refusé dès la requête suivante (`ImpersonationStrategy` lit ce `stop`). Inconnue → `not_found` ;
   * déjà terminée ou expirée → `not_ongoing`, rien n'est écrit.
   */
  async terminate(input: TerminateImpersonationInput): Promise<TerminateImpersonationResult> {
    const rows = await this.audit.rowsForJti(input.jti)
    const start = rows.find(row => row.action === 'start')
    if (!start) return 'not_found'
    const expiresAt = start.expires_at ? new Date(start.expires_at) : null
    const ongoing = !rows.some(row => row.action === 'stop') && expiresAt !== null && expiresAt.getTime() > Date.now()
    if (!ongoing) return 'not_ongoing'
    await this.audit.record({
      jti: input.jti,
      impersonatorActor: start.impersonator_actor,
      targetUserId: start.target_user_id,
      targetEmail: null,
      reason: 'stop',
      reasonCode: null,
      action: 'stop',
      ip: input.ip,
      correlationId: input.correlationId,
      expiresAt: null,
      endedBy: input.adminActor,
    })
    this.logger.warn(`Impersonation TERMINATED by ${input.adminActor} (jti=${input.jti})`)
    return 'terminated'
  }
}
