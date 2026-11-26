import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { OutreachAssetModule } from './outreach-asset.module'
import { OutreachAssetController } from './outreach-asset.controller'
import { OutreachAssetService } from './outreach-asset.service'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'
import { MailerWorker } from '../mailer/mailer.worker'
import { ProfilerGateway } from '../profile-context/profiler.gateway'
import { OTP_REDIS_TOKEN } from '../otp/otp-redis.token'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { SupabaseModule } from '../../supabase/supabase.module'
import { SupabaseService } from '../../supabase/supabase.service'
import { createMockRepository } from '../../database/test-utils'

// OutreachAssetModule imports AuthModule (JWT guard) + WorkspaceModule; the
// stubs below mirror `library.module.spec` so the auth chain resolves without
// real infra.
const dataSourceStub = {
  entityMetadatas: [],
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

const testEnvConfig = () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
  supabaseJwtSecret: 'test-jwt-secret-at-least-32-chars-long-bellum',
  frontendUrl: 'http://localhost:5173',
})

describe('OutreachAssetModule', () => {
  it('compiles, mounts OutreachAssetController and provides OutreachAssetService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MockDataSourceModule,
        ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
        SupabaseModule,
        IaModule,
        OutreachAssetModule,
      ],
    })
      .overrideProvider(IaClient)
      .useValue({})
      .overrideProvider(getRepositoryToken(OutreachAssetEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(AccountEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileContextRevisionEntity))
      .useValue(createMockRepository())
      .overrideProvider(getQueueToken('mailer'))
      .useValue({ add: jest.fn() })
      .overrideProvider(MailerWorker)
      .useValue({})
      .overrideProvider(OTP_REDIS_TOKEN)
      .useValue({ get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn() })
      .overrideProvider(ProfilerGateway)
      .useValue({})
      .overrideProvider(SupabaseService)
      .useValue({ getClient: () => ({ auth: {} }) })
      .compile()

    expect(moduleRef.get(OutreachAssetController)).toBeInstanceOf(OutreachAssetController)
    expect(moduleRef.get(OutreachAssetService)).toBeInstanceOf(OutreachAssetService)
    await moduleRef.close()
  })
})
