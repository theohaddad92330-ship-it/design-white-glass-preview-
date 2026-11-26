import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import {
  CrmActivityEntity,
  CrmDealEntity,
  CrmOwnerEntity,
  CrmPipelineEntity,
  CrmStageEntity,
} from '../../database/entities/crm-mirror.entity'
import { CrmModule } from '../crm/crm.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CRM_MIRROR_SYNC, CRM_MIRROR_SYNC_TARGET } from './crm-mirror.port'
import { CrmMirrorController } from './crm-mirror.controller'
import { CrmMirrorReadModule } from './crm-mirror-read.module'
import { CrmMirrorService } from './crm-mirror.service'
import { CRM_MIRROR_STORE, SqlCrmMirrorStore } from './crm-mirror.store'

/**
 * SYNC-A — le MIROIR CRM (affaires, activités, propriétaires, pipelines du CRM branché).
 *
 * Module autonome (règle CLAUDE n°7) : le retirer laisse les lecteurs sur l'appel direct au
 * fournisseur (ils l'injectent en `@Optional()`), et la reprise / la synchro fréquente sans miroir
 * (`@Optional() @Inject(CRM_MIRROR_SYNC)`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CrmConnectionEntity,
      CrmOwnerEntity,
      CrmPipelineEntity,
      CrmStageEntity,
      CrmDealEntity,
      CrmActivityEntity,
    ]),
    CrmModule,
    WorkspaceModule,
    CrmMirrorReadModule,
  ],
  controllers: [CrmMirrorController],
  providers: [
    { provide: CRM_MIRROR_STORE, useClass: SqlCrmMirrorStore },
    CrmMirrorService,
    { provide: CRM_MIRROR_SYNC, useExisting: CrmMirrorService },
    { provide: CRM_MIRROR_SYNC_TARGET, useExisting: CrmMirrorService },
  ],
  exports: [CRM_MIRROR_SYNC, CRM_MIRROR_SYNC_TARGET, CrmMirrorService, CrmMirrorReadModule],
})
export class CrmMirrorModule {}
