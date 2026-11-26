import { Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { ActionsModule } from '../actions/actions.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CockpitPerspectiveService } from './cockpit-perspective.service'
import { DashboardController } from './dashboard.controller'
import { PersonalCockpitService } from './personal-cockpit.service'
import { MarketMemoryModule } from '../market-memory/market-memory.module'

/**
 * #1457 — `DashboardService` et `DashboardRoiService` servaient les deux routes
 * d'ÉQUIPE de ce module (`kpis`, `roi`), retirées avec l'onglet « Équipe » de
 * `/dashboard`. Leurs dépendances partent avec eux : `ContactsModule` et
 * `AnalysisModule` n'étaient importés que pour eux, et le dépôt `ContactEntity`
 * ne servait qu'à l'entonnoir du ROI.
 */
@Module({
  imports: [MarketMemoryModule, AccountsModule, ActionsModule, WorkspaceModule],
  controllers: [DashboardController],
  providers: [PersonalCockpitService, CockpitPerspectiveService],
})
export class DashboardModule {}
