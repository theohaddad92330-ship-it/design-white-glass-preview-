import { BullModule, getQueueToken } from '@nestjs/bullmq'
import { Module, type Provider } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm'
import { isFailure } from '@bellum/utils'
import type { Repository } from 'typeorm'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { ConsultantsModule } from '../consultants/consultants.module'
import { MatchingService } from '../consultants/matching/matching.service'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { ActionRouterModule } from '../action-router/action-router.module'
import { ActionRouterService } from '../action-router/action-router.service'
// #1943.5 — l'issue d'une analyse suivie se lit chez ceux qui la connaissent : le
// statut (analyse) et le remboursement (registre). Sans cycle : ni AnalysisModule
// ni CreditsModule n'atteignent ActionOsModule (graphe des imports vérifié le 13/09).
import { AnalysisModule } from '../analysis/analysis.module'
import { AnalysisService } from '../analysis/analysis.service'
import { PROGRESS_PHASES } from '../analysis/analysis.constants'
import { CreditsModule } from '../credits/credits.module'
// #1952.29 — l'accusé de fin part par le mécanisme qui existe déjà (canaux
// branchés). Sans cycle : `IntegrationsModule` n'importe que TypeORM, BullMQ et
// `WorkspaceModule` — il n'atteint pas `ActionOsModule`.
import { IntegrationsModule } from '../integrations/integrations.module'
import { IntegrationsService } from '../integrations/integrations.service'
// #2276.62 — le retour dans Laura part par la cloche qui existe déjà (GA-26,
// jamais un second système). `NotificationsCoreModule` est le même noyau
// léger qu'`IntegrationsModule` juste au-dessus : `NotificationsService` et
// ses trois dépôts, sans le mailer ni la file. Sans cycle : il n'importe que
// `IntegrationsModule` (déjà présent ici) et ses propres entités.
// #2864 — reste du lot précédent : prévenir le collègue à qui une demande est
// confiée, même noyau léger, déjà importé par une dizaine de modules feuilles
// pour la même raison (voir son docblock).
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { NotificationsService } from '../notifications/notifications.service'
import { CreditsService } from '../credits/credits.service'
import { ToolRegistryModule } from '../tool-registry/tool-registry.module'
import { WorkspaceModule } from '../workspace/workspace.module'
// #1931.20 — le résultat d'une carte rend AUSSI dans Actions et la timeline,
// toutes deux lues depuis `activities` (#2124.41). Sans cycle : `ActivitiesModule`
// n'importe que `PlanFeaturesModule`, `WorkspaceModule`, `MailboxModule` (déjà en
// `forwardRef`), `AgendaModule` et `TelephonyModule` — aucun n'atteint `ActionOsModule`.
import { ActivitiesModule } from '../activities/activities.module'
// #2366.2 — un brouillon généré par `generate_message` devient AUSSI un
// message canonique (`OutreachMessageService.create`, source `laura`), pour
// que la fiche Contact et le centre d'approbation Outreach voient LE MÊME
// objet que le fil de Laura. Sans cycle : `OutreachModule` importe
// `ActionRouterModule` (et ses dépendances), `ContactStopModule`,
// `MailboxModule`, `WorkspaceModule` — aucun n'atteint `ActionOsModule` (même
// graphe que la note ci-dessus sur `ActivitiesModule`). L'inverse — brancher
// depuis `ActionRouterModule` — cyclerait : `OutreachModule` l'importe déjà
// (`outreach.service.ts`, rappels datés).
import { OutreachModule } from '../outreach/outreach.module'
import { OutreachMessageService } from '../outreach/outreach-message.service'
import { OutreachDelegationService } from '../outreach/outreach-delegation.service'
import { LAURA_SEND_MANDATE, lauraJobDraftsFrom, type LauraSendMandate } from './laura-job-drafts'
import { ActionOsController } from './action-os.controller'
import { ApprovalSettingsController } from './approval-settings.controller'
import { ApprovalSettingsService } from './approval-settings.service'
import { AnalysisFoundBackfillController } from './analysis-found-backfill.controller'
import { AnalysisFoundBackfillService } from './analysis-found-backfill.service'
import {
  ANALYSIS_LAUNCH_OBSERVER,
  analysisLaunchObserverFrom,
  type AnalysisLaunchObserver,
} from './analysis-launch.port'
import { CopilotCardService } from './copilot-card.service'
import { LauraJobExecutor } from './laura-job.executor'
import {
  LAURA_JOB_BALANCE,
  LAURA_JOB_CAPABILITY_PORTS,
  LAURA_JOB_DISPATCHER,
  LAURA_JOB_DRAFTS,
  LAURA_JOB_ENQUEUER,
  LAURA_JOB_QUEUE,
  type LauraJobBalance,
  type LauraJobCapabilityPorts,
  type LauraJobDrafts,
  type LauraJobEnqueuer,
  type LauraJobQueueData,
} from './laura-job.port'
import { LauraJobService } from './laura-job.service'
import { LAURA_JOB_OPTIONS, LauraJobWorker } from './laura-job.worker'
import { JOB_RETURN_NOTIFIER, type JobReturnNotifier } from './job-return-notifier.port'
import { LONG_JOB_NOTIFIER, type LongJobNotifier } from './long-job-notifier.port'
import { CreditReservationModule } from './credit-reservation.module'
import { WorkflowRunnerService } from './workflow-runner.service'
import { CanonicalActionsController } from './canonical-actions.controller'
import { ActionsModule } from '../actions/actions.module'
import { TasksModule } from '../tasks/tasks.module'
import { PlaybooksModule } from '../playbooks/playbooks.module'

