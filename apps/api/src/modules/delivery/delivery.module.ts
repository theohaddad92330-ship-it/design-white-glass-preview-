import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { BusinessUnitEntity } from '../../database/entities/business-unit.entity'
import { MissionBusinessUnitService } from './mission-business-unit.service'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionRiskResolutionEntity } from '../../database/entities/mission-risk-resolution.entity'
import { MissionDocumentEntity } from '../../database/entities/mission-document.entity'
import { MissionTimesheetEntity } from '../../database/entities/mission-timesheet.entity'
import { MissionAssignmentEntity } from '../../database/entities/mission-assignment.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { MissionExpenseEntity } from '../../database/entities/mission-expense.entity'
import { MissionFeedbackEntity } from '../../database/entities/mission-feedback.entity'
import { SupplierInvoiceEntity } from '../../database/entities/supplier-invoice.entity'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { LocksModule } from '../locks/locks.module'
import { TriggerRegistryModule } from '../trigger-registry/trigger-registry.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
import { DeliveryController } from './delivery.controller'
import { DeliveryService } from './delivery.service'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { MissionBoardService } from './mission-board.service'
import { StaffingController, TalentStaffingController } from './staffing.controller'
import { StaffingService } from './staffing.service'
import { InvoiceReadinessController } from './invoice-readiness.controller'
import { InvoiceMonthPreparationController } from './invoice-month-preparation.controller'
import { InvoiceMonthPreparationService } from './invoice-month-preparation.service'
import { InvoiceMonthPreparationSweep } from './invoice-month-preparation.sweep'
import { InvoicePaymentsController } from './invoice-payments.controller'
import { InvoicePaymentsService } from './invoice-payments.service'
import { MissionBillingController } from './mission-billing.controller'
import { MissionBillingService } from './mission-billing.service'
import { MissionStatusController } from './mission-status.controller'
import { MissionLifecycleController } from './mission-lifecycle.controller'
import { ConsultantsModule } from '../consultants/consultants.module'
import { MissionStatusService } from './mission-status.service'
import { MissionDocumentsService } from './mission-documents.service'
import { MissionStartReadinessService } from './mission-start-readiness.service'
import { MissionEndController } from './mission-end.controller'
import { MissionEndService } from './mission-end.service'
import { MissionDeliveryMilestonesController } from './mission-delivery-milestones.controller'
import { MissionDeliveryMilestonesService } from './mission-delivery-milestones.service'
import { MissionAmendmentController } from './mission-amendment.controller'
import { MissionAmendmentService } from './mission-amendment.service'
import { LegalContractController } from './legal-contract.controller'
import { LegalContractService } from './legal-contract.service'
import { LegalContractUploadLinkController } from './legal-contract-upload-link.controller'
import { LegalContractUploadLinkService } from './legal-contract-upload-link.service'
import { LegalContractUploadPublicController } from './legal-contract-upload-public.controller'
import { LegalContractUploadTokenGuard } from './legal-contract-upload-token.guard'
import { StorageModule } from '../storage/storage.module'
import { MissionExtractionController } from './mission-extraction.controller'
import { MissionExtractionService } from './mission-extraction.service'
import { DeliveryRoutinesService } from './delivery-routines.service'
import { FinanceController } from './finance.controller'
import { CrmCountersController } from './crm-counters.controller'
import { CrmCountersService } from './crm-counters.service'
import { MissionDriftService } from './mission-drift.service'
import { MissionScoresService } from './mission-scores.service'
import { ForecastHorizonsService } from './forecast-horizons.service'
import { PropagationService } from './propagation.service'
import { RevenueService } from './revenue.service'
import { TimesheetsController } from './timesheets.controller'
import { TimesheetsService } from './timesheets.service'
import { MissionExpensesService } from './mission-expenses.service'
import { MissionFeedbackService } from './mission-feedback.service'
import { SupplierInvoicesService } from './supplier-invoices.service'
import { InvoiceReadinessService } from './invoice-readiness.service'
import { AccountMissionsService } from './account-missions.service'
import { MissionCrmReprisalService } from './mission-crm-reprisal.service'
import { MissionOdooSalesService } from './mission-odoo-sales.service'
import { AccountGateModule } from '../account-gate/account-gate.module'
import { AgendaModule } from '../agenda/agenda.module'
import { ActivitiesModule } from '../activities/activities.module'
import { CommercialTransitionsModule } from '../commercial-transitions/commercial-transitions.module'
import { ContactStopModule } from '../contact-stop/contact-stop.module'
import { SubmissionEntity } from '../../database/entities/submission.entity'

