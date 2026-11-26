import { AtsModule } from '../ats/ats.module'
import { CopilotAtsRecordsController } from './copilot-ats-records.controller'
import { CopilotCrmDealsController } from './copilot-crm-deals.controller'
import { CopilotMissionsEndedController } from './copilot-missions-ended.controller'
import { CopilotWorkProgressController } from './copilot-work-progress.controller'
import { Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { AccountAccessModule } from '../account-access/account-access.module'
// #1791.2 — la trace de ce que Laura lit chez un connecteur, sur le journal
// DU COMPTE. `ActivitiesService` est le SEUL provider consommé (déjà exporté
// pour cette raison précise — voir le docblock d'`ActivitiesModule`).
import { ActivitiesModule } from '../activities/activities.module'
import { AnalysisModule } from '../analysis/analysis.module'
// #1943.5 — le suivi d'une analyse lancée depuis la conversation est une carte
// d'Action OS. Sans cycle : ActionOsModule n'atteint pas CopilotBridgeModule
// (graphe des imports vérifié le 13/09).
import { ActionOsModule } from '../action-os/action-os.module'
import { CreditsModule } from '../credits/credits.module'
import { AccountsModule } from '../accounts/accounts.module'
// #3345.2 (LAU-FINAL-255, recette prod 30/09) — les décisions déjà prises
// sur les pistes à qualifier, pour que Laura ne reproprose jamais une piste
// que l'écran Opportunités a déjà tranchée. `QualificationLeadsService` est
// le SEUL provider consommé (déjà exporté par son module pour cette raison).
import { QualificationLeadsModule } from '../qualification-leads/qualification-leads.module'
// BEL-SC-224 (#3253, P0) — le diagnostic du maillon faible commercial, une
// maison canonique nouvelle (voir le docblock de `weakest-link-diagnosis.ts` :
// KEEP sur `LauraModule.health()`, qui répond à une question différente).
import { WeakestLinkDiagnosisModule } from '../weakest-link-diagnosis/weakest-link-diagnosis.module'
import { AgendaModule } from '../agenda/agenda.module'
import { BriefingModule } from '../briefing/briefing.module'
import { ChainsModule } from '../chains/chains.module'
import { CapitalisationModule } from '../capitalisation/capitalisation.module'
import { ContactsModule } from '../contacts/contacts.module'
import { EsnDirectoryModule } from '../esn-directory/esn-directory.module'
import { ConsultantsModule } from '../consultants/consultants.module'
import { CrmModule } from '../crm/crm.module'
import { DeliveryModule } from '../delivery/delivery.module'
import { ImportModule } from '../import/import.module'
import { UniversalImportModule } from '../universal-import/universal-import.module'
import { LauraModule } from '../laura/laura.module'
import { MailboxModule } from '../mailbox/mailbox.module'
import { BeeperModule } from '../beeper/beeper.module'
// #1822 (Lot 16) — les deux réglages que Laura peut PROPOSER de changer, en
// lecture seule. `NotificationsCoreModule` est le socle léger (juste le
// service + ses trois repos, sans mailer ni scheduler) : ce pont n'a besoin
// que de LIRE les préférences, jamais de les envoyer. `CrmCoreModule` exporte
// `DealStageSlaService` pour la même raison que la file d'interventions et le
// board : lire le MÊME seuil que l'écran de réglage (GA-26).
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { CrmCoreModule } from '../crm-core/crm-core.module'
// #1822 — les deux LECTURES de réglages ajoutées : le registre de mémoire
// (`MemoryModule` exporte déjà `MemoryService` pour le contexte de chat) et les
// listes métier de l'espace.
import { MemoryModule } from '../memory/memory.module'
import { CataloguesModule } from '../catalogues/catalogues.module'
// #2308 (LAU-FINAL-049) — la carte de couverture du CHAT réutilise
// `CoverageService` (déjà exporté pour le planificateur d'enrichissement,
// GA-26 : un calcul, pas deux).
import { CoverageModule } from '../coverage-gaps/coverage.module'
// #2285.2 (épopée #2786) — la façade canonique d'UN compte, pour que Laura
// arrête de relire `accounts.company_name`/`sector`/`headquarters` en direct.
import { AccountIntelligenceModule } from '../account-intelligence/account-intelligence.module'
// #2987.56 — la file des notes de frais qui attendent une décision : la
// capacité d'approbation de dépense pendant une conversation (vocale ou
// texte) avec Laura, qui n'existait pas. `ExpensesModule` exporte désormais
// `ExpenseReportsService` pour ce SEUL appelant (voir son en-tête).
import { ExpensesModule } from '../expenses/expenses.module'
// GA-07 — CE fichier est le SEUL endroit de `copilot-bridge` qui importe
// encore `DealStageSlaService` par son nom : un `.module.ts` est la
// composition, exclue par construction de la mesure GA-07
// (`module-boundaries.spec.ts`). Le contrôleur et `laura-settings-catalog.ts`
// dépendent du PORT (`./deal-stage-sla.port`), jamais de cette classe.
import { DealStageSlaService } from '../crm-core/deal-stage-sla.service'
import { DEAL_STAGE_SLA_PORT, type DealStageSlaPort } from './deal-stage-sla.port'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkProgressModule } from '../work-progress/work-progress.module'
import { PartnerPipelineModule } from '../partner-pipeline/partner-pipeline.module'
import { PartnersModule } from '../partners/partners.module'
import { PlaybooksModule } from '../playbooks/playbooks.module'
import { ProjectsModule } from '../projects/projects.module'
import { ProposalsModule } from '../proposals/proposals.module'
// #2985 — `ActionPlanItemsService` pour la revue manager (actions réalisées /
// non avancées), le MÊME plan que l'onglet Plan, jamais un second calcul.
import { ActionsModule } from '../actions/actions.module'
import { RfpModule } from '../rfp/rfp.module'
import { RoutinesModule } from '../routines/routines.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PilotageModule } from '../pilotage/pilotage.module'
import { CopilotAccountsSearchController } from './copilot-accounts-search.controller'
import { CopilotAccountVersioningController } from './copilot-account-versioning.controller'
import { CopilotAccountOrgChartController } from './copilot-account-org-chart.controller'
import { CopilotBridgeController } from './copilot-bridge.controller'
import { CopilotContactsSearchController } from './copilot-contacts-search.controller'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { CopilotTerritoryPlanController } from './copilot-territory-plan.controller'
// #3816.1 — le marché inversé d'UN talent, lu par Laura.
import { CopilotReverseMarketController } from './copilot-reverse-market.controller'
// #2770.37 — la politique d'équipe, lue par le plan de journée/semaine de Laura.
import { CopilotTeamPolicyController } from './copilot-team-policy.controller'
// #3260.8/.9 (BEL-SC-231) — la résolution de `size_class` qui alimente le
// garde-fou de périmètre avant un lancement à l'aveugle.
import { CompaniesModule } from '../companies/companies.module'
import { MessageLibraryModule } from '../message-library/message-library.module'
import { CrmMirrorReadModule } from '../crm-mirror/crm-mirror-read.module'
import { SharedBaseModule } from '../shared-base/shared-base.module'

