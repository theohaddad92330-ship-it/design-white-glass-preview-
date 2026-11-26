import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { IntroductionAuthorizationEntity } from '../../database/entities/introduction-authorization.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { IntroductionAuthorizationController } from './introduction-authorization.controller'
import { IntroductionAuthorizationService } from './introduction-authorization.service'

/**
 * #2373.9 — la preuve d'autorisation d'une introduction, dans le temps.
 * Module autonome (règle #7) : le retirer ne casse pas le reste.
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([IntroductionAuthorizationEntity, ContactEntity])],
  controllers: [IntroductionAuthorizationController],
  providers: [IntroductionAuthorizationService],
  exports: [IntroductionAuthorizationService],
})
export class IntroductionsModule {}