/**
 * #1943.5 — le câblage du PORT vers les deux lectures réelles, et rien d'autre.
 * `useFactory` annotée par `AnalysisLaunchObserver` : une dérive de signature de
 * `getStatus` ou `getLedger` casse la compilation ICI, pas au premier appel.
 */
const analysisLaunchObserverProvider: Provider = {
  provide: ANALYSIS_LAUNCH_OBSERVER,
  useFactory: (analysis: AnalysisService, credits: CreditsService): AnalysisLaunchObserver =>
    // #1952.1 — le nombre de phases vient du module qui les POSSÈDE. Le recopier
    // ici ferait un second endroit où « 4 » vit, et le jour où le pipeline gagne
    // une phase la carte dirait « 3 sur 4 » pour toujours.
    analysisLaunchObserverFrom(analysis, credits, PROGRESS_PHASES.length),
  inject: [AnalysisService, CreditsService],
}

/**
 * #1952.29 — LE CÂBLAGE de l'accusé de fin, et rien d'autre.
 *
 * `useFactory` annotée par `LongJobNotifier` : une dérive de la signature de
 * `notifyUser` casse la compilation ICI, pas au premier envoi sortant. Sans ce
 * fournisseur, `WorkflowRunnerService` reçoit `undefined` (le paramètre est
 * `@Optional`) et n'annonce rien — c'est le défaut n°1 du dépôt, du code juste
 * que personne n'appelle, et c'est précisément pour ça que cette ligne existe.
 */
const longJobNotifierProvider: Provider = {
  provide: LONG_JOB_NOTIFIER,
  useFactory: (integrations: IntegrationsService): LongJobNotifier => integrations,
  inject: [IntegrationsService],
}

/**
 * #2276.62 — LE CÂBLAGE du retour dans Laura, et rien d'autre.
 *
 * `useFactory` annotée par `JobReturnNotifier` : une dérive de la signature de
 * `createNotification` casse la compilation ICI, pas au premier envoi. Le
 * type `system` et l'absence de `body` répètent volontairement la doctrine du
 * port (voir `job-return-notifier.port.ts`) : un compte et un lien voyagent,
 * jamais un corps.
 */
const jobReturnNotifierProvider: Provider = {
  provide: JOB_RETURN_NOTIFIER,
  useFactory: (notifications: NotificationsService): JobReturnNotifier => ({
    notify: async (userId, input) => {
      await notifications.createNotification(userId, { type: 'system', title: input.title, link: input.link })
    },
  }),
  inject: [NotificationsService],
}

/**
 * Action OS — le domaine de l'exécution gouvernée (addendum final p22-25).
 *
 * Module autonome (règle CLAUDE n°7) : le retirer supprime les workflows et les
 * approbations, sans toucher au routeur d'actions ni au reste du produit. Il ne
 * réimplémente aucune capacité — il compose celles du routeur — et n'ajoute
 * aucun second orchestrateur à côté de BullMQ : les runs sont synchrones et
 * courts par construction (au plus une poignée de pas sur une cible), et la seule
 * attente longue (l'enrichissement, 30-85 s) tourne dans la file qui existait déjà.
 *
 * #1931 L2 — les cartes de Laura (`CopilotCardService`) sont des runs de ce module.
 */
