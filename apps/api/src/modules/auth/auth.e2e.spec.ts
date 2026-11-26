/**
 * auth.e2e.spec.ts
 * End-to-end tests verifying that every protected controller returns 401
 * when no JWT token is supplied in the Authorization header.
 *
 * Each module is spun up in isolation using NestJS Test utilities so that no
 * real database or Redis connection is required. TypeORM repositories are
 * replaced with mocks via `getRepositoryToken(XEntity)`, and the data-source
 * token (which only `TypeOrmModule.forRoot` registers) is supplied through a
 * `@Global` stub module — mirroring how the app exposes it process-wide. The
 * JwtStrategy needs a non-empty secret — supplied via ConfigModule below.
 */

import type { INestApplication } from '@nestjs/common'
import { Global, Module } from '@nestjs/common'
import type { TestingModule, TestingModuleBuilder } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getQueueToken } from '@nestjs/bullmq'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import request from 'supertest'

// ── Controllers under test ──────────────────────────────────────────────────
import { AccountsModule } from '../accounts/accounts.module'
import { ContactsModule } from '../contacts/contacts.module'
import { CreditsModule } from '../credits/credits.module'
import { AuthModule } from './auth.module'
import { SupabaseModule } from '../../supabase/supabase.module'
import { SupabaseService } from '../../supabase/supabase.service'
import { CorrelationIdModule } from '../../correlation-id/correlation-id.module'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { StripeModule } from '../stripe/stripe.module'
import { StripeService } from '../stripe/stripe.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { AccountVocabularyEntity } from '../../database/entities/account-vocabulary.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'
import { MailerWorker } from '../mailer/mailer.worker'
import { OTP_REDIS_TOKEN } from '../otp/otp-redis.token'
import { ProfilerGateway } from '../profile-context/profiler.gateway'
import { AnalysisWorker } from '../analysis/analysis.worker'
import { AnalysisGateway } from '../analysis/analysis.gateway'
import { INTEGRATION_DELIVERY_QUEUE } from '../integrations/integrations.queue'
import { IntegrationsDeliveryWorker } from '../integrations/integrations.worker'
import { CONTACT_ENRICHMENT_QUEUE } from '../contacts/contact-enrichment.queue'
import { REPLAN_QUEUE } from '../analysis/replan.queue'
import { ReplanWorker } from '../analysis/replan.worker'
import { ContactEnrichmentWorker } from '../contacts/contact-enrichment.worker'
import { ORG_REBUILD_QUEUE } from '../analysis/org-rebuild.queue'
import { OrgRebuildWorker } from '../analysis/org-rebuild.worker'
import { CV_BATCH_IMPORT_QUEUE } from '../consultants/cv-batch-import.queue'
import { CV_ZIP_IMPORT_QUEUE } from '../consultants/cv-zip-import.queue'
import { CvZipImportWorker } from '../consultants/cv-zip-import.worker'
import { BulkCvRewriteWorker } from '../consultants/bulk-cv-rewrite.worker'
import { CvBatchImportWorker } from '../consultants/cv-batch-import.worker'
// #1952.3/#1952.6 (épopée #2844, lot SRC5 28/09 soir) — AccountsModule tire
// PilotageModule → ConsultantsModule, qui enregistre ces deux files : sans
// override ici, `app.init()` ouvre une VRAIE connexion Redis sur les tests
// AccountsController.
import { BULK_MATCHING_QUEUE } from '../consultants/matching/bulk-matching.queue'
import { BulkMatchingWorker } from '../consultants/matching/bulk-matching.worker'
import { BULK_EXPORT_QUEUE } from '../consultants/bulk-export.queue'
import { BulkExportWorker } from '../consultants/bulk-export.worker'
import { CV_AUTO_PARSE_QUEUE } from '../consultants/cv-auto-parse.queue'
import { CvAutoParseWorker } from '../consultants/cv-auto-parse.worker'
import { EVENT_BUS } from '../outbox/event-bus.token'
// SYNC-B / SYNC-C (19/10/2026) — CrmModule et CrmSyncModule enregistrent chacun une file + un worker : neutralisés
// comme les autres, sinon `app.init()` ouvre une VRAIE connexion Redis.
import { CRM_FIRST_IMPORT_QUEUE } from '../crm-first-import/crm-first-import.queue'
import { CrmFirstImportWorker } from '../crm/crm-first-import.worker'
import { CRM_FREQUENT_SYNC_QUEUE } from '../crm-sync/crm-frequent-sync.queue'
import { CrmFrequentSyncWorker } from '../crm-sync/crm-frequent-sync.worker'
// #4286.13 (lot SR1) — RoutinesModule enregistre la file de relecture d'employeur + son worker : neutralisés aussi.
import { EMPLOYMENT_RECHECK_QUEUE } from '../routines/employment-check'
import { EmploymentRecheckWorker } from '../routines/employment-recheck.worker'
import { createMockRepository } from '../../database/test-utils'

