import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { PartnerCvPushEntity } from '../../database/entities/partner-cv-push.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PartnerCvPushController } from './partner-cv-push.controller'
import { PartnerCvPushService } from './partner-cv-push.service'

/**
 * #2887 (#2371.8) — module autonome (craft rule #7), voir le docblock du
 * contrôleur pour la raison de la séparation d'avec `PartnerPipelineModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PartnerCvPushEntity, ConsultantEntity, PartnerRelationEntity]), WorkspaceModule],
  controllers: [PartnerCvPushController],
  providers: [PartnerCvPushService],
  exports: [PartnerCvPushService],
})
export class PartnerCvPushModule {}
