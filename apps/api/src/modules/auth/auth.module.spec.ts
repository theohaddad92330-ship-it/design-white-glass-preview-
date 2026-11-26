import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth.module'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import { CredentialsAuthService } from './credentials-auth.service'
import { EmailVerificationService } from './email-verification.service'
import { PasswordResetService } from './password-reset.service'
import { OAuthService } from './oauth-auth.service'
import { JwtGuard } from './jwt.guard'
import { JwtStrategy } from './jwt.strategy'
import { SupabaseModule } from '../../supabase/supabase.module'
import { SupabaseService } from '../../supabase/supabase.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'
import { MailerWorker } from '../mailer/mailer.worker'
import { OTP_REDIS_TOKEN } from '../otp/otp-redis.token'
import { ProfilerGateway } from '../profile-context/profiler.gateway'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { createMockRepository } from '../../database/test-utils'

const testEnvConfig = () => ({
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceRoleKey: 'test-service-role-key',
  supabaseJwtSecret: 'test-jwt-secret-at-least-32-chars-long-bellum',
  frontendUrl: 'http://localhost:5173',
  redisUrl: '',
})

const mockSupabaseService = {
  getClient: () => ({ auth: {} }),
}

// AuthModule pulls in TypeORM repositories (`AccountEntity` plus, via
// `ProfileContextModule`, `ProfileEntity` / `ProfileContextRevisionEntity`).
// Each repo injects the data-source token, which only a real
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

// `@Global` so the data-source token is visible inside `AuthModule` and its
// transitive imports (`ProfileContextModule`), mirroring how
// `TypeOrmModule.forRoot` exposes it app-wide. A plain root-level provider
// would not reach the imported modules.
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

// Stub the booted infra AuthModule pulls in transitively so the DI graph
// resolves without real Redis / BullMQ / Socket.IO connections:
//  - `mailer` queue + `MailerWorker` (BullMQ via MailerModule)
//  - OTP Redis client (ioredis via OtpModule)
//  - `ProfilerGateway` (Socket.IO via ProfileContextModule)
function buildModule() {
  return Test.createTestingModule({
    // IaModule is `@Global` → importing it once makes IaClient (consumed by
    // ProfileContextService) resolvable; we then override it with a stub.
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }),
      MockDataSourceModule,
      IaModule,
      SupabaseModule,
      AuthModule,
    ],
  })
    .overrideProvider(SupabaseService)
    .useValue(mockSupabaseService)
    .overrideProvider(IaClient)
    .useValue({})
    .overrideProvider(getQueueToken('mailer'))
    .useValue({ add: jest.fn() })
    .overrideProvider(MailerWorker)
    .useValue({})
    .overrideProvider(OTP_REDIS_TOKEN)
    .useValue({})
    .overrideProvider(ProfilerGateway)
    .useValue({})
    .overrideProvider(getRepositoryToken(AccountEntity))
    .useValue(createMockRepository())
    .overrideProvider(getRepositoryToken(ProfileEntity))
    .useValue(createMockRepository())
    .overrideProvider(getRepositoryToken(ProfileContextRevisionEntity))
    .useValue(createMockRepository())
    .compile()
}

describe('AuthModule', () => {
  it('compiles the module and resolves core providers', async () => {
    const module = await buildModule()

    expect(module).toBeDefined()
    expect(module.get(SupabaseAuthGateway)).toBeDefined()
    expect(module.get(SessionService)).toBeDefined()
    expect(module.get(CredentialsAuthService)).toBeDefined()
    expect(module.get(EmailVerificationService)).toBeDefined()
    expect(module.get(PasswordResetService)).toBeDefined()
    expect(module.get(OAuthService)).toBeDefined()
    expect(module.get(JwtGuard)).toBeDefined()
    expect(module.get(JwtStrategy)).toBeDefined()
    await module.close()
  })

  it('JwtStrategy.validate maps payload to { userId, email }', async () => {
    const module = await buildModule()

    const strategy = module.get(JwtStrategy)
    // Sans cookie d'appareil, la révocation par requête (finding #6) est sautée.
    const result = await strategy.validate({ cookies: {} } as never, {
      sub: 'user-123',
      email: 'test@example.com',
    })
    expect(result).toEqual({ userId: 'user-123', email: 'test@example.com' })
    await module.close()
  })
})
