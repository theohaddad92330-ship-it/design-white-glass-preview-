import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AttioController } from './attio.controller'
import { AttioService } from './attio.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { CrmFirstImportModule } from '../crm-first-import/crm-first-import.module'

/**
 * Attio OAuth integration. Reuses the shared `crm_connections` table
 * (provider = 'attio') and the CRM token crypto — HubSpot / Salesforce live in
 * their own modules the same way. Inert until ATTIO_* env vars are configured.
 */
@Module({
  imports: [
    // SYNC-B — la première reprise part au branchement.
    CrmFirstImportModule,
    // Gating par offre : l'export CRM demande la feature `crm_sync`.
    PlanFeaturesModule,
    WorkspaceModule,
    TypeOrmModule.forFeature([CrmConnectionEntity, UserActionEntity]),
  ],
  controllers: [AttioController],
  providers: [AttioService],
  exports: [AttioService],
})
export class AttioModule {}
