import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { UserLastSeenEntity } from '../../database/entities/user-last-seen.entity'
import { SprintsModule } from '../sprints/sprints.module'
import { AccountFactsModule } from '../account-facts/account-facts.module'
import { TeamNotificationsModule } from '../notifications/team/team-notifications.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ActionsController } from './actions.controller'
import { ActionsService } from './actions.service'
import { ActionPlanItemsService } from './action-plan-items.service'
import { LastSeenService } from './last-seen.service'
import { PlanItemsController } from './plan-items.controller'
import { MethodRuleOutcomesService } from './method-rule-outcomes.service'
import { WorkspaceMethodRuleEntity } from '../../database/entities/workspace-method-rule.entity'
import { PlanItemContactBackfillController } from './plan-item-contact-backfill.controller'
import { PlanItemContactBackfillService } from './plan-item-contact-backfill.service'
import { SendTimingService } from './send-timing.service'

@Module({
  imports: [
    WorkspaceModule,
    // #4158.16 — la délégation d'une action prévient le délégataire.
    TeamNotificationsModule,
    // #4072.2 — le lecteur unique des faits du compte (historique des relances).
    AccountFactsModule,
    // #3416.4 — le bus du board du compte (l'issue d'une action le fait avancer).
    SprintsModule,
    TypeOrmModule.forFeature([
      UserActionEntity,
      // #3416.2b — la relance datée d'une issue « à rappeler » (écriture d'UNE tâche).
      TaskEntity,
      ActionPlanItemEntity,
      // #3295 — lecture seule : la règle apprise citée par une action.
      WorkspaceMethodRuleEntity,
      ActionPlanEntity,
      AccountEntity,
      ContactEntity,
      // Read-only here: the Historique resolves what became of a launched
      // analysis from the run's own state instead of asserting it.
      AnalysisRunEntity,
      // §8 « Historique » : le repère « depuis ma dernière connexion ».
      UserLastSeenEntity,
      // #3289 — lecture seule : le fuseau de l'espace pour le timing appris.
      WorkspaceEntity,
    ]),
  ],
  controllers: [ActionsController, PlanItemsController, PlanItemContactBackfillController],
  providers: [
    ActionsService,
    ActionPlanItemsService,
    PlanItemContactBackfillService,
    LastSeenService,
    SendTimingService,
    MethodRuleOutcomesService,
  ],
  exports: [ActionsService, ActionPlanItemsService, SendTimingService, MethodRuleOutcomesService],
})
export class ActionsModule {}
