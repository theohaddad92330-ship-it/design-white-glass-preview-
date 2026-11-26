import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { CrmFirstImportEnqueuer } from './crm-first-import.enqueuer'
import { CRM_FIRST_IMPORT_JOB_OPTIONS, CRM_FIRST_IMPORT_QUEUE } from './crm-first-import.queue'

/**
 * SYNC-B — la file de première reprise. Module feuille (aucune dépendance applicative) : les modules
 * de chaque CRM l'importent sans cycle avec `CrmModule`, qui porte le travailleur.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: CRM_FIRST_IMPORT_QUEUE, defaultJobOptions: CRM_FIRST_IMPORT_JOB_OPTIONS }),
  ],
  providers: [CrmFirstImportEnqueuer],
  exports: [CrmFirstImportEnqueuer],
})
export class CrmFirstImportModule {}
