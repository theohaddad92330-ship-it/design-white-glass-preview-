import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { getQueueToken } from '@nestjs/bullmq'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { AccountsModule } from './accounts.module'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'
import { AccountShareService } from './account-share.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountShareEntity } from '../../database/entities/account-share.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { AccountVocabularyEntity } from '../../database/entities/account-vocabulary.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { OutboxEntity } from '../../database/entities/outbox.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { AnalysisWorker } from '../analysis/analysis.worker'
import { CorrelationIdModule } from '../../correlation-id/correlation-id.module'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { StripeModule } from '../stripe/stripe.module'
import { StripeService } from '../stripe/stripe.service'
import { createMockRepository } from '../../database/test-utils'
import { SupabaseService } from '../../supabase/supabase.service'

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

// `@Global` so the data-source token reaches `AccountsModule` and its
// transitive `forwardRef(AnalysisModule)` import — mirroring how
// `TypeOrmModule.forRoot` exposes it app-wide.
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

describe('AccountsModule', () => {
  it('compiles the module', async () => {
    // AccountsModule pulls in AnalysisModule via forwardRef, so the whole
    // analysis graph (queues, IA client, Stripe, worker) must be stubbed too.
    const module = await Test.createTestingModule({
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true }),
        StripeModule,
        CorrelationIdModule,
        IaModule,
        AccountsModule,
      ],
    })
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
      .overrideProvider(getRepositoryToken(UserActionEntity))
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
      .overrideProvider(getRepositoryToken(EsnProfileEntity))
      .useValue(createMockRepository())
      // WorkspaceModule (Phase 2) registers WorkspaceEntity + WorkspaceMemberEntity
      // for the WorkspaceContextService the accounts controller/service consume.
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      .overrideProvider(StripeService)
      .useValue({})
      .overrideProvider(AnalysisWorker)
      .useValue({})
      .overrideProvider(IaClient)
      .useValue(iaOverride)
      // ⚠️ `SupabaseService` s'instancie dans SON CONSTRUCTEUR et exige
      // `supabaseUrl` — le graphe l'atteint depuis le 01/09 via `StorageModule`
      // (le dépôt de justificatifs). Sans cette surcharge, ce test échoue sur la
      // CONFIGURATION et non sur le graphe qu'il prétend vérifier — le troisième
      // module touché par la même cause aujourd'hui.
      .overrideProvider(SupabaseService)
      .useValue({ getClient: () => ({}) })
      .overrideProvider(CorrelationIdService)
      .useValue(correlationOverride)
      .compile()

    expect(module).toBeDefined()
    expect(module.get(AccountsController)).toBeDefined()
    expect(module.get(AccountsService)).toBeDefined()
    expect(module.get(AccountShareService)).toBeDefined()
    await module.close()
  })
})
