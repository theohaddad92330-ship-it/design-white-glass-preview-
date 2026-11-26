import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { WorkspaceModule } from './workspace.module'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceController } from './workspace.controller'
import { WorkspaceMarketService } from './workspace-market.service'
import { WorkspaceTeamService } from './workspace-team.service'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { WorkspaceRulesController } from './workspace-rules.controller'
import { MailerWorker } from '../mailer/mailer.worker'
import { createMockRepository } from '../../database/test-utils'

// `TypeOrmModule.forFeature` generates repository providers that inject the
// data-source token, which only `forRoot` registers — absent in unit tests.
// Provide a @Global stub so the DI graph resolves, then override each repo.
const dataSourceStub = {
  entityMetadatas: [],
  options: { type: 'postgres' },
  getRepository: jest.fn(() => createMockRepository()),
  transaction: jest.fn(),
}

@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: dataSourceStub }],
  exports: [getDataSourceToken()],
})
class MockDataSourceModule {}

const testEnvConfig = () => ({
  frontendUrl: 'http://localhost:5173',
  emailProvider: 'mailpit',
})

describe('WorkspaceModule', () => {
  it('compiles and exposes the context service, controller, team + market services', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockDataSourceModule, ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }), WorkspaceModule],
    })
      .overrideProvider(getRepositoryToken(WorkspaceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceMemberEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(WorkspaceInvitationEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(ProfileEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(SubscriptionEntity))
      .useValue(createMockRepository())
      // MailerModule registers a BullMQ queue + worker; stub the infra so no
      // real Redis connection is made.
      .overrideProvider(getQueueToken('mailer'))
      .useValue({ add: jest.fn() })
      .overrideProvider(MailerWorker)
      .useValue({})
      .compile()

    expect(moduleRef.get(WorkspaceContextService)).toBeInstanceOf(WorkspaceContextService)
    expect(moduleRef.get(WorkspaceTeamService)).toBeInstanceOf(WorkspaceTeamService)
    expect(moduleRef.get(WorkspaceMarketService)).toBeInstanceOf(WorkspaceMarketService)
    expect(moduleRef.get(WorkspaceController)).toBeInstanceOf(WorkspaceController)
    await moduleRef.close()
  })

  /**
   * #2081.14 — le dépôt des règles d'espace ATTEINT le contexte. Il y est
   * `@Optional()` (des specs le construisent positionnellement) : sans cette
   * vérification, l'oublier dans `forFeature` ferait retomber chaque règle sur
   * son défaut, en silence — l'export rouvert à tous alors que l'administrateur
   * l'a fermé.
   */
  it('#2081.14 — branche le dépôt des règles d’espace sur le contexte, et monte leur contrôleur', async () => {
    const rulesRepository = createMockRepository()
    rulesRepository.findOne.mockResolvedValue({ workspace_id: 'ws-1', export_policy: 'admins' })
    const moduleRef = await Test.createTestingModule({
      imports: [MockDataSourceModule, ConfigModule.forRoot({ isGlobal: true, load: [testEnvConfig] }), WorkspaceModule],
    })
      .overrideProvider(getRepositoryToken(WorkspaceRulesEntity))
      .useValue(rulesRepository)
      .overrideProvider(getQueueToken('mailer'))
      .useValue({ add: jest.fn() })
      .overrideProvider(MailerWorker)
      .useValue({})
      .compile()

    const rules = await moduleRef.get(WorkspaceContextService).workspaceRulesOf('ws-1')
    expect(rulesRepository.findOne).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1' } })
    expect(rules.exportPolicy).toBe('admins')
    expect(moduleRef.get(WorkspaceRulesController)).toBeInstanceOf(WorkspaceRulesController)
    await moduleRef.close()
  })
})