/**
 * GA-07 — le câblage du PORT vers la VRAIE classe, et RIEN d'autre.
 *
 * `useFactory`, jamais `useExisting` : avec un jeton `Symbol`, `useExisting`
 * ne vérifie AUCUNE forme — il se contente de faire pointer deux jetons vers
 * la même instance. Cette `useFactory`, elle, est ANNOTÉE par le type de
 * retour `DealStageSlaPort` : si `DealStageSlaService.effectiveFor` dérive un
 * jour de la signature du port, la compilation tombe ICI, pas au premier appel
 * en production.
 *
 * Exportée pour qu'un test (`copilot-bridge.module.spec.ts`) puisse la
 * résoudre sans reconstruire tout le graphe du module, et pour qu'il n'existe
 * qu'UNE définition de ce câblage.
 */
export const dealStageSlaPortProvider: Provider = {
  provide: DEAL_STAGE_SLA_PORT,
  useFactory: (service: DealStageSlaService): DealStageSlaPort => service,
  inject: [DealStageSlaService],
}

/**
 * Le pont interne du copilote. Module autonome (règle #7) : aucune table, aucun
 * service à lui — il expose en lecture seule, derrière le gate interne, ce que
 * `mailbox/`, `agenda/` et `briefing/` savent déjà faire.
 *
 * ⚠️ Exception à « aucun service à lui » : `dealStageSlaPortProvider`
 * (ci-dessus) EST un provider de ce module — le seul. Il ne porte aucune
 * logique propre, juste le câblage GA-07 du port vers `DealStageSlaService`.
 */

