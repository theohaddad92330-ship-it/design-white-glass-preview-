import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Repository } from 'typeorm'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { ImpersonationAuditService } from './impersonation-audit.service'
import { joinImpersonationSessions, type ImpersonationAuditRow } from './impersonation-sessions'
import { ImpersonationService } from './impersonation.service'
import { ImpersonationTokenService } from './impersonation-token.service'

// LUDOVIC-D LC.10 — /impersonations : une session « En cours » se TERMINE depuis la console ;
// l'audit est conservé (une ligne `stop` AJOUTÉE : date de fin + qui a terminé).
const config = {
  get: (key: string, def?: unknown) =>
    ({ internalApiSecret: 'test-internal-secret-at-least-32-chars-long-xyz', frontendUrl: 'https://app.test' })[key] ??
    def,
} as unknown as ConfigService

const start = (patch: Partial<ImpersonationAuditRow> = {}): ImpersonationAuditRow => ({
  jti: 'jti-1',
  impersonator_actor: 'ops@bellum',
  target_user_id: 'user-1',
  target_email: 'ludovic@stelya.fr',
  reason: 'Recette',
  reason_code: 'recette',
  reason_detail: 'recette du lot LUDOVIC-D',
  action: 'start',
  ip: null,
  correlation_id: null,
  expires_at: new Date(Date.now() + 3_600_000),
  created_at: new Date(Date.now() - 600_000),
  ended_by: null,
  ...patch,
})

function build(rows: ImpersonationAuditRow[]) {
  const recorded: Array<Record<string, unknown>> = []
  const audit = {
    rowsForJti: jest.fn(async (jti: string) => rows.filter(row => row.jti === jti)),
    record: jest.fn(async (row: Record<string, unknown>) => {
      recorded.push(row)
    }),
  } as unknown as ImpersonationAuditService
  const service = new ImpersonationService(
    {} as Repository<ProfileEntity>,
    new ImpersonationTokenService(new JwtService({}), config),
    audit,
    config,
  )
  return { service, recorded }
}

describe('LC.10 — terminer une incarnation en cours', () => {
  it('ajoute une ligne `stop` qui dit qui a terminé, sans toucher la ligne `start`', async () => {
    const { service, recorded } = build([start()])
    const result = await service.terminate({ jti: 'jti-1', adminActor: 'louis@bellum', ip: null, correlationId: null })
    expect(result).toBe('terminated')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      jti: 'jti-1',
      action: 'stop',
      impersonatorActor: 'ops@bellum',
      endedBy: 'louis@bellum',
    })
  })

  it('SAIT DIRE NON : inconnue, déjà terminée ou expirée — rien n’est écrit', async () => {
    expect(await build([]).service.terminate({ jti: 'x', adminActor: 'a', ip: null, correlationId: null })).toBe(
      'not_found',
    )
    const ended = build([start(), start({ action: 'stop', created_at: new Date() })])
    expect(await ended.service.terminate({ jti: 'jti-1', adminActor: 'a', ip: null, correlationId: null })).toBe(
      'not_ongoing',
    )
    expect(ended.recorded).toHaveLength(0)
    const expired = build([start({ expires_at: new Date(Date.now() - 1000) })])
    expect(await expired.service.terminate({ jti: 'jti-1', adminActor: 'a', ip: null, correlationId: null })).toBe(
      'not_ongoing',
    )
  })

  it('la session dit sa date de fin, qui l’a terminée, et la précision du motif', () => {
    const endedAt = new Date()
    const [session] = joinImpersonationSessions(
      [start(), start({ action: 'stop', created_at: endedAt, ended_by: 'louis@bellum', reason_detail: null })],
      new Date(),
    )
    expect(session).toMatchObject({
      status: 'ended',
      endedAt: endedAt.toISOString(),
      endedBy: 'louis@bellum',
      reasonCode: 'recette',
      reasonDetail: 'recette du lot LUDOVIC-D',
    })
    // Un arrêt par l'opérateur lui-même : c'est lui qui a terminé.
    const [self] = joinImpersonationSessions([start(), start({ action: 'stop', created_at: endedAt })], new Date())
    expect(self?.endedBy).toBe('ops@bellum')
  })
})