const mockSupabaseService = {
  getClient: () => ({ from: jest.fn(), auth: {} }),
}

const mockIaClient = {
  research: jest.fn(),
  contacts: jest.fn(),
  enrich: jest.fn(),
  plan: jest.fn(),
  enrichContact: jest.fn(),
}

const mockCorrelationIdService = {
  getCorrelationId: () => 'cid',
  runWithContext: async <T>(_: unknown, fn: () => Promise<T>) => fn(),
}

const testEnvConfig = () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
  supabaseJwtSecret: 'test-jwt-secret-at-least-32-chars-long-bellum',
  redisUrl: '',
  iaServiceUrl: 'http://localhost:8000',
  stripeSecretKey: 'sk_test_placeholder',
  stripeWebhookSecret: 'whsec_test',
})

// The data-source token is only registered by a real `TypeOrmModule.forRoot`,
// which these isolated module tests deliberately skip. `@Global` so it reaches
// every imported module's TypeORM repos, just like the real app.
const dataSourceStub = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getMongoRepository: jest.fn(() => createMockRepository()),
  getRepository: jest.fn(() => createMockRepository()),
  getTreeRepository: jest.fn(() => createMockRepository()),
  manager: { transaction: jest.fn() },
  transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
  // #2916 / #2399.2 (c93) — une vraie source de données porte sa liste d'abonnés
  // ORM ; `NeedArrivalSubscriber` (ConsultantsModule) s'y inscrit à la construction.
  subscribers: [] as unknown[],
}

@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

/**
 * Apply every override needed to boot the auth-protected modules without real
 * infra (Postgres, Redis, BullMQ, Socket.IO, Stripe). Each `.overrideProvider`
 * is a no-op when the corresponding token isn't in the graph, so a single
 * helper safely covers all three describe blocks below.
 */
