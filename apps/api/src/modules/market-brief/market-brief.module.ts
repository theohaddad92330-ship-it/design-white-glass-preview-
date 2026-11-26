import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { MarketZoneEntity } from '../../database/entities/market-zone.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SiteEntity } from '../../database/entities/site.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MarketBriefController } from './market-brief.controller'
import { MarketBriefService } from './market-brief.service'

/**
 * Capacité « Marchés locaux » (L1) — module autonome (Craft rule #7) : le retirer
 * coupe les zones et leur brief, sans rien casser d'autre. Il ne lit que ses tables
 * et celles de l'espace (comptes, sites, besoins, missions), jamais un autre service.
 */
@Module({
  imports: [
    WorkspaceModule,
    TypeOrmModule.forFeature([MarketZoneEntity, AccountEntity, SiteEntity, ProjectNeedEntity, MissionEntity]),
  ],
  controllers: [MarketBriefController],
  providers: [MarketBriefService],
  exports: [MarketBriefService],
})
export class MarketBriefModule {}
