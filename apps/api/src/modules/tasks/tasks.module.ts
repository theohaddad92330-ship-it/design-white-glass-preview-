import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TaskEntity } from '../../database/entities/task.entity'
import { ActivitiesModule } from '../activities/activities.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountValidationRequestController } from './account-validation-request.controller'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

/**
 * Les TÂCHES (T3 du chantier CRM/ATS).
 *
 * Module autonome (règle #7) : le retirer supprime les tâches et le bloc
 * correspondant du brief, sans toucher au reste. Il importe les activités pour
 * qu'une tâche cochée laisse une trace dans l'historique — la dépendance va
 * dans ce sens et jamais dans l'autre.
 *
 * `TasksService` est EXPORTÉ parce que le brief du jour le lit : la vue
 * « Aujourd'hui » réunit tâches, rendez-vous et relances, et une seconde
 * requête écrite à part finirait par compter autrement.
 */
@Module({
  imports: [PlanFeaturesModule, WorkspaceModule, ActivitiesModule, TypeOrmModule.forFeature([TaskEntity])],
  controllers: [TasksController, AccountValidationRequestController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
