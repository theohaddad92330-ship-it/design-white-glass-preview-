import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { BusinessMetricSnapshotEntity } from '../../database/entities/business-metric-snapshot.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { MailerModule } from '../mailer/mailer.module'
import { MailerService } from '../mailer/mailer.service'
import { NotificationsController } from './notifications.controller'
import { TeamNotificationsModule } from './team/team-notifications.module'
import { NotificationsCoreModule } from './notifications-core.module'
import { NotificationsScheduler } from './notifications.scheduler'
import { WatchlistRuleEntity } from '../watchlist-rules/watchlist-rule.entity'
import { DailyDigestService } from './daily-digest.service'
import { WeeklyDigestService } from './weekly-digest.service'
import {
  OPS_WEEKLY_REPORT_LOCK,
  OPS_WEEKLY_REPORT_MAILER,
  OpsWeeklyReportService,
  type OpsWeeklyReportMailer,
  type UnderSingletonLock,
} from './ops-weekly-report.service'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AgendaModule } from '../agenda/agenda.module'
import { AgendaService } from '../agenda/agenda.service'
import { MailboxModule } from '../mailbox/mailbox.module'
import { MailboxService } from '../mailbox/mailbox.service'
import { MissionEntity } from '../../database/entities/mission.entity'
import {
  ENGAGEMENT_AGENDA_PORT,
  ENGAGEMENT_ALERTS_LOCK,
  ENGAGEMENT_MAILBOX_PORT,
  EngagementAlertsService,
} from './engagement-alerts.service'
import { SavedViewEntity } from '../../database/entities/saved-view.entity'
import { SMS_SENDER, type SmsSender } from './sms/sms-sender'
import {
  createDiscoverAlertGate,
  DISCOVER_ALERT_GATE,
  type DiscoverAlertGate,
} from './discover-alerts/discover-alert-gate'
import {
  createDiscoverAlertOutbound,
  DISCOVER_ALERT_OUTBOUND,
  type DiscoverAlertOutbound,
} from './discover-alerts/discover-alert-outbound'
import { DiscoverAlertEventSweeper } from './discover-alerts/discover-alert-event.sweeper'
import { DiscoverAlertEventEntity } from '../../database/entities/discover-alert-event.entity'
import { DiscoverAlertScheduler } from './discover-alerts/discover-alert.scheduler'
import { DiscoverAlertService } from './discover-alerts/discover-alert.service'
// #2444.10 — L'APPELANT de `notifyResolvedReports` : `FeedbackModule` exporte
// déjà `FeedbackService` pour exactement ce genre de site de déclenchement.
// Composé ICI (GA-07, *.module.ts n'est pas mesuré) derrière le PORT que le
// planificateur déclare — il n'importe jamais `FeedbackService` lui-même.
import { FeedbackModule } from '../feedback/feedback.module'
import { FeedbackService } from '../feedback/feedback.service'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import {
  FEEDBACK_RESOLUTION_LOCK,
  FEEDBACK_RESOLUTION_PORT,
  FeedbackResolutionScheduler,
} from './feedback-resolution.scheduler'

/**
 * Browser-facing notifications: the preferences + in-app centre HTTP surface
 * (via `NotificationsController`) and the periodic senders (weekly summary +
 * veille digest + relance reminders via `NotificationsScheduler`).
 * `NotificationsService` comes from `NotificationsCoreModule`; the mailer
 * (+ suppression list) + Profile repo are added here for the email paths, and
 * `ActionPlanItemEntity` for the overdue scan. The repo is bound directly (not
 * via ActionsModule) so this module stays self-contained.
 */
