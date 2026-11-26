import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { AgendaModule } from '../agenda/agenda.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { TelephonyModule } from '../telephony/telephony.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { LauraController } from './laura.controller'
import { NeedsHistoryModule } from './needs-history.module'
import { LauraAcceptanceService } from './laura-acceptance.service'
import { LauraAnalyticsService } from './laura-analytics.service'
import { LauraProbeService } from './laura-probe.service'
import { LauraService } from './laura.service'

/**
 * Laura Produit. Module autonome (règle #7) : le retirer fait disparaître la
 * couche proactive sans toucher au copilote, qui continue de répondre aux
 * questions qu'on lui pose.
 *
 * C'est la lecture concrète de D44 — Laura est une SURCOUCHE, pas un second
 * moteur. Elle ajoute « parler en premier » ; elle ne remplace pas « répondre ».
 */
@Module({
  imports: [
    // #2403.33 — `UserActionEntity` : le journal d'actions que `LauraService`
    // lit pour « déjà traité ailleurs » (CRM branché compris, qui y écrit
    // déjà — `export`, `crm_task_created`…). Un repository, pas un service
    // voisin : GA-07 ne compte que les imports service → service.
    TypeOrmModule.forFeature([LauraInterventionEntity, NotificationPreferenceEntity, UserActionEntity]),
    WorkspaceModule,
    // #2403.13 — la variante conforme du "aucune intervention pendant une
    // réunion" : lit l'agenda déjà synchronisé (`LauraController.meetingInProgress`),
    // au même titre que `BriefingModule` juste à côté.
    AgendaModule,
    // #2406.35 — les paliers ouverts sur l'espace, pour ne jamais candidater une
    // intervention dont la route est verrouillée par le palier.
    PlanFeaturesModule,
    // #2403.38 — `ProvenanceService.lastHumanCorrectionAt` : l'invalidation
    // d'une suggestion sur correction humaine lit le MÊME journal que le CRM
    // natif, jamais une seconde source qui finirait par diverger (GA-26).
    CrmCoreModule,
    // #2403.12 — la source « appel en cours » (webhook signé, état par
    // utilisateur). `LauraController` la lit en `@Optional()` : retirer ce
    // module (règle #7) fait retomber Laura sur l'agenda seul (#2403.13),
    // jamais une erreur.
    TelephonyModule,
    // #4759 — l'outil de requête de Laura sur l'historique des besoins (sa route `internal/copilot`).
    NeedsHistoryModule,
  ],
  controllers: [LauraController],
  providers: [LauraService, LauraProbeService, LauraAcceptanceService, LauraAnalyticsService],
  // `LauraAcceptanceService` et `LauraAnalyticsService` exportées : elles
  // MESURENT (D643-D648 pour la première, #2403.40-.47 pour la seconde), un
  // futur consommateur (panneau back-office) est prévisible sans qu'il existe
  // encore.
  exports: [LauraService, LauraProbeService, LauraAcceptanceService, LauraAnalyticsService],
})
export class LauraModule {}
