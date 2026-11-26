import { Module } from '@nestjs/common'
import { ConnectorScopeGapsModule } from '../connector-scope-gaps/connector-scope-gaps.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ZohoController } from './zoho.controller'
import { ZohoService } from './zoho.service'
import { CrmFirstImportModule } from '../crm-first-import/crm-first-import.module'

/**
 * #4187 — Zoho CRM. Module autonome (le retirer ne casse rien) : réutilise la
 * table partagée `crm_connections` (provider = 'zoho') et le crypto CRM ; le
 * `api_domain` rendu par le token vit dans `instance_url`. Inerte tant que
 * ZOHO_* n'est pas configuré.
 */
@Module({
  imports: [
    ConnectorScopeGapsModule,
    // SYNC-B — la première reprise part au branchement.
    CrmFirstImportModule,
    PlanFeaturesModule,
    WorkspaceModule,
    TypeOrmModule.forFeature([CrmConnectionEntity, UserActionEntity]),
  ],
  controllers: [ZohoController],
  providers: [ZohoService],
  exports: [ZohoService],
})
export class ZohoModule {}
