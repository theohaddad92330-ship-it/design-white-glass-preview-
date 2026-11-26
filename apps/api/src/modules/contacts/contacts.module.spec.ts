import { SupabaseService } from '../../supabase/supabase.service'
import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { ContactsModule } from './contacts.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import { ContactEntity } from '../../database/entities/contact.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { CreditsService } from '../credits/credits.service'
import { IaClient } from '../ia/ia.client'
import { CorrelationIdModule } from '../../correlation-id/correlation-id.module'
import { IaModule } from '../ia/ia.module'
import { StripeModule } from '../stripe/stripe.module'
import { StripeService } from '../stripe/stripe.service'
import { createMockRepository } from '../../database/test-utils'

// TypeORM repos (`ContactEntityRepository`, `SubscriptionEntityRepository`)
// require the data-source token at constructor index [0], which only a real
// `TypeOrmModule.forRoot` registers — absent in unit tests. Provide a stub so
// the DI graph resolves without a DB connection.
const dataSourceStub = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getMongoRepository: jest.fn(() => createMockRepository()),
  getRepository: jest.fn(() => createMockRepository()),
  getTreeRepository: jest.fn(() => createMockRepository()),
  manager: { transaction: jest.fn() },
  transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
}

// `@Global` so the data-source token is visible inside `ContactsModule` and its
// transitive imports (`CreditsModule`), mirroring how `TypeOrmModule.forRoot`
// exposes it app-wide. A plain root-level provider would not reach them.
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

describe('ContactsModule', () => {
  it('compiles the module', async () => {
    const module = await Test.createTestingModule({
      // StripeModule is @Global → its StripeService becomes visible to
      // CreditsController.constructor. We override it below with a `{}` stub
      // so the real Stripe SDK never instantiates in tests.
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true }),
        StripeModule,
        CorrelationIdModule,
        IaModule,
        ContactsModule,
      ],
    })
      .overrideProvider(StripeService)
      .useValue({})
      .overrideProvider(IaClient)
      .useValue({ enrichContact: jest.fn() })
      .overrideProvider(getRepositoryToken(ContactEntity))
      .useValue(createMockRepository())
      // CreditsModule is imported transitively → its SubscriptionEntity repo
      // needs a DataSource that the test harness doesn't have. Mock it.
      .overrideProvider(getRepositoryToken(SubscriptionEntity))
      .useValue(createMockRepository())
      // WorkspaceModule (Phase 2) registers WorkspaceEntity + WorkspaceMemberEntity
      // for the WorkspaceContextService that ContactsService now depends on.
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      // CreditsService instantiation requires a Stripe secret. Stub it since
      // ContactsService only consumes the credit-decrement helpers.
      // #3699.6 — `StorageModule` (pièces jointes d'un envoi) fait entrer
      // `SupabaseService` dans ce graphe ; il exige `supabaseUrl` dans son
      // constructeur, absent en test (même stub qu'`analysis.module.spec`).
      .overrideProvider(SupabaseService)
      .useValue({})
      .overrideProvider(CreditsService)
      .useValue({
        hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
        consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 0 }),
      })
      .compile()

    expect(module).toBeDefined()
    expect(module.get(ContactsController)).toBeDefined()
    expect(module.get(ContactsService)).toBeDefined()
    await module.close()
  })
})