function applyCommonOverrides(builder: TestingModuleBuilder): TestingModuleBuilder {
  return (
    builder
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideProvider(IaClient)
      .useValue(mockIaClient)
      .overrideProvider(CorrelationIdService)
      .useValue(mockCorrelationIdService)
      .overrideProvider(StripeService)
      .useValue({})
      // Booted infra — replaced with inert stubs so no real connection opens.
      .overrideProvider(getQueueToken('mailer'))
      .useValue({ add: jest.fn() })
      .overrideProvider(getQueueToken('analysis'))
      .useValue({ add: jest.fn() })
      .overrideProvider(getQueueToken('analysis-dlq'))
      .useValue({ add: jest.fn() })
      .overrideProvider(getQueueToken(INTEGRATION_DELIVERY_QUEUE))
      .useValue({ add: jest.fn() })
      .overrideProvider(getQueueToken(CONTACT_ENRICHMENT_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(getQueueToken(ORG_REBUILD_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(getQueueToken(REPLAN_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(getQueueToken(CV_BATCH_IMPORT_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(getQueueToken(CV_ZIP_IMPORT_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(getQueueToken(BULK_MATCHING_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(getQueueToken(BULK_EXPORT_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(MailerWorker)
      .useValue({})
      .overrideProvider(AnalysisWorker)
      .useValue({})
      .overrideProvider(IntegrationsDeliveryWorker)
      .useValue({})
      .overrideProvider(ContactEnrichmentWorker)
      .useValue({})
      .overrideProvider(OrgRebuildWorker)
      .useValue({})
      .overrideProvider(ReplanWorker)
      .useValue({})
      .overrideProvider(CvBatchImportWorker)
      .useValue({})
      .overrideProvider(CvZipImportWorker)
      .useValue({})
      .overrideProvider(BulkCvRewriteWorker)
      .useValue({})
      .overrideProvider(BulkMatchingWorker)
      .useValue({})
      .overrideProvider(BulkExportWorker)
      .useValue({})
      // c88 (04/10/2026) — la lecture automatique des CV : file + worker neufs
      // dans ConsultantsModule, neutralisés comme les autres.
      .overrideProvider(getQueueToken(CV_AUTO_PARSE_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(CvAutoParseWorker)
      .useValue({})
      .overrideProvider(getQueueToken(CRM_FIRST_IMPORT_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(CrmFirstImportWorker)
      .useValue({})
      .overrideProvider(getQueueToken(CRM_FREQUENT_SYNC_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(CrmFrequentSyncWorker)
      .useValue({})
      .overrideProvider(getQueueToken(EMPLOYMENT_RECHECK_QUEUE))
      .useValue({ add: jest.fn(), getJob: jest.fn() })
      .overrideProvider(EmploymentRecheckWorker)
      .useValue({})
      .overrideProvider(AnalysisGateway)
      .useValue({})
      .overrideProvider(ProfilerGateway)
      .useValue({})
      .overrideProvider(OTP_REDIS_TOKEN)
      .useValue({})
      .overrideProvider(EVENT_BUS)
      .useValue({ publish: jest.fn(), subscribe: jest.fn().mockResolvedValue(undefined) })
      // TypeORM repos pulled in across the auth + feature module graph.
      .overrideProvider(getRepositoryToken(AccountEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AccountShareEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ContactEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ActionPlanEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AnalysisRunEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AttackAngleEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AccountVocabularyEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(OutboxEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(SubscriptionEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileContextRevisionEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(EsnProfileEntity))
      .useValue(createMockRepository())
  )
}

function noAuth(app: INestApplication) {
  return request(app.getHttpServer())
}

// ===========================================================================
// Accounts controller — all routes require JWT
// ===========================================================================
describe('AccountsController — 401 without JWT', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module: TestingModule = await applyCommonOverrides(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
          MockDataSourceModule,
          CorrelationIdModule,
          IaModule,
          StripeModule,
          SupabaseModule,
          AuthModule,
          AccountsModule,
        ],
      }),
    ).compile()

    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /accounts → 401', async () => {
    const res = await noAuth(app).get('/accounts')
    expect(res.status).toBe(401)
  })

  it('GET /accounts/:id → 401', async () => {
    const res = await noAuth(app).get('/accounts/some-uuid')
    expect(res.status).toBe(401)
  })

  it('POST /accounts → 401', async () => {
    const res = await noAuth(app).post('/accounts').send({ company_name: 'SNCF' })
    expect(res.status).toBe(401)
  })

  it('DELETE /accounts/:id → 401', async () => {
    const res = await noAuth(app).delete('/accounts/some-uuid')
    expect(res.status).toBe(401)
  })
})

// ===========================================================================
// Contacts controller — all routes require JWT
// ===========================================================================
describe('ContactsController — 401 without JWT', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module: TestingModule = await applyCommonOverrides(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
          MockDataSourceModule,
          CorrelationIdModule,
          IaModule,
          StripeModule,
          SupabaseModule,
          AuthModule,
          ContactsModule,
        ],
      }),
    ).compile()

    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /contacts/account/:accountId → 401', async () => {
    const res = await noAuth(app).get('/contacts/account/some-uuid')
    expect(res.status).toBe(401)
  })

  it('GET /contacts/:id → 401', async () => {
    const res = await noAuth(app).get('/contacts/some-uuid')
    expect(res.status).toBe(401)
  })

  it('POST /contacts/:id/enrich → 401', async () => {
    const res = await noAuth(app).post('/contacts/some-uuid/enrich').send({})
    expect(res.status).toBe(401)
  })

  // #1800 — `/contacts/:id/favorite` (POST/DELETE) est retirée avec la notion
  // de favori (retour Louis, « supprime la notion de favori ») : la route
  // n'existe plus, donc l'appeler rend 404, pas 401 — ce n'est plus ce test-ci
  // qui la couvre.

  it('PATCH /contacts/:id/status → 401', async () => {
    const res = await noAuth(app).patch('/contacts/some-uuid/status').send({ user_status: 'contacted' })
    expect(res.status).toBe(401)
  })
})

// ===========================================================================
// Credits controller — GET /credits + POST /credits/checkout require JWT
// GET /credits/plans is public.
// ===========================================================================
describe('CreditsController — 401 without JWT on guarded routes', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module: TestingModule = await applyCommonOverrides(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
          MockDataSourceModule,
          CorrelationIdModule,
          IaModule,
          StripeModule,
          SupabaseModule,
          AuthModule,
          CreditsModule,
        ],
      }),
    ).compile()

    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /credits → 401 (requires JWT)', async () => {
    const res = await noAuth(app).get('/credits')
    expect(res.status).toBe(401)
  })

  it('POST /credits/checkout → 401 (requires JWT)', async () => {
    const res = await noAuth(app).post('/credits/checkout').send({ plan: 'starter' })
    expect(res.status).toBe(401)
  })

  it('GET /credits/plans → 200 (public — no guard)', async () => {
    const res = await noAuth(app).get('/credits/plans')
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })
})
