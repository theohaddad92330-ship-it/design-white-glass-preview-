import { Module } from '@nestjs/common'
import { ConnectorScopeGapsModule } from '../connector-scope-gaps/connector-scope-gaps.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PipedriveController } from './pipedrive.controller'
import { PipedriveService } from './pipedrive.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { CrmFirstImportModule } from '../crm-first-import/crm-first-import.module'

/**
 * Pipedrive OAuth integration. Reuses the shared `crm_connections` table
 * (provider = 'pipedrive') and the CRM token crypto — HubSpot and Salesforce
 * live in their own modules the same way. The per-company `api_domain` returned
 * at OAuth time is stored in `instance_url` (like Salesforce). Inert until
 * PIPEDRIVE_* env vars are configured.
 */
@Module({
  imports: [
    ConnectorScopeGapsModule,
    // SYNC-B — la première reprise part au branchement.
    CrmFirstImportModule,
    // Gating par offre : l'export CRM demande la feature `crm_sync`.
    PlanFeaturesModule,
    WorkspaceModule,
    TypeOrmModule.forFeature([CrmConnectionEntity, UserActionEntity]),
  ],
  controllers: [PipedriveController],
  providers: [PipedriveService],
  exports: [PipedriveService],
})
export class PipedriveModule {}
