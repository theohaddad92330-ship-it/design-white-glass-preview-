/**
 * impersonation.e2e.spec.ts
 *
 * End-to-end security tests for the admin "impersonate a user" feature, wiring
 * the REAL guard + passport strategies + controllers together (no full app graph
 * needed — repos are mocked). Covers the mandatory guardrails:
 *   (a) a non-admin (no / wrong internal secret) is refused
 *   (b) an impersonation token is blocked from a state-changing route but allowed
 *       on reads
 *   (c) an audit row is written on start AND on stop
 *   (d) an impersonation token cannot re-impersonate
 *   (e) stop returns to the admin (clears the impersonation cookie)
 */

import { Controller, Get, type INestApplication, Post, Req, UseGuards } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ZodValidationPipe } from 'nestjs-zod'
import type { Request } from 'express'
import request from 'supertest'
import { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { JwtStrategy } from '../auth/jwt.strategy'
import { ImpersonationStrategy } from '../auth/impersonation.strategy'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ImpersonationAdminController } from './impersonation-admin.controller'
import { ImpersonationController } from './impersonation.controller'
import { ImpersonationAuditService } from './impersonation-audit.service'
import { ImpersonationService } from './impersonation.service'
import { ImpersonationVisibilityService } from './impersonation-visibility.service'
import { ImpersonationTokenService } from './impersonation-token.service'

const INTERNAL_SECRET = 'test-internal-secret-at-least-32-chars-long-xyz'
const TARGET_USER_ID = '11111111-1111-1111-1111-111111111111'

const testEnvConfig = () => ({
  internalApiSecret: INTERNAL_SECRET,
  apiPublicUrl: 'https://api.test.bellum',
  frontendUrl: 'https://app.test.bellum',
  supabaseJwtSecret: 'test-jwt-secret-at-least-32-chars-long-bellum',
  nodeEnv: 'test',
  sessionCookiePrefix: 'session',
  cookieDomain: '',
})

// Minimal controllers behind the REAL JwtGuard to prove the impersonation policy
// end to end: a read + a SAFE write (a normal product mutation the operator must
// be able to make to reproduce a bug), and a DANGEROUS write mounted under a
// denylisted prefix (/credits = financial) that must stay blocked.
@Controller('imp-probe')
class ImpProbeController {
  @Get('read')
  @UseGuards(JwtGuard)
  read(@Req() req: Request) {
    return { ok: true, user: req.user }
  }

  @Post('write')
  @UseGuards(JwtGuard)
  write() {
    return { ok: true }
  }
}

@Controller('credits')
class DangerousProbeController {
  @Post('probe')
  @UseGuards(JwtGuard)
  buy() {
    return { ok: true }
  }
}

