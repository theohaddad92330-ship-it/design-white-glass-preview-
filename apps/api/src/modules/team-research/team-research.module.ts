import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TeamResearchEntryEntity } from '../../database/entities/team-research-entry.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { TeamResearchController } from './team-research.controller'
import { TeamResearchService } from './team-research.service'

/** Équipe › Recherches. Module autonome (règle #7) : le retirer supprime `/team-research` et rien d'autre. */
@Module({
  imports: [PlanFeaturesModule, TypeOrmModule.forFeature([TeamResearchEntryEntity]), WorkspaceModule],
  controllers: [TeamResearchController],
  providers: [TeamResearchService],
})
export class TeamResearchModule {}
