import { ConfigModule } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { EmailSuppressionEntity } from '../../database/entities/email-suppression.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository } from '../../database/test-utils'
import { ChangelogNewsletterModule } from './changelog-newsletter.module'
import { ChangelogNewsletterScheduler } from './changelog-newsletter.scheduler'
import { ChangelogNewsletterService } from './changelog-newsletter.service'

/**
 * The module is standalone (règle #7): it owns no table and exposes no route,
 * so compiling it needs nothing but the mailer + the three repositories it
 * reads. That is exactly what this spec proves.
 */
describe('ChangelogNewsletterModule', () => {
  it('compiles with only the mailer and its three repositories', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ChangelogNewsletterModule],
    })
      .overrideProvider(getRepositoryToken(ProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(NotificationPreferenceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(EmailSuppressionEntity))
      .useValue(createMockRepository())
      .compile()

    expect(module.get(ChangelogNewsletterService)).toBeDefined()
    expect(module.get(ChangelogNewsletterScheduler)).toBeDefined()
    await module.close()
  })
})
