import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WorkspaceModule } from '../workspace/workspace.module'
import { WatchlistRuleEntity } from './watchlist-rule.entity'
import { WatchlistRulesController } from './watchlist-rules.controller'
import { WatchlistRulesService } from './watchlist-rules.service'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'

/**
 * Règles personnelles de veille (restitution V2 §11). Module autonome (règle #7)
 * — sa propre table `watchlist_rules`, aucun couplage. `WorkspaceModule` fournit
 * le résolveur de workspace actif (scoping = barrière de sécu). Le retirer
 * n'enlève que ce CRUD ; la Veille et le reste tournent inchangés.
 */
@Module({
  imports: [
    // Gating par offre : la Veille demande la feature `watchlist`.
    PlanFeaturesModule,
    WorkspaceModule,
    TypeOrmModule.forFeature([WatchlistRuleEntity]),
  ],
  controllers: [WatchlistRulesController],
  providers: [WatchlistRulesService],
  exports: [WatchlistRulesService],
})
export class WatchlistRulesModule {}
