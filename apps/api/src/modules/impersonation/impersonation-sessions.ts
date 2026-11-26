import type { ImpersonationReasonCode } from '@bellum/contracts'
import type { ImpersonationAction } from '../../database/entities/impersonation-audit.entity'

/**
 * #1665.2 — « aucun GET n'expose les sessions d'impersonation… un GET qui
 * joint start/stop PAR jti pour dériver Qui · Espace · Début · Durée · Motif ».
 *
 * PUR, comme `calculerEtatSecurite` : le service (`impersonation-audit.
 * service.ts`) FETCH les lignes récentes, cette fonction les JOINT et dérive
 * le statut — testable sans base.
 */
export type ImpersonationAuditRow = {
  jti: string
  impersonator_actor: string
  target_user_id: string
  target_email: string | null
  reason: string
  reason_code: ImpersonationReasonCode | null
  /** LUDOVIC-D LC.10 — la précision libre du motif (lignes `start`), absente des lignes antérieures. */
  reason_detail?: string | null
  action: ImpersonationAction
  ip: string | null
  correlation_id: string | null
  expires_at: Date | string | null
  created_at: Date | string
  /** LUDOVIC-D LC.10 — sur un `stop` : l'admin qui a terminé ; `null` = l'opérateur lui-même. */
  ended_by?: string | null
}

type ImpersonationSessionStatus = 'ongoing' | 'ended' | 'expired_sans_arret'

export type ImpersonationSession = {
  jti: string
  actor: string
  targetUserId: string
  targetEmail: string | null
  reason: string
  reasonCode: ImpersonationReasonCode | null
  /** LUDOVIC-D LC.10 — la précision libre du motif, `null` si aucune. */
  reasonDetail: string | null
  startedAt: string
  /** `null` tant que la session n'est pas terminée. */
  endedAt: string | null
  /** LUDOVIC-D LC.10 — qui a terminé (l'admin, ou l'opérateur lui-même) ; `null` sans `stop`. */
  endedBy: string | null
  status: ImpersonationSessionStatus
  /** `null` pour une session encore `ongoing` — sa durée finale n'est pas connue. */
  durationSeconds: number | null
  ip: string | null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null
  return value instanceof Date ? value : new Date(value)
}

/**
 * Joint les lignes `start` à leur `stop` par `jti` et dérive le statut.
 *
 * ⚠️ TROIS STATUTS, PAS DEUX. `ended` (un `stop` explicite existe) et
 * `expired_sans_arret` (le jeton a expiré sans qu'un `stop` n'ait jamais été
 * journalisé — l'onglet fermé, le navigateur planté) racontent des histoires
 * différentes : le second dit qu'une session est restée ouverte jusqu'à
 * expiration sans que l'opérateur ne clique sur « quitter l'incarnation ». Les
 * confondre sous « ended » perdrait ce signal.
 */
export function joinImpersonationSessions(rows: readonly ImpersonationAuditRow[], now: Date): ImpersonationSession[] {
  const starts = rows.filter(r => r.action === 'start')
  const stopsByJti = new Map<string, ImpersonationAuditRow>()
  for (const row of rows) {
    if (row.action === 'stop') stopsByJti.set(row.jti, row)
  }

  return starts.map((start): ImpersonationSession => {
    const stop = stopsByJti.get(start.jti)
    const startedAt = toDate(start.created_at) ?? now
    const expiresAt = toDate(start.expires_at)

    if (stop) {
      const endedAt = toDate(stop.created_at) ?? now
      return {
        jti: start.jti,
        actor: start.impersonator_actor,
        targetUserId: start.target_user_id,
        targetEmail: start.target_email,
        reason: start.reason,
        reasonCode: start.reason_code,
        reasonDetail: start.reason_detail ?? null,
        startedAt: toIso(start.created_at),
        endedAt: toIso(stop.created_at),
        endedBy: stop.ended_by ?? stop.impersonator_actor,
        status: 'ended',
        durationSeconds: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
        ip: start.ip,
      }
    }

    const stillValid = expiresAt !== null && expiresAt.getTime() > now.getTime()
    return {
      jti: start.jti,
      actor: start.impersonator_actor,
      targetUserId: start.target_user_id,
      targetEmail: start.target_email,
      reason: start.reason,
      reasonCode: start.reason_code,
      reasonDetail: start.reason_detail ?? null,
      startedAt: toIso(start.created_at),
      endedAt: null,
      endedBy: null,
      status: stillValid ? 'ongoing' : 'expired_sans_arret',
      durationSeconds: null,
      ip: start.ip,
    }
  })
}
