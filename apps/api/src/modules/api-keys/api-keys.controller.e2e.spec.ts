/**
 * api-keys.controller.e2e.spec.ts — the MANAGEMENT surface invariants:
 *  - JWT + RBAC `integrations:manage` on create/list/revoke (a viewer is 403);
 *  - the workspace is resolved SERVER-SIDE from the caller's JWT;
 *  - the raw key appears in the creation response ONLY — never in list.
 */
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import type { WorkspaceRole } from '@bellum/contracts'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { JwtStrategy } from '../auth/jwt.strategy'
import { ImpersonationStrategy } from '../auth/impersonation.strategy'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysService, type CreatedApiKey } from './api-keys.service'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { PlanFeaturesService } from '../plan-features/plan-features.service'

const SUPA_SECRET = 'test-jwt-secret-at-least-32-chars-long-bellum'

const testConfig = () => ({
  supabaseJwtSecret: SUPA_SECRET,
  sessionCookiePrefix: 'session',
  nodeEnv: 'test',
})

function token(sub: string): string {
  return new JwtService({}).sign(
    { email: `${sub}@esn.fr` },
    { secret: SUPA_SECRET, algorithm: 'HS256', audience: 'authenticated', subject: sub, expiresIn: '1h' },
  )
}

describe('ApiKeysController (e2e)', () => {
  let app: INestApplication
  // user-manager → member (has integrations:manage), user-viewer → viewer.
  const roles: Record<string, WorkspaceRole> = { 'user-manager': 'member', 'user-viewer': 'viewer' }
  const serviceCalls: Array<{ method: string; args: unknown[] }> = []

  const fakeCreated: CreatedApiKey = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'CI key',
    prefix: 'blm_live_abcd',
    scopes: ['read:accounts'],
    last_used_at: null,
    revoked_at: null,
    created_at: new Date('2026-07-16T00:00:00Z'),
    key: 'blm_live_abcd-rest-of-the-secret-shown-once-only',
  }

  const fakeService = {
    create: async (...args: unknown[]) => {
      serviceCalls.push({ method: 'create', args })
      return fakeCreated
    },
    list: async (...args: unknown[]) => {
      serviceCalls.push({ method: 'list', args })
      const { key: _key, ...summary } = fakeCreated
      return [summary]
    },
    revoke: async (...args: unknown[]) => {
      serviceCalls.push({ method: 'revoke', args })
    },
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [testConfig] }), PassportModule],
      controllers: [ApiKeysController],
      providers: [
        JwtStrategy,
        // JwtGuard composes ['impersonation','jwt']; register the impersonation
        // strategy alongside JwtStrategy (AuthModule pairs them in the real app).
        ImpersonationStrategy,
        WorkspacePermissionGuard,
        // L'écran des clés est gaté sur la feature `public_api` (on n'émet pas
        // une clé que `/v1` refusera). Le palier est ouvert ici : ce fichier
        // teste l'auth et les rôles, le gating a son propre test.
        { provide: PlanFeaturesService, useValue: { userHas: async () => true, workspaceHas: async () => true } },
        PlanFeatureGuard,
        { provide: ApiKeysService, useValue: fakeService },
        {
          provide: WorkspaceContextService,
          useValue: {
            resolveActiveWorkspace: async (userId: string) => ({
              workspaceId: `ws-of-${userId}`,
              role: roles[userId] ?? 'viewer',
            }),
            // Aucune permission accordée en propre : ces cas testent le ROLE.
            // Le stub la déclare quand même — un guard qui interroge une
            // méthode absente échouerait ici pour une raison sans rapport avec
            // ce que le test vérifie.
            extraPermissionsOf: async () => [],
          },
        },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    // Same DTO validation as production (main.ts registers it globally).
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => serviceCalls.splice(0))

  const http = () => request(app.getHttpServer())

  it('unauthenticated → 401 on all three routes', async () => {
    expect((await http().post('/api-keys').send({ name: 'k' })).status).toBe(401)
    expect((await http().get('/api-keys')).status).toBe(401)
    expect((await http().delete('/api-keys/44444444-4444-4444-8444-444444444444')).status).toBe(401)
  })

  it('a viewer (no integrations:manage) → 403 on create/list/revoke', async () => {
    const auth = `Bearer ${token('user-viewer')}`
    expect((await http().post('/api-keys').set('Authorization', auth).send({ name: 'k' })).status).toBe(403)
    expect((await http().get('/api-keys').set('Authorization', auth)).status).toBe(403)
    expect(
      (await http().delete('/api-keys/44444444-4444-4444-8444-444444444444').set('Authorization', auth)).status,
    ).toBe(403)
    expect(serviceCalls).toHaveLength(0)
  })

  it('create: resolves the workspace from the JWT and returns the raw key ONCE', async () => {
    const res = await http()
      .post('/api-keys')
      .set('Authorization', `Bearer ${token('user-manager')}`)
      .send({ name: 'CI key', scopes: ['read:accounts'] })
    expect(res.status).toBe(201)
    expect(res.body.key).toBe(fakeCreated.key)
    expect(serviceCalls[0]).toEqual({
      method: 'create',
      args: [
        {
          workspaceId: 'ws-of-user-manager',
          createdBy: 'user-manager',
          name: 'CI key',
          scopes: ['read:accounts'],
        },
      ],
    })
  })

  it('create: rejects an unknown scope (400)', async () => {
    const res = await http()
      .post('/api-keys')
      .set('Authorization', `Bearer ${token('user-manager')}`)
      .send({ name: 'k', scopes: ['write:everything'] })
    expect(res.status).toBe(400)
    expect(serviceCalls).toHaveLength(0)
  })

  it('list: scoped to the caller workspace, and the raw key is NOT in the response', async () => {
    const res = await http()
      .get('/api-keys')
      .set('Authorization', `Bearer ${token('user-manager')}`)
    expect(res.status).toBe(200)
    expect(serviceCalls[0]).toEqual({ method: 'list', args: ['ws-of-user-manager'] })
    expect(res.body[0]).not.toHaveProperty('key')
    expect(res.body[0]).not.toHaveProperty('key_hash')
    expect(res.body[0].prefix).toBe('blm_live_abcd')
  })

  it('revoke: passes the caller workspace so cross-workspace revocation is impossible', async () => {
    const res = await http()
      .delete('/api-keys/44444444-4444-4444-8444-444444444444')
      .set('Authorization', `Bearer ${token('user-manager')}`)
    expect(res.status).toBe(204)
    expect(serviceCalls[0]).toEqual({
      method: 'revoke',
      args: ['ws-of-user-manager', '44444444-4444-4444-8444-444444444444'],
    })
  })
})
