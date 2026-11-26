/**
 * api-auth.guard.e2e.spec.ts — the blast-radius invariant: an MCP OAuth access
 * token authenticates ONLY on routes guarded by ApiAuthGuard, and is rejected
 * everywhere a plain JwtGuard is used (billing, deletion, admin, …). A Supabase
 * browser session keeps working on both. Scope enforcement is also checked.
 */
import { Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtGuard } from '../auth/jwt.guard'
import { JwtStrategy } from '../auth/jwt.strategy'
import { ImpersonationStrategy } from '../auth/impersonation.strategy'
import { ApiAuthGuard } from './api-auth.guard'
import { McpOAuthStrategy } from './mcp-oauth.strategy'
import { McpScopeGuard, RequireMcpScope } from './mcp-scope.guard'

const SIGNING_KEY = 'guard-e2e-mcp-signing-key-32-chars-long'
const API_URL = 'https://api.bellum.test'
const MCP_URL = 'https://mcp.bellum.test'
const SUPA_SECRET = 'test-jwt-secret-at-least-32-chars-long-bellum'

const testConfig = () => ({
  apiPublicUrl: API_URL,
  mcpPublicUrl: MCP_URL,
  mcpOauthSigningKey: SIGNING_KEY,
  supabaseJwtSecret: SUPA_SECRET,
  sessionCookiePrefix: 'session',
  nodeEnv: 'test',
})

@Controller('probe')
class ProbeController {
  // Reachable by an MCP token OR a browser session.
  @Get('mcp')
  @UseGuards(ApiAuthGuard, McpScopeGuard)
  mcp() {
    return { ok: true }
  }

  // Sensitive route — JwtGuard only (a stand-in for /credits/checkout etc.).
  @Post('sensitive')
  @UseGuards(JwtGuard)
  sensitive() {
    return { ok: true }
  }

  // Requires the analysis scope.
  @Post('spendy')
  @UseGuards(ApiAuthGuard, McpScopeGuard)
  @RequireMcpScope('mcp:analysis')
  spendy() {
    return { ok: true }
  }

  // Requires the ACTION scope (send_email / log_to_crm).
  @Post('act')
  @UseGuards(ApiAuthGuard, McpScopeGuard)
  @RequireMcpScope('mcp:act')
  act() {
    return { ok: true }
  }
}

function mcpToken(scope: string): string {
  return new JwtService({}).sign(
    { scope, client_id: 'c1' },
    {
      secret: SIGNING_KEY,
      algorithm: 'HS256',
      issuer: API_URL,
      audience: MCP_URL,
      subject: 'user-1',
      expiresIn: '15m',
    },
  )
}
function supabaseToken(): string {
  return new JwtService({}).sign(
    { email: 'rep@esn.fr' },
    { secret: SUPA_SECRET, algorithm: 'HS256', audience: 'authenticated', subject: 'user-1', expiresIn: '1h' },
  )
}

describe('ApiAuthGuard blast radius', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [testConfig] }), PassportModule],
      controllers: [ProbeController],
      // ImpersonationStrategy pairs with JwtStrategy: JwtGuard composes
      // ['impersonation','jwt'], so the impersonation strategy must be registered
      // wherever JwtGuard is used (AuthModule provides both in the real app).
      providers: [JwtStrategy, ImpersonationStrategy, McpOAuthStrategy, ApiAuthGuard, McpScopeGuard, JwtGuard],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })
  afterAll(async () => app.close())

  const http = () => request(app.getHttpServer())

  it('MCP token is accepted on the MCP route', async () => {
    const res = await http()
      .get('/probe/mcp')
      .set('Authorization', `Bearer ${mcpToken('mcp:read')}`)
    expect(res.status).toBe(200)
  })

  it('MCP token is REJECTED on a JwtGuard-only sensitive route (401)', async () => {
    const res = await http()
      .post('/probe/sensitive')
      .set('Authorization', `Bearer ${mcpToken('mcp:read mcp:analysis')}`)
    expect(res.status).toBe(401)
  })

  it('a Supabase session works on the MCP route too', async () => {
    const res = await http().get('/probe/mcp').set('Authorization', `Bearer ${supabaseToken()}`)
    expect(res.status).toBe(200)
  })

  it('a Supabase session works on the sensitive route', async () => {
    const res = await http().post('/probe/sensitive').set('Authorization', `Bearer ${supabaseToken()}`)
    expect(res.status).toBe(201) // NestJS POST defaults to 201
  })

  it('no token → 401 on both', async () => {
    expect((await http().get('/probe/mcp')).status).toBe(401)
    expect((await http().post('/probe/sensitive')).status).toBe(401)
  })

  it('MCP token without mcp:analysis is forbidden on a scoped route (403)', async () => {
    const res = await http()
      .post('/probe/spendy')
      .set('Authorization', `Bearer ${mcpToken('mcp:read')}`)
    expect(res.status).toBe(403)
  })

  it('MCP token WITH mcp:analysis passes the scoped route', async () => {
    const res = await http()
      .post('/probe/spendy')
      .set('Authorization', `Bearer ${mcpToken('mcp:read mcp:analysis')}`)
    expect(res.status).toBe(201)
  })

  it('a browser session (no scope) passes the scoped route', async () => {
    const res = await http().post('/probe/spendy').set('Authorization', `Bearer ${supabaseToken()}`)
    expect(res.status).toBe(201)
  })

  it('an mcp:read / mcp:analysis token is forbidden on an mcp:act route (403)', async () => {
    const res = await http()
      .post('/probe/act')
      .set('Authorization', `Bearer ${mcpToken('mcp:read mcp:analysis')}`)
    expect(res.status).toBe(403)
  })

  it('an MCP token WITH mcp:act passes the action route', async () => {
    const res = await http()
      .post('/probe/act')
      .set('Authorization', `Bearer ${mcpToken('mcp:read mcp:act')}`)
    expect(res.status).toBe(201)
  })

  it('a browser session (no scope) passes the action route', async () => {
    const res = await http().post('/probe/act').set('Authorization', `Bearer ${supabaseToken()}`)
    expect(res.status).toBe(201)
  })

  it('rejects an MCP token signed with the wrong key', async () => {
    const forged = new JwtService({}).sign(
      { scope: 'mcp:read', client_id: 'c1' },
      {
        secret: 'wrong-key-wrong-key-wrong-key-1234',
        algorithm: 'HS256',
        issuer: API_URL,
        audience: MCP_URL,
        subject: 'u',
        expiresIn: '15m',
      },
    )
    const res = await http().get('/probe/mcp').set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
  })
})
