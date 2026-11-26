/**
 * oauth-flow.e2e.spec.ts — end-to-end of the OAuth 2.1 Authorization Server
 * over HTTP: discovery metadata, dynamic client registration, the full
 * authorization_code + PKCE flow (authorize → consent → token), code replay
 * rejection, refresh rotation + reuse detection, and the unauthenticated
 * authorize → login redirect. OAuth tables are backed by in-memory repositories
 * so no Postgres is needed.
 */
import type { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { FindOperator } from 'typeorm'
import { OAuthAuthorizationCodeEntity } from '../../database/entities/oauth-authorization-code.entity'
import { OAuthClientEntity } from '../../database/entities/oauth-client.entity'
import { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import { OAuthRefreshTokenEntity } from '../../database/entities/oauth-refresh-token.entity'
import { OAuthModule } from './oauth.module'
import { resolveBrand } from '@bellum/contracts'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SessionRegistryModule } from '../auth/session-registry.module'
import { SessionRegistryService } from '../auth/session-registry.service'
import { Module } from '@nestjs/common'

const SIGNING_KEY = 'e2e-mcp-oauth-signing-key-32chars-long'
const API_URL = 'https://api.bellum.test'
const MCP_URL = 'https://mcp.bellum.test'
const REDIRECT = 'https://client.test/callback'

const testConfig = () => ({
  apiPublicUrl: API_URL,
  mcpPublicUrl: MCP_URL,
  mcpOauthSigningKey: SIGNING_KEY,
  internalApiSecret: 'e2e-internal-secret-16+chars',
  supabaseJwtSecret: 'test-jwt-secret-at-least-32-chars-long-bellum',
  frontendUrl: 'https://app.bellum.test',
  sessionCookiePrefix: 'session',
  nodeEnv: 'test',
})

// ── Minimal in-memory TypeORM repository ────────────────────────────────────
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v instanceof FindOperator) return row[k] == null // only IsNull() used here
    return row[k] === v
  })
}
function inMemoryRepo() {
  const rows: Record<string, unknown>[] = []
  const stamp = (r: Record<string, unknown>) => ({
    id: r['id'] ?? randomUUID(),
    created_at: new Date(),
    updated_at: new Date(),
    ...r,
  })
  return {
    rows,
    create: (x: Record<string, unknown>) => ({ ...x }),
    save: async (x: Record<string, unknown>) => {
      const existing = x['id'] ? rows.find(r => r['id'] === x['id']) : undefined
      if (existing) {
        Object.assign(existing, x)
        return existing
      }
      const row = stamp(x)
      rows.push(row)
      return row
    },
    insert: async (x: Record<string, unknown>) => {
      rows.push(stamp(x))
      return { identifiers: [] }
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find(r => matches(r, where)) ?? null,
    find: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      where ? rows.filter(r => matches(r, where)) : [...rows],
    update: async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      const hits = rows.filter(r => matches(r, where))
      hits.forEach(r => Object.assign(r, patch))
      return { affected: hits.length }
    },
    delete: async () => ({ affected: 0 }),
  }
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function extractConsentToken(html: string): string {
  const m = html.match(/name="consent_token" value="([^"]+)"/)
  if (!m) throw new Error('consent_token not found in consent page')
  return m[1]
}

function codeFromLocation(location: string): string {
  return new URL(location).searchParams.get('code') ?? ''
}

/**
 * `WorkspaceModule`, réduit à ce que la page de consentement lui demande.
 *
 * Elle n'a besoin que du NOM à afficher. Le reste du vrai module — le mailer,
 * le catalogue d'offres, une douzaine d'entités — n'a rien à faire dans un
 * test de serveur d'autorisation.
 */
@Module({
  providers: [{ provide: WorkspaceBrandService, useValue: { getForUser: async () => resolveBrand(null) } }],
  exports: [WorkspaceBrandService],
})
class FakeWorkspaceModule {}

/**
 * #2120.57 (GA-365) — `OAuthModule` importe desormais `SessionRegistryModule`,
 * parce qu'il enregistre sa PROPRE `JwtStrategy` et que celle-ci sautait le
 * controle de revocation tant que son `@Optional()` valait `undefined`.
 *
 * Meme arbitrage que `FakeWorkspaceModule` juste au-dessus : on remplace le
 * MODULE, pas seulement le fournisseur, pour ne pas tirer trois entites dans un
 * test qui verifie un serveur d'autorisation. Le faux repond `false` — aucune
 * session revoquee ici — si bien que le parcours teste reste celui d'avant.
 */
@Module({
  providers: [{ provide: SessionRegistryService, useValue: { isRevoked: async () => false } }],
  exports: [SessionRegistryService],
})
class FakeSessionRegistryModule {}

