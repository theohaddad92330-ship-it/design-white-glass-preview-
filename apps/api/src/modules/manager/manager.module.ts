import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TeamReviewEntity } from '../../database/entities/team-review.entity'
import { ActionsModule } from '../actions/actions.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ManagerController } from './manager.controller'
import { ManagerService } from './manager.service'
import { ManagerMembersController } from './manager-members.controller'
import { ManagerTeamViewsService } from './manager-team-views.service'
import { ManagerMemberService } from './manager-member.service'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { LocksModule } from '../locks/locks.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { TeamNotificationsModule } from '../notifications/team/team-notifications.module'
import { ManagerDigestScheduler } from './manager-digest.scheduler'
import { ManagerDigestService } from './manager-digest.service'
import { TeamReviewService } from './team-review.service'

// Aggregates over existing tables via the global DataSource (no forFeature
// needed) + reuses WorkspaceContextService for the workspace scope + role gate.
@Module({
  imports: [
    // Gating par offre : le cockpit demande la feature `manager_cockpit`.
    PlanFeaturesModule,
    WorkspaceModule,
    // #4158 (complément BU) — le périmètre BU du cockpit (`resolveBusinessUnitScope`).
    BusinessUnitModule,
    // #4158.28 — le digest hebdomadaire du manager : notification dans l'app, e-mail opt-in, verrou singleton.
    NotificationsCoreModule,
    TeamNotificationsModule,
    LocksModule,
    // Théo D team-review — les décisions du point d'équipe écrivent dans le plan des comptes.
    ActionsModule,
    TypeOrmModule.forFeature([TeamReviewEntity]),
  ],
  controllers: [ManagerController, ManagerMembersController],
  providers: [
    ManagerService,
    ManagerMemberService,
    ManagerTeamViewsService,
    ManagerDigestService,
    ManagerDigestScheduler,
    TeamReviewService,
  ],
})
export class ManagerModule {}