@Module({
  imports: [
    // SYNC-A — Laura lit les affaires du MIROIR CRM d'abord (`CopilotCrmDealsController`).
    CrmMirrorReadModule,
    // P05 (#3246, lot 09/10) — la base anonyme commune, lue par Laura « ailleurs ».
    SharedBaseModule,
    // #1943.5 — le suivi d'une analyse lancée depuis la conversation (`CopilotCardService`).
    ActionOsModule,
    // `AccountEntity` : la capacité `contacts/job-changes` lit le SCHÉMA en
    // direct (`manager.query`), pas `CrmRoutinesService` — voir le
    // commentaire au-dessus de la méthode dans le contrôleur pour la raison
    // (GA-07 est hors de cause ici : `RoutinesModule` n'exporte pas ce
    // service, et il est hors du périmètre de ce chantier).
    TypeOrmModule.forFeature([ProfileEntity, AccountEntity]),
    MailboxModule,
    // #4406.5 — Laura lit une conversation Beeper (c96) ; jamais l'envoi.
    BeeperModule,
    AgendaModule,
    // #4065 — l'instantané de l'ATS branché, en LECTURE (`CopilotAtsRecordsController`).
    AtsModule,
    BriefingModule,
    // Les blocages de parcours que Laura sait lire (#1506) — le second appelant
    // réel du moteur, avec le brief du matin.
    ChainsModule,
    // Le domaine ATS / delivery, en LECTURE : c'est ce qui manquait au copilote
    // pour répondre aux quatorze requêtes prioritaires dont l'API existait déjà.
    ConsultantsModule,
    DeliveryModule,
    CapitalisationModule,
    PlaybooksModule,
    // Les neuf lectures restantes des vingt requêtes : besoins, matching, pool
    // de réactivation, appels d'offres, comptes qui attendent une décision.
    ProjectsModule,
    // BEL-SC-239 — le plan de proposition (Proposal Studio), la même LECTURE
    // que l'écran `/propositions`.
    ProposalsModule,
    RfpModule,
    AccountsModule,
    WeakestLinkDiagnosisModule,
    // #2985 — la revue manager (actions réalisées / non avancées).
    ActionsModule,
    // #3427 — Laura choisit un modèle approuvé de la bibliothèque (LECTURE : `select`, `get`).
    MessageLibraryModule,
    WorkspaceModule,
    // #3262.23 (épopée #3284) — la phrase de Laura sur un compte Focus qui
    // stagne (`PilotageService.focusReviewForAccount`), la MÊME règle que
    // `staleFocusCount` (`reviewSignals`), appliquée à un compte nommé.
    PilotageModule,
    // #1489 — le copilote lance une analyse. `AnalysisModule` porte le SEUL
    // chemin de lancement (idempotence, réserve de crédits, file), `CreditsModule`
    // le solde qu'on annonce avant de débiter.
    //
    // ⚠️ Sans ces deux lignes, l'injection échoue au DÉMARRAGE et Railway
    // rejette le déploiement au healthcheck, sans qu'un seul test ne tombe
    // (GA-20). C'est déjà arrivé trois fois sur ce module.
    AnalysisModule,
    CreditsModule,
    // Laura Produit : le CONTEXTE et la CAUSE, jamais le score (§5.6, D50).
    LauraModule,
    // Le second marché et l'accès (tome 6 §16) : par où on entre chez un
    // compte, qui est déjà en place, avec qui on travaille, ce qu'il y a sur un
    // territoire, et qui on n'a pas relancé depuis six mois. Dix des quatorze
    // outils du §16 avaient déjà leur route ; il leur manquait cette porte.
    AccountAccessModule,
    PartnersModule,
    PartnerPipelineModule,
    EsnDirectoryModule,
    ContactsModule,
    // #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE (le 46ᵉ
    // outil de Laura). `MarketMemoryModule` exporte le SEUL point d'entrée
    // (GA-258) : ce module n'importe et ne déclare aucune de ses cinq entités.
    MarketMemoryModule,
    // #1822 / #1823 — Laura lit les réglages : le catalogue des routines (actif
    // ou non, ce qui bloque) et l'aperçu de l'assistant d'import (sources
    // lisibles, historique des sessions de CET espace). Deux lectures qui ont
    // déjà leur calcul et leur écran — les refaire ici produirait une seconde
    // vérité, la même faute que ce pont corrige depuis le premier chantier.
    RoutinesModule,
    ImportModule,
    // #4426.8 — les imports de l'historique de /settings/import (universels + « Dépose tes documents »), lus par Laura.
    UniversalImportModule,
    // #1791.2 — lire le CRM d'espace depuis la conversation, en LECTURE SEULE.
    // `CrmReadService` est le SEUL provider consommé (`findAccountPresence`,
    // déjà pensé pour « la SPA / le chatbot consomment UNE forme quel que soit
    // le CRM connecté » — voir son commentaire de tête) : importer le module
    // entier n'expose aucune route d'écriture ici, les contrôleurs qu'il
    // déclare (`CrmController`, `CrmImportController`) restent SES routes, pas
    // celles de ce pont.
    CrmModule,
    // #1791.2 — la trace visible de ce que Laura lit chez un connecteur, sur
    // le journal DU COMPTE concerné (Louis, 10/09).
    ActivitiesModule,
    // #1822 (Lot 16) — Laura ÉCRIT dans les réglages, avec confirmation.
    NotificationsCoreModule,
    CrmCoreModule,
    // #1822 — Laura LIT deux écrans de réglages de plus. `MemoryModule` ferme
    // l'asymétrie qui faisait qu'un fait ÉPINGLÉ n'était relisible par aucun
    // outil ; `CataloguesModule` porte les listes métier, et le lexique arrive
    // par `WorkspaceTeamService` (déjà exporté par `WorkspaceModule`, importé
    // plus haut).
    //
    // ⚠️ Sans ces lignes, l'injection échoue au DÉMARRAGE et Railway rejette le
    // déploiement au healthcheck, sans qu'un seul test unitaire ne tombe
    // (GA-20) — c'est déjà arrivé trois fois sur ce module.
    MemoryModule,
    CataloguesModule,
    // #2308 — la carte de couverture du CHAT (périmètre × famille de rôle ×
    // étape commerciale), posée sur `CoverageService.computeChatCoverageMapForAccount`.
    CoverageModule,
    // #2294 — la recherche de contacts dans tout l'espace, bornée au périmètre
    // (BU) de l'appelant par la même règle fail-closed que l'écran Contacts.
    BusinessUnitModule,
    // #2285.2 (épopée #2786) — la façade canonique d'un compte
    // (`AccountIntelligenceContextService.contextFor`), la MÊME que la fiche
    // compte (`GET /accounts/:id/intelligence-context`).
    AccountIntelligenceModule,
    // #2987.56 — la file des notes de frais en attente d'une décision.
    ExpensesModule,
    // #3260.8/.9 (BEL-SC-231) — le garde-fou de périmètre avant un lancement
    // à l'aveugle. `CompaniesService` est le SEUL provider consommé
    // (`search`, déjà exporté pour l'autocomplétion et la préview de lot) :
    // ce pont n'importe et ne déclare aucune de ses entités.
    //
    // ⚠️ Sans cette ligne, l'injection échoue au DÉMARRAGE et Railway rejette
    // le déploiement au healthcheck, sans qu'un seul test unitaire ne tombe
    // (GA-20, déjà vu trois fois sur ce module).
    CompaniesModule,
    QualificationLeadsModule,
    // #4611 — l'état du travail lancé, en lecture seule. `WorkProgressService` est le SEUL provider consommé.
    WorkProgressModule,
  ],
  // #2337 — le terrain de jeu multi-talents, contrôleur à part (voir son en-tête).
  controllers: [
    CopilotBridgeController,
    CopilotContactsSearchController,
    CopilotTerritoryPlanController,
    CopilotReverseMarketController,
    CopilotTeamPolicyController,
    // #2148.4 (#2848) — la recherche de comptes déjà analysés dans tout
    // l'espace, même construction que `CopilotContactsSearchController`.
    CopilotAccountsSearchController,
    // #3212.3/.4/.6 (épopée #3235) — le versioning et la révision de verdict
    // du dernier dossier, jusqu'au chat.
    CopilotAccountVersioningController,
    // LOT (15/10) DATA-B.4 — la lecture de l'onglet Organigramme, jusqu'au chat.
    CopilotAccountOrgChartController,
    // #4065 — les listings de Laura depuis l'ATS branché (instantané `AtsService.snapshot`).
    CopilotAtsRecordsController,
    // #4065.8 — les affaires gagnées / perdues du CRM branché (`read.deals`, adaptateur commun).
    CopilotCrmDealsController,
    // #4065.9 — les missions TERMINÉES (période passée), même liste que `missions/ending`.
    CopilotMissionsEndedController,
    // #4611 — où en est le travail lancé (analyses, imports, enrichissements, synchros, rattrapages).
    CopilotWorkProgressController,
  ],
  providers: [dealStageSlaPortProvider],
})
export class CopilotBridgeModule {}
