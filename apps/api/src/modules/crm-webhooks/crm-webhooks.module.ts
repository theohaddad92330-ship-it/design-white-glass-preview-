import { Module } from '@nestjs/common'
import { CrmModule } from '../crm/crm.module'
import { CrmSyncModule } from '../crm-sync/crm-sync.module'
import { CrmWebhooksController } from './crm-webhooks.controller'
import { CrmWebhooksService } from './crm-webhooks.service'

/** #4189.7 — webhooks entrants HubSpot / Salesforce → synchro ciblée. Retirable sans rien casser (règle 7). */
@Module({
  imports: [CrmModule, CrmSyncModule],
  controllers: [CrmWebhooksController],
  providers: [CrmWebhooksService],
})
export class CrmWebhooksModule {}
