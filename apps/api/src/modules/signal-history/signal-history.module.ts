import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SignalHistoryEntity } from '../../database/entities/signal-history.entity'
import { ActionsModule } from '../actions/actions.module'
import { ActivitiesModule } from '../activities/activities.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SignalHistoryController } from './signal-history.controller'
import { SignalHistoryService } from './signal-history.service'

/**
 * Historique de signal (restitution V2 §11 + l'objet `Signal` du §20). Module
 * autonome (règle #7) : le retirer fait disparaître l'historisation, les dates
 * « détecté le … », l'importance et le lien vers l'action déclenchée, sans rien
 * casser d'autre — la Veille continue de lister les signaux courants
 * (l'injection dans `AccountsService` est `@Optional()`).
 *
 * `ActionsModule` est importé en LECTURE de service : le lien signal → action
 * réutilise la checklist existante (`action_plan_items`) plutôt que d'inventer
 * un second type d'action.
 *
 * `ActivitiesModule` (#2695) : une action créée depuis un signal laisse une
 * trace dans la MÊME timeline que le reste du produit (`kind: 'task'`), pour
 * qu'Historique et Actions exécutées la voient sans écran ni requête à part.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SignalHistoryEntity]), ActionsModule, ActivitiesModule, WorkspaceModule],
  controllers: [SignalHistoryController],
  providers: [SignalHistoryService],
  exports: [SignalHistoryService],
})
export class SignalHistoryModule {}
