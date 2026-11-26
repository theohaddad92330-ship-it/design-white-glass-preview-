import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ObjectiveProposalEntity } from '../../database/entities/objective-proposal.entity'
import { ObjectiveProposalsService } from './objective-proposals.service'
import { ObjectivesController } from './objectives.controller'
import { ObjectivesService } from './objectives.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'

/**
 * Objectif commercial chiffré par membre (cockpit manager §10). Module autonome
 * (règle #7) : le retirer supprime `/objectives/*` sans toucher au reste. Réutilise
 * `WorkspaceContextService` pour le scope workspace + le gate manager.
 */
@Module({
  imports: [
    // Gating par offre : les objectifs demandent la feature `manager_cockpit`.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([MemberObjectiveEntity, ObjectiveProposalEntity]),
    WorkspaceModule,
  ],
  controllers: [ObjectivesController],
  providers: [ObjectivesService, ObjectiveProposalsService],
})
export class ObjectivesModule {}
