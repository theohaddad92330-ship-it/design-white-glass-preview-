import { InjectRepository } from '@nestjs/typeorm'
import type { MailThreadText } from '../mailbox/mail-thread-text'
import type { BeeperChatMessagesResponse, BeeperConversationsResponse } from '@bellum/contracts'
import { BeeperService } from '../beeper/beeper.service'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import {
  Body,
  Controller,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ConnectorSpanInterceptor } from './connector-span.interceptor'
import {
  agendaProviderSchema,
  computeDormantReactivationScore,
  dormantReactivationAxisLabel,
  mailboxProviderSchema,
  preSendCheck,
  preSendFailures,
  recipientSpecificityCheck,
  SHARED_BASE_PROVENANCE_LABEL,
} from '@bellum/contracts'
import {
  type OutcomeRecommendation,
  can,
  openNeedsQuerySchema,
  isReadableImportFormat,
  isWritableImportObject,
  // LOT 15, arbitrage A — le MÊME cloisonnement de portefeuille (D5) que
  // `GET /accounts` applique déjà au bord, rejoué ici pour `chains/blockers`.
  marketMemorySearchReadSchema,
  type MarketMemorySearchRead,
  portfolioScopeFor,
  isInvoicedState,
  isSettled,
  reminderDue,
  // #1822 — les bornes de l'horaire d'une routine et la liste des canaux, SERVIES
  // au service IA plutôt que recopiées en Python (GA-26).
  ROUTINE_SCHEDULE_BOUNDS,
  routineChannelSchema,
  talentPoolSegmentSchema,
  talentSearchQuerySchema,
  // #2327.26 — la MÊME phrase que l'écran (`TalentIdentityPanel.tsx`), calculée
  // une fois dans le contrat partagé.
  explainTalentDuplicate,
  type AgendaEvent,
  type AgendaWindow,
  type AgendaPreferences,
  type DailyBriefing,
  type DayClosure,
  type FinanceScope,
  type FreeSlot,
  type MailSearchResponse,
  type PipelineSummary,
  type TalentPage,
  type TalentIdentityState,
  analysisContextFields,
  analysisContextSchema,
  analysisQuestionsFor,
  type AnalysisContextPreset,
  type MarketMemoryRead,
  type ChatCoverageRoleFamily,
  type MissionStartReadiness,
  type MissionAmendmentView,
  type ConsultantPushFeedback,
  accountManagerReviewSchema,
  type ApprovalState,
  type AutomationLevel,
  // #2987.56 — la file des notes de frais en attente d'une décision.
  type ExpenseReportSummaryView,
  // #3260.8/.9 (BEL-SC-231) — le garde-fou de périmètre avant un lancement à
  // l'aveugle : « Analyse Société Générale », sans plus de précision, sur une
  // GRANDE ENTREPRISE au sens du registre.
  analysisScopeGuardrailFor,
  type AnalysisScopeGuardrail,
  type CompanySuggestion,
  // #3277.1 (épopée #3277, BEL-SC-225 suite) — la MÊME projection canonique
  // que la fiche compte (`GET /accounts/:id/strategy-5p`), pour Laura.
  type AccountStrategy5P,
  // #3258.14 (épopée #3362, lot E25 30/09) — la MÊME matrice canonique que
  // la fiche compte (`GET /accounts/:id/interest-penetrability`), pour Laura.
  type AccountInterestPenetrability,
  // #3919 / #3928.1 — la MÊME règle « récent » pour toutes les surfaces
  // (un signal sans date n'est pas récent), jamais une seconde règle de fraîcheur.
  isRecentSignal,
  // #3903 — la MÊME liste fermée de canaux d'interaction que `ActivitiesService`,
  // jamais une seconde énumération qui diverge en silence.
  INTERACTION_ACTIVITY_KINDS,
  // #4289.12 — la réponse du stade de relation par SIREN passe le contrat partagé ia ↔ api à la frontière.
  relationStagesBySirenResponseSchema,
} from '@bellum/contracts'
import { companyNamesScope, headcountFloorOf, lastRunIsUnscoped, pickScopeCandidate } from './analysis-scope-candidate'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { mapWithConcurrency } from '../../common/util/concurrency'
import { isFailure } from '@bellum/utils'
import { AnalysisService } from '../analysis/analysis.service'
import { LauraBatchFollowService } from '../analysis/laura-batch-follow.service'
import { AnalysisRunsService } from '../analysis/analysis-runs.service'
import { CreditsService } from '../credits/credits.service'
import { issueAnalysisPlanToken, verifyAnalysisPlanToken } from './analysis-plan-token'
// #3260.8/.9 — `CompaniesService` est le SEUL point d'entrée déjà exporté
// pour résoudre `size_class` (GA-26) : celui qui alimente déjà l'autocomplétion.
import { CompaniesService } from '../companies/companies.service'
import { NotesService } from '../crm-core/notes.service'
// #1943.5 — le suivi d'une analyse lancée depuis la conversation : le contrôleur
// ORCHESTRE (GA-07 ne compte pas les contrôleurs), la carte vit dans Action OS.
import { CopilotCardService } from '../action-os/copilot-card.service'
// #2857 (#2201.31) — « Demander une explication » sur une carte de validation :
// une LECTURE, `WorkflowRunnerService.explainApprovalRequest`, jamais une
// décision (`decideApprovalRequest` n'est pas appelé depuis cette route).
import { WorkflowRunnerService } from '../action-os/workflow-runner.service'
import { trackConversationAnalysisLaunch } from './analysis-launch-tracking'
import type { StartAnalysisDto } from '../analysis/dto/start-analysis.dto'
import { AccountAccessService } from '../account-access/account-access.service'
import { purchasingPanelOf } from '../account-access/purchasing-panel'
import { AccountsService } from '../accounts/accounts.service'
import { PilotageService } from '../pilotage/pilotage.service'
// #2271.19 — la MÊME lecture que la fiche de compte (`GET /accounts/:id/timeline`),
// pour que la conversation la rende sans en recalculer une seconde.
import { AccountTimelineService } from '../accounts/account-timeline.service'
// #3277.1 (épopée #3277, BEL-SC-225 suite) — la MÊME projection canonique que
// la fiche compte (`GET /accounts/:id/strategy-5p`), pour que Laura réponde
// « où en est ce compte » sans jamais recalculer la projection localement.
import { AccountStrategy5PService } from '../accounts/account-strategy-5p.service'
// #3258.14 (épopée #3362, lot E25 30/09) — la MÊME matrice canonique que la
// fiche compte et le panneau Pilotage (`GET /accounts/:id/interest-penetrability`),
// pour que Laura devienne un appelant NOMMÉ par l'épopée, sans jamais
// recalculer le quadrant localement.
import { AccountInterestPenetrabilityService } from '../accounts/account-interest-penetrability.service'
// #2285.2 (épopée #2786) — la MÊME façade canonique que la fiche compte
// (`GET /accounts/:id/intelligence-context`), pour que Laura arrête de relire
// `accounts.company_name`/`sector`/`headquarters` en direct dans
// `compile_account_preflight` (apps/ia).
import {
  AccountIntelligenceContextService,
  type AccountIntelligenceContext,
} from '../account-intelligence/account-intelligence-context.service'
// #1791.2 — la trace de ce que Laura lit chez un connecteur : une entrée
// visible sur le journal DU COMPTE, pas seulement dans le logger serveur.
import { ActivitiesService } from '../activities/activities.service'
// #1822 (Lot 16) — les deux réglages que la conversation peut PROPOSER de
// changer : les interrupteurs de notification et les durées cibles du pipe.
import { NotificationsService } from '../notifications/notifications.service'
// #1822 — les deux LECTURES de réglages ajoutées par ce lot. `MemoryService`
// porte le registre que Réglages › Mémoire de Laura affiche déjà ;
// `WorkspaceTeamService` porte le lexique de l'espace (D17) et
// `CataloguesService` ses listes métier. Trois lectures qui ont DÉJÀ leur
// calcul et leur écran — les refaire ici produirait une seconde vérité.
import { MemoryService } from '../memory/memory.service'
import { WorkspaceTeamService } from '../workspace/workspace-team.service'
import { CataloguesService } from '../catalogues/catalogues.service'
// GA-07 — le PORT étroit, jamais `DealStageSlaService` directement (voir
// `deal-stage-sla.port.ts` : le seul fichier qui connaît encore la classe
// concrète est `copilot-bridge.module.ts`, exclu de la mesure GA-07).
import { DEAL_STAGE_SLA_PORT, type DealStageSlaPort } from './deal-stage-sla.port'
import {
  assertNoForbiddenWritableSettingsScreen,
  buildNotificationsOverviewFields,
  buildPipelineOverviewFields,
  type SettingsOverviewScreen,
} from './laura-settings-catalog'
import { agendaProvidersExcludedBy } from '../agenda/agenda-backend'
import { AgendaService } from '../agenda/agenda.service'
import { BriefingService, type BriefingReadScope } from '../briefing/briefing.service'
import { ChainsService } from '../chains/chains.service'
import { ContactsService } from '../contacts/contacts.service'
import { titleMatchesFunction } from '../contacts/target-persona-match'
// #2308 (LAU-FINAL-049) — la carte de couverture du CHAT, posée sur le MÊME
// service que l'onglet Zones blanches (`CoverageService`, déjà exporté).
import { CoverageService } from '../coverage-gaps/coverage.service'
// #2308.32 — traduit les familles de rôles Market Memory (vocabulaire de
// DOMAINE) vers la seule famille de rôle D'ACHAT qui a une correspondance
// réelle (`securite_conformite`) ; voir le docblock de la fonction.
import { resolveMarketMemoryRoleFamilies } from '../coverage-gaps/chat-coverage-map'
// #1791.2 — lire le CRM d'espace depuis la conversation. `domainFromWebsite`
// est la MÊME dérivation que la route web `GET /crm/presence` : deux chemins
// qui la refont divergeraient au premier domaine mal extrait.
import { CrmReadService } from '../crm/crm-read.service'
// #3219 (#190.2 pour un CONTACT) — le MÊME détecteur générique que celui déjà
// branché côté compte (`AccountIntelligenceContextService`), `entityType`
// différent. `FieldConflictService` est déjà exporté par `CrmCoreModule`
// (importé dans `CopilotBridgeModule`) et déjà utilisé par cette route via
// `entityType: 'contact'` côté REST (`GET /contacts/:id/conflicts`) — aucun
// second calcul. Import direct légitime : ce fichier est un `.controller.ts`,
// hors du périmètre de la mesure GA-07 (composition à la demande d'un geste
// utilisateur, voir `module-boundaries.spec.ts`).
import { FieldConflictService } from '../crm-core/field-conflict.service'
import { domainFromWebsite } from '../crm/crm-presence'
import { EsnDirectoryService } from '../esn-directory/esn-directory.service'
import { withOverflowScores } from '../esn-directory/territory-overflow'
import { IaClient } from '../ia/ia.client'
import { IMPORT_CATALOG } from '../import/import-catalog'
import { ImportService } from '../import/import.service'
import { ImportOverviewForLauraService } from '../universal-import/import-overview-for-laura.service'
import { CvBatchImportService } from '../consultants/cv-batch-import.service'
import { PartnerPipelineService } from '../partner-pipeline/partner-pipeline.service'
import { PartnersService } from '../partners/partners.service'
import {
  contactMovesAccountsSql,
  contactMovesEsnSql,
  dedupeContactMoves,
  // LOT 17 — le cloisonnement de portefeuille (D5) appliqué à `jobChanges`,
  // voir sa doc.
  ownedAccountIdsSql,
  type ContactMove,
} from '../routines/crm-routines.service'
import { mailboxProvidersExcludedBy } from '../mailbox/mailbox-backend'
import { MailboxService } from '../mailbox/mailbox.service'
import { MarketMemoryService, type MarketCompanyLookup } from '../market-memory/market-memory.service'
import { marketPortfolioLookups } from '../market-memory/portfolio-lookups'
import { CapitalisationService } from '../capitalisation/capitalisation.service'
import { TalentService } from '../consultants/talent.service'
import { ConsultantsService } from '../consultants/consultants.service'
// #2987.56 — la file des notes de frais en attente d'une décision.
import { ExpenseReportsService } from '../expenses/expense-reports.service'
// #2327.26 — la lecture derrière `explain_talent_duplicate` : la MÊME
// résolution que `GET :id/identity`, jamais une seconde vérité.
import { TalentIdentityService } from '../consultants/talent-identity.service'
import { DeliveryService } from '../delivery/delivery.service'
// #2409.8 — la checklist de démarrage (verdict + réserves NOMMÉES), pour que
// Laura l'annonce en conversation. Le MÊME calcul que l'écran (GA-26).
import { MissionStartReadinessService } from '../delivery/mission-start-readiness.service'
// #3182.2 (épopée #3248) — l'historique de staffing PAR COMPTE (`listForAccount`),
// pour que Laura retrouve elle-même les consultants déjà positionnés chez un
// compte, jamais un vivier balayé en entier.
import { StaffingService } from '../delivery/staffing.service'
// #2423.9 — les avenants déjà proposés sur une mission, lus pour vérifier son
// appartenance à l'espace avant que Laura n'en prépare un nouveau.
import { MissionAmendmentService } from '../delivery/mission-amendment.service'
import { withoutAssigneePhotos } from './assignee-photos'
import { DAY_CLOSURE_CARD_STATES, dayClosureCardsToValidate } from './day-closure-cards'
import { InvoiceReadinessService } from '../delivery/invoice-readiness.service'
import { MatchingService } from '../consultants/matching/matching.service'
// #3865.2 (lot X05, 08/10) — le matching INVERSE (« à quels besoins ce profil
// répond-il ? »), déjà servi à l'écran (`POST consultants/:id/match-inverse`)
// mais sans appelant côté conversation.
import { InverseMatchingService } from '../consultants/matching/inverse-matching.service'
// #3182.3 (épopée #3248) — la MÊME fonction pure que `previewSubmission`
// (matching.controller.ts), jamais un second calcul (GA-26).
import { submissionPreflight } from '../consultants/matching/submission-preflight'
import { MissionScoresService } from '../delivery/mission-scores.service'
import { ForecastHorizonsService } from '../delivery/forecast-horizons.service'
import { RevenueService } from '../delivery/revenue.service'
import { OpenNeedsService } from '../projects/open-needs.service'
import { ProjectPipelineService } from '../projects/project-pipeline.service'
import { ProjectsService } from '../projects/projects.service'
import {
  NeedCommercialStateService,
  type NeedJournalEntry,
  type NeedMissionSummary,
} from '../projects/need-commercial-state.service'
// #2985 — le MÊME plan que l'onglet Plan (`ActionPlanItemsService.listForAccount`),
// pour distinguer les actions réalisées des non avancées dans la revue manager.
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { MessageLibraryService } from '../message-library/message-library.service'
import { SharedBaseReaderService } from '../shared-base/shared-base-reader.service'
import { DealProbabilityService } from '../projects/deal-probability.service'
import { sharedAnonymousRolesForCompany, sharedCompanyOfAccount } from '../shared-base/shared-company-facts-writes'
import { SendTimingService } from '../actions/send-timing.service'
import { MethodRuleOutcomesService } from '../actions/method-rule-outcomes.service'
import { RfpService } from '../rfp/rfp.service'
import { RoutinesService } from '../routines/routines.service'
import { TalentPoolService } from '../consultants/talent-pool.service'
import { TimesheetsService } from '../delivery/timesheets.service'
import { PlaybooksService } from '../playbooks/playbooks.service'
import { QualificationLeadsService } from '../qualification-leads/qualification-leads.service'
import { LauraProbeService } from '../laura/laura-probe.service'
import { LauraService } from '../laura/laura.service'
import { WeakestLinkDiagnosisService } from '../weakest-link-diagnosis/weakest-link-diagnosis.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ProposalsService } from '../proposals/proposals.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { resolveQualificationLeads } from './qualification-lead-resolve'
import {
  CopilotAccountAccessDto,
  CopilotAnalysisPlanDto,
  CopilotAnalysisStartDto,
  CopilotAccessBySirenDto,
  CopilotRelationStagesBySirenDto,
  CopilotProofSectorGroupsDto,
  CopilotAccountPartnersDto,
  CopilotQualificationLeadDecisionsDto,
  CopilotQualificationLeadResolveDto,
  CopilotAccountsToActDto,
  CopilotActionsAwaitingOutcomeDto,
  CopilotMessageTemplateSelectDto,
  CopilotMessagePreSendCheckDto,
  CopilotCommercialLoadCapacityDto,
  CopilotFollowAnalysisBatchDto,
  CopilotPortfolioPrioritiesDto,
  CopilotSimilarCasesDto,
  CopilotChannelPerformanceDto,
  CopilotFocusReviewDto,
  CopilotAccountSignalsDto,
  CopilotEngagementReportDto,
  CopilotAgendaEventsDto,
  CopilotBriefingDto,
  CopilotDayClosureDto,
  CopilotCapacityDto,
  CopilotForecastHorizonsDto,
  CopilotContactsCountDto,
  CopilotFindNeedsDto,
  CopilotFreeSlotsDto,
  CopilotAccountNotesDto,
  CopilotAccountTimelineDto,
  CopilotAccountContactsDto,
  // #2308 — même forme que les deux ci-dessus.
  CopilotAccountCoverageMapDto,
  // #2985 — même forme, encore.
  CopilotAccountManagerReviewDto,
  // #2285.2 — même forme, encore.
  CopilotAccountIntelligenceContextDto,
  // #3277.1 — même forme, encore.
  CopilotAccountStrategy5PDto,
  // #3258.14 (épopée #3362, lot E25 30/09) — même forme, encore.
  CopilotAccountInterestPenetrabilityDto,
  CopilotChainBlockersDto,
  CopilotContactCollisionDto,
  CopilotContactPreflightDto,
  CopilotSendTimingDto,
  CopilotContradictedRulesDto,
  CopilotCrmCompanyPresenceDto,
  CopilotCrmPresenceDto,
  // #3182.2 — même forme, encore.
  CopilotAccountStaffingHistoryDto,
  CopilotInterventionsDto,
  CopilotInvoiceBlockersDto,
  CopilotJobChangesDto,
  CopilotMailSearchDto,
  CopilotMailThreadDto,
  CopilotBeeperChatDto,
  CopilotBeeperConversationsDto,
  CopilotMarketAliasDomainDto,
  CopilotMarketMemoryContextDto,
  CopilotMarketMemoryGroupContextDto,
  CopilotMarketMemorySearchDto,
  CopilotMatchDraftNeedDto,
  CopilotMatchNeedDto,
  CopilotMatchTalentNeedsDto,
  // #3182.3 — même forme, encore.
  CopilotSubmissionPreflightDto,
  CopilotMeetingBriefDto,
  CopilotMissionAmendmentsDto,
  CopilotNeedTransitionCheckDto,
  CopilotNeedIdDto,
  CopilotNeedTransitionsDto,
  CopilotProjectReadDto,
  CopilotMissionRisksDto,
  CopilotMissionStartReadinessDto,
  CopilotMissionsDto,
  CopilotDormantContactsDto,
  CopilotOverduePaymentsDto,
  CopilotPartnerPipelineDto,
  CopilotPipelineDto,
  CopilotAccountRexDto,
  CopilotProofProposalDto,
  CopilotProofsDto,
  CopilotProposalOutlineDto,
  CopilotReactivationDto,
  CopilotRevenueDto,
  CopilotRfpsDto,
  CopilotApprovalExplainDto,
  CopilotConsultantFeedbackDto,
  CopilotTalentIdentityExplainDto,
  CopilotTalentExperienceSearchDto,
  CopilotTalentSearchDto,
  CopilotTerritoryDto,
  CopilotTimesheetsDto,
  CopilotExpenseReportsPendingDto,
} from './dto/copilot-bridge.dto'

/**
 * Le pont interne du copilote vers la messagerie et l'agenda.
 *
 * Le problème qu'il résout : les jetons OAuth de l'utilisateur vivent ici, dans
 * NestJS, chiffrés au repos. Le service IA, lui, lit Supabase en direct et n'a
 * aucun moyen d'atteindre une boîte Gmail. Sans ce pont, le copilote ne peut
 * répondre à AUCUNE des soixante requêtes exécutables des méta-analyses —
 * « prépare une relance pour tous les prospects sans réponse depuis 7 jours »
 * suppose de lire une boîte.
 *
 * Trois verrous, parce qu'un pont entre services est exactement le genre de
 * chose qui devient une porte dérobée si on ne l'écrit pas correctement :
 *
 * 1. **`InternalSecretGuard`** — même gate que les autres routes internes
 *    (télémétrie, progression, seed démo). Sans `INTERNAL_API_SECRET` partagé,
 *    la route refuse.
 * 2. **LECTURE SEULE.** Aucun verbe d'écriture ici. Le copilote propose, et
 *    c'est le clic de l'utilisateur qui appelle l'endpoint authentifié par JWT
 *    (`POST /mailbox/drafts`, `POST /agenda/events`). La confirmation n'est pas
 *    une convention d'affichage : c'est l'absence de chemin d'écriture.
 * 3. **`userId` explicite dans le corps.** La route ne dérive rien d'un cookie
 *    ou d'un jeton porteur : l'appelant interne dit pour QUI il lit, et la
 *    résolution du workspace + des jetons se fait ensuite normalement. C'est le
 *    même contrat que le callback de progression (`progress.py`).
 */
/** #2327.26 — un rapprochement expliqué, tel que Laura peut le lire. Aucune
 *  confiance chiffrée : voir `talentIdentityExplain`. */
type TalentIdentityExplanationItem = { talentId: string; fullName: string | null; explanation: string }

/** `YYYY-MM-DD` dans N jours — le format que le filtre de disponibilité attend. */
function isoDateInDays(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

/** Le mois précédent (`YYYY-MM`) — le défaut des écrans mensuels. */
function previousMonth(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}

/** Le mois en cours (`YYYY-MM`) — le défaut de la capacité, qui parle de MAINTENANT. */
/** Mois lus quand on demande « les impayés » sans mois (#2852). */
const UNPAID_LOOKBACK_MONTHS = 12

/** Les `count` derniers mois, du mois de `now` inclus, au format AAAA-MM. */
function recentMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_unused, back) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * Le pipe, avec ses montants NON MESURÉS rendus comme tels.
 *
 * `pipelineSummary` additionne ce qui est saisi et compte à part ce qui ne
 * l'est pas — c'est juste, et l'écran affiche les deux côte à côte. Mais un
 * modèle ne lit qu'un champ à la fois : une colonne de douze projets dont
 * AUCUN ne porte de montant sort à `amount_cents: 0`, et « 0 € » se lit
 * « cette étape ne vaut rien » alors que la vérité est « personne n'a chiffré ».
 *
 * C'est exactement le défaut mesuré le 27/08 sur `/pilotage/finance`
 * (« Espéré · 580 lignes sans montant » affiché à 0 €), et la règle qui le
 * répare est déjà écrite deux fois dans le dépôt — `revenue.service.ts`
 * (raison `no_amount`) et `mission-scores.service.ts` (`withoutAmount >= count`).
 * Aucune somme n'est refaite ici : seul le VERDICT « ce total est-il mesuré ? »
 * est appliqué au résultat de l'agrégat.
 *
 * Trois cas, et le premier est le seul où zéro est VRAI :
 *  - aucune ligne : la colonne est vide, et une colonne vide vaut bien 0 € ;
 *  - des lignes, aucune chiffrée : `null`, et le compte des non chiffrées le dit ;
 *  - au moins une chiffrée : le total est un plancher, comme à l'écran.
 */
function pipelineWithMeasuredAmounts(summary: PipelineSummary) {
  const measured = (amountCents: number, count: number, withoutAmount: number) =>
    count > 0 && withoutAmount >= count ? null : amountCents
  return {
    ...summary,
    columns: summary.columns.map(column => ({
      ...column,
      amount_cents: measured(column.amount_cents, column.count, column.without_amount),
    })),
    total_amount_cents: measured(summary.total_amount_cents, summary.total_count, summary.total_without_amount),
    // Le signé porte la MÊME règle. Sans cette ligne il repartait brut, et une
    // suite d'affaires signées non chiffrées lui aurait dit « 0 € signé » —
    // c'est-à-dire le défaut qu'on vient de fermer, à un champ près.
    signed_amount_cents: measured(summary.signed_amount_cents, summary.signed_count, summary.signed_without_amount),
  }
}

/**
 * LOT 3 (perf), Défaut A — deux lectures étaient DÉJÀ bornées côté service
 * (`ChainsService.blockers`, `AccountsService.accountsAwaitingAction`) sans
 * jamais dire si le compte réel dépasse la borne : un espace avec 40 comptes
 * en attente et un espace qui en a exactement 20 rendaient la MÊME réponse.
 *
 * La technique : demander à la ressource UN élément de plus que ce qu'on
 * montre, couper à la borne affichée, et dire si le témoin surnuméraire est
 * arrivé. Aucun changement pour un espace dont le compte réel tient déjà
 * dans la borne — c'est le même nombre de lignes qu'avant.
 */
function capWithTruncationFlag<T>(rows: T[], displayLimit: number): { items: T[]; truncated: boolean } {
  return { items: rows.slice(0, displayLimit), truncated: rows.length > displayLimit }
}

const CHAIN_BLOCKERS_DISPLAY_LIMIT = 5
const ACCOUNTS_TO_ACT_DISPLAY_LIMIT = 20
/** #3211.9 — même borne d'affichage que les comptes à traiter. */
const ACTIONS_AWAITING_OUTCOME_DISPLAY_LIMIT = 20
/** #3427 — les exemples écartés nommés à Laura ; le total exact reste dit. */
const MESSAGE_TEMPLATE_REJECTED_DISPLAY_LIMIT = 10

/**
 * #3973 — le périmètre de lecture du brief de Laura : les outils décochés
 * (identifiants du registre) traduits en backends, et une famille décochée EN
 * ENTIER (`email`, `calendar`) qui exclut TOUS les siens — son bloc n'est alors
 * pas lu du tout. `null` = aucune exclusion qui touche le brief.
 */
function briefingReadScopeOf(
  toolProviders: readonly string[] | undefined,
  families: readonly string[] | undefined,
): BriefingReadScope | null {
  const excluded = new Set(families ?? [])
  const mailbox = excluded.has('email') ? [...mailboxProviderSchema.options] : mailboxProvidersExcludedBy(toolProviders)
  const agenda = excluded.has('calendar') ? [...agendaProviderSchema.options] : agendaProvidersExcludedBy(toolProviders)
  if (!mailbox.length && !agenda.length) return null
  return { mailbox: { excludedProviders: mailbox }, agenda: { excludedProviders: agenda } }
}
/**
 * #1956.14 — vérification 13/09 : ce que le modèle lit quand le SIÈGE n'a pas le
 * droit de l'effet demandé. Comme `plan_required`, le message dit quoi FAIRE : un
 * refus nu se reformule en « panne », et la personne réessaie ce qui ne passera
 * jamais.
 */
const ANALYSIS_FORBIDDEN_MESSAGE =
  'Ton rôle dans l’espace ne permet pas de lancer une analyse — l’écran la refuse aussi. ' +
  'Un responsable de l’espace peut t’accorder ce droit.'
const RECORDS_WRITE_FORBIDDEN_MESSAGE =
  'Ton rôle dans l’espace ne permet pas de lancer un classement — l’écran le refuse aussi. ' +
  'Un responsable de l’espace peut t’accorder ce droit.'

