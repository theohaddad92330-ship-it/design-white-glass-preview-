/**
 * api-key.guard.e2e.spec.ts — the public-API auth invariants, over real HTTP:
 *  - a valid `blm_live_…` key authenticates on ApiKeyGuard routes (and the
 *    principal carries ITS OWN workspace, never another's);
 *  - unknown / revoked / malformed keys → 401 (same status, no oracle);
 *  - scope enforcement: missing scope → 403;
 *  - blast radius: an API key is REJECTED on a JwtGuard route, and a Supabase
 *    session is REJECTED on the ApiKeyGuard surface;
 *  - dedicated per-key rate limit: 429 past the budget, counted PER KEY;
 *  - `last_used_at` is stamped on use.
 */
import { Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { Throttle, ThrottlerModule } from '@nestjs/throttler'
import request from 'supertest'
import type { FindOperator, Repository } from 'typeorm'
import { ApiKeyEntity } from '../../database/entities/api-key.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { JwtStrategy } from '../auth/jwt.strategy'
import { ImpersonationStrategy } from '../auth/impersonation.strategy'
import { ApiKeysService, type ApiKeyPrincipal } from '../api-keys/api-keys.service'
import { ApiKeyScopeGuard, RequireApiScope } from './api-key-scope.guard'
import { ApiKeyThrottlerGuard } from './api-key-throttler.guard'
import { ApiKeyGuard, CurrentApiKey } from './api-key.guard'

const SUPA_SECRET = 'test-jwt-secret-at-least-32-chars-long-bellum'

const testConfig = () => ({
  supabaseJwtSecret: SUPA_SECRET,
  sessionCookiePrefix: 'session',
  nodeEnv: 'test',
})

/** Minimal in-memory `api_keys` repository (same semantics as the service spec). */
function makeFakeRepo(): { repo: Repository<ApiKeyEntity>; rows: ApiKeyEntity[] } {
  const rows: ApiKeyEntity[] = []
  let seq = 0
  const matches = (row: ApiKeyEntity, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([field, expected]) => {
      const actual = row[field as keyof ApiKeyEntity]
      if (typeof expected === 'object' && expected !== null && '_type' in (expected as FindOperator<unknown>)) {
        return actual === null
      }
      return actual === expected
    })
  const repo = {
    create: (input: Partial<ApiKeyEntity>) => input as ApiKeyEntity,
    save: async (input: Partial<ApiKeyEntity>) => {
      const row = {
        id: `key-${++seq}`,
        last_used_at: null,
        revoked_at: null,
        created_at: new Date(),
        ...input,
      } as ApiKeyEntity
      rows.push(row)
      return row
    },
    find: async ({ where }: { where: Record<string, unknown> }) => rows.filter(r => matches(r, where)),
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find(r => matches(r, where)) ?? null,
    update: async (criteria: Record<string, unknown>, patch: Partial<ApiKeyEntity>) => {
      for (const row of rows.filter(r => matches(r, criteria))) Object.assign(row, patch)
      return { affected: 1 }
    },
  } as unknown as Repository<ApiKeyEntity>
  return { repo, rows }
}

@Controller('probe')
class ProbeController {
  // The public read surface (mirrors V1Controller's guard stack).
  @Get('accounts')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireApiScope('read:accounts')
  accounts(@CurrentApiKey() key: ApiKeyPrincipal) {
    return { workspaceId: key.workspaceId }
  }

  @Get('contacts')
  @UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
  @RequireApiScope('read:contacts')
  contacts(@CurrentApiKey() key: ApiKeyPrincipal) {
    return { workspaceId: key.workspaceId }
  }

  // Tiny per-key budget so the 429 path is testable.
  @Get('limited')
  @UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
  @Throttle({ 'default-1m': { limit: 2, ttl: 60_000 } })
  limited(@CurrentApiKey() key: ApiKeyPrincipal) {
    return { workspaceId: key.workspaceId }
  }

  // Sensitive stand-in (billing / deletion / admin / key management): JwtGuard only.
  @Post('sensitive')
  @UseGuards(JwtGuard)
  sensitive() {
    return { ok: true }
  }
}

function supabaseToken(): string {
  return new JwtService({}).sign(
    { email: 'rep@esn.fr' },
    { secret: SUPA_SECRET, algorithm: 'HS256', audience: 'authenticated', subject: 'user-1', expiresIn: '1h' },
  )
}

describe('ApiKeyGuard (e2e)', () => {
  let app: INestApplication
  let service: ApiKeysService
  let rows: ApiKeyEntity[]
  let keyA: string // ws-A, both read scopes
  let keyARow: ApiKeyEntity
  let keyB: string // ws-B, read:accounts only
  let revokedKey: string

  beforeAll(async () => {
    const fake = makeFakeRepo()
    rows = fake.rows
    service = new ApiKeysService(fake.repo)

    const created = await service.create({
      workspaceId: 'ws-A',
      createdBy: 'user-a',
      name: 'full',
      scopes: ['read:accounts', 'read:contacts'],
    })
    keyA = created.key
    keyARow = rows.find(r => r.id === created.id) as ApiKeyEntity

    keyB = (
      await service.create({
        workspaceId: 'ws-B',
        createdBy: 'user-b',
        name: 'accounts-only',
        scopes: ['read:accounts'],
      })
    ).key

    const toRevoke = await service.create({
      workspaceId: 'ws-A',
      createdBy: 'user-a',
      name: 'old',
      scopes: ['read:accounts'],
    })
    revokedKey = toRevoke.key
    await service.revoke('ws-A', toRevoke.id)

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [testConfig] }),
        PassportModule,
        // In-memory throttler storage — no Redis needed for the 429 path.
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default-1m', ttl: 60_000, limit: 60 }] }),
      ],
      controllers: [ProbeController],
      providers: [
        { provide: ApiKeysService, useValue: service },
        ApiKeyGuard,
        ApiKeyScopeGuard,
        ApiKeyThrottlerGuard,
        JwtStrategy,
        // JwtGuard composes ['impersonation','jwt'] → the impersonation strategy
        // must be registered alongside JwtStrategy (AuthModule pairs them in prod).
        ImpersonationStrategy,
        JwtGuard,
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })
  afterAll(async () => app.close())

  const http = () => request(app.getHttpServer())

  it('a valid key authenticates and acts as ITS workspace', async () => {
    const res = await http().get('/probe/accounts').set('Authorization', `Bearer ${keyA}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ workspaceId: 'ws-A' })
  })

  it('two keys resolve to their OWN workspaces — never each other’s', async () => {
    const a = await http().get('/probe/accounts').set('Authorization', `Bearer ${keyA}`)
    const b = await http().get('/probe/accounts').set('Authorization', `Bearer ${keyB}`)
    expect(a.body.workspaceId).toBe('ws-A')
    expect(b.body.workspaceId).toBe('ws-B')
  })

  it('missing Authorization header → 401', async () => {
    expect((await http().get('/probe/accounts')).status).toBe(401)
  })

  it('an unknown key → 401', async () => {
    const res = await http()
      .get('/probe/accounts')
      .set('Authorization', 'Bearer blm_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(res.status).toBe(401)
  })

  it('a REVOKED key → 401 (revocation is immediate)', async () => {
    const res = await http().get('/probe/accounts').set('Authorization', `Bearer ${revokedKey}`)
    expect(res.status).toBe(401)
  })

  it('a bearer without the blm_live_ prefix (e.g. a Supabase JWT) → 401', async () => {
    const res = await http().get('/probe/accounts').set('Authorization', `Bearer ${supabaseToken()}`)
    expect(res.status).toBe(401)
  })

  it('a key without the required scope → 403', async () => {
    const res = await http().get('/probe/contacts').set('Authorization', `Bearer ${keyB}`)
    expect(res.status).toBe(403)
  })

  it('a key WITH the scope passes', async () => {
    const res = await http().get('/probe/contacts').set('Authorization', `Bearer ${keyA}`)
    expect(res.status).toBe(200)
  })

  it('BLAST RADIUS: an API key is rejected on a JwtGuard route (401)', async () => {
    const res = await http().post('/probe/sensitive').set('Authorization', `Bearer ${keyA}`)
    expect(res.status).toBe(401)
  })

  it('sanity: a Supabase session still works on the JwtGuard route', async () => {
    const res = await http().post('/probe/sensitive').set('Authorization', `Bearer ${supabaseToken()}`)
    expect(res.status).toBe(201)
  })

  it('stamps last_used_at on use (best-effort)', async () => {
    await http().get('/probe/accounts').set('Authorization', `Bearer ${keyA}`)
    // The stamp is fire-and-forget — flush the microtask queue.
    await new Promise(resolve => setImmediate(resolve))
    expect(keyARow.last_used_at).toBeInstanceOf(Date)
  })

  it('rate limit is PER KEY: key B exhausts its budget, key A is unaffected', async () => {
    // Budget on /probe/limited is 2/min per key.
    expect((await http().get('/probe/limited').set('Authorization', `Bearer ${keyB}`)).status).toBe(200)
    expect((await http().get('/probe/limited').set('Authorization', `Bearer ${keyB}`)).status).toBe(200)
    expect((await http().get('/probe/limited').set('Authorization', `Bearer ${keyB}`)).status).toBe(429)
    // Same instant, same route — a different key still has its own budget.
    expect((await http().get('/probe/limited').set('Authorization', `Bearer ${keyA}`)).status).toBe(200)
  })
})