describe('Impersonation — end-to-end security', () => {
  let app: INestApplication
  let tokens: ImpersonationTokenService
  const auditInserts: Array<Record<string, unknown>> = []

  const profilesMock = {
    findOne: jest.fn(async ({ where }: { where: { user_id: string } }) =>
      where.user_id === TARGET_USER_ID ? ({ user_id: TARGET_USER_ID, email: 'jane@corp.fr' } as ProfileEntity) : null,
    ),
  }
  const auditRepoMock = {
    insert: jest.fn(async (row: Record<string, unknown>) => {
      auditInserts.push(row)
      return { identifiers: [{ id: 'audit-1' }] }
    }),
    // LUDOVIC-D LC.10 — la stratégie compte les `stop` d'un jti pour refuser une session terminée.
    count: jest.fn(
      async ({ where }: { where: { jti: string; action: string } }) =>
        auditInserts.filter(r => r.jti === where.jti && r.action === where.action).length,
    ),
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({}),
      ],
      controllers: [
        ImpersonationAdminController,
        ImpersonationController,
        ImpProbeController,
        DangerousProbeController,
      ],
      providers: [
        JwtStrategy,
        ImpersonationStrategy,
        JwtGuard,
        InternalSecretGuard,
        ImpersonationTokenService,
        ImpersonationAuditService,
        ImpersonationService,
        // #1670.2 — ce que le CLIENT a le droit de savoir quand on est chez lui.
        ImpersonationVisibilityService,
        { provide: getRepositoryToken(ProfileEntity), useValue: profilesMock },
        { provide: getRepositoryToken(ImpersonationAuditEntity), useValue: auditRepoMock },
      ],
    }).compile()

    app = module.createNestApplication()
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
    tokens = module.get(ImpersonationTokenService)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    auditInserts.length = 0
    jest.clearAllMocks()
  })

  const server = () => app.getHttpServer()

  // ── (a) non-admin refused ────────────────────────────────────────────────
  describe('(a) admin-only: start requires the internal secret', () => {
    it('refuses with no internal secret (403)', async () => {
      const res = await request(server())
        .post(`/internal/admin/users/${TARGET_USER_ID}/impersonate`)
        .send({ reason_code: 'support_demande', admin_actor: 'ops@bellum' })
      expect(res.status).toBe(403)
    })

    it('refuses with a wrong internal secret (403)', async () => {
      const res = await request(server())
        .post(`/internal/admin/users/${TARGET_USER_ID}/impersonate`)
        .set('x-internal-secret', 'not-the-secret')
        .send({ reason_code: 'support_demande', admin_actor: 'ops@bellum' })
      expect(res.status).toBe(403)
    })
  })

  // ── (c) audit written on start (+ token minted) ──────────────────────────
  describe('(c)+(b)+(e) full lifecycle with the internal secret', () => {
    it('start → writes a "start" audit row and returns a fragment redirect URL', async () => {
      const res = await request(server())
        .post(`/internal/admin/users/${TARGET_USER_ID}/impersonate`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .send({ reason_code: 'incident_constate', admin_actor: 'ops@bellum' })

      expect(res.status).toBe(201)
      expect(res.body.redirectUrl).toContain('https://app.test.bellum/#imp_token=')
      expect(res.body.targetEmail).toBe('jane@corp.fr')

      const startRow = auditInserts.find(r => r.action === 'start')
      expect(startRow).toBeDefined()
      expect(startRow?.target_user_id).toBe(TARGET_USER_ID)
      expect(startRow?.impersonator_actor).toBe('ops@bellum')
      // #1670 — le libellé est DÉRIVÉ du code de catalogue, il n'est plus saisi.
      expect(startRow?.reason_code).toBe('incident_constate')
      expect(startRow?.reason).toBe('Incident constaté')
    })

    // ── T1 de #1670 : « impersonation sans motif → refus » ─────────────────
    it('T1 — un motif HORS CATALOGUE est refusé, et aucune ligne n’est écrite', async () => {
      for (const corps of [
        {}, // aucun motif
        { reason_code: '' },
        { reason_code: 'parce que' }, // du texte libre : c'est ce qu'on retire
        { reason: 'reproduire ticket #1234' }, // l'ancien champ, qui n'existe plus
      ]) {
        const res = await request(server())
          .post(`/internal/admin/users/${TARGET_USER_ID}/impersonate`)
          .set('x-internal-secret', INTERNAL_SECRET)
          .send({ ...corps, admin_actor: 'ops@bellum' })

        expect(res.status).toBe(400)
      }

      // NON NÉGOCIABLE : un refus ne laisse aucune trace d'incarnation — ni
      // ligne d'audit, ni jeton. Ce que la porte arrête n'entre pas à moitié.
      expect(auditInserts).toHaveLength(0)
    })

    it('(b) impersonation token: reads + safe writes allowed, dangerous writes blocked', async () => {
      const { token } = tokens.mint({
        targetUserId: TARGET_USER_ID,
        targetEmail: 'jane@corp.fr',
        impersonatorActor: 'ops@bellum',
      })

      const read = await request(server()).get('/imp-probe/read').set('Authorization', `Bearer ${token}`)
      expect(read.status).toBe(200)
      expect(read.body.user.impersonation).toBe(true)
      expect(read.body.user.userId).toBe(TARGET_USER_ID)

      // A normal product mutation (the operator reproducing a bug) is ALLOWED.
      const safeWrite = await request(server()).post('/imp-probe/write').set('Authorization', `Bearer ${token}`)
      expect(safeWrite.status).toBe(201)

      // A financial mutation stays BLOCKED (denylist prefix /credits).
      const dangerousWrite = await request(server()).post('/credits/probe').set('Authorization', `Bearer ${token}`)
      expect(dangerousWrite.status).toBe(403)
    })

    it('(e) stop → 200, writes a "stop" audit row and clears the impersonation cookie', async () => {
      const { token, jti } = tokens.mint({
        targetUserId: TARGET_USER_ID,
        targetEmail: 'jane@corp.fr',
        impersonatorActor: 'ops@bellum',
      })

      const res = await request(server()).post('/auth/impersonate/stop').set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ stopped: true })

      const stopRow = auditInserts.find(r => r.action === 'stop')
      expect(stopRow).toBeDefined()
      expect(stopRow?.jti).toBe(jti)

      // The exit clears the impersonation cookie (single-purpose, non-refreshable).
      const setCookie = res.headers['set-cookie'] as unknown as string[]
      expect(setCookie.some(c => c.startsWith('imp_session=') && /Expires=|Max-Age=0/.test(c))).toBe(true)

      // LUDOVIC-D LC.10 — le jeton arrêté ne se rejoue plus avant son expiration.
      const replay = await request(server()).get('/imp-probe/read').set('Authorization', `Bearer ${token}`)
      expect(replay.status).toBe(401)
    })
  })

  // ── consume delivers the cookie without JwtGuard's write-block ────────────
  it('consume exchanges a Bearer token for the imp_session cookie (200 + Set-Cookie)', async () => {
    const { token } = tokens.mint({
      targetUserId: TARGET_USER_ID,
      targetEmail: 'jane@corp.fr',
      impersonatorActor: 'ops@bellum',
    })
    const res = await request(server()).post('/auth/impersonate/consume').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.impersonation.target_user_id).toBe(TARGET_USER_ID)
    const setCookie = res.headers['set-cookie'] as unknown as string[]
    expect(setCookie.some(c => c.startsWith('imp_session='))).toBe(true)
    expect(setCookie.some(c => c.startsWith('imp_state='))).toBe(true)
    // The banner-state cookie is JS-readable (no HttpOnly) and carries no token.
    const stateCookie = setCookie.find(c => c.startsWith('imp_state='))
    expect(stateCookie).toBeDefined()
    expect(stateCookie).not.toMatch(/HttpOnly/i)
    expect(stateCookie).not.toContain(token)
  })

  // ── (d) an impersonation token cannot re-impersonate ─────────────────────
  it('(d) an impersonation token cannot start a new impersonation', async () => {
    const { token } = tokens.mint({
      targetUserId: TARGET_USER_ID,
      targetEmail: 'jane@corp.fr',
      impersonatorActor: 'ops@bellum',
    })
    const res = await request(server())
      .post(`/internal/admin/users/${TARGET_USER_ID}/impersonate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason_code: 'verification_technique', admin_actor: 'attacker' })
    // The start endpoint is behind the internal-secret guard; the impersonation
    // token can never satisfy it → 403, and no audit "start" row is written.
    expect(res.status).toBe(403)
    expect(auditInserts.some(r => r.action === 'start')).toBe(false)
  })

  it('unauthenticated read on a JwtGuard route still 401s (no regression)', async () => {
    const res = await request(server()).get('/imp-probe/read')
    expect(res.status).toBe(401)
  })
})
