import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SalesforceController } from './salesforce.controller'
import { SalesforceService } from './salesforce.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { CrmFirstImportModule } from '../crm-first-import/crm-first-import.module'

/**
 * Salesforce OAuth integration. Reuses the shared `crm_connections` table
 * (provider = 'salesforce') and the CRM token crypto — HubSpot lives in its own
 * module the same way. Inert until SALESFORCE_* env vars are configured.
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
  controllers: [SalesforceController],
  providers: [SalesforceService],
  exports: [SalesforceService],
})
export class SalesforceModule {}