describe('OAuth 2.1 AS — end to end', () => {
  let app: INestApplication
  let sessionJwt: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [testConfig] }), OAuthModule],
    })
      .overrideProvider(getRepositoryToken(OAuthClientEntity))
      .useValue(inMemoryRepo())
      .overrideProvider(getRepositoryToken(OAuthAuthorizationCodeEntity))
      .useValue(inMemoryRepo())
      .overrideProvider(getRepositoryToken(OAuthRefreshTokenEntity))
      .useValue(inMemoryRepo())
      .overrideProvider(getRepositoryToken(OAuthConsentEntity))
      .useValue(inMemoryRepo())
      /*
       * La MARQUE de l'espace sur la page de consentement (marque blanche,
       * 01/09/2026).
       *
       * ⚠️ `overrideModule` et non `overrideProvider` : remplacer le seul
       * fournisseur ne suffit PAS, parce que Nest instancie quand même tout
       * le graphe du module importé — et `WorkspaceModule` tire le mailer et
       * ses entités dans un test qui vérifie un serveur d'autorisation OAuth.
       * Ce test casserait alors à chaque entité ajoutée ailleurs, sans jamais
       * rien prouver de plus sur OAuth.
       */
      .overrideModule(WorkspaceModule)
      .useModule(FakeWorkspaceModule)
      .overrideModule(SessionRegistryModule)
      .useModule(FakeSessionRegistryModule)
      .compile()

    app = moduleRef.createNestApplication()
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    await app.init()

    sessionJwt = new JwtService({}).sign(
      { email: 'rep@esn.fr' },
      {
        secret: testConfig().supabaseJwtSecret,
        algorithm: 'HS256',
        audience: 'authenticated',
        subject: 'user-1',
        expiresIn: '1h',
      },
    )
  })

  afterAll(async () => {
    await app.close()
  })

  const http = () => request(app.getHttpServer())

  it('serves RFC 8414 metadata with issuer == API_URL', async () => {
    const res = await http().get('/.well-known/oauth-authorization-server')
    expect(res.status).toBe(200)
    expect(res.body.issuer).toBe(API_URL)
    expect(res.body.code_challenge_methods_supported).toEqual(['S256'])
    expect(res.body.token_endpoint).toBe(`${API_URL}/oauth/token`)
  })

  it('registers a public client (DCR) with no secret', async () => {
    const res = await http()
      .post('/oauth/register')
      .send({ redirect_uris: [REDIRECT], client_name: 'Test Client' })
    expect(res.status).toBe(201)
    expect(res.body.client_id).toBeTruthy()
    expect(res.body.token_endpoint_auth_method).toBe('none')
    expect(res.body).not.toHaveProperty('client_secret')
  })

  it('runs the full authorization_code + PKCE flow and rejects code replay', async () => {
    const reg = await http()
      .post('/oauth/register')
      .send({ redirect_uris: [REDIRECT] })
    const clientId = reg.body.client_id
    const { verifier, challenge } = pkce()

    // 1) authorize (authenticated via Bearer session) → consent page
    const authRes = await http()
      .get('/oauth/authorize')
      .query({
        client_id: clientId,
        redirect_uri: REDIRECT,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'mcp:read mcp:analysis',
        state: 'xyz',
      })
      .set('Authorization', `Bearer ${sessionJwt}`)
    expect(authRes.status).toBe(200)
    const consentToken = extractConsentToken(authRes.text)

    // 2) approve consent → redirect back with a code
    const decisionRes = await http()
      .post('/oauth/authorize/decision')
      .set('Authorization', `Bearer ${sessionJwt}`)
      .type('form')
      .send({
        client_id: clientId,
        redirect_uri: REDIRECT,
        scope: 'mcp:read mcp:analysis',
        state: 'xyz',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: MCP_URL,
        consent_token: consentToken,
        decision: 'approve',
      })
    expect(decisionRes.status).toBe(302)
    const location = decisionRes.headers['location']
    expect(new URL(location).searchParams.get('state')).toBe('xyz')
    const code = codeFromLocation(location)
    expect(code).toBeTruthy()

    // 3) exchange the code (+ PKCE verifier) for tokens
    const tokenRes = await http().post('/oauth/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    })
    expect(tokenRes.status).toBe(200)
    expect(tokenRes.body.token_type).toBe('Bearer')
    expect(tokenRes.body.access_token).toBeTruthy()
    expect(tokenRes.body.refresh_token).toBeTruthy()

    // access token is bound to the MCP resource
    const decoded = new JwtService({}).verify<{ aud: string; sub: string }>(tokenRes.body.access_token, {
      secret: SIGNING_KEY,
      algorithms: ['HS256'],
      audience: MCP_URL,
      issuer: API_URL,
    })
    expect(decoded.sub).toBe('user-1')

    // 4) code replay → invalid_grant
    const replay = await http().post('/oauth/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    })
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('invalid_grant')

    // 5) refresh rotation → new tokens; reusing the old refresh → invalid_grant
    const refresh1 = tokenRes.body.refresh_token
    const rot = await http()
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: refresh1, client_id: clientId })
    expect(rot.status).toBe(200)
    expect(rot.body.refresh_token).toBeTruthy()
    expect(rot.body.refresh_token).not.toBe(refresh1)

    const reuse = await http()
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: refresh1, client_id: clientId })
    expect(reuse.status).toBe(400)
    expect(reuse.body.error).toBe('invalid_grant')
  })

  it('redirects an unauthenticated authorize to the web login with returnTo', async () => {
    const reg = await http()
      .post('/oauth/register')
      .send({ redirect_uris: [REDIRECT] })
    const { challenge } = pkce()
    const res = await http().get('/oauth/authorize').query({
      client_id: reg.body.client_id,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'mcp:read',
    })
    expect(res.status).toBe(302)
    const loc = res.headers['location']
    expect(loc).toContain('https://app.bellum.test/login?returnTo=')
    expect(decodeURIComponent(loc)).toContain('/oauth/authorize')
  })

  it('shows an on-domain error (no redirect) for an unknown redirect_uri', async () => {
    const reg = await http()
      .post('/oauth/register')
      .send({ redirect_uris: [REDIRECT] })
    const { challenge } = pkce()
    const res = await http()
      .get('/oauth/authorize')
      .query({
        client_id: reg.body.client_id,
        redirect_uri: 'https://attacker.test/steal',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })
      .set('Authorization', `Bearer ${sessionJwt}`)
    expect(res.status).toBe(400)
    expect(res.headers['location']).toBeUndefined()
  })
})