/** #3869.4 — « AAAA-MM-JJ » d'une date lue en base (Date ou chaîne), `null` si absente ou illisible. */
function isoDay(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

/** #3895 — combien de notes et quelle longueur Laura reçoit (la fiche garde l'intégral). */
const ACCOUNT_NOTES_CAP = 20
const ACCOUNT_NOTE_BODY_CAP = 800

@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
// #2442.4 (épopée #2879) — le span « connecteur » de chaque lecture du pont.
@UseInterceptors(ConnectorSpanInterceptor)
export class CopilotBridgeController {
  // #1791.2 — la seule trace disponible dans le périmètre de ce lot : le FAIT
  // qu'une lecture de connecteur a eu lieu, jamais son contenu (pas de nom de
  // contact, pas de montant). Ce n'est pas le journal d'activité visible par
  // l'utilisateur (`apps/api/src/modules/activities`, hors périmètre) — c'est
  // l'observabilité technique existante (Winston, corrélation Sentry), au même
  // endroit que le reste du dépôt.
  private readonly logger = new Logger(CopilotBridgeController.name)

  constructor(
    private readonly mailbox: MailboxService,
    private readonly agenda: AgendaService,
    private readonly briefing: BriefingService,
    private readonly talents: TalentService,
    private readonly delivery: DeliveryService,
    private readonly timesheetsService: TimesheetsService,
    private readonly readiness: InvoiceReadinessService,
    private readonly capitalisation: CapitalisationService,
    // BEL-SC-239 — le même plan que l'écran `/propositions`, jamais recalculé
    // une seconde fois : `buildForProject` reste l'unique assembleur.
    private readonly proposals: ProposalsService,
    private readonly playbooks: PlaybooksService,
    private readonly openNeeds: OpenNeedsService,
    private readonly matching: MatchingService,
    private readonly inverseMatching: InverseMatchingService,
    private readonly talentPool: TalentPoolService,
    // Le back-office (PDF 2 §5.1) : le pipe, le chiffre d'affaires et la
    // capacité. Trois lectures qui ont déjà leur calcul et leur écran — les
    // refaire ici produirait une seconde vérité.
    private readonly pipeline: ProjectPipelineService,
    private readonly revenue: RevenueService,
    private readonly missionScores: MissionScoresService,
    // #2425.8 — le prévisionnel par horizon (écart CA / cash expliqué).
    private readonly horizons: ForecastHorizonsService,
    private readonly rfps: RfpService,
    private readonly accounts: AccountsService,
    private readonly pilotage: PilotageService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly chains: ChainsService,
    private readonly laura: LauraService,
    private readonly lauraProbe: LauraProbeService,
    // BEL-SC-224 (#3253, P0) — le diagnostic du maillon faible commercial,
    // maison canonique nouvelle (KEEP sur `laura.health()`, voir le docblock
    // de `weakest-link-diagnosis.ts`).
    private readonly weakestLinkDiagnosis: WeakestLinkDiagnosisService,
    // Le second marché et l'accès (tome 6 §16). Cinq lectures qui ont toutes
    // déjà leur calcul et leur écran — les refaire ici produirait une seconde
    // vérité, et c'est exactement la faute que ce dépôt corrige depuis six
    // chantiers.
    private readonly accountAccessService: AccountAccessService,
    private readonly partners: PartnersService,
    private readonly partnerPipelineService: PartnerPipelineService,
    private readonly esnDirectory: EsnDirectoryService,
    private readonly ia: IaClient,
    private readonly contacts: ContactsService,
    private readonly conflicts: FieldConflictService,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    // Le 14e outil de territoire (`contacts/job-changes`) : le SCHÉMA, pas
    // `CrmRoutinesService` — voir le commentaire de `jobChanges` ci-dessous.
    @InjectRepository(AccountEntity)
    private readonly accountRows: Repository<AccountEntity>,
    // #1489 — Laura peut lancer une analyse. `AnalysisService` est le SEUL
    // chemin de lancement : le pont ne refait ni l'idempotence, ni la réserve
    // de crédits, ni la file. Il pose les questions, puis il appelle.
    private readonly analysis: AnalysisService,
    // #4462.9 — le classement « par où commencer » à la fin d'un lot d'analyses de Laura.
    private readonly batchFollow: LauraBatchFollowService,
    // #2148.11 — QUI a produit le dossier réutilisé (`analysisPlan` ci-dessous) :
    // `AnalysisModule` exporte déjà ce service, aucun câblage neuf. Un
    // contrôleur qui orchestre deux domaines est la composition normale du
    // framework (GA-07 ne porte que sur service → service).
    private readonly analysisRuns: AnalysisRunsService,
    private readonly credits: CreditsService,
    // #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE. Le SEUL
    // point d'entrée (GA-258) : ce contrôleur n'importe aucune de ses cinq
    // entités, seulement le service.
    private readonly marketMemory: MarketMemoryService,
    // #1822 / #1823 — Réglages et routines, en LECTURE. `RoutinesService` porte
    // déjà le catalogue et les blocages (écran Réglages › Routines) ;
    // `ImportService` porte l'historique des sessions (écran Réglages › Import).
    // Aucune écriture : la porte reste `_proposal()` côté service IA, au clic.
    private readonly routines: RoutinesService,
    private readonly imports: ImportService,
    // #4426.8 — les imports que l'écran d'historique liste (universels + « Dépose tes documents ») et le tiering posé.
    private readonly importOverview: ImportOverviewForLauraService,
    // #1952.4 (épopée #2844) — l'état des imports de CV en LOT déjà lancés
    // depuis l'écran (`cv_batch_import_jobs`), une file DISTINCTE de
    // `ImportService` (comptes/contacts/missions…). Toujours en LECTURE.
    private readonly cvBatchImport: CvBatchImportService,
    // #1791.2 — lire le CRM d'espace depuis la conversation. `CrmReadService`
    // est le SEUL provider consommé du module CRM : la lecture, jamais
    // l'export ni la synchronisation.
    private readonly crmRead: CrmReadService,
    // La trace visible (Louis, 10/09) : `ActivitiesService.recordCrmLookup`
    // est le SEUL provider consommé du module Activités — un contrôleur qui
    // orchestre deux domaines à la demande d'un utilisateur est la
    // composition normale du framework (GA-07 ne compte pas les
    // `.controller.ts`) ; ce n'est PAS un import service→service.
    private readonly activities: ActivitiesService,
    // #1822 (Lot 16) — APPENDÉS EN FIN de constructeur, jamais insérés au
    // milieu : un paramètre optionnel glissé plus haut a déjà décalé des specs
    // qui construisent ce contrôleur POSITIONNELLEMENT ailleurs dans ce dépôt.
    // Les deux réglages que Laura peut proposer de changer, en LECTURE seule.
    private readonly notifications: NotificationsService,
    // GA-07 — le jeton du PORT, jamais la classe concrète : voir
    // `deal-stage-sla.port.ts`. Résolu par `copilot-bridge.module.ts`.
    @Inject(DEAL_STAGE_SLA_PORT) private readonly dealStageSla: DealStageSlaPort,
    // #1822 — APPENDÉS EN FIN de constructeur, jamais insérés au milieu : un
    // paramètre glissé plus haut a déjà décalé des specs qui construisent ce
    // contrôleur POSITIONNELLEMENT ailleurs dans ce dépôt. Les trois LECTURES
    // de réglages ajoutées par ce lot.
    private readonly memory: MemoryService,
    private readonly workspaceTeam: WorkspaceTeamService,
    private readonly catalogues: CataloguesService,
    // #1943.5 — APPENDÉ EN FIN (les specs construisent ce contrôleur par position)
    // et optionnel : sans Action OS, l'analyse se lance exactement comme avant,
    // simplement sans suivi.
    @Optional() private readonly cards?: CopilotCardService,
    // #2271.19 — APPENDÉ EN FIN, optionnel comme `cards` juste au-dessus : la
    // timeline d'un compte, réutilisée par la conversation (`GET
    // /accounts/:id/timeline`, la MÊME lecture que l'écran de fiche). Sans lui,
    // la route refuse proprement plutôt que de faire tomber tout le pont.
    @Optional() private readonly timeline?: AccountTimelineService,
    // #2327.26 — APPENDÉ EN FIN, comme tous les précédents. Optionnel parce que
    // TypeScript refuse un paramètre requis après `cards` (optionnel,
    // juste au-dessus) — pas parce que la lecture serait facultative :
    // `ConsultantsModule` l'exporte depuis l'origine de ce module et le fournit
    // toujours en production.
    @Optional() private readonly talentIdentity?: TalentIdentityService,
    // #2308 — APPENDÉ EN FIN, comme tous les précédents. Optionnel pour la
    // même raison que `cards`/`timeline`/`talentIdentity` juste au-dessus :
    // sans lui, la route refuse proprement plutôt que de faire tomber le pont.
    @Optional() private readonly coverage?: CoverageService,
    // #2409.8 — APPENDÉ EN FIN, comme tous les précédents. Optionnel pour la
    // même raison que `coverage` juste au-dessus : sans lui, la route refuse
    // proprement plutôt que de faire tomber le pont.
    @Optional() private readonly startReadiness?: MissionStartReadinessService,
    // #2423.9 — APPENDÉ EN FIN, comme tous les précédents. Optionnel pour la
    // même raison que `startReadiness` juste au-dessus.
    @Optional() private readonly amendments?: MissionAmendmentService,
    // #2324.39 — APPENDÉ EN FIN, optionnel pour la même raison : l'état actuel
    // d'une opportunité, lu avant d'en proposer une mise à jour.
    @Optional() private readonly projects?: ProjectsService,
    // #2367.11 — APPENDÉ EN FIN, optionnel pour la même raison que les
    // précédents : le REX d'un push consultant, lu par Laura pour répondre
    // « pourquoi ce profil a été refusé ». `ConsultantsModule` l'exporte depuis
    // l'origine de ce module et le fournit toujours en production.
    @Optional() private readonly consultantsService?: ConsultantsService,
    // #2985 — APPENDÉ EN FIN, optionnel pour la même raison que les
    // précédents : sans lui, la revue manager refuse proprement plutôt que de
    // faire tomber tout le pont.
    @Optional() private readonly actionItems?: ActionPlanItemsService,
    // GA-333 (mesuré à l'intégration chantier A, 26/09) — APPENDÉ EN FIN,
    // optionnel comme tous les précédents (`@Optional()`, jamais requis pour
    // le CONSTRUCTEUR) : la revue manager ouvre un compte par son id
    // (`accountManagerReview`) et doit porter le MÊME périmètre de business
    // unit que le reste des ouvertures de compte (`resolveBusinessUnitScope`),
    // jamais un compte hors périmètre servi en silence.
    @Optional() private readonly businessUnits?: BusinessUnitService,
    // #2857 (#2201.31) — APPENDÉ EN FIN, optionnel pour la même raison que les
    // précédents : « Demander une explication » sur une carte de validation,
    // lu par Laura. `ActionOsModule` l'exporte depuis l'origine de ce module
    // et le fournit toujours en production.
    @Optional() private readonly approvalRunner?: WorkflowRunnerService,
    // #2285.2 (épopée #2786) — APPENDÉ EN FIN, optionnel pour la même raison
    // que les précédents : sans lui, la route refuse proprement plutôt que
    // de faire tomber le pont.
    @Optional() private readonly intelligenceContext?: AccountIntelligenceContextService,
    // #3277.1 (épopée #3277) — APPENDÉ EN FIN, optionnel pour la même raison
    // que tous les précédents : sans lui, la route refuse proprement plutôt
    // que de faire tomber le pont.
    @Optional() private readonly strategy5P?: AccountStrategy5PService,
    // #2339.1/.2/.5/.6/.11/.13 (épopée #2795) — APPENDÉ EN FIN, optionnel pour
    // la même raison que tous les précédents : sans lui, les six routes du
    // journal/handoff/doublons/NO-GO refusent proprement plutôt que de faire
    // tomber le pont. `ProjectsModule` l'exporte depuis l'origine de ce module.
    @Optional() private readonly needCommercialState?: NeedCommercialStateService,
    // #2987.56 — APPENDÉ EN FIN, optionnel pour la même raison que tous les
    // précédents : sans lui, la route refuse proprement plutôt que de faire
    // tomber le pont. La file des notes de frais qui attendent une décision
    // (valider/refuser), pour que Laura la propose pendant une conversation
    // (vocale comme texte) — jusqu'ici, elle ne savait que naviguer vers
    // `/expenses`, sans jamais dire QUOI y attend une décision.
    @Optional() private readonly expenseReports?: ExpenseReportsService,
    // #3260.8/.9 — APPENDÉ EN FIN, optionnel pour la même raison que tous les
    // précédents : sans lui, la préparation continue sans le garde-fou de
    // périmètre plutôt que de faire tomber le pont.
    @Optional() private readonly companies?: CompaniesService,
    // #3895 — les notes d'un compte, portée de groupe comprise (la MÊME lecture que l'onglet Notes).
    @Optional() private readonly notesService?: NotesService,
    // #3182.2 (épopée #3248) — APPENDÉ EN FIN, optionnel pour la même raison
    // que tous les précédents : sans lui, la route refuse proprement plutôt
    // que de faire tomber le pont. `DeliveryModule` l'exporte depuis
    // l'origine de ce module et le fournit toujours en production.
    @Optional() private readonly staffing?: StaffingService,
    // #3345.2 (LAU-FINAL-255, recette prod 30/09) — APPENDÉ EN FIN, optionnel
    // pour la même raison que tous les précédents : sans lui, la route
    // refuse proprement plutôt que de faire tomber le pont. Les décisions
    // déjà prises sur les pistes à qualifier d'un compte (écartée / mise en
    // veille), pour que Laura ne repropose jamais une piste que l'écran
    // Opportunités a déjà tranchée — MÊME lecture que `QualificationLeadsController
    // .decisions` (`QualificationLeadsModule` l'exporte depuis l'origine du module).
    @Optional() private readonly qualificationLeads?: QualificationLeadsService,
    // #3258.14 (épopée #3362, lot E25 30/09) — APPENDÉ EN FIN, optionnel pour
    // la même raison que tous les précédents : sans lui, la route refuse
    // proprement plutôt que de faire tomber le pont. `AccountsModule` l'exporte
    // déjà (voir son docblock, même exception que `AccountStrategy5PService`).
    @Optional() private readonly interestPenetrability?: AccountInterestPenetrabilityService,
    // #3289 (#3264.31/.32/.33) — APPENDÉ EN FIN, optionnel pour la même raison
    // que tous les précédents : sans lui, la route refuse proprement plutôt que
    // de faire tomber le pont. `ActionsModule` l'exporte déjà.
    @Optional() private readonly sendTiming?: SendTimingService,
    // #3289 (#3264.41) — APPENDÉ EN FIN, optionnel pour la même raison.
    @Optional() private readonly methodRuleOutcomes?: MethodRuleOutcomesService,
    // #3427 — APPENDÉ EN FIN, optionnel comme tous les précédents : sans lui,
    // le choix d'un modèle approuvé refuse proprement.
    @Optional() private readonly messageLibrary?: MessageLibraryService,
    // P05 (#3246, lot 09/10) — APPENDÉ EN FIN, optionnel comme tous les
    // précédents : la base anonyme commune (`c92_base_anonyme_commune`). Sans
    // elle, Laura répond « chez nous » et NOMME la base commune indisponible.
    @Optional() private readonly sharedBase?: SharedBaseReaderService,
    // #4016.1d — APPENDÉ EN FIN, optionnel comme tous les précédents : sans lui,
    // `pipeline/probable-quarter` répond `unavailable`, jamais un chiffre inventé.
    @Optional() private readonly dealProbability?: DealProbabilityService,
    // #4406.5 — APPENDÉ EN FIN, optionnel comme tous les précédents : sans lui, les deux lectures
    // Beeper répondent `disconnected`, jamais une liste vide inventée.
    @Optional() private readonly beeper?: BeeperService,
  ) {}

  /* ── Lancer une analyse depuis la conversation (#1489) ─────────────────── */

  /**
   * PRÉPARER — ce qu'on sait déjà, ce que ça coûte, et ce qu'on demande avant.
   *
   * *« Elle pourrait même questionner : qu'est-ce que tu connais de ce
   * compte. »* Ce que le commercial sait oriente toute la collecte, et c'est
   * exactement ce que `user_context` porte jusqu'aux prompts.
   *
   * ⚠️ Cet appel ne lance RIEN et ne débite RIEN. Il rend un jeton, et c'est le
   * seul moyen d'obtenir celui que le lancement exige — la question posée
   * d'abord n'est donc pas une consigne de prompt, c'est la forme du chemin.
   *
   * ⚠️ Un compte déjà analysé est DIT, avec sa date. Relancer reste possible —
   * un dossier de mars n'est pas un dossier d'aujourd'hui — mais on ne débite
   * pas un crédit sans que la personne sache qu'il en existe déjà un.
   */
  @Post('analysis/plan')
  // #1957.3 — annotation EXPLICITE, à plat (tout optionnel) : le spread
  // conditionnel `...(objectsCount ? { objectsCount } : {})` ci-dessous fait
  // sinon inférer à TypeScript une UNION stricte entre le refus (`error`,
  // `message`) et le succès, qui casse l'accès direct `plan.questions` /
  // `plan.planToken` déjà utilisé partout dans les tests (aucune narrowing
  // par `'error' in plan`, comme depuis toujours sur cette méthode).
  async analysisPlan(@Body() dto: CopilotAnalysisPlanDto): Promise<{
    error?: string
    message?: string
    account?: {
      id: string
      companyName: string
      status: string
      analysedAt: string | null
      // #2148.11 — le prénom du COLLÈGUE qui a produit ce dossier réutilisé,
      // jamais SOI-MÊME (« déjà connu » ne se nomme pas à qui l'a fait) ni un
      // nom deviné : `null` sur un run introuvable, un auteur qui a quitté
      // l'espace, ou un dossier que l'appelant a lui-même produit.
      analysedByName: string | null
    } | null
    objectsCount?: number
    // #2263.1 — les sources DÉJÀ interrogées avec un résultat, en plus du
    // cache d'analyse (`account` ci-dessus) : jamais une liste vide (GA-18/GA-19).
    knownFrom?: Array<'crm' | 'marketMemory'>
    // #3260.8/.9 — le périmètre suggéré, seulement quand l'entité est une
    // GRANDE ENTREPRISE et qu'aucun périmètre n'a déjà été précisé. `null`
    // n'apparaît jamais ici : absent = rien à dire (GA-18/GA-19).
    scopeGuardrail?: AnalysisScopeGuardrail
    preset?: AnalysisContextPreset
    questions?: ReturnType<typeof analysisQuestionsFor>
    planToken?: string
  }> {
    // #1956.14 — vérification 13/09 : `GET /analysis/launch-plan`, l'équivalent
    // écran, exige `analysis:run`. Refuser DÈS la préparation évite de poser des
    // questions à quelqu'un dont le « go » serait refusé de toute façon.
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    if (!can(role, await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId), 'analysis:run')) {
      return { error: 'analysis_forbidden', message: ANALYSIS_FORBIDDEN_MESSAGE }
    }

    // ⚠️ La lecture du cache de résultats, telle quelle — c'est elle qui sait
    // déjà ce qu'est « un dossier assez frais », et refaire la fenêtre ici en
    // ferait une seconde vérité. Une fenêtre très large : la question n'est pas
    // « faut-il réutiliser » mais « y a-t-il déjà quelque chose à lire ».
    const existing = await this.accounts.findCompletedByUserAndCompany(dto.userId, dto.company, { maxAgeDays: 3650 })
    // Le preset suit ce qu'on SAIT : un compte déjà au portefeuille est un
    // compte connu, et lui poser les questions d'un compte froid ferait
    // redemander ce que le dossier porte déjà.
    const preset: AnalysisContextPreset = existing ? 'known-account' : 'free'

    // #1957.3 — le nombre de sources/objets visés, sur la MÊME carte que le
    // coût : les contacts déjà en portefeuille sur CE compte, que l'analyse va
    // re-visiter. Mesurable SEULEMENT pour un compte CONNU — un compte neuf
    // n'a encore rien à re-visiter, et deviner un nombre serait justement ce
    // que GA-18/GA-19 interdit. Best-effort : une panne du comptage ne doit
    // jamais faire échouer la préparation, et un compte à 0 reste ABSENT,
    // jamais affiché comme un zéro mesuré (le nom canonique du dossier prime
    // sur la graphie tapée dans la conversation, comme `_analysis_card` côté IA).
    let objectsCount: number | undefined
    if (existing) {
      try {
        const count = await this.contacts.countForUser(dto.userId, { company: existing.company_name })
        if (count > 0) objectsCount = count
      } catch {
        // Non mesuré, jamais 0 : la préparation continue sans ce nombre.
      }
    }

    // #2263.1 — « réutiliser tout ce que Bellum sait avant une analyse
    // payante » : ce gate ne lisait QUE le cache d'analyse (`existing`
    // ci-dessus). Un SEUL appel agrège désormais aussi le CRM et Market
    // Memory — les deux autres sources déjà lisibles ailleurs dans ce
    // contrôleur (`crmPresence`, `accountCoverageMap`). DataForge n'a pas
    // d'équivalent nommé côté serveur (#2263.7 : c'est le référentiel
    // sectoriel du prompt IA, déjà classé « déjà là »).
    //
    // Best-effort STRICT et additif : une permission absente ou une panne ne
    // fait JAMAIS échouer la préparation, et une source sans résultat ne fait
    // aucune ligne — jamais un `knownFrom` vide (GA-18/GA-19, « on n'affiche
    // pas ce qu'on n'a pas »).
    const knownFrom: Array<'crm' | 'marketMemory'> = []
    if (can(role, await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId), 'crm:read')) {
      try {
        const presence = await this.crmRead.findAccountPresence(dto.userId, { account: dto.company })
        if (presence.matched) knownFrom.push('crm')
      } catch {
        // Non mesuré : la préparation continue sans cette source.
      }
    }
    try {
      const read = await this.marketMemory.coverageFor({ ref: dto.company, name: dto.company })
      if (read.status === 'ok' && read.coverage.covered) knownFrom.push('marketMemory')
    } catch {
      // Non mesuré : la préparation continue sans cette source.
    }

    // #2148.11 — la PROVENANCE du dossier réutilisé, DANS l'espace : jamais
    // cross-workspace (`agent_docs/doctrine.md:35-36`, GA-43 — les espaces
    // sont des ESN concurrentes). Best-effort STRICT : une lecture en échec ou
    // un auteur introuvable ne casse jamais la préparation, et ne nomme
    // jamais personne au hasard — seulement quand c'est CERTAIN.
    let analysedByName: string | null = null
    if (existing) {
      try {
        const authorId = await this.analysisRuns.getLastRunUserId(existing.id)
        if (authorId) {
          const members = await this.workspaceContext.listMembers(dto.userId)
          const author = members.find(member => member.userId === authorId)
          if (author && !author.isSelf && author.fullName) analysedByName = author.fullName
        }
      } catch {
        // Non mesuré : « déjà connu » reste vrai, seul le nom reste absent.
      }
    }

    // #3260.8/.9 (BEL-SC-231) — « Analyse Société Générale », sans plus de
    // précision, ne doit jamais partir en silence sur le groupe entier quand
    // le registre classe l'entité GRANDE ENTREPRISE. Seulement sur le chemin
    // FROID (`!existing`) : un compte déjà analysé porte son propre périmètre
    // (relancer n'est pas une première analyse), et ne justifie pas un second
    // appel réseau pour une donnée qu'on n'utilisera pas. Best-effort STRICT,
    // comme `knownFrom` juste au-dessus : une panne du registre, ou un
    // `CompaniesService` non câblé (`@Optional()`), laissent la préparation
    // continuer SANS le garde-fou — jamais une taille devinée (GA-18/GA-19).
    //
    // #3434 (recette prod 03/10, « Analyse Michelin. ») — trois trous refermés :
    //  1. le garde ne regardait que le rang 0 d'une recherche à 1 résultat : on
    //     cherche 8 et on juge le PLUS GROS homonyme dont le nom correspond ;
    //  2. une tranche ouverte (« 10 000 salariés et plus ») donne son plancher ;
    //  3. un dossier existant SANS périmètre (run au groupe entier, ou aucun run
    //     lisible) pose la question avant une nouvelle analyse payante. Un dossier
    //     déjà cadré, ou une demande qui NOMME déjà son périmètre, n'en pose pas.
    let scopeGuardrail: AnalysisScopeGuardrail | null = null
    let suggestionsCount: number | null = null
    let candidate: CompanySuggestion | null = null
    if (this.companies && !companyNamesScope(dto.company)) {
      try {
        const existingIsUnscoped = existing ? await lastRunIsUnscoped(this.analysisRuns, existing.id) : true
        if (existingIsUnscoped) {
          const { suggestions } = await this.companies.search(dto.company, 8)
          suggestionsCount = suggestions.length
          candidate = pickScopeCandidate(dto.company, suggestions)
          scopeGuardrail = analysisScopeGuardrailFor(
            {
              sizeClass: candidate?.size_class ?? null,
              headcountLabel: candidate?.headcount_label ?? null,
              // Le chemin Pappers ne rend QUE l'effectif min/max.
              employeesMin: candidate?.employees_min ?? null,
            },
            dto.locale ?? 'fr',
          )
        }
      } catch {
        // Non mesuré : la préparation continue sans le garde-fou.
      }
    }
    // Lisible en recette : comptes et classes seulement, aucune donnée personnelle ni secret.
    this.logger.log('analysis_plan_scope', {
      suggestionsCount,
      candidateSizeClass: candidate?.size_class ?? null,
      candidateHeadcountFloor: candidate ? headcountFloorOf(candidate) : null,
      existing: Boolean(existing),
      scopeRequired: Boolean(scopeGuardrail),
    })

    return {
      account: existing
        ? {
            id: existing.id,
            companyName: existing.company_name,
            status: existing.status,
            analysedAt: existing.updated_at?.toISOString() ?? null,
            analysedByName,
          }
        : null,
      // #4464 — ni coût ni solde vers Laura : crédits implicites, le frein est doux.
      ...(objectsCount ? { objectsCount } : {}),
      ...(knownFrom.length ? { knownFrom } : {}),
      ...(scopeGuardrail ? { scopeGuardrail } : {}),
      preset,
      questions: analysisQuestionsFor(preset, dto.locale ?? 'fr'),
      planToken: issueAnalysisPlanToken(dto.userId, dto.company),
    }
  }

  /**
   * LANCER — après les questions, et seulement avec le jeton qu'elles ont rendu.
   *
   * ⚠️ `answers` peut être VIDE, et c'est la décision de Louis du 05/09 :
   * « possibilité de go sans avoir répondu à tout ». Tous les champs de contexte
   * sont facultatifs au contrat ; un objet vide produit un contexte valide, et
   * le run part comme il serait parti depuis l'écran sans rien saisir.
   *
   * ⚠️ Une seule analyse par appel. « Analyse ces douze comptes » n'a pas de
   * forme ici : douze crédits ne se débitent pas sur une phrase, ils se
   * débitent sur l'écran Découvrir, qui annonce le total avant.
   */
  /**
   * #4462.9 — Laura déclare un lot d'analyses lancé depuis une liste de noms. Rien ne s'écrit en base : la fin du
   * lot (la dernière analyse terminée) pose une notification portant le classement « par où commencer ».
   */
  @Post('analysis/follow-batch')
  async analysisFollowBatch(@Body() dto: CopilotFollowAnalysisBatchDto) {
    await this.batchFollow.follow(dto.userId, dto.launched, dto.known)
    return { ok: true }
  }

  @Post('analysis/start')
  async analysisStart(@Body() dto: CopilotAnalysisStartDto) {
    // #1956.14 — vérification 13/09 : LE MÊME DROIT QUE L'ÉCRAN. Ce pont n'est
    // gardé que par le secret interne, et `AnalysisService.start` ne vérifie
    // aucun rôle : un siège `viewer`, `recruiter`, `finance` ou `tech_admin`
    // lançait par la conversation une analyse PAYANTE que `POST /analysis/start`
    // lui refuse en 403 (`@RequirePermission('analysis:run')`). Même résolution
    // que `WorkspacePermissionGuard` — rôle, PUIS accords en propre, via `can`.
    // Vérifié ICI aussi, et pas seulement à la préparation : un jeton vit trente
    // minutes, un rôle peut changer entre les deux.
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    if (!can(role, await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId), 'analysis:run')) {
      return { error: 'analysis_forbidden', message: ANALYSIS_FORBIDDEN_MESSAGE }
    }

    if (!verifyAnalysisPlanToken(dto.planToken, dto.userId, dto.company)) {
      // Le message est lu par le modèle : il doit dire quoi FAIRE, pas
      // seulement que c'est refusé.
      return { error: 'plan_required', message: 'Prépare d’abord l’analyse — le jeton est absent ou périmé.' }
    }

    const preset = dto.preset ?? 'free'
    const answers = dto.answers ?? {}
    // ⚠️ Les réponses sont FILTRÉES sur les champs du preset. Le modèle peut
    // inventer une clé ; `analysisContextSchema` est `.strict()` derrière et
    // rejetterait tout le contexte pour un champ de trop — donc on perdrait les
    // réponses justes à cause d'une clé fautive.
    const fields = new Set(analysisContextFields(preset))
    const context = Object.fromEntries(
      Object.entries(answers).filter(([key, value]) => fields.has(key) && String(value).trim() !== ''),
    )

    const parsed = analysisContextSchema.safeParse({ preset, ...context })
    const startedAt = new Date()
    const started = await this.analysis.start(
      {
        company_name: dto.company,
        // Un contexte illisible ne fait pas échouer le lancement : on part sans
        // lui, plutôt que de refuser une analyse pour une réponse mal formée.
        ...(parsed.success ? { user_context: parsed.data } : {}),
        // #2624.1 — territoire, taille, exclusions : déclarés au DTO ci-dessus,
        // il restait à les transmettre jusqu'à `AnalysisService.start`, comme
        // le fait l'écran de confirmation (`useAnalysis.ts`).
        scope_mode: dto.scope_mode,
        scope_selection: dto.scope_selection,
        // #3704.5 — l'identité légale d'une cible trouvée par la recherche : ancre le run.
        ...(dto.siren ? { siren: dto.siren } : {}),
        // #3218 (lot RAW) — la relance demandée court-circuite le cache de résultat
        // (`cache_hit`) et rafraîchit le dossier EN PLACE, même accountId, un crédit.
        ...(dto.relaunch === true ? { relaunch: true } : {}),
      } as StartAnalysisDto,
      dto.userId,
    )

    if (isFailure(started)) {
      return { error: started.problem.code ?? 'start_failed', message: started.problem.message ?? null }
    }
    // #1943.5 — SUIVI seul dans Action OS, facturation inchangée (arbitrage du
    // 12/09) : `AnalysisService.start` a déjà débité ; on inscrit le suivi avec le
    // débit que le REGISTRE montre (I4), sans rien réserver (I3). Le suivi ne fait
    // jamais échouer un lancement déjà payé.
    await trackConversationAnalysisLaunch(
      {
        cards: this.cards,
        ledger: this.credits,
        isDemo: userId => this.workspaceContext.isDemoWorkspace(userId),
        onError: error => this.logger.warn('Suivi de l’analyse lancée depuis la conversation non inscrit', { error }),
      },
      {
        userId: dto.userId,
        accountId: started.output.accountId,
        jobId: started.output.jobId,
        launched: started.output.launched,
        reason: started.output.reason ?? null,
        startedAt,
      },
    )
    return {
      accountId: started.output.accountId,
      jobId: started.output.jobId,
      launched: started.output.launched,
      reason: started.output.reason ?? null,
      contextUsed: parsed.success ? Object.keys(context) : [],
    }
  }

  /* ── Laura Produit (PDF 10 §5.8) ───────────────────────────────────────── */

  /**
   * Ce que Laura sait de la personne à qui elle parle.
   *
   * Le §5.2 appelle ça la « couche contexte utilisateur ». Ce qui la rend utile
   * n'est pas la quantité mais le fait qu'elle évite la question : une assistante
   * qui redemande le prénom au dixième message n'en est pas une.
   */
  @Post('laura/user-context')
  async lauraUserContext(@Body() dto: { userId: string }) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // ⚠️ L'outil ne rendait QUE l'espace et l'interrupteur : il ne pouvait pas
    // tenir la promesse écrite au-dessus. Une assistante qui redemande le
    // prénom au dixième message n'en est pas une — et c'était le cas.
    //
    // Ce qui sort ici est le strict nécessaire pour ne pas reposer une question
    // dont on a déjà la réponse : le prénom et le rôle. Rien de l'activité, rien
    // du portefeuille, rien qui ressemble à un profil — le modèle n'a pas
    // besoin de savoir ce que la personne a fait pour éviter de la vouvoyer.
    const profile = await this.profiles.findOne({
      where: { id: dto.userId },
      select: { id: true, first_name: true },
    })
    return {
      workspace_id: workspaceId,
      laura_enabled: await this.laura.isEnabled(dto.userId),
      // `null` et jamais une chaîne vide : « je ne connais pas son prénom » et
      // « son prénom est vide » se lisent différemment côté modèle.
      first_name: profile?.first_name?.trim() || null,
      role,
    }
  }

  /**
   * L'état de l'espace — **la CAUSE, jamais la note**.
   *
   * Le §5.6 pose le score comme interne, et D50 en fait un signal COMMERCIAL :
   * « alerte l'équipe BellumAI, pas seulement l'utilisateur ». Le renvoyer au
   * modèle reviendrait à le mettre à un tour de conversation de la phrase « ton
   * espace est à 38 sur 100 », que personne n'a envie de lire sur son propre
   * outil. Ce qui sort ici est l'axe le plus coûteux et ce qui n'a pas pu être
   * mesuré ; le chiffre reste au back-office.
   */
  @Post('laura/workspace-health')
  async lauraWorkspaceHealth(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const health = this.laura.health(await this.lauraProbe.measure(workspaceId))
    return {
      main_cause: health.mainCause,
      not_evaluable: health.notEvaluable,
      // `null` quand il n'y a pas assez d'axes : « je ne sais pas » et « tout va
      // mal » demandent deux réponses opposées.
      measurable: health.score !== null,
      missing_axes: health.missingAxes,
    }
  }

  /**
   * Ce qui EMPÊCHE de travailler, en clair.
   *
   * `null` veut dire « je n'ai pas pu regarder » et `[]` veut dire « rien à
   * signaler » : une routine qui annonce « aucun blocage » parce qu'un serveur
   * était en maintenance est pire que pas de routine.
   */
  @Post('laura/blocking-issues')
  async lauraBlockingIssues(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return { issues: await this.lauraProbe.blockingIssues(workspaceId) }
  }

  /**
   * BEL-SC-224 (#3253, P0) — le maillon faible commercial principal : le SEUL
   * point qui limite le plus, avec sa preuve. Laura lit le MÊME diagnostic que
   * les écrans « Aujourd'hui » et « Pilotage » (`WeakestLinkDiagnosisService`,
   * appelée nulle part ailleurs pour ce calcul).
   */
  @Post('laura/weakest-link-diagnosis')
  async lauraWeakestLinkDiagnosis(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.weakestLinkDiagnosis.diagnoseFor(workspaceId)
  }

  /**
   * Quelles familles de fonctionnalités ont produit quelque chose.
   *
   * Ce n'est pas de l'usage au sens strict — le dépôt n'a aucune télémétrie par
   * fonctionnalité, et en inventer une produirait un chiffre invérifiable. C'est
   * l'EXISTENCE d'objets, ce qui est exactement la définition que le §5.6 donne
   * de l'axe « profondeur », et ce qui se vérifie en ouvrant l'écran.
   */
  @Post('laura/feature-adoption')
  async lauraFeatureAdoption(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const measured = await this.lauraProbe.measure(workspaceId)
    return { depth: measured.depth, connectors: measured.connectors, team_adoption: measured.teamAdoption }
  }

  /**
   * #1823 — les routines, comme l'écran Réglages › Routines les voit.
   *
   * `RoutinesService.list` MATÉRIALISE les défauts manquants (effet de bord
   * assumé, voir sa doc) : cet appel a donc la même conséquence qu'ouvrir
   * l'écran. Rien d'autre n'est refait ici — la définition, l'abonnement et les
   * blocages sont ceux du catalogue, pas une seconde vérité.
   *
   * ⚠️ `dto.locale` choisit `name`/`outcome`, jamais le reste : le contrat sait
   * FR et EN, et un copilote qui répond en anglais avec des libellés français
   * romprait la même promesse que deux voix pour Laura.
   */
  @Post('laura/routines-summary')
  async lauraRoutinesSummary(@Body() dto: { userId: string; locale?: 'fr' | 'en' }) {
    const locale = dto.locale === 'en' ? 'en' : 'fr'
    const views = await this.routines.list(dto.userId)
    return {
      // #1822 — LES BORNES, SERVIES plutôt que recopiées.
      //
      // `toggle_routine` propose désormais l'heure, le jour et le canal, pas
      // seulement l'état. Le service IA doit donc les connaître — et une copie
      // Python de « 0-23 », « 1-7 » et des deux canaux aurait été une TROISIÈME
      // vérité, dans un langage sans compilateur pour la rapprocher des deux
      // autres. Elles viennent d'ici, du contrat partagé, comme le catalogue
      // des champs de `laura/settings-overview` : un réglage vit à un seul
      // endroit (GA-26).
      //
      // `routineChannelSchema.options` plutôt qu'un tableau écrit à la main :
      // un canal ajouté à l'énumération arrive ici sans qu'on y pense.
      bounds: {
        hour: ROUTINE_SCHEDULE_BOUNDS.hour,
        weekday: ROUTINE_SCHEDULE_BOUNDS.weekday,
        channels: routineChannelSchema.options,
      },
      routines: views.map(view => ({
        key: view.definition.key,
        label: view.definition.name[locale],
        outcome: view.definition.outcome[locale],
        cadence: view.definition.cadence,
        enabled: view.subscription.enabled,
        hour: view.subscription.hour,
        weekday: view.subscription.weekday,
        channel: view.subscription.channel,
        blockers: view.blockers,
        last_run_at: view.lastRunAt,
        last_outcome: view.lastOutcome,
      })),
    }
  }

  /**
   * #1820 — ce que l'assistant d'import sait faire, et ce que CET espace a déjà
   * fait avec.
   *
   * ⚠️ Ni `key` de source ni `source` de session ne sortent : trois clés du
   * catalogue (`hubspot_export`, `boondmanager_export`,
   * `salesconnect_legacy_export`) nomment un éditeur, et la règle du dépôt ne
   * l'autorise qu'à Réglages › Intégrations — jamais dans ce que le modèle
   * reçoit. `objects` (compte, contact, mission…) dit la même chose par la
   * CAPACITÉ, ce qui suffit à répondre « qu'est-ce que je peux importer ».
   */
  @Post('laura/import-overview')
  async lauraImportOverview(@Body() dto: { userId: string }) {
    const workspaceId = (await this.workspaceContext.resolveActiveWorkspace(dto.userId)).workspaceId
    // LOT 18 (GA-326) — `ImportService.list` fetch DÉJÀ tout ce qu'il rend
    // (borné à 50 en SQL, `import.service.ts`) : `sessions` est donc
    // ENTIÈREMENT en mémoire avant la coupe ci-dessous. Comparer sa longueur
    // au nombre affiché ne devine rien — même motif que
    // `capWithTruncationFlag` un peu plus haut dans ce fichier.
    const sessions = await this.imports.list(workspaceId)
    const recentSessionsDisplayLimit = 5
    // #1952.4 (épopée #2844) — la file d'import de CV EN LOT est un domaine
    // SÉPARÉ de `ImportService` (aucune conversion, aucun deuxième calcul) :
    // même limite d'affichage, même discipline de LECTURE seule.
    const cvBatchJobs = await this.cvBatchImport.listRecentJobs(workspaceId, recentSessionsDisplayLimit)
    // #4426.8 — LA MÊME source que l'historique de /settings/import : sans elle, Laura niait un import visible à l'écran.
    const screenImports = await this.importOverview.read(workspaceId, dto.userId)
    return {
      universal_imports: screenImports.universal_imports,
      context_pack_imports: screenImports.context_pack_imports,
      tiering: screenImports.tiering,
      sources: IMPORT_CATALOG.map(source => ({
        objects: source.objects,
        // ⚠️ #1889 — CE QUI ÉCRIT VRAIMENT, et pas seulement ce qui se simule.
        // Sans cette clé, Laura annonçait la reprise des consultants, des
        // besoins et des missions : elles se déclarent, elles se simulent, et
        // l'`apply` les refuse par leur nom. Elle promettait donc un geste que
        // le produit refuse à la fin — le pire endroit pour le découvrir.
        writable_objects: source.objects.filter(objet => isWritableImportObject(objet)),
        format: source.format,
        readable: isReadableImportFormat(source.format),
        tier: source.tier,
        imports: source.imports,
        skips: source.skips,
      })),
      recent_sessions: sessions.slice(0, recentSessionsDisplayLimit).map(session => ({
        object_type: session.object_type,
        state: session.state,
        created_at: session.created_at.toISOString(),
        applied_at: session.applied_at ? session.applied_at.toISOString() : null,
        created_count: session.created_count,
        updated_count: session.updated_count,
        error: session.error,
      })),
      recent_sessions_truncated: sessions.length > recentSessionsDisplayLimit,
      // Jamais les `outcomes` fichier-par-fichier ici : un résumé chiffré, pas
      // un journal complet — la même coupe que `recent_sessions` ci-dessus.
      cv_batch_jobs: cvBatchJobs.map(job => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        total: job.total,
        processed: job.processed,
        summary: job.summary,
        error: job.error,
        // #1952.22 (épopée #2844) — ETA MESURÉE, jamais devinée : le débit
        // réel de CE job (`created_at`/`updated_at`), jamais une durée par
        // type de fichier inventée. `null` tant que rien n'a encore été
        // traité, ou une fois le job terminé.
        eta_seconds: job.etaSeconds,
      })),
    }
  }

  /**
   * #1822 (Lot 16) — LES RÉGLAGES que la conversation peut PROPOSER de
   * changer, avec leur valeur ACTUELLE. `propose_settings_update` (côté IA)
   * résout `screen`/`field` contre CETTE liste avant de préparer une
   * proposition — exactement comme `toggle_routine` résout sa `key` contre
   * `laura_routines_summary` : une clé inventée par le modèle est refusée
   * AVANT toute proposition, jamais un bouton condamné d'avance.
   *
   * ⚠️ Lecture SEULE. Rien n'est écrit ici — le clic de la personne écrit par
   * la même route authentifiée que l'écran de réglages (`PATCH
   * /notifications/preferences`, `PUT /pipeline/stage-sla/:stage`), qui
   * applique ses PROPRES permissions (`team:manage` pour le pipe).
   */
  @Post('laura/settings-overview')
  async lauraSettingsOverview(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const [preferences, stageSlaRows] = await Promise.all([
      this.notifications.getPreferences(dto.userId),
      this.dealStageSla.effectiveFor(workspaceId),
    ])
    const screens: SettingsOverviewScreen[] = [
      { screen: '/settings/notifications', fields: buildNotificationsOverviewFields(preferences) },
      { screen: '/settings/pipeline', fields: buildPipelineOverviewFields(stageSlaRows) },
    ]
    // Garde-fou bon marché, exécuté à chaque appel : si un écran d'une famille
    // interdite se glissait un jour dans `WRITABLE_SETTINGS_SCREENS`, cette
    // route refuserait de le SERVIR plutôt que de laisser Laura le proposer.
    assertNoForbiddenWritableSettingsScreen(screens.map(entry => entry.screen))
    return { screens }
  }

  /**
   * #1822 — CE QUE LAURA GARDE DE LA PERSONNE, ligne à ligne.
   *
   * L'ASYMÉTRIE QU'ELLE FERME : `pin_memory_fact` savait ÉCRIRE une ligne dans
   * cette mémoire depuis le lot 16, et rien ne savait la relire. « Qu'est-ce
   * que tu as retenu de moi ? » n'avait donc aucune réponse, alors que l'écran
   * Réglages › Mémoire de Laura l'affiche depuis des mois — du code juste que
   * personne n'appelle, à l'envers.
   *
   * `MemoryService.readLedger` est le MÊME calcul que l'écran, avec sa règle
   * la plus importante : une couche ILLISIBLE est NOMMÉE (`unreadableLayers`)
   * plutôt que rendue vide. « Je n'ai pas pu lire » et « je ne retiens rien »
   * sont deux phrases différentes, et la seconde est fausse et rassurante —
   * c'est « non mesuré n'est jamais 0 » appliqué à une mémoire.
   *
   * ⚠️ Lecture SEULE, et bornée à l'APPELANT : `readLedger` prend `userId` ET
   * `workspaceId`. Aucune ligne d'un collègue n'en sort (D65) — les couches
   * personnelles (préférences, résumés, refus) sont déjà portées par `user_id`
   * dans le service, ce pont ne les élargit pas.
   */
  @Post('laura/memory-ledger')
  async lauraMemoryLedger(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const ledger = await this.memory.readLedger({ userId: dto.userId, workspaceId })
    return {
      entries: ledger.entries.map(entry => ({
        id: entry.id,
        layer: entry.layer,
        text: entry.text,
        recorded_at: entry.recordedAt,
        account_id: entry.accountId,
        detail: entry.detail,
        expires_at: entry.expiresAt,
        // #1918.1 — pour qui la ligne vaut, pour que Laura dise « pour toi
        // uniquement » ou « pour toute ton ESN ». `readLedger` a déjà borné les
        // faits à ce que CET appelant peut voir ; `null` hors couche des faits.
        scope: entry.scope ?? null,
      })),
      unreadable_layers: ledger.unreadableLayers,
    }
  }

  /**
   * #1822 — LES MOTS DE L'ESPACE : le lexique (D17) et les listes métier.
   *
   * Les deux écrans restent en RENVOI côté écriture — un motif de perte ou le
   * mot qui remplace « Projet » est du texte LIBRE, et un modèle qui le propose
   * l'invente. Mais un commercial demande bien « comment on appelle ça chez
   * nous ? » et « quels motifs de perte on a ? », et Laura n'avait aucune façon
   * de le lire : elle renvoyait vers un écran sans savoir ce qu'il contient.
   *
   * ⚠️ `getTeam` est la SEULE porte publique qui porte le lexique, et elle rend
   * AUSSI les membres, leurs adresses et leurs rôles. Cette projection les
   * JETTE : le modèle reçoit le vocabulaire, jamais l'annuaire de l'équipe.
   * Une porte plus étroite que son flux, cette fois dans le bon sens — et c'est
   * `copilot-bridge.controller.spec.ts` qui le tient, pas ce commentaire.
   *
   * Locale `'fr'` en dur pour les catalogues : ce paramètre ne choisit que les
   * libellés d'étapes PAR DÉFAUT, et les valeurs qui comptent ici — celles que
   * l'ESN a saisies — n'en dépendent pas.
   */
  @Post('laura/workspace-vocabulary')
  async workspaceVocabulary(@Body() dto: { userId: string }) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const [team, catalogues] = await Promise.all([
      this.workspaceTeam.getTeam(dto.userId),
      this.catalogues.list(workspaceId, 'fr'),
    ])
    return { lexicon: team.workspace.lexicon, catalogues: catalogues.items }
  }

  /**
   * #3973 — `excludedProviders` : les OUTILS décochés pour ce fil (« Outils et
   * sources »). Traduits ici en backends exclus : avec deux messageries (ou deux
   * agendas) branchées, celle qui est décochée n'est jamais lue — l'autre l'est.
   */
  @Post('mailbox/search')
  mailSearch(@Body() dto: CopilotMailSearchDto): Promise<MailSearchResponse> {
    const { userId, excludedProviders, ...request } = dto
    return this.mailbox.search(userId, request, { excludedProviders: mailboxProvidersExcludedBy(excludedProviders) })
  }

  /**
   * #4016 L3 (`c96_corps_mails_boite_du_commercial`) — le CORPS d'un fil, lu avec le jeton de
   * `userId` : sa boîte, à lui seul. LECTURE : rien n'est écrit, rien n'est conservé. Un fil
   * introuvable est DIT (`error`), jamais rendu vide.
   */
  @Post('mailbox/thread')
  async ownThreadText(@Body() dto: CopilotMailThreadDto): Promise<MailThreadText | { error: string }> {
    const { userId, excludedProviders, ...request } = dto
    const thread = await this.mailbox.readOwnThread(userId, request, {
      excludedProviders: mailboxProvidersExcludedBy(excludedProviders),
    })
    return thread ?? { error: 'Fil introuvable dans la fenêtre lue.' }
  }

  /**
   * #4406.5 (c96, décision Louis 21/10/2026) — les conversations Beeper de `userId`, lues EN DIRECT
   * avec SON branchement. Sans corps : titre, réseau, interlocuteurs, contact rattaché.
   */
  @Post('beeper/conversations')
  beeperConversations(@Body() dto: CopilotBeeperConversationsDto): Promise<BeeperConversationsResponse> {
    if (!this.beeper) return Promise.resolve({ state: 'disconnected' })
    return this.beeper.listConversations(dto.userId)
  }

  /**
   * #4406.5 (c96) — le CORPS d'UNE conversation Beeper de `userId`, pour que Laura PRÉPARE une
   * réponse. LECTURE : rien n'est écrit ni conservé, et le pont n'a AUCUN chemin d'envoi (la
   * réponse part par `POST /beeper/chats/:id/send`, sur le geste de l'utilisateur).
   */
  @Post('beeper/chat')
  beeperChat(@Body() dto: CopilotBeeperChatDto): Promise<BeeperChatMessagesResponse> {
    if (!this.beeper) return Promise.resolve({ state: 'disconnected' })
    return this.beeper.readOwnChat(dto.userId, dto.chatId)
  }

  @Post('agenda/events')
  agendaEvents(@Body() dto: CopilotAgendaEventsDto): Promise<AgendaEvent[]> {
    const { userId, excludedProviders, ...request } = dto
    return this.agenda.listEvents(userId, request, { excludedProviders: agendaProvidersExcludedBy(excludedProviders) })
  }

  /**
   * #4064 — la même lecture que `agenda/events`, mais avec ce qu'on n'a PAS pu
   * lire (`listEventsDetailed`) : un listing sur trois mois qui tait l'agenda
   * muet présenterait une liste partielle comme complète.
   */
  @Post('agenda/window')
  agendaWindow(@Body() dto: CopilotAgendaEventsDto): Promise<AgendaWindow> {
    const { userId, excludedProviders, ...request } = dto
    return this.agenda.listEventsDetailed(userId, request, {
      excludedProviders: agendaProvidersExcludedBy(excludedProviders),
    })
  }

  @Post('agenda/free-slots')
  async freeSlots(@Body() dto: CopilotFreeSlotsDto): Promise<FreeSlot[]> {
    const { userId, excludedProviders, ...request } = dto
    // #2770.27 — Laura ne passe jamais d'heures ouvrées : les siennes sont celles que la personne a RÉGLÉES
    // (temps protégé). Aucun réglage → les heures de la requête, inchangées.
    const workday = await this.briefing.workdayWindowOf(userId)
    return this.agenda.freeSlots(userId, workday ? { ...request, ...workday } : request, {
      excludedProviders: agendaProvidersExcludedBy(excludedProviders),
    })
  }

  /**
   * #2770.28 — LES PRÉFÉRENCES D'AGENDA de cette personne, pour que le plan de
   * journée de Laura (`propose_focus_plan`/`propose_weekly_plan`,
   * `chat_tools.py`) en tienne compte — même contrat que l'écran Réglages ›
   * Mémoire de Laura (`agenda-preferences.ts`), jamais un second réglage
   * parallèle. `{}` = rien réglé (ou illisible) : le moteur garde son
   * comportement inchangé.
   */
  @Post('agenda/preferences')
  agendaPreferences(@Body() dto: { userId: string }): Promise<Partial<AgendaPreferences>> {
    return this.briefing.agendaPreferencesOf(dto.userId)
  }

  @Post('briefing')
  dailyBriefing(@Body() dto: CopilotBriefingDto): Promise<DailyBriefing> {
    // #3973 — les outils décochés pour ce fil : le brief que Laura lit ne lit
    // jamais la messagerie ou l'agenda décoché. Sans exclusion, appel d'avant.
    const readScope = briefingReadScopeOf(dto.excludedProviders, dto.excludedFamilies)
    if (readScope) return this.briefing.build(dto.userId, undefined, undefined, undefined, dto.businessRole, readScope)
    // #3386 — le rôle métier déclaré réordonne le brief que Laura lit (c76).
    return dto.businessRole
      ? this.briefing.build(dto.userId, undefined, undefined, undefined, dto.businessRole)
      : this.briefing.build(dto.userId)
  }

  /**
   * #2392 (LAU-FINAL-106) — la CLÔTURE DE FIN DE JOURNÉE, compilée pour
   * l'outil `compile_day_closure` de Laura. Lecture seule : les tâches et les
   * fils par `BriefingService.dayClosure`, les cartes encore à valider par
   * `CopilotCardService.list` (les mêmes que l'écran Actions).
   *
   * ⚠️ `cards` est `@Optional()` : absent (module retiré), la section le DIT
   * (`unavailable`) — jamais « rien à valider », qui serait une panne muette.
   */
  @Post('day-closure')
  async dayClosure(@Body() dto: CopilotDayClosureDto): Promise<DayClosure> {
    const closure = await this.briefing.dayClosure(dto.userId, new Date(), dto.timeZone ?? null)
    let cards: Awaited<ReturnType<CopilotCardService['list']>> | null = null
    if (this.cards) {
      try {
        cards = await this.cards.list({ userId: dto.userId, email: '' }, { states: DAY_CLOSURE_CARD_STATES })
      } catch (error) {
        this.logger.warn('Clôture de journée : cartes à valider illisibles', { error })
      }
    }
    return { ...closure, toValidate: dayClosureCardsToValidate(cards) }
  }

  /* ── Vivier, missions, facturation, preuves (PDF 6 §9, décision D44) ────── */

  /**
   * Les six lectures qui manquaient au copilote.
   *
   * Le constat qui les a fait naître : douze outils couvraient la messagerie,
   * l'agenda, les comptes et les contacts — et AUCUN le vivier, le matching,
   * les missions, le relevé d'activité, la facturation, les preuves ni les
   * interventions. C'est-à-dire tout ce que les chantiers des PDF 3, 4 et 5
   * venaient de livrer. Deux des vingt requêtes prioritaires du §9.2 étaient
   * exécutables ; quatorze avaient déjà leur API et leur écran, et il ne leur
   * manquait que l'outil qui les expose.
   *
   * Elles restent en LECTURE, comme tout ce contrôleur : le copilote propose,
   * et c'est le clic de l'utilisateur qui écrit, par un endpoint authentifié.
   * La montant chargé d'un consultant ne sort JAMAIS par ici — `finance: false`
   * est passé en dur, parce qu'un pont interne n'a pas de rôle à interroger.
   */
  /**
   * #3889.1 (lot I02) — « qui a travaillé chez <compte> ? » : l'expérience DÉCLARÉE
   * dans un CV AUTORISÉ (consentement valide, client non masqué), sans exiger de
   * mission Bellum. LECTURE seule, aucun crédit.
   */
  @Post('talents/experience-search')
  async searchTalentsByExperience(@Body() dto: CopilotTalentExperienceSearchDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.talents.findByExperienceClient(workspaceId, dto.client)
  }

  @Post('talents/search')
  async searchTalents(@Body() dto: CopilotTalentSearchDto): Promise<TalentPage> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // La requête passe par le SCHÉMA, jamais par un objet composé à la main.
    //
    // Trouvé en recette : l'appel partait en `as never` avec trois champs, sans
    // `skills` ni `page`. Le service fait `query.skills.map(…)` et
    // `(query.page - 1) * query.limit` — donc 500 à chaque appel, et le copilote
    // répondait « échec technique » à toute question sur le vivier. Le `as never`
    // avait éteint la seule chose qui l'aurait dit : le typage du contrat.
    const query = talentSearchQuerySchema.parse({
      q: dto.query,
      // « disponible sous N jours » est le filtre sur la disponibilité DÉRIVÉE
      // qui existe déjà. Le champ inventé `availableWithinDays` n'était lu par
      // personne : un paramètre d'outil ignoré en silence rend une réponse qui a
      // l'air d'avoir répondu.
      freeBefore: dto.availableWithinDays === undefined ? undefined : isoDateInDays(dto.availableWithinDays),
      // #3222 — le rayon n'a de sens qu'avec une ville : sans `zone`, un
      // `radiusKm` isolé serait ignoré par `talentSearchQuerySchema` lui-même
      // (pas de centre), mais on ne le relaie même pas pour éviter de le faire
      // lire comme un critère pris en compte quand il ne l'est pas.
      zone: dto.zone,
      radiusKm: dto.zone === undefined ? undefined : dto.radiusKm,
      limit: 20,
    })
    return this.talents.search(
      workspaceId,
      query,
      // Le coût chargé est RETIRÉ, pas mis à zéro : le copilote n'a pas de rôle
      // à faire valoir, donc il n'a pas le droit de le voir.
      { finance: false },
    )
  }

  /**
   * #2327.26 — Laura EXPLIQUE un rapprochement de talents. Une LECTURE, comme
   * tout ce pont : elle rend la MÊME phrase que `TalentIdentityPanel.tsx`
   * (`explainTalentDuplicate`, calculée sur `TalentIdentityService.reportForTalent`,
   * déjà servi à l'écran par `GET :id/identity`) — jamais un chiffre de
   * confiance, qui s'y lirait comme une chance (`c37_fusion_doublons`).
   *
   * Aucun chemin d'écriture n'est atteignable depuis cette route : ni
   * décision, ni fusion — `this.identity.decide` n'est appelé nulle part ici.
   */
  @Post('talents/identity/explain')
  async talentIdentityExplain(
    @Body() dto: CopilotTalentIdentityExplainDto,
  ): Promise<{ state: TalentIdentityState; items: TalentIdentityExplanationItem[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    if (!this.talentIdentity) return { state: 'new', items: [] }
    const report = await this.talentIdentity.reportForTalent(workspaceId, dto.talentId)
    const items = dto.otherTalentId ? report.items.filter(item => item.talentId === dto.otherTalentId) : report.items
    return {
      state: report.state,
      items: items.map(item => ({
        talentId: item.talentId,
        fullName: item.fullName,
        // Locale FR : la même donnée brute que les autres textes de ce pont
        // (messages d'erreur compris) — Laura porte la traduction dans sa
        // réponse finale, dans la langue de la personne.
        explanation: explainTalentDuplicate(item, 'fr'),
      })),
    }
  }

  /**
   * #2367.11 — Laura LIT le REX d'un push consultant (« pourquoi ce profil a
   * été refusé »), jamais elle ne l'écrit : `ConsultantsService.recordFeedback`
   * n'est appelé nulle part ici. `listFeedback` fait déjà l'APPARTENANCE
   * (`findScoped`, workspace ET utilisateur) et rend `null` sur un
   * consultant qui n'est pas le sien — un id inventé par le modèle ne peut
   * donc jamais faire fuiter le REX d'un autre espace.
   */
  @Post('consultants/feedback')
  async consultantFeedback(
    @Body() dto: CopilotConsultantFeedbackDto,
  ): Promise<{ feedback: ConsultantPushFeedback[] } | { error: string }> {
    if (!this.consultantsService) return { error: 'Consultant feedback is not available.' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const feedback = await this.consultantsService.listFeedback(dto.consultantId, workspaceId, dto.userId)
    if (feedback === null) return { error: 'Consultant not found.' }
    return { feedback }
  }

  /**
   * #2857 (#2201.31) — Laura EXPLIQUE une carte de validation en attente,
   * l'une des actions listées par #2201 (Valider / Modifier / Refuser /
   * Reporter / Demander une explication / Annuler le lot). Une LECTURE,
   * comme `talentIdentityExplain` juste au-dessus : elle rend les MÊMES
   * faits que la carte affichée dans « À valider » — `summary` figé à la
   * demande, `required_level`, `reason` — jamais un motif recalculé ou
   * deviné pour l'occasion (jamais de donnée fictive). `explainApprovalRequest`
   * borne déjà la lecture à l'espace de `userId` : un identifiant hors espace
   * rend `null`, jamais la demande d'un autre espace.
   */
  @Post('approvals/explain')
  async approvalExplain(@Body() dto: CopilotApprovalExplainDto): Promise<
    | {
        state: ApprovalState
        summary: string
        requiredLevel: AutomationLevel
        reason: string | null
        requestedBy: string
        assignedTo: string | null
        snoozedUntil: string | null
        expiresAt: string
        createdAt: string
        decidedBy: string | null
        decidedAt: string | null
      }
    | { error: string }
  > {
    if (!this.approvalRunner) return { error: 'Approval explanation is not available.' }
    const approval = await this.approvalRunner.explainApprovalRequest({
      approvalId: dto.approvalRequestId,
      userId: dto.userId,
    })
    if (!approval) return { error: 'Approval request not found.' }
    return {
      state: approval.state,
      summary: approval.summary,
      requiredLevel: approval.required_level,
      reason: approval.reason,
      requestedBy: approval.requested_by,
      assignedTo: approval.assigned_to ?? null,
      snoozedUntil: approval.snoozed_until ? approval.snoozed_until.toISOString() : null,
      expiresAt: approval.expires_at.toISOString(),
      createdAt: approval.created_at.toISOString(),
      decidedBy: approval.decided_by ?? null,
      decidedAt: approval.decided_at ? approval.decided_at.toISOString() : null,
    }
  }

  @Post('missions/ending')
  async missionsEnding(@Body() dto: CopilotMissionsDto): Promise<{ missions: unknown[]; poValidityReadable: boolean }> {
    // La marge reste FERMÉE ici (`renewalsToAct` garde son `false` par défaut) :
    // seule la validité du bon de commande s'ouvre, et seulement au droit réel.
    const { missions } = await this.delivery.renewalsToAct(dto.userId, dto.endingWithinDays)
    const sent = missions.map(withoutAssigneePhotos)
    // #2407.9 — LOT 15, ARBITRAGE B (tranché par Louis 22/09 soir, decisions
    // §1) : `po_valid_until` est une donnée `finance:read`. On résout le RÔLE
    // RÉEL de la personne qui chatte, jamais un `true` en dur — et sans le
    // droit, on le DIT (`poValidityReadable: false`) plutôt que de rendre une
    // absence qui se lirait « pas de bon de commande ».
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:read')) return { missions: sent, poValidityReadable: false }
    const validity = await this.delivery.poValidUntilByMission(
      workspaceId,
      missions.map(mission => mission.id),
    )
    return {
      missions: sent.map(mission => ({ ...mission, poValidUntil: validity.get(mission.id) ?? null })),
      poValidityReadable: true,
    }
  }

  /**
   * LOT 15, ARBITRAGE B — cette porte manquait, alors que `finance/capacity`
   * (le voisin dont elle a la FORME — une lecture d'ÉQUIPE, pas un
   * portefeuille par porteur) en a une depuis toujours.
   *
   * ⚠️ `finance:read` SEUL, comme `capacity` : un relevé d'activité est
   * rattaché à une MISSION et un CONSULTANT, pas au commercial qui l'a vendue
   * — il n'y a pas de `:own` à qui se replier.
   */
  @Post('timesheets/month')
  async timesheets(@Body() dto: CopilotTimesheetsDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:read')) return { error: 'finance_forbidden' }
    return this.timesheetsService.month(workspaceId, { month: dto.month })
  }

  /**
   * ⚠️ `canReadFinance: false` EN DUR, comme partout sur ce pont : un appel
   * interne n'a aucun rôle à faire valoir. Ce qui remonte au copilote, ce sont
   * les BLOQUEURS — « relevé manquant », « pas de bon de commande » — qui sont
   * exactement ce qu'il sait faire lever. Le montant du mois, lui, sortait
   * jusqu'ici sans qu'aucune permission ne soit interrogée.
   */
  @Post('invoicing/blockers')
  async invoiceBlockers(@Body() dto: CopilotInvoiceBlockersDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.readiness.list(workspaceId, { month: dto.month, blockedOnly: true }, { canReadFinance: false })
  }

  // #2424.13 — `accountId` cible la bibliothèque sur UN compte nommé ; absent,
  // la lecture reste la bibliothèque entière (comportement d'avant, inchangé).
  // #2424.12 — les facettes (`sector`/`expertise`/`technologies`) ne sont
  // transmises QUE si au moins une est nommée : un appel sans elles reste un
  // appel à DEUX arguments, comportement d'avant inchangé au test près.
  @Post('proofs/usable')
  async proofs(@Body() dto: CopilotProofsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // #2424.12 — câblage restant : les trois facettes, jamais devinées —
    // absentes du message, elles restent absentes ici (comportement d'avant).
    return this.capitalisation.usableProofs(workspaceId, dto.accountId ?? null, {
      sector: dto.sector,
      expertise: dto.expertise,
      technologies: dto.technologies,
    })
  }

  /**
   * #3181.2 (épopée #3247) — les secteurs (vocabulaire fermé) où l'espace a déjà une preuve.
   * Des noms de groupes seulement, jamais le contenu d'une preuve.
   */
  @Post('proofs/sector-groups')
  async proofSectorGroups(@Body() dto: CopilotProofSectorGroupsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.capitalisation.proofSectorGroups(workspaceId)
  }

  /**
   * #2124.49 à .55 — les champs de preuve que Laura propose pour une mission.
   *
   * ⚠️ Une LECTURE. Le copilote propose, l'humain valide : l'écriture vit sur
   * `PATCH capitalisation/proofs/:id`, derrière un clic et une permission, et
   * aucun chemin ne part d'ici vers elle. Ce n'est pas une convention, c'est
   * l'absence de code.
   */
  @Post('proofs/proposal')
  async proofProposal(@Body() dto: CopilotProofProposalDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.capitalisation.proofProposalForMission(workspaceId, dto.missionId)
  }

  /**
   * BEL-SC-239 — le plan de la proposition (Proposal Studio) pour UN besoin,
   * tel que Laura peut l'apporter dans la conversation.
   *
   * Une LECTURE, comme tout ce pont : `buildForProject` recalcule le plan à
   * chaque appel — c'est le MÊME assembleur que l'écran `/propositions`, donc
   * la même honnêteté (une section vide dit pourquoi, aucun prix n'est
   * inventé). `null` (besoin hors espace ou inconnu) se lit comme une
   * absence, jamais une erreur.
   */
  @Post('proposals/outline')
  async proposalOutline(@Body() dto: CopilotProposalOutlineDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const view = await this.proposals.buildForProject(dto.projectId, workspaceId)
    if (!view) return { error: 'not_found' }
    return view
  }

  /**
   * #2424.10 — câblage restant : le seul fait qu'un REX RÉELLEMENT recueilli
   * sur ce compte porte un « ce qui a marché ». Consommé par l'analyse
   * (`recommend_actions_from_context`, `action_recommender.py`) pour nommer
   * l'action `expansion_rex_positif`. Une LECTURE, comme tout ce pont.
   */
  @Post('rex/has-positive')
  async accountHasPositiveRex(@Body() dto: CopilotAccountRexDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return { hasPositiveRex: await this.capitalisation.hasPositiveRex(workspaceId, dto.accountId) }
  }

  @Post('interventions')
  interventions(@Body() dto: CopilotInterventionsDto) {
    return this.playbooks.listInterventions(dto.userId)
  }

  /**
   * OÙ LES DOSSIERS BLOQUENT (#1506).
   *
   * Laura répond « le besoin SNCF est bloqué à Retour client depuis 7 jours,
   * deux profils sont partis le 27/08 et aucun retour n'est enregistré » plutôt
   * que « je te conseille de relancer » : la différence est que la première
   * phrase se vérifie sur les objets, et que la seconde ne se vérifie pas.
   *
   * ⚠️ Une LECTURE. Elle ne crée aucune action et n'envoie rien — c'est le
   * commercial qui décide depuis là, et le garde-fou est explicite au §6
   * de #1507.
   *
   * ⚠️ LOT 15, ARBITRAGE A — « MES dossiers », vraiment les miens.
   *
   * `chat_tools.py` dit au modèle « où est-ce que MES dossiers bloquent » ;
   * jusqu'ici `this.chains.blockers` ne recevait que l'espace et agrégeait
   * TOUT le portefeuille de l'équipe, collègues compris. Le cloisonnement de
   * portefeuille (décision D5, `portfolioScopeFor`) est déjà la réponse du
   * dépôt à cette question — la MÊME que `GET /accounts` applique au bord —
   * donc on la rejoue ici plutôt que d'en inventer une seconde :
   *  · visibilité `open` (le défaut assumé du produit) → `null`, tout l'espace,
   *    EXACTEMENT le comportement d'avant ;
   *  · visibilité `restricted` et un rôle sans `team:manage` → seulement ce que
   *    CET utilisateur porte (plus ce qui n'est attribué à personne).
   */
  @Post('chains/blockers')
  async chainBlockers(@Body() dto: CopilotChainBlockersDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, dto.userId)
    // LOT 3 (perf), Défaut A — UN de plus que la borne affichée, pour savoir
    // si le catalogue réel de blocages la dépasse (voir `capWithTruncationFlag`).
    const rows = await this.chains.blockers(workspaceId, CHAIN_BLOCKERS_DISPLAY_LIMIT + 1, scope)
    const { items, truncated } = capWithTruncationFlag(rows, CHAIN_BLOCKERS_DISPLAY_LIMIT)
    return { blockers: items, truncated }
  }

  /**
   * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — LE CONTRÔLE AVANT
   * ACTION d'UN contact, pour Laura (`get_contact_preflight`, apps/ia) : le MÊME
   * calcul que la fiche contact (`GET /contacts/:id/preflight`), jamais un
   * second. Une LECTURE qui ne tranche rien — contradictions ouvertes, deux
   * vérités de portée, poste/entreprise différents selon la source, contact hors
   * du périmètre retenu pour le compte. Un contact hors de l'espace rend
   * `contact_not_found`, jamais une exception brute.
   */
  @Post('contact/preflight')
  async contactPreflight(@Body() dto: CopilotContactPreflightDto) {
    const result = await this.contacts.preflight(dto.contactId, dto.userId, {
      action: dto.action ?? null,
      readConflicts: (workspaceId, contactId) =>
        this.conflicts.openConflicts(workspaceId, 'contact', contactId, { includeSettled: true }),
    })
    return result.type === 'success' ? result.output : { error: 'contact_not_found' }
  }

  /**
   * #3264.14 (épopée #3264, lot R11 29/09) — LA COLLISION DE SOLLICITATION,
   * AVANT DE PRÉPARER UN MESSAGE.
   *
   * Une LECTURE, comme tout ce pont. `apps/ia` n'a aucun moyen d'interroger
   * `outreach_sequences` (frontière `apps/ia` ↔ `packages/contracts`, même
   * raison documentée que `method-corpus.ts`/`persona.py`) : `prepare_message_for_contact`
   * appelle cette route pour savoir si un collègue a déjà une séquence
   * ACTIVE sur ce contact avant de proposer une relance de plus.
   */
  @Post('outreach/contact-collision')
  async outreachContactCollision(@Body() dto: CopilotContactCollisionDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const collision = await this.pipeline.contactSolicitationCollisionFor(workspaceId, dto.contactId)
    return { collision: collision !== null, sequenceCount: collision?.sequenceIds.length ?? 0 }
  }

  /**
   * #3289 (#3264.31/.32/.33) — le créneau d'envoi appris par l'espace, par
   * canal. Une LECTURE : les gestes FAITS du workspace et leurs issues
   * déclarées, jamais un taux (« 4 réponses sur 6 »), jamais un créneau sous
   * le seuil de tentatives.
   */
  @Post('outreach/send-timing')
  async outreachSendTiming(@Body() dto: CopilotSendTimingDto) {
    if (!this.sendTiming) return { error: 'send_timing_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const timing = await this.sendTiming.forWorkspace(workspaceId, dto.seniority)
    return timing ?? { error: 'send_timing_unreadable' }
  }

  /**
   * #3289 (suivi #3264.41) — les règles du corpus méthode que l'espace a
   * CONTREDITES par ses résultats. Une LECTURE : `apps/ia` écarte ces règles de
   * SES citations pour cet espace. `null` (lecture impossible) est une erreur
   * nommée, jamais « aucune règle contredite ».
   */
  @Post('method/contradicted-rules')
  async contradictedMethodRules(@Body() dto: CopilotContradictedRulesDto) {
    if (!this.methodRuleOutcomes) return { error: 'method_rule_outcomes_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const ruleIds = await this.methodRuleOutcomes.contradictedRuleIds(workspaceId)
    return ruleIds === null ? { error: 'method_rule_outcomes_unreadable' } : { ruleIds }
  }

  /* ── Les neuf lectures restantes des vingt requêtes (§9.2) ──────────────── */

  /**
   * Les besoins ouverts, cherchables par LIBELLÉ.
   *
   * C'est aussi le point d'entrée 4 du PDF 4, refusé à l'époque avec sa raison :
   * le copilote ne savait pas RÉSOUDRE un besoin par son nom, donc lui donner un
   * outil de matching l'aurait fait proposer un lien vers un besoin choisi au
   * hasard. Il sait maintenant.
   */
  @Post('needs/find')
  async findNeeds(@Body() dto: CopilotFindNeedsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // #3852 — un identifiant déjà connu passe par le MÊME filtre `id` que la
    // fiche (`openNeedsQuerySchema.id`), jamais par la recherche texte : il
    // ignore le repli « ouverts seulement », donc un besoin clos ou mal
    // découpé par les mots-clés reste trouvable.
    return this.openNeeds.list(
      workspaceId,
      openNeedsQuerySchema.parse({
        id: dto.needId,
        q: dto.query,
        limit: dto.limit ?? 20,
        offset: 0,
        // #3889.2 — le même drapeau que l'écran ; absent, le filtre « ouverts » reste.
        ...(dto.includeClosed ? { include_closed: true } : {}),
        // #4287.9 — le compte par son identité (filtre `account_id` de l'écran), pas par son nom.
        ...(dto.accountId ? { account_id: dto.accountId } : {}),
      }),
    )
  }

  /**
   * Le classement d'un besoin, et l'explication d'un profil.
   *
   * Zéro crédit et déterministe (D26) : deux exécutions identiques rendent le
   * même classement, ce qui autorise le copilote à le déclencher sans confirmer
   * un coût. `finance: false` en dur, comme partout sur ce pont.
   */
  @Post('needs/match-draft')
  async matchDraftNeed(@Body() dto: CopilotMatchDraftNeedDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // #AM.59 — LECTURE seule : le calcul est en mémoire (`persist: false`), aucun besoin ni run n'est écrit ; la porte
    // `records:write` des routes qui journalisent n'a donc pas lieu d'être ici. « Créer le besoin » est un autre geste.
    return this.matching.matchDraftNeed(dto.need, workspaceId, dto.userId, { canReadFinance: false })
  }

  @Post('needs/match')
  async matchNeed(@Body() dto: CopilotMatchNeedDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // #1956.14 (famille) — vérification 13/09 : « zéro crédit » n'est pas « zéro
    // écriture ». `MatchingService.matchNeed` enregistre un run, ses lignes et la
    // version des poids ; `POST needs/:id/match` exige `records:write`, que
    // `viewer`, `finance` et `tech_admin` n'ont pas. Même porte ici.
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'records:write')) {
      return { error: 'records_write_forbidden', message: RECORDS_WRITE_FORBIDDEN_MESSAGE }
    }
    // #4059.1-.3 — le classement ET ce qu'il change depuis le précédent (CV ajouté, exigence modifiée).
    const matched = await this.matching.matchNeedWithChanges(dto.needId, workspaceId, dto.userId, {
      canReadFinance: false,
    })
    if (!matched) return { error: 'need_not_found' }
    const { run, changes } = matched
    if (!dto.consultantId) return { ...run, changes }
    const explained = await this.matching.explain(run.runId, dto.consultantId, workspaceId, dto.userId, false)
    // Un profil hors du classement n'est pas une erreur d'outil : il n'a
    // simplement pas été évalué, et le dire vaut mieux qu'un 404 muet.
    return explained ?? { error: 'consultant_not_ranked', run }
  }

  /**
   * #3865.2 (lot X05, 08/10) — LE MATCHING INVERSE D'UN CONSULTANT, enfin
   * appelable depuis la conversation.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE TROU QUE CETTE ROUTE FERME
   * ─────────────────────────────────────────────────────────────────────────
   * « Voici un consultant, où le positionner ? » (#3865, BEL-LAU-1008-014)
   * suppose de chercher les BESOINS compatibles, pas seulement les comptes où
   * le placer (`talents/reverse-market`, #3816.1, qui reste la réponse pour
   * « quels comptes pour ce profil » quand AUCUN besoin n'est encore ouvert).
   * `InverseMatchingService.matchTalent` existe depuis le §5.2 (BEL-MTC-304),
   * branché sur l'écran (`POST consultants/:id/match-inverse`) — jamais sur le
   * chat : exactement le motif qui revient dans ce dépôt, « du code juste,
   * calculé, testé, que personne n'appelle ».
   *
   * Même porte que `needs/match` juste au-dessus (le même service écrit un run
   * et ses lignes) ; `canReadFinance: false` EN DUR, comme partout sur ce pont.
   */
  @Post('talents/needs-match')
  async matchTalentNeeds(@Body() dto: CopilotMatchTalentNeedsDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'records:write')) {
      return { error: 'records_write_forbidden', message: RECORDS_WRITE_FORBIDDEN_MESSAGE }
    }
    const run = await this.inverseMatching.matchTalent(dto.consultantId, workspaceId, dto.userId, {
      canReadFinance: false,
      mineOnly: dto.mineOnly ?? false,
    })
    if (!run) return { error: 'consultant_not_found' }
    return run
  }

  /**
   * #3182.3 (épopée #3248, retour bêta 28/09/2026) — LES PRÉREQUIS D'UN
   * POSITIONNEMENT CONSULTANT, INSPECTÉS ENSEMBLE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE TROU QUE CETTE ROUTE FERME
   * ─────────────────────────────────────────────────────────────────────────
   * « Des fragments existent séparément (search_talents pour la disponibilité,
   * find_needs/run_matching pour le besoin actuel) mais aucun agrégateur ne les
   * inspecte ensemble avant qu'une recommandation de positionnement soit faite »
   * — le même geste que `get_account_preflight` pour l'ouverture de compte,
   * ici pour le consultant.
   *
   * ZÉRO calcul neuf : `submissionPreflight` est la fonction PURE déjà écrite
   * et testée pour le modal de positionnement (`SubmissionPreflightModal`,
   * §10.1, porte G4) — cette route rejoue EXACTEMENT le geste de
   * `previewSubmission` (`matching.controller.ts`), à travers le pont interne
   * plutôt qu'un JWT utilisateur. Consentement (global ET par compte, #2948),
   * disponibilité, TJM/CV validés, autres process connus, besoin actuel : tout
   * vient de `MatchingService.submissionContext`/`replay`, aucune seconde
   * lecture.
   *
   * Lecture SEULE : contrairement à `positionCandidate` (la porte G4 elle-
   * même), cette route n'écrit RIEN — ni gate, ni soumission. `runId` vient
   * D'UN `matchNeed` déjà exécuté (`needs/match` ci-dessus) : la préflight dit
   * la vérité du moment DE CE calcul, jamais un recalcul silencieux qui
   * pourrait avoir changé entre-temps — même contrat que l'écran.
   */
  @Post('needs/submissions/preflight')
  async submissionPreflightForConsultant(@Body() dto: CopilotSubmissionPreflightDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // `canReadFinance: false` EN DUR, comme `needs/match` et partout sur ce pont
    // (GA-320) : la préflight dit si le TJM est VALIDÉ, jamais sa valeur.
    const replayed = await this.matching.replay(dto.runId, [dto.consultantId], workspaceId, dto.userId, false)
    const result = replayed?.results[0]
    if (!replayed || !result) return { error: 'run_not_found' }
    const context = await this.matching.submissionContext(dto.needId, dto.consultantId, workspaceId)
    if (!context) return { error: 'need_not_found' }
    const candidate = (
      await this.matching.loadCandidates(workspaceId, dto.userId, replayed.need, [dto.consultantId])
    )[0]
    if (!candidate) return { error: 'consultant_not_ranked' }
    return submissionPreflight(replayed.need, result, {
      consentState: candidate.consentState ?? 'none',
      consentExpiresAt: context.consentExpiresAt,
      availabilityCheckedAt: context.availabilityCheckedAt,
      accountConsent: context.accountConsent,
      positioningAgreement: context.positioningAgreement,
      now: new Date(),
    })
  }

  /**
   * #2320.24 (épopée #2967) — L'ÉTAT DE LA CHAÎNE COMMERCIALE D'UN BESOIN,
   * pour que Laura le LISE (`get_need_transition_history`, `chat_tools.py`) :
   * le statut ACTUEL, plus l'historique de transition complet (état / auteur /
   * date / preuve), le même journal APPEND-ONLY que `changeNeedStatus` écrit
   * (#2320.23). Lecture seule, scopée à l'espace ACTIF : un besoin d'un autre
   * espace rend 404, comme `projects/read` juste plus haut.
   */
  @Post('needs/transitions')
  async needTransitions(@Body() dto: CopilotNeedTransitionsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.pipeline.needTransitionHistory(workspaceId, dto.needId)
    if (!result) return { error: 'need_not_found' }
    return result
  }

  /**
   * #2320.26 / #2320.27 (épopée #2967) — PRÉPARER une transition de besoin
   * SANS l'exécuter, et SIGNALER ce qui manque pour la franchir : pour que
   * Laura (`propose_need_transition`, `chat_tools.py`) ne prépare jamais une
   * proposition qu'elle sait déjà refusée. Même verdict, lu ici, que
   * `changeNeedStatus` calcule juste avant d'écrire — aucun second calcul
   * (GA-26). Lecture seule, scopée à l'espace ACTIF.
   */
  @Post('needs/transition-check')
  async needTransitionCheck(@Body() dto: CopilotNeedTransitionCheckDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.pipeline.needTransitionCheck(workspaceId, dto.needId, dto.nextStatus)
    if (!result) return { error: 'need_not_found' }
    return result
  }

  /**
   * #2339.1 (épopée #2795) — LE JOURNAL UNIFIÉ DES QUATRE SUJETS (besoin,
   * shortlist, positionnement, mission) pour UN besoin, pour que Laura
   * (`get_need_journal`, `chat_tools.py`) réponde « où en est ce besoin, dans
   * l'ordre où c'est arrivé » sans que le commercial rouvre trois écrans.
   * `@Optional()` comme `startReadiness`/`intelligenceContext` ci-dessus :
   * sans le service, la route le DIT plutôt que de faire tomber le pont.
   */
  @Post('needs/journal')
  async needJournal(
    @Body() dto: CopilotNeedIdDto,
  ): Promise<{ error: string } | { needId: string; status: string; entries: NeedJournalEntry[] }> {
    if (!this.needCommercialState) return { error: 'need_commercial_state_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.needCommercialState.journal(workspaceId, dto.needId)
    if (!result) return { error: 'need_not_found' }
    return result
  }

  /**
   * #2339.2 (épopée #2795) — LE CONTRÔLE DE HANDOFF avant de lancer une
   * conversion besoin→mission : même preuve d'engagement que la porte `won`,
   * plus l'absence de mission déjà ouverte pour ce besoin. Lecture seule :
   * cette route ne convertit rien, elle dit si la conversion tiendrait.
   */
  @Post('needs/mission-handoff-check')
  async needMissionHandoffCheck(@Body() dto: CopilotNeedIdDto) {
    if (!this.needCommercialState) return { error: 'need_commercial_state_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.needCommercialState.missionHandoffCheck(workspaceId, dto.needId)
    if (!result) return { error: 'need_not_found' }
    return result
  }

  /**
   * #2339.3 / #2339.10 (épopée #2795) — LE BESOIN BRUT, pour que Laura calcule
   * elle-même l'aperçu des champs (présents/absents nommés) et son résumé —
   * deux lectures qui partagent la MÊME source, jamais un second calcul côté
   * NestJS pour chacune.
   */
  @Post('needs/read')
  async needRead(@Body() dto: CopilotNeedIdDto) {
    if (!this.needCommercialState) return { error: 'need_commercial_state_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const need = await this.needCommercialState.readOne(workspaceId, dto.needId)
    if (!need) return { error: 'need_not_found' }
    return need
  }

  /**
   * #2339.5 / #2339.6 (épopée #2795) — LES DOUBLONS PROBABLES du même besoin,
   * dans le même compte (même intitulé, ou compétence commune) : Laura les
   * PROPOSE, elle ne fusionne jamais (doctrine).
   */
  @Post('needs/duplicates')
  async needDuplicates(@Body() dto: CopilotNeedIdDto) {
    if (!this.needCommercialState) return { error: 'need_commercial_state_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.needCommercialState.duplicateCandidates(workspaceId, dto.needId)
    if (!result) return { error: 'need_not_found' }
    return result
  }

  /**
   * #2339.6 / #2339.11 / #2339.13 (épopée #2795) — LES MISSIONS DÉJÀ NÉES de
   * ce besoin : `mission_id`, la preuve du positionnement retenu
   * (`submissionId`) et le deal CRM connu, pour que Laura réponde « la
   * conversion a rendu quoi » sans deviner. `[]` = aucune mission encore.
   */
  @Post('needs/missions')
  async needMissions(
    @Body() dto: CopilotNeedIdDto,
  ): Promise<{ error: string } | { needId: string; missions: NeedMissionSummary[] }> {
    if (!this.needCommercialState) return { error: 'need_commercial_state_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const missions = await this.needCommercialState.missionsForNeed(workspaceId, dto.needId)
    if (missions === null) return { error: 'need_not_found' }
    return { needId: dto.needId, missions }
  }

  /**
   * #2339.13 (épopée #2795) — L'ÉTAT NO-GO d'un besoin : mission dupliquée, ou
   * incohérence Besoin/Mission (gagné sans mission, clos avec une mission
   * active). Le NO-GO « CV inventé » n'est pas relu ici — la garantie vit à la
   * source (`bellum_cv.py`), la reciter ferait un second calcul.
   */
  @Post('needs/no-go-state')
  async needNoGoState(@Body() dto: CopilotNeedIdDto) {
    if (!this.needCommercialState) return { error: 'need_commercial_state_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.needCommercialState.noGoState(workspaceId, dto.needId)
    if (!result) return { error: 'need_not_found' }
    return result
  }

  /**
   * #3226 (#3202.6) — la CAPACITÉ DE DELIVERY de l'espace : combien de
   * consultants actifs, déjà staffés par le passé, n'ont aucune affectation en
   * cours. Un compteur, jamais une liste ni un nom — le plan de compte le lit
   * pour ne pas promettre un staffing que l'espace ne porte pas. Le même calcul
   * que l'écran des missions (`intercontractCount`, GA-26).
   */
  @Post('delivery/capacity')
  async deliveryCapacity(@Body() dto: CopilotMissionRisksDto): Promise<{ intercontractCount: number }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.delivery.capacity(workspaceId)
  }

  /** Les missions qui portent au moins un risque nommé. */
  @Post('missions/risks')
  async missionRisks(@Body() dto: CopilotMissionRisksDto) {
    // `canReadFinance: false` EN DUR, comme le vivier et le matching : un appel
    // interne n'a aucun rôle à faire valoir, et le copilote remontait jusqu'ici
    // le taux de marge de chaque mission à risque sans qu'aucune permission ne
    // soit interrogée.
    const { missions } = await this.delivery.list(dto.userId, { canReadFinance: false })
    return { missions: missions.filter(mission => mission.risks.length > 0).map(withoutAssigneePhotos) }
  }

  /**
   * #2338.8 / #2409.8 — la checklist de démarrage d'UNE mission : le verdict
   * (prêt / prêt avec réserves / bloqué / incomplet) et les prérequis NOMMÉS,
   * pour que Laura annonce le démarrage AVEC ses réserves plutôt que de rester
   * muette dessus. Le MÊME calcul que l'écran (`MissionStartReadinessService`,
   * GA-26) — aucune seconde vérité : `missing`/`reserves` voyagent tels que le
   * contrat `MissionStartReadiness` les rend (des CLÉS, jamais un libellé
   * recalculé ici — un second calcul serait une seconde vérité). `startReadiness`
   * est optionnel comme `coverage`/`timeline` juste au-dessus : sans lui, la
   * route le DIT plutôt que de faire tomber le pont.
   */
  @Post('missions/start-readiness')
  async missionStartReadiness(
    @Body() dto: CopilotMissionStartReadinessDto,
  ): Promise<MissionStartReadiness | { error: string }> {
    if (!this.startReadiness) return { error: 'start_readiness_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.startReadiness.readiness(workspaceId, dto.missionId)
  }

  /**
   * #2423.9 — les avenants DÉJÀ proposés sur UNE mission : Laura les lit avant
   * de préparer une nouvelle proposition (elle ne double-propose pas ce qui
   * attend déjà une validation, et un `missionId` hors de l'espace refuse
   * proprement au lieu de laisser croire qu'un avenant pourrait s'y préparer).
   * `amendments` est optionnel comme `startReadiness` juste au-dessus.
   */
  @Post('missions/amendments')
  async missionAmendments(
    @Body() dto: CopilotMissionAmendmentsDto,
  ): Promise<{ amendments: MissionAmendmentView[] } | { error: string }> {
    if (!this.amendments) return { error: 'mission_amendments_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const amendments = await this.amendments.list(workspaceId, dto.missionId)
    return { amendments }
  }

  /**
   * #2324.39 — L'ÉTAT ACTUEL D'UNE OPPORTUNITÉ, pour que Laura FIGE le diff
   * (« avant → après ») au moment où elle PRÉPARE une mise à jour
   * (`propose_opportunity_update`, `chat_tools.py`) — jamais un « avant » que
   * le modèle devinerait. Lecture seule, scopée à l'espace actif : une
   * opportunité d'un autre espace rend 404 (`project_not_found`), et seuls
   * les champs qu'une proposition peut changer sortent. Une valeur absente
   * reste `null` (GA-18) : jamais « 0 € » ni une étape vide inventée.
   */
  @Post('projects/read')
  async projectRead(@Body() dto: CopilotProjectReadDto): Promise<
    | {
        project: {
          id: string
          label: string
          company_name: string | null
          stage: string
          estimated_amount: number | null
          next_step: string | null
          risk: string | null
        }
      }
    | { error: string }
  > {
    if (!this.projects) return { error: 'projects_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const row = await this.projects.getRow(dto.projectId, workspaceId)
    // Hors de l'espace de l'utilisateur au nom duquel Laura parle (ou
    // inexistante) : 404, comme l'écran — jamais une ligne d'un autre espace.
    if (!row) throw new NotFoundException('project_not_found')
    return {
      project: {
        id: row.id,
        label: row.label,
        company_name: row.company_name ?? null,
        stage: row.stage,
        estimated_amount: row.estimated_amount ?? null,
        next_step: row.btmmp?.nextStep?.trim() || null,
        // #2324.37 — l'« avant » du champ `risk` : null = jamais écrit.
        risk: row.risks?.trim() || null,
      },
    }
  }

  /** Le pool de réactivation : qui repositionner, et POURQUOI il y figure. */
  @Post('talents/reactivation')
  async reactivation(@Body() dto: CopilotReactivationDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    if (!dto.segment) return { segments: await this.talentPool.counts(workspaceId) }
    const parsed = talentPoolSegmentSchema.safeParse(dto.segment)
    if (!parsed.success) return { error: 'unknown_segment' }
    return { entries: await this.talentPool.entries(workspaceId, parsed.data) }
  }

  /** Les appels d'offres, ou l'un d'eux avec sa grille de conformité. */
  @Post('rfps')
  async rfpList(@Body() dto: CopilotRfpsDto) {
    if (!dto.rfpId) return this.rfps.list(dto.userId)
    return this.rfps.findOne(dto.userId, dto.rfpId)
  }

  /** Les comptes qui attendent une décision, ou sur lesquels rien ne bouge. */
  @Post('accounts/to-act')
  async accountsToAct(@Body() dto: CopilotAccountsToActDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // LOT 3 (perf), Défaut A — même technique que `chainBlockers` : UN de plus
    // que la borne affichée (`staleDays` reste le défaut du service, 30 jours).
    const rows = await this.accounts.accountsAwaitingAction(workspaceId, 30, ACCOUNTS_TO_ACT_DISPLAY_LIMIT + 1)
    const { items, truncated } = capWithTruncationFlag(rows, ACCOUNTS_TO_ACT_DISPLAY_LIMIT)
    return { accounts: items, truncated }
  }

  /**
   * #3211.9 (épopée #3234) — les actions ÉCHUES de l'utilisateur dont aucun
   * résultat n'a été déclaré : Laura DEMANDE ce que chacune a donné, elle ne
   * l'infère jamais (« Fait » ne porte pas de preuve, un outcome deviné serait
   * une donnée fictive). Aucun second calcul de « en retard » :
   * `ActionPlanItemsService.listOpenForUser(..., overdueOnly)` est la portée
   * exacte de la tuile « En retard » du Dashboard (GA-26). Sans le service,
   * une erreur — jamais une liste vide qui dirait « rien à clore ».
   */
  @Post('actions/awaiting-outcome')
  async actionsAwaitingOutcome(@Body() dto: CopilotActionsAwaitingOutcomeDto) {
    if (!this.actionItems) return { error: 'actions_awaiting_outcome_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const rows = await this.actionItems.listOpenForUser(dto.userId, workspaceId, 200, true)
    const awaiting = rows
      .filter(row => !row.result?.trim())
      .map(row => ({
        id: row.id,
        label: row.label,
        companyName: row.company_name,
        dueDate: row.due_date,
        channel: row.channel,
        ownerName: row.owner_name,
      }))
    const { items, truncated } = capWithTruncationFlag(awaiting, ACTIONS_AWAITING_OUTCOME_DISPLAY_LIMIT)
    return { actions: items, truncated }
  }

  /**
   * #3427 — le modèle APPROUVÉ à reprendre mot pour mot, choisi par canal,
   * scénario et persona (jamais par ressemblance de mots). La règle absolue
   * et la sélection vivent dans `selectApprovedTemplate` : ce pont relaie la
   * trace (pourquoi, lesquels écartés) et le texte verbatim de l'entrée
   * retenue. Aucune entrée sélectionnable → `template: null`, jamais un texte
   * de remplacement.
   */
  @Post('message-template/select')
  async messageTemplateSelect(@Body() dto: CopilotMessageTemplateSelectDto) {
    if (!this.messageLibrary) return { error: 'message_library_unavailable' }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const ctx = { userId: dto.userId, workspaceId, role }
    if (dto.mode === 'inspiration') {
      // #3443 — un exemple de COMPORTEMENT : Laura en reprend le déroulé (permission,
      // question, cadre respecté), jamais les mots. Rien n'est rendu ni envoyé.
      const behavior = await this.messageLibrary.selectBehavior(ctx, {
        channel: dto.channel,
        scenarioId: dto.scenarioId,
        persona: dto.persona,
      })
      return {
        mode: 'inspiration',
        ...behavior,
        rejected: behavior.rejected.slice(0, MESSAGE_TEMPLATE_REJECTED_DISPLAY_LIMIT),
        rejectedTotal: behavior.rejected.length,
        instruction:
          'Exemples de comportement : tu en reprends le déroulé et le niveau de pression, jamais les mots ; ' +
          'tu n’affirmes jamais une `unverifiedClaims` comme un fait ; les faits viennent du compte réel.',
      }
    }
    const trace = await this.messageLibrary.select(ctx, {
      channel: dto.channel,
      scenarioId: dto.scenarioId,
      persona: dto.persona,
      ...(dto.step ? { step: dto.step } : {}),
    })
    // Les écartés grossissent avec la bibliothèque : bornés ET comptés (GA-295).
    const rejected = trace.rejected.slice(0, MESSAGE_TEMPLATE_REJECTED_DISPLAY_LIMIT)
    const bounded = { ...trace, rejected, rejectedTotal: trace.rejected.length }
    if (!trace.selectedId) return { ...bounded, template: null }
    const entry = await this.messageLibrary.get(ctx, trace.selectedId)
    return {
      ...bounded,
      template: {
        title: entry.title,
        ...(entry.step ? { step: entry.step } : {}),
        text: entry.text,
        expectedVariables: entry.expectedVariables,
        version: entry.version,
        usageConstraints: entry.usageConstraints,
      },
    }
  }

  /**
   * #3422.20 — la checklist « avant d'envoyer » appliquée à un texte que la
   * personne soumet : `preSendCheck`, la MÊME règle que `PreSendChecklist.tsx`
   * (GA-26). Toutes les lignes sont rendues ; « prêt » n'est dit que si rien
   * n'échoue ET que tout a pu être vérifié. Laura n'envoie rien.
   */
  @Post('message/pre-send-check')
  messagePreSendCheck(@Body() dto: CopilotMessagePreSendCheckDto) {
    const checks = [
      ...preSendCheck({
        body: dto.body,
        subject: dto.subject ?? null,
        step: dto.step ?? 1,
        persona: dto.persona ?? null,
      }),
      // #3436 — « trop générique » est un échec NOMMÉ de la liste, pas un avis du modèle.
      recipientSpecificityCheck(dto.body, dto.recipientTerms ?? []),
    ]
    const failures = preSendFailures(checks)
    const notCheckable = checks.filter(item => item.verdict === 'not_checkable')
    return {
      checks,
      failures,
      notCheckable,
      readyToSend: failures.length === 0 && notCheckable.length === 0,
    }
  }

  /**
   * #3209 (LAU-FINAL-215) — la répartition du portefeuille en quatre
   * catégories (maintenant / à vérifier / à surveiller / à ne pas
   * travailler), jamais un tri par score. Voir `AccountsService.portfolioPriorities`.
   *
   * #3245 (reste de #3209.3) — `effortBudget` voyage sur LA MÊME réponse :
   * la spec pose le budget d'effort et les quatre catégories comme UNE seule
   * question (« où investir mon temps, avec quelle capacité réelle »), jamais
   * deux appels séparés que le modèle devrait recomposer lui-même.
   */
  @Post('accounts/portfolio-priorities')
  async accountsPortfolioPriorities(@Body() dto: CopilotPortfolioPrioritiesDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // #4070.1 — l'utilisateur voyage : « pourquoi maintenant » lit ses faits décotés.
    const priorities = await this.accounts.portfolioPriorities(workspaceId, dto.userId)
    const effortBudget = await this.accounts.effortBudget(workspaceId, priorities)
    return { ...priorities, effortBudget }
  }

  /**
   * #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
   * LE MODÈLE D'ÉQUIPE MINIMAL : la charge DÉJÀ déclarée (Réglages › Charge
   * commerciale) croisée avec le compte réel de dossiers suivis par le
   * commercial qui appelle. Voir `AccountsService.commercialLoadCapacity` et
   * `commercial-load-capacity.ts` pour ce que cette lecture n'invente PAS
   * (aucun modèle d'équipe multi-utilisateur). `get_account_preflight`
   * (apps/ia, `_team_scope_section`) nomme le résultat avant d'ouvrir un
   * compte.
   */
  @Post('workspace/commercial-load-capacity')
  async commercialLoadCapacity(@Body() dto: CopilotCommercialLoadCapacityDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.accounts.commercialLoadCapacity(workspaceId, dto.userId)
  }

  /**
   * #3210 (LAU-FINAL-216) — les cas passés (gagnés via un REX validé, perdus
   * via une opportunité `lost`) comparables à ce compte. Voir
   * `CapitalisationService.similarCases`.
   */
  @Post('cases/similar')
  async casesSimilar(@Body() dto: CopilotSimilarCasesDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.capitalisation.similarCases(workspaceId, dto.accountId)
    if (!result) return { error: 'account_not_found' }
    // P05.b (#3246, lot 09/10) — « dans la base commune » : les cas gagnés /
    // perdus des AUTRES espaces qui partagent le secteur, la taille ou la
    // position de groupe du compte (k >= 3 espaces, jamais un nom de client).
    const elsewhere = this.sharedBase
      ? await this.sharedBase
          .caseOutcomesElsewhere(workspaceId, dto.accountId)
          .catch(() => ({ error: 'shared_base_unavailable' as const }))
      : { error: 'shared_base_unavailable' as const }
    return { ...result, elsewhere }
  }

  /**
   * #3278.3 (#3259.7) — ce que l'espace a MESURÉ par canal (réponse du contact
   * sous 14 jours). Une LECTURE : `AnalysisService.channelPerformanceFor`, la
   * MÊME mesure que celle que le plan reçoit pour faire céder un preset de
   * canal. Un canal sous le seuil est rendu `sufficient: false`, sans taux.
   */
  @Post('channels/performance')
  async channelsPerformance(@Body() dto: CopilotChannelPerformanceDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    // #3234 (#3211.11) — `by: 'role'` : la MÊME mesure coupée par rôle de décision.
    if (dto.by === 'role') return { roles: await this.analysis.rolePerformanceFor(workspaceId) }
    // #3211.11 (lot RAISON-B) — `by: 'angle'` : la même mesure coupée par angle du message.
    if (dto.by === 'angle') return { angles: await this.analysis.anglePerformanceFor(workspaceId) }
    // #3211.11 (#3234, lot M11) — la recommandation PAR DIMENSION, sur les issues
    // déclarées : des comptes (positifs / jugés), jamais une probabilité.
    if (dto.by === 'cadence' || dto.by === 'route' || dto.by === 'priority') {
      const recommendation = await this.analysis.outcomeRecommendationFor(workspaceId, dto.by)
      if (!recommendation) return { error: 'outcome_recommendation_unavailable' }
      // P05.a (#3246, lot 09/10) — « ce qui marche AILLEURS », à côté de « chez
      // nous » : la base anonyme commune (k >= 3 espaces, des comptes, jamais
      // un nom). Une lecture en échec se NOMME, jamais un « rien ailleurs ».
      const elsewhere = this.sharedBase
        ? await this.sharedBase
            .actionOutcomesElsewhere(workspaceId, dto.by, dto.accountId)
            .catch(() => ({ error: 'shared_base_unavailable' as const }))
        : { error: 'shared_base_unavailable' as const }
      const reply: OutcomeRecommendation & { elsewhere: object } = { ...recommendation, elsewhere }
      return reply
    }
    return { channels: await this.analysis.channelPerformanceFor(workspaceId) }
  }

  /**
   * #3262.23 (épopée #3284, lot P05 29/09) — LA PHRASE DE LAURA sur un compte
   * Focus qui stagne. Voir `PilotageService.focusReviewForAccount` — la MÊME
   * règle que `staleFocusCount` (`reviewSignals`), appliquée à un compte nommé.
   */
  @Post('accounts/focus-review')
  async accountFocusReview(@Body() dto: CopilotFocusReviewDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const result = await this.pilotage.focusReviewForAccount(workspaceId, dto.accountId)
    if (!result) return { error: 'account_not_found' }
    return result
  }

  /**
   * #3919 — « qu'est-ce qui bouge chez ce compte ? » / « les comptes où ça
   * bouge ». MÊME lecture que la Veille du portefeuille
   * (`AccountsService.listAccountSignals`), jamais un second moteur (GA-26) :
   * `accountId` la restreint à un compte, son absence rend les 5 comptes dont
   * le signal le plus pertinent n'est pas périmé.
   *
   * Un `accountId` qui ne résout à AUCUN compte du workspace rend
   * `account_not_found` — jamais une liste vide qui se lirait comme « rien ne
   * bouge ». Un compte TROUVÉ mais sans signal actif rend `accounts: []` :
   * c'est la différence entre « je n'ai pas pu lire » et « j'ai lu, il n'y a
   * rien ».
   */
  @Post('accounts/signals')
  async accountSignals(@Body() dto: CopilotAccountSignalsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    let account: Awaited<ReturnType<AccountsService['findOneForWorkspace']>> | null = null
    if (dto.accountId) {
      account = await this.accounts.findOneForWorkspace(dto.accountId, workspaceId, businessUnitScope)
      if (isFailure(account)) return { error: 'account_not_found' }
    }

    // #3970 (lot P07) — « qui a été recruté chez X ? » : sur un compte NOMMÉ, la
    // MÊME lecture que la section « Recrutements récents » de la veille. Un échec
    // rend `null` (« pas lu »), jamais une liste vide qui se lirait « personne ».
    const [items, recentHires] = await Promise.all([
      this.accounts.listAccountSignals(workspaceId, dto.userId, businessUnitScope, dto.accountId),
      account && !isFailure(account)
        ? this.accounts.recentHires(workspaceId, dto.userId, account.output).catch(() => null)
        : Promise.resolve(undefined),
    ])
    // #3928.1 — « ce qui bouge » = un signal RÉCENT (`isRecentSignal`, la règle
    // partagée) : ni résolu, ni archivé, et jamais un signal SANS date — il
    // passait avant ce lot (`UNDATED` n'était pas écarté) et se lisait comme
    // une actualité du compte.
    const current = items.filter(item => isRecentSignal(item))

    const accountsInOrder: string[] = []
    const byAccount = new Map<string, { accountId: string; companyName: string; signals: typeof current }>()
    for (const item of current) {
      let bucket = byAccount.get(item.account_id)
      if (!bucket) {
        bucket = { accountId: item.account_id, companyName: item.company_name, signals: [] }
        byAccount.set(item.account_id, bucket)
        accountsInOrder.push(item.account_id)
      }
      bucket.signals.push(item)
    }
    // Sans compte nommé : les 5 comptes dont le signal le plus pertinent arrive
    // en tête (même tri que la Veille — score du compte, pertinence, date).
    const keptAccountIds = dto.accountId ? accountsInOrder : accountsInOrder.slice(0, 5)

    // P05.c (#3246, lot 09/10) — pour les TYPES de signal rendus, combien ont
    // été suivis d'une affaire ouverte sous 90 jours dans la base anonyme
    // commune (k >= 3 espaces). Aucun signal rendu : aucune clé (on n'affiche
    // pas ce qu'on n'a pas) ; une lecture en échec se NOMME.
    const signalTypes = keptAccountIds.flatMap(id =>
      byAccount
        .get(id)!
        .signals.slice(0, 8)
        .map(signal => signal.type)
        .filter((type): type is string => typeof type === 'string' && type.length > 0),
    )
    const sharedPrecedence =
      signalTypes.length === 0
        ? undefined
        : this.sharedBase
          ? await this.sharedBase
              .signalPrecedenceElsewhere(workspaceId, signalTypes, dto.accountId)
              .catch(() => ({ error: 'shared_base_unavailable' as const }))
          : { error: 'shared_base_unavailable' as const }

    // #4286.15.c (Louis 22/10/2026, `c127_market_pattern_tendances_entre_espaces`) — sur un compte NOMMÉ,
    // les tendances de marché entre espaces autour de son segment (recrutements par famille de métier,
    // k >= 3 espaces, « observé dans N espaces », jamais un taux ni un coût). Sans compte : aucune clé ;
    // une lecture en échec se NOMME.
    const marketPatterns =
      dto.accountId && account && !isFailure(account)
        ? this.sharedBase
          ? await this.sharedBase
              .marketPatternsElsewhere(workspaceId, dto.accountId)
              .catch(() => ({ error: 'shared_base_unavailable' as const }))
          : { error: 'shared_base_unavailable' as const }
        : undefined

    return {
      accountId: dto.accountId ?? null,
      ...(sharedPrecedence ? { sharedPrecedence } : {}),
      ...(marketPatterns ? { marketPatterns } : {}),
      ...(recentHires === undefined ? {} : { recentHires }),
      accounts: keptAccountIds.map(id => {
        const bucket = byAccount.get(id)!
        return {
          accountId: bucket.accountId,
          companyName: bucket.companyName,
          // Par compte : jusqu'à 8 signaux, pour ne jamais noyer la réponse d'un
          // compte très suivi — jamais une troncature silencieuse (le compte
          // reste nommé, seule la queue de liste est coupée).
          signals: bucket.signals.slice(0, 8).map(signal => ({
            label: signal.label,
            type: signal.type,
            date: signal.date,
            source: signal.source,
            // #3922.6 — le lien vérifiable posé par le pipeline (flux unique
            // `listAccountSignals`), ou `null` (analyse antérieure, déclaration
            // LinkedIn) : jamais un lien inventé ni une recherche.
            link: signal.source_url ?? null,
            linkKind: signal.source_url ? (signal.source_kind ?? null) : null,
            impact: signal.impact ?? null,
            salesImplication: signal.sales_implication ?? null,
            // #4977.1 — le lieu d'une OFFRE d'emploi, tel que le collecteur l'a lu : Laura cite poste + ville.
            // Absent = inconnu : aucune clé, jamais une ville devinée.
            ...(signal.location ? { location: signal.location } : {}),
            importance: signal.importance ?? null,
            actionLabel: signal.action_label ?? null,
            firstDetectedAt: signal.first_detected_at ?? null,
            lastSeenAt: signal.last_seen_at ?? null,
          })),
        }
      }),
    }
  }

  /**
   * #3903 — « sur les 90 derniers jours, chez qui puis-je relancer pour faire
   * du business ? ». Pour chaque compte ayant au moins une interaction
   * (email/appel/réunion/LinkedIn) dans la fenêtre : sa DERNIÈRE interaction
   * (date, sens, canal), le nombre de tentatives, et la catégorie qu'elles
   * dérivent (`ActivitiesService.engagementReport` — jamais un second
   * moteur, GA-26).
   *
   * `sourcesCoverage` NOMME les canaux sans AUCUNE ligne dans la fenêtre pour
   * TOUT l'espace : un canal absent peut vouloir dire « non branché » ou
   * « rien reçu » — cette seule table ne peut pas trancher, donc le pont ne
   * tranche pas non plus. `notEvaluated` NOMME ce que CE bilan ne croise PAS
   * (le statut de deal quand l'espace n'a aucun cache CRM d'affaires) plutôt
   * que de l'inventer — voir le docblock d'`engagement-report.ts`. #3903 (lot M01) : un deal CRM
   * OUVERT rattaché au compte (#3918.a) classe la ligne `deal_jamais_close`.
   */
  @Post('accounts/engagement-report')
  async accountsEngagementReport(@Body() dto: CopilotEngagementReportDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const sinceIso = dto.sinceDate
      ? `${dto.sinceDate}T00:00:00.000Z`
      : new Date(Date.now() - (dto.windowDays ?? 90) * 24 * 60 * 60 * 1000).toISOString()

    const [accounts, observedKinds, crmDealsRead] = await Promise.all([
      this.activities.engagementReport(workspaceId, sinceIso),
      this.activities.observedInteractionKinds(workspaceId, sinceIso),
      // #3903 (lot M01) — « deal jamais closé » n'est évalué QUE si l'espace a
      // un cache d'affaires CRM : sans lui, l'absence de deal ouvert ne prouve rien.
      this.activities.hasCrmDealCache(workspaceId),
    ])

    return {
      since: sinceIso,
      // #3903 (recette NB 10/10) — sans cache CRM d'affaires, « 0 affaire ouverte »
      // serait une absence affichée « 0 » (GA-18/GA-19) : les deux clés sont
      // RETIRÉES de chaque ligne, jamais posées à 0.
      accounts: crmDealsRead
        ? accounts
        : accounts.map(({ openCrmDeals: _openCrmDeals, openCrmDealNames: _openCrmDealNames, ...rest }) => rest),
      sourcesCoverage: {
        observed: observedKinds,
        notObserved: INTERACTION_ACTIVITY_KINDS.filter(kind => !observedKinds.includes(kind)),
      },
      // #3903 — DÉCISION LOUIS 09/10 : le critère « nogo déjà retenté » est
      // ABANDONNÉ. Il n'est plus nommé comme un manque — ni ici, ni dans le prompt.
      notEvaluated: crmDealsRead ? [] : ['open_deal_status'],
    }
  }

  /**
   * #3904 — DÉCISION LOUIS 09/10 : « proche de signer » = une opportunité au
   * stade proposition OU négociation, dans Bellum OU dans le CRM branché
   * (`ActivitiesService.nearSigning`). Jamais une probabilité. `crm: null`
   * NOMME un espace dont aucune affaire CRM n'a été lue — jamais une liste
   * vide qui se lirait « aucune affaire proche de signer dans ton CRM ».
   */
  @Post('accounts/near-signing')
  async accountsNearSigning(@Body() dto: CopilotPipelineDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const [rows, crmRead] = await Promise.all([
      this.activities.nearSigning(workspaceId),
      this.activities.hasCrmDealCache(workspaceId),
    ])
    return { bellum: rows.bellum, crm: crmRead ? rows.crm : null }
  }

  /* ── Le back-office (PDF 2 §5.1) ─────────────────────────────────────────── */

  /**
   * MON PIPE — « où en est mon pipe ce mois-ci ? ».
   *
   * Le calcul est celui de l'écran Pipeline, sans une ligne de SQL de plus :
   * cinq colonnes, leurs projets, leurs montants saisis, et le nombre de
   * projets NON CHIFFRÉS. Aucune pondération, aucune probabilité (refusé six
   * fois) — on additionne ce qui est saisi et on nomme ce qui ne l'est pas.
   *
   * ⚠️ Il rend le pipe de l'ESPACE, pas celui de l'appelant, parce que c'est le
   * seul pipe qui existe : `opportunities` ne porte pas de propriétaire
   * commercial, et lui en inventer un pour les besoins d'un filtre produirait
   * un chiffre que rien ne recoupe. L'outil le DIT au modèle.
   */
  @Post('pipeline/summary')
  async pipelineSummary(@Body() dto: CopilotPipelineDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return pipelineWithMeasuredAmounts(await this.pipeline.summary(workspaceId))
  }

  /**
   * #4016.1d (décision Louis 11/10/2026, levée de `c26_probabilite`) — LE CA
   * PROBABLE et la probabilité CALIBRÉE de chaque affaire, pour que Laura les CITE
   * avec leur intervalle, leur méthode et leurs axes — jamais un chiffre nu.
   *
   * Même calcul que `GET /projects/probable-quarter` (`DealProbabilityService`),
   * même droit : un CA probable est un prévisionnel de chiffre d'affaires, il
   * porte `finance:read:own`. Sans lui : `finance_forbidden`, le vocabulaire que
   * `chat_tools.py` sait déjà lire. La base commune est lue ICI (le contrôleur
   * compose ; un service ne va pas chercher celui d'un autre module, GA-07).
   */
  @Post('pipeline/probable-quarter')
  async probableQuarter(@Body() dto: CopilotPipelineDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:read:own')) return { error: 'finance_forbidden' }
    if (!this.dealProbability) return { error: 'unavailable' }
    const shared = this.sharedBase
    return this.dealProbability.probableQuarter(
      workspaceId,
      { kind: 'workspace' },
      shared
        ? shared.caseOutcomesElsewhereFor(workspaceId)
        : () => Promise.resolve({ status: 'not_enough_shared_data' as const }),
    )
  }

  /**
   * #2324.40/43/44/46/47/48 — LE DIAGNOSTIC DE PIPE, sans redirection forcée
   * vers l'écran Pipe (#2324.47) : cette lecture rend directement ce qui
   * mérite du temps (chacun avec ses raisons NOMMÉES), ce qui est recommandé à
   * la clôture, et combien de signaux le NO-GO #2324.48 a exclus — jamais un
   * score, jamais une probabilité. Même portée que `pipeline/summary`, pour la
   * même raison (voir son docblock).
   */
  @Post('pipeline/health')
  async pipelineHealth(@Body() dto: CopilotPipelineDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return this.pipeline.health(workspaceId)
  }

  /**
   * MON CHIFFRE D'AFFAIRES — « combien j'ai signé, facturé, encaissé ? ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI SORT, ET CE QUI NE SORT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * Les QUATRE lignes de `RevenueService.breakdown` — signé, produit, facturé,
   * encaissé — et rien d'autre. Aucune ne touche `loaded_daily_cost_cents` : le
   * signé vient du montant du projet, le produit des jours déclarés × le TJM,
   * le facturé et l'encaissé de `invoice_readiness`. **Le coût chargé et la
   * marge ne traversent donc pas ce pont**, et ce n'est pas une promesse de
   * commentaire : `aggregate()`, `marginAlerts()` et `marginByChannel()` ne sont
   * pas appelés ici, et `RevenueService` est la seule dépendance financière
   * injectée.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LAURA HÉRITE DU RÔLE DE L'APPELANT (§5.3)
   * ─────────────────────────────────────────────────────────────────────────
   * Le rôle ne VOYAGE pas depuis le service IA — il serait invérifiable. Il est
   * RÉSOLU ici, depuis le `userId`, par les mêmes primitives que la route JWT
   * (`resolveActiveWorkspace` + `extraPermissionsOf` + `can`). Le pont ne peut
   * donc qu'en RETIRER : sans `finance:read` ni `finance:read:own`, il refuse au
   * lieu de rendre des lignes vides, qui se liraient « tu n'as rien vendu ».
   *
   * `extraPermissionsOf` et non `can(role, [], …)` : les permissions accordées
   * membre par membre sont ADDITIVES, et les ignorer ici les rendrait sans
   * effet — le défaut trouvé sur la liste des missions le 22/08.
   */
  @Post('finance/revenue')
  async revenueBreakdown(@Body() dto: CopilotRevenueDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    const wide = can(role, extra, 'finance:read')
    if (!wide && !can(role, extra, 'finance:read:own')) return { error: 'finance_forbidden' }
    // `finance:read` gagne toujours : un responsable qui porte aussi un
    // portefeuille voit l'espace, comme sur `GET /delivery/finance/revenue`.
    const scope: FinanceScope = wide
      ? { kind: 'workspace', workspaceId }
      : { kind: 'own', workspaceId, userId: dto.userId }
    const month = dto.month ?? previousMonth()
    const [breakdown, info] = await Promise.all([this.revenue.breakdown(scope, month), this.revenue.scopeInfo(scope)])
    // La PORTÉE voyage avec les chiffres : sans elle, un commercial dont rien
    // n'est attribué lirait « 0 € » et en conclurait qu'il n'a rien vendu.
    return { ...breakdown, scope: info }
  }

  /**
   * MON CA CONFIRMÉ — #2900 (#2415.10). L'encaissé, moins ce qui est contesté.
   *
   * Même porte que `finance/revenue` (`finance:read` ou `finance:read:own`) :
   * c'est une dérivation de la MÊME ligne ENCAISSÉ, pas une nouvelle capacité —
   * qui peut voir l'une peut voir l'autre. `RevenueService.confirmedRevenue`
   * est la SEULE dérivation (GA-26) ; ce pont ne recalcule rien, il relaie —
   * pour que Laura explique qu'un jour contesté (`contestedDays`/
   * `correctionDeadline`) est EXCLU de ce chiffre, jamais fondu dans le total.
   *
   * La PORTÉE voyage avec les chiffres, comme sur `finance/revenue` : sans
   * elle, un commercial dont rien n'est attribué lirait « 0 € ».
   */
  @Post('finance/confirmed-revenue')
  async confirmedRevenue(@Body() dto: CopilotRevenueDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    const wide = can(role, extra, 'finance:read')
    if (!wide && !can(role, extra, 'finance:read:own')) return { error: 'finance_forbidden' }
    const scope: FinanceScope = wide
      ? { kind: 'workspace', workspaceId }
      : { kind: 'own', workspaceId, userId: dto.userId }
    const month = dto.month ?? previousMonth()
    const [confirmed, info] = await Promise.all([
      this.revenue.confirmedRevenue(scope, month),
      this.revenue.scopeInfo(scope),
    ])
    return { ...confirmed, scope: info }
  }

  /**
   * MA CAPACITÉ — « combien de jours j'ai à vendre ? ».
   *
   * Sous `finance:read` SEUL, comme `GET /delivery/finance/capacity` (D1) : elle
   * décrit l'ÉQUIPE, et un consultant n'a pas de propriétaire commercial. Ouvrir
   * ici ce que l'écran refuse ferait du copilote un contournement du RBAC.
   *
   * Le mois par défaut est le mois EN COURS et non le précédent : « combien de
   * jours j'ai à vendre » est une question sur maintenant.
   *
   * `capacityDays: null` veut dire « rien de mesurable », jamais « zéro jour » —
   * la distinction est portée par `computeCapacity`, on la relaie telle quelle.
   */
  @Post('finance/capacity')
  async capacity(@Body() dto: CopilotCapacityDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:read')) return { error: 'finance_forbidden' }
    return this.missionScores.capacity(workspaceId, dto.month ?? currentMonth())
  }

  /**
   * #2425.8 — LE PRÉVISIONNEL PAR HORIZON, pour que Laura explique l'écart
   * CA / cash avec les MÊMES causes chiffrées que l'écran (`gap.causes` :
   * délai de facturation, produit non facturé, retard, litige).
   *
   * Sous `finance:read` SEUL, comme la route de l'écran : c'est une vue
   * d'ÉQUIPE. Le calcul n'est pas refait ici — `ForecastHorizonsService` est la
   * seule dérivation ; aucun montant n'y est pondéré (c26).
   */
  @Post('finance/forecast')
  async forecastHorizons(@Body() dto: CopilotForecastHorizonsDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:read')) return { error: 'finance_forbidden' }
    return this.horizons.compute(workspaceId, dto.horizon ?? 'month')
  }

  /**
   * ENCAISSEMENTS EN RETARD — « qui ne m'a pas payé ? ».
   *
   * Les mois FACTURÉS et NON ENCAISSÉS, tels que l'écran de facturation les
   * connaît. Rien n'est recalculé : les lignes viennent de
   * `InvoiceReadinessService.list`, le verdict de relance de `reminderDue`, la
   * seule dérivation de retard du dépôt.
   *
   * ⚠️ **Le retard n'est PAS déduit ici.** `overdue_days` ne sort que lorsque
   * `reminderDue` le calcule ; sinon la ligne porte son échéance BRUTE et le
   * modèle énonce une date. Recompter les jours à côté ferait deux dérivations
   * du même retard, qui finiraient par diverger d'un jour sur les bornes.
   *
   * ⚠️ Une facture CONTESTÉE reste dans la liste — elle n'est pas payée, c'est
   * un fait — mais elle porte `disputed_at` et n'a jamais de relance due : un
   * litige n'est pas un retard, et relancer pendant une contestation est la
   * façon la plus sûre de durcir le client.
   *
   * L'échéance INCONNUE (`due_on: null`) reste elle aussi présente : c'est
   * justement la facture dont personne ne saura jamais dire qu'elle est en
   * retard. L'omettre la rendrait invisible.
   *
   * ⚠️ LOT 15, ARBITRAGE B — cette porte manquait, alors que `finance/revenue`
   * et `finance/capacity` (60 lignes plus haut) en ont une : n'importe quel
   * membre de l'espace pouvait demander à Laura les impayés de TOUT le monde
   * pendant que le même membre, demandant le CA, recevait `finance_forbidden`.
   *
   * PAS de repli `finance:read:own` : cette liste n'a pas de périmètre PAR
   * PORTEUR — elle rend le mois de tout l'espace, exactement comme
   * `invoice-readiness.controller.ts` le documente pour `dso`, `capacity` et
   * `margin-by-channel`. Ouvrir sur `:own` servirait donc l'argent de l'ESN
   * entière à qui n'a droit qu'au sien — le défaut qu'on corrige.
   */
  @Post('invoicing/overdue')
  async overduePayments(@Body() dto: CopilotOverduePaymentsDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:read')) return { error: 'finance_forbidden' }
    const now = new Date()
    // ⚠️ `canReadFinance: false` EN DUR, comme partout sur ce pont.
    //
    // Ce qui CHANGE ici le 29/08/2026 : `invoicedAmountCents` remontait au
    // copilote en clair, et il est désormais `null`. La file des impayés garde
    // tout ce qui la rend actionnable — le client, la mission, l'échéance, le
    // retard, le nombre de relances, le litige — et perd le seul champ qu'un
    // appel interne ne peut pas justifier d'avoir. Une relance se prépare sur
    // une échéance dépassée, pas sur un montant.
    // #2852 (recette Y9) — un impayé est un STOCK, pas un mois. Sans `month`,
    // la lecture ne portait que sur le mois PRÉCÉDENT : la facture d'août encore
    // due le 2 octobre n'apparaissait nulle part et Laura répondait « aucun
    // impayé ». Sans mois demandé on lit donc les douze derniers mois ET le mois
    // en cours ; avec un mois, ce mois-là seulement (comportement inchangé).
    const months = dto.month ? [dto.month] : recentMonths(now, UNPAID_LOOKBACK_MONTHS)
    const reads = await mapWithConcurrency(months, 4, requested =>
      this.readiness.list(workspaceId, { month: requested, blockedOnly: false }, { canReadFinance: false }, now),
    )
    const seen = new Set<string>()
    const items = reads
      // Un mois rendu deux fois ne compte qu'une fois.
      .filter(read => !seen.has(read.month) && seen.add(read.month))
      .flatMap(read => read.items.map(item => ({ ...item, periodMonth: read.month })))
      // Le plus ancien d'abord : c'est le plus en retard.
      .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
    const month = dto.month ?? null
    // #2419.4 — un paiement partiel ne sort pas de la file : le critère est le
    // SOLDE, comme partout ailleurs.
    //
    // ⚠️ SA LIMITE EST NOMMÉE, elle n'est pas contournée. Ce pont lit avec
    // `canReadFinance: false`, donc `redactFinance` (D45) a déjà mis les deux
    // montants à `null` — et « payé d'un montant non mesuré » vaut SOLDÉ. Le
    // copilote ne peut donc pas voir un règlement partiel, et il ne le verra
    // pas tant que le solde ne sera pas porté par la ligne comme un STATUT,
    // indépendant des montants qu'il n'a pas le droit de lire. Forcer les
    // droits financiers ici rouvrirait exactement la fuite que cette lecture
    // vient de fermer : on préfère un angle mort écrit à une fuite discrète.
    // #2197.41 — un mois DÉCLARÉ facturé (sans preuve de connecteur) attend
    // toujours son encaissement : `isInvoicedState` couvre les deux, PROUVÉ et
    // DÉCLARÉ, sinon une déclaration humaine sortirait de toute relance.
    const unpaid = items.filter(item => isInvoicedState(item.state) && !isSettled(item))
    return {
      // `null` = pas de mois demandé : `months` nomme alors la fenêtre lue.
      month,
      months: [...seen].sort(),
      items: unpaid.map(item => ({
        // Le mois d'ACTIVITÉ de la ligne : « août » et « septembre » ne se
        // confondent pas dans une liste unique.
        periodMonth: item.periodMonth,
        missionLabel: item.missionLabel,
        accountName: item.accountName,
        invoicedAt: item.invoicedAt,
        invoicedAmountCents: item.invoicedAmountCents,
        // #2197.41 — Laura ne doit jamais affirmer « facturé » sur une
        // déclaration : `declared` NOMME la distinction, et `invoicedByName`
        // porte l'acteur, pour que la phrase générée dise « déclaré facturé
        // par X », jamais « facturé ».
        declared: item.state === 'invoiced_declared',
        invoicedByName: item.invoicedByName ?? null,
        dueOn: item.dueOn,
        remindersSent: item.remindersSent,
        lastReminderAt: item.lastReminderAt,
        disputedAt: item.disputedAt,
        disputeReason: item.disputeReason,
        reminderDue: reminderDue(
          {
            state: item.state,
            dueOn: item.dueOn,
            paidAt: item.paidAt,
            // #2419.4 — un paiement partiel ne sort pas de la file : le solde
            // se lit sur les DEUX montants, jamais sur la seule date.
            paidAmountCents: item.paidAmountCents,
            invoicedAmountCents: item.invoicedAmountCents,
            remindersSent: item.remindersSent,
            disputedAt: item.disputedAt,
            disputeResolvedAt: item.disputeResolvedAt,
          },
          now,
        ),
      })),
    }
  }

  /**
   * Le brief d'une journée de rendez-vous.
   *
   * Un jour ENTIER et non « le prochain » : la question posée est « prépare mon
   * rendez-vous de demain », et quelqu'un qui en a trois demain ne veut pas
   * qu'on choisisse pour lui.
   *
   * ⚠️ LOT 18 (GA-326) — `limit: 25` était en dur, jamais flaggé : un jour à
   * 25 rendez-vous et un jour qui en a 40 rendaient la MÊME réponse. Sur-lire
   * d'UN (26) est ce qui permet à `chat_tools.py` (`prepare_day_brief`) de
   * détecter la coupe sans deviner — même motif que `list_agenda`/
   * `find_free_slots` (GA-317, côté IA).
   */
  @Post('agenda/day-brief')
  async dayBrief(@Body() dto: CopilotMeetingBriefDto) {
    const day = dto.day ?? isoDateInDays(1)
    const events = await this.agenda.listEvents(
      dto.userId,
      { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.000Z`, limit: 26 },
      { excludedProviders: agendaProvidersExcludedBy(dto.excludedProviders) },
    )
    return { day, events }
  }
  /* ── Le second marché et l'accès (tome 6 §16) ──────────────────────────── */

  /**
   * Par où on entre chez un compte : ce qui le VERROUILLE, les MODES d'entrée,
   * les portes classées, et ce que l'entrée COÛTE.
   *
   * Le §16 nomme deux outils sur cette route — `get_account_access` et
   * `get_access_path`. Il n'y en a qu'un ici, parce que la « route » que le
   * second demanderait est la MÊME lecture : les modes gradés et les entités
   * classées par rang d'entrée SONT le chemin. Deux outils auraient produit
   * deux appels au même service pour deux moitiés d'une seule réponse.
   *
   * ⚠️ Le coût et la barrière partent TELS QUELS. Le coût est un fait DÉCLARÉ
   * (D60) : `null` veut dire « personne ne l'a dit », jamais « c'est gratuit ».
   * La barrière est décomposée à la source — score, six proxies, ce qui manque
   * pour l'estimer — et la résumer ici produirait exactement la forme que la
   * doctrine refuse : un score nu.
   */
  @Post('accounts/access')
  async accountAccess(@Body() dto: CopilotAccountAccessDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const [landscape, routeInputs] = await Promise.all([
      this.accountAccessService.landscape(workspaceId, dto.accountId),
      this.accountAccessService.routeInputs(workspaceId, dto.accountId),
    ])
    return {
      lock: {
        state: landscape.lock.state,
        fact: landscape.lock.fact && {
          value: landscape.lock.fact.value,
          detail: landscape.lock.fact.detail,
          source: landscape.lock.fact.source,
          observed_at: landscape.lock.fact.observed_at,
          freshness: landscape.lock.fact.freshness,
        },
      },
      modes: landscape.modes,
      cost: landscape.cost && {
        value: landscape.cost.value,
        detail: landscape.cost.detail,
        source: landscape.cost.source,
        observed_at: landscape.cost.observed_at,
        freshness: landscape.cost.freshness,
      },
      // Les portes, déjà classées par rang d'entrée AVEC leur raison. Le §7.1
      // du tome 1 : sur un compte dont la proportion est mauvaise, on propose
      // les entités les plus accessibles au lieu du siège.
      entry_points: landscape.entities.map(entity => ({
        name: entity.name,
        kind: entity.kind,
        rank1_incumbent: entity.rank1_incumbent,
        score: entity.score,
        reason: entity.reason,
      })),
      avoid_group_entry: landscape.avoidGroupEntry,
      warning: landscape.warning,
      barrier: landscape.barrier,
      community: landscape.community,
      // #3278.2 — le FAIT panel/référencement déclaré (sous-aspect du processus
      // d'achat), `null` quand personne ne l'a déclaré : jamais un « pas de panel ».
      purchasing_panel: purchasingPanelOf(landscape.lock.fact),
      // #3278.1 (lot M11) — les signaux des routes « veille seule » et « depuis
      // un talent » : une clé absente ne dit rien, jamais un `false` vérifié.
      route_signals: routeInputs.signals,
      // #3278.2 (lot M11) — les six critères de route DÉCLARÉS sur la fiche ;
      // un critère vide n'a pas de clé (Laura le nomme « non évalué »).
      declared_route_criteria: routeInputs.declaredCriteria,
      // #3278.1 (décision Louis 11/10/2026) — le texte des faits « événement / communauté » et « inbound / contenu » ;
      // une clé par fait déclaré, aucune pour un fait vide.
      route_facts: routeInputs.facts,
      // #3278.3 (#3259.3) — preuves et historique des canaux, lus sur ce que l'espace a déjà accumulé ;
      // une clé absente = « non évalué », jamais « 0 ».
      accumulated_route_criteria: routeInputs.accumulated,
    }
  }

  /**
   * #3181.4 (épopée #3247) — LE LIEN SIREN partenaire↔client, pour un pool de candidats.
   * Un SIREN sans compte possédé reste ABSENT de la réponse : « on ne sait pas » n'est pas
   * « aucun chemin ». Aucun nom de fournisseur, aucune donnée d'un autre espace.
   */
  @Post('accounts/access-by-siren')
  async accessBySiren(@Body() dto: CopilotAccessBySirenDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return { bySiren: await this.partners.accessBySiren(workspaceId, dto.sirens) }
  }

  /**
   * #4289.12 — le STADE DE RELATION par SIREN, pour un pool de candidats d'alternatives : le MÊME moteur que les
   * cas similaires (`CapitalisationService.relationStagesBySiren` → `relationStageOf`). Un SIREN sans stade établi
   * dans l'espace ACTIF reste absent ; aucune donnée d'un autre espace. Aucune écriture.
   */
  @Post('accounts/relation-stages-by-siren')
  async relationStagesBySiren(@Body() dto: CopilotRelationStagesBySirenDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return relationStagesBySirenResponseSchema.parse({
      bySiren: await this.capitalisation.relationStagesBySiren(workspaceId, dto.sirens),
    })
  }

  /**
   * #3247 (décision Louis 15/10/2026) — l'accès à un compte que l'espace ne POSSÈDE PAS : le verrou
   * communautaire par SIREN (agrégat anonyme, partage réciproque), pour un pool de candidats d'un coup.
   * Un SIREN possédé est marqué `owned`, un SIREN sans fait est ABSENT. Aucune écriture.
   */
  @Post('accounts/community-access-by-siren')
  async communityAccessBySiren(@Body() dto: CopilotAccessBySirenDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return { bySiren: await this.accountAccessService.communityAccessBySiren(workspaceId, dto.sirens) }
  }

  /**
   * Les ESN déjà EN PLACE sur un compte, et le jeu que chacune ouvre.
   *
   * `recommendations[].play` est le seul endroit du produit qui nomme un
   * intermédiaire : `through_partner` dit par qui passer, `displace` dit qu'il
   * faut déloger, `find_out` dit qu'on ne sait pas encore. C'est ce que le §16
   * appelle `get_esn_on_account`.
   */
  @Post('accounts/partners')
  async accountPartners(@Body() dto: CopilotAccountPartnersDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const landscape = await this.partners.landscape(workspaceId, dto.accountId)
    return {
      partners: landscape.partners.map(partner => ({
        name: partner.name,
        rank: partner.rank,
        relationship: partner.relationship,
        // `analysis` ou `declared` : le modèle doit pouvoir dire « détecté »
        // plutôt que « connu », sans quoi une détection devient une certitude.
        source: partner.source,
        placements: partner.placements,
        certainty: partner.certainty,
        scope: partner.scope,
        detected_at: partner.detected_at,
        note: partner.note,
        score: partner.score,
      })),
      recommendations: landscape.recommendations.map(item => ({
        entity_name: item.entity_name,
        rank1_incumbent: item.rank1_incumbent,
        play: item.play,
        partner: item.partner,
        reason: item.reason,
      })),
      // #1596.3 — `landscape.observed` était déjà calculé (mémoire marché,
      // #1579) et déjà rendu à l'humain (`TabPartners.tsx`), mais jeté ICI :
      // le pont ne rendait que `partners` et `recommendations`. La
      // description de l'outil `get_esn_on_account` promet pourtant TROIS
      // natures de preuve — déclarée, détectée, OBSERVÉE — et sans ce champ
      // Laura ne peut jamais citer la troisième. `?? []` : `landscape` reste
      // typé `observed` non-optionnel côté service, mais un mock de test (ou
      // une réponse d'avant ce lot) peut l'omettre — jamais planter le pont
      // pour un champ d'affichage.
      observed: (landscape.observed ?? []).map(entry => ({
        esn_name: entry.esnName,
        persons: entry.persons,
        certainty: entry.certainty,
        also_known: entry.alsoKnown,
      })),
    }
  }

  /**
   * #3345.2 (LAU-FINAL-255, recette prod 30/09) — LES DÉCISIONS DÉJÀ PRISES
   * sur les pistes à qualifier d'UN compte (écartée / mise en veille), pour
   * que Laura (`get_qualification_lead_decisions`, `chat_tools.py`) sache ce
   * qu'un écran a déjà tranché avant d'en reproposer une. MÊME lecture que
   * `QualificationLeadsController.decisions` (aucun second calcul, GA-26) —
   * `@Optional()` comme les lectures précédentes : sans le service, la route
   * le dit plutôt que de faire tomber le pont.
   */
  @Post('accounts/qualification-lead-decisions')
  async accountQualificationLeadDecisions(@Body() dto: CopilotQualificationLeadDecisionsDto) {
    if (!this.qualificationLeads) return { error: 'qualification_leads_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const decisions = await this.qualificationLeads.decisions(workspaceId, dto.accountId)
    return { decisions }
  }

  /**
   * #3345 (recette prod 03/10) — retrouver une piste à qualifier par son LIBELLÉ.
   * Lecture seule : les lignes d'intake de l'espace (celles que lit l'écran
   * Opportunités), filtrées par `resolveQualificationLeads`. Laura ne demande
   * jamais un identifiant interne à un humain.
   */
  @Post('accounts/qualification-leads/resolve')
  async resolveQualificationLead(@Body() dto: CopilotQualificationLeadResolveDto) {
    if (!this.projects) return { error: 'projects_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const rows = await this.projects.listForWorkspace(workspaceId, dto.accountId)
    return resolveQualificationLeads(rows, { label: dto.label, accountId: dto.accountId })
  }

  /**
   * #1791.2 — LIRE le CRM d'espace pour UN compte, depuis la conversation.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LECTURE SEULE CÔTÉ CRM, COMME TOUT LE RESTE DE CE PONT
   * ─────────────────────────────────────────────────────────────────────────
   * `CrmReadService.findAccountPresence` est le SEUL appel vers un connecteur :
   * provider-agnostic, déjà pensé pour un consommateur non-humain (son
   * commentaire de tête dit littéralement « so the SPA / chatbot consume ONE
   * shape »). Aucune écriture n'existe vers le CRM, ni vers qui que ce soit
   * d'autre — c'est la règle du pont, précisée le 10/09 et non élargie (voir
   * le test « n'expose que des lectures »).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LA TRACE VISIBLE (LOUIS, 10/09) — LA SEULE EXCEPTION, ET ELLE EST NOMMÉE
   * ─────────────────────────────────────────────────────────────────────────
   * Une lecture réussie appelait déjà `this.logger.log(...)`, qui ne parle
   * qu'à l'opérateur : l'utilisateur qui a demandé à Laura de regarder son CRM
   * ne pouvait le savoir qu'en lisant des logs serveur. `ActivitiesService
   * .recordCrmLookup` écrit désormais UNE entrée sur le journal DU COMPTE
   * concerné — le même journal que ses e-mails et ses rendez-vous.
   *
   * ⚠️⚠️ Le GESTE, jamais le CONTENU : `recordCrmLookup` ne reçoit que
   * l'espace, l'auteur et le compte — trois identifiants, jamais `presence`
   * (connecté ou non, contacts, affaires). STOCKER et EXPOSER restent deux
   * décisions distinctes ; ici, il n'y a rien d'autre à exposer que le fait
   * même de la consultation. Best-effort et non bloquant : un échec d'écriture
   * de la trace ne prive jamais Laura de sa réponse.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE CONTRÔLE D'ACCÈS QUI MANQUAIT — « C'EST LE POINT NEUF »
   * ─────────────────────────────────────────────────────────────────────────
   * Le registre (`ToolRegistryService`) sait qui est BRANCHÉ ; il ne savait pas
   * qui a le DROIT de l'interroger DEPUIS LE CHAT — la route web équivalente
   * (`GET /crm/presence`) n'exige elle-même qu'un JWT, aucune permission fine.
   * Le chat élève la barre d'un cran parce que la donnée lue quitte le CRM pour
   * une AUTRE surface (le contexte du modèle, potentiellement observé côté
   * Langfuse).
   *
   * ⚠️ Le premier jet reprenait `data:export`, et ça marchait : tous les rôles
   * qui travaillent la portent. Mais « sortir des données du produit » et
   * « demander si ce compte est déjà chez nous » ne sont pas le même geste, et
   * les lier rend l'un infermable sans l'autre — le jour où l'on veut couper
   * la lecture CRM à quelqu'un, on lui coupe aussi l'export, et inversement.
   * D'où `crm:read`, AJOUTÉE EN FIN de l'énumération (GA-08) et donnée à tous
   * les rôles qui portaient `data:export` : personne ne perd un accès.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * JAMAIS LE NOM DE L'ÉDITEUR
   * ─────────────────────────────────────────────────────────────────────────
   * `CrmPresence.provider` vaut `'hubspot' | 'salesforce' | null` — exactement
   * ce que la règle du dépôt interdit de renvoyer au modèle. Il devient ici un
   * booléen `connected` : « un CRM est branché », jamais lequel.
   *
   * ⚠️ Couvre aujourd'hui HubSpot et Salesforce, PAS Pipedrive/Attio/Odoo —
   * c'est la limite de `CrmReadService` lui-même (2 des 5 CRM catalogués), pas
   * une restriction ajoutée ici. La route web `presence` a la même limite.
   */
  @Post('crm/presence')
  async crmPresence(@Body() dto: CopilotCrmPresenceDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'crm:read')) {
      this.logger.log(`copilot.crm_presence refused (permission) user=${dto.userId} workspace=${workspaceId}`)
      return { error: 'crm_read_forbidden' }
    }

    const account = await this.accountRows.findOne({
      where: [
        { id: dto.accountId, workspace_id: workspaceId },
        { id: dto.accountId, user_id: dto.userId },
      ],
    })
    if (!account) {
      // Compte introuvable/étranger : ne PAS interroger un CRM sur un nom
      // inventé. Même contrat que `_resolve_owned_contact` côté service IA.
      return { error: 'account_not_found' }
    }

    const presence = await this.crmRead.findAccountPresence(dto.userId, {
      account: account.company_name,
      domain: domainFromWebsite(account.website) ?? undefined,
      siren: account.siren ?? undefined,
    })

    this.logger.log(
      `copilot.crm_presence user=${dto.userId} workspace=${workspaceId} account=${dto.accountId} ` +
        `connected=${presence.provider !== null} matched=${presence.matched}`,
    )

    // La trace VISIBLE (Louis, 10/09) : le logger ci-dessus ne parle qu'à
    // l'opérateur, jamais à l'utilisateur qui a demandé la lecture. Le GESTE
    // seul voyage — ni `presence`, ni `connected`, ni un compte de contacts —
    // voir `ActivitiesService.recordCrmLookup`. Best-effort : une trace qui ne
    // s'écrit pas ne doit pas priver Laura de sa réponse.
    try {
      await this.activities.recordCrmLookup(workspaceId, dto.userId, account.id)
    } catch (error) {
      this.logger.warn(
        `copilot.crm_presence trace failed user=${dto.userId} workspace=${workspaceId} account=${dto.accountId}`,
        error instanceof Error ? error.stack : error,
      )
    }

    return {
      // Jamais le nom de l'éditeur (règle du dépôt) : `provider` devient un
      // booléen — « un CRM est branché », jamais lequel.
      connected: presence.provider !== null,
      matched: presence.matched,
      contacts_count: presence.contactsCount,
      contacts: presence.contacts.map(contact => ({
        name: contact.name,
        email: contact.email,
        job_title: contact.jobTitle,
      })),
      open_deals: presence.openDeals.map(deal => ({
        name: deal.name,
        stage: deal.stage,
        amount: deal.amount,
      })),
      last_activity_at: presence.lastActivityAt,
    }
  }

  /**
   * #3181.2 (épopée #3247) — « compte où le workspace possède une relation
   * (CRM) », UNE des 7 familles d'alternatives non mesurables citées par le
   * bilan du 28/09/2026 — jusqu'à cette tranche relayée sur le MAUVAIS pont
   * (`crm_presence` ci-dessus, qui exige un `accountId` déjà POSSÉDÉ). Un
   * candidat du pool d'alternatives (`suggest_account_alternatives`) n'en est
   * pas un : cette route relaie `findAccountPresence` PAR IDENTITÉ (nom,
   * domaine, siren), exactement comme `market/context` le fait pour la
   * mémoire marché — `describeAccountHistory` (analyse d'un compte pas
   * encore créé) prouve déjà que le service sous-jacent ne l'exige pas.
   *
   * Volontairement plus PAUVRE que {@link crmPresence} : ni contacts, ni
   * deals, ni trace d'activité (aucun compte à qui l'attribuer) — seulement
   * les deux booléens qu'une carte d'alternative peut honnêtement afficher.
   * Jamais le nom de l'éditeur (même règle que `crmPresence`).
   */
  @Post('crm/company-presence')
  async crmCompanyPresence(
    @Body() dto: CopilotCrmCompanyPresenceDto,
  ): Promise<{ connected: boolean; matched: boolean; lastActivityAt: string | null } | { error: string }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'crm:read')) {
      this.logger.log(`copilot.crm_company_presence refused (permission) user=${dto.userId} workspace=${workspaceId}`)
      return { error: 'crm_read_forbidden' }
    }

    const presence = await this.crmRead.findAccountPresence(dto.userId, {
      account: dto.companyName,
      domain: dto.domain,
      siren: dto.siren,
    })

    // #4065 — la dernière activité CRM, pour le listing d'inactivité ; `null` = aucune tracée.
    return {
      connected: presence.provider !== null,
      matched: presence.matched,
      lastActivityAt: presence.lastActivityAt ?? null,
    }
  }

  /**
   * #3182.2 (épopée #3248, retour bêta 28/09/2026) — LES CONSULTANTS DÉJÀ
   * POSITIONNÉS SUR UN COMPTE, PAR L'HISTORIQUE RÉEL DE STAFFING.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE TROU QUE CETTE ROUTE FERME
   * ─────────────────────────────────────────────────────────────────────────
   * `search_talents` (chat) balaie le vivier ENTIER — jamais filtré « qui a
   * déjà été positionné sur CE compte ». Un des neuf prérequis « ouverture de
   * compte » nommés par LAU-FINAL-188 (« anciens consultants »), sans lecture
   * dédiée.
   *
   * `StaffingService.listForAccount` — AUCUNE requête neuve : c'est la MÊME
   * lecture que `listForMission`/`listForConsultant` (`read()`, GA-26),
   * seulement filtrée par `mission.account_id`. `dailyRateCents` reste soumis
   * au même droit financier qu'ailleurs (`canReadFinance`, dans le service).
   *
   * Ownership vérifiée ICI, même contrat que `crmPresence` juste au-dessus :
   * un compte étranger ou inventé reste introuvable, jamais une question posée
   * sur un nom halluciné.
   */
  @Post('staffing/account-history')
  async accountStaffingHistory(@Body() dto: CopilotAccountStaffingHistoryDto) {
    if (!this.staffing) return { error: 'staffing_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const account = await this.accountRows.findOne({
      where: [
        { id: dto.accountId, workspace_id: workspaceId },
        { id: dto.accountId, user_id: dto.userId },
      ],
    })
    if (!account) return { error: 'account_not_found' }

    const rows = await this.staffing.listForAccount(dto.userId, dto.accountId)
    return {
      consultants: rows.map(row => ({
        consultant_id: row.consultantId,
        full_name: row.consultantName,
        mission_id: row.missionId,
        mission_label: row.missionLabel,
        starts_on: row.startsOn,
        ends_on: row.endsOn,
      })),
    }
  }

  /**
   * #2271.19 — L'HISTORIQUE D'UN COMPTE, POUR LA CARTE `timeline` DE LA CONVERSATION.
   *
   * Réutilise `AccountTimelineService.forAccount` À L'IDENTIQUE — la MÊME
   * fusion (actions journalisées, mouvements d'opportunité, exécutions de
   * workflow) que l'écran de fiche (`AccountTimelineCard.tsx`). Aucune
   * donnée nouvelle, aucun second calcul : réutiliser, jamais recalculer.
   *
   * Ownership vérifiée par `AccountTimelineService` lui-même (`workspace_id`,
   * la même borne que sa route JWT `GET /accounts/:id/timeline`) : un compte
   * qui n'appartient pas à l'espace de l'appelant reste introuvable, jamais un
   * 404 qui distinguerait « n'existe pas » de « pas à toi ».
   */
  @Post('account/timeline')
  async accountTimeline(@Body() dto: CopilotAccountTimelineDto) {
    if (!this.timeline) return { error: 'account_timeline_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    try {
      return await this.timeline.forAccount(dto.accountId, workspaceId)
    } catch {
      return { error: 'account_not_found' }
    }
  }

  /**
   * #3895 — LES NOTES D'UN COMPTE, AVEC LEUR PORTÉE.
   *
   * Une note achats écrite sur Sanofi peut dire valoir aussi pour Sanofi Pasteur (même tête
   * capitalistique, rattachement explicite de l'auteur). Laura ne lisait aucune note de compte : elle
   * ne pouvait donc ni les citer ni savoir où elles valent. La MÊME lecture que l'onglet Notes
   * (`NotesService.list`) : `inheritedFrom` nomme l'origine quand la note vient d'une autre entité du
   * groupe, `alsoAppliesTo` les entités où elle vaut aussi. Compte hors espace : introuvable, JAMAIS
   * les notes d'un autre espace. Bornée : 20 notes, 800 caractères chacune (la fiche garde le reste).
   */
  @Post('account/notes')
  async accountNotes(@Body() dto: CopilotAccountNotesDto) {
    if (!this.notesService) return { error: 'account_notes_unavailable' }
    const account = await this.accounts.findOne(dto.accountId, dto.userId)
    if (account.type !== 'success') return { error: 'account_not_found' }
    const all = await this.notesService.list(dto.userId, 'account', dto.accountId)
    const kept = all.slice(0, ACCOUNT_NOTES_CAP)
    return {
      notes: kept.map(note => ({
        id: note.id,
        body: note.body.length > ACCOUNT_NOTE_BODY_CAP ? `${note.body.slice(0, ACCOUNT_NOTE_BODY_CAP)}…` : note.body,
        pinned: note.pinned,
        createdAt: note.createdAt,
        authorName: note.authorName,
        inheritedFrom: note.inheritedFrom ?? null,
        alsoAppliesTo: note.alsoAppliesTo ?? [],
      })),
      truncated: all.length > kept.length,
    }
  }

  /**
   * #2623.1 — LES CONTACTS D'UN COMPTE, POUR ENCHAÎNER analyser → proposer les
   * contacts SANS QUITTER LA CONVERSATION.
   *
   * Laura pouvait déjà PRÉPARER une analyse (`analysis/plan` puis
   * `analysis/start`) et déjà préparer un message pour un contact NOMMÉ
   * (`prepare_message_for_contact`) — rien entre les deux ne lui rendait QUI
   * approcher sur le compte qu'elle vient d'analyser. Réutilise le MÊME
   * classement que l'onglet Contacts d'un compte (`ContactsService.rankForAccount`,
   * #2120.30-38) et la MÊME identité (`findByAccountForHttp`) — aucun second
   * calcul, aucune donnée inventée.
   *
   * Court, volontairement plafonné à cinq : une bulle de conversation se lit,
   * elle ne se dépouille pas (même doctrine que `run_account_search`) — la
   * liste complète reste sur l'écran.
   */
  @Post('account/contacts')
  async accountContacts(@Body() dto: CopilotAccountContactsDto) {
    const [rows, ranking, accountResult, { workspaceId }] = await Promise.all([
      this.contacts.findByAccountForHttp(dto.accountId, dto.userId),
      this.contacts.rankForAccount(dto.accountId, dto.userId, {}),
      this.accounts.findOne(dto.accountId, dto.userId),
      this.workspaceContext.resolveActiveWorkspace(dto.userId),
    ])
    // #2791 (recette écran 28/09/2026, ROCHE/Pharma) — le secteur BRUT du
    // compte, pour que l'IA nomme les sièges du comité propres au secteur
    // (`sector_committee_seats`) à côté des contacts trouvés. Un compte
    // introuvable relaie `null`, jamais une panne — cette route reste une
    // LECTURE de contacts, elle ne doit pas échouer sur un secteur.
    const accountSector = accountResult.type === 'success' ? (accountResult.output.sector ?? null) : null
    // #3243 — le PROFIL d'acteur du compte (nom, NAF, type résolu) : l'IA y lit le challenge
    // « partenaire potentiel » même quand la question est posée hors fiche ouverte. Absent =
    // `null`, jamais un type deviné du nom.
    const accountProfile =
      accountResult.type === 'success'
        ? {
            company_name: accountResult.output.company_name ?? null,
            naf_code: accountResult.output.naf_code ?? null,
            actor_type: accountResult.output.actor_type ?? null,
          }
        : null
    const byId = new Map(rows.map(row => [row.id, row]))
    // #2533 (recette prod 07/10, UNEO) — la FONCTION demandée se cherche dans
    // TOUS les contacts classés du compte, jamais seulement les cinq premiers :
    // la Directrice des SI y était 38e, et Laura répondait « pas de DSI ».
    // #2547 — `limit` (≤ 10) sert « N personnes par entreprise ».
    const limit = dto.limit ?? 5
    const eligible = dto.titleQuery
      ? ranking.ranked.filter(entry => titleMatchesFunction(byId.get(entry.contact_id)?.title, dto.titleQuery))
      : ranking.ranked
    const top = eligible.slice(0, limit)
    // #3219 (#190.2 pour un CONTACT) — la même visibilité de contradiction que
    // celle déjà branchée côté compte (`data_conflicts`,
    // `AccountIntelligenceContextService`) : `FieldConflictService` sait déjà
    // lire `entityType: 'contact'` (c'est ce que sert `GET /contacts/:id/conflicts`
    // depuis la passe E4) — jamais un second détecteur. Bornée aux CINQ
    // contacts déjà proposés par cette route, jamais tout le compte.
    const conflictsByContact = new Map(
      await Promise.all(
        top.map(
          async entry =>
            [entry.contact_id, await this.conflicts.openConflicts(workspaceId, 'contact', entry.contact_id)] as const,
        ),
      ),
    )
    const proposed = top.flatMap(entry => {
      const row = byId.get(entry.contact_id)
      if (!row) return []
      // ⚠️ `professional_network`, et surtout PAS `linkedin` (GA-69) : la valeur
      // part TELLE QUELLE vers le modèle, qui la reformulerait en « LinkedIn ».
      // On nomme la capacité — c'est déjà le mot de la description de l'outil
      // `get_account_contacts` (« email, réseau professionnel, téléphone »).
      const channels = [
        row.email ? 'email' : null,
        row.linkedin_url ? 'professional_network' : null,
        row.phone ? 'phone' : null,
      ].filter((channel): channel is 'email' | 'professional_network' | 'phone' => channel !== null)
      return [
        {
          contact_id: entry.contact_id,
          full_name: row.full_name,
          title: row.title,
          group: entry.group,
          position: entry.position,
          channels,
          // #2533 — décision Louis 04/10 : e-mail et téléphone EN CLAIR, et la
          // vérification de l'e-mail NOMMÉE. Sans elles, Laura disait « pas de
          // DSI vérifiée » face à une fiche qui affichait l'e-mail vérifié.
          email: row.email ?? null,
          email_verified: row.email_verified === true,
          // #4016.4e — une adresse ESTIMÉE (motif de l'entreprise, vérifiée MX/SMTP) se NOMME :
          // jamais citée comme connue. Absente ou connue : aucune clé.
          ...(row.email && isoDay(row.email_estimated_at)
            ? { email_estimated: true, email_estimated_on: isoDay(row.email_estimated_at) }
            : {}),
          phone: row.phone ?? null,
          // #2160 — le contexte COMPLET nommé par la fiche canonique : le rôle
          // COMMERCIAL (parcours d'achat, MEDDIC — distinct du `title`, le rôle
          // dans l'ENTREPRISE) et l'état du cycle de vie, déjà sur la ligne,
          // jusqu'ici jamais relayés à Laura.
          decision_role: row.decision_role,
          lifecycle_state: row.lifecycle_state,
          // #219.8 (#3231) — la relation personne↔entreprise DÉCLARÉE par le
          // commercial, dont Laura tire la preuve exigée. Non déclarée = aucune
          // clé : jamais une relation devinée d'un titre.
          ...(row.declared_person_company_relation
            ? { declared_person_company_relation: row.declared_person_company_relation }
            : {}),
          // #3869.2 / #3869.4 — le PÉRIMÈTRE de la personne (entité de rattachement, lieu de la collecte) et la
          // DATE de la dernière vérification de son emploi, quand le dossier les porte. Absents : aucune clé
          // (on n'affiche pas ce qu'on n'a pas) — jamais un « null » qui se lirait « vérifié nulle part ».
          ...(row.entity ? { entity: row.entity } : {}),
          ...(row.place ? { place: row.place } : {}),
          ...(isoDay(row.employment_verified_at) ? { employment_verified_on: isoDay(row.employment_verified_at) } : {}),
          // #3219 — une contradiction OUVERTE sur ce contact (deux sources
          // automatiques de même autorité, personne n'a tranché) ; liste vide
          // = aucune, jamais un silence qui se lirait comme « rien à vérifier ».
          conflicts: conflictsByContact.get(entry.contact_id) ?? [],
        },
      ]
    })
    // #3989 (Louis 11/10/2026, `c94_base_commune_capitalise_tout`) — les rôles
    // qu'un UTILISATEUR d'un autre espace a apportés sur la MÊME société,
    // anonymisés (le rôle, jamais la personne ni l'espace), que ce compte n'a pas
    // encore. Une lecture de la base commune, jamais un nom ; illisible ou vide :
    // aucune clé (on n'affiche pas ce qu'on n'a pas).
    const knownTitles = new Set(rows.map(row => (row.title ?? '').trim().toLowerCase()).filter(Boolean))
    const sharedRoles = await sharedCompanyOfAccount(this.accountRows.manager, dto.accountId)
      .then(company =>
        company ? sharedAnonymousRolesForCompany(this.accountRows.manager, company.scope, company.companyKey) : [],
      )
      .then(roles => [...new Set(roles)].filter(role => !knownTitles.has(role.toLowerCase())))
      .catch(() => [] as string[])
    return {
      contacts: proposed,
      ...(sharedRoles.length > 0
        ? { shared_base_roles: { provenance: SHARED_BASE_PROVENANCE_LABEL, roles: sharedRoles } }
        : {}),
      // #3890.4 (ADD-SANOFI-04) — un `titleQuery` borne le TOTAL à la MÊME
      // population que `contacts`/`matched` : le total brut de l'espace
      // (`ranking.total`) et un compte DÉJÀ filtré par fonction ne mesurent
      // pas la même chose, et les lire côte à côte comme deux comptages
      // généraux produit une fausse contradiction (« dix contacts » contre
      // « 2 597 personnes détectées », aucune des deux phrases ne disant sa
      // propre définition).
      total: dto.titleQuery ? eligible.length : ranking.total,
      truncated: eligible.length > top.length,
      // #2533 — la fonction cherchée, rendue pour que Laura la nomme quand la
      // liste est vide (« aucun contact DSI connu »), jamais un approchant.
      ...(dto.titleQuery ? { title_query: dto.titleQuery, matched: eligible.length } : {}),
      account_sector: accountSector,
      account_profile: accountProfile,
    }
  }

  /**
   * #2308 (LAU-FINAL-049) — LA CARTE DE COUVERTURE DU CHAT, pour un compte
   * déjà analysé : périmètre (groupe/filiale/BU/direction/programme/site),
   * famille de rôle d'achat et étape commerciale — trois axes DIFFÉRENTS de
   * la matrice famille × niveau de `GET /accounts/:id/coverage-gaps`
   * (`CoverageService.computeForAccount`), posés sur le MÊME service
   * (`computeChatCoverageMapForAccount`) plutôt que sur un second calcul.
   *
   * `@Optional()` comme `timeline`/`talentIdentity` ci-dessus : sans le
   * service, la route DIT qu'elle n'a pas accès plutôt que de faire tomber le
   * pont entier.
   */
  /**
   * #2308.32 (corrigé 23/09/2026, réfuté sur la prod 7e7105fb7) — compose la
   * mémoire marché ICI, dans la ROUTE, jamais dans `CoverageService` (GA-07 —
   * même raison, même patron que `observedRoleFamilies` dans
   * `coverage.controller.ts` : « fais l'orchestration dans le contrôleur,
   * c'est là que vit un geste utilisateur »). Best-effort STRICT, inline
   * plutôt qu'en méthode séparée : cette classe n'expose QUE des lectures
   * routées (voir le test qui énumère son prototype), une méthode privée de
   * plus y apparaîtrait comme une route qu'elle n'est pas.
   */
  @Post('account/coverage-map')
  async accountCoverageMap(@Body() dto: CopilotAccountCoverageMapDto) {
    if (!this.coverage) return { error: 'account_coverage_map_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    let marketMemoryObservedRoleFamilies: ReadonlySet<ChatCoverageRoleFamily> = new Set()
    const account = await this.accountRows.findOne({
      where: [
        { id: dto.accountId, workspace_id: workspaceId },
        { id: dto.accountId, user_id: dto.userId },
      ],
    })
    if (account?.company_name) {
      const read = await this.marketMemory.coverageFor({
        ref: dto.accountId,
        name: account.company_name,
        website: account.website ?? null,
        country: account.registry_country ?? null,
      })
      if (read.status === 'ok' && read.coverage.covered) {
        marketMemoryObservedRoleFamilies = resolveMarketMemoryRoleFamilies(read.coverage.roleFamilies)
      }
    }
    return this.coverage.computeChatCoverageMapForAccount(dto.accountId, workspaceId, marketMemoryObservedRoleFamilies)
  }

  /**
   * #2985 (revue manager, section G de #2319) — « transformer le même dossier
   * en revue de dix minutes », PAS un deuxième dossier : chaque champ rendu
   * ici est une lecture déjà exposée ailleurs, composée ICI (GA-07 —
   * l'orchestration à travers plusieurs domaines vit dans le contrôleur), pas
   * recalculée.
   *
   *  - `changeDigest` : le MÊME tiroir que `GET /accounts/:id/change-digest`
   *    (`AccountsService.changeDigest`).
   *  - `actionsCompleted` / `actionsStalled` : le MÊME plan que l'onglet Plan
   *    (`ActionPlanItemsService.listForAccount`), simplement rangé par statut
   *    d'exécution et échéance — jamais un second champ « réalisé ».
   *  - `risks` : les risques déjà SAISIS sur les affaires du compte
   *    (`PATCH /projects/:id/risks`), jamais un risque inventé.
   *
   *  - `coverage` : les manques de `accountCoverageMap` (la MÊME lecture que
   *    `get_account_coverage_map`), résumés ; illisible → `null`, jamais « aucun manque ».
   *  - `importantFacts` : les signaux `high` encore actifs de la Veille
   *    (`AccountsService.listAccountSignals`), de CE compte seulement.
   *  - `decisionsRequested` : les actions PRÉPARÉES qui attendent un geste humain.
   *  - `verdict` : un statut fermé + des raisons COMPTÉES, jamais une probabilité ;
   *    un axe illisible sort du verdict et est NOMMÉ (`notEvaluated`).
   *
   *  - `arbitrationsRequested` : l'arbitrage d'owner/ressource de #2319 — un consultant
   *    positionné sur une affaire du compte dont le référent commercial n'est pas le porteur
   *    de l'affaire (`ProjectsService.listOwnerResourceConflicts`) ; un porteur absent ne fait
   *    aucune ligne, rien n'est réattribué.
   * Tranché sans Louis (01/10) : verdict = statut à raisons comptées.
   */
  @Post('account/manager-review')
  async accountManagerReview(@Body() dto: CopilotAccountManagerReviewDto) {
    if (!this.actionItems || !this.projects) return { error: 'account_manager_review_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, dto.userId)
    const found = await this.accounts.findOneForWorkspace(dto.accountId, workspaceId, businessUnitScope)
    if (isFailure(found)) return { error: 'account_not_found' }

    const [changeDigest, items, projectRows, arbitrationsRequested, coverageRead, signalRows] = await Promise.all([
      this.accounts.changeDigest(dto.accountId, workspaceId),
      this.actionItems.listForAccount(dto.userId, dto.accountId),
      this.projects.listForWorkspace(workspaceId, dto.accountId),
      // #2319 — l'arbitrage owner/ressource : lu sur les porteurs déjà saisis (jamais écrit ici).
      this.projects.listOwnerResourceConflicts(workspaceId, dto.accountId),
      // Best-effort : une lecture secondaire qui échoue ne fait pas tomber la revue, elle est NOMMÉE.
      this.accountCoverageMap({ userId: dto.userId, accountId: dto.accountId }).catch(() => null),
      this.accounts.listAccountSignals(workspaceId, dto.userId, businessUnitScope).catch(() => null),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const actionsCompleted = items
      .filter(item => item.execution_status === 'done')
      .map(item => ({
        id: item.id,
        label: item.label,
        targetLabel: item.target?.label ?? null,
        ownerName: item.owner_name,
        completedAt: item.completed_at,
      }))
    // Non avancée = une échéance DÉPASSÉE, pas simplement absente d'une case
    // « fait » — un item sans échéance n'a jamais été promis pour une date, il
    // ne peut donc pas l'avoir manquée (GA-18/GA-19, « non mesuré » ≠ un manque).
    const actionsStalled = items
      .filter(
        (item): item is typeof item & { due_date: string } =>
          item.execution_status !== 'done' &&
          item.execution_status !== 'snoozed' &&
          Boolean(item.due_date) &&
          item.due_date! < today,
      )
      .map(item => ({
        id: item.id,
        label: item.label,
        targetLabel: item.target?.label ?? null,
        ownerName: item.owner_name,
        dueDate: item.due_date,
      }))
    const risks = projectRows
      .filter(row => !row.archived_at && row.risks?.trim())
      .map(row => ({ projectId: row.id, projectLabel: row.label, risks: (row.risks as string).trim() }))

    const decisionsRequested = items
      .filter(item => item.execution_status === 'prepared')
      .map(item => ({
        id: item.id,
        label: item.label,
        targetLabel: item.target?.label ?? null,
        ownerName: item.owner_name,
      }))
    const coverage =
      coverageRead && 'gaps' in coverageRead
        ? {
            gapCount: coverageRead.gaps.length,
            gaps: coverageRead.gaps.slice(0, 5).map(gap => ({ label: gap.label, reason: gap.reason })),
          }
        : null
    const importantFacts = (signalRows ?? [])
      .filter(row => row.account_id === dto.accountId && row.importance === 'high' && row.history_status !== 'resolved')
      .map(row => ({ label: row.label, date: row.date ?? null }))

    const reasons = [
      { kind: 'stalled_actions' as const, count: actionsStalled.length },
      { kind: 'risks' as const, count: risks.length },
      { kind: 'coverage_gaps' as const, count: coverage?.gapCount ?? 0 },
      { kind: 'decisions_pending' as const, count: decisionsRequested.length },
      { kind: 'arbitrations_pending' as const, count: arbitrationsRequested.length },
    ].filter(reason => reason.count > 0)
    const notEvaluated = [
      ...(coverage ? [] : (['coverage'] as const)),
      ...(items.length > 0 ? [] : (['plan'] as const)),
      ...(changeDigest ? [] : (['change_digest'] as const)),
      ...(signalRows ? [] : (['signals'] as const)),
    ]
    // `signals` nourrit les faits importants, pas le verdict : il est NOMMÉ s'il manque, sans compter comme axe lu.
    const axesRead = 3 - notEvaluated.filter(axis => axis !== 'signals').length
    const status = reasons.length > 0 ? 'attention' : axesRead > 0 ? 'stable' : 'not_evaluable'

    return accountManagerReviewSchema.parse({
      accountId: dto.accountId,
      accountName: found.output.company_name,
      generatedAt: new Date().toISOString(),
      changeDigest,
      actionsCompleted,
      actionsStalled,
      risks,
      verdict: { status, reasons, notEvaluated },
      coverage,
      importantFacts,
      decisionsRequested,
      arbitrationsRequested,
    })
  }

  /**
   * #2285.2 (épopée #2786) — LA FAÇADE CANONIQUE D'UN COMPTE, POUR LA
   * CONVERSATION.
   *
   * `compile_account_preflight` (apps/ia) relisait `accounts.company_name` /
   * `sector` / `headquarters` en direct, comme si le compte n'avait qu'une
   * seule table pour vérité — exactement le défaut que la façade `#1618`
   * corrige déjà pour l'écran (`GET /accounts/:id/intelligence-context`).
   * Un champ blanc en base mais connu de DataForge restait donc INVISIBLE à
   * Laura alors que la fiche compte le montrait : deux surfaces, deux
   * réponses (#2285.23, NO-GO). Cette route relaie EXACTEMENT
   * `AccountIntelligenceContextService.contextFor` — aucun second calcul.
   *
   * `@Optional()` comme `timeline`/`coverage` ci-dessus : sans le service, la
   * route le DIT plutôt que de faire tomber le pont entier.
   */
  @Post('account/intelligence-context')
  async accountIntelligenceContext(
    @Body() dto: CopilotAccountIntelligenceContextDto,
  ): Promise<AccountIntelligenceContext | { status: 'unavailable'; reason: string } | { error: string }> {
    if (!this.intelligenceContext) return { status: 'unavailable', reason: 'account_intelligence_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const context = await this.intelligenceContext.contextFor(dto.accountId, workspaceId)
    if (!context) return { error: 'account_not_found' }
    return context
  }

  /**
   * #3277.1 (épopée #3277, BEL-SC-225 suite) — LA PROJECTION `AccountStrategy5P`,
   * POUR LA CONVERSATION.
   *
   * Le premier appelant (fiche Compte, `GET /accounts/:id/strategy-5p`) est
   * déjà livré — ce pont relaie EXACTEMENT `AccountStrategy5PService.strategyFor`,
   * aucun second calcul, pour que Laura devienne le deuxième appelant nommé par
   * le ticket. `@Optional()` comme `intelligenceContext` juste au-dessus :
   * sans le service, la route le DIT plutôt que de faire tomber le pont.
   */
  @Post('account/strategy-5p')
  async accountStrategy5P(
    @Body() dto: CopilotAccountStrategy5PDto,
  ): Promise<AccountStrategy5P | { status: 'unavailable'; reason: string } | { error: string }> {
    if (!this.strategy5P) return { status: 'unavailable', reason: 'account_strategy_5p_unavailable' }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const strategy = await this.strategy5P.strategyFor(dto.accountId, workspaceId)
    if (!strategy) return { error: 'account_not_found' }
    return strategy
  }

  /**
   * #3258.14 (épopée #3362, lot E25 30/09) — LA MATRICE `AccountInterestPenetrability`,
   * POUR LA CONVERSATION.
   *
   * Le premier appelant (fiche Compte, `GET /accounts/:id/interest-penetrability`)
   * et le panneau Pilotage (`GET /accounts/interest-penetrability-portfolio`)
   * sont déjà livrés — ce pont relaie EXACTEMENT
   * `AccountInterestPenetrabilityService.matrixFor`, aucun second calcul, pour
   * que Laura devienne le troisième appelant nommé par l'épopée (#3258.14).
   * `@Optional()` comme `strategy5P` juste au-dessus : sans le service, la
   * route le DIT plutôt que de faire tomber le pont.
   */
  @Post('account/interest-penetrability')
  async accountInterestPenetrability(
    @Body() dto: CopilotAccountInterestPenetrabilityDto,
  ): Promise<AccountInterestPenetrability | { status: 'unavailable'; reason: string } | { error: string }> {
    if (!this.interestPenetrability) {
      return { status: 'unavailable', reason: 'account_interest_penetrability_unavailable' }
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const matrix = await this.interestPenetrability.matrixFor(dto.accountId, workspaceId)
    if (!matrix) return { error: 'account_not_found' }
    return matrix
  }

  /**
   * Le pipeline PARTENAIRE de l'espace — les ESN avec qui on travaille.
   *
   * Le §16 en tire deux outils, `search_partners` et `get_partner`. Un seul
   * ici : la liste porte déjà la fiche COMPLÈTE de chaque relation, score à
   * cinq axes compris. Un `get_partner` dépenserait un des deux tours d'outils
   * du budget pour un sous-ensemble de ce que la liste vient de rendre.
   */
  @Post('partners/pipeline')
  async partnerPipeline(@Body() dto: CopilotPartnerPipelineDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    return { partners: await this.partnerPipelineService.list(workspaceId) }
  }

  /**
   * La dynamique d'un TERRITOIRE — huit indicateurs, cinq blocs, chacun avec
   * son état.
   *
   * `@MarketData` côté route JWT : rien de ce que rend cette lecture
   * n'appartient à un espace. Elle est ici quand même parce que le pont est le
   * seul chemin par lequel le copilote atteint l'API, et parce que le score de
   * débordement se pose côté NestJS — il croise le référentiel ESN (notre
   * table) et le volume d'offres (les sources publiques).
   *
   * ⚠️ Trois des quatorze outils du §16 tombent sur cette seule route :
   * `get_territory_overview`, `search_territory_accounts` (les entreprises qui
   * recrutent, bloc `market`) et `search_territory_esn` (bloc `overflow`, avec
   * le score). Les déclarer séparément ferait partir TROIS fois la même moisson
   * de quatre sources publiques pour lire trois champs d'une seule réponse.
   */
  @Post('territory/overview')
  async territoryOverview(@Body() dto: CopilotTerritoryDto) {
    await this.esnDirectory.ensureSeeded()
    const known = await this.esnDirectory.knownNames()
    // Incident prod 07/10/2026 : le défaut du client HTTP (30 s + un second essai)
    // coupait l'IA à 30 s pile, pile quand l'appelant IA (30 s) abandonnait ;
    // l'essai 2 réussissait en 12,9 s, trop tard, et Laura disait « le territoire
    // n'a pas répondu ». Règle : l'appelant attend PLUS que le délai de l'appelé
    // × ses essais. Ici 45 s, UN essai ; l'IA (bellum_api) attend 55 s ; le tour
    // de Laura dure 90 s. Réglé pour CE chemin seulement (l'écran garde son défaut).
    const overview = await this.ia.territoryOverview(
      {
        department: dto.department,
        sinceDays: dto.sinceDays ?? 90,
        knownEsnNames: known,
      },
      { timeoutMs: 45_000, maxAttempts: 1 },
    )
    return withOverflowScores(overview, this.esnDirectory)
  }

  /**
   * Le RÉSEAU DORMANT (tome 1 §11.4) — les contacts sans échange depuis N mois.
   *
   * Aucune donnée nouvelle n'est collectée : le service relit `activities`,
   * déjà en base, et n'en garde que la DATE. Le corps des messages n'entre pas
   * dans le calcul et ne sort pas d'ici (D65).
   *
   * Ce qui remonte est volontairement pauvre : de quoi nommer la personne, dire
   * pourquoi elle vaut le geste, et enchaîner sur `prepare_message_for_contact`
   * avec son identifiant. Ni adresse e-mail ni téléphone — le modèle n'en a pas
   * besoin pour proposer une relance, et le clic les retrouvera.
   */
  @Post('contacts/dormant')
  async dormantContacts(@Body() dto: CopilotDormantContactsDto) {
    const months = dto.months ?? 6
    const requestedLimit = dto.limit ?? 20
    // #2799 — la langue des libellés d'axes suit celle de l'utilisateur,
    // jamais un FR par défaut silencieux (même contrat que `CopilotAnalysisPlanDto`).
    const locale = dto.locale === 'en' ? 'en' : 'fr'
    // #2799 (épopée) / #2374.16-17 — la SQL de `findAllForUser` ne trie que par
    // `created_at DESC` : sur la seule ancienneté, c'est exactement ce que
    // #2374.17 interdit de laisser décider seul. On élargit donc la fenêtre
    // candidate (bornée, jamais illimitée) pour reclasser sur neuf axes
    // nommés avant de tronquer à la taille demandée — jamais l'inverse, qui
    // ne ferait que retrier un extrait déjà arbitraire.
    const fetchLimit = Math.min(requestedLimit * 3, 150)
    const result = await this.contacts.findAllForUser(dto.userId, {
      dormantMonths: months,
      limit: fetchLimit,
      offset: 0,
    })
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const signalsByContact = await this.contacts.dormantReactivationSignals(
      result.data.map(contact => contact.id),
      workspaceId,
    )
    const ranked = result.data
      .map(contact => {
        const signals = signalsByContact.get(contact.id)
        const reactivation = computeDormantReactivationScore({
          monthsSinceLastActivity: signals?.monthsSinceLastActivity ?? null,
          hasEmail: contact.email !== null,
          hasProfessionalNetwork: contact.linkedin_url !== null,
          pastActivityCount: signals?.pastActivityCount ?? null,
          lastActivitySubject: signals?.lastActivitySubject ?? null,
          signals: signals?.signals ?? null,
          decisionRole: contact.decision_role,
          title: contact.title,
          accountPriorityScore: signals?.accountPriorityScore ?? null,
          accountAssignedTo: signals?.accountAssignedTo ?? null,
          whyContact: contact.why_contact,
        })
        return { contact, reactivation }
      })
      // #2374.17 — jamais l'ordre SQL brut (ancienneté) : un score absent
      // (moins de trois axes évalués) passe en dernier, jamais en tête par
      // défaut d'ordre.
      .sort((a, b) => (b.reactivation.score ?? -1) - (a.reactivation.score ?? -1))
      .slice(0, requestedLimit)

    return {
      months,
      // ⚠️ `data` / `pagination.totalItems`, jamais `items` / `total` : la
      // liste de contacts est paginée par le contrat partagé, et deviner la
      // forme d'une réponse est la faute qui produit un `undefined` silencieux
      // que le modèle lirait « aucun contact dormant ».
      total: result.pagination.totalItems,
      contacts: ranked.map(({ contact, reactivation }) => ({
        contact_id: contact.id,
        account_id: contact.account_id,
        full_name: contact.full_name,
        title: contact.title,
        company_name: contact.company_name,
        decision_role: contact.decision_role,
        why_contact: contact.why_contact,
        // La personne est-elle joignable, et par quoi ? Le canal, jamais
        // l'adresse : le modèle propose, le clic ouvre le brouillon.
        //
        // ⚠️ `has_network_profile`, et surtout PAS `has_linkedin` : ce champ
        // s'appelait ainsi, et le 29/08/2026 Laura répondait en clair
        // « Jean-Sébastien B. — Group CIO — LinkedIn disponible ». Personne
        // n'avait écrit cette phrase : le modèle avait reformulé le NOM DU
        // CHAMP. Sur le chemin du copilote, une clé de JSON est du texte
        // affiché — le prompt disait déjà « nomme la capacité », et une
        // consigne juste ne survit pas à une donnée qui la contredit.
        // Garde GA-69 (`architecture/copilot-payload-names-the-capability`).
        has_email: contact.email !== null,
        has_network_profile: contact.linkedin_url !== null,
        // #2799 — le score n'est JAMAIS nu : les neuf axes voyagent NOMMÉS,
        // qu'ils soient évalués ou non (`evaluated: false` = hors du
        // dénominateur, jamais un zéro deviné). `score`/`max_possible` sont
        // `null` sous trois axes évalués (doctrine « un score n'est jamais
        // bruité de sens »).
        reactivation_score: {
          score: reactivation.score,
          max_possible: reactivation.maxPossible,
          axes: reactivation.axes.map(axis => ({
            key: axis.key,
            label: dormantReactivationAxisLabel(axis.key, locale),
            evaluated: axis.points !== null,
            points: axis.points,
            max: axis.max,
            proof: axis.proof,
          })),
        },
      })),
    }
  }

  /**
   * Laura compte avant de proposer (décision Louis, 15/09/2026, contre la
   * recommandation) — combien de contacts correspondraient au filtre d'un
   * lien AVANT qu'elle le propose. Le défaut corrigé : un lien profond valide
   * (route existante, filtre lu) qui ne ramène AUCUNE ligne — l'utilisateur
   * le découvre en cliquant, pas nous.
   *
   * L'appelant (`_deep_link_count`, `chat_tools.py`) ne l'interroge QUE pour
   * les écrans de son catalogue marqués comptables (une LISTE, jamais une
   * fiche `:id`), et son échec n'empêche JAMAIS la proposition — le compte a
   * son PROPRE budget de latence côté service IA. Une erreur ici REMONTE
   * volontairement (`ContactsService.countForUser` ne l'avale pas en 0) : le
   * pont la traduit en réponse non-2xx, que `bellum_api._post` lit déjà comme
   * « je n'ai pas pu compter », jamais comme un filtre vide.
   */
  @Post('contacts/count')
  async contactsCount(@Body() dto: CopilotContactsCountDto) {
    const { userId, ...filters } = dto
    return { count: await this.contacts.countForUser(userId, filters) }
  }

  /**
   * Les contacts qui ont PEUT-ÊTRE changé de poste (tome 4, tome 6 §16) — le
   * 14e outil de territoire, celui qui n'avait pas de capacité REST : le calcul
   * existait dans `CrmRoutinesService.contactsWhoMayHaveMoved` (comptes ET ESN,
   * dédoublonnés), mais SEULE une routine privée l'appelait. Rien d'autre ne
   * change de calcul ici — voir le commentaire sur `contactMovesAccountsSql`.
   *
   * ⚠️ UNE PRÉSOMPTION, PAS UN FAIT. La détection compare des LIBELLÉS
   * (l'employeur lu au dernier enrichissement contre le nom du compte suivi) —
   * approximative par nature, et c'est pour ça que la routine d'origine
   * notifie « à vérifier » sans jamais écrire sur une fiche. `basis` porte
   * cette réserve jusqu'au modèle : aucun champ ici ne doit être lu comme un
   * fait établi.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE COUPLAGE, SANS TOUCHER `RoutinesModule`
   * ─────────────────────────────────────────────────────────────────────────
   * `RoutinesModule` n'exporte que `RoutinesService` (`CrmRoutinesService` reste
   * un provider privé), et il est hors du périmètre de ce chantier. Plutôt que
   * d'y ajouter un export — un couplage service→service que GA-07 compterait
   * en plus, pour un module qui composerait alors `routines` en entier —, ce
   * pont exécute les DEUX requêtes déjà EXPORTÉES par `crm-routines.service.ts`
   * (`contactMovesAccountsSql`, `contactMovesEsnSql`) sur SON PROPRE repository
   * `AccountEntity` (`TypeOrmModule.forFeature`, un schéma partagé, hors du
   * cliquet GA-07), puis les fusionne avec le MÊME `dedupeContactMoves`. Zéro
   * import service→service, zéro seconde définition de la requête ou de la
   * règle de fusion — seulement leur RÉUTILISATION depuis un second point
   * d'entrée, exactement le patron déjà posé par `needsWithoutShortlistSql`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI PAS `CrmRoutinesService.contactsWhoMayHaveMoved` DIRECTEMENT
   * ─────────────────────────────────────────────────────────────────────────
   * Sa méthode privée `rows()` avale toute erreur SQL et rend `[]` — un choix
   * juste pour une routine qui retente le mois suivant (« rien à signaler »),
   * FAUX pour une capacité qui parle à Laura : un `[]` de PANNE se lirait
   * « personne n'a changé de poste », une phrase fausse qu'une vraie liste
   * vide dirait à l'identique. Ici, une panne SQL fait rejeter `Promise.all`
   * et remonte donc comme une erreur HTTP claire — jamais comme une liste
   * vide muette.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LOT 17 — « LES CONTACTS DU PORTEFEUILLE », VRAIMENT
   * ─────────────────────────────────────────────────────────────────────────
   * `chat_tools.py` disait « les contacts DU PORTEFEUILLE » ; jusqu'ici cette
   * méthode ne recevait que l'espace et agrégeait TOUT le portefeuille de
   * l'équipe, collègues compris. Le cloisonnement de portefeuille (décision
   * D5, `portfolioScopeFor`) est déjà la réponse du dépôt à cette question —
   * la MÊME que `chainBlockers` applique (LOT 15) — donc on la rejoue ici
   * plutôt que d'en inventer une seconde :
   *  · visibilité `open` (le défaut assumé du produit) → `scope` `null`, rien
   *    ne change, EXACTEMENT le comportement d'avant ;
   *  · visibilité `restricted` et un rôle sans `team:manage` → seuls les
   *    contacts dont le compte SUIVI est porté par CET utilisateur (plus les
   *    comptes non attribués) ressortent.
   *
   * Le FILTRAGE se fait EN MÉMOIRE, par identifiant (`move.account_id`),
   * jamais par le nom du compte — une jointure par libellé se tromperait sur
   * les homonymies, exactement ce que ce fichier refuse déjà pour le
   * rattachement ESN. `ownedAccountIdsSql` (`crm-routines.service.ts`) est une
   * requête à part, jamais une clause ajoutée à `contactMovesAccountsSql` /
   * `contactMovesEsnSql` : ces deux dernières restent figées au caractère
   * près par `crm-routines.service.spec.ts`, et cette question — « à qui » —
   * n'est posée que quand un `scope` est effectivement demandé.
   */
  @Post('contacts/job-changes')
  async jobChanges(@Body() dto: CopilotJobChangesDto) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, dto.userId)
    const [accountMoves, esnMoves, ownedAccountIds] = await Promise.all([
      this.accountRows.manager.query<(ContactMove & { account_id: string })[]>(contactMovesAccountsSql(), [
        workspaceId,
      ]),
      this.accountRows.manager.query<(ContactMove & { account_id: string })[]>(contactMovesEsnSql(), [workspaceId]),
      scope
        ? this.accountRows.manager.query<{ id: string }[]>(ownedAccountIdsSql(), [
            workspaceId,
            scope.ownerId,
            scope.includeUnassigned,
          ])
        : Promise.resolve(null),
    ])
    // `owned === null` veut dire « aucun scope demandé » (visibilité `open`,
    // ou un rôle avec `team:manage`) : rien ne filtre. Un Set VIDE, lui,
    // exclut tout — le cas normal d'un commercial à qui rien n'est attribué.
    const owned = ownedAccountIds ? new Set(ownedAccountIds.map(row => row.id)) : null
    const isOwned = (move: { account_id: string }) => owned === null || owned.has(move.account_id)
    const moves = dedupeContactMoves(esnMoves.filter(isOwned), accountMoves.filter(isOwned))
    return {
      presumed_moves: moves.map(move => ({
        contact_name: move.full_name,
        tracked_account_name: move.company_name,
        presumed_new_employer: move.new_employer,
        known_since: move.known_since,
        // Le compte du nouvel employeur, SI déjà suivi — jamais créé ici.
        new_employer_account_id: move.new_account_id,
      })),
      basis:
        "Détecté en comparant le nom d'employeur lu au dernier enrichissement au nom du compte suivi — " +
        'une correspondance de LIBELLÉS, jamais une confirmation. À vérifier avant toute action.',
    }
  }

  /**
   * #1596.6-10 / #1628.1 — LA RECHERCHE PAR FILTRE : le 46ᵉ outil de Laura, et
   * l'INVERSE de toutes les lectures ci-dessus.
   *
   * Chaque autre méthode de ce contrôleur qui touche la mémoire marché part
   * d'une IDENTITÉ (un compte, une entreprise nommée) ; celle-ci part de
   * CRITÈRES — « quelles entreprises ont observé du Java, en Île-de-France, à
   * plus de 500 personnes ? » — et n'avait aucun endroit où se poser avant ce
   * lot (`grep -rln "search_market_memory" apps packages` rendait `0`).
   *
   * ⚠️ Relayé TEL QUEL, comme `accountAccess` : `MarketMemoryService
   * .searchByFilters` applique DÉJÀ le seuil, le vocabulaire d'absence
   * (`unavailable` ≠ liste vide) et l'exclusion de toute identité — recomposer
   * cette forme ici en ferait une SECONDE dérivation, qui pourrait diverger de
   * la première dès son premier refactor (GA-258 : un seul point d'entrée).
   *
   * Le CORPUS n'est jamais scopé : ses tables sont PARTAGÉES entre tous les
   * espaces (GA-16). ⚠️ #1961.21 — l'espace de l'appelant est pourtant résolu,
   * pour UNE seule chose : lire SON portefeuille, afin qu'une entreprise trouvée
   * qui est aussi un de ses comptes porte la route de sa fiche. Voir
   * `marketSearchPortfolio`.
   */
  /**
   * #1611.4 / #1611.5 — LA MÉMOIRE MARCHÉ D'UN COMPTE, PAR IDENTITÉ.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE ROUTE, ALORS QUE `GET :id/market-context` EXISTE DÉJÀ
   * ─────────────────────────────────────────────────────────────────────────────
   * `accounts.controller.ts` sert déjà la mémoire marché d'un compte — mais
   * derrière un JWT utilisateur, pour le navigateur. Le pipeline Phase 4
   * (`bellum_plan.py` / `bellum_messages.py`) tourne côté service IA, sans
   * session HTTP utilisateur : il lui faut la même lecture, par le pont
   * interne, comme `analysisPlan`/`analysisStart` le font déjà pour le reste
   * du pipeline.
   *
   * Relayé TEL QUEL vers `MarketMemoryService.coverageFor` — GA-258, un seul
   * point d'entrée vers les tables partagées. Le service IA n'en extrait QUE
   * les expertises déclarées de l'ESN qui recoupent `coverage.observedStack`
   * (voir `app/services/market_memory_angle.py`) : aucun nom de société de
   * services, aucun comptage de parcours ne traverse jusqu'à un prompt.
   */
  @Post('market/context')
  async marketContext(@Body() dto: CopilotMarketMemoryContextDto): Promise<MarketMemoryRead> {
    return this.marketMemory.coverageFor({
      ref: dto.ref,
      name: dto.companyName,
      website: dto.website ?? null,
      country: dto.country ?? null,
    })
  }

  /**
   * #2284.26 (#2978, lot SRC2 28/09/2026) — LE DOMAINE QUE L'ALIAS PROUVE, POUR
   * LE RÉSOLVEUR D'ENTITÉ.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE ROUTE, DISTINCTE DE `market/context`
   * ─────────────────────────────────────────────────────────────────────────────
   * `MarketMemoryCoverage` (route ci-dessus) est délibérément scrubbée de toute
   * identité de société de services observée — c'est ce qui la rend sûre à
   * injecter dans un prompt. Un DOMAINE de compte n'est pas ce genre de donnée
   * (ni un fournisseur ni une identité tierce), mais l'ajouter à cette forme
   * chargée aurait risqué d'élargir un contrat gardé par vingt exclusions
   * documentées. Une route à part, un contrat minimal.
   *
   * Relayé TEL QUEL vers `MarketMemoryService.aliasProvenDomain` — GA-258.
   */
  @Post('market/alias-domain')
  async marketAliasDomain(@Body() dto: CopilotMarketAliasDomainDto): Promise<{ domain: string | null }> {
    const domain = await this.marketMemory.aliasProvenDomain({
      ref: dto.ref,
      name: dto.companyName,
      website: dto.website ?? null,
      country: dto.country ?? null,
    })
    return { domain }
  }

  @Post('market/search')
  async marketSearch(@Body() dto: CopilotMarketMemorySearchDto): Promise<MarketMemorySearchRead> {
    const { portfolio, workspaceId } = await this.marketSearchPortfolio(dto.userId)
    const read = await this.marketMemory.searchByFilters(
      {
        technology: dto.technology,
        location: dto.location,
        city: dto.city,
        region: dto.region,
        esn: dto.esn,
        roleFamily: dto.roleFamily,
        employeeMin: dto.employeeMin,
        employeeMax: dto.employeeMax,
        size: dto.size,
        externalRecourseObserved: dto.externalRecourseObserved,
        isServiceCompany: dto.isServiceCompany,
        limit: dto.limit,
      },
      { portfolio, workspaceId },
    )

    // #1961 — PARSÉ AU BORD. Cette forme part vers le modèle, qui la répète :
    // un champ hors contrat (un domaine, une clé du corpus, une date) ne
    // traverse pas, et une forme qui ment (une couverture déclarée sous le
    // seuil) se dit INDISPONIBLE plutôt que d'être relayée. Seuls les CHEMINS
    // des champs fautifs sont journalisés — jamais leur contenu.
    const parsed = marketMemorySearchReadSchema.safeParse(read)
    if (parsed.success) return parsed.data
    this.logger.error(
      `copilot.market_search forme hors contrat user=${dto.userId} ` +
        `champs=${parsed.error.issues.map(issue => issue.path.join('.')).join(',')}`,
    )
    return { status: 'unavailable', reason: 'contract_mismatch' }
  }

  /**
   * #3177.2 / épopée #3225 — LA MÉMOIRE MARCHÉ D'UN GROUPE (racine + filiales),
   * exposée à `search_market_memory` (Laura) quand le fil ancre la question sur
   * une IDENTITÉ (`company_id`) plutôt que sur des critères. Relayé vers
   * `MarketMemoryService.coverageForGroup` — GA-258, un seul point d'entrée.
   *
   * `rootAccountId` n'est PAS relu dans le portefeuille ici : l'appelant IA a
   * déjà vérifié l'ownership du compte racine (`fetch_owned_account`) avant de
   * construire ce corps — cette route ne fait que router la lecture, exactement
   * comme `marketContext` ci-dessus ne relit pas non plus le portefeuille.
   */
  @Post('market/context-group')
  async marketContextGroup(@Body() dto: CopilotMarketMemoryGroupContextDto): Promise<MarketMemorySearchRead> {
    const read = await this.marketMemory.coverageForGroup(
      dto.entities.map(entity => ({
        ref: entity.ref,
        name: entity.companyName,
        website: entity.website ?? null,
        country: entity.country ?? null,
      })),
      { rootAccountRoute: `/accounts/${dto.rootAccountId}` },
    )

    // Même bord que `marketSearch` ci-dessus : parsé avant de partir vers le
    // modèle, jamais relayé tel quel.
    const parsed = marketMemorySearchReadSchema.safeParse(read)
    if (parsed.success) return parsed.data
    this.logger.error(
      `copilot.market_context_group forme hors contrat user=${dto.userId} ` +
        `champs=${parsed.error.issues.map(issue => issue.path.join('.')).join(',')}`,
    )
    return { status: 'unavailable', reason: 'contract_mismatch' }
  }

  /**
   * #1961.21 — le portefeuille de l'APPELANT, pour qu'une entreprise trouvée qui
   * est aussi un de SES comptes porte la route de sa fiche.
   *
   * La MÊME population que `GET /accounts` et `/accounts/market-memory-portfolio`
   * (`listPortfolioLookups`, cloisonnement D5 par `portfolioScopeFor`) : un
   * commercial dont la visibilité est restreinte ne reçoit pas le lien d'un
   * compte qu'il ne voit pas dans sa liste. Le compte d'un AUTRE espace n'y entre
   * jamais — l'espace est celui de l'appelant, résolu ici, jamais passé par le
   * service IA.
   *
   * Best-effort : un espace introuvable ou une lecture en panne ne privent pas
   * de la recherche — le corpus se lit, sans aucun lien.
   */
  /**
   * #2987.56 — LA FILE DES NOTES DE FRAIS QUI ATTENDENT UNE DÉCISION.
   *
   * Jusqu'ici Laura ne savait que naviguer vers `/expenses` (route déclarée
   * dans `chat_tools.py`) — aucun outil ne lui disait QUOI y attend une
   * décision, donc aucune conversation (vocale ou texte) ne pouvait proposer
   * de valider ou refuser une note. « Confirmation vocale seule insuffisante
   * pour une dépense importante » (#2434) est tenu PAR CONSTRUCTION, pas par
   * un garde-fou ajouté ici : cette route ne fait QUE lire, et c'est le
   * service IA qui rend une PROPOSITION (`_proposal`) que seul le CLIC de
   * l'utilisateur dans l'interface exécute, sur la même route authentifiée
   * que l'écran (`POST /expenses/reports/:id/validate|reject`, `finance:write`)
   * — aucun second chemin d'écriture, dicté ou parlé n'existe.
   *
   * `finance:write` (pas `finance:read`) : seule la personne qui PEUT décider
   * a une raison de voir cette file depuis la conversation — proposer une
   * décision à qui ne peut pas l'exécuter serait une carte qui échoue
   * systématiquement au clic.
   *
   * Le montant ne sort JAMAIS d'ici (`canReadFinance: false` EN DUR, comme
   * `talents/search` pour le TJM) : ce pont interne n'a pas de rôle à faire
   * valoir, et Laura n'a besoin que de savoir QUI, QUAND, QUOI — jamais
   * COMBIEN — pour proposer la décision.
   *
   * `reportId` resserre la file à UNE note déjà nommée dans la conversation
   * (résolue par un appel antérieur à cette même route, sans le paramètre) —
   * jamais un second chemin de lecture : la note absente de la file des
   * SOUMISES (`status: 'pending'`) de l'appelant rend une liste vide, que ce
   * soit parce qu'elle n'existe pas, qu'elle est déjà décidée, ou qu'elle
   * appartient à un autre espace.
   */
  @Post('expenses/pending')
  async expensesPending(@Body() dto: CopilotExpenseReportsPendingDto): Promise<{
    items: Array<Pick<ExpenseReportSummaryView, 'id' | 'reference' | 'bearerName' | 'accountName' | 'periodMonth'>>
    allowed: boolean
  }> {
    if (!this.expenseReports) return { items: [], allowed: false }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, dto.userId)
    if (!can(role, extra, 'finance:write')) return { items: [], allowed: false }
    const page = await this.expenseReports.list(workspaceId, { status: 'pending', pageSize: 50 }, false)
    const items = page.items
      .filter(item => !dto.reportId || item.id === dto.reportId)
      .map(item => ({
        id: item.id,
        reference: item.reference,
        bearerName: item.bearerName,
        accountName: item.accountName,
        periodMonth: item.periodMonth,
      }))
    return { items, allowed: true }
  }

  private async marketSearchPortfolio(
    userId: string,
  ): Promise<{ portfolio: MarketCompanyLookup[]; workspaceId: string | null }> {
    try {
      const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
      const rows = await this.accounts.listPortfolioLookups(workspaceId, portfolioScopeFor(role, visibility, userId))
      return { portfolio: marketPortfolioLookups(rows), workspaceId }
    } catch (error) {
      this.logger.warn(
        `copilot.market_search portefeuille illisible user=${userId}`,
        error instanceof Error ? error.stack : error,
      )
      return { portfolio: [], workspaceId: null }
    }
  }
}
