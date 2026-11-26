import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { LemlistConnectionEntity } from '../../database/entities/lemlist-connection.entity'
import { LemlistLeadPushEntity } from '../../database/entities/lemlist-lead-push.entity'
import { CrmModule } from '../crm/crm.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { LemlistController } from './lemlist.controller'
import { LemlistService } from './lemlist.service'

/**
 * #4427 — module autonome (règle #7) : rien ne l'importe. Il importe le CRM pour
 * la porte d'écriture (`OutboundWriteService`) — la même que les écritures CRM.
 */
@Module({
  imports: [
    WorkspaceModule,
    CrmModule,
    TypeOrmModule.forFeature([LemlistConnectionEntity, LemlistLeadPushEntity, ContactEntity, AccountEntity]),
  ],
  controllers: [LemlistController],
  providers: [LemlistService],
})
export class LemlistModule {}
