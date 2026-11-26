import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { FinanceMarginTargetEntity } from '../../database/entities/finance-margin-target.entity'
import { WorkspaceRitualPreferenceEntity } from '../../database/entities/workspace-ritual-preference.entity'
import { WorkspaceRitualLastHeldEntity } from '../../database/entities/workspace-ritual-last-held.entity'
import { StockSnapshotEntity } from '../../database/entities/stock-snapshot.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PilotageController } from './pilotage.controller'
import { PipeController } from './pipe.controller'
import { PipeService } from './pipe.service'
import { PilotageService } from './pilotage.service'
import { WeekDeltaController } from './week-delta.controller'
import { WeekDeltaService } from './week-delta.service'
import { DataHygieneService } from './data-hygiene.service'
import { FinanceTargetService } from './finance-target.service'
import { RitualPreferencesService } from './ritual-preferences.service'
import { RitualLastHeldService } from './ritual-last-held.service'
import { RitualActionsService } from './ritual-actions.service'
import { StaffingPilotageService } from './staffing-pilotage.service'
import { TaskEntity } from '../../database/entities/task.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { ContributionService } from './contribution.service'
import { StockSnapshotScheduler } from './stock-snapshot.scheduler'
import { StockSnapshotService } from './stock-snapshot.service'
import { ConsultantsModule } from '../consultants/consultants.module'
import { DeliveryModule } from '../delivery/delivery.module'
import { ProjectsModule } from '../projects/projects.module'
import { InvoiceReadinessService } from '../delivery/invoice-readiness.service'
import { OpenNeedsService } from '../projects/open-needs.service'
import { TalentService } from '../consultants/talent.service'
import { TimesheetsService } from '../delivery/timesheets.service'
import {
  INVOICE_READINESS_STOCK_SOURCE,
  OPEN_NEEDS_STOCK_SOURCE,
  TALENT_STOCK_SOURCE,
  TIMESHEET_STOCK_SOURCE,
  type InvoiceReadinessStockSource,
  type OpenNeedsStockSource,
  type TalentStockSource,
  type TimesheetStockSource,
} from './stock-sources'

/**
 * KPI de chaîne p24. Module autonome (règle #7). N'écrit rien — agrège en lecture
 * la donnée déjà produite (contacts, opportunités, comptes, vivier) et délègue
 * les seuils au calcul déterministe partagé.
 */
@Module({
  imports: [
    // Gating par offre : le Pilotage demande la feature `manager_cockpit`.
    PlanFeaturesModule,
    // `AccountEntity` sert au bloc « contribution » : il compte les comptes par
    // ORIGINE. Oubliée à l'ajout du service, et aucun test ne l'a vue — le
    // câblage des modules Nest ne s'exerce qu'au démarrage réel, pas en test
    // unitaire, et l'API a crash-loopé en production sur
    // « can't resolve dependencies of the ContributionService ».
    // `StockSnapshotEntity` : la photo mensuelle des STOCKS. Elle vit dans ce
    // module et pas ailleurs parce que ce qu'elle photographie est dérivé ICI —
    // la déplacer supposerait de recopier les dérivations, c'est-à-dire d'en
    // créer une seconde.
    TypeOrmModule.forFeature([
      AccountEntity,
      ContactEntity,
      ProjectEntity,
      StockSnapshotEntity,
      // L'objectif mensuel de marge (D7 du 26/08) : perdu en prenant le module
      // de la branche, qui ne le connaissait pas. `FinanceTargetService`
      // l'injecte — GA-20 l'a dit.
      FinanceMarginTargetEntity,
      // #3271.10, .12 — la préférence « rituel masqué » par (espace, rituel).
      WorkspaceRitualPreferenceEntity,
      // #3298 (suite #3271.8) — la marque légère de dernière tenue, par (espace, rituel).
      WorkspaceRitualLastHeldEntity,
      // #3271.8 reste (épopée #3298) — « actions créées » = lecture des tâches taguées.
      TaskEntity,
    ]),
    WorkspaceModule,
    // ⚠️ Les trois modules dont la photo mensuelle lit une dérivation
    // (31/08/2026). Le couplage est déclaré ICI, où il est visible et vérifié
    // au démarrage réel — `stock-snapshot.service.ts`, lui, ne connaît le nom
    // d'aucun service étranger : il dépend de PORTS qu'il possède
    // (`stock-sources.ts`), branchés juste en dessous.
    //
    // Aucun cycle possible aujourd'hui : `PilotageModule` n'est importé que par
    // `app.module.ts` — mesuré le 31/08/2026, et c'est ce qui rend ces trois
    // imports sûrs. Le jour où quelqu'un importera `PilotageModule` depuis
    // `projects`, `delivery` ou `consultants`, Nest le dira au DÉMARRAGE
    // (« circular dependency »), pas en test unitaire : le graphe de modules ne
    // se vérifie qu'au boot (GA-42).
    ProjectsModule,
    DeliveryModule,
    ConsultantsModule,
  ],
  controllers: [PilotageController, PipeController, WeekDeltaController],
  providers: [
    PilotageService,
    PipeService,
    WeekDeltaService,
    DataHygieneService,
    ContributionService,
    StockSnapshotService,
    StockSnapshotScheduler,
    FinanceTargetService,
    RitualPreferencesService,
    RitualLastHeldService,
    RitualActionsService,
    StaffingPilotageService,
    /**
     * Les quatre PORTS de la photo mensuelle.
     *
     * ⚠️ `useFactory` avec le port en TYPE DE RETOUR, et non `useExisting`.
     * C'est la seule des deux formes qui prouve quelque chose : un jeton est un
     * symbole, TypeScript ne le relie à aucune forme, et un `useExisting` aurait
     * accepté n'importe quel fournisseur. Ici, le jour où l'une des quatre
     * dérivations change de signature, la COMPILATION tombe — pas la production,
     * un mois plus tard, sur une photo silencieusement manquante.
     */
    {
      provide: OPEN_NEEDS_STOCK_SOURCE,
      inject: [OpenNeedsService],
      useFactory: (service: OpenNeedsService): OpenNeedsStockSource => service,
    },
    {
      provide: TIMESHEET_STOCK_SOURCE,
      inject: [TimesheetsService],
      useFactory: (service: TimesheetsService): TimesheetStockSource => service,
    },
    {
      provide: INVOICE_READINESS_STOCK_SOURCE,
      inject: [InvoiceReadinessService],
      useFactory: (service: InvoiceReadinessService): InvoiceReadinessStockSource => service,
    },
    {
      provide: TALENT_STOCK_SOURCE,
      inject: [TalentService],
      useFactory: (service: TalentService): TalentStockSource => service,
    },
  ],
  /**
   * La LECTURE des photos sort du module, la PRISE de photo n'en sort pas.
   *
   * ⚠️ Rétabli le 01/09 : le module de la branche `deltas-branches` n'exportait
   * rien, et `AccountsController` injecte `StockSnapshotService`. GA-42 l'a
   * attrapé — le graphe n'aurait pas démarré.
   *
   * #3262.23 (épopée #3284) — `PilotageService` s'ajoute : `CopilotBridgeController`
   * l'injecte pour `focusReviewForAccount` (la phrase de Laura, relayée TEL
   * QUEL depuis la même règle que `reviewSignals`).
   */
  // `DataHygieneService` — #2916 (#2399.2) : la routine
  // `accounts_without_next_action` le réutilise pour ne pas recalculer le
  // prédicat `ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask` une quatrième fois
  // (GA-26).
  exports: [StockSnapshotService, PilotageService, DataHygieneService],
})
export class PilotageModule {}
