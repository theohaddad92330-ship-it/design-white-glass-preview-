import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ExternalSourcingPartnerBriefEntity } from '../../database/entities/external-sourcing-partner-brief.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { MultiSourceSearchJobEntity } from '../../database/entities/multi-source-search-job.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ExternalSourcingController } from './external-sourcing.controller'
import { ExternalSourcingService } from './external-sourcing.service'
import { MultiSourceSearchService } from './multi-source-search.service'
import { MultiSourceSearchWorker } from './multi-source-search.worker'
import { MultiSourceSearchGateway } from './multi-source-search.gateway'
import { MULTI_SOURCE_SEARCH_QUEUE } from './multi-source-search.queue'

/**
 * Sourcing externe de consultants (#2818). Module autonome (règle #7) : le
 * retirer fait disparaître « Chercher hors vivier », son import et le circuit
 * partenaire (le brief se prépare, il ne s'envoie jamais), jamais le reste des
 * besoins.
 */
@Module({
  imports: [
    PlanFeaturesModule,
    TypeOrmModule.forFeature([
      ConsultantEntity,
      ProjectNeedEntity,
      ExternalSourcingPartnerBriefEntity,
      // #1952.7 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur async de la recherche multi-sources.
      MultiSourceSearchJobEntity,
    ]),
    WorkspaceModule,
    // Un job par lot de recherche multi-sources.
    BullModule.registerQueue({ name: MULTI_SOURCE_SEARCH_QUEUE }),
  ],
  controllers: [ExternalSourcingController],
  providers: [ExternalSourcingService, MultiSourceSearchService, MultiSourceSearchWorker, MultiSourceSearchGateway],
  exports: [ExternalSourcingService],
})
export class ExternalSourcingModule {}
