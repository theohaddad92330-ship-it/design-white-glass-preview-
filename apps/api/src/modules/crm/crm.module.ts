import { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import { OutboundWriteService } from './outbound-write.service'
import { Module } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { ConnectorScopeGapsModule } from '../connector-scope-gaps/connector-scope-gaps.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { CrmPipelineSyncEntity } from '../../database/entities/crm-pipeline-sync.entity'
import { AttioModule } from '../attio/attio.module'
import { MailerModule } from '../mailer/mailer.module'
import { OdooModule } from '../odoo/odoo.module'
import { PipedriveModule } from '../pipedrive/pipedrive.module'
import { SalesforceModule } from '../salesforce/salesforce.module'
import { ZohoModule } from '../zoho/zoho.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CRM_MIRROR_SYNC } from '../crm-mirror/crm-mirror.port'
import { lazyCrmMirrorSync } from './crm-mirror-lazy'
import { CrmMirrorReadModule } from '../crm-mirror/crm-mirror-read.module'
import { CrmFirstImportModule } from '../crm-first-import/crm-first-import.module'
import { CrmFirstImportRunner } from './crm-first-import.runner'
import { CrmFirstImportWorker } from './crm-first-import.worker'
import { CrmDepthService } from './crm-depth.service'
import { CrmImportController } from './crm-import.controller'
import { CrmImportService } from './crm-import.service'
import { CrmReadSyncService } from './crm-read-sync.service'
import { CrmDisappearedArchiver } from './crm-disappeared-archiver'
import { CrmDealFactsHarvester } from './crm-deal-facts-harvest'
import { CrmProviderReadController } from './crm-provider-read.controller'
import { CrmSyncCursorEntity } from '../../database/entities/crm-sync-cursor.entity'
import { CrmReadService } from './crm-read.service'
import { CrmTaskService } from './crm-task.service'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { CrmWriteService } from './crm-write.service'
import { CrmPushService } from './crm-push.service'
import { CrmController } from './crm.controller'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { CrmService } from './crm.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { SyncRunEntity } from '../../database/entities/sync-run.entity'
import { SyncRecordEventEntity } from '../../database/entities/sync-record-event.entity'
import { LocksModule } from '../locks/locks.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { CrmDealAccountLinker } from './crm-deal-account-linker'
import { CrmAccountSignalsService } from './crm-account-signals.service'
import {
  CRM_DEAL_SIGNALS_NOTIFY,
  CRM_DEAL_SIGNALS_RECORD,
  CRM_DEAL_SIGNALS_RUN_LOCKED,
  CrmDealSignalsSweeper,
} from './crm-deal-signals.sweeper'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { NotificationsService } from '../notifications/notifications.service'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'

/**
 * HubSpot CRM integration + the provider-agnostic presence read-back
 * (CrmReadService) and besoin→task export (CrmTaskService). The other CRM
 * modules are imported so those two provider-agnostic services can ask whichever
 * CRM the workspace connected; the dependency is one-way — none of them import
 * us, so there is no cycle.
 */
@Module({
  imports: [
    ConnectorScopeGapsModule,
    // Gating par offre : l'export CRM demande la feature `crm_sync`.
    PlanFeaturesModule,
    WorkspaceModule,
    CrmMirrorReadModule,
    // SYNC-B — la file de première reprise (le travailleur vit ici).
    CrmFirstImportModule,
    SalesforceModule,
    PipedriveModule,
    AttioModule,
    // #4185 — Odoo porte l'adaptateur CRM commun comme les quatre autres.
    OdooModule,
    // #4187 — Zoho CRM : un adaptateur de plus dans le registre.
    ZohoModule,
    // Le double contrôle de désabonnement avant d'inscrire dans une séquence
    // tierce : celui du fournisseur ET le nôtre.
    MailerModule,
    // La provenance : un champ importé arrive en `connector`, que l'arbitre place
    // SOUS `human` — c'est ce qui fait survivre une correction manuelle à tous
    // les imports suivants, et donc ce qui rend la cohabitation tenable.
    CrmCoreModule,
    // #3918 — le verrou singleton du cron quotidien et le registre canonique
    // des déclencheurs (`CrmDealSignalsSweeper`).
    LocksModule,
    TriggerRegistryModule,
    // #3920.crm — la cloche « nouveau signal » pour les signaux CRM neufs.
    NotificationsCoreModule,
    TypeOrmModule.forFeature([
      CrmConnectionEntity,
      UserActionEntity,
      AccountEntity,
      ContactEntity,
      ProfileEntity,
      CrmDealFactEntity,
      CrmPipelineSyncEntity,
      SyncLinkEntity,
      OutboundWriteRequestEntity,
      SyncRunEntity,
      SyncRecordEventEntity,
      CrmSyncCursorEntity,
    ]),
  ],
  controllers: [CrmController, CrmImportController, CrmProviderReadController],
  providers: [
    OutboundWriteService,
    CrmService,
    CrmReadService,
    CrmTaskService,
    CrmDepthService,
    CrmImportService,
    // #3918.8 — affaires Pipedrive / Odoo → `crm_deal_facts` → mêmes règles de signaux.
    CrmDealFactsHarvester,
    // #4189 — la synchro incrémentale des CRM qui relisent par l'adaptateur commun.
    CrmReadSyncService,
    CrmFirstImportRunner,
    CrmFirstImportWorker,
    CrmDisappearedArchiver,
    // #4185 — le registre des adaptateurs CRM (un par fournisseur du contrat).
    CrmAdapterRegistry,
    // #4186 — la porte commune : toute écriture CRM, tous fournisseurs.
    CrmWriteService,
    // #4188 — envoyer un compte et ses contacts vers le CRM branché.
    CrmPushService,
    CrmDealSignalsSweeper,
    // #3918.a — la jointure deal CRM → compte (id société, SIREN, domaine).
    CrmDealAccountLinker,
    // #3918.b — le lecteur des signaux CRM d'un compte (veille).
    CrmAccountSignalsService,
    // Le miroir SYNC-A (reprise, passe nocturne) : résolu à l'appel, car `CrmMirrorModule` importe ce module.
    { provide: CRM_MIRROR_SYNC, inject: [ModuleRef], useFactory: lazyCrmMirrorSync },
    {
      provide: CRM_DEAL_SIGNALS_RUN_LOCKED,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory: (locks?: SingletonLockService) => (name: string, fn: () => Promise<void>) =>
        withSingletonLock(locks, name, fn),
    },
    {
      provide: CRM_DEAL_SIGNALS_NOTIFY,
      inject: [{ token: NotificationsService, optional: true }],
      useFactory: (notifications?: NotificationsService) =>
        notifications
          ? (accountId: string, evidences: readonly string[]) =>
              notifications.notifyCrmSignalsForAccount(accountId, evidences)
          : undefined,
    },
    {
      provide: CRM_DEAL_SIGNALS_RECORD,
      inject: [{ token: TriggerRegistryService, optional: true }],
      useFactory: (triggers?: TriggerRegistryService) =>
        triggers
          ? (...args: Parameters<TriggerRegistryService['recordOnce']>) => triggers.recordOnce(...args)
          : undefined,
    },
  ],
  // `OutboundWriteService` — #1931 L2 (D9) : le routeur d'actions fait passer
  // Salesforce, Pipedrive et Attio par la MÊME porte BEL-INT-603 que HubSpot.
  exports: [
    CrmService,
    CrmReadService,
    CrmTaskService,
    CrmDepthService,
    CrmImportService,
    CrmReadSyncService,
    OutboundWriteService,
    CrmAdapterRegistry,
    CrmWriteService,
  ],
})
export class CrmModule {}
