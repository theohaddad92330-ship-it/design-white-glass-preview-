import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { IntegrationSyncRunEntity } from '../../database/entities/integration-sync-run.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { AgendaModule } from '../agenda/agenda.module'
import { CrmModule } from '../crm/crm.module'
import { CrmSyncModule } from '../crm-sync/crm-sync.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { IntegrationSyncController } from './integration-sync.controller'
import { INTEGRATION_SYNC_QUEUE } from './integration-sync.queue'
import { IntegrationSyncService } from './integration-sync.service'
import { IntegrationSyncWorker } from './integration-sync.worker'

/**
 * L'amorçage de la première synchronisation (#3014, job réel BullMQ depuis
 * l'épopée #2980).
 *
 * Module autonome (règle CLAUDE n°7) : le retirer supprime le CTA post-OAuth,
 * son écran ET le job en file — rien d'autre. La synchro CRM planifiée
 * (`CrmSyncModule`) et le registre d'outils continuent de fonctionner sans lui.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntegrationSyncRunEntity,
      AccountEntity,
      ContactEntity,
      ActivityEntity,
      UserActionEntity,
      RagDocumentEntity,
    ]),
    BullModule.registerQueue({
      name: INTEGRATION_SYNC_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800 },
      },
    }),
    CrmSyncModule,
    // #4189 — le worker relit aussi les CRM à curseur (`CrmReadSyncService`) ; sans cet import Nest injecterait
    // `undefined` (@Optional) et la relecture ne ferait rien en silence (GA-365).
    CrmModule,
    WorkspaceModule,
    AgendaModule,
  ],
  controllers: [IntegrationSyncController],
  providers: [IntegrationSyncService, IntegrationSyncWorker],
  exports: [IntegrationSyncService],
})
export class IntegrationSyncModule {}
