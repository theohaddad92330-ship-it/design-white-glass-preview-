import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { RagModule } from './rag.module'
import { RagController } from './rag.controller'
import { RagService } from './rag.service'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { MailerWorker } from '../mailer/mailer.worker'
import { ProfilerGateway } from '../profile-context/profiler.gateway'
import { OTP_REDIS_TOKEN } from '../otp/otp-redis.token'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { SupabaseModule } from '../../supabase/supabase.module'
import { SupabaseService } from '../../supabase/supabase.service'
import { createMockRepository } from '../../database/test-utils'
import { ImportModule } from '../import/import.module'
import { ImportService } from '../import/import.service'
import { ImportWriterService } from '../import/import-writer.service'

// RagModule imports AuthModule, which transitively pulls in TypeORM repos
// (`AccountEntity`, `ProfileEntity`, `ProfileContextRevisionEntity`,
// `RagDocumentEntity`). Their generated `XxxEntityRepository` providers each
// inject the data-source token at index [0], which only a real
// `TypeOrmModule.forRoot` registers — absent in unit tests. Provide a stub.
const dataSourceStub = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getMongoRepository: jest.fn(() => createMockRepository()),
  getRepository: jest.fn(() => createMockRepository()),
  getTreeRepository: jest.fn(() => createMockRepository()),
  manager: { transaction: jest.fn() },
  transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
}

// `@Global` so the data-source token is visible inside `RagModule` and its
// transitive imports (`AuthModule` → `MailerModule`/`OtpModule`/
// `ProfileContextModule`), mirroring how `TypeOrmModule.forRoot` exposes it
// app-wide. A plain root-level provider would not reach the imported modules.
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

/**
 * `ImportModule`, réduit à ce que `RagController` lui demande (#2850,
 * #2431.11 — la proposition d'import depuis le dépôt `/chat`).
 *
 * ⚠️ `overrideModule` et non `overrideProvider` : le vrai `ImportModule`
 * importe `ContactsModule`, qui importe lui-même `CreditsModule` (et son
 * graphe — Stripe, notifications, budget d'espace, verrous, catalogue de
 * plans…), `SprintsModule`, `CrmCoreModule`, `BusinessUnitModule`… Nest
 * instancie tout ce graphe même si `RagController` n'en lit qu'un
 * sous-ensemble minuscule. Ce test vérifie le câblage de `RagModule`, pas
 * celui de `ContactsModule` — le remplacer évite qu'il casse à chaque
 * entité ajoutée ailleurs dans ce graphe, sans jamais rien prouver de plus
 * sur RAG.
 */
@Module({
  providers: [
    { provide: ImportService, useValue: {} },
    { provide: ImportWriterService, useValue: {} },
  ],
  exports: [ImportService, ImportWriterService],
})
class FakeImportModule {}

// JwtStrategy reads the Supabase JWT secret from config at construction. Supply
// the env values the auth chain needs so the DI graph resolves in tests.
const testEnvConfig = () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
  supabaseJwtSecret: 'test-jwt-secret-at-least-32-chars-long-bellum',
  frontendUrl: 'http://localhost:5173',
})

describe('RagModule', () => {
  it('compiles the module', async () => {
    const module = await Test.createTestingModule({
      // SupabaseModule + IaModule are @Global → their SupabaseService / IaClient
      // become visible to the AuthModule / ProfileContextModule chain. Both are
      // stubbed below so no real SDK / HTTP client instantiates in tests.
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
        SupabaseModule,
        IaModule,
        RagModule,
      ],
    })
      .overrideProvider(IaClient)
      .useValue({})
      .overrideProvider(getRepositoryToken(RagDocumentEntity))
      .useValue(createMockRepository())
      // AuthModule registers AccountEntity; ProfileContextModule registers
      // ProfileEntity + ProfileContextRevisionEntity. Mock their repos.
      .overrideProvider(getRepositoryToken(AccountEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileContextRevisionEntity))
      .useValue(createMockRepository())
      // WorkspaceModule (Phase 2 foundation) registers WorkspaceEntity +
      // WorkspaceMemberEntity for the WorkspaceContextService the controller uses.
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      // MailerModule registers a BullMQ queue + worker; OtpModule eagerly
      // opens a Redis client. Stub the infra so no real connection is made.
      .overrideProvider(getQueueToken('mailer'))
      .useValue({ add: jest.fn() })
      .overrideProvider(MailerWorker)
      .useValue({})
      .overrideProvider(OTP_REDIS_TOKEN)
      .useValue({ get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn() })
      // ProfileContextModule boots a Socket.IO gateway; stub it out.
      .overrideProvider(ProfilerGateway)
      .useValue({})
      // SupabaseAuthGateway / JwtStrategy consume SupabaseService; stub the
      // real Supabase SDK so it never instantiates in tests.
      .overrideProvider(SupabaseService)
      .useValue({ getClient: () => ({ auth: {} }) })
      // #2850 — voir le docblock de `FakeImportModule` ci-dessus.
      .overrideModule(ImportModule)
      .useModule(FakeImportModule)
      .compile()

    expect(module).toBeDefined()
    expect(module.get(RagController)).toBeDefined()
    expect(module.get(RagService)).toBeDefined()
    await module.close()
  })
})