/**
 * #2276 tranche 2 — les ports du job composite de Laura (voir `laura-job.port.ts`).
 * Le routeur d'actions est la SEULE porte d'exécution ; le brouillon généré
 * devient le message canonique d'Outreach ; le solde vient de la facturation
 * (jamais un second compteur) ; la mise en file passe par la file BullMQ.
 */
const lauraJobProviders: Provider[] = [
  { provide: LAURA_JOB_DISPATCHER, useExisting: ActionRouterService },
  // #4016 L5 (reprise 20/10) — le mandat `laura_send`, par port (GA-07) : réalisé par le service des mandats.
  { provide: LAURA_SEND_MANDATE, useExisting: OutreachDelegationService },
  {
    provide: LAURA_JOB_DRAFTS,
    // #4016 L5 (reprise 20/10) — un brouillon e-mail est proposé au mandat `laura_send` (voir `laura-job-drafts.ts`).
    useFactory: (outreach: OutreachMessageService, mandate: LauraSendMandate): LauraJobDrafts =>
      lauraJobDraftsFrom(outreach, mandate),
    inject: [OutreachMessageService, LAURA_SEND_MANDATE],
  },
  {
    provide: LAURA_JOB_BALANCE,
    useFactory: (credits: CreditsService): LauraJobBalance => ({
      remainingOf: async userId => (await credits.getCredits(userId)).credits_remaining,
    }),
    inject: [CreditsService],
  },
  {
    provide: LAURA_JOB_ENQUEUER,
    useFactory: (queue: Queue<LauraJobQueueData>): LauraJobEnqueuer => ({
      enqueue: async (data, options) => {
        // #3860.1 — un délai : le passage suivant d'un job qui attend ses analyses.
        await queue.add('run', data, options?.delayMs ? { delay: options.delayMs } : undefined)
      },
    }),
    inject: [getQueueToken(LAURA_JOB_QUEUE)],
  },
  {
    // #3860.1 (lot M06) — les cinq capacités jusqu'ici « non exécutables dans un
    // job », chacune par le service qui la possède déjà (composition, GA-07) :
    // aucune seconde implémentation, aucun appel réseau de plus.
    provide: LAURA_JOB_CAPABILITY_PORTS,
    useFactory: (
      analysis: AnalysisService,
      observer: AnalysisLaunchObserver,
      accounts: Repository<AccountEntity>,
      market: MarketMemoryService,
      matching: MatchingService,
      snapshots: Repository<TerritorySnapshotEntity>,
    ): LauraJobCapabilityPorts => ({
      startAnalysis: async ({ userId, workspaceId, accountId, refresh }) => {
        const account = await accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
        if (!account) return { refused: 'Compte introuvable dans cet espace.' }
        // Le MÊME lancement que l'écran (droits, crédits, idempotence) ; `force` rejoue un dossier déjà analysé.
        const started = await analysis.start(
          { company_name: account.company_name, ...(account.siren ? { siren: account.siren } : {}) },
          userId,
          { force: refresh },
        )
        if (isFailure(started)) return { refused: started.problem.message }
        return { runRef: started.output.jobId }
      },
      analysisState: async ({ userId, accountId, runRef, launchedAt }) =>
        (await observer.observe({ userId, accountId, jobId: runRef, launchedAt })).state,
      searchMarketMemory: async ({ workspaceId, criteria }) => {
        const read = await market.searchByFilters(
          {
            technology: criteria.technology,
            location: criteria.location ?? criteria.department,
            region: criteria.region,
          },
          { workspaceId },
        )
        return read.status === 'ok' ? { count: read.matches.length, truncated: read.truncated } : null
      },
      matchNeed: async ({ workspaceId, userId, needId }) => {
        const run = await matching.matchNeed(needId, workspaceId, userId, { canReadFinance: false })
        return run ? { recommended: run.recommended.length } : null
      },
      latestTerritorySnapshot: async department => {
        // `source: 'sweep'` : jamais une photo de la salle de démonstration (voir `TerritoryWatchService`).
        const photo = await snapshots.findOne({ where: { department, source: 'sweep' }, order: { takenOn: 'DESC' } })
        return photo ? { takenOn: photo.takenOn, offers: photo.offers } : null
      },
    }),
    inject: [
      AnalysisService,
      ANALYSIS_LAUNCH_OBSERVER,
      getRepositoryToken(AccountEntity),
      MarketMemoryService,
      MatchingService,
      getRepositoryToken(TerritorySnapshotEntity),
    ],
  },
]

