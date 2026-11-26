import { RoutineContentEntity } from './routine-content.entity'
import { RoutineBudgetCapEntity } from './routine-budget-cap.entity'
import { RoutinePreferenceEntity } from './routine-preference.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { AgendaModule } from '../agenda/agenda.module'
import { AtsModule } from '../ats/ats.module'
import { CapitalisationModule } from '../capitalisation/capitalisation.module'
import { CreditsModule } from '../credits/credits.module'
import { CrmModule } from '../crm/crm.module'
import { DeliveryModule } from '../delivery/delivery.module'
import { BriefingModule } from '../briefing/briefing.module'
import { LocksModule } from '../locks/locks.module'
import { MailboxModule } from '../mailbox/mailbox.module'
// `NotificationsModule` n'EXPORTE pas `NotificationsService` — c'est
// `NotificationsCoreModule` qui le fait. L'importer par son nom le plus évident
// compile, passe les tests unitaires (qui injectent un service mocké) et fait
// tomber le serveur au démarrage. C'est ce qui s'est produit : l'API de
// production a refusé de démarrer pendant plusieurs heures.
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ROUTINE_TRIGGER_RECORD, RoutineExecutors } from './routine-executors'
import { BackofficeAlertDispatchService } from '../backoffice-alerts/backoffice-alert-dispatch.service'
import { EGRESS_IP_ALERT, EgressIpProbe, type EgressIpAlert } from './egress-ip-probe'
import { RoutinesController } from './routines.controller'
import { RoutinesBackofficeController } from './routines-backoffice.controller'
import { RoutinesScheduler } from './routines.scheduler'
import { RoutinesService } from './routines.service'
import { CrmRoutinesService } from './crm-routines.service'
import { EMPLOYMENT_RECHECK_QUEUE } from './employment-check'
import { EmploymentRecheckWorker } from './employment-recheck.worker'
import { TalentRoutinesService } from './talent-routines.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { TerritorySubscriptionEntity } from '../../database/entities/territory-subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ZeroLayerModule } from '../zero-layer/zero-layer.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'

/**
 * Le moteur de routines. Module autonome (règle #7) : deux tables à lui, aucune
 * dépendance métier au-delà des capacités qu'il orchestre — le retirer supprime
 * les automatisations programmées et rien d'autre.
 */
@Module({
  imports: [
    AgendaModule,
    AtsModule,
    // #2398.5 — le rappel de REX en attente lit `CapitalisationService`
    // (`rexForWorkspace`), déjà exporté par ce module pour l'onglet Preuves &
    // REX d'un compte.
    CapitalisationModule,
    // #2205.42/#2205.61 — le solde d'enrichissement (`hasEnrichmentCredit`,
    // lecture SANS DÉBIT), pour que `noReplyFollowUp` refuse un appel modèle
    // payé avant de le faire, plutôt qu'après. Sans cette ligne, l'injection
    // échoue au DÉMARRAGE (GA-20) — aucun test unitaire ne le voit, ils
    // construisent l'exécuteur par position.
    CreditsModule,
    CrmModule,
    // Les trois routines du PDF 5 (relevés manquants, facturation bloquée,
    // marges sous le seuil). Sens unique : Delivery ne nous importe pas.
    DeliveryModule,
    BriefingModule,
    MailboxModule,
    NotificationsCoreModule,
    LocksModule,
    WorkspaceModule,
    // ⚠️ `TerritorySnapshotEntity` et `TerritorySubscriptionEntity` sont ici
    // parce que `RoutineExecutors` les injecte : la veille territoriale lit le
    // SCHÉMA plutôt que le service du module voisin (GA-07 est au plafond).
    // Oublier de les déclarer ne casse AUCUN test — les tests unitaires
    // construisent l'exécuteur à la main — et empêche l'API de démarrer en
    // production. C'est la deuxième fois : voir le correctif du 22/08.
    // ⚠️ `ConsultantEntity` est ici parce que `TalentRoutinesService` l'injecte
    // pour lire le SCHÉMA du vivier (disponibilités à reconfirmer). Même piège
    // que ci-dessus : l'oublier ne casse aucun test unitaire et empêche l'API
    // de démarrer en production.
    // ⚠️ `OutreachSequenceEntity` (épopée #2873, #2367.14) — même piège :
    // `RoutineExecutors` l'injecte pour lire le SCHÉMA des séquences
    // `completed` (§3.2, sens unique : `outreach` ne nous importe pas).
    // ⚠️ `UserActionEntity` (#2390.18, épopée #2926) — même piège : la
    // fermeture en cascade du rappel/événement lié à un rendez-vous annulé
    // lit et réécrit le journal d'activité partagé (`user_actions`), pas un
    // service du module `action-router`.
    TypeOrmModule.forFeature([
      RoutineSubscriptionEntity,
      RoutineRunEntity,
      AccountEntity,
      ConsultantEntity,
      TerritorySnapshotEntity,
      TerritorySubscriptionEntity,
      OutreachSequenceEntity,
      UserActionEntity,
      // #2843.29 — le type d'espace (profil canonique), lu par `RoutinesService.profileOf`.
      EsnProfileEntity,
      // #2843.13 — autonomie et owner réglés par l'utilisateur.
      RoutinePreferenceEntity,
      // #2843.19 — plafond de coût par routine, réglé au back-office seul.
      RoutineBudgetCapEntity,
      // #2843.30 — le contenu (gabarit) d'une routine, par espace.
      RoutineContentEntity,
    ]),
    // La surveillance de l'espace documentaire (D17) réutilise la couche zéro,
    // qui sait déjà interroger Drive et OneDrive avec leurs gardes de portée.
    ZeroLayerModule,
    // #3918.2 (lot M01) — le registre canonique des déclencheurs : `contact_job_change`
    // y consigne chaque contact repéré (`contact_changement_poste`), par le port ci-dessous.
    TriggerRegistryModule,
    // #4286.13 — la relecture d'employeur demandée par l'ouverture d'une fiche (enfilée côté contacts, exécutée ici).
    BullModule.registerQueue({ name: EMPLOYMENT_RECHECK_QUEUE }),
  ],
  controllers: [RoutinesController, RoutinesBackofficeController],
  providers: [
    RoutinesService,
    RoutineExecutors,
    RoutinesScheduler,
    CrmRoutinesService,
    TalentRoutinesService,
    EmploymentRecheckWorker,
    // #4694 — `BackofficeAlertsModule` n'exporte pas son dispatcheur : fourni ici, comme `DemoModule`, et passé à la sonde
    // par jeton (GA-07). Sans état hors Redis/env, une instance de plus ne divise rien.
    BackofficeAlertDispatchService,
    { provide: EGRESS_IP_ALERT, useExisting: BackofficeAlertDispatchService },
    {
      provide: EgressIpProbe,
      inject: [{ token: EGRESS_IP_ALERT, optional: true }],
      useFactory: (alerts?: EgressIpAlert) =>
        new EgressIpProbe({ declared: process.env['BOONDMANAGER_DECLARED_EGRESS_IPS'], fetchImpl: fetch, alerts }),
    },
    {
      provide: ROUTINE_TRIGGER_RECORD,
      inject: [{ token: TriggerRegistryService, optional: true }],
      useFactory: (triggers?: TriggerRegistryService) =>
        triggers
          ? (...args: Parameters<TriggerRegistryService['recordOnce']>) => triggers.recordOnce(...args)
          : undefined,
    },
  ],
  exports: [RoutinesService],
})
export class RoutinesModule {}
