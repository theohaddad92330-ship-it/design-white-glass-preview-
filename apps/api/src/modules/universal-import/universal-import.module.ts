import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { PersonalContactEntity } from '../../database/entities/personal-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import {
  UniversalImportIssueEntity,
  UniversalImportJobEntity,
} from '../../database/entities/universal-import-job.entity'
import { AccountsModule } from '../accounts/accounts.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { StorageModule } from '../storage/storage.module'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ContextPackController } from './context-pack.controller'
import { ContextPackHistoryService } from './context-pack-history.service'
import { ContextPackOriginalsModule } from './context-pack-originals.module'
import { ContextPackImportEntity } from '../../database/entities/context-pack-import.entity'
import { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import { ImportOverviewForLauraService } from './import-overview-for-laura.service'
import { UniversalImportController } from './universal-import.controller'
import { UNIVERSAL_IMPORT_WORKSPACE_PORT, UniversalImportGateway } from './universal-import.gateway'
import { UNIVERSAL_IMPORT_QUEUE } from './universal-import.queue'
import { UniversalImportService } from './universal-import.service'
import { UniversalImportWorker } from './universal-import.worker'

/**
 * L'IMPORT UNIVERSEL (Louis 27/09/2026) — n'importe quel nombre de lignes,
 * n'importe quel type déclaré au registre (`@bellum/contracts`,
 * `UNIVERSAL_IMPORT_REGISTRY`).
 *
 * Craft rule n°7 : le retirer ne casse rien — personne n'importe ce module ;
 * l'assistant `/import` et l'ancien import de la fiche compte vivent ailleurs.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: UNIVERSAL_IMPORT_QUEUE }),
    TypeOrmModule.forFeature([
      UniversalImportJobEntity,
      UniversalImportIssueEntity,
      ContextPackImportEntity,
      CvBatchImportJobEntity,
      AccountEntity,
      ContactEntity,
      PersonalContactEntity,
      ProjectNeedEntity,
      ConsultantEntity,
      // #4052.2 — LA notion de référence source de l'espace, partagée avec les connecteurs CRM.
      SyncLinkEntity,
    ]),
    StorageModule,
    // #4573 — l'original d'un import de pack (seau privé, URL signée, effacement RGPD).
    ContextPackOriginalsModule,
    WorkspaceModule,
    BusinessUnitModule,
    AccountsModule,
  ],
  // import-contexte Je.2 — le routeur du pack de contexte : il classe, l'import reste aux importeurs existants.
  controllers: [UniversalImportController, ContextPackController],
  providers: [
    UniversalImportService,
    ContextPackHistoryService,
    ImportOverviewForLauraService,
    UniversalImportGateway,
    UniversalImportWorker,
    { provide: UNIVERSAL_IMPORT_WORKSPACE_PORT, useExisting: WorkspaceContextService },
  ],
  // #4426.8 — Laura (pont) lit les mêmes imports que l'écran d'historique.
  exports: [ImportOverviewForLauraService],
})
export class UniversalImportModule {}
