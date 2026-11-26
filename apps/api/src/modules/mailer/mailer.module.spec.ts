import { ConfigModule } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EmailSuppressionEntity } from '../../database/entities/email-suppression.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { MailerController } from './mailer.controller'
import { MailerModule } from './mailer.module'
import { MailerService } from './mailer.service'

const testEnvConfig = () => ({
  smtpFrom: 'noreply@bellum.test',
  nodeEnv: 'development',
  mailpitHttpBaseUrl: 'http://localhost:8025',
  emailProvider: 'mailpit',
  resendApiKey: 're_test_123',
  resendFrom: 'onboarding@bellum.test',
})

describe('MailerModule', () => {
  let moduleRef: TestingModule

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }), MailerModule],
    })
      // The suppression repo needs a DataSource we don't wire in this isolated
      // module test — override it with a stub so the module still compiles.
      .overrideProvider(getRepositoryToken(EmailSuppressionEntity))
      .useValue({ count: jest.fn(), createQueryBuilder: jest.fn() })
      // Idem pour l'appartenance aux espaces, que `isSuppressedForUser` lit :
      // un opt-out posé dans UN espace fait taire les envois périodiques
      // partout, et un utilisateur peut être membre de plusieurs équipes.
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue({ find: jest.fn() })
      .compile()
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  it('compiles and resolves MailerService', () => {
    expect(moduleRef.get(MailerService)).toBeInstanceOf(MailerService)
  })

  it('registers MailerController', () => {
    expect(moduleRef.get(MailerController)).toBeInstanceOf(MailerController)
  })

  it('exports MailerService so other modules can inject it', () => {
    // Same singleton inside and outside the module's exports scope.
    const fromRoot = moduleRef.get(MailerService)
    const fromSelf = moduleRef.select(MailerModule).get(MailerService)
    expect(fromRoot).toBe(fromSelf)
  })
})
