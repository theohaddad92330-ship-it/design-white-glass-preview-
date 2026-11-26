import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { SupabaseService } from '../../supabase/supabase.service'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { isSuccess } from '@bellum/utils'
import { AnalysisModule } from './analysis.module'
import { AnalysisController } from './analysis.controller'
import { AnalysisService } from './analysis.service'
import { AnalysisGateway } from './analysis.gateway'
import { AnalysisWorker } from './analysis.worker'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { AccountVocabularyEntity } from '../../database/entities/account-vocabulary.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { CorrelationIdModule } from '../../correlation-id/correlation-id.module'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { StripeModule } from '../stripe/stripe.module'
import { StripeService } from '../stripe/stripe.service'
import { createMockRepository } from '../../database/test-utils'

const iaOverride = {
  research: jest.fn(),
  contacts: jest.fn(),
  enrich: jest.fn(),
  plan: jest.fn(),
  enrichContact: jest.fn(),
}

const correlationOverride = {
  getCorrelationId: () => 'cid',
  runWithContext: async (_: unknown, fn: () => Promise<unknown>) => fn(),
}

// Every user is guaranteed a workspace (Phase-1 backfill + the
// `on_auth_user_created_workspace` trigger), so `WorkspaceContextService`
// resolves one and `AccountsService.create` stamps `workspace_id` instead of
// failing closed. The mock repo mirrors that: `findOne` returns the owned ws.
function workspacesRepoWithOwned() {
  const repo = createMockRepository()
  repo.findOne.mockResolvedValue({ id: 'ws-1' })
  return repo
}

// `@InjectDataSource()` (AnalysisPersistenceService) resolves the data-source
// token, which only a real `TypeOrmModule.forRoot` registers — absent in unit
// tests. Provide a stub so the DI graph resolves without a DB connection.
const dataSourceStub = {
  entityMetadatas: [],
  // #2916 / #2399.2 (c93) — une vraie source de données porte sa liste d'abonnés
  // ORM ; `NeedArrivalSubscriber` (ConsultantsModule) s'y inscrit à la construction.
  subscribers: [] as unknown[],
  options: { type: 'postgres' },
  getMongoRepository: jest.fn(() => createMockRepository()),
  getRepository: jest.fn(() => createMockRepository()),
  getTreeRepository: jest.fn(() => createMockRepository()),
  manager: { transaction: jest.fn() },
  transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
}

// `@Global` so the data-source token is visible inside `AnalysisModule` (and
// its transitive imports), mirroring how `TypeOrmModule.forRoot` exposes it
// app-wide. A plain root-level provider would not reach the imported module.
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

describe('AnalysisModule', () => {
  it('compiles the module', async () => {
    const module = await Test.createTestingModule({
      // StripeModule is @Global → its StripeService becomes visible to
      // CreditsService.constructor. We then overrideProvider it below with
      // a `{}` stub so the real Stripe SDK never instantiates in tests.
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true }),
        StripeModule,
        CorrelationIdModule,
        IaModule,
        AnalysisModule,
      ],
    })
      // ⚠️ `SupabaseService` s'instancie dans SON CONSTRUCTEUR et exige
      // `supabaseUrl` — absent en test. Il est entré dans ce graphe le
      // 31/08/2026 par `StorageModule`, que le stockage de fichiers a rendu
      // nécessaire aux notes de frais et aux documents d'un besoin. Même
      // raison, même remède que `StripeService` juste au-dessus : on remplace
      // par un objet vide, le vrai client ne s'ouvre jamais en test.
      .overrideProvider(SupabaseService)
      .useValue({})
      .overrideProvider(getQueueToken('analysis'))
      .useValue({ add: jest.fn() })
      .overrideProvider(getQueueToken('analysis-dlq'))
      .useValue({ add: jest.fn() })
      .overrideProvider(getRepositoryToken(AccountEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AccountShareEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ContactEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AttackAngleEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AccountVocabularyEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ActionPlanEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AnalysisRunEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(OutboxEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(SubscriptionEntity))
      .useValue(createMockRepository())
      // WorkspaceModule (Phase 2) registers these for WorkspaceContextService,
      // which AnalysisPersistenceService now uses to resolve the run's workspace.
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(workspacesRepoWithOwned())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(EsnProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(NotificationEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(NotificationPreferenceEntity))
      .useValue(createMockRepository())
      .overrideProvider(StripeService)
      .useValue({})
      .overrideProvider(AnalysisWorker)
      .useValue({})
      .overrideProvider(IaClient)
      .useValue(iaOverride)
      .overrideProvider(CorrelationIdService)
      .useValue(correlationOverride)
      .compile()

    expect(module).toBeDefined()
    expect(module.get(AnalysisController)).toBeDefined()
    expect(module.get(AnalysisService)).toBeDefined()
    expect(module.get(AnalysisGateway)).toBeDefined()
    await module.close()
  })

  it('creates a job via service', async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: 'analysis-user-123-sncf' })
    const mockGetJob = jest.fn().mockResolvedValue(undefined)
    const accountsRepo = createMockRepository()
    accountsRepo.save.mockImplementation(async (entity: Record<string, unknown>) => ({ id: 'acc-1', ...entity }))
    const module = await Test.createTestingModule({
      // StripeModule is @Global → its StripeService becomes visible to
      // CreditsService.constructor. We then overrideProvider it below with
      // a `{}` stub so the real Stripe SDK never instantiates in tests.
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true }),
        StripeModule,
        CorrelationIdModule,
        IaModule,
        AnalysisModule,
      ],
    })
      // Même raison que le cas précédent : `SupabaseService` s'instancie dans
      // son constructeur et exige `supabaseUrl`, absent en test.
      .overrideProvider(SupabaseService)
      .useValue({})
      .overrideProvider(getQueueToken('analysis'))
      .useValue({ add: mockAdd, getJob: mockGetJob })
      .overrideProvider(getQueueToken('analysis-dlq'))
      .useValue({ add: jest.fn() })
      .overrideProvider(getRepositoryToken(AccountEntity))
      .useValue(accountsRepo)
      .overrideProvider(getRepositoryToken(AccountShareEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ContactEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AttackAngleEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AccountVocabularyEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ActionPlanEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AnalysisRunEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(OutboxEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(SubscriptionEntity))
      .useValue(createMockRepository())
      // WorkspaceModule (Phase 2) registers these for WorkspaceContextService,
      // which AnalysisPersistenceService now uses to resolve the run's workspace.
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(workspacesRepoWithOwned())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(EsnProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(NotificationEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(NotificationPreferenceEntity))
      .useValue(createMockRepository())
      .overrideProvider(StripeService)
      .useValue({})
      .overrideProvider(AnalysisWorker)
      .useValue({})
      .overrideProvider(IaClient)
      .useValue(iaOverride)
      .overrideProvider(CorrelationIdService)
      .useValue(correlationOverride)
      .compile()

    const service = module.get(AnalysisService)
    // Scope perimeter (Théo p.10/21) threads onto the job payload.
    const result = await service.start({ company_name: 'SNCF', scope_mode: 'france' }, 'user-123')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) {
      expect(result.output.jobId).toBe('analysis-user-123-sncf')
      expect(result.output.accountId).toBe('acc-1')
    }
    expect(mockAdd).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ companyName: 'SNCF', accountId: 'acc-1', scopeMode: 'france' }),
      expect.objectContaining({ jobId: 'analysis-user-123-sncf' }),
    )
    await module.close()
  })
})
