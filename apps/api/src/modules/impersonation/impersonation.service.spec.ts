import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ImpersonationAuditService } from './impersonation-audit.service'
import { ImpersonationService } from './impersonation.service'
import { ImpersonationTokenService } from './impersonation-token.service'

function makeConfig(): ConfigService {
  const values: Record<string, unknown> = {
    internalApiSecret: 'test-internal-secret-at-least-32-chars-long-xyz',
    apiPublicUrl: 'https://api.test.bellum',
    frontendUrl: 'https://app.test.bellum',
  }
  return { get: (key: string, def?: unknown) => values[key] ?? def } as unknown as ConfigService
}

describe('ImpersonationService', () => {
  const config = makeConfig()
  const tokens = new ImpersonationTokenService(new JwtService({}), config)

  const profileOf = (userId: string): ProfileEntity =>
    ({ user_id: userId, email: `${userId}@corp.fr` }) as ProfileEntity

  function build(profile: ProfileEntity | null) {
    const profiles = { findOne: jest.fn().mockResolvedValue(profile) } as unknown as Repository<ProfileEntity>
    const auditRows: Array<{ action: string; jti: string; targetUserId: string }> = []
    const audit = {
      record: jest.fn(async (row: { action: string; jti: string; targetUserId: string }) => {
        auditRows.push(row)
      }),
      recordBestEffort: jest.fn(async (row: { action: string; jti: string; targetUserId: string }) => {
        auditRows.push(row)
      }),
    } as unknown as ImpersonationAuditService
    const service = new ImpersonationService(profiles, tokens, audit, config)
    return { service, audit, auditRows, profiles }
  }

  afterEach(() => {
    delete process.env['IMPERSONATION_PROTECTED_USER_IDS']
  })

  it('start() writes a "start" audit row and returns a redirect URL with the token in the fragment', async () => {
    const { service, audit, auditRows } = build(profileOf('target-1'))
    const result = await service.start({
      targetUserId: 'target-1',
      reasonCode: 'support_demande' as const,
      impersonatorActor: 'ops@bellum',
      ip: '10.0.0.1',
      correlationId: 'cid-1',
    })

    // Audit row committed on start (guardrail: full audit trail).
    expect(audit.record).toHaveBeenCalledTimes(1)
    const startRow = auditRows.find(r => r.action === 'start')
    expect(startRow).toBeDefined()
    expect(startRow?.targetUserId).toBe('target-1')

    // Redirect carries the token in the URL fragment (never a query/log).
    expect(result.redirectUrl).toContain('https://app.test.bellum/#imp_token=')
    expect(result.redirectUrl).not.toContain('?imp_token=')
    expect(result.targetEmail).toBe('target-1@corp.fr')
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('start() throws NotFound for an unknown target and mints no token', async () => {
    const { service, audit } = build(null)
    await expect(
      service.start({
        targetUserId: 'ghost',
        reasonCode: 'support_demande' as const,
        impersonatorActor: 'ops',
        ip: null,
        correlationId: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('start() REFUSES a protected user, audits the refusal, and mints no token', async () => {
    process.env['IMPERSONATION_PROTECTED_USER_IDS'] = 'protected-admin, other-op'
    const { service, audit, auditRows } = build(profileOf('protected-admin'))

    await expect(
      service.start({
        targetUserId: 'protected-admin',
        reasonCode: 'incident_constate' as const,
        impersonatorActor: 'ops',
        ip: null,
        correlationId: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)

    // No "start" row / no token; a "refused" row is recorded.
    expect(audit.record).not.toHaveBeenCalled()
    expect(auditRows.some(r => r.action === 'refused')).toBe(true)
  })

  it('stop() records a "stop" audit row correlated by jti', async () => {
    const { service, audit, auditRows } = build(profileOf('target-1'))
    await service.stop({
      jti: 'jti-123',
      targetUserId: 'target-1',
      impersonatorActor: 'ops@bellum',
      ip: '10.0.0.1',
      correlationId: 'cid-2',
    })
    expect(audit.recordBestEffort).toHaveBeenCalledTimes(1)
    const stopRow = auditRows.find(r => r.action === 'stop')
    expect(stopRow).toBeDefined()
    expect(stopRow?.jti).toBe('jti-123')
  })
})