@Module({
  imports: [
    NotificationsCoreModule,
    // #4158.18 — l'entrée dérivée de la boîte (lue par le contrôleur).
    TeamNotificationsModule,
    MailerModule,
    // La marque et l'adresse d'expédition de l'espace (marque blanche,
    // 01/09/2026) : un digest part vers la boîte d'un utilisateur du client,
    // il doit porter l'expéditeur du client.
    WorkspaceModule,
    // Cron-tick lock for the two schedulers (multi-replica safety).
    LocksModule,
    // #2082.4/.5/.6 — les trois annonces d'engagement lisent l'agenda et la
    // messagerie de la personne. Les deux arrivent par des PORTS duck-typés
    // câblés ICI : `engagement-alerts.service.ts` n'importe aucun service d'un
    // autre module, et le cliquet GA-07 n'inspecte pas les `.module.ts`.
    AgendaModule,
    MailboxModule,
    // #2444.10 — `FeedbackService` (export de `FeedbackModule`) pour
    // `FeedbackResolutionScheduler` : le port `notify`, pas une injection
    // directe de `NotificationsService` dans `FeedbackModule` (GA-07).
    FeedbackModule,
    // #2875 (#2402.1, #2402.3) — le registre canonique, pour le huitième
    // émetteur migré (`besoin_entrant`, `DiscoverAlertEventSweeper`).
    TriggerRegistryModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      ProfileEntity,
      NotificationPreferenceEntity,
      ActionPlanItemEntity,
      // Règles perso de veille (§11) : le digest quotidien filtre par elles.
      WatchlistRuleEntity,
      // #1648 — lecture seule, pour le rapport hebdomadaire du back-office
      // (`OpsWeeklyReportService` : compte des analyses et dernier mois figé).
      AnalysisRunEntity,
      BusinessMetricSnapshotEntity,
      // 15/09/2026 — les recherches enregistrées de Découvrir portent la
      // cadence et le canal de leurs alertes ; l'émetteur les lit ici.
      SavedViewEntity,
      // #2151.14 — le balayage lit et écrit la table des événements. Le SERVICE
      // vient de `NotificationsCoreModule` (qui l'exporte) ; le dépôt TypeORM,
      // lui, ne traverse pas les modules : il se déclare là où il est injecté.
      DiscoverAlertEventEntity,
      // #2082.5 — les missions qui arrivent à leur terme. Dépôt seulement : le
      // balayage compte des dates de fin, il ne touche à aucune mission.
      MissionEntity,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsScheduler,
    // #2444.10 — L'APPELANT de `notifyResolvedReports` — sans lui, le calcul
    // reste juste et personne ne le déclenche jamais.
    FeedbackResolutionScheduler,
    // #2082.4/.5/.6 — l'ÉMETTEUR des trois annonces d'engagement, posé AVANT
    // les préférences qui le commandent. Un interrupteur sans émetteur promet
    // un envoi qui n'arrive jamais.
    EngagementAlertsService,
    { provide: ENGAGEMENT_AGENDA_PORT, useExisting: AgendaService },
    { provide: ENGAGEMENT_MAILBOX_PORT, useExisting: MailboxService },
    {
      // Le verrou de tick, en PORT : une seule réplique par passage, sans que
      // l'émetteur ait à connaître le service qui le pose.
      provide: ENGAGEMENT_ALERTS_LOCK,
      useFactory: (locks: SingletonLockService) => (name: string, run: () => Promise<void>) =>
        withSingletonLock(locks, name, run),
      inject: [SingletonLockService],
    },
    WeeklyDigestService,
    DailyDigestService,
    OpsWeeklyReportService,
    // 15/09/2026, décision 7 de Louis — les alertes de Découvrir : l'émetteur
    // et son APPELANT. Sans le second, le canal serait branché et rien ne
    // partirait quand même (le défaut n°1 du dépôt).
    DiscoverAlertService,
    DiscoverAlertScheduler,
    // #2151.14 / #2151.25 — le balayage qui fait APPARAÎTRE les événements.
    // Le registre lui-même vient de `NotificationsCoreModule`, qui l'exporte :
    // ses autres producteurs sont des sites de déclenchement hors de ce module.
    DiscoverAlertEventSweeper,
    {
      // L'interrupteur d'opérateur et la liste bornée, lus UNE fois au
      // démarrage — comme le port SMS. Un service qui relirait `process.env` à
      // chaque tour ferait dépendre un envoi de l'ordre des lectures.
      provide: DISCOVER_ALERT_GATE,
      useFactory: (): DiscoverAlertGate => createDiscoverAlertGate(process.env),
    },
    {
      // La composition se fait ICI (GA-07 est un cliquet AU PLAFOND) : le
      // service d'alerte ne peut pas importer `MailerService` sans faire monter
      // un module voisin. Même patron que `OPS_WEEKLY_REPORT_MAILER` au-dessus.
      provide: DISCOVER_ALERT_OUTBOUND,
      inject: [MailerService, SMS_SENDER],
      useFactory: (mailer: MailerService, sms: SmsSender): DiscoverAlertOutbound =>
        createDiscoverAlertOutbound(process.env, mailer, sms),
    },
    // #1648 — GA-07 est un cliquet AU PLAFOND : `OpsWeeklyReportService` ne
    // peut pas importer `MailerService`/`SingletonLockService` (deux modules
    // voisins) sans faire échouer la CI (voir son docblock de tête). La
    // composition se fait donc ICI — exactement le patron déjà posé par
    // `business-metrics/module-tokens.ts` pour la même raison.
    {
      provide: OPS_WEEKLY_REPORT_MAILER,
      inject: [MailerService],
      useFactory: (mailer: MailerService): OpsWeeklyReportMailer => ({
        send: input => mailer.sendNotificationEmail(input),
      }),
    },
    {
      provide: OPS_WEEKLY_REPORT_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
    // #2444.10 — même patron que `OPS_WEEKLY_REPORT_LOCK` juste au-dessus, et
    // que `ENGAGEMENT_ALERTS_LOCK` : le verrou en PORT, pour que
    // `FeedbackResolutionScheduler` n'importe jamais `SingletonLockService`.
    {
      provide: FEEDBACK_RESOLUTION_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
    // Le PORT de `FeedbackResolutionScheduler` : `FeedbackService` répond déjà
    // à sa forme (`notifyResolvedReports`) — `useExisting` ne construit rien
    // de plus, il nomme juste l'instance déjà fournie par `FeedbackModule`.
    { provide: FEEDBACK_RESOLUTION_PORT, useExisting: FeedbackService },
  ],
})
export class NotificationsModule {}
