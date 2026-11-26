import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TelephonyCallLogEntity } from '../../database/entities/telephony-call-log.entity'
import { TelephonyCallStateEntity } from '../../database/entities/telephony-call-state.entity'
import { TelephonyConnectionEntity } from '../../database/entities/telephony-connection.entity'
import { CrmModule } from '../crm/crm.module'
import { IaModule } from '../ia/ia.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { TelephonyController } from './telephony.controller'
import { TelephonyService } from './telephony.service'
import { TelephonyWebhookController } from './telephony-webhook.controller'

/**
 * Module autonome (règle #7) : le retirer ne casse rien d'autre. Il importe le
 * CRM pour verser ses notes, mais rien n'importe la téléphonie.
 *
 * #2403.12 — `TelephonyWebhookController` (la source « appel en cours ») vit
 * ICI plutôt que dans `laura` : c'est une capacité de la téléphonie
 * elle-même (comme le journal d'appels), Laura ne fait que LIRE l'état
 * qu'il pose (`TelephonyService.isCallInProgress`, injecté en `@Optional()`
 * côté `LauraController` — retirer ce module n'empêche pas Laura de
 * fonctionner, elle perd juste cette source).
 */
@Module({
  imports: [
    WorkspaceModule,
    CrmModule,
    IaModule,
    TypeOrmModule.forFeature([TelephonyConnectionEntity, TelephonyCallLogEntity, TelephonyCallStateEntity]),
  ],
  controllers: [TelephonyController, TelephonyWebhookController],
  providers: [TelephonyService],
  exports: [TelephonyService],
})
export class TelephonyModule {}
