import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { WatchlistRefreshModule } from './watchlist-refresh.module'
import { WatchlistRefreshScheduler } from './watchlist-refresh.scheduler'
import { WATCHLIST_REFRESH_QUEUE } from './watchlist-refresh.queue'
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
import { AnalysisWorker } from '../analysis/analysis.worker'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { StripeModule } from '../stripe/stripe.module'
import { StripeService } from '../stripe/stripe.service'
import { createMockRepository } from '../../database/test-utils'
import { WatchlistRefreshWorker } from './watchlist-refresh.worker'
import { SupabaseService } from '../../supabase/supabase.service'

// Same DI-graph stubbing as `analysis.module.spec.ts` — this module imports
// AnalysisModule (for the un-billed AnalysisOnDemandService), so its compile
// test needs the same transitive overrides. What THIS spec proves is the
// wiring specific to C4: AnalysisOnDemandService is exported by
// AnalysisModule, the watchlist-refresh queue token resolves, and the
// scheduler/worker providers build.

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

@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

function workspacesRepoWithOwned() {
  const repo = createMockRepository()
  repo.findOne.mockResolvedValue({ id: 'ws-1' })
  return repo
}

describe('WatchlistRefreshModule', () => {
  it('compiles the module (AnalysisOnDemandService export + queue + scheduler resolve)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true }),
        StripeModule,
        CorrelationIdModule,
        IaModule,
        WatchlistRefreshModule,
      ],
    })
      .overrideProvider(getQueueToken(WATCHLIST_REFRESH_QUEUE))
      .useValue({ add: jest.fn() })
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
      .overrideProvider(WatchlistRefreshWorker)
      .useValue({})
      .overrideProvider(IaClient)
      .useValue({ research: jest.fn(), contacts: jest.fn(), enrich: jest.fn(), plan: jest.fn() })
      // ⚠️ `SupabaseService` s'instancie dans SON CONSTRUCTEUR et exige
      // `supabaseUrl` — le graphe l'atteint depuis le 01/09 via `StorageModule`
      // (le dépôt de justificatifs), que `AnalysisModule` importe désormais.
      // Sans cette surcharge, ce test échoue sur la CONFIGURATION et non sur
      // le graphe qu'il prétend vérifier. Même remède que `analysis.module.spec.ts`.
      .overrideProvider(SupabaseService)
      .useValue({ getClient: () => ({}) })
      .overrideProvider(CorrelationIdService)
      .useValue({
        getCorrelationId: () => 'cid',
        runWithContext: async (_: unknown, fn: () => Promise<unknown>) => fn(),
      })
      .compile()

    expect(module).toBeDefined()
    expect(module.get(WatchlistRefreshScheduler)).toBeDefined()
    await module.close()
  })
})