@Module({
  imports: [
    ActionRouterModule,
    // #2276 tranche 2 — la file du job composite de Laura (un passage = des étapes).
    BullModule.registerQueue({ name: LAURA_JOB_QUEUE, defaultJobOptions: LAURA_JOB_OPTIONS }),
    WorkspaceModule,
    // Le registre d'outils : le contrôleur y lit les capacités RÉELLEMENT
    // branchées, qu'il passait jusqu'ici en `Set` vide — donc tout pas bloqué,
    // et un run qui se déclarait terminé sans rien faire.
    ToolRegistryModule,
    // #1931 L2 — le registre des crédits promis, sorti en module feuille pour que
    // le worker d'enrichissement puisse solder sans cycle (voir son en-tête).
    CreditReservationModule,
    // #1943.5 — voir `analysisLaunchObserverProvider`.
    AnalysisModule,
    // #3860.1 — voir `LAURA_JOB_CAPABILITY_PORTS`. Sans cycle : `MarketMemoryModule`
    // n'importe que TypeORM ; `ConsultantsModule` que `PlanFeaturesModule` et
    // `ProjectsModule` (lui-même PlanFeatures + TypeORM) — aucun n'atteint `ActionOsModule`.
    MarketMemoryModule,
    ConsultantsModule,
    CreditsModule,
    // #1952.29 — voir `longJobNotifierProvider`.
    IntegrationsModule,
    // #2276.62 — voir `jobReturnNotifierProvider`.
    NotificationsCoreModule,
    // #1931.20 — voir la note plus haut, sur l'import.
    ActivitiesModule,
    // #2366.2 — voir la note plus haut, sur l'import.
    OutreachModule,
    // #2395 — l'objet Action canonique lit le plan de Laura, les tâches et,
    // depuis #2395.10, la file d'intervention du responsable
    // (`CanonicalActionsController`). Sans ces lignes, l'injection échoue au
    // DÉMARRAGE (GA-20). Pas de cycle : `PlaybooksModule` n'importe pas
    // `ActionOsModule` (vérifié par grep, comme les notes ci-dessus).
    ActionsModule,
    TasksModule,
    PlaybooksModule,
    TypeOrmModule.forFeature([
      WorkflowRunEntity,
      ApprovalRequestEntity,
      WorkspaceEntity,
      // La CIBLE d'un run. Sans ces trois lignes, l'injection échoue au
      // DÉMARRAGE et Railway rejette le déploiement au healthcheck, sans qu'un
      // seul test ne tombe (GA-20).
      AccountEntity,
      ContactEntity,
      CrmConnectionEntity,
      // #1498 — « qui l'a déclenchée, qui l'a validée ». Les deux identifiants
      // étaient déjà en base ; il manquait de quoi les rendre lisibles. Même
      // règle que les trois lignes ci-dessus : sans celle-ci l'injection échoue
      // au DÉMARRAGE, et aucun test ne tombe (GA-20).
      ProfileEntity,
      // #2896 / #2449.35 — le niveau d'action réglé, lu par le contrôleur au clic
      // sur une carte. Sans cette ligne, l'injection échoue au DÉMARRAGE (GA-20).
      UserPreferenceEntity,
      // #3860.1 — la photo hebdomadaire lue par l'étape « territoire » d'un job.
      // Sans cette ligne, l'injection échoue au DÉMARRAGE (GA-20).
      TerritorySnapshotEntity,
    ]),
  ],
  // #3416.x2 — le rattrapage d'opérateur (jamais au déploiement) de `analysisFound`.
  controllers: [
    ActionOsController,
    CanonicalActionsController,
    AnalysisFoundBackfillController,
    // #4016 L6 — l'autonomie de l'espace (N2-N5) et ses seuils, réglés par l'admin.
    ApprovalSettingsController,
  ],
  providers: [
    WorkflowRunnerService,
    ApprovalSettingsService,
    CopilotCardService,
    AnalysisFoundBackfillService,
    // #2276 — le job composite de Laura, lu par `IaProxyController` (fin de tour).
    LauraJobService,
    // #2276 tranche 2 — l'exécution par étapes, dans le worker de sa file.
    LauraJobExecutor,
    LauraJobWorker,
    ...lauraJobProviders,
    analysisLaunchObserverProvider,
    longJobNotifierProvider,
    jobReturnNotifierProvider,
  ],
  exports: [WorkflowRunnerService, CreditReservationModule, CopilotCardService, LauraJobService],
})
export class ActionOsModule {}