/**
 * Delivery OS — module autonome (règle CLAUDE n°7) : le retirer supprime les
 * missions et rien d'autre. Aucune dépendance à la facturation, par construction :
 * la frontière posée le 02/08 (objets et workflows, pas la facture légale) doit
 * se voir dans le graphe de dépendances, pas seulement dans un commentaire.
 */
@Module({
  imports: [
    WorkspaceModule,
    // #2414.43 — lecture seule, pour le CONTRÔLEUR (signal de repositionnement) ; optionnelle côté injection.
    MarketMemoryModule,
    // #2196.31 — le JOURNAL de la mission : la pose et l'annulation d'une
    // exception « non applicable » s'écrivent à l'historique du compte, depuis
    // le CONTRÔLEUR des relevés (§3.2, GA-07).
    ActivitiesModule,
    // Les deux gestes que le SERVEUR exécute quand une carte bouge : écarter le
    // compte sur « Perdue », poser le point à J+30 sur « En cours ». Ils vivent
    // dans le CONTRÔLEUR — la couche où un geste utilisateur traverse
    // légitimement plusieurs domaines (§3.2, GA-07). Sans eux, les vingt cases
    // du panneau restaient cochables sans effet.
    AccountGateModule,
    AgendaModule,
    // #2339.7 — vérifier qu'un `submissionId` désigné à la création
    // appartient à cet espace, et écrire la mission au journal de la chaîne
    // commerciale (mêmes deux raisons que `AccountGateModule` : un geste
    // utilisateur qui traverse légitimement plusieurs domaines, §3.2/GA-07).
    CommercialTransitionsModule,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique des
    // déclencheurs commerciaux : `DeliveryRoutinesService` y persiste
    // désormais les trois routines du PDF 5, en plus de la trace affichée.
    TriggerRegistryModule,
    // La préparation mensuelle des factures (balayage quotidien) prend un verrou
    // singleton : sans lui, chaque réplique la rejouerait (GA-69 / GA-76 / GA-365).
    LocksModule,
    // #2416.37 (#2972, vague 28/09) — la porte PERSONNE : `TimesheetsController`
    // la consulte (§3.2/GA-07, jamais le service) pour arrêter une relance CRA
    // adressée à un contact qui a demandé qu'on cesse (même porte que
    // `outreach`, jamais une copie).
    ContactStopModule,
    // #2193.50 (épopée #2953) — même raison que `consultants.module.ts` :
    // `ProvenanceService.history()` est une capacité générique, pas une
    // dépendance métier vers la facturation (règle n°7 toujours respectée :
    // seule la LECTURE du journal traverse, aucune écriture).
    CrmCoreModule,
    // #4196 (L5) — le consultant SUIT la mission (en mission / disponible) :
    // `ConsultantEngagementService` est appelé par les CONTRÔLEURS de statut et
    // de cycle de vie (GA-07), jamais par un service. Sens unique : `consultants`
    // n'importe pas `delivery`.
    ConsultantsModule,
    // #2422.6 (épopée #2869, lot R24 07/10/2026) — `LegalContractUploadLinkService`
    // dépose la pièce qu'un contact externe envoie, par `StorageService`
    // (même porte que `expenses`/`projects`/`rfp` : importée pour le SERVICE
    // ici, pas pour un contrôleur qui aurait déjà tranché un droit — le droit,
    // pour cette surface publique, est le jeton lui-même).
    StorageModule,
    TypeOrmModule.forFeature([
      MissionEntity,
      MissionTimesheetEntity,
      MissionAssignmentEntity,
      MissionCommercialTermsEntity,
      MissionExpenseEntity,
      MissionFeedbackEntity,
      SupplierInvoiceEntity,
      InvoiceReadinessEntity,
      AccountEntity,
      BusinessUnitEntity,
      // #2562 — le cache des deals CRM (`crm_deal_facts`), lu SEUL par
      // `MissionCrmReprisalService` pour la proposition de reprise. Lecture
      // seule : ce module n'écrit jamais dans ce cache, `CrmDepthService`
      // (module `crm`) en reste l'unique écrivain.
      CrmDealFactEntity,
      // #2561/#2562 — le lien Odoo de l'espace, LU par `MissionOdooSalesService`
      // pour lire les ventes. Ce module n'y écrit que `last_used_at` (dernier
      // usage réel) ; brancher/débrancher reste au module `odoo`.
      CrmConnectionEntity,
      // Le board à douze colonnes LIT les projets pour les afficher à côté des
      // missions. Lecture seule, et l'entité seulement : le module Projets
      // n'est pas importé, la frontière tient.
      ProjectEntity,
      // #2191.17 / #2191.18 — LE BESOIN, pour reprendre son télétravail et son
      // lieu au moment du handoff (`inheritNeedContext`). Même garde que
      // `ProjectEntity` juste au-dessus : lecture seule, le module Projets
      // n'est pas importé.
      ProjectNeedEntity,
      // #2560.6 — vérifier qu'un `consultantId` désigné à la CRÉATION d'une
      // mission appartient à cet espace. Lecture seule, même garde que
      // `CrmDealFactEntity` juste au-dessus : ce module n'écrit jamais dans
      // `consultants`, le module Vivier en reste l'unique écrivain.
      ConsultantEntity,
      // #2339.7 — vérifier qu'un `submissionId` désigné à la création d'une
      // mission appartient à cet espace. Lecture seule, même garde que
      // `ConsultantEntity` juste au-dessus : ce module n'écrit jamais dans
      // `submissions`, le module Vivier en reste l'unique écrivain.
      SubmissionEntity,
      // #2411.11 — l'historique de résolution des risques de mission, par dossier.
      MissionRiskResolutionEntity,
      // #2193.51 (épopée #2953) — les documents d'une mission (contrat signé,
      // avenant, NDA), même forme que `ProjectEntity`/`project_documents` côté
      // opportunité mais rattachés ici à la MISSION.
      MissionDocumentEntity,
    ]),
  ],
  controllers: [
    DeliveryController,
    StaffingController,
    TalentStaffingController,
    InvoiceReadinessController,
    InvoiceMonthPreparationController,
    // #2419.1/.3/.5/.11 — les paiements, distincts des factures (déclaratifs).
    InvoicePaymentsController,
    // #2417.3/.4/.5 — jalons, retainer, placement DÉCLARÉS (decisions §8).
    MissionBillingController,
    // #2407.5/.6 — statuts de mission et d'affectation, table stricte (decisions §9).
    MissionStatusController,
    // #4196 — terminer / prolonger une mission, orchestrés au contrôleur (GA-07).
    MissionLifecycleController,
    // #2414 (LAU-FINAL-128) / épopée #2986 — motif de fin typé, checklist de
    // sortie, mission interrompue (NO-GO disponibilité).
    MissionEndController,
    // #3269 (BEL-SC-240) — les dix-sept jalons de delivery, projetés ou déclarés,
    // et FIN DE MISSION → REVERSE MARKET (NO-GO disponibilité).
    MissionDeliveryMilestonesController,
    // #2423 — les changements/avenants de mission (TJM, société, site, pause…).
    MissionAmendmentController,
    // #2422.4 (épopée #2869) — le contrat juridique typé d'un compte.
    LegalContractController,
    // #2422.6 (épopée #2869, lot R24 07/10/2026) — le lien signé à portée
    // limitée : généré/listé/révoqué par le commercial (authentifié), déposé
    // par le contact externe (surface publique, contrôleur séparé).
    LegalContractUploadLinkController,
    LegalContractUploadPublicController,
    TimesheetsController,
    FinanceController,
    CrmCountersController,
    // #2560 — la lecture automatique d'un contrat/fiche de poste/e-mail
    // PROPOSE compte, rôle, dates, TJM, jours ; le clic sur « Créer » écrit,
    // une route plus loin (`DeliveryController.create`), jamais ici.
    MissionExtractionController,
  ],
  providers: [
    DeliveryService,
    MissionExtractionService,
    // Le détecteur de dérive (PDF 5 §7.2). Lu par `GET /delivery/mission-drift`
    // et par l'écran de suivi des missions — un détecteur que personne
    // n'appelle est le défaut n°1 de ce dépôt.
    MissionDriftService,
    StaffingService,
    InvoiceReadinessService,
    // #2563/#2567 — la facture mensuelle reconduite et son balayage du 1er jour ouvré.
    InvoiceMonthPreparationService,
    InvoiceMonthPreparationSweep,
    InvoicePaymentsService,
    MissionBillingService,
    MissionStatusService,
    MissionStartReadinessService,
    MissionBusinessUnitService,
    // #2193.51 (épopée #2953) — les documents d'une mission, injecté dans
    // `MissionStatusController` (mêmes trois routes que `projects/:id/documents`).
    MissionDocumentsService,
    MissionEndService,
    MissionDeliveryMilestonesService,
    MissionAmendmentService,
    LegalContractService,
    LegalContractUploadLinkService,
    LegalContractUploadTokenGuard,
    MissionBoardService,
    TimesheetsService,
    // Les frais de mission (30/08/2026). Injecté dans `StaffingController`
    // pour ses trois routes, et dans `StaffingService` pour que `readTerms`
    // branche leur SOMME et la marge nette dans la même réponse que le coût
    // chargé — un seul appel, une seule vérité sur ce que la marge inclut.
    MissionExpensesService,
    // #2412 — le double pouls de satisfaction (client/consultant) d'une
    // mission active, deux rails jamais fusionnés en un score.
    MissionFeedbackService,
    // Les factures fournisseur (30/08/2026) — même raison d'injection que
    // `MissionExpensesService` juste au-dessus : `readTerms` branche leur
    // somme dans le même appel que le coût chargé et les frais.
    SupplierInvoicesService,
    RevenueService,
    MissionScoresService,
    // #2425 — le prévisionnel par horizon ; lu par `GET /delivery/finance/forecast/horizons`.
    ForecastHorizonsService,
    CrmCountersService,
    DeliveryRoutinesService,
    // Les six agrégats de propagation (PDF 2 §4). Ici et pas dans `accounts`
    // ni `consultants` : ils se CALCULENT tous sur les missions, et §4.4 dit
    // qu'un bloc propagé se corrige là où il se calcule. Le poser ailleurs
    // aurait créé la seconde vérité que la règle existe pour empêcher.
    PropagationService,
    // L'onglet Missions du dossier de compte (PDF 4 §3.3, BEL-BO-006). Il LIT
    // `PropagationService` pour le tarif vendu moyen plutôt que de le
    // recalculer : deux moyennes du même chiffre divergent le jour où l'une des
    // deux change de règle.
    AccountMissionsService,
    // #2562 — la proposition de reprise des missions depuis le CRM connecté.
    MissionCrmReprisalService,
    // #2561/#2562 — les ventes Odoo (lecture seule) et leur reprise en missions.
    MissionOdooSalesService,
  ],
  // ⚠️ `RevenueService` et `MissionScoresService` sont exportés depuis le
  // 28/08/2026 pour le pont du copilote (PDF 2 §5.1) — les outils « mon chiffre
  // d'affaires » et « ma capacité » lisent le calcul EXISTANT plutôt que d'en
  // refaire un second. Un service injecté sans être exporté ne se voit qu'au
  // boot (GA-42) : l'export accompagne donc l'injection, dans le même lot.
  exports: [
    DeliveryService,
    StaffingService,
    InvoiceReadinessService,
    TimesheetsService,
    DeliveryRoutinesService,
    RevenueService,
    MissionScoresService,
    // #2338.8 / #2409.8 — le pont du copilote
    // (`CopilotBridgeController.missionStartReadiness`) lit le MÊME calcul que
    // l'écran (`GET /delivery/missions/:id/start-readiness`) : un service
    // injecté sans être exporté ne se voit qu'au boot (GA-42).
    MissionStartReadinessService,
    // #2425.8 — le pont du copilote lit le prévisionnel par horizon pour que
    // Laura explique l'écart CA / cash avec les MÊMES causes chiffrées que l'écran.
    ForecastHorizonsService,
    // #1576 — `AccountsController` lit `signedMissionsByAccount` pour nommer le
    // compte gagné derrière une suggestion. Composition au CONTRÔLEUR : GA-07
    // interdit un import service→service entre modules.
    AccountMissionsService,
    // #2423.9 — le pont du copilote (`CopilotBridgeController.missionAmendments`)
    // LIT les avenants déjà proposés (et vérifie que la mission appartient à
    // l'espace) avant que Laura ne prépare une nouvelle proposition — même
    // raison d'export que `MissionStartReadinessService` juste au-dessus.
    MissionAmendmentService,
    // #3413.2 — la routine du point à sept jours (`RoutineExecutors`,
    // `RoutinesModule`) lit `checkinJ7ForWorkspace` : un service injecté sans
    // être exporté ne se voit qu'au boot (GA-42).
    MissionFeedbackService,
  ],
})
export class DeliveryModule {}
