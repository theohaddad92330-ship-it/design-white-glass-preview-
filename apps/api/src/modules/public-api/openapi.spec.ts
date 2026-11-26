/**
 * openapi.spec.ts — the `/v1` OpenAPI document builds without crashing (zod
 * DTO → Swagger conversion) and describes EXACTLY the public read surface:
 * five GET endpoints, bearer security, and not a single internal column name
 * anywhere in the spec.
 */
import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'
import { Test } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import { AccountsService } from '../accounts/accounts.service'
import { ApiKeysService } from '../api-keys/api-keys.service'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { PlanFeaturesService } from '../plan-features/plan-features.service'
import { ApiKeyScopeGuard } from './api-key-scope.guard'
import { ApiKeyThrottlerGuard } from './api-key-throttler.guard'
import { ApiKeyGuard } from './api-key.guard'
import { PublicApiService } from './public-api.service'
import { V1Controller } from './v1.controller'

describe('OpenAPI document (/v1)', () => {
  let app: INestApplication
  let doc: OpenAPIObject

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default-1m', ttl: 60_000, limit: 60 }] })],
      controllers: [V1Controller],
      providers: [
        { provide: ApiKeysService, useValue: {} },
        { provide: AccountsService, useValue: {} },
        { provide: PublicApiService, useValue: {} },
        ApiKeyGuard,
        ApiKeyScopeGuard,
        ApiKeyThrottlerGuard,
        // `/v1` est gaté sur la feature `public_api` : le guard vit dans la
        // chaîne du contrôleur, il doit donc pouvoir se construire ici.
        { provide: PlanFeaturesService, useValue: { workspaceHas: async () => true, userHas: async () => true } },
        PlanFeatureGuard,
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    // Same builder shape as main.ts.
    doc = cleanupOpenApiDoc(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle('Bellum Public API')
          .setVersion('1.0.0')
          .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'api-key')
          .build(),
      ),
    )
  })
  afterAll(async () => app.close())

  it('documents exactly the five read endpoints, all GET-only', () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/v1/accounts',
      '/v1/accounts/{id}',
      '/v1/accounts/{id}/contacts',
      '/v1/contacts',
      '/v1/runs',
    ])
    for (const operations of Object.values(doc.paths)) {
      expect(Object.keys(operations)).toEqual(['get'])
    }
  })

  it('every operation requires the api-key bearer', () => {
    for (const operations of Object.values(doc.paths)) {
      expect(operations.get?.security).toEqual([{ 'api-key': [] }])
    }
  })

  it('the spec never mentions an internal column', () => {
    const spec = JSON.stringify(doc)
    for (const forbidden of [
      'raw_analysis',
      'api_cost_euros',
      'cost_eur',
      'prompt_versions',
      'key_hash',
      'raw_data',
      'user_context',
      'email_message',
      'career_levers',
      'implicit_fears',
    ]) {
      expect(spec).not.toContain(forbidden)
    }
  })

  it('response schemas carry the business fields', () => {
    const spec = JSON.stringify(doc)
    for (const expected of ['company_name', 'priority_score', 'recent_signals', 'decision_role', 'scope_mode']) {
      expect(spec).toContain(expected)
    }
  })
})
