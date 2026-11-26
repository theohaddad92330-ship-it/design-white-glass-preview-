import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { ToolLatencyObservationEntity } from '../../database/entities/tool-latency-observation.entity'
import { ContactStopModule } from '../contact-stop/contact-stop.module'
import { CrmModule } from '../crm/crm.module'
import { OutboundWriteService } from '../crm/outbound-write.service'
import { CrmMirrorModule } from '../crm-mirror/crm-mirror.module'
import { LocksModule } from '../locks/locks.module'
import { CRM_FREQUENT_SYNC_QUEUE } from './crm-frequent-sync.queue'
import { CrmFrequentSyncService } from './crm-frequent-sync.service'
import { CrmFrequentSyncWorker } from './crm-frequent-sync.worker'
import { CrmSyncScheduler } from './crm-sync.scheduler'
import { CRM_SYNC_WRITE_GATE, CrmSyncService } from './crm-sync.service'

/**
 * La synchronisation CRM dans les deux sens (§58, P1-07).
 *
 * Module autonome (règle CLAUDE n°7) : le retirer supprime le passage quotidien
 * et rien d'autre — la lecture à la demande, l'export manuel et l'adoption d'une
 * valeur continuent de fonctionner. C'est ce qui permet de le désactiver en
 * production sans amputer le produit.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ContactEntity, CrmConnectionEntity, ToolLatencyObservationEntity]),
    BullModule.registerQueue({ name: CRM_FREQUENT_SYNC_QUEUE }),
    CrmModule,
    // Intégration — la synchro fréquente alimente le miroir SYNC-A via CRM_MIRROR_SYNC (@Optional).
    CrmMirrorModule,
    LocksModule,
    ContactStopModule,
  ],
  providers: [
    CrmSyncService,
    CrmSyncScheduler,
    CrmFrequentSyncService,
    CrmFrequentSyncWorker,
    // #4714.3 — garde GA-07 : le module compose, le service ne va pas chercher le service d'un autre module
    { provide: CRM_SYNC_WRITE_GATE, useExisting: OutboundWriteService },
  ],
  exports: [CrmSyncService, CrmFrequentSyncService],
})
export class CrmSyncModule {}
