import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MessageDraftArchivalEntity } from '../../database/entities/message-draft-archival.entity'
import { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MessageDraftValidationController } from './message-draft-validation.controller'
import { MessageDraftValidationService } from './message-draft-validation.service'
import { MessageDraftVersionController } from './message-draft-version.controller'
import { MessageDraftVersionService } from './message-draft-version.service'

/**
 * #3695.4/.6, #3696 — la trace du brouillon, en base. Module autonome
 * (règle #7) : le retirer ne casse pas le reste.
 */
@Module({
  imports: [
    WorkspaceModule,
    TypeOrmModule.forFeature([
      MessageDraftVersionEntity,
      MessageDraftValidationEntity,
      ContactEntity,
      AccountEntity,
      MessageDraftArchivalEntity,
    ]),
  ],
  controllers: [MessageDraftVersionController, MessageDraftValidationController],
  providers: [MessageDraftVersionService, MessageDraftValidationService],
  exports: [MessageDraftVersionService],
})
export class MessageDraftsModule {}
