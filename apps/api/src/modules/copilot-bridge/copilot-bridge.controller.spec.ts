import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ConfigService } from '@nestjs/config'
import {
  IMPORT_ORDER,
  WRITABLE_IMPORT_OBJECTS,
  openNeedsQuerySchema,
  talentSearchQuerySchema,
  type ImportObject,
  pipelineSummary,
} from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  CopilotAnalysisStartDto,
  CopilotMarketMemoryGroupContextDto,
  CopilotRelationStagesBySirenDto,
} from './dto/copilot-bridge.dto'
import { AgendaService } from '../agenda/agenda.service'
import { BriefingService } from '../briefing/briefing.service'
import { ChainsService } from '../chains/chains.service'
import { ContactsService } from '../contacts/contacts.service'
import { FieldConflictService } from '../crm-core/field-conflict.service'
import { CrmReadService } from '../crm/crm-read.service'
import { EsnDirectoryService } from '../esn-directory/esn-directory.service'
import { IaClient } from '../ia/ia.client'
import { ImportService } from '../import/import.service'
import { ImportOverviewForLauraService } from '../universal-import/import-overview-for-laura.service'
import { CvBatchImportService } from '../consultants/cv-batch-import.service'
import { PartnerPipelineService } from '../partner-pipeline/partner-pipeline.service'
import { PartnersService } from '../partners/partners.service'
import { QualificationLeadsService } from '../qualification-leads/qualification-leads.service'
import { ANSWER_DETAIL } from '../account-access/purchasing-panel'
import { AccountAccessService } from '../account-access/account-access.service'
import { failure, success } from '@bellum/utils'
import { AccountsService } from '../accounts/accounts.service'
import { PilotageService } from '../pilotage/pilotage.service'
import { AccountTimelineService } from '../accounts/account-timeline.service'
import { NotesService } from '../crm-core/notes.service'
// #2308 (LAU-FINAL-049) — la carte de couverture du CHAT.
import { CoverageService } from '../coverage-gaps/coverage.service'
// #2285.2 (épopée #2786) — la façade canonique d'UN compte, pour que Laura
// arrête de relire `accounts.company_name`/`sector`/`headquarters` en direct.
import { AccountIntelligenceContextService } from '../account-intelligence/account-intelligence-context.service'
// #3277.1 (épopée #3277, BEL-SC-225 suite) — même façade, deuxième appelant.
import { AccountStrategy5PService } from '../accounts/account-strategy-5p.service'
import { AccountInterestPenetrabilityService } from '../accounts/account-interest-penetrability.service'
import { SharedBaseReaderService } from '../shared-base/shared-base-reader.service'
import { LauraBatchFollowService } from '../analysis/laura-batch-follow.service'
import { AnalysisService } from '../analysis/analysis.service'
import { AnalysisRunsService } from '../analysis/analysis-runs.service'
import { CreditsService } from '../credits/credits.service'
import { CapitalisationService } from '../capitalisation/capitalisation.service'
import { ProposalsService } from '../proposals/proposals.service'
import { MatchingService } from '../consultants/matching/matching.service'
import { InverseMatchingService } from '../consultants/matching/inverse-matching.service'
import { MissionScoresService } from '../delivery/mission-scores.service'
import { ForecastHorizonsService } from '../delivery/forecast-horizons.service'
import { RevenueService } from '../delivery/revenue.service'
import { OpenNeedsService } from '../projects/open-needs.service'
import { DealProbabilityService } from '../projects/deal-probability.service'
import { ProjectPipelineService } from '../projects/project-pipeline.service'
import { SendTimingService } from '../actions/send-timing.service'
import { MethodRuleOutcomesService } from '../actions/method-rule-outcomes.service'
import { RfpService } from '../rfp/rfp.service'
import { RoutinesService } from '../routines/routines.service'
import { TalentPoolService } from '../consultants/talent-pool.service'
import { TalentService } from '../consultants/talent.service'
import { ConsultantsService } from '../consultants/consultants.service'
import { TalentIdentityService } from '../consultants/talent-identity.service'
import { DeliveryService } from '../delivery/delivery.service'
import { MissionStartReadinessService } from '../delivery/mission-start-readiness.service'
import { StaffingService } from '../delivery/staffing.service'
import { MissionAmendmentService } from '../delivery/mission-amendment.service'
import { InvoiceReadinessService } from '../delivery/invoice-readiness.service'
import { TimesheetsService } from '../delivery/timesheets.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
// #3260.8/.9 (BEL-SC-231) — le garde-fou de périmètre avant un lancement à
// l'aveugle, `CompaniesService` étant le SEUL point d'entrée déjà exporté
// pour résoudre `size_class` (GA-26, réutilisé de l'autocomplétion).
import { CompaniesService } from '../companies/companies.service'
import { PlaybooksService } from '../playbooks/playbooks.service'
import { LauraProbeService } from '../laura/laura-probe.service'
import { LauraService } from '../laura/laura.service'
import { WeakestLinkDiagnosisService } from '../weakest-link-diagnosis/weakest-link-diagnosis.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
// #1791.2 — la trace de ce que Laura lit chez un connecteur.
import { ActivitiesService } from '../activities/activities.service'
// #1822 (Lot 16) — les deux réglages que Laura peut proposer de changer.
import { NotificationsService } from '../notifications/notifications.service'
// #1822 — les deux LECTURES de réglages ajoutées : la mémoire de Laura, et le
// vocabulaire de l'espace (lexique + listes métier).
import { MemoryService } from '../memory/memory.service'
import { WorkspaceTeamService } from '../workspace/workspace-team.service'
import { CataloguesService } from '../catalogues/catalogues.service'
// GA-07 — le contrôleur dépend du PORT, jamais de `DealStageSlaService`
// directement (voir `deal-stage-sla.port.ts`).
import { DEAL_STAGE_SLA_PORT } from './deal-stage-sla.port'
import { CopilotBridgeController } from './copilot-bridge.controller'
import { issueAnalysisPlanToken } from './analysis-plan-token'

/**
 * Un pont entre services est exactement le genre de chose qui devient une porte
 * dérobée si on ne le teste pas. Deux propriétés à verrouiller : il est gardé
 * par le secret interne, et il ne sait rien écrire.
 */
describe('CopilotBridgeController', () => {
  const mailbox = { search: jest.fn(), readOwnThread: jest.fn() }
  const agenda = { listEvents: jest.fn(), listEventsDetailed: jest.fn(), freeSlots: jest.fn() }
  const briefing = {
    build: jest.fn(),
    dayClosure: jest.fn(),
    workdayWindowOf: jest.fn(),
    agendaPreferencesOf: jest.fn(),
  }
  // Les blocages de parcours (#1506) : une LECTURE, comme tout ce que Laura
  // touche ici — le double n'expose donc qu'une méthode, et elle ne rend rien.
  const chains = { blockers: jest.fn().mockResolvedValue([]) }
  const talents = { search: jest.fn(), findByExperienceClient: jest.fn() }
  // #2367.11 — le REX d'un push consultant, en LECTURE : `listFeedback` porte
  // déjà l'appartenance (workspace ET utilisateur), le double n'expose donc
  // que cette seule méthode — `recordFeedback` n'y figure PAS, pour que le
  // test « aucune écriture » puisse prouver une ABSENCE d'appel.
  const consultantsService = { listFeedback: jest.fn() }
  // #2327.26 — Laura explique un rapprochement, en LECTURE : la même méthode
  // que `GET :id/identity`, jamais une décision.
  // `decide` figure sur le double pour que le test « aucune écriture » puisse
  // prouver une ABSENCE d'appel, pas seulement l'absence de la méthode.
  const talentIdentity = { reportForTalent: jest.fn(), decide: jest.fn() }
  const delivery = { renewalsToAct: jest.fn(), poValidUntilByMission: jest.fn(), capacity: jest.fn() }
  // #2409.8 — la checklist de démarrage : une LECTURE, comme tout ce pont.
  const startReadiness = { readiness: jest.fn() }
  // #2423.9 — les avenants déjà proposés : une LECTURE, comme tout ce pont.
  const amendments = { list: jest.fn() }
  const timesheets = { month: jest.fn() }
  const readiness = { list: jest.fn() }
  // BEL-SC-239 — le plan de proposition (Proposal Studio), une LECTURE.
  const proposals = { buildForProject: jest.fn() }
  const capitalisation = {
    usableProofs: jest.fn(),
    hasPositiveRex: jest.fn(),
    similarCases: jest.fn(),
    relationStagesBySiren: jest.fn(),
  }
  const playbooks = { listInterventions: jest.fn() }
  const openNeeds = { list: jest.fn() }
  const matching = {
    matchNeed: jest.fn(),
    // #4059 — le classement ET ce qu'il change depuis le précédent.
    matchNeedWithChanges: jest.fn(),
    explain: jest.fn(),
    // #3182.3 (épopée #3248) — la préflight de positionnement, la MÊME
    // fonction que `previewSubmission` (matching.controller.ts).
    replay: jest.fn(),
    submissionContext: jest.fn(),
    loadCandidates: jest.fn(),
  }
  // #3865.2 (lot X05, 08/10) — le matching INVERSE : « à quels besoins ce
  // profil répond-il ? ».
  const inverseMatching = { matchTalent: jest.fn() }
  const talentPool = { counts: jest.fn(), entries: jest.fn() }
  const rfps = { list: jest.fn(), findOne: jest.fn() }
  // #1961.21 — `listPortfolioLookups` : le portefeuille de l'APPELANT, que la
  // recherche marché lit pour lier une entreprise trouvée à sa fiche.
  const accounts = {
    accountsAwaitingAction: jest.fn(),
    listPortfolioLookups: jest.fn(),
    findOne: jest.fn(),
    portfolioPriorities: jest.fn(),
    effortBudget: jest.fn(),
    commercialLoadCapacity: jest.fn(),
  }
  // #3262.23 (épopée #3284) — la phrase de Laura sur un compte Focus qui stagne.
  const pilotage = { focusReviewForAccount: jest.fn() }
  // Le back-office (PDF 2 §5.1) : le pipe, le CA et la capacité, tous trois
  // lus depuis le calcul qui sert déjà l'écran.
  const pipeline = { summary: jest.fn(), health: jest.fn(), contactSolicitationCollisionFor: jest.fn() }
  // #4016.1d — le CA probable et la probabilité calibrée, relayés à Laura.
  const dealProbability = { probableQuarter: jest.fn() }
  const sendTiming = { forWorkspace: jest.fn() }
  const methodRuleOutcomes = { contradictedRuleIds: jest.fn() }
  const revenue = { breakdown: jest.fn(), scopeInfo: jest.fn(), confirmedRevenue: jest.fn() }
  const missionScores = { capacity: jest.fn() }
  // #2425.8 — le prévisionnel par horizon.
  const horizons = { compute: jest.fn() }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(),
    extraPermissionsOf: jest.fn(),
    // LOT 15, arbitrage A — le réglage de cloisonnement (D5) que
    // `chains/blockers` doit désormais respecter, comme `GET /accounts`.
    portfolioVisibilityOf: jest.fn(),
  }
  const laura = { isEnabled: jest.fn().mockResolvedValue(true), health: jest.fn() }
  const lauraProbe = { measure: jest.fn(), blockingIssues: jest.fn() }
  const weakestLinkDiagnosis = { diagnoseFor: jest.fn() }
  // Le second marché et l'accès (tome 6 §16).
  const accountAccess = { landscape: jest.fn(), routeInputs: jest.fn() }
  const partners = { landscape: jest.fn() }
  // #3345.2 (LAU-FINAL-255, recette prod 30/09) — les décisions déjà prises
  // sur les pistes à qualifier d'un compte.
  const qualificationLeads = { decisions: jest.fn() }
  const partnerPipeline = { list: jest.fn() }
  const esnDirectory = { ensureSeeded: jest.fn(), knownNames: jest.fn(), factsByName: jest.fn() }
  const ia = { territoryOverview: jest.fn() }
  const contacts = {
    findAllForUser: jest.fn(),
    countForUser: jest.fn(),
    // #2623.1 — enchaîner analyser → proposer les contacts sans quitter la
    // conversation : identité (findByAccountForHttp) + classement
    // (rankForAccount), les mêmes que l'onglet Contacts d'un compte.
    findByAccountForHttp: jest.fn(),
    rankForAccount: jest.fn(),
    // #2799 — le contexte des 7 axes du score de réactivation dormante que
    // `findAllForUser` ne porte pas (signaux, compte, historique).
    dormantReactivationSignals: jest.fn(),
  }
  // #3219 (#190.2 pour un CONTACT) — le même détecteur générique que celui
  // déjà branché côté compte, `entityType: 'contact'`.
  const conflicts = { openConflicts: jest.fn() }
  // Le 14e outil de territoire (`contacts/job-changes`) : la capacité lit le
  // SCHÉMA en direct plutôt que `CrmRoutinesService`, donc son mock est un
  // `manager.query`, pas un service — voir la doc de `jobChanges`.
  const accountQuery = jest.fn()
  // #1489 — le copilote lance une analyse. `AnalysisService` est le SEUL chemin
  // de lancement ; `CreditsService` porte le solde qu'on annonce AVANT de
  // débiter.
  const analysis = {
    start: jest.fn(),
    channelPerformanceFor: jest.fn(),
    rolePerformanceFor: jest.fn(),
    anglePerformanceFor: jest.fn(),
    outcomeRecommendationFor: jest.fn(),
  }
  // #2148.11 — la provenance (qui a lancé le dernier run) d'un dossier
  // réutilisé, hors sujet de ce bloc mais nécessaire à la résolution.
  const analysisRuns = { getLastRunUserId: jest.fn(), getLastRunScope: jest.fn() }
  const credits = { getCredits: jest.fn() }
  // #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE, le 46ᵉ
  // outil de Laura. #1611.4 / #1611.5 — la même mémoire, PAR IDENTITÉ, pour
  // le pipeline Phase 4.
  const marketMemory = {
    searchByFilters: jest.fn(),
    coverageFor: jest.fn(),
    aliasProvenDomain: jest.fn(),
    coverageForGroup: jest.fn(),
  }
  // #1822 / #1823 — Réglages, en LECTURE : les routines et l'assistant d'import.
  const routines = { list: jest.fn() }
  const imports = { list: jest.fn() }
  // #4426.8 — les imports que l'écran d'historique liste + le tiering posé.
  const importOverview = {
    read: jest.fn(),
  }
  // #1952.4 (épopée #2844) — l'état des imports de CV en LOT, en LECTURE seule.
  const cvBatchImport = { listRecentJobs: jest.fn().mockResolvedValue([]) }
  // #1791.2 — lire le CRM d'espace, en LECTURE SEULE.
  const crmRead = { findAccountPresence: jest.fn() }
  // #1791.2 — la trace de ce que Laura lit chez un connecteur : une entrée sur
  // le journal DU COMPTE, jamais dans le logger serveur seul.
  const activities = { recordCrmLookup: jest.fn().mockResolvedValue(undefined) }
  // #1822 (Lot 16) — les deux réglages que Laura peut proposer de changer, en
  // LECTURE seule (`laura/settings-overview`).
  const notifications = { getPreferences: jest.fn() }
  const dealStageSla = { effectiveFor: jest.fn() }
  // #1822 — les DEUX lectures de réglages ajoutées par ce lot. `readLedger` est
  // exactement ce que l'écran Réglages › Mémoire de Laura affiche ;
  // `getTeam` / `list` sont ce qu'affichent Lexique et Catalogues. Aucune des
  // trois n'a de verbe d'écriture dans ce double, et c'est le point.
  const memory = { readLedger: jest.fn() }
  const workspaceTeam = { getTeam: jest.fn() }
  const catalogues = { list: jest.fn() }
  const accountFindOne = jest.fn()
  // #2271.19 — l'historique d'un compte pour la carte `timeline`, en LECTURE
  // SEULE : la même fusion que l'écran de fiche, rien de plus.
  const timeline = { forAccount: jest.fn() }
  // #3895 — les notes d'un compte (portée de groupe comprise), en LECTURE.
  const notesService = { list: jest.fn() }
  // #2308 — la carte de couverture du CHAT, en LECTURE SEULE.
  const coverage = { computeChatCoverageMapForAccount: jest.fn() }
  // #2285.2 (épopée #2786) — la façade canonique d'UN compte, en LECTURE SEULE.
  const intelligenceContext = { contextFor: jest.fn() }
  // #3277.1 (épopée #3277) — la projection 5P, en LECTURE SEULE.
  const strategy5P = { strategyFor: jest.fn() }
  // #3258.14 (épopée #3362, lot E25 30/09) — la matrice intérêt ×
  // pénétrabilité, en LECTURE SEULE.
  const interestPenetrability = { matrixFor: jest.fn() }
  // P05 (#3246) — la base anonyme commune, « ailleurs ».
  const sharedBase = {
    actionOutcomesElsewhere: jest.fn(),
    caseOutcomesElsewhere: jest.fn(),
    caseOutcomesElsewhereFor: jest.fn(),
  }
  // #3182.2 (épopée #3248) — l'historique de staffing d'UN compte, en LECTURE
  // SEULE : la MÊME lecture que `listForMission`/`listForConsultant`.
  const staffing = { listForAccount: jest.fn() }

  let controller: CopilotBridgeController

  beforeEach(async () => {
    jest.resetAllMocks()
    importOverview.read.mockResolvedValue({ universal_imports: [], context_pack_imports: [], tiering: null })
    // `resetAllMocks` efface aussi les valeurs de retour : la résolution de
    // l'espace se repose ici, sinon chaque test la redemanderait.
    // Le rôle voyage avec l'espace depuis le back-office : c'est lui qui décide
    // si le chiffre d'affaires sort, et sur quel périmètre.
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
    workspaceContext.extraPermissionsOf.mockResolvedValue([])
    // `open` est le défaut ASSUMÉ du produit (`portfolio-visibility.ts`) : sans
    // ce mock, chaque test qui ne parle pas de cloisonnement doit quand même
    // en poser un, sinon `portfolioScopeFor` reçoit `undefined` et se comporte
    // comme si le réglage n'existait pas.
    workspaceContext.portfolioVisibilityOf.mockResolvedValue('open')
    // #2799 — par défaut, aucun signal supplémentaire connu (chaque test qui
    // ne parle pas de réactivation dormante n'a pas à le poser lui-même).
    contacts.dormantReactivationSignals.mockResolvedValue(new Map())
    // #1952.4 — par défaut, aucun import de CV en lot en cours (chaque test
    // qui ne parle pas de `lauraImportOverview` n'a pas à le poser lui-même).
    cvBatchImport.listRecentJobs.mockResolvedValue([])
    // #3219 — par défaut, aucune contradiction ouverte (chaque test qui ne
    // parle pas de conflits n'a pas à le poser lui-même).
    conflicts.openConflicts.mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      controllers: [CopilotBridgeController],
      providers: [
        { provide: MailboxService, useValue: mailbox },
        { provide: AgendaService, useValue: agenda },
        { provide: BriefingService, useValue: briefing },
        // #1506 — les blocages de parcours que Laura interroge.
        { provide: ChainsService, useValue: chains },
        { provide: TalentService, useValue: talents },
        { provide: ConsultantsService, useValue: consultantsService },
        { provide: TalentIdentityService, useValue: talentIdentity },
        { provide: DeliveryService, useValue: delivery },
        { provide: TimesheetsService, useValue: timesheets },
        { provide: InvoiceReadinessService, useValue: readiness },
        { provide: CapitalisationService, useValue: capitalisation },
        { provide: ProposalsService, useValue: proposals },
        { provide: PlaybooksService, useValue: playbooks },
        { provide: OpenNeedsService, useValue: openNeeds },
        { provide: MatchingService, useValue: matching },
        { provide: InverseMatchingService, useValue: inverseMatching },
        { provide: TalentPoolService, useValue: talentPool },
        { provide: RfpService, useValue: rfps },
        { provide: AccountsService, useValue: accounts },
        { provide: PilotageService, useValue: pilotage },
        { provide: ProjectPipelineService, useValue: pipeline },
        { provide: DealProbabilityService, useValue: dealProbability },
        { provide: SendTimingService, useValue: sendTiming },
        { provide: MethodRuleOutcomesService, useValue: methodRuleOutcomes },
        { provide: RevenueService, useValue: revenue },
        { provide: MissionScoresService, useValue: missionScores },
        { provide: ForecastHorizonsService, useValue: horizons },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        // Laura Produit : la CAUSE et le contexte, jamais le score (§5.6, D50).
        { provide: LauraService, useValue: laura },
        { provide: LauraProbeService, useValue: lauraProbe },
        { provide: WeakestLinkDiagnosisService, useValue: weakestLinkDiagnosis },
        // Le prénom et le rôle : ce qui évite de reposer une question dont on a
        // déjà la réponse (§5.2).
        { provide: getRepositoryToken(ProfileEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: { manager: { query: accountQuery }, findOne: accountFindOne },
        },
        // Le garde interne est résolu par Nest même dans un module de test :
        // on lui donne sa config plutôt que de le désactiver, pour que le test
        // « il est gardé » porte sur le vrai garde.
        { provide: AccountAccessService, useValue: accountAccess },
        { provide: PartnersService, useValue: partners },
        { provide: PartnerPipelineService, useValue: partnerPipeline },
        { provide: EsnDirectoryService, useValue: esnDirectory },
        { provide: IaClient, useValue: ia },
        { provide: ContactsService, useValue: contacts },
        { provide: FieldConflictService, useValue: conflicts },
        { provide: AnalysisService, useValue: analysis },
        { provide: LauraBatchFollowService, useValue: { follow: jest.fn(), settled: jest.fn() } },
        { provide: AnalysisRunsService, useValue: analysisRuns },
        { provide: CreditsService, useValue: credits },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: RoutinesService, useValue: routines },
        { provide: ImportService, useValue: imports },
        { provide: ImportOverviewForLauraService, useValue: importOverview },
        { provide: CvBatchImportService, useValue: cvBatchImport },
        { provide: CrmReadService, useValue: crmRead },
        { provide: ActivitiesService, useValue: activities },
        // #1822 (Lot 16) — Réglages, en LECTURE : les notifications et le SLA du pipe.
        // GA-07 : le contrôleur injecte le PORT (`DEAL_STAGE_SLA_PORT`), pas
        // `DealStageSlaService` — ce double y répond directement.
        { provide: NotificationsService, useValue: notifications },
        { provide: DEAL_STAGE_SLA_PORT, useValue: dealStageSla },
        // #1822 — les deux lectures de réglages ajoutées : la mémoire de Laura,
        // et le vocabulaire de l'espace (lexique + listes métier).
        { provide: MemoryService, useValue: memory },
        { provide: WorkspaceTeamService, useValue: workspaceTeam },
        { provide: CataloguesService, useValue: catalogues },
        { provide: ConfigService, useValue: { get: () => 'secret-de-test' } },
        // #2271.19 — optionnel comme `CopilotCardService` (voir le contrôleur) :
        // fourni ICI pour exercer la route, absent ailleurs pour prouver que son
        // absence refuse proprement plutôt que de casser tout le pont.
        { provide: AccountTimelineService, useValue: timeline },
        { provide: NotesService, useValue: notesService },
        // #2308 — optionnel comme `AccountTimelineService` ci-dessus, même raison.
        { provide: CoverageService, useValue: coverage },
        // #2409.8 — optionnel comme `CoverageService` juste au-dessus, même raison.
        { provide: MissionStartReadinessService, useValue: startReadiness },
        // #2423.9 — optionnel comme `MissionStartReadinessService` juste au-dessus.
        { provide: MissionAmendmentService, useValue: amendments },
        // #2285.2 — optionnel comme `CoverageService` ci-dessus, même raison.
        { provide: AccountIntelligenceContextService, useValue: intelligenceContext },
        // #3182.2 — optionnel comme `AccountIntelligenceContextService` ci-dessus,
        // même raison.
        { provide: StaffingService, useValue: staffing },
        // #3277.1 — optionnel comme `AccountIntelligenceContextService` ci-dessus,
        // même raison.
        { provide: AccountStrategy5PService, useValue: strategy5P },
        // #3345.2 — optionnel comme `AccountStrategy5PService` ci-dessus, même raison.
        { provide: QualificationLeadsService, useValue: qualificationLeads },
        // #3258.14 — optionnel comme `AccountStrategy5PService` juste au-dessus,
        // même raison.
        { provide: AccountInterestPenetrabilityService, useValue: interestPenetrability },
        { provide: SharedBaseReaderService, useValue: sharedBase },
      ],
    }).compile()
    controller = moduleRef.get(CopilotBridgeController)
  })

  it('est gardé par le secret interne', () => {
    const guards = Reflect.getMetadata('__guards__', CopilotBridgeController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  /**
   * ⚠️ LA RÈGLE A ÉTÉ PRÉCISÉE LE 05/09/2026, PAS ÉLARGIE.
   *
   * Elle disait « aucun verbe d'écriture ». Ce qu'elle protège vraiment est
   * plus étroit et plus fort : **le copilote n'écrit RIEN VERS QUELQU'UN
   * D'AUTRE.** Pas d'e-mail, pas d'écriture CRM, pas de message — c'est la
   * doctrine du dépôt, et elle tient par l'absence de code, pas par une
   * convention.
   *
   * `analysisStart` est la première exception, et elle est nommée : Louis l'a
   * tranchée le 05/09 (#1489). Elle écrit dans l'espace DE L'APPELANT, sur sa
   * demande, après une confirmation qu'il a formulée lui-même — et elle exige
   * un jeton que seule `analysisPlan` sait produire, donc elle ne peut pas
   * partir sans que les questions aient été demandées.
   *
   * La liste reste EXHAUSTIVE : une méthode ajoutée sans y être inscrite fait
   * tomber ce test, et c'est le but. Le second test ci-dessous tient l'interdit
   * qui, lui, n'a pas bougé.
   */
  it('n’expose que des lectures — plus les deux verbes d’analyse nommés', () => {
    const methods = Object.getOwnPropertyNames(CopilotBridgeController.prototype).filter(name => name !== 'constructor')
    expect(methods.sort()).toEqual([
      'accessBySiren',
      'accountAccess',
      // #2623.1 — les contacts d'UN compte, pour enchaîner analyser → proposer
      // les contacts sans quitter la conversation. Une LECTURE : le MÊME
      // classement et la MÊME identité que l'onglet Contacts d'un compte,
      // rien de plus.
      'accountContacts',
      // #2308 (LAU-FINAL-049) — la carte de couverture du CHAT pour UN compte
      // (périmètre × famille de rôle × étape commerciale). Une LECTURE, posée
      // sur `CoverageService`, comme `accountTimeline` juste au-dessus est
      // posée sur `AccountTimelineService`.
      'accountCoverageMap',
      // #3262.23 (épopée #3284) — la phrase de Laura sur un compte Focus qui
      // stagne. Une LECTURE, posée sur `PilotageService.focusReviewForAccount`.
      'accountFocusReview',
      // #2424.10 — câblage restant : au moins un REX RÉELLEMENT recueilli sur
      // le compte porte un « ce qui a marché ». Une LECTURE, comme tout ce pont.
      'accountHasPositiveRex',
      // #2285.2 (épopée #2786) — la façade canonique d'UN compte. Une LECTURE,
      // posée sur `AccountIntelligenceContextService.contextFor`, la MÊME que
      // la fiche compte (`GET /accounts/:id/intelligence-context`).
      'accountIntelligenceContext',
      // #3258.14 (épopée #3362, lot E25 30/09) — la matrice intérêt ×
      // pénétrabilité d'UN compte. Une LECTURE, posée sur
      // `AccountInterestPenetrabilityService.matrixFor`, la MÊME façade que
      // la fiche compte (`GET /accounts/:id/interest-penetrability`) et le
      // panneau Pilotage.
      'accountInterestPenetrability',
      // #2985 (revue manager, section G de #2319) — « transformer le même
      // dossier en revue de dix minutes ». Une LECTURE composée de trois
      // lectures qui existent déjà (changeDigest, plan, risques des affaires).
      'accountManagerReview',
      // #3895 — les notes d'UN compte, portée de groupe comprise : une LECTURE, `NotesService.list`.
      'accountNotes',
      'accountPartners',
      // #3345.2 (LAU-FINAL-255, recette prod 30/09) — les décisions déjà
      // prises sur les pistes à qualifier d'UN compte. Une LECTURE :
      // `QualificationLeadsService.decisions`, la MÊME que
      // `QualificationLeadsController.decisions`, rien de plus.
      'accountQualificationLeadDecisions',
      // #3919 (lot Y10) — les signaux d'un compte ou du portefeuille : une LECTURE.
      'accountSignals',
      // #3182.2 (épopée #3248) — l'historique de staffing d'UN compte. Une
      // LECTURE : `StaffingService.listForAccount`, la MÊME lecture que
      // `listForMission`/`listForConsultant`, rien de plus.
      'accountStaffingHistory',
      // #3277.1 (épopée #3277, BEL-SC-225 suite) — la projection 5P d'UN
      // compte. Une LECTURE : `AccountStrategy5PService.strategyFor`, la
      // MÊME façade que la fiche compte, rien de plus.
      'accountStrategy5P',
      // #2271.19 — l'historique d'UN compte, pour la carte `timeline` de la
      // conversation. Une LECTURE : `AccountTimelineService.forAccount`, la
      // MÊME fusion que l'écran de fiche, rien de plus.
      'accountTimeline',
      // #3903 (lot Y10) — le bilan de relance sur une fenêtre : une LECTURE.
      'accountsEngagementReport',
      // #3904 (lot P01) — « proche de signer » : une LECTURE des comptes en proposition ou négociation.
      'accountsNearSigning',
      // #3209 (LAU-FINAL-215) — la répartition du portefeuille en quatre
      // catégories. Une LECTURE : `AccountsService.portfolioPriorities`.
      'accountsPortfolioPriorities',
      'accountsToAct',
      // #3211.9 (épopée #3234) — les actions échues sans résultat déclaré.
      // Une LECTURE : `ActionPlanItemsService.listOpenForUser(overdueOnly)`.
      'actionsAwaitingOutcome',
      'agendaEvents',
      // #2770.28 — les préférences d'agenda réglées par la personne, pour que
      // le plan de journée de Laura en tienne compte. Une LECTURE.
      'agendaPreferences',
      // #4064 — la fenêtre d'agenda AVEC les agendas muets nommés. Une LECTURE.
      'agendaWindow',
      // #1489 — préparer, puis lancer. `analysisPlan` ne débite rien et rend le
      // jeton ; `analysisStart` n'accepte que ce jeton.
      // #4462.9 — Laura déclare le lot d'analyses qu'elle lance depuis une liste de noms (rien en base).
      'analysisFollowBatch',
      'analysisPlan',
      'analysisStart',
      // #2857 (#2201.31) — « Demander une explication » sur une carte de
      // validation. Une LECTURE, comme `talentIdentityExplain` : elle ne
      // décide jamais (`decideApprovalRequest` n'est pas appelé ici).
      'approvalExplain',
      // #4406.5 (c96) — Beeper : la liste et UNE conversation, lues pour l'utilisateur du tour.
      'beeperChat',
      'beeperConversations',
      // Le back-office (PDF 2 §5.1) : quatre LECTURES de plus. « Enregistrer un
      // consultant » n'en fait pas partie, et c'est le point : il n'a AUCUNE
      // route ici, donc aucun chemin d'écriture — l'outil rend une proposition
      // côté service IA et c'est le clic qui ouvre le formulaire.
      'capacity',
      // #3210 (LAU-FINAL-216) — les cas passés (gagnés/perdus) comparables à
      // un compte. Une LECTURE : `CapitalisationService.similarCases`.
      'casesSimilar',
      // #1506 — les blocages de parcours. Une LECTURE dérivée des objets métier :
      // elle n'écrit rien, et elle n'a même pas de chemin pour le faire.
      'chainBlockers',
      // #3278.3 — les canaux mesurés de l'espace. Une LECTURE : `AnalysisService.channelPerformanceFor`.
      'channelsPerformance',
      // #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale »)
      // — le modèle d'équipe MINIMAL : la charge déjà déclarée (Réglages ›
      // Charge commerciale) croisée avec le compte réel de dossiers suivis.
      // Une LECTURE : `AccountsService.commercialLoadCapacity`.
      'commercialLoadCapacity',
      // #3247 (Louis 15/10) — lecture seule : le verrou communautaire d'un compte hors portefeuille.
      'communityAccessBySiren',
      // #2900 (#2415.10) — le CA CONFIRMÉ, l'encaissé moins le contesté. Une
      // LECTURE, MÊME calcul et MÊME porte que `revenueBreakdown` juste plus
      // bas : `RevenueService.confirmedRevenue` est relayé tel quel.
      'confirmedRevenue',
      // #2367.11 — le REX d'un push consultant. Une LECTURE : `listFeedback`
      // porte déjà l'appartenance, `recordFeedback` n'est jamais appelé ici.
      'consultantFeedback',
      // #3219 (#190.2 côté contact, 11/10) — le contrôle AVANT une action sur UN
      // contact. Une LECTURE : `ContactsService.preflight`, qui ne tranche rien.
      'contactPreflight',
      // Laura compte avant de proposer (15/09/2026) : une LECTURE, comme le
      // reste de ce pont — elle ne fait que compter, jamais écrire.
      'contactsCount',
      // #3289 (#3264.41) — les règles méthode contredites par l'espace. Une LECTURE.
      'contradictedMethodRules',
      // #1791.2 — lire le CRM d'espace pour un compte. `CrmReadService` est en
      // LECTURE SEULE, et cette méthode n'écrit NULLE PART ailleurs que vers
      // le journal DU COMPTE lui-même — un geste tracé, jamais une écriture
      // vers le CRM, un tiers, ou quelqu'un d'autre. Précisé, pas élargi :
      // voir `recordCrmLookup` et la garde dédiée plus bas dans ce fichier.
      // #3182.2-adjacent — même contrat par IDENTITÉ (nom, domaine, siren)
      // que `crmPresence`, mais SANS compte : une carte d'alternative avant
      // toute création de compte. Une LECTURE, posée sur la même
      // `CrmReadService.findAccountPresence`.
      'crmCompanyPresence',
      'crmPresence',
      'dailyBriefing',
      'dayBrief',
      // #2392 — la clôture de fin de journée. Une LECTURE : les tâches, les fils
      // sortants sans réponse et les cartes à valider — le report ou l'abandon
      // d'une tâche passe par `PATCH /tasks/:id`, au clic, jamais par ici.
      'dayClosure',
      // #3226 (#3202.6) — la capacité de delivery de l'ESPACE, en LECTURE : un
      // compteur d'intercontrat que le plan de compte lit.
      'deliveryCapacity',
      // Le second marché et l'accès (tome 6 §16) : CINQ lectures de plus.
      // `declare_access_fact` (N1) et `create_partner_opportunity` (N2) n'ont
      // AUCUNE route ici, et c'est le point — Laura n'écrit pas.
      'dormantContacts',
      // #2987.56 — la file des notes de frais qui attendent une décision. Une
      // LECTURE (montant jamais exposé) : valider ou refuser passe par
      // `POST /expenses/reports/:id/validate|reject`, au clic, jamais par ici.
      'expensesPending',
      'findNeeds',
      // #2425.8 — le prévisionnel par horizon : une LECTURE sous `finance:read`.
      'forecastHorizons',
      'freeSlots',
      'interventions',
      'invoiceBlockers',
      // Le 14e outil de territoire (tome 4, tome 6 §16) : `get_job_changes`
      // n'avait pas de capacité REST alors que son calcul existait déjà.
      'jobChanges',
      // Laura Produit (PDF 10 §5.8) : quatre LECTURES. Aucune ne rend le score
      // de santé — seulement la cause, ce qui manque et ce qui bloque.
      'lauraBlockingIssues',
      'lauraFeatureAdoption',
      // #1820 / #1823 — Réglages, en LECTURE : les routines (catalogue +
      // abonnement + blocages) et l'aperçu de l'assistant d'import (sources,
      // historique des sessions). Aucune écriture : la porte reste
      // `_proposal()` côté service IA, au clic.
      'lauraImportOverview',
      // #1822 — la mémoire de Laura, en LECTURE. Elle comblait une asymétrie :
      // `pin_memory_fact` ÉCRIVAIT une ligne que rien ne savait relire, donc
      // Laura ne pouvait pas répondre « qu'est-ce que tu as retenu de moi ? ».
      'lauraMemoryLedger',
      'lauraRoutinesSummary',
      // #1822 (Lot 16) — les réglages que Laura peut PROPOSER de changer,
      // avec leur valeur actuelle. Lecture seule : le clic écrit par la MÊME
      // route authentifiée que l'écran (`PATCH /notifications/preferences`,
      // `PUT /pipeline/stage-sla/:stage`), jamais ce pont.
      'lauraSettingsOverview',
      'lauraUserContext',
      // BEL-SC-224 (#3253, P0) — le maillon faible commercial principal,
      // maison canonique nouvelle (voir `weakest-link-diagnosis.ts`).
      'lauraWeakestLinkDiagnosis',
      'lauraWorkspaceHealth',
      'mailSearch',
      // #2284.26 (#2978, lot SRC2 28/09/2026) — le domaine que la mémoire
      // marché peut PROUVER par alias, pour le résolveur d'entité (apps/ia).
      // Une LECTURE, route distincte de `marketContext` ci-dessous (contrat
      // minimal, jamais un champ ajouté à `MarketMemoryCoverage`).
      'marketAliasDomain',
      // #1611.4 / #1611.5 — la mémoire marché PAR IDENTITÉ, pour le pipeline
      // Phase 4 (`bellum_plan.py` / `bellum_messages.py`), qui n'a pas de
      // session HTTP utilisateur pour emprunter `GET :id/market-context`.
      'marketContext',
      // #3177.2 / épopée #3225 — la mémoire marché d'un GROUPE (racine +
      // filiales), une entrée par entité, MÊME axe identité que `marketContext`
      // juste au-dessus.
      'marketContextGroup',
      // #1596.6-10 / #1628.1 — la mémoire marché interrogée PAR FILTRE (le
      // 46ᵉ outil de Laura), l'inverse des lectures par identité ci-dessus.
      'marketSearch',
      // #1961.21 — PRIVÉE, pas une route : la LECTURE du portefeuille de
      // l'appelant (`listPortfolioLookups`), pour qu'une entreprise trouvée qui
      // est aussi un de ses comptes porte la route de sa fiche. Elle n'écrit rien.
      'marketSearchPortfolio',
      // #AM.59 (#4059) — le classement contre un besoin COLLÉ, en mémoire : une LECTURE, rien n'est écrit.
      'matchDraftNeed',
      'matchNeed',
      // #3865.2 (lot X05, 08/10) — le matching INVERSE d'un consultant (« à
      // quels besoins répond-il ? »), jusqu'ici sans appelant côté chat.
      'matchTalentNeeds',
      // #3427 — le modèle approuvé choisi par canal/scénario/persona (LECTURE).
      'messagePreSendCheck',
      'messageTemplateSelect',
      // #2423.9 — les avenants DÉJÀ proposés sur UNE mission, pour que Laura
      // vérifie l'appartenance à l'espace avant d'en préparer un nouveau.
      // Une LECTURE : `MissionAmendmentService.list`, rien de plus.
      'missionAmendments',
      'missionRisks',
      // #2338.8 / #2409.8 — la checklist de démarrage (verdict + réserves
      // NOMMÉES) d'UNE mission. Une LECTURE : le MÊME calcul que l'écran (GA-26).
      'missionStartReadiness',
      'missionsEnding',
      // #2339.5/.6 (épopée #2795) — les doublons probables d'UN besoin. Une
      // LECTURE : `NeedCommercialStateService.duplicateCandidates` propose,
      // ne fusionne jamais.
      'needDuplicates',
      // #2339.1 (épopée #2795) — le journal unifié des quatre sujets d'UN
      // besoin. Une LECTURE : fusionne `commercial_transitions` déjà écrit,
      // aucun second calcul.
      'needJournal',
      // #2339.2 (épopée #2795) — le contrôle de handoff avant une conversion
      // besoin→mission. Une LECTURE : ne convertit rien.
      'needMissionHandoffCheck',
      // #2339.6/.11/.13 (épopée #2795) — les missions déjà nées d'UN besoin,
      // avec la preuve du positionnement retenu. Une LECTURE.
      'needMissions',
      // #2339.13 (épopée #2795) — l'état NO-GO d'UN besoin (mission dupliquée,
      // incohérence Besoin/Mission). Une LECTURE.
      'needNoGoState',
      // #2339.3/.10 (épopée #2795) — le besoin brut, pour l'aperçu des champs
      // et le résumé calculés côté service IA. Une LECTURE.
      'needRead',
      // #2320.24 (épopée #2967) — la chronologie des transitions d'UN besoin.
      // Une LECTURE : relit le journal `commercial_transitions` déjà écrit par
      // `changeNeedStatus`, aucun second calcul.
      'needTransitionCheck',
      'needTransitions',
      // #3264.14 (épopée #3264, lot R11 29/09) — la collision de sollicitation
      // (#2325.35) réduite à UN contact. Une LECTURE, posée sur
      // `ProjectPipelineService.contactSolicitationCollisionFor`.
      'outreachContactCollision',
      // #3289 — le timing appris de l'espace. Une LECTURE.
      'outreachSendTiming',
      'overduePayments',
      // #4016 L3 — le CORPS d'un fil de la boîte de l'utilisateur nommé, en LECTURE seule
      // (rien n'est écrit, rien n'est conservé).
      'ownThreadText',
      'partnerPipeline',
      // #2324.40/43/44/46/47/48 — le diagnostic de pipe NOMMÉ (raisons, jamais
      // un score) : ce qui mérite du temps, ce qui est recommandé à la
      // clôture, et ce que le NO-GO #2324.48 a exclu. Une LECTURE, comme
      // `pipelineSummary` juste en dessous.
      'pipelineHealth',
      'pipelineSummary',
      // #4016.1d — le CA probable (probabilité calibrée) : une LECTURE, calculée à la volée.
      'probableQuarter',
      // #2324.39 — lecture seule : l'état actuel d'une opportunité, avant d'en proposer une mise à jour.
      'projectRead',
      // #2124.49-.55 — les champs de preuve que Laura PROPOSE pour une mission.
      // Une LECTURE : `proofProposalForMission` ne fait que quatre `findOne`
      // bornés à l'espace. La validation vit sur `PATCH capitalisation/proofs/:id`,
      // derrière un clic et `records:write`, et aucun chemin ne part d'ici vers
      // elle — c'est pourquoi `propose_mission_proof` n'est pas un outil d'écriture.
      'proofProposal',
      'proofSectorGroups',
      'proofs',
      // BEL-SC-239 — le plan de proposition (Proposal Studio). Une LECTURE :
      // `buildForProject` recalcule le plan à chaque appel, il n'écrit jamais.
      'proposalOutline',
      'reactivation',
      // #4289.12 — le stade de relation par SIREN (moteur `relationStageOf`), pour le générateur d'alternatives.
      // Une LECTURE bornée à l'espace actif.
      'relationStagesBySiren',
      // #3345 (recette 03/10) — retrouver une piste à qualifier par son libellé.
      // Une LECTURE des lignes d'intake de l'espace, rien de plus.
      'resolveQualificationLead',
      'revenueBreakdown',
      'rfpList',
      'searchTalents',
      // #3889.1 — l'expérience DÉCLARÉE d'un CV autorisé : une LECTURE, aucun crédit.
      'searchTalentsByExperience',
      // #3182.3 (épopée #3248) — les prérequis d'UN positionnement, inspectés
      // ensemble. Une LECTURE : `submissionPreflight` (fonction pure) rejoue
      // un run déjà exécuté, elle n'écrit ni gate ni soumission — la porte
      // G4 elle-même reste `positionCandidate`, hors de ce pont.
      'submissionPreflightForConsultant',
      // #2327.26 — Laura EXPLIQUE un rapprochement, elle ne le fusionne jamais
      // (`c37_fusion_doublons`) : aucun chemin d'écriture n'est atteignable
      // depuis cette route.
      'talentIdentityExplain',
      'territoryOverview',
      'timesheets',
      // #1822 — le vocabulaire de l'espace (lexique + listes métier), en
      // LECTURE. Les DEUX écrans restent en RENVOI côté écriture : un mot de
      // l'ESN est du texte libre, et un modèle qui le propose l'invente.
      'workspaceVocabulary',
    ])
  })

  /**
   * L'INTERDIT QUI N'A PAS BOUGÉ — et c'est celui qui compte.
   *
   * Aucune route du pont ne doit écrire VERS L'EXTÉRIEUR : ni e-mail, ni
   * message, ni écriture CRM/ATS. `declare_access_fact` et
   * `create_partner_opportunity` n'ont aucune route ici, et c'est le point.
   *
   * ⚠️ La garde lit les noms de méthode, pas leur corps : elle attrape le
   * `sendEmail` qu'on ajouterait, pas un envoi caché dans une lecture. C'est sa
   * limite, et elle est honnête — l'absence d'un chemin d'envoi côté service
   * est ce qui tient vraiment la règle.
   */
  it('n’expose aucun verbe qui écrit VERS QUELQU’UN D’AUTRE', () => {
    const methods = Object.getOwnPropertyNames(CopilotBridgeController.prototype).filter(name => name !== 'constructor')
    const outward = /^(send|email|mail(?!Search)|post|publish|createContact|createNote|export|enroll|log[A-Z])/
    expect(methods.filter(name => outward.test(name))).toEqual([])
  })

  /**
   * #1823 — le catalogue des routines, tel que Laura le reçoit.
   *
   * La forme vient d'AILLEURS (`RoutinesService.list`, déjà testé pour son
   * propre compte) : ce test porte sur la PROJECTION — la locale choisit
   * `label`/`outcome`, rien d'autre ne bouge.
   */
  it('lauraRoutinesSummary — projette le catalogue dans la langue demandée', async () => {
    routines.list.mockResolvedValue([
      {
        definition: {
          key: 'daily_briefing',
          name: { fr: 'Brief du matin', en: 'Morning briefing' },
          outcome: { fr: 'Ce que ta journée contient', en: 'What your day holds' },
          cadence: 'daily',
        },
        subscription: { key: 'daily_briefing', enabled: true, hour: 8, weekday: null, channel: 'in_app' },
        blockers: ['agenda_not_connected'],
        lastRunAt: '2026-09-08T06:00:00.000Z',
        lastOutcome: '3 rendez-vous préparés',
      },
    ])
    const fr = await controller.lauraRoutinesSummary({ userId: 'u-1' })
    expect(fr).toEqual({
      // #1822 — les bornes viennent du CONTRAT partagé, pas d'un tableau écrit
      // ici : `toggle_routine` propose désormais l'heure, le jour et le canal,
      // et le service IA valide contre CETTE réponse, jamais contre une copie
      // Python qui aurait divergé.
      bounds: { hour: { min: 0, max: 23 }, weekday: { min: 1, max: 7 }, channels: ['in_app', 'email'] },
      routines: [
        {
          key: 'daily_briefing',
          label: 'Brief du matin',
          outcome: 'Ce que ta journée contient',
          cadence: 'daily',
          enabled: true,
          hour: 8,
          weekday: null,
          channel: 'in_app',
          blockers: ['agenda_not_connected'],
          last_run_at: '2026-09-08T06:00:00.000Z',
          last_outcome: '3 rendez-vous préparés',
        },
      ],
    })
    const en = await controller.lauraRoutinesSummary({ userId: 'u-1', locale: 'en' })
    expect(en.routines[0]).toMatchObject({ label: 'Morning briefing', outcome: 'What your day holds' })
  })

  /**
   * #1820 — l'aperçu de l'assistant d'import.
   *
   * ⚠️ LE TEST QUI PROUVE QUE LA GARDE SAIT DIRE NON : trois clés du catalogue
   * réel (`hubspot_export`, `boondmanager_export`, `salesconnect_legacy_export`)
   * nomment un éditeur. On appelle le VRAI `IMPORT_CATALOG` (pas un double) et
   * on vérifie que ces trois chaînes n'apparaissent NULLE PART dans la réponse
   * — ni comme `key`, ni glissées dans `imports`/`skips`. Une régression qui
   * réintroduirait `key` dans la projection ferait tomber ce test.
   */
  /**
   * #1889 — CE QUI S'IMPORTE VRAIMENT, et pas seulement ce qui se déclare.
   *
   * L'aperçu ne rendait que `objects` — ce qu'un fichier PEUT contenir. Laura
   * annonçait donc la reprise des consultants, des besoins et des missions :
   * elles se déclarent, elles se simulent, et l'`apply` les refuse par leur
   * nom. La personne déposait un fichier, lisait son rapport, et découvrait le
   * refus au BOUT du parcours.
   *
   * La garde tient les deux moitiés : la clé existe, et elle dit NON — un objet
   * hors de `WRITABLE_IMPORT_OBJECTS` n'y apparaît jamais.
   */
  // #4426.8 (recette 22/10) — « aucune session d'import récente » alors que l'historique montrait le tiering importé.
  it('lauraImportOverview — rend les imports de l’historique de l’écran et le tiering posé, pas seulement l’ancien assistant', async () => {
    imports.list.mockResolvedValue([])
    importOverview.read.mockResolvedValue({
      universal_imports: [{ file_name: 'tiering2026-2027 v2.xlsx', status: 'done', imported: 275 }],
      context_pack_imports: [],
      tiering: { A: 42, B: 100, C: null },
    })
    const result = await controller.lauraImportOverview({ userId: 'u-1' })
    expect(result.recent_sessions).toEqual([])
    expect(result.universal_imports).toEqual([
      expect.objectContaining({ file_name: 'tiering2026-2027 v2.xlsx', status: 'done', imported: 275 }),
    ])
    expect(result.tiering).toEqual({ A: 42, B: 100, C: null })
  })

  it('lauraImportOverview — dit ce qui ÉCRIT, pas seulement ce qui se déclare', async () => {
    imports.list.mockResolvedValue([])
    const result = await controller.lauraImportOverview({ userId: 'u-1' })

    const avecProjets = result.sources.filter(source => source.objects.includes('project'))
    expect(avecProjets.length).toBeGreaterThan(0)
    for (const source of avecProjets) expect(source.writable_objects).toContain('project')

    // Le témoin : ce qui ne s'écrit pas n'est jamais annoncé comme repris.
    const nonBranchés = IMPORT_ORDER.filter(
      objet => !(WRITABLE_IMPORT_OBJECTS as readonly ImportObject[]).includes(objet),
    )
    expect(nonBranchés.length).toBeGreaterThan(0)
    for (const source of result.sources) {
      for (const objet of nonBranchés) expect(source.writable_objects).not.toContain(objet)
      // Et elle reste un SOUS-ENSEMBLE : jamais un objet que la source ne porte pas.
      for (const objet of source.writable_objects) expect(source.objects).toContain(objet)
    }
  })

  it('lauraImportOverview — ne nomme AUCUN éditeur, ni dans les sources ni dans l’historique', async () => {
    imports.list.mockResolvedValue([
      {
        source: 'hubspot_export',
        object_type: 'contact',
        state: 'applied',
        created_at: new Date('2026-09-03T10:00:00.000Z'),
        applied_at: new Date('2026-09-03T10:05:00.000Z'),
        created_count: 42,
        updated_count: 3,
        error: null,
      },
    ])
    const result = await controller.lauraImportOverview({ userId: 'u-1' })
    const serialised = JSON.stringify(result).toLowerCase()
    for (const editorName of ['hubspot', 'boondmanager', 'salesconnect']) {
      expect(serialised).not.toContain(editorName)
    }
    // La CAPACITÉ, elle, doit rester lisible : sans ça l'outil ne répond à rien.
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.sources[0]).toMatchObject({ objects: expect.any(Array), format: expect.any(String) })
    expect(result.recent_sessions).toEqual([
      {
        object_type: 'contact',
        state: 'applied',
        created_at: '2026-09-03T10:00:00.000Z',
        applied_at: '2026-09-03T10:05:00.000Z',
        created_count: 42,
        updated_count: 3,
        error: null,
      },
    ])
  })

  /**
   * LOT 18 (GA-326) — `sessions.slice(0, 5)` existait déjà, sans jamais dire
   * si l'historique RÉEL de l'espace dépasse les cinq lignes montrées. La
   * technique : `ImportService.list` fetch DÉJÀ tout ce qu'il rend (borné à
   * 50 en SQL, `import.service.ts`) — comparer sa longueur au nombre affiché
   * ne devine rien, exactement le motif de `capWithTruncationFlag`.
   */
  function fakeSession(index: number) {
    return {
      object_type: 'contact',
      state: 'applied',
      created_at: new Date('2026-09-03T10:00:00.000Z'),
      applied_at: null,
      created_count: index,
      updated_count: 0,
      error: null,
    }
  }

  it('lauraImportOverview — dit quand l’historique RÉEL dépasse les cinq lignes montrées', async () => {
    imports.list.mockResolvedValue(Array.from({ length: 6 }, (_v, i) => fakeSession(i)))
    const result = await controller.lauraImportOverview({ userId: 'u-1' })
    expect(result.recent_sessions).toHaveLength(5)
    expect(result.recent_sessions_truncated).toBe(true)
  })

  it('lauraImportOverview — ne flagge pas un historique qui tient déjà dans les cinq lignes', async () => {
    imports.list.mockResolvedValue([fakeSession(0)])
    const result = await controller.lauraImportOverview({ userId: 'u-1' })
    expect(result.recent_sessions).toHaveLength(1)
    expect(result.recent_sessions_truncated).toBe(false)
  })

  /**
   * #1952.4 (épopée #2844, lot V15 28/09) — le pont relaie désormais l'état des
   * imports de CV EN LOT (`cv_batch_import_jobs`, #2326.12), une file DISTINCTE
   * de `ImportService.list` : Laura peut dire où en est un lot déjà lancé
   * depuis l'écran, ce qui n'existait nulle part côté conversation.
   */
  it('lauraImportOverview — relaie l’état des imports de CV en lot, sans les relancer', async () => {
    imports.list.mockResolvedValue([])
    cvBatchImport.listRecentJobs.mockResolvedValue([
      {
        id: 'job-1',
        kind: 'zip',
        status: 'processing',
        total: 12,
        processed: 5,
        summary: { created: 4, updated: 0, skipped: 1, failed: 0 },
        outcomes: [],
        error: null,
        etaSeconds: 42,
      },
    ])
    const result = await controller.lauraImportOverview({ userId: 'u-1' })

    expect(cvBatchImport.listRecentJobs).toHaveBeenCalledWith('w-1', 5)
    expect(result.cv_batch_jobs).toEqual([
      {
        id: 'job-1',
        kind: 'zip',
        status: 'processing',
        total: 12,
        processed: 5,
        summary: { created: 4, updated: 0, skipped: 1, failed: 0 },
        error: null,
        eta_seconds: 42,
      },
    ])
  })

  it('lauraImportOverview — #1952.22 ne devine jamais l’ETA : `null` reste `null`, jamais 0', async () => {
    imports.list.mockResolvedValue([])
    cvBatchImport.listRecentJobs.mockResolvedValue([
      {
        id: 'job-2',
        kind: 'files',
        status: 'processing',
        total: 3,
        processed: 0,
        summary: { created: 0, updated: 0, skipped: 0, failed: 0 },
        outcomes: [],
        error: null,
        etaSeconds: null,
      },
    ])
    const result = await controller.lauraImportOverview({ userId: 'u-1' })

    expect(result.cv_batch_jobs[0].eta_seconds).toBeNull()
  })

  /**
   * #1822 (Lot 16) — le catalogue des réglages, avec la valeur RÉELLE lue
   * chez les deux services concernés. `propose_settings_update` (côté IA)
   * résout `screen`/`field` contre CETTE réponse avant de proposer quoi que
   * ce soit — une clé inventée doit donc être absente d'ici pour être refusée
   * là-bas.
   */
  it('lauraSettingsOverview — rend les DEUX écrans écrivables avec leur valeur actuelle', async () => {
    notifications.getPreferences.mockResolvedValue({
      buy_signals: true,
      relance_reminders: false,
      weekly_summary: false,
      weekly_digest: true,
      credit_low: true,
      action_overdue: true,
      watchlist_daily_digest: false,
      sidebar_changelog: true,
      newsletter_changelog: true,
      laura_enabled: true,
      proactivity_cap: 3,
      email_language: 'fr',
    })
    dealStageSla.effectiveFor.mockResolvedValue([
      { stage: 'qualified', slaDays: 7, isDefault: true },
      { stage: 'confirmed', slaDays: 10, isDefault: false },
      { stage: 'profiles_submitted', slaDays: 7, isDefault: true },
      { stage: 'negotiation', slaDays: 21, isDefault: true },
      { stage: 'won', slaDays: null, isDefault: true },
    ])
    const result = await controller.lauraSettingsOverview({ userId: 'u-1' })
    expect(result.screens.map((s: { screen: string }) => s.screen)).toEqual([
      '/settings/notifications',
      '/settings/pipeline',
    ])
    const notificationsScreen = result.screens[0]
    expect(notificationsScreen.fields.find((f: { field: string }) => f.field === 'buy_signals')).toEqual({
      field: 'buy_signals',
      label: expect.any(String),
      type: 'bool',
      value: true,
    })
    // `email_language` n'est PAS un choix conversationnel — reporté par le client.
    expect(notificationsScreen.fields.find((f: { field: string }) => f.field === 'email_language')).toBeUndefined()
    const pipelineScreen = result.screens[1]
    expect(pipelineScreen.fields).toHaveLength(4)
    expect(pipelineScreen.fields.find((f: { field: string }) => f.field === 'won')).toBeUndefined()
    expect(pipelineScreen.fields.find((f: { field: string }) => f.field === 'confirmed')).toMatchObject({
      type: 'int',
      value: 10,
    })
  })

  /**
   * #1822 — LA MÉMOIRE DE LAURA, EN LECTURE. L'asymétrie qu'elle ferme :
   * `pin_memory_fact` écrivait une ligne que RIEN ne savait relire, si bien que
   * « qu'est-ce que tu as retenu de moi ? » n'avait aucune réponse — alors même
   * que l'écran Réglages › Mémoire de Laura l'affiche depuis des mois.
   *
   * La forme vient d'AILLEURS (`MemoryService.readLedger`, testé pour son
   * propre compte) : ce test porte sur la PROJECTION, et sur la seule chose
   * qu'elle ne doit jamais faire — rendre une couche illisible comme une couche
   * vide. « Je n'ai pas pu lire » et « je ne retiens rien » sont deux phrases
   * différentes, et la seconde est fausse et rassurante.
   */
  it('lauraMemoryLedger — rend les lignes ET nomme les couches ILLISIBLES', async () => {
    memory.readLedger.mockResolvedValue({
      entries: [
        {
          id: 'f-1',
          layer: 'facts',
          text: 'Ne jamais appeler avant 10 h',
          recordedAt: '2026-09-01T08:00:00.000Z',
          accountId: null,
          detail: null,
          expiresAt: null,
          scope: 'user',
          ownedByMe: true,
        },
      ],
      unreadableLayers: ['conversations'],
    })
    const result = await controller.lauraMemoryLedger({ userId: 'u-1' })
    expect(memory.readLedger).toHaveBeenCalledWith({ userId: 'u-1', workspaceId: 'w-1' })
    expect(result).toEqual({
      entries: [
        {
          id: 'f-1',
          layer: 'facts',
          text: 'Ne jamais appeler avant 10 h',
          recorded_at: '2026-09-01T08:00:00.000Z',
          account_id: null,
          detail: null,
          expires_at: null,
          // #1918.1 — Laura sait dire « pour toi uniquement » ou « pour toute
          // ton ESN ». `null` hors couche des faits, jamais une portée devinée.
          scope: 'user',
        },
      ],
      unreadable_layers: ['conversations'],
    })
  })

  /**
   * #1822 — LE VOCABULAIRE DE L'ESPACE : le lexique (D17) et les listes métier.
   *
   * ⚠️ La lecture du lexique passe par `getTeam`, la seule porte publique qui
   * le porte — et `getTeam` rend AUSSI les membres, leurs adresses et leurs
   * rôles. Cette projection les JETTE : une porte plus étroite que son flux,
   * dans le bon sens. Le test le prouve en poussant un membre dans le double et
   * en vérifiant qu'aucune adresse ne ressort.
   */
  it('workspaceVocabulary — rend le lexique et les listes, JAMAIS les membres de l’équipe', async () => {
    workspaceTeam.getTeam.mockResolvedValue({
      workspace: { id: 'w-1', name: 'ESN Test', role: 'owner', lexicon: { need: { fr: { one: 'Poste' } } } },
      members: [{ userId: 'u-9', email: 'sarah@exemple.fr', role: 'admin' }],
      invitations: [],
      seats: { used: 1, total: 5 },
    })
    catalogues.list.mockResolvedValue({
      items: [{ key: 'loss_reasons', editable: 'editable', values: [{ id: 'l-1', label: 'Prix', usage: 3 }] }],
    })
    const result = await controller.workspaceVocabulary({ userId: 'u-1' })
    expect(catalogues.list).toHaveBeenCalledWith('w-1', 'fr')
    expect(result.lexicon).toEqual({ need: { fr: { one: 'Poste' } } })
    expect(result.catalogues).toEqual([
      { key: 'loss_reasons', editable: 'editable', values: [{ id: 'l-1', label: 'Prix', usage: 3 }] },
    ])
    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain('sarah@exemple.fr')
    expect(serialised).not.toContain('members')
  })

  it('compose une requête vivier VALIDE — pas un objet à trois champs', async () => {
    // Le défaut trouvé en recette : l'appel partait en `as never`, sans
    // `skills` ni `page`, et le service explosait sur `query.skills.map(…)`.
    // Vérifier avec `expect.anything()` ne pouvait pas l'attraper — c'est
    // exactement ce que faisait le test précédent. On PARSE donc l'argument
    // réel contre le schéma : `.strict()` refuse aussi un champ inventé.
    talents.search.mockResolvedValue({ items: [] })
    await controller.searchTalents({ userId: 'u-1', query: 'java' } as never)
    const sent = talents.search.mock.calls[0]?.[1]
    expect(() => talentSearchQuerySchema.parse(sent)).not.toThrow()
    expect(sent).toMatchObject({ q: 'java', skills: [], page: 1 })
  })

  it('#3889.1 — l’expérience chez un compte passe par findByExperienceClient, dans l’espace actif', async () => {
    talents.findByExperienceClient.mockResolvedValue({ items: [], total: 0 })
    const out = await controller.searchTalentsByExperience({ userId: 'u-1', client: 'Sanofi' } as never)
    expect(talents.findByExperienceClient).toHaveBeenCalledWith('w-1', 'Sanofi')
    expect(talents.search).not.toHaveBeenCalled()
    expect(out).toEqual({ items: [], total: 0 })
  })

  it('traduit « disponible sous N jours » en filtre de disponibilité dérivée', async () => {
    // Un paramètre d'outil qui n'est lu par personne rend une réponse qui a
    // l'air d'avoir répondu. `availableWithinDays` n'existait dans aucun filtre.
    talents.search.mockResolvedValue({ items: [] })
    await controller.searchTalents({ userId: 'u-1', availableWithinDays: 30 } as never)
    const sent = talents.search.mock.calls[0]?.[1] as { freeBefore?: string }
    expect(sent.freeBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const days = Math.round((new Date(sent.freeBefore as string).getTime() - Date.now()) / 86_400_000)
    expect(days).toBeGreaterThanOrEqual(29)
    expect(days).toBeLessThanOrEqual(30)
  })

  // #3222 — le tiroir « Ville et rayon » existait déjà côté API/écran
  // (`talentSearchQuerySchema`), jamais exposé au copilote.
  it('relaie `zone`/`radiusKm` — le tiroir « Ville et rayon », jusqu’ici jamais exposé à Laura', async () => {
    talents.search.mockResolvedValue({ items: [] })
    await controller.searchTalents({ userId: 'u-1', query: 'java', zone: 'Lyon', radiusKm: 30 } as never)
    const sent = talents.search.mock.calls[0]?.[1]
    expect(() => talentSearchQuerySchema.parse(sent)).not.toThrow()
    expect(sent).toMatchObject({ zone: 'Lyon', radiusKm: 30 })
  })

  it('un rayon SANS ville n’est jamais relayé — sans centre, `talentSearchQuerySchema` l’ignorerait de toute façon', async () => {
    talents.search.mockResolvedValue({ items: [] })
    await controller.searchTalents({ userId: 'u-1', radiusKm: 30 } as never)
    const sent = talents.search.mock.calls[0]?.[1] as { zone?: string; radiusKm?: number }
    expect(sent.zone).toBeUndefined()
    expect(sent.radiusKm).toBeUndefined()
  })

  /**
   * #2327.26 — le dernier point ouvert de #2327 : Laura peut désormais
   * EXPLIQUER un rapprochement de talents, avec la MÊME phrase que l'écran.
   */
  describe('#2327.26 — expliquer un rapprochement de talents, en lecture seule', () => {
    const MATCH = {
      talentId: 't-2',
      fullName: 'Jean Dupont',
      reason: 'same_email' as const,
      confidence: 0.95,
      signals: ['email', 'experiences'] as const,
      sharedExperiences: 3,
      conflicts: [] as const,
      decision: null,
    }

    it('rend l’explication déjà calculée pour l’écran — pas une seconde phrase', async () => {
      talentIdentity.reportForTalent.mockResolvedValue({ state: 'probable_duplicate', items: [MATCH] })
      const result = await controller.talentIdentityExplain({ userId: 'u-1', talentId: 't-1' } as never)
      expect(talentIdentity.reportForTalent).toHaveBeenCalledWith('w-1', 't-1')
      expect(result).toEqual({
        state: 'probable_duplicate',
        items: [
          {
            talentId: 't-2',
            fullName: 'Jean Dupont',
            explanation:
              'Ces deux fiches semblent appartenir à la même personne parce qu’elles partagent le même e-mail et trois expériences identiques.',
          },
        ],
      })
    })

    it('ne transporte AUCUN critère protégé — ni chiffre de confiance', () => {
      const serialised = JSON.stringify({
        state: 'probable_duplicate' as const,
        items: [{ talentId: MATCH.talentId, fullName: MATCH.fullName, explanation: 'texte' }],
      })
      // GA-06 : âge, genre, origine, photo, adresse — aucun n'a de champ ici.
      for (const forbidden of ['age', 'gender', 'genre', 'origin', 'origine', 'photo', 'address', 'adresse']) {
        expect(serialised.toLowerCase()).not.toContain(forbidden)
      }
      // « Aucune confiance chiffrée ne s'affiche » (doc de `TalentIdentityPanel`) :
      // la clé `confidence` elle-même n'existe pas sur ce que la route rend.
      expect(serialised).not.toContain('confidence')
    })

    it('cible une paire précise quand `otherTalentId` est fourni', async () => {
      const other = { ...MATCH, talentId: 't-3', fullName: 'Autre Personne' }
      talentIdentity.reportForTalent.mockResolvedValue({ state: 'ambiguous', items: [MATCH, other] })
      const result = await controller.talentIdentityExplain({
        userId: 'u-1',
        talentId: 't-1',
        otherTalentId: 't-3',
      } as never)
      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.talentId).toBe('t-3')
    })

    it('n’écrit AUCUNE décision — `TalentIdentityService.decide` n’est jamais appelé', async () => {
      talentIdentity.reportForTalent.mockResolvedValue({ state: 'new', items: [] })
      await controller.talentIdentityExplain({ userId: 'u-1', talentId: 't-1' } as never)
      expect(talentIdentity.decide).not.toHaveBeenCalled()
    })
  })

  /**
   * #2367.11 — Laura LIT le REX d'un push consultant (« pourquoi ce profil a
   * été refusé »). `ConsultantsService.listFeedback` porte déjà l'APPARTENANCE
   * (workspace ET utilisateur) — cette route ne fait que relayer.
   */
  describe('#2367.11 — le REX d’un push consultant, en lecture seule', () => {
    const FEEDBACK = [
      {
        id: 'f-1',
        consultant_id: 'c-1',
        opportunity_id: 'o-1',
        outcome: 'rejected' as const,
        reason: 'Tarif trop élevé',
        learning: null,
        created_at: '2026-09-20T00:00:00.000Z',
      },
    ]

    it('relaie le REX pour un consultant qui appartient à l’espace', async () => {
      consultantsService.listFeedback.mockResolvedValue(FEEDBACK)
      const result = await controller.consultantFeedback({ userId: 'u-1', consultantId: 'c-1' } as never)
      expect(consultantsService.listFeedback).toHaveBeenCalledWith('c-1', 'w-1', 'u-1')
      expect(result).toEqual({ feedback: FEEDBACK })
    })

    it('un consultant qui n’appartient pas à l’espace rend une erreur, jamais le REX d’un autre', async () => {
      // `listFeedback` rend `null` sur un id inventé ou hors espace — exactement
      // comme `findScoped` le fait déjà pour les autres lectures consultant.
      consultantsService.listFeedback.mockResolvedValue(null)
      const result = await controller.consultantFeedback({ userId: 'u-1', consultantId: 'c-9' } as never)
      expect(result).toEqual({ error: 'Consultant not found.' })
    })

    it('n’écrit AUCUN REX — `ConsultantsService.recordFeedback` n’existe pas sur ce double', () => {
      expect('recordFeedback' in consultantsService).toBe(false)
    })
  })

  /**
   * #1611.4 / #1611.5 — la mémoire marché PAR IDENTITÉ : RELAYÉE telle quelle
   * vers `coverageFor`, comme la recherche par filtre l'est vers
   * `searchByFilters` juste en dessous (GA-258 : un seul point d'entrée).
   */
  it('relaie la lecture par identité TELLE QUELLE vers le SEUL point d’entrée', async () => {
    marketMemory.coverageFor.mockResolvedValue({
      status: 'ok',
      coverage: {
        covered: false,
        marketPaths: null,
        esnObserved: [],
        observedStack: [],
        roleFamilies: [],
        exEsnPresent: null,
      },
    })
    const read = await controller.marketContext({
      userId: 'u-1',
      ref: 'account-42',
      companyName: 'BNP Paribas',
      country: 'FR',
    } as never)
    expect(marketMemory.coverageFor).toHaveBeenCalledWith({
      ref: 'account-42',
      name: 'BNP Paribas',
      website: null,
      country: 'FR',
    })
    expect(read.status).toBe('ok')
  })

  /**
   * #2284.26 (#2978, lot SRC2 28/09/2026) — le domaine que l'alias prouve,
   * relayé TEL QUEL vers `aliasProvenDomain` (GA-258).
   */
  it('relaie la demande de domaine prouvé par alias TELLE QUELLE', async () => {
    marketMemory.aliasProvenDomain.mockResolvedValue('societegenerale.com')
    const read = await controller.marketAliasDomain({
      userId: 'u-1',
      ref: 'account-42',
      companyName: 'SG SOCIETE GENERALE',
    } as never)
    expect(marketMemory.aliasProvenDomain).toHaveBeenCalledWith({
      ref: 'account-42',
      name: 'SG SOCIETE GENERALE',
      website: null,
      country: null,
    })
    expect(read).toEqual({ domain: 'societegenerale.com' })
  })

  it('rend `{ domain: null }` sans rapprochement prouvé par alias', async () => {
    marketMemory.aliasProvenDomain.mockResolvedValue(null)
    const read = await controller.marketAliasDomain({ userId: 'u-1', ref: 'a-1', companyName: 'X' } as never)
    expect(read).toEqual({ domain: null })
  })

  /**
   * #3177.2 / épopée #3225 — la mémoire marché d'un GROUPE : relayée telle
   * quelle vers `coverageForGroup` (GA-258 : un seul point d'entrée), avec la
   * route de la fiche calculée depuis `rootAccountId`, jamais relue dans le
   * portefeuille (l'appelant IA a déjà vérifié l'ownership en amont).
   */
  it('relaie le scope de groupe TEL QUEL vers `coverageForGroup`, avec la route de la racine', async () => {
    marketMemory.coverageForGroup.mockResolvedValue({ status: 'ok', matches: [], truncated: false })

    const read = await controller.marketContextGroup({
      userId: 'u-1',
      rootAccountId: 'account-42',
      entities: [
        { ref: 'account-42', companyName: 'Société Générale', country: 'FR' },
        { ref: 'account-42-sub-0', companyName: 'Boursorama' },
      ],
    } as never)

    expect(marketMemory.coverageForGroup).toHaveBeenCalledWith(
      [
        { ref: 'account-42', name: 'Société Générale', website: null, country: 'FR' },
        { ref: 'account-42-sub-0', name: 'Boursorama', website: null, country: null },
      ],
      { rootAccountRoute: '/accounts/account-42' },
    )
    expect(read).toEqual({ status: 'ok', matches: [], truncated: false })
  })

  it('#3177.2 — une forme hors contrat se dit INDISPONIBLE, jamais relayée au modèle (même bord que `marketSearch`)', async () => {
    marketMemory.coverageForGroup.mockResolvedValue({
      status: 'ok',
      truncated: false,
      matches: [{ companyName: 'Société Générale', coverage: { covered: true, marketPaths: 1 } }] as never,
    })

    const read = await controller.marketContextGroup({
      userId: 'u-1',
      rootAccountId: 'account-42',
      entities: [{ ref: 'account-42', companyName: 'Société Générale' }],
    } as never)

    expect(read).toEqual({ status: 'unavailable', reason: 'contract_mismatch' })
  })

  /**
   * Recette prod du 29/09 (#3177/#3225, RÉFUTÉ) — « le groupe La Poste et ses
   * filiales » rendait « La mémoire marché n'a pas répondu » : le contrat entre
   * `chat_tools.py` (qui construit le corps) et cette DTO n'était vérifié par
   * AUCUN test — les deux tests ci-dessus appellent `controller.marketContextGroup`
   * directement, en CONTOURNANT le `ZodValidationPipe` (`rootAccountId: 'account-42'`
   * n'est même pas un UUID). Ce test fait passer le corps EXACT que
   * `market_memory_context_for_group` (`bellum_api.py`) envoie — racine + une
   * filiale au format `<uuid>-sub-<index>` — par le VRAI schéma zod de la DTO
   * (`.create()`, ce que le pipe HTTP appelle réellement).
   */
  it('#3177.2/#3225 — la DTO accepte le corps EXACT construit par `market_memory_context_for_group` (chat_tools.py)', () => {
    const rootAccountId = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'
    const payload = {
      userId: '9d359267-f7ee-430f-a614-2044a2e77ab5',
      rootAccountId,
      entities: [
        { ref: rootAccountId, companyName: 'La Poste', country: 'France' },
        { ref: `${rootAccountId}-sub-0`, companyName: 'La Banque Postale' },
      ],
    }

    expect(() => CopilotMarketMemoryGroupContextDto.create(payload)).not.toThrow()
  })

  /**
   * #1596.6-10 / #1628.1 — la recherche par filtre : les FILTRES sont relayés
   * tels quels (GA-16 : les tables du corpus sont partagées, la lecture du corpus
   * n'est jamais scopée).
   *
   * ⚠️ #1961.21 — CE TEST DISAIT « aucune résolution de workspace », et ce n'est
   * plus vrai, à dessein. L'espace est désormais résolu pour UNE chose : lire le
   * portefeuille de l'APPELANT, afin qu'une entreprise trouvée qui est aussi un
   * de SES comptes porte la route de sa fiche. Le corpus, lui, reste lu sans
   * aucun espace — c'est ce que le premier argument continue de prouver.
   */
  describe('recherche marché — les filtres, et le portefeuille de l’appelant à côté (#1961.21)', () => {
    const ACCOUNT_W1 = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'
    const COUVERT = {
      covered: true,
      marketPaths: 41,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    }

    it('relaie les filtres TELS QUELS, et passe le portefeuille de l’espace de l’appelant', async () => {
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })
      accounts.listPortfolioLookups.mockResolvedValue([
        { id: ACCOUNT_W1, company_name: 'Thales', website: 'https://thalesgroup.com', registry_country: 'FR' },
      ])

      const read = await controller.marketSearch({
        userId: 'u-1',
        technology: 'java',
        location: 'Île-de-France',
        employeeMin: 500,
      } as never)

      expect(marketMemory.searchByFilters).toHaveBeenCalledWith(
        {
          technology: 'java',
          location: 'Île-de-France',
          esn: undefined,
          roleFamily: undefined,
          employeeMin: 500,
          employeeMax: undefined,
          limit: undefined,
        },
        {
          portfolio: [{ ref: ACCOUNT_W1, name: 'Thales', website: 'https://thalesgroup.com', country: 'FR' }],
          workspaceId: 'w-1',
        },
      )
      // Visibilité ouverte (le défaut) : tout l'espace, comme `GET /accounts`.
      expect(accounts.listPortfolioLookups).toHaveBeenCalledWith('w-1', null)
      expect(read).toEqual({ status: 'ok', matches: [], truncated: false })
    })

    it('#1961.5 — relaie `city`/`region` TELS QUELS, distincts de `location`', async () => {
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })
      accounts.listPortfolioLookups.mockResolvedValue([])

      await controller.marketSearch({ userId: 'u-1', city: 'Lyon', region: 'Bretagne' } as never)

      expect(marketMemory.searchByFilters).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Lyon', region: 'Bretagne' }),
        expect.any(Object),
      )
    })

    it('#2991 (#2287.15/.17) — relaie `size`/`externalRecourseObserved` TELS QUELS', async () => {
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })
      accounts.listPortfolioLookups.mockResolvedValue([])

      await controller.marketSearch({ userId: 'u-1', size: '51-200', externalRecourseObserved: true } as never)

      expect(marketMemory.searchByFilters).toHaveBeenCalledWith(
        expect.objectContaining({ size: '51-200', externalRecourseObserved: true }),
        expect.any(Object),
      )
    })

    it('#2991 (#2287.14) — relaie `isServiceCompany` TEL QUEL', async () => {
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })
      accounts.listPortfolioLookups.mockResolvedValue([])

      await controller.marketSearch({ userId: 'u-1', isServiceCompany: true } as never)

      expect(marketMemory.searchByFilters).toHaveBeenCalledWith(
        expect.objectContaining({ isServiceCompany: true }),
        expect.any(Object),
      )
    })

    it('CLOISONNÉ — l’appelant d’un autre espace ne reçoit jamais le portefeuille d’un autre', async () => {
      workspaceContext.resolveActiveWorkspace.mockImplementation(async (userId: string) =>
        userId === 'u-2' ? { workspaceId: 'w-2', role: 'owner' } : { workspaceId: 'w-1', role: 'owner' },
      )
      accounts.listPortfolioLookups.mockImplementation(async (workspaceId: string) =>
        workspaceId === 'w-1'
          ? [{ id: ACCOUNT_W1, company_name: 'Thales', website: 'https://thalesgroup.com', registry_country: 'FR' }]
          : [],
      )
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })

      await controller.marketSearch({ userId: 'u-2', technology: 'java' } as never)

      expect(accounts.listPortfolioLookups).not.toHaveBeenCalledWith('w-1', expect.anything())
      expect(marketMemory.searchByFilters).toHaveBeenCalledWith(expect.any(Object), {
        portfolio: [],
        workspaceId: 'w-2',
      })
    })

    it('cloisonnement D5 — visibilité RESTREINTE : seuls les comptes que je porte peuvent être liés', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      accounts.listPortfolioLookups.mockResolvedValue([])
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })

      await controller.marketSearch({ userId: 'u-1', technology: 'java' } as never)

      expect(accounts.listPortfolioLookups).toHaveBeenCalledWith('w-1', { ownerId: 'u-1', includeUnassigned: true })
    })

    it('un espace introuvable ne prive pas de la recherche — le corpus se lit, sans aucun lien', async () => {
      workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('aucun espace actif'))
      marketMemory.searchByFilters.mockResolvedValue({ status: 'ok', matches: [], truncated: false })

      const read = await controller.marketSearch({ userId: 'u-1', technology: 'java' } as never)

      expect(marketMemory.searchByFilters).toHaveBeenCalledWith(expect.any(Object), {
        portfolio: [],
        workspaceId: null,
      })
      expect(read.status).toBe('ok')
    })

    it('#1961 — la forme rendue est PARSÉE au bord : un champ hors contrat ne traverse pas', async () => {
      accounts.listPortfolioLookups.mockResolvedValue([])
      marketMemory.searchByFilters.mockResolvedValue({
        status: 'ok',
        truncated: false,
        matches: [{ companyName: 'Thales', coverage: COUVERT, websiteDomain: 'thalesgroup.com', companyKey: 'thales' }],
      })

      const read = await controller.marketSearch({ userId: 'u-1', technology: 'java' } as never)

      if (read.status !== 'ok') throw new Error('lecture attendue')
      expect(Object.keys(read.matches[0] ?? {}).sort()).toEqual(['companyName', 'coverage'])
    })

    it('#1961 — une forme hors contrat se dit INDISPONIBLE, jamais relayée au modèle', async () => {
      accounts.listPortfolioLookups.mockResolvedValue([])
      marketMemory.searchByFilters.mockResolvedValue({
        status: 'ok',
        truncated: false,
        // Une couverture déclarée sous le seuil : le mensonge que le contrat refuse.
        matches: [{ companyName: 'Thales', coverage: { ...COUVERT, marketPaths: 1 } }],
      })

      const read = await controller.marketSearch({ userId: 'u-1', technology: 'java' } as never)

      expect(read).toEqual({ status: 'unavailable', reason: 'contract_mismatch' })
    })
  })

  it('resserre la fenêtre de fin de mission quand elle est demandée', async () => {
    // Le copilote annonçait « sous 30 jours » au-dessus d'une liste qui allait
    // à J+60 : un périmètre affirmé que la donnée ne portait pas.
    delivery.renewalsToAct.mockResolvedValue({ missions: [] })
    await controller.missionsEnding({ userId: 'u-1', endingWithinDays: 30 } as never)
    expect(delivery.renewalsToAct).toHaveBeenCalledWith('u-1', 30)
  })

  /**
   * #2407.9 — LOT 15, ARBITRAGE B appliqué à `missions/ending` (tranché par
   * Louis 22/09 soir, decisions §1) : la validité du bon de commande
   * (`po_valid_until`, donnée `finance:read`) voyage vers Laura SEULEMENT quand
   * la personne qui chatte porte ce droit — son RÔLE RÉEL, jamais un `true` en
   * dur. La marge, elle, reste fermée (`renewalsToAct` garde son `false`).
   */
  describe('#2407.9 — la validité du bon de commande à côté de la fin opérationnelle', () => {
    const ending = { id: 'm-1', label: 'Socle', ends_on: '2026-12-31', renewal: 'j60', assignees: [] }

    it('la sert, bornée à l’espace, à qui porte `finance:read`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      delivery.renewalsToAct.mockResolvedValue({ missions: [ending] })
      delivery.poValidUntilByMission.mockResolvedValue(new Map([['m-1', '2026-10-31']]))
      const out = (await controller.missionsEnding({ userId: 'u-1', endingWithinDays: 30 } as never)) as {
        missions: { poValidUntil?: string | null }[]
        poValidityReadable: boolean
      }
      expect(delivery.poValidUntilByMission).toHaveBeenCalledWith('w-1', ['m-1'])
      expect(out.poValidityReadable).toBe(true)
      expect(out.missions[0]?.poValidUntil).toBe('2026-10-31')
    })

    it('une mission lue SANS validité saisie rend `null`, jamais une date devinée', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      delivery.renewalsToAct.mockResolvedValue({ missions: [ending] })
      delivery.poValidUntilByMission.mockResolvedValue(new Map())
      const out = (await controller.missionsEnding({ userId: 'u-1' } as never)) as {
        missions: { poValidUntil?: string | null }[]
      }
      expect(out.missions[0]?.poValidUntil).toBeNull()
    })

    it('REFUSE la date à qui n’a aucun droit financier — et le DIT, sans lire la table', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      delivery.renewalsToAct.mockResolvedValue({ missions: [ending] })
      const out = (await controller.missionsEnding({ userId: 'u-1' } as never)) as {
        missions: Record<string, unknown>[]
        poValidityReadable: boolean
      }
      expect(delivery.poValidUntilByMission).not.toHaveBeenCalled()
      expect(out.poValidityReadable).toBe(false)
      expect(out.missions[0]).not.toHaveProperty('poValidUntil')
      // La liste des fins de mission, elle, n'est pas une donnée financière.
      expect(out.missions).toHaveLength(1)
    })
  })

  it('compose une requête de besoins VALIDE, avec ses défauts', async () => {
    openNeeds.list.mockResolvedValue({ items: [] })
    await controller.findNeeds({ userId: 'u-1', query: 'data engineer' } as never)
    const sent = openNeeds.list.mock.calls[0]?.[1]
    expect(() => openNeedsQuerySchema.parse(sent)).not.toThrow()
    expect(sent).toMatchObject({ q: 'data engineer', limit: 20, offset: 0 })
  })

  /**
   * #3852 (recette prod 08/10, 2e passe) — « le besoin n'a pas été retrouvé »
   * alors qu'il est listé : un identifiant déjà connu doit emprunter le MÊME
   * filtre `id` que la fiche, jamais la recherche texte (qui peut rater un
   * titre mal découpé, et qui exclut par défaut les besoins fermés).
   */
  it('un identifiant déjà connu (`need_id`) emprunte le filtre `id` de la fiche, jamais la recherche texte', async () => {
    const needId = '11111111-1111-4111-8111-111111111111'
    openNeeds.list.mockResolvedValue({ items: [] })
    await controller.findNeeds({ userId: 'u-1', needId } as never)
    const sent = openNeeds.list.mock.calls[0]?.[1]
    expect(() => openNeedsQuerySchema.parse(sent)).not.toThrow()
    expect(sent).toMatchObject({ id: needId, limit: 20, offset: 0 })
    expect(sent.q).toBeUndefined()
  })

  // #3889.2 — l'historique d'un compte : `includeClosed` emprunte le drapeau de l'écran.
  it('#3889.2 — `includeClosed` passe `include_closed` au filtre ; absent, le filtre « ouverts » reste', async () => {
    openNeeds.list.mockResolvedValue({ items: [] })
    await controller.findNeeds({ userId: 'u-1', query: 'ACME', includeClosed: true } as never)
    const withClosed = openNeeds.list.mock.calls[0]?.[1]
    expect(() => openNeedsQuerySchema.parse(withClosed)).not.toThrow()
    expect(withClosed.include_closed).toBe(true)

    openNeeds.list.mockClear()
    await controller.findNeeds({ userId: 'u-1', query: 'ACME' } as never)
    expect(openNeeds.list.mock.calls[0]?.[1].include_closed).toBeFalsy()
  })

  // #4287.9 — l'historique d'un COMPTE se lit par son identité (`account_id`), jamais par son nom en texte.
  it('#4287.9 — `accountId` emprunte le filtre `account_id` de l’écran, sans recherche texte', async () => {
    const accountId = '22222222-2222-4222-8222-222222222222'
    openNeeds.list.mockResolvedValue({ items: [] })
    await controller.findNeeds({ userId: 'u-1', accountId, includeClosed: true } as never)
    const sent = openNeeds.list.mock.calls[0]?.[1]
    expect(() => openNeedsQuerySchema.parse(sent)).not.toThrow()
    expect(sent).toMatchObject({ account_id: accountId, include_closed: true })
    expect(sent.q).toBeUndefined()
  })

  it('classe un besoin sans jamais laisser sortir la finance', async () => {
    matching.matchNeedWithChanges.mockResolvedValue({ run: { runId: 'r-1', results: [] }, changes: null })
    await controller.matchNeed({ userId: 'u-1', needId: 'n-1' } as never)
    expect(matching.matchNeedWithChanges).toHaveBeenCalledWith('n-1', 'w-1', 'u-1', { canReadFinance: false })
  })

  it('#4059.1 — le classement rendu à Laura porte ce qu’il change depuis le précédent', async () => {
    const changes = { previousRunId: 'r-0', comparable: true, newCandidates: [{ consultantId: 'c-3' }] }
    matching.matchNeedWithChanges.mockResolvedValue({ run: { runId: 'r-1', recommended: [] }, changes })
    const out = (await controller.matchNeed({ userId: 'u-1', needId: 'n-1' } as never)) as {
      runId?: string
      changes?: unknown
    }
    expect(out.runId).toBe('r-1')
    expect(out.changes).toEqual(changes)
  })

  /**
   * #1956.14 (famille) — vérification 13/09 : `MatchingService.matchNeed` ÉCRIT
   * (un run, ses lignes, la version des poids). L'écran `POST needs/:id/match`
   * exige `records:write` ; la conversation ne peut pas faire ce qu'il refuse.
   */
  describe('#1956.14 — classer un besoin exige le droit de l’écran (`records:write`)', () => {
    it.each(['viewer', 'finance', 'tech_admin'] as const)('NON — un siège %s ne crée aucun classement', async role => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })

      const out = (await controller.matchNeed({ userId: 'u-1', needId: 'n-1' } as never)) as { error?: string }

      expect(out.error).toBe('records_write_forbidden')
      expect(matching.matchNeedWithChanges).not.toHaveBeenCalled()
    })

    it.each(['recruiter', 'sales', 'member'] as const)('un siège %s classe (témoin)', async role => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })
      matching.matchNeedWithChanges.mockResolvedValue({ run: { runId: 'r-1', results: [] }, changes: null })

      await controller.matchNeed({ userId: 'u-1', needId: 'n-1' } as never)

      expect(matching.matchNeedWithChanges).toHaveBeenCalledTimes(1)
    })

    it('une permission accordée en propre suffit, comme à l’écran', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      workspaceContext.extraPermissionsOf.mockResolvedValue(['records:write'])
      matching.matchNeedWithChanges.mockResolvedValue({ run: { runId: 'r-1', results: [] }, changes: null })

      await controller.matchNeed({ userId: 'u-1', needId: 'n-1' } as never)

      expect(matching.matchNeedWithChanges).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * #3865.2 (lot X05, 08/10) — « Voici un consultant, où le positionner ? »
   * suppose de chercher les BESOINS compatibles, pas seulement les comptes.
   * `InverseMatchingService.matchTalent` existait déjà, sans appelant côté
   * conversation (`POST consultants/:id/match-inverse` restait le SEUL
   * appelant). Même porte que `matchNeed` (`records:write` : le même service
   * écrit un run), même `canReadFinance: false` EN DUR.
   */
  describe('#3865.2 — le matching inverse d’un consultant, enfin appelable depuis le chat', () => {
    it('cherche les besoins compatibles avec ce consultant, sans jamais laisser sortir la finance', async () => {
      inverseMatching.matchTalent.mockResolvedValue({ runId: 'r-1', consultantId: 'c-1', needs: [] })

      await controller.matchTalentNeeds({ userId: 'u-1', consultantId: 'c-1' } as never)

      expect(inverseMatching.matchTalent).toHaveBeenCalledWith('c-1', 'w-1', 'u-1', {
        canReadFinance: false,
        mineOnly: false,
      })
    })

    it('reprend `mineOnly` tel que demandé', async () => {
      inverseMatching.matchTalent.mockResolvedValue({ runId: 'r-1', consultantId: 'c-1', needs: [] })

      await controller.matchTalentNeeds({ userId: 'u-1', consultantId: 'c-1', mineOnly: true } as never)

      expect(inverseMatching.matchTalent).toHaveBeenCalledWith('c-1', 'w-1', 'u-1', {
        canReadFinance: false,
        mineOnly: true,
      })
    })

    it('un consultant introuvable dans cet espace rend une erreur NOMMÉE, jamais un run vide inventé', async () => {
      inverseMatching.matchTalent.mockResolvedValue(null)

      const out = (await controller.matchTalentNeeds({ userId: 'u-1', consultantId: 'c-1' } as never)) as {
        error?: string
      }

      expect(out.error).toBe('consultant_not_found')
    })

    it.each(['viewer', 'finance', 'tech_admin'] as const)(
      'NON — un siège %s ne crée aucun matching inverse',
      async role => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })

        const out = (await controller.matchTalentNeeds({ userId: 'u-1', consultantId: 'c-1' } as never)) as {
          error?: string
        }

        expect(out.error).toBe('records_write_forbidden')
        expect(inverseMatching.matchTalent).not.toHaveBeenCalled()
      },
    )

    it.each(['recruiter', 'sales', 'member'] as const)('un siège %s cherche (témoin)', async role => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })
      inverseMatching.matchTalent.mockResolvedValue({ runId: 'r-1', consultantId: 'c-1', needs: [] })

      await controller.matchTalentNeeds({ userId: 'u-1', consultantId: 'c-1' } as never)

      expect(inverseMatching.matchTalent).toHaveBeenCalledTimes(1)
    })
  })

  describe('#3182.3 (épopée #3248) — les prérequis d’un positionnement, inspectés ensemble', () => {
    const NEED = {
      needId: 'n-1',
      role: 'Data Engineer',
      accountName: 'EDF DSI',
      accountSector: 'énergie',
      projectSectors: [],
      skills: [],
      minYears: null,
      seniorityBand: null,
      environment: [],
      languages: [],
      clearances: [],
      location: null,
      remote: null,
      startOn: null,
      targetRateCents: null,
      contractKind: null,
    }
    const RESULT = {
      consultantId: 'c-1',
      axes: [],
      correspondenceScore: 84,
      pushableScore: 71,
      bucket: 'recommended',
      exclusions: [],
      skills: [],
      gaps: [],
      adjacency: [],
      questionsToValidate: [],
      flags: [],
    }
    const CONTEXT = {
      projectId: 'p-1',
      consentExpiresAt: '2027-12-01T00:00:00.000Z',
      availabilityCheckedAt: '2026-08-30T00:00:00.000Z',
      accountConsent: { canRepresent: true, restrictions: null },
      positioningAgreement: {
        tjmValidatedAt: '2026-09-01T00:00:00.000Z',
        cvValidatedAt: null,
        otherProcessesKnown: true,
      },
    }

    it('agrège consentement, disponibilité, TJM/CV et besoin actuel — zéro second calcul', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      matching.replay.mockResolvedValue({ run: { runId: 'r-1' }, need: NEED, results: [RESULT] })
      matching.submissionContext.mockResolvedValue(CONTEXT)
      matching.loadCandidates.mockResolvedValue([{ consultantId: 'c-1', consentState: 'valid' }])

      const out = (await controller.submissionPreflightForConsultant({
        userId: 'u-1',
        needId: 'n-1',
        runId: 'r-1',
        consultantId: 'c-1',
      } as never)) as { blocked: boolean; status: string; missing: string[] }

      expect(matching.replay).toHaveBeenCalledWith('r-1', ['c-1'], 'w-1', 'u-1', expect.any(Boolean))
      expect(out.blocked).toBe(false)
      // Le CV n'est pas validé (CONTEXT) : nommé dans `missing`, jamais tu.
      expect(out.missing).toContain('CV non validé')
    })

    it('refuse un run introuvable — jamais une préflight inventée', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      matching.replay.mockResolvedValue(null)

      const out = (await controller.submissionPreflightForConsultant({
        userId: 'u-1',
        needId: 'n-1',
        runId: 'r-x',
        consultantId: 'c-1',
      } as never)) as { error?: string }

      expect(out.error).toBe('run_not_found')
      expect(matching.submissionContext).not.toHaveBeenCalled()
    })

    it('refuse un besoin étranger ou introuvable', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      matching.replay.mockResolvedValue({ run: { runId: 'r-1' }, need: NEED, results: [RESULT] })
      matching.submissionContext.mockResolvedValue(null)

      const out = (await controller.submissionPreflightForConsultant({
        userId: 'u-1',
        needId: 'n-x',
        runId: 'r-1',
        consultantId: 'c-1',
      } as never)) as { error?: string }

      expect(out.error).toBe('need_not_found')
    })

    it('dit qu’un profil n’est pas classé plutôt que de rendre une préflight fantôme', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      matching.replay.mockResolvedValue({ run: { runId: 'r-1' }, need: NEED, results: [RESULT] })
      matching.submissionContext.mockResolvedValue(CONTEXT)
      matching.loadCandidates.mockResolvedValue([])

      const out = (await controller.submissionPreflightForConsultant({
        userId: 'u-1',
        needId: 'n-1',
        runId: 'r-1',
        consultantId: 'c-9',
      } as never)) as { error?: string }

      expect(out.error).toBe('consultant_not_ranked')
    })

    it('bloque sur un consentement compte REFUSÉ — le même NO-GO que l’écran', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      matching.replay.mockResolvedValue({ run: { runId: 'r-1' }, need: NEED, results: [RESULT] })
      matching.submissionContext.mockResolvedValue({
        ...CONTEXT,
        accountConsent: { canRepresent: false, restrictions: 'concurrence directe' },
      })
      matching.loadCandidates.mockResolvedValue([{ consultantId: 'c-1', consentState: 'valid' }])

      const out = (await controller.submissionPreflightForConsultant({
        userId: 'u-1',
        needId: 'n-1',
        runId: 'r-1',
        consultantId: 'c-1',
      } as never)) as { blocked: boolean; status: string }

      expect(out.blocked).toBe(true)
      expect(out.status).toBe('no_go')
    })
  })

  it('dit qu’un profil n’est pas classé plutôt que de rendre un vide', async () => {
    // « Ce consultant n'a pas été évalué » est une réponse ; une absence de
    // réponse laisse le copilote conclure que le profil ne convient pas.
    matching.matchNeedWithChanges.mockResolvedValue({ run: { runId: 'r-1', results: [] }, changes: null })
    matching.explain.mockResolvedValue(null)
    const out = (await controller.matchNeed({ userId: 'u-1', needId: 'n-1', consultantId: 'c-9' } as never)) as {
      error?: string
    }
    expect(out.error).toBe('consultant_not_ranked')
  })

  it('refuse un segment de pool inconnu au lieu de rendre une liste vide', async () => {
    const out = (await controller.reactivation({ userId: 'u-1', segment: 'inventé' } as never)) as { error?: string }
    expect(out.error).toBe('unknown_segment')
    expect(talentPool.entries).not.toHaveBeenCalled()
  })

  it('brief de journée : une journée entière, jamais « le prochain »', async () => {
    agenda.listEvents.mockResolvedValue([])
    await controller.dayBrief({ userId: 'u-1', day: '2026-09-01' } as never)
    expect(agenda.listEvents).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-01T23:59:59.000Z' }),
      { excludedProviders: [] },
    )
  })

  /**
   * LOT 18 (GA-326) — `limit: 25` était en dur, jamais flaggé : un jour à 25
   * rendez-vous et un jour qui en a 40 rendaient la MÊME réponse. Même motif
   * que `list_agenda`/`find_free_slots` (GA-317, côté IA) : sur-lire d'UN ici
   * est ce qui permet à `chat_tools.py` de détecter la coupe sans deviner.
   */
  it('brief de journée : sur-lit d’UN pour qu’une coupe soit détectable en aval', async () => {
    agenda.listEvents.mockResolvedValue([])
    await controller.dayBrief({ userId: 'u-1', day: '2026-09-01' } as never)
    expect(agenda.listEvents).toHaveBeenCalledWith('u-1', expect.objectContaining({ limit: 26 }), {
      excludedProviders: [],
    })
  })

  it('n’expose JAMAIS le coût chargé d’un consultant', async () => {
    // Un pont interne n'a aucun rôle à faire valoir : il ne peut donc pas
    // décider qu'il a le droit de voir une marge. `finance: false` est passé en
    // dur, et ce test le verrouille — le retirer ferait sortir le coût chargé
    // d'un consultant par une route que personne ne regarde.
    talents.search.mockResolvedValue({ items: [] })
    await controller.searchTalents({ userId: 'u-1', query: 'java' } as never)
    expect(talents.search).toHaveBeenCalledWith('w-1', expect.anything(), { finance: false })
  })

  it('lit pour l’utilisateur nommé dans le corps, jamais pour un autre', async () => {
    mailbox.search.mockResolvedValue({ threads: [] })
    await controller.mailSearch({
      userId: 'user-42',
      intent: 'no_reply',
      windowDays: 30,
      silenceDays: 7,
      limit: 25,
    } as never)
    expect(mailbox.search).toHaveBeenCalledWith('user-42', expect.objectContaining({ intent: 'no_reply' }), {
      excludedProviders: [],
    })
    // `userId` ne doit pas fuir dans la requête métier.
    expect(mailbox.search.mock.calls[0]?.[1]).not.toHaveProperty('userId')
  })

  it('#4016 L3 — lit le corps d’un fil pour l’utilisateur nommé, dans SA boîte, et dit « introuvable » plutôt que de rendre un fil vide', async () => {
    mailbox.readOwnThread = jest
      .fn()
      .mockResolvedValue({ threadId: 't1', subject: 'S', messages: [], truncated: false })
    await controller.ownThreadText({
      userId: 'user-42',
      threadId: 't1',
      counterpart: 'a@b.fr',
      windowDays: 90,
    } as never)
    expect(mailbox.readOwnThread).toHaveBeenCalledWith(
      'user-42',
      { threadId: 't1', counterpart: 'a@b.fr', windowDays: 90 },
      { excludedProviders: [] },
    )
    mailbox.readOwnThread.mockResolvedValue(null)
    await expect(
      controller.ownThreadText({ userId: 'user-42', threadId: 'zz', windowDays: 90 } as never),
    ).resolves.toEqual({
      error: 'Fil introuvable dans la fenêtre lue.',
    })
  })

  it('relaie la fenêtre d’agenda telle quelle', async () => {
    agenda.listEvents.mockResolvedValue([])
    await controller.agendaEvents({ userId: 'user-42', limit: 25, query: 'ACME' } as never)
    expect(agenda.listEvents).toHaveBeenCalledWith('user-42', expect.objectContaining({ query: 'ACME' }), {
      excludedProviders: [],
    })
  })

  it('#4064 — la fenêtre d’agenda rend aussi les agendas qui n’ont pas répondu, nommés', async () => {
    agenda.listEventsDetailed.mockResolvedValue({
      events: [],
      unavailable: [{ provider: 'google', reason: 'events_unavailable', calendarName: 'Équipe' }],
    })
    await expect(
      controller.agendaWindow({ userId: 'user-42', limit: 250, from: '2026-07-12T00:00:00+02:00' } as never),
    ).resolves.toEqual({
      events: [],
      unavailable: [{ provider: 'google', reason: 'events_unavailable', calendarName: 'Équipe' }],
    })
    expect(agenda.listEventsDetailed).toHaveBeenCalledWith(
      'user-42',
      expect.objectContaining({ from: '2026-07-12T00:00:00+02:00', limit: 250 }),
      { excludedProviders: [] },
    )
  })

  it('#2770.27 — les créneaux libres de Laura suivent les heures de travail RÉGLÉES par la personne', async () => {
    briefing.workdayWindowOf.mockResolvedValue({ workdayStartHour: 10, workdayEndHour: 17 })
    agenda.freeSlots.mockResolvedValue([])
    await controller.freeSlots({
      userId: 'user-42',
      durationMinutes: 30,
      workdayStartHour: 9,
      workdayEndHour: 18,
    } as never)
    expect(agenda.freeSlots).toHaveBeenCalledWith(
      'user-42',
      expect.objectContaining({ durationMinutes: 30, workdayStartHour: 10, workdayEndHour: 17 }),
      { excludedProviders: [] },
    )
    expect(agenda.freeSlots.mock.calls.at(-1)?.[1]).not.toHaveProperty('userId')
  })

  it('#2770.28 — relaie les préférences d’agenda réglées par la personne nommée', async () => {
    briefing.agendaPreferencesOf.mockResolvedValue({ dossierDurationMinutes: 30, reserveSlots: 2 })
    await expect(controller.agendaPreferences({ userId: 'user-42' })).resolves.toEqual({
      dossierDurationMinutes: 30,
      reserveSlots: 2,
    })
    expect(briefing.agendaPreferencesOf).toHaveBeenCalledWith('user-42')
  })

  it('#2770.27 — sans réglage, les heures ouvrées restent celles de la requête, jamais une fenêtre devinée', async () => {
    briefing.workdayWindowOf.mockResolvedValue(null)
    agenda.freeSlots.mockResolvedValue([])
    await controller.freeSlots({
      userId: 'user-42',
      durationMinutes: 30,
      workdayStartHour: 9,
      workdayEndHour: 18,
    } as never)
    expect(agenda.freeSlots).toHaveBeenLastCalledWith(
      'user-42',
      { durationMinutes: 30, workdayStartHour: 9, workdayEndHour: 18 },
      { excludedProviders: [] },
    )
  })

  /**
   * #3973 — « Outils et sources » : les OUTILS décochés pour ce fil (identifiants
   * du registre, déjà recoupés par `resolveToolExclusions`) descendent jusqu'au
   * choix du backend lu. Jamais dans la requête métier elle-même.
   */
  describe('#3973 — un outil décoché pour ce fil n’est jamais lu', () => {
    it('messagerie : traduit l’outil décoché en boîte exclue', async () => {
      mailbox.search.mockResolvedValue({ threads: [] })
      await controller.mailSearch({
        userId: 'user-42',
        intent: 'unread',
        windowDays: 30,
        silenceDays: 7,
        limit: 25,
        excludedProviders: ['gmail', 'hubspot'],
      } as never)
      expect(mailbox.search).toHaveBeenLastCalledWith('user-42', expect.objectContaining({ intent: 'unread' }), {
        excludedProviders: ['google'],
      })
      expect(mailbox.search.mock.calls.at(-1)?.[1]).not.toHaveProperty('excludedProviders')
    })

    it('agenda : la fenêtre, les créneaux et le brief de journée portent l’exclusion', async () => {
      agenda.listEvents.mockResolvedValue([])
      agenda.freeSlots.mockResolvedValue([])
      briefing.workdayWindowOf.mockResolvedValue(null)
      await controller.agendaEvents({ userId: 'user-42', limit: 25, excludedProviders: ['microsoft'] } as never)
      expect(agenda.listEvents).toHaveBeenLastCalledWith('user-42', expect.anything(), {
        excludedProviders: ['microsoft'],
      })
      expect(agenda.listEvents.mock.calls.at(-1)?.[1]).not.toHaveProperty('excludedProviders')

      await controller.freeSlots({
        userId: 'user-42',
        durationMinutes: 30,
        excludedProviders: ['google-calendar'],
      } as never)
      expect(agenda.freeSlots).toHaveBeenLastCalledWith('user-42', expect.anything(), {
        excludedProviders: ['google'],
      })
      expect(agenda.freeSlots.mock.calls.at(-1)?.[1]).not.toHaveProperty('excludedProviders')

      await controller.dayBrief({ userId: 'user-42', day: '2026-09-01', excludedProviders: ['microsoft'] } as never)
      expect(agenda.listEvents).toHaveBeenLastCalledWith('user-42', expect.anything(), {
        excludedProviders: ['microsoft'],
      })
    })
  })

  it('construit le brief du jour du bon utilisateur', async () => {
    briefing.build.mockResolvedValue({ actions: [] })
    await controller.dailyBriefing({ userId: 'user-42' } as never)
    expect(briefing.build).toHaveBeenCalledWith('user-42')
  })

  it('#3973 — le brief de Laura suit les outils décochés pour ce fil', async () => {
    briefing.build.mockResolvedValue({ actions: [] })
    await controller.dailyBriefing({
      userId: 'user-42',
      excludedProviders: ['gmail'],
      excludedFamilies: ['calendar'],
    } as never)
    expect(briefing.build).toHaveBeenLastCalledWith('user-42', undefined, undefined, undefined, undefined, {
      mailbox: { excludedProviders: ['google'] },
      // Une famille décochée en entier exclut TOUS ses backends : rien n'est lu.
      agenda: { excludedProviders: ['google', 'microsoft'] },
    })
  })

  it('#3973 — sans exclusion, le brief de Laura est appelé exactement comme avant', async () => {
    briefing.build.mockResolvedValue({ actions: [] })
    await controller.dailyBriefing({ userId: 'user-42', excludedProviders: [], excludedFamilies: ['crm'] } as never)
    expect(briefing.build).toHaveBeenLastCalledWith('user-42')
  })

  it('#3386 — le rôle métier déclaré par Laura est transmis au brief, qui le réordonne', async () => {
    briefing.build.mockResolvedValue({ actions: [] })
    await controller.dailyBriefing({ userId: 'user-42', businessRole: 'Business Manager' } as never)
    expect(briefing.build).toHaveBeenCalledWith('user-42', undefined, undefined, undefined, 'Business Manager')
  })

  it('#2392 — compile la clôture de journée du bon utilisateur, et DIT que les cartes ne sont pas lues sans Action OS', async () => {
    briefing.dayClosure.mockResolvedValue({ date: '2026-09-23', results: [] })
    const closure = await controller.dayClosure({ userId: 'user-42', timeZone: 'Europe/Paris' } as never)
    expect(briefing.dayClosure).toHaveBeenCalledWith('user-42', expect.any(Date), 'Europe/Paris')
    expect(closure.toValidate.state).toBe('unavailable')
  })

  /* ── Le back-office (PDF 2 §5.1) ───────────────────────────────────────── */

  // #4016.1d — Laura CITE la probabilité calibrée : le pont rend l'enveloppe, jamais un chiffre nu.
  describe('le CA probable (#4016.1d)', () => {
    it('relaie le calcul calibré du service, avec la base commune lue ICI (GA-07)', async () => {
      dealProbability.probableQuarter.mockResolvedValue({ method: 'beta_binomial_stage_v1', deals: [] })
      sharedBase.caseOutcomesElsewhereFor.mockReturnValue(jest.fn())
      const out = await controller.probableQuarter({ userId: 'u-1' } as never)
      expect(out).toEqual({ method: 'beta_binomial_stage_v1', deals: [] })
      expect(dealProbability.probableQuarter).toHaveBeenCalledWith('w-1', { kind: 'workspace' }, expect.any(Function))
    })

    it('sans le droit de lire un chiffre d’affaires : `finance_forbidden`, jamais une probabilité', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      dealProbability.probableQuarter.mockClear()
      const out = await controller.probableQuarter({ userId: 'u-1' } as never)
      expect(out).toEqual({ error: 'finance_forbidden' })
      expect(dealProbability.probableQuarter).not.toHaveBeenCalled()
    })
  })

  describe('mon pipe', () => {
    const column = (over: Partial<Record<string, unknown>> = {}) => ({
      stage: 'qualified',
      label: 'Qualifié',
      count: 0,
      amount_cents: 0,
      without_amount: 0,
      ...over,
    })

    it('rend « on ne sait pas » plutôt que 0 € quand AUCUN projet n’est chiffré', async () => {
      // Le défaut mesuré le 27/08 sur `/pilotage/finance` : « 580 lignes sans
      // montant » affiché à 0 €. « 0 € » se lit « rien d'espéré », alors que la
      // vérité est « personne n'a chiffré ». Un modèle ne lit qu'un champ.
      pipeline.summary.mockResolvedValue({
        columns: [column({ count: 12, amount_cents: 0, without_amount: 12 })],
        intake: 0,
        signals: 0,
        total_count: 12,
        total_amount_cents: 0,
        total_without_amount: 12,
      })
      const out = (await controller.pipelineSummary({ userId: 'u-1' } as never)) as {
        columns: { amount_cents: number | null }[]
        total_amount_cents: number | null
      }
      expect(out.columns[0]?.amount_cents).toBeNull()
      expect(out.total_amount_cents).toBeNull()
    })

    it('#3714 — le tour de Laura (« où en est mon pipe ? ») ne présente pas une généralité comme une opportunité active', async () => {
      // Entrée : trois lignes d'entrée — une généralité sans travail, la même
      // mal intitulée mais portant un propriétaire, un programme nommé. Outil :
      // `pipeline/summary`, alimenté par la VRAIE `pipelineSummary` du contrat
      // (la classification partagée), pas par un chiffre écrit à la main.
      pipeline.summary.mockResolvedValue(
        pipelineSummary(
          [
            { stage: 'detected', kind: 'implication', source: null },
            { stage: 'detected', kind: 'implication', source: null, owner_id: 'u-1' },
            { stage: 'detected', kind: 'program', source: 'Rapport annuel' },
          ],
          {},
          'fr',
        ),
      )
      // Réponse : l'outil ne compte que 2 projets en entrée, et NOMME la généralité à part.
      const out = (await controller.pipelineSummary({ userId: 'u-1' } as never)) as {
        intake: number
        generic_deductions: number
      }
      expect(out.intake).toBe(2)
      expect(out.generic_deductions).toBe(1)
    })

    it('garde le total comme PLANCHER dès qu’un projet est chiffré', async () => {
      pipeline.summary.mockResolvedValue({
        columns: [column({ count: 3, amount_cents: 500_000, without_amount: 2 })],
        intake: 0,
        signals: 0,
        total_count: 3,
        total_amount_cents: 500_000,
        total_without_amount: 2,
      })
      const out = (await controller.pipelineSummary({ userId: 'u-1' } as never)) as {
        columns: { amount_cents: number | null; without_amount: number }[]
        total_amount_cents: number | null
      }
      expect(out.total_amount_cents).toBe(500_000)
      expect(out.columns[0]?.without_amount).toBe(2)
    })

    it('laisse 0 € sur une colonne VIDE — là, zéro est vrai', async () => {
      pipeline.summary.mockResolvedValue({
        columns: [column()],
        intake: 0,
        signals: 0,
        total_count: 0,
        total_amount_cents: 0,
        total_without_amount: 0,
      })
      const out = (await controller.pipelineSummary({ userId: 'u-1' } as never)) as {
        total_amount_cents: number | null
      }
      expect(out.total_amount_cents).toBe(0)
    })
  })

  describe('le diagnostic de pipe (#2324.40/43/44/46/47/48)', () => {
    it('relaie le diagnostic du service, sur le workspace résolu', async () => {
      pipeline.health.mockResolvedValue({
        needsAttention: [
          { id: 'opp-1', stage: 'qualified', freshness: 'stale', reasons: ['stale', 'without_next_action'] },
        ],
        recommendedToClose: [
          { id: 'opp-1', stage: 'qualified', freshness: 'stale', reasons: ['stale', 'without_next_action'] },
        ],
        excludedUnapprovedSignals: 2,
      })

      const out = await controller.pipelineHealth({ userId: 'u-1' } as never)

      expect(pipeline.health).toHaveBeenCalledWith('w-1')
      expect(out).toEqual({
        needsAttention: [
          { id: 'opp-1', stage: 'qualified', freshness: 'stale', reasons: ['stale', 'without_next_action'] },
        ],
        recommendedToClose: [
          { id: 'opp-1', stage: 'qualified', freshness: 'stale', reasons: ['stale', 'without_next_action'] },
        ],
        excludedUnapprovedSignals: 2,
      })
    })
  })

  describe('la capacité de delivery (#3226)', () => {
    it('relaie le compteur d’intercontrat de l’espace RÉSOLU, sans rien d’autre', async () => {
      delivery.capacity.mockResolvedValue({ intercontractCount: 3 })

      const out = await controller.deliveryCapacity({ userId: 'u-1' } as never)

      expect(delivery.capacity).toHaveBeenCalledWith('w-1')
      expect(out).toEqual({ intercontractCount: 3 })
    })
  })

  describe('la checklist de démarrage d’une mission (#2409.8)', () => {
    it('relaie le verdict et les réserves NOMMÉES du service, sur le workspace résolu', async () => {
      startReadiness.readiness.mockResolvedValue({
        verdict: 'ready_with_reserves',
        agreementsPending: false,
        missing: [],
        reserves: ['daily_rate', 'site_access'],
        items: [],
      })

      const out = await controller.missionStartReadiness({ userId: 'u-1', missionId: 'm-1' } as never)

      expect(startReadiness.readiness).toHaveBeenCalledWith('w-1', 'm-1')
      expect(out).toEqual({
        verdict: 'ready_with_reserves',
        agreementsPending: false,
        missing: [],
        reserves: ['daily_rate', 'site_access'],
        items: [],
      })
    })

    it('sans le service (optionnel), le DIT plutôt que de faire tomber le pont', async () => {
      // Même garde que `accountCoverageMap`/`talentIdentityExplain` : `@Optional()`
      // rend `undefined` quand le provider manque, et la méthode le DIT au lieu
      // d'appeler une méthode sur `undefined`.
      const out = await CopilotBridgeController.prototype.missionStartReadiness.call(
        { startReadiness: undefined, workspaceContext },
        { userId: 'u-1', missionId: 'm-1' },
      )
      expect(out).toEqual({ error: 'start_readiness_unavailable' })
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    })
  })

  describe('les avenants déjà proposés sur une mission (#2423.9)', () => {
    it('relaie les avenants du service, sur le workspace résolu', async () => {
      amendments.list.mockResolvedValue([
        {
          id: 'am-1',
          missionId: 'm-1',
          eventType: 'daily_rate_change',
          status: 'proposed',
          effectiveFrom: '2026-10-01',
          proof: 'E-mail du 20/09',
          previousTerm: { dailyRate: 550 },
          newTerm: { dailyRate: 600 },
          pauseCause: null,
          note: null,
          requestedBy: 'u-1',
          requestedAt: '2026-09-23T10:00:00.000Z',
          approvedBy: null,
          approvedAt: null,
        },
      ])

      const out = await controller.missionAmendments({ userId: 'u-1', missionId: 'm-1' } as never)

      expect(amendments.list).toHaveBeenCalledWith('w-1', 'm-1')
      expect(out).toEqual({
        amendments: [expect.objectContaining({ id: 'am-1', eventType: 'daily_rate_change', status: 'proposed' })],
      })
    })

    it('sans le service (optionnel), le DIT plutôt que de faire tomber le pont', async () => {
      const out = await CopilotBridgeController.prototype.missionAmendments.call(
        { amendments: undefined, workspaceContext },
        { userId: 'u-1', missionId: 'm-1' },
      )
      expect(out).toEqual({ error: 'mission_amendments_unavailable' })
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    })
  })

  describe('mon chiffre d’affaires', () => {
    beforeEach(() => {
      revenue.breakdown.mockResolvedValue({ periodMonth: '2026-07-01', lines: [] })
      revenue.scopeInfo.mockResolvedValue({ kind: 'workspace', outsideAnyPortfolio: null })
    })

    it('REFUSE à qui n’a aucun droit financier — jamais des lignes vides', async () => {
      // « 0 € » et « tu n'as pas le droit de voir » demandent deux gestes
      // opposés. Un rôle sans droit financier ne doit pas lire un chiffre
      // d'affaires nul et croire qu'il n'a rien vendu.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      const out = (await controller.revenueBreakdown({ userId: 'u-1' } as never)) as { error?: string }
      expect(out.error).toBe('finance_forbidden')
      expect(revenue.breakdown).not.toHaveBeenCalled()
    })

    it('restreint au PÉRIMÈTRE de l’appelant quand il n’a que `finance:read:own`', async () => {
      // C'est le §5.3 : « Laura hérite du rôle de l'appelant ». Le rôle n'arrive
      // pas du service IA — il est résolu ici, comme sur la route JWT.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      await controller.revenueBreakdown({ userId: 'u-1' } as never)
      expect(revenue.breakdown).toHaveBeenCalledWith(
        { kind: 'own', workspaceId: 'w-1', userId: 'u-1' },
        expect.any(String),
      )
    })

    it('ouvre l’espace entier à qui porte `finance:read`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      await controller.revenueBreakdown({ userId: 'u-1', month: '2026-07' } as never)
      expect(revenue.breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'w-1' }, '2026-07')
    })

    it('compte les permissions accordées MEMBRE PAR MEMBRE — elles sont additives', async () => {
      // `can(role, [], …)` ignorait par construction la moitié du RBAC : le
      // défaut trouvé sur la liste des missions le 22/08.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      workspaceContext.extraPermissionsOf.mockResolvedValue(['finance:read'])
      await controller.revenueBreakdown({ userId: 'u-1' } as never)
      expect(revenue.breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'w-1' }, expect.any(String))
    })

    it('n’appelle AUCUN calcul de marge — le coût chargé ne traverse pas ce pont', async () => {
      // La doctrine est tenue par l'ABSENCE de code : `aggregate`,
      // `marginAlerts` et `marginByChannel` n'existent pas sur le double, donc
      // les appeler ferait tomber le test avec « is not a function ».
      await controller.revenueBreakdown({ userId: 'u-1' } as never)
      expect(Object.keys(revenue).sort()).toEqual(['breakdown', 'confirmedRevenue', 'scopeInfo'])
    })
  })

  describe('mon CA confirmé', () => {
    beforeEach(() => {
      revenue.confirmedRevenue.mockResolvedValue({
        periodMonth: '2026-07-01',
        amountCents: 100,
        withoutAmount: 0,
        unavailableReason: null,
        sourceRows: 1,
        excludedDisputed: 0,
      })
      revenue.scopeInfo.mockResolvedValue({ kind: 'workspace', outsideAnyPortfolio: null })
    })

    it('REFUSE à qui n’a aucun droit financier — MÊME porte que `finance/revenue`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      const out = (await controller.confirmedRevenue({ userId: 'u-1' } as never)) as { error?: string }
      expect(out.error).toBe('finance_forbidden')
      expect(revenue.confirmedRevenue).not.toHaveBeenCalled()
    })

    it('restreint au PÉRIMÈTRE de l’appelant quand il n’a que `finance:read:own`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      await controller.confirmedRevenue({ userId: 'u-1' } as never)
      expect(revenue.confirmedRevenue).toHaveBeenCalledWith(
        { kind: 'own', workspaceId: 'w-1', userId: 'u-1' },
        expect.any(String),
      )
    })

    it('ouvre l’espace entier à qui porte `finance:read` et relaie `excludedDisputed` TEL QUEL', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const out = (await controller.confirmedRevenue({ userId: 'u-1', month: '2026-07' } as never)) as {
        excludedDisputed?: number | null
      }
      expect(revenue.confirmedRevenue).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'w-1' }, '2026-07')
      expect(out.excludedDisputed).toBe(0)
    })
  })

  describe('ma capacité', () => {
    it('reste sous `finance:read` SEUL — elle décrit l’ÉQUIPE (D1)', async () => {
      // Ouvrir ici ce que `GET /delivery/finance/capacity` refuse ferait du
      // copilote un contournement du RBAC.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      const out = (await controller.capacity({ userId: 'u-1' } as never)) as { error?: string }
      expect(out.error).toBe('finance_forbidden')
      expect(missionScores.capacity).not.toHaveBeenCalled()
    })

    it('porte sur le mois EN COURS par défaut, pas le précédent', async () => {
      // « Combien de jours j'ai à vendre » est une question sur MAINTENANT.
      missionScores.capacity.mockResolvedValue({ capacityDays: null })
      await controller.capacity({ userId: 'u-1' } as never)
      expect(missionScores.capacity).toHaveBeenCalledWith('w-1', new Date().toISOString().slice(0, 7))
    })
  })

  describe('le prévisionnel par horizon (#2425.8)', () => {
    it('reste sous `finance:read` SEUL — une vue d’ÉQUIPE, comme l’écran', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      const out = (await controller.forecastHorizons({ userId: 'u-1' } as never)) as { error?: string }
      expect(out.error).toBe('finance_forbidden')
      expect(horizons.compute).not.toHaveBeenCalled()
    })

    it('rend le calcul de l’écran tel quel — l’horizon demandé, le mois par défaut', async () => {
      const forecast = { gap: { causes: [{ cause: 'invoicingDelay', amounts: [] }] } }
      horizons.compute.mockResolvedValue(forecast)
      expect(await controller.forecastHorizons({ userId: 'u-1', horizon: 'quarter' } as never)).toBe(forecast)
      expect(horizons.compute).toHaveBeenCalledWith('w-1', 'quarter')
      await controller.forecastHorizons({ userId: 'u-1' } as never)
      expect(horizons.compute).toHaveBeenLastCalledWith('w-1', 'month')
    })
  })

  describe('encaissements en retard', () => {
    const line = (over: Record<string, unknown> = {}) => ({
      missionLabel: 'Mission A',
      accountName: 'ACME',
      state: 'invoiced',
      invoicedAt: '2026-07-31T00:00:00.000Z',
      invoicedAmountCents: 840_000,
      dueOn: '2026-08-30',
      paidAt: null,
      remindersSent: 0,
      lastReminderAt: null,
      disputedAt: null,
      disputeReason: null,
      disputeResolvedAt: null,
      ...over,
    })

    it('ne garde que les mois FACTURÉS et NON encaissés', async () => {
      readiness.list.mockResolvedValue({
        month: '2026-07',
        items: [line(), line({ paidAt: '2026-09-01T00:00:00.000Z' }), line({ state: 'blocked' })],
      })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as { items: unknown[] }
      expect(out.items).toHaveLength(1)
    })

    // #2852 (recette Y9) — « Aucun impayé trouvé… septembre 2026 » : sans mois,
    // la lecture ne portait que sur le mois PRÉCÉDENT. Un impayé est un STOCK :
    // la facture d'août encore due le 2 octobre est le premier impayé, pas
    // une facture « hors période ».
    describe('sans mois demandé : le STOCK des mois facturés (#2852)', () => {
      // Relatifs à AUJOURD'HUI : une date figée dans ce test expirerait.
      const monthsAgo = (back: number) => {
        const date = new Date()
        date.setUTCDate(1)
        date.setUTCMonth(date.getUTCMonth() - back)
        return date.toISOString().slice(0, 7)
      }

      it('lit les douze derniers mois ET le mois en cours, et nomme la fenêtre lue', async () => {
        readiness.list.mockImplementation(async (_w: string, query: { month?: string }) => ({
          month: query.month,
          items: query.month === monthsAgo(2) ? [line({ missionLabel: 'Mission du mois -2' })] : [],
        }))
        const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as {
          month: string | null
          months: string[]
          items: { missionLabel: string; periodMonth: string }[]
        }
        const asked = readiness.list.mock.calls.map(call => (call[1] as { month?: string }).month)
        expect(new Set(asked).size).toBe(12)
        expect(asked).toContain(monthsAgo(0))
        expect(out.month).toBeNull()
        expect(out.months).toHaveLength(12)
        expect(out.items).toEqual([
          expect.objectContaining({ missionLabel: 'Mission du mois -2', periodMonth: monthsAgo(2) }),
        ])
      })

      it('un mois EXPLICITE ne lit que ce mois-là', async () => {
        readiness.list.mockResolvedValue({ month: '2026-07', items: [line()] })
        const out = (await controller.overduePayments({ userId: 'u-1', month: '2026-07' } as never)) as {
          month: string
          items: { periodMonth: string }[]
        }
        expect(readiness.list).toHaveBeenCalledTimes(1)
        expect(out.month).toBe('2026-07')
        expect(out.items[0]?.periodMonth).toBe('2026-07')
      })

      it('trie du plus ANCIEN au plus récent : le plus en retard d’abord', async () => {
        readiness.list.mockImplementation(async (_w: string, query: { month?: string }) => ({
          month: query.month,
          items: [monthsAgo(1), monthsAgo(3)].includes(query.month ?? '') ? [line({ missionLabel: query.month })] : [],
        }))
        const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as {
          items: { periodMonth: string }[]
        }
        expect(out.items.map(item => item.periodMonth)).toEqual([monthsAgo(3), monthsAgo(1)])
      })
    })

    it('lit TOUT le mois, jamais « les bloqués seulement »', async () => {
      // `blockedOnly: true` écarterait exactement les lignes cherchées : une
      // relance d'encaissement porte sur un mois FACTURÉ, donc plus bloqué.
      readiness.list.mockResolvedValue({ month: '2026-07', items: [] })
      await controller.overduePayments({ userId: 'u-1' } as never)
      expect(readiness.list).toHaveBeenCalledWith(
        'w-1',
        expect.objectContaining({ blockedOnly: false }),
        // ⚠️ Le DROIT financier, et il vaut `false` en dur — comme partout sur
        // ce pont. Asserter la valeur et non `expect.anything()` : un drapeau
        // dont on ne vérifie que la présence est un drapeau qu'on peut inverser
        // sans qu'aucun test ne bouge.
        { canReadFinance: false },
        expect.any(Date),
      )
    })

    it('garde une facture CONTESTÉE, mais sans relance due — un litige n’est pas un retard', async () => {
      readiness.list.mockResolvedValue({
        month: '2026-07',
        items: [line({ disputedAt: '2026-09-01T00:00:00.000Z', dispute_reason: 'périmètre' })],
      })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as {
        items: { disputedAt: string | null; reminderDue: unknown }[]
      }
      expect(out.items[0]?.disputedAt).toBe('2026-09-01T00:00:00.000Z')
      expect(out.items[0]?.reminderDue).toBeNull()
    })

    it('garde une facture SANS échéance et ne lui invente aucun retard', async () => {
      // C'est justement celle dont personne ne saura jamais dire qu'elle est en
      // retard. L'omettre la rendrait invisible ; lui inventer une date serait
      // pire.
      readiness.list.mockResolvedValue({ month: '2026-07', items: [line({ dueOn: null })] })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as {
        items: { dueOn: string | null; reminderDue: unknown }[]
      }
      expect(out.items).toHaveLength(1)
      expect(out.items[0]?.dueOn).toBeNull()
      expect(out.items[0]?.reminderDue).toBeNull()
    })

    it('n’expose JAMAIS de montant préparatoire ni de coût', async () => {
      readiness.list.mockResolvedValue({ month: '2026-07', items: [line({ preparedAmountCents: 999 })] })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as { items: Record<string, unknown>[] }
      expect(out.items[0]).not.toHaveProperty('preparedAmountCents')
    })

    it('DEMANDE la liste sans droit financier — le montant facturé arrive donc vide', async () => {
      // ⚠️ Ce que ce test garde a CHANGÉ le 29/08/2026. Il asseyait
      // `invoicedAmountCents === 840_000`, c'est-à-dire que le pont remontait au
      // copilote le montant facturé de chaque mois en clair, sans qu'aucune
      // permission ne soit interrogée — la même fuite que sur l'écran, par la
      // porte de la conversation.
      //
      // La forme est conservée (la clé reste PRÉSENTE, D45) ; c'est la VALEUR
      // qui se vide, et elle se vide dans le service. Ici, le service est un
      // faux : ce qui se prouve donc est la seule chose que ce contrôleur
      // décide — le droit qu'il DEMANDE.
      readiness.list.mockResolvedValue({ month: '2026-07', items: [line()] })
      await controller.overduePayments({ userId: 'u-1' } as never)
      expect(readiness.list.mock.calls[0]?.[2]).toEqual({ canReadFinance: false })
    })

    /**
     * LOT 15, ARBITRAGE B — cette porte manquait alors que ses DEUX voisins
     * (`finance/revenue`, `finance/capacity`, 60 lignes plus haut) l'ont déjà.
     * N'importe quel membre de l'espace pouvait demander à Laura les impayés
     * de tout le monde pendant que le même membre, demandant le CA, recevait
     * `finance_forbidden`.
     *
     * ⚠️ PAS de repli `finance:read:own` : cette liste n'a pas de périmètre
     * PAR PORTEUR — elle rend le mois de tout l'espace, exactement comme le
     * documente `invoice-readiness.controller.ts` pour `dso`, `capacity` et
     * `margin-by-channel`. Ouvrir sur `:own` servirait donc l'argent de l'ESN
     * entière à qui n'a droit qu'au sien — le défaut qu'on corrige.
     */
    it('REFUSE à qui n’a aucun droit financier — jamais une liste vide qui se lirait « aucun impayé »', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as { error?: string }
      expect(out.error).toBe('finance_forbidden')
      expect(readiness.list).not.toHaveBeenCalled()
    })

    it('laisse passer qui porte `finance:read` — le chemin d’aujourd’hui, inchangé', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      readiness.list.mockResolvedValue({ month: '2026-07', items: [line()] })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as { items: unknown[] }
      expect(out.items).toHaveLength(1)
      expect(readiness.list).toHaveBeenCalled()
    })

    // #2197.41 — un mois DÉCLARÉ facturé attend toujours son encaissement : le
    // sortir de cette liste ferait disparaître un impayé que personne n'a
    // prouvé mais que personne ne relance plus non plus. Et le pont doit dire
    // QUE c'est une déclaration : Laura n'affirme jamais « facturé » dessus.
    it('#2197.41 — garde aussi un mois DÉCLARÉ facturé, et le NOMME comme tel', async () => {
      readiness.list.mockResolvedValue({
        month: '2026-07',
        items: [line({ state: 'invoiced_declared', invoicedByName: 'Louis Schlegel' })],
      })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as {
        items: { declared: boolean; invoicedByName: string | null }[]
      }
      expect(out.items).toHaveLength(1)
      expect(out.items[0]?.declared).toBe(true)
      expect(out.items[0]?.invoicedByName).toBe('Louis Schlegel')
    })

    it('#2197.41 — un mois PROUVÉ ne porte PAS `declared`', async () => {
      readiness.list.mockResolvedValue({ month: '2026-07', items: [line({ state: 'invoiced' })] })
      const out = (await controller.overduePayments({ userId: 'u-1' } as never)) as { items: { declared: boolean }[] }
      expect(out.items[0]?.declared).toBe(false)
    })
  })

  /**
   * LOT 15, ARBITRAGE B — même défaut, même correction que « encaissements en
   * retard » juste au-dessus : aucune garde, alors que `finance/capacity` (le
   * voisin le plus proche par la FORME de la donnée — une lecture d'ÉQUIPE,
   * pas d'un portefeuille par porteur) en a une.
   */
  describe('les relevés d’activité (mois)', () => {
    it('REFUSE à qui n’a aucun droit financier — jamais une liste vide qui se lirait « rien ne manque »', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      const out = (await controller.timesheets({ userId: 'u-1' } as never)) as { error?: string }
      expect(out.error).toBe('finance_forbidden')
      expect(timesheets.month).not.toHaveBeenCalled()
    })

    it('laisse passer qui porte `finance:read`, comme `get_capacity` — le chemin d’aujourd’hui, inchangé', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      timesheets.month.mockResolvedValue({ month: '2026-07', items: [] })
      const out = await controller.timesheets({ userId: 'u-1', month: '2026-07' } as never)
      expect(out).toEqual({ month: '2026-07', items: [] })
      expect(timesheets.month).toHaveBeenCalledWith('w-1', { month: '2026-07' })
    })
  })

  /**
   * #2424.13 — Laura retrouvait TOUJOURS la bibliothèque entière : ce pont
   * appelait `usableProofs(workspaceId, null)` en dur, quel que soit le compte
   * nommé dans la conversation. `accountId` était déjà un paramètre du
   * service (`targetAccountId`, testé côté `capitalisation.service.spec.ts`)
   * mais rien ne le lui transmettait jamais depuis ici.
   */
  describe('#2424.13 — la bibliothèque de preuves ciblée sur un compte', () => {
    it('transmet le compte demandé au service, plutôt que `null` en dur', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      capitalisation.usableProofs.mockResolvedValue([])
      await controller.proofs({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(capitalisation.usableProofs).toHaveBeenCalledWith('w-1', 'a-1', {
        sector: undefined,
        expertise: undefined,
        technologies: undefined,
      })
    })

    it('sans compte nommé, retombe sur `null` — la bibliothèque entière, comme avant', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      capitalisation.usableProofs.mockResolvedValue([])
      await controller.proofs({ userId: 'u-1' } as never)
      expect(capitalisation.usableProofs).toHaveBeenCalledWith('w-1', null, {
        sector: undefined,
        expertise: undefined,
        technologies: undefined,
      })
    })
  })

  /**
   * #2424.12 — câblage restant : les trois facettes déjà filtrables côté
   * NestJS (#2424.12, `GET capitalisation/proofs/usable`) n'étaient jamais
   * relayées par ce pont — Laura ne pouvait donc jamais les transmettre.
   */
  describe('#2424.12 — les facettes de la bibliothèque relayées par le pont', () => {
    it('transmet le secteur, l’expertise et les technologies, tels quels', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      capitalisation.usableProofs.mockResolvedValue([])
      await controller.proofs({
        userId: 'u-1',
        accountId: 'a-1',
        sector: 'banque',
        expertise: ['cloud', 'data'],
        technologies: ['Java'],
      } as never)
      expect(capitalisation.usableProofs).toHaveBeenCalledWith('w-1', 'a-1', {
        sector: 'banque',
        expertise: ['cloud', 'data'],
        technologies: ['Java'],
      })
    })
  })

  /**
   * #2424.10 — câblage restant de l'expansion depuis un REX positif : le pont
   * transmet le compte au SERVICE, jamais un booléen deviné ici.
   */
  describe('#2424.10 — hasPositiveRex', () => {
    it('transmet le compte à `hasPositiveRex`, scopé sur l’espace actif', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      capitalisation.hasPositiveRex.mockResolvedValue(true)
      const result = await controller.accountHasPositiveRex({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(capitalisation.hasPositiveRex).toHaveBeenCalledWith('w-1', 'a-1')
      expect(result).toEqual({ hasPositiveRex: true })
    })
  })

  /* ── Le second marché et l'accès (tome 6 §16) ──────────────────────────── */

  describe('par où on entre chez un compte', () => {
    beforeEach(() => {
      accountAccess.routeInputs.mockResolvedValue({ signals: {}, declaredCriteria: {}, facts: {} })
    })

    const emptyLandscape = {
      lock: { state: 'inconnu', fact: null },
      modes: [],
      cost: null,
      facts: [],
      entities: [],
      avoidGroupEntry: false,
      warning: null,
      barrier: null,
      community: null,
      question: null,
    }

    it('garde un coût NON DÉCLARÉ à `null` — jamais « c’est gratuit »', async () => {
      // D60 : le coût d'accès est déclaré, jamais estimé. « Personne ne l'a
      // dit » et « l'entrée est gratuite » mènent à deux négociations
      // différentes ; les écrire pareil fait perdre la seconde.
      accountAccess.landscape.mockResolvedValue({
        ...emptyLandscape,
        lock: { state: 'verrouille', fact: null },
        modes: [{ mode: 'rang2_soustraitance', feasibility: 'available' }],
        avoidGroupEntry: true,
      })
      const out = await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out.cost).toBeNull()
      expect(out.barrier).toBeNull()
      expect(out.lock.state).toBe('verrouille')
      expect(out.modes).toEqual([{ mode: 'rang2_soustraitance', feasibility: 'available' }])
    })

    it('sert la barrière DÉCOMPOSÉE — un score nu est la forme que la doctrine refuse', async () => {
      accountAccess.landscape.mockResolvedValue({
        ...emptyLandscape,
        entities: [
          {
            id: 'e-1',
            name: 'Filiale Sud',
            kind: 'subsidiary',
            rank1_incumbent: 'known',
            score: 7,
            reason: 'titulaire connu',
          },
        ],
        barrier: {
          score: 6,
          accessibility: 4,
          access_class: 'C',
          label: 'difficile',
          proxies: [{ key: 'statut', contribution: 2, evidence: 'société cotée', measurable: true }],
          measurable: true,
          missing: ['ancienneté'],
          corrections: [],
        },
      })
      const out = await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      // Le score voyage AVEC ses proxies et avec ce qui manque pour l'estimer.
      // Les retirer ferait sortir « 6/10 » tout seul.
      expect(out.barrier?.proxies).toHaveLength(1)
      expect(out.barrier?.missing).toEqual(['ancienneté'])
      // La porte porte sa RAISON, pas seulement son rang.
      expect(out.entry_points[0]).toEqual(
        expect.objectContaining({ name: 'Filiale Sud', score: 7, reason: 'titulaire connu' }),
      )
    })

    it('#3278.2 — sert le fait panel/référencement déclaré, et null quand personne ne l’a déclaré', async () => {
      accountAccess.landscape.mockResolvedValue({
        ...emptyLandscape,
        lock: {
          state: 'verrouille',
          fact: {
            value: 'verrouille',
            detail: ANSWER_DETAIL.panel_ferme,
            source: 'human',
            observed_at: '2026-10-01',
            freshness: 'fresh',
          },
        },
      })
      const declared = await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(declared.purchasing_panel).toBe('panel_ferme')

      accountAccess.landscape.mockResolvedValue({ ...emptyLandscape, lock: { state: 'verrouille', fact: null } })
      const silent = await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(silent.purchasing_panel).toBeNull()
    })

    it('lit pour l’espace ACTIF de l’appelant, jamais pour un autre', async () => {
      accountAccess.landscape.mockResolvedValue(emptyLandscape)
      await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(accountAccess.landscape).toHaveBeenCalledWith('w-1', 'a-1')
      expect(accountAccess.routeInputs).toHaveBeenCalledWith('w-1', 'a-1')
    })

    // #3278.1 (lot M11) — les signaux de route voyagent tels quels vers Laura.
    it('relaie les signaux des routes veille / talent, et rien quand rien n’est su', async () => {
      accountAccess.landscape.mockResolvedValue(emptyLandscape)
      accountAccess.routeInputs.mockResolvedValueOnce({
        signals: { watch_only: true, talent_from_account: true, event_community: true },
        declaredCriteria: { timing: 'appel d’offres au T1' },
        facts: { event: 'Salon Big Data, 12/09' },
      })
      const signaled = await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(signaled.route_signals).toEqual({ watch_only: true, talent_from_account: true, event_community: true })
      // #3278.1 (11/10) — le texte du fait déclaré voyage avec son signal.
      expect(signaled.route_facts).toEqual({ event: 'Salon Big Data, 12/09' })
      // #3278.2 — les critères déclarés voyagent sous les clés que lit Laura.
      expect(signaled.declared_route_criteria).toEqual({ timing: 'appel d’offres au T1' })
      accountAccess.routeInputs.mockResolvedValueOnce({ signals: {}, declaredCriteria: {}, facts: {} })
      const silent = await controller.accountAccess({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(silent.route_signals).toEqual({})
    })
  })

  describe('les ESN déjà en place sur un compte', () => {
    it('garde la PROVENANCE de chaque ESN — « détecté » n’est pas « connu »', async () => {
      partners.landscape.mockResolvedValue({
        partners: [
          {
            name: 'Vertex Systèmes',
            rank: 'rank1',
            relationship: 'unknown',
            source: 'analysis',
            placements: 0,
            certainty: 'probable',
            scope: 'TMA portail',
            detected_at: '2026-05-01T00:00:00.000Z',
            note: null,
            score: 4,
          },
        ],
        recommendations: [
          {
            entity_id: 'e-1',
            entity_name: 'Filiale Sud',
            rank1_incumbent: 'known',
            play: 'through_partner',
            partner: 'Vertex Systèmes',
            reason: 'un titulaire est en place',
          },
        ],
      })
      const out = await controller.accountPartners({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out.partners[0]?.source).toBe('analysis')
      expect(out.partners[0]?.certainty).toBe('probable')
      // Le seul endroit du produit qui NOMME un intermédiaire.
      expect(out.recommendations[0]?.play).toBe('through_partner')
      expect(out.recommendations[0]?.partner).toBe('Vertex Systèmes')
    })

    /**
     * #1596.3 — `landscape.observed` était calculé côté service (mémoire
     * marché, #1579) et déjà rendu à l'humain (`TabPartners.tsx`), mais jeté
     * par ce pont : seuls `partners` et `recommendations` en sortaient. La
     * description de l'outil `get_esn_on_account` promet TROIS natures de
     * preuve — Laura ne peut citer la troisième que si ce champ traverse.
     */
    it('expose les sociétés OBSERVÉES — la troisième nature de preuve', async () => {
      partners.landscape.mockResolvedValue({
        partners: [],
        recommendations: [],
        observed: [
          { esnName: 'Vertex Systèmes', persons: 6, certainty: 'forte', alsoKnown: false },
          { esnName: 'Astréa Conseil', persons: 3, certainty: 'moyenne', alsoKnown: true },
        ],
      })
      const out = await controller.accountPartners({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out.observed).toEqual([
        { esn_name: 'Vertex Systèmes', persons: 6, certainty: 'forte', also_known: false },
        { esn_name: 'Astréa Conseil', persons: 3, certainty: 'moyenne', also_known: true },
      ])
    })

    it('ne plante pas quand `observed` est absent — une réponse d’avant ce lot', async () => {
      partners.landscape.mockResolvedValue({ partners: [], recommendations: [] })
      const out = await controller.accountPartners({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out.observed).toEqual([])
    })
  })

  describe('#3345.2 (LAU-FINAL-255, recette prod 30/09) — les décisions déjà prises sur les pistes à qualifier', () => {
    it('relaie les décisions du compte — la MÊME lecture que l’écran Opportunités', async () => {
      qualificationLeads.decisions.mockResolvedValue([
        {
          lead_key: 'l-1',
          decision: 'dismissed',
          reason: 'bad_timing',
          note: null,
          decided_at: '2026-09-29T00:00:00.000Z',
          snoozed_until: null,
        },
      ])
      const out = await controller.accountQualificationLeadDecisions({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(qualificationLeads.decisions).toHaveBeenCalledWith('w-1', 'a-1')
      expect(out).toEqual({
        decisions: [
          {
            lead_key: 'l-1',
            decision: 'dismissed',
            reason: 'bad_timing',
            note: null,
            decided_at: '2026-09-29T00:00:00.000Z',
            snoozed_until: null,
          },
        ],
      })
    })

    it('une liste vide veut dire qu’aucune piste n’a encore été tranchée — pas une erreur', async () => {
      qualificationLeads.decisions.mockResolvedValue([])
      const out = await controller.accountQualificationLeadDecisions({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out).toEqual({ decisions: [] })
    })
  })

  describe('#1791.2 — lire le CRM d’un compte depuis la conversation', () => {
    const account = { id: 'a-1', company_name: 'ACME SA', website: 'https://www.acme.fr/x', siren: '123456789' }

    it('REFUSE à qui n’a pas `crm:read` — jamais une lecture silencieuse', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      const out = (await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        error?: string
      }
      expect(out.error).toBe('crm_read_forbidden')
      expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    })

    it('compte les permissions accordées MEMBRE PAR MEMBRE — additives, comme la finance', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      workspaceContext.extraPermissionsOf.mockResolvedValue(['crm:read'])
      accountFindOne.mockResolvedValue(account)
      crmRead.findAccountPresence.mockResolvedValue({
        provider: null,
        matched: false,
        contactsCount: 0,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })
      const out = (await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        error?: string
      }
      expect(out.error).toBeUndefined()
      expect(crmRead.findAccountPresence).toHaveBeenCalled()
    })

    it('refuse un compte introuvable ou étranger — jamais un nom de CRM inventé', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(null)
      const out = (await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        error?: string
      }
      expect(out.error).toBe('account_not_found')
      expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    })

    it('cherche le compte par ESPACE d’abord, par CRÉATEUR en repli — jamais l’inverse', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(account)
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'hubspot',
        matched: false,
        contactsCount: 0,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })
      await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(accountFindOne).toHaveBeenCalledWith({
        where: [
          { id: 'a-1', workspace_id: 'w-1' },
          { id: 'a-1', user_id: 'u-1' },
        ],
      })
    })

    it('dérive le domaine du SITE du compte — la même règle que la route web', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(account)
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'c-1', name: 'Claire Dubois', email: 'claire@acme.fr', jobTitle: 'DSI' }],
        openDeals: [{ id: 'd-1', name: 'Refonte SI', stage: 'negotiation', amount: 45_000 }],
        lastActivityAt: '2026-09-01T00:00:00.000Z',
      })
      await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(crmRead.findAccountPresence).toHaveBeenCalledWith('u-1', {
        account: 'ACME SA',
        domain: 'acme.fr',
        siren: '123456789',
      })
    })

    it('JAMAIS le nom de l’éditeur — `provider` devient un booléen `connected`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(account)
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'hubspot',
        matched: true,
        contactsCount: 1,
        contacts: [{ id: 'c-1', name: 'Claire Dubois', email: 'claire@acme.fr', jobTitle: 'DSI' }],
        openDeals: [{ id: 'd-1', name: 'Refonte SI', stage: 'negotiation', amount: 45_000 }],
        lastActivityAt: '2026-09-01T00:00:00.000Z',
      })
      const out = await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
      const serialised = JSON.stringify(out).toLowerCase()
      expect(serialised).not.toContain('hubspot')
      expect(serialised).not.toContain('salesforce')
      expect(out).toEqual({
        connected: true,
        matched: true,
        contacts_count: 1,
        contacts: [{ name: 'Claire Dubois', email: 'claire@acme.fr', job_title: 'DSI' }],
        open_deals: [{ name: 'Refonte SI', stage: 'negotiation', amount: 45_000 }],
        last_activity_at: '2026-09-01T00:00:00.000Z',
      })
    })

    it('aucun CRM connecté — `connected: false`, jamais une erreur', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(account)
      crmRead.findAccountPresence.mockResolvedValue({
        provider: null,
        matched: false,
        contactsCount: 0,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })
      const out = (await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        connected: boolean
        error?: string
      }
      expect(out.error).toBeUndefined()
      expect(out.connected).toBe(false)
    })

    /**
     * La trace visible (Louis, 10/09) : `POST internal/copilot/crm/presence`
     * journalisait dans le logger serveur — rien dans le journal que
     * l'utilisateur peut consulter. Une lecture RÉUSSIE écrit maintenant une
     * entrée sur le compte concerné, au même endroit que ses e-mails et ses
     * rendez-vous.
     */
    describe('la trace visible sur le journal du compte', () => {
      it('écrit UNE entrée sur le COMPTE concerné après une lecture réussie', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
        accountFindOne.mockResolvedValue(account)
        crmRead.findAccountPresence.mockResolvedValue({
          provider: 'hubspot',
          matched: true,
          contactsCount: 1,
          contacts: [{ id: 'c-1', name: 'Claire Dubois', email: 'claire@acme.fr', jobTitle: 'DSI' }],
          openDeals: [],
          lastActivityAt: null,
        })
        await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
        expect(activities.recordCrmLookup).toHaveBeenCalledWith('w-1', 'u-1', 'a-1')
        expect(activities.recordCrmLookup).toHaveBeenCalledTimes(1)
      })

      /**
       * ⚠️⚠️ Le GESTE, jamais le CONTENU. `recordCrmLookup` ne reçoit que
       * l'espace, l'auteur et le compte — trois identifiants, aucun résultat.
       * Si un jour cet appel se mettait à transmettre `presence` (le connecté,
       * les contacts, les affaires), cette assertion — qui vérifie les trois
       * SEULS arguments reçus — échouerait sur le quatrième argument en trop.
       */
      it('sait dire NON — ne transmet ni `presence`, ni `connected`, ni un compte de contacts', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
        accountFindOne.mockResolvedValue(account)
        crmRead.findAccountPresence.mockResolvedValue({
          provider: 'salesforce',
          matched: true,
          contactsCount: 4,
          contacts: [],
          openDeals: [{ id: 'd-1', name: 'Refonte SI', stage: 'negotiation', amount: 45_000 }],
          lastActivityAt: '2026-09-01T00:00:00.000Z',
        })
        await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
        const call = activities.recordCrmLookup.mock.calls[0] as unknown[]
        expect(call).toEqual(['w-1', 'u-1', 'a-1'])
        expect(JSON.stringify(call).toLowerCase()).not.toContain('salesforce')
      })

      it('n’écrit RIEN quand le rôle refuse `crm:read` — rien ne s’est passé', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
        await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
        expect(activities.recordCrmLookup).not.toHaveBeenCalled()
      })

      it('n’écrit RIEN sur un compte introuvable ou étranger', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
        accountFindOne.mockResolvedValue(null)
        await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)
        expect(activities.recordCrmLookup).not.toHaveBeenCalled()
      })

      it('une trace qui échoue à s’écrire ne fait PAS échouer la réponse — best-effort', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
        accountFindOne.mockResolvedValue(account)
        crmRead.findAccountPresence.mockResolvedValue({
          provider: null,
          matched: false,
          contactsCount: 0,
          contacts: [],
          openDeals: [],
          lastActivityAt: null,
        })
        activities.recordCrmLookup.mockRejectedValueOnce(new Error('db down'))
        const out = (await controller.crmPresence({ userId: 'u-1', accountId: 'a-1' } as never)) as {
          error?: string
          connected?: boolean
        }
        expect(out.error).toBeUndefined()
        expect(out.connected).toBe(false)
      })
    })
  })

  describe('#3181.2 (épopée #3247) — la relation CRM d’un candidat PAR IDENTITÉ, jamais un accountId', () => {
    it('REFUSE à qui n’a pas `crm:read` — jamais une lecture silencieuse', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      const out = (await controller.crmCompanyPresence({ userId: 'u-1', companyName: 'ACME SA' } as never)) as {
        error?: string
      }
      expect(out.error).toBe('crm_read_forbidden')
      expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    })

    it('n’ouvre JAMAIS un compte — relaie nom/domaine/siren tels quels, sans lookup de portefeuille', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'hubspot',
        matched: true,
        contactsCount: 2,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })
      await controller.crmCompanyPresence({
        userId: 'u-1',
        companyName: 'Candidat SA',
        domain: 'candidat.fr',
        siren: '987654321',
      } as never)
      expect(accountFindOne).not.toHaveBeenCalled()
      expect(crmRead.findAccountPresence).toHaveBeenCalledWith('u-1', {
        account: 'Candidat SA',
        domain: 'candidat.fr',
        siren: '987654321',
      })
    })

    it('JAMAIS le nom de l’éditeur, ni les contacts/deals — plus pauvre que `crmPresence`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'salesforce',
        matched: true,
        contactsCount: 3,
        contacts: [{ id: 'c-1', name: 'Claire Dubois', email: 'claire@candidat.fr', jobTitle: 'DSI' }],
        openDeals: [{ id: 'd-1', name: 'Refonte SI', stage: 'negotiation', amount: 45_000 }],
        lastActivityAt: '2026-09-01T00:00:00.000Z',
      })
      const out = await controller.crmCompanyPresence({ userId: 'u-1', companyName: 'Candidat SA' } as never)
      const serialised = JSON.stringify(out).toLowerCase()
      expect(serialised).not.toContain('hubspot')
      expect(serialised).not.toContain('salesforce')
      expect(serialised).not.toContain('claire')
      expect(out).toEqual({ connected: true, matched: true, lastActivityAt: '2026-09-01T00:00:00.000Z' })
    })

    it('aucun CRM connecté — `connected: false`, jamais une erreur', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      crmRead.findAccountPresence.mockResolvedValue({
        provider: null,
        matched: false,
        contactsCount: 0,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })
      const out = await controller.crmCompanyPresence({ userId: 'u-1', companyName: 'Candidat SA' } as never)
      expect(out).toEqual({ connected: false, matched: false, lastActivityAt: null })
    })
  })

  describe('#3182.2 (épopée #3248) — l’historique de staffing d’un compte', () => {
    const account = { id: 'a-1', company_name: 'ACME SA' }

    it('rend les consultants déjà positionnés, tels que `listForAccount` les rend', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(account)
      staffing.listForAccount.mockResolvedValue([
        {
          consultantId: 'c-1',
          consultantName: 'Marie Dupont',
          missionId: 'm-1',
          missionLabel: 'Refonte SI',
          startsOn: '2026-01-01',
          endsOn: '2026-06-30',
        },
      ])
      const out = (await controller.accountStaffingHistory({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        consultants: unknown[]
      }
      expect(out.consultants).toEqual([
        {
          consultant_id: 'c-1',
          full_name: 'Marie Dupont',
          mission_id: 'm-1',
          mission_label: 'Refonte SI',
          starts_on: '2026-01-01',
          ends_on: '2026-06-30',
        },
      ])
    })

    it('refuse un compte introuvable ou étranger — jamais une requête sur un id inventé', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue(null)
      const out = (await controller.accountStaffingHistory({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        error?: string
      }
      expect(out.error).toBe('account_not_found')
      expect(staffing.listForAccount).not.toHaveBeenCalled()
    })

    it('refuse proprement quand `StaffingService` n’est pas fourni — jamais une panne du pont', async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [CopilotBridgeController],
        providers: [
          { provide: MailboxService, useValue: mailbox },
          { provide: AgendaService, useValue: agenda },
          { provide: BriefingService, useValue: briefing },
          { provide: ChainsService, useValue: chains },
          { provide: TalentService, useValue: talents },
          { provide: ConsultantsService, useValue: consultantsService },
          { provide: TalentIdentityService, useValue: talentIdentity },
          { provide: DeliveryService, useValue: delivery },
          { provide: TimesheetsService, useValue: timesheets },
          { provide: InvoiceReadinessService, useValue: readiness },
          { provide: CapitalisationService, useValue: capitalisation },
          // Intégration E (29/09) — `ProposalsService` est devenu requis sur
          // main (index 8) pendant que ce test vivait sur sa branche.
          { provide: ProposalsService, useValue: proposals },
          { provide: PlaybooksService, useValue: playbooks },
          { provide: OpenNeedsService, useValue: openNeeds },
          { provide: MatchingService, useValue: matching },
          { provide: InverseMatchingService, useValue: inverseMatching },
          { provide: TalentPoolService, useValue: talentPool },
          { provide: RfpService, useValue: rfps },
          { provide: AccountsService, useValue: accounts },
          { provide: PilotageService, useValue: pilotage },
          { provide: ProjectPipelineService, useValue: pipeline },
          { provide: RevenueService, useValue: revenue },
          { provide: MissionScoresService, useValue: missionScores },
          { provide: ForecastHorizonsService, useValue: horizons },
          { provide: WorkspaceContextService, useValue: workspaceContext },
          { provide: LauraService, useValue: laura },
          { provide: LauraProbeService, useValue: lauraProbe },
          { provide: WeakestLinkDiagnosisService, useValue: weakestLinkDiagnosis },
          { provide: getRepositoryToken(ProfileEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
          {
            provide: getRepositoryToken(AccountEntity),
            useValue: { manager: { query: accountQuery }, findOne: accountFindOne },
          },
          { provide: AccountAccessService, useValue: accountAccess },
          { provide: PartnersService, useValue: partners },
          { provide: PartnerPipelineService, useValue: partnerPipeline },
          { provide: EsnDirectoryService, useValue: esnDirectory },
          { provide: IaClient, useValue: ia },
          { provide: ContactsService, useValue: contacts },
          { provide: FieldConflictService, useValue: { openConflicts: jest.fn().mockResolvedValue([]) } },
          { provide: AnalysisService, useValue: analysis },
          { provide: LauraBatchFollowService, useValue: { follow: jest.fn(), settled: jest.fn() } },
          { provide: AnalysisRunsService, useValue: analysisRuns },
          { provide: CreditsService, useValue: credits },
          { provide: MarketMemoryService, useValue: marketMemory },
          { provide: RoutinesService, useValue: routines },
          { provide: ImportService, useValue: imports },
          { provide: ImportOverviewForLauraService, useValue: importOverview },
          { provide: CvBatchImportService, useValue: cvBatchImport },
          { provide: CrmReadService, useValue: crmRead },
          { provide: ActivitiesService, useValue: activities },
          { provide: NotificationsService, useValue: notifications },
          { provide: DEAL_STAGE_SLA_PORT, useValue: dealStageSla },
          { provide: MemoryService, useValue: memory },
          { provide: WorkspaceTeamService, useValue: workspaceTeam },
          { provide: CataloguesService, useValue: catalogues },
          { provide: ConfigService, useValue: { get: () => 'secret-de-test' } },
          // `StaffingService` volontairement ABSENT : c'est le cas testé.
        ],
      }).compile()
      const controllerWithoutStaffing = moduleRef.get(CopilotBridgeController)
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const out = (await controllerWithoutStaffing.accountStaffingHistory({
        userId: 'u-1',
        accountId: 'a-1',
      } as never)) as { error?: string }
      expect(out.error).toBe('staffing_unavailable')
    })
  })

  // #2271.19 — l'historique d'un compte, pour la carte `timeline` de la conversation.
  describe('#2271.19 — l’historique d’un compte depuis la conversation', () => {
    it('relaie EXACTEMENT ce que rend `AccountTimelineService` — aucun second calcul', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const events = [{ id: 'action:1', kind: 'action', at: '2026-07-03T09:00:00Z', label: 'Relance', detail: null }]
      timeline.forAccount.mockResolvedValue({ events })
      const out = (await controller.accountTimeline({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        events: unknown[]
      }
      expect(out.events).toBe(events)
      expect(timeline.forAccount).toHaveBeenCalledWith('a-1', 'w-1')
    })

    it('NON : un compte étranger ou introuvable reste introuvable, jamais un détail qui fuit', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      timeline.forAccount.mockRejectedValue(new Error('Compte introuvable dans votre espace de travail.'))
      const out = (await controller.accountTimeline({ userId: 'u-1', accountId: 'a-x' } as never)) as {
        error?: string
      }
      expect(out.error).toBe('account_not_found')
    })
  })

  // #3895 — « note achats limitée à une entité du groupe » : Laura lit les notes d'un compte AVEC leur
  // portée, la MÊME lecture que l'onglet Notes de la fiche (`NotesService.list`).
  describe('#3895 — les notes d’un compte, portée de groupe comprise', () => {
    const note = (over: Record<string, unknown>) => ({
      id: 'n-1',
      entityType: 'account',
      entityId: 'a-1',
      body: 'Délai achats : six semaines',
      pinned: false,
      createdAt: '2026-10-01T09:00:00Z',
      authorName: 'Léa Martin',
      alsoAppliesTo: [],
      inheritedFrom: null,
      ...over,
    })

    it('relaie les notes avec leur origine et les entités où elles valent aussi', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accounts.findOne.mockResolvedValue({ type: 'success', output: { id: 'a-2', company_name: 'Sanofi Pasteur' } })
      notesService.list.mockResolvedValue([
        note({ id: 'n-1', entityId: 'a-1', inheritedFrom: { id: 'a-1', name: 'Sanofi' } }),
        note({ id: 'n-2', entityId: 'a-2', alsoAppliesTo: [{ id: 'a-3', name: 'Sanofi Genzyme' }], pinned: true }),
      ])
      const out = (await controller.accountNotes({ userId: 'u-1', accountId: 'a-2' } as never)) as {
        notes: Array<{
          inheritedFrom: { name: string } | null
          alsoAppliesTo: Array<{ name: string }>
          pinned: boolean
        }>
      }
      expect(notesService.list).toHaveBeenCalledWith('u-1', 'account', 'a-2')
      expect(out.notes).toHaveLength(2)
      expect(out.notes[0]?.inheritedFrom?.name).toBe('Sanofi')
      expect(out.notes[1]?.alsoAppliesTo[0]?.name).toBe('Sanofi Genzyme')
    })

    it('NON : un compte hors espace ne rend aucune note (jamais celles d’un autre espace)', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accounts.findOne.mockResolvedValue({ type: 'failure' })
      notesService.list.mockClear()
      const out = (await controller.accountNotes({ userId: 'u-1', accountId: 'a-x' } as never)) as {
        error?: string
      }
      expect(out.error).toBe('account_not_found')
      expect(notesService.list).not.toHaveBeenCalled()
    })

    it('un compte sans note rend une liste vide, pas une erreur', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accounts.findOne.mockResolvedValue({ type: 'success', output: { id: 'a-2' } })
      notesService.list.mockResolvedValue([])
      const out = (await controller.accountNotes({ userId: 'u-1', accountId: 'a-2' } as never)) as {
        notes: unknown[]
      }
      expect(out.notes).toEqual([])
    })

    it('borne le corps d’une note et le nombre de notes rendues', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accounts.findOne.mockResolvedValue({ type: 'success', output: { id: 'a-2' } })
      notesService.list.mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => note({ id: `n-${i}`, body: 'x'.repeat(2000) })),
      )
      const out = (await controller.accountNotes({ userId: 'u-1', accountId: 'a-2' } as never)) as {
        notes: Array<{ body: string }>
        truncated: boolean
      }
      expect(out.notes).toHaveLength(20)
      expect(out.notes[0]?.body.length).toBeLessThanOrEqual(801)
      expect(out.truncated).toBe(true)
    })
  })

  describe('#2308 — la carte de couverture du chat, pour un compte déjà analysé', () => {
    it('relaie EXACTEMENT ce que rend `CoverageService.computeChatCoverageMapForAccount`', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const map = {
        account_id: 'a-1',
        generated_at: '2026-09-22T00:00:00.000Z',
        meaning: 'Ce que nous savons, jamais ce que le marché fait.',
        role_families: [],
        perimeters: [],
        sales_stages: [],
        gaps: [],
      }
      coverage.computeChatCoverageMapForAccount.mockResolvedValue(map)
      // Compte sans `company_name` (défaut du double `accountFindOne`,
      // remis à zéro par `jest.resetAllMocks()`) : #2308.32 compose alors un
      // `Set` VIDE, exactement le comportement d'avant ce correctif.
      const out = await controller.accountCoverageMap({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out).toBe(map)
      expect(coverage.computeChatCoverageMapForAccount).toHaveBeenCalledWith('a-1', 'w-1', new Set())
      expect(marketMemory.coverageFor).not.toHaveBeenCalled()
    })

    it('#2308.32 (corrigé 23/09/2026) — compose un signal Market Memory "cyber" avant d\'appeler le service', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      accountFindOne.mockResolvedValue({
        id: 'a-1',
        company_name: 'Acme SA',
        website: 'https://acme.example',
        registry_country: 'FR',
      })
      marketMemory.coverageFor.mockResolvedValue({
        status: 'ok',
        coverage: { covered: true, roleFamilies: [{ family: 'Cybersécurité', persons: 12 }] },
      })
      coverage.computeChatCoverageMapForAccount.mockResolvedValue({})
      await controller.accountCoverageMap({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(marketMemory.coverageFor).toHaveBeenCalledWith({
        ref: 'a-1',
        name: 'Acme SA',
        website: 'https://acme.example',
        country: 'FR',
      })
      expect(coverage.computeChatCoverageMapForAccount).toHaveBeenCalledWith(
        'a-1',
        'w-1',
        new Set(['securite_conformite']),
      )
    })

    it('sans le service (optionnel), refuse proprement plutôt que de faire tomber le pont', async () => {
      // Même garde que `accountTimeline`/`talentIdentityExplain` : `@Optional()`
      // rend `undefined` quand le provider manque, et la méthode le DIT au lieu
      // d'appeler une méthode sur `undefined`. Appelée directement sur le
      // prototype avec un `this` minimal plutôt que de reconstruire tout le
      // graphe de providers du module pour UNE valeur absente.
      const out = await CopilotBridgeController.prototype.accountCoverageMap.call(
        { coverage: undefined, workspaceContext },
        { userId: 'u-1', accountId: 'a-1' },
      )
      expect(out).toEqual({ error: 'account_coverage_map_unavailable' })
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    })
  })

  describe('#2285.2 (épopée #2786) — la façade canonique d’un compte depuis la conversation', () => {
    it('relaie EXACTEMENT ce que rend `AccountIntelligenceContextService.contextFor` — aucun second calcul', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const context = {
        accountId: 'a-1',
        companyName: { state: 'known', value: 'Thales', provenance: { source: 'current_data', observedAt: null } },
      }
      intelligenceContext.contextFor.mockResolvedValue(context)
      const out = await controller.accountIntelligenceContext({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out).toBe(context)
      expect(intelligenceContext.contextFor).toHaveBeenCalledWith('a-1', 'w-1')
    })

    it('NON : un compte étranger ou introuvable reste introuvable, jamais un détail qui fuit', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      intelligenceContext.contextFor.mockResolvedValue(null)
      const out = await controller.accountIntelligenceContext({ userId: 'u-1', accountId: 'a-x' } as never)
      expect(out).toEqual({ error: 'account_not_found' })
    })

    it('sans le service (optionnel), refuse proprement plutôt que de faire tomber le pont', async () => {
      // Même garde que `accountTimeline`/`accountCoverageMap` ci-dessus.
      const out = await CopilotBridgeController.prototype.accountIntelligenceContext.call(
        { intelligenceContext: undefined, workspaceContext },
        { userId: 'u-1', accountId: 'a-1' },
      )
      expect(out).toEqual({ status: 'unavailable', reason: 'account_intelligence_unavailable' })
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    })
  })

  describe('#3277.1 (épopée #3277) — la projection 5P depuis la conversation', () => {
    it('relaie EXACTEMENT ce que rend `AccountStrategy5PService.strategyFor` — aucun second calcul', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const strategy = {
        accountId: 'a-1',
        readiness: 'READY',
        next_action_dimension: null,
      }
      strategy5P.strategyFor.mockResolvedValue(strategy)
      const out = await controller.accountStrategy5P({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out).toBe(strategy)
      expect(strategy5P.strategyFor).toHaveBeenCalledWith('a-1', 'w-1')
    })

    it('NON : un compte étranger ou introuvable reste introuvable, jamais un détail qui fuit', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      strategy5P.strategyFor.mockResolvedValue(null)
      const out = await controller.accountStrategy5P({ userId: 'u-1', accountId: 'a-x' } as never)
      expect(out).toEqual({ error: 'account_not_found' })
    })

    it('sans le service (optionnel), refuse proprement plutôt que de faire tomber le pont', async () => {
      // Même garde que `accountIntelligenceContext` ci-dessus.
      const out = await CopilotBridgeController.prototype.accountStrategy5P.call(
        { strategy5P: undefined, workspaceContext },
        { userId: 'u-1', accountId: 'a-1' },
      )
      expect(out).toEqual({ status: 'unavailable', reason: 'account_strategy_5p_unavailable' })
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    })
  })

  describe('#3258.14 (épopée #3362, lot E25 30/09) — la matrice intérêt × pénétrabilité depuis la conversation', () => {
    it('relaie EXACTEMENT ce que rend `AccountInterestPenetrabilityService.matrixFor` — aucun second calcul', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      const matrix = {
        accountId: 'a-1',
        interest: { factors: [], band: 'high', known: 0, total: 3 },
        penetrability: { factors: [], band: 'low', known: 0, total: 3 },
        quadrant: 'priority_now',
        quadrantUnavailableReason: null,
      }
      interestPenetrability.matrixFor.mockResolvedValue(matrix)
      const out = await controller.accountInterestPenetrability({ userId: 'u-1', accountId: 'a-1' } as never)
      expect(out).toBe(matrix)
      expect(interestPenetrability.matrixFor).toHaveBeenCalledWith('a-1', 'w-1')
    })

    it('NON : un compte étranger ou introuvable reste introuvable, jamais un détail qui fuit', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      interestPenetrability.matrixFor.mockResolvedValue(null)
      const out = await controller.accountInterestPenetrability({ userId: 'u-1', accountId: 'a-x' } as never)
      expect(out).toEqual({ error: 'account_not_found' })
    })

    it('sans le service (optionnel), refuse proprement plutôt que de faire tomber le pont', async () => {
      // Même garde que `accountStrategy5P` ci-dessus.
      const out = await CopilotBridgeController.prototype.accountInterestPenetrability.call(
        { interestPenetrability: undefined, workspaceContext },
        { userId: 'u-1', accountId: 'a-1' },
      )
      expect(out).toEqual({ status: 'unavailable', reason: 'account_interest_penetrability_unavailable' })
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    })
  })

  describe('#2623.1 — les contacts d’un compte, pour enchaîner analyser → proposer les contacts', () => {
    it('classe et identifie EN UN SEUL appel — même classement, même identité que l’onglet Contacts', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: [
          { contact_id: 'c-1', position: 1, group: 'decision_maker' },
          { contact_id: 'c-2', position: 2, group: 'influencer' },
        ],
        total: 2,
      })
      contacts.findByAccountForHttp.mockResolvedValue([
        {
          id: 'c-1',
          full_name: 'Claire Dubois',
          title: 'DSI',
          email: 'claire@acme.fr',
          phone: null,
          linkedin_url: null,
          decision_role: 'champion',
          lifecycle_state: 'engaged',
        },
        {
          id: 'c-2',
          full_name: 'Marc Petit',
          title: 'RSSI',
          email: null,
          phone: null,
          linkedin_url: 'https://li/marc',
          decision_role: null,
          lifecycle_state: null,
        },
      ])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        contacts: Array<{
          contact_id: string
          full_name: string
          channels: string[]
          decision_role: string | null
          lifecycle_state: string | null
        }>
        total: number
        truncated: boolean
      }

      expect(contacts.findByAccountForHttp).toHaveBeenCalledWith('a-1', 'u-1')
      expect(contacts.rankForAccount).toHaveBeenCalledWith('a-1', 'u-1', {})
      expect(out.contacts).toEqual([
        expect.objectContaining({
          contact_id: 'c-1',
          full_name: 'Claire Dubois',
          channels: ['email'],
          // #2160 — le rôle COMMERCIAL et l'état du cycle de vie, relayés tels
          // quels : « champion »/« engaged » nommés, jamais un cinquième
          // vocabulaire inventé pour le modèle.
          decision_role: 'champion',
          lifecycle_state: 'engaged',
        }),
        // GA-69 — la capacité, jamais l'éditeur : la valeur part telle quelle au modèle.
        expect.objectContaining({
          contact_id: 'c-2',
          full_name: 'Marc Petit',
          channels: ['professional_network'],
          decision_role: null,
          lifecycle_state: null,
        }),
      ])
      expect(out.total).toBe(2)
      expect(out.truncated).toBe(false)
      // #3989 — base commune muette pour ce compte : aucune clé (on n'affiche pas ce qu'on n'a pas).
      expect(out).not.toHaveProperty('shared_base_roles')
    })

    // #3869.2 / #3869.4 — le PÉRIMÈTRE et la DATE de vérification d'un contact, relayés quand ils existent :
    // sans eux Laura ne pouvait ni juger qu'un titre borné à une zone ne couvre pas la demande, ni dater sa preuve.
    it('#3869.2 — relaie l’entité, le lieu et la date de vérification de l’emploi, et rien quand ils manquent', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: [
          { contact_id: 'c-1', position: 1, group: 'decision_maker' },
          { contact_id: 'c-2', position: 2, group: 'influencer' },
        ],
        total: 2,
      })
      contacts.findByAccountForHttp.mockResolvedValue([
        {
          id: 'c-1',
          full_name: 'Tarik B.',
          title: 'Head of Procurement Morocco/Tunisia/Libya',
          entity: 'Sanofi Afrique du Nord',
          place: { country: 'Maroc', city: 'Casablanca', organization: null },
          employment_verified_at: new Date('2026-09-20T10:00:00Z'),
          email: null,
          phone: null,
          linkedin_url: null,
        },
        { id: 'c-2', full_name: 'Julia', title: 'Achats', email: null, phone: null, linkedin_url: null },
      ])
      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        contacts: Array<Record<string, unknown>>
      }
      expect(out.contacts[0]).toMatchObject({
        entity: 'Sanofi Afrique du Nord',
        place: { country: 'Maroc', city: 'Casablanca', organization: null },
        employment_verified_on: '2026-09-20',
      })
      // On n'affiche pas ce qu'on n'a pas : aucune clé, jamais « null » qui se lirait « vérifié nulle part ».
      expect(out.contacts[1]).not.toHaveProperty('entity')
      expect(out.contacts[1]).not.toHaveProperty('place')
      expect(out.contacts[1]).not.toHaveProperty('employment_verified_on')
    })

    // #3989 (Louis 11/10/2026, c94) — les rôles qu'un UTILISATEUR d'un autre espace
    // a apportés sur la même société, ANONYMISÉS : le rôle, jamais la personne ni
    // l'espace. Un rôle que le compte connaît déjà ne se répète pas.
    it('#3989 — nomme les rôles anonymes de la base commune que le compte n’a pas encore', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: [{ contact_id: 'c-1', position: 1, group: 'decision_maker' }],
        total: 1,
      })
      contacts.findByAccountForHttp.mockResolvedValue([
        { id: 'c-1', full_name: 'Claire Dubois', title: 'DSI', email: null, phone: null, linkedin_url: null },
      ])
      accountQuery.mockImplementation(async (sql: string) => {
        if (/FROM accounts a/.test(sql)) return [{ siren: '552120222', website: null, is_demo: false }]
        if (/origin = 'user'/.test(sql)) return [{ title: 'Responsable achats IT' }, { title: 'dsi' }]
        return []
      })
      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as Record<
        string,
        unknown
      >
      expect(out.shared_base_roles).toEqual({ provenance: 'base commune', roles: ['Responsable achats IT'] })
      accountQuery.mockReset()
    })

    // #2533 (recette prod 07/10, UNEO) — Laura répondait « pas de fiche DSI
    // vérifiée » alors que la fiche listait la Directrice des SI avec un e-mail
    // vérifié : la route ne rendait que les CINQ premiers du classement, sans
    // la coordonnée ni sa vérification.
    describe('#2533 — la fonction demandée et la coordonnée en clair', () => {
      const uneoRows = Array.from({ length: 40 }, (_, index) => ({
        id: `c-${index + 1}`,
        full_name: `Personne ${index + 1}`,
        title: 'Chargé de mission',
        email: null as string | null,
        email_verified: false,
        phone: null as string | null,
        linkedin_url: null,
        decision_role: null,
        lifecycle_state: null,
      }))
      uneoRows[37] = {
        ...uneoRows[37]!,
        full_name: 'Caroline Jaouen',
        title: "Directrice des Systèmes d'information",
        email: 'caroline.jaouen@uneo.fr',
        email_verified: true,
        phone: '+33 1 00 00 00 00',
      }
      const ranked = uneoRows.map((row, index) => ({ contact_id: row.id, position: index + 1, group: 'other' }))

      beforeEach(() => {
        accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
        contacts.rankForAccount.mockResolvedValue({ ranked, total: ranked.length })
        contacts.findByAccountForHttp.mockResolvedValue(uneoRows)
      })

      it('« DSI » trouve la Directrice des Systèmes d’information même hors des cinq premiers', async () => {
        const out = (await controller.accountContacts({
          userId: 'u-1',
          accountId: 'a-1',
          titleQuery: 'DSI',
        } as never)) as { contacts: Array<Record<string, unknown>>; title_query?: string }

        expect(out.contacts).toEqual([
          expect.objectContaining({
            full_name: 'Caroline Jaouen',
            title: "Directrice des Systèmes d'information",
            // Louis 04/10 — e-mail et téléphone EN CLAIR, et leur vérification nommée.
            email: 'caroline.jaouen@uneo.fr',
            email_verified: true,
            phone: '+33 1 00 00 00 00',
          }),
        ])
        expect(out.title_query).toBe('DSI')
      })

      // #4016.4e — une adresse ESTIMÉE (motif de l'entreprise, vérifiée MX/SMTP) voyage vers
      // Laura AVEC son badge : sans lui, elle la citerait comme une adresse connue.
      it('une adresse estimée est NOMMÉE « estimée » vers Laura, une adresse connue ne porte aucune clé', async () => {
        const rows = [
          { ...uneoRows[0]!, id: 'c-1', email: 'a@uneo.fr', email_estimated_at: '2026-10-11T08:00:00.000Z' },
          { ...uneoRows[1]!, id: 'c-2', email: 'b@uneo.fr', email_estimated_at: null },
        ]
        contacts.rankForAccount.mockResolvedValue({
          ranked: [
            { contact_id: 'c-1', position: 1, group: 'other' },
            { contact_id: 'c-2', position: 2, group: 'other' },
          ],
          total: 2,
        })
        contacts.findByAccountForHttp.mockResolvedValue(rows)
        const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
          contacts: Array<Record<string, unknown>>
        }
        expect(out.contacts[0]).toMatchObject({ email: 'a@uneo.fr', email_estimated: true })
        expect(out.contacts[0]?.email_estimated_on).toBe('2026-10-11')
        expect(out.contacts[1]).not.toHaveProperty('email_estimated')
        expect(out.contacts[1]).not.toHaveProperty('email_estimated_on')
      })

      // #3890.4 (ADD-SANOFI-04, retour bêta Sanofi 08/10/2026) — « dix contacts
      // liés au CRM » et « 2 597 personnes détectées » lues comme une
      // CONTRADICTION : `total` rendait le compte BRUT de l'espace (ici,
      // les 40 lignes de ce compte) alors que `contacts`/`matched` ne
      // portaient que ceux qui tiennent la fonction demandée. Les deux
      // nombres doivent mesurer la MÊME population pour ne jamais se lire
      // comme deux comptages qui se contredisent.
      it('« DSI » rend un total COHÉRENT avec la fonction demandée, jamais le total brut du compte', async () => {
        const out = (await controller.accountContacts({
          userId: 'u-1',
          accountId: 'a-1',
          titleQuery: 'DSI',
        } as never)) as { total: number; matched?: number }
        expect(out.total).toBe(1)
        expect(out.matched).toBe(1)
      })

      it('une fonction absente du compte rend une liste vide, jamais un contact approchant', async () => {
        const out = (await controller.accountContacts({
          userId: 'u-1',
          accountId: 'a-1',
          titleQuery: 'Directeur des achats',
        } as never)) as { contacts: unknown[] }
        expect(out.contacts).toEqual([])
      })

      it('« N personnes par entreprise » : jusqu’à dix, dans l’ordre du classement', async () => {
        const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1', limit: 10 } as never)) as {
          contacts: Array<{ contact_id: string }>
          truncated: boolean
        }
        expect(out.contacts.map(contact => contact.contact_id)).toEqual(ranked.slice(0, 10).map(r => r.contact_id))
        expect(out.truncated).toBe(true)
      })

      it('sans limite, la route garde ses cinq contacts d’avant', async () => {
        const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
          contacts: unknown[]
        }
        expect(out.contacts).toHaveLength(5)
      })
    })

    // #3219 (#190.2 pour un CONTACT) — la même visibilité de contradiction que
    // celle déjà branchée côté compte, pour un contact proposé par CETTE route.
    it('relaie les contradictions OUVERTES d’un contact, lues par le MÊME service que côté compte', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: [{ contact_id: 'c-1', position: 1, group: 'decision_maker' }],
        total: 1,
      })
      contacts.findByAccountForHttp.mockResolvedValue([
        {
          id: 'c-1',
          full_name: 'Claire Dubois',
          title: 'DSI',
          email: 'claire@acme.fr',
          phone: null,
          linkedin_url: null,
          decision_role: 'champion',
          lifecycle_state: 'engaged',
        },
      ])
      const openConflict = {
        field: 'title',
        entity: { type: 'contact', id: 'c-1' },
        claims: [
          { value: 'DSI', source: 'pipeline', at: '2026-09-01T00:00:00.000Z', authority: 1 },
          { value: 'DSI adjointe', source: 'model', at: '2026-09-20T00:00:00.000Z', authority: 1 },
        ],
        sourceTypes: ['pipeline', 'model'],
        conflictSince: '2026-09-20T00:00:00.000Z',
        resolvedBy: 'unresolved',
        chosenValue: null,
      }
      conflicts.openConflicts.mockResolvedValue([openConflict])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        contacts: Array<{ contact_id: string; conflicts: unknown[] }>
      }

      expect(conflicts.openConflicts).toHaveBeenCalledWith('w-1', 'contact', 'c-1')
      expect(out.contacts[0]?.conflicts).toEqual([openConflict])
    })

    it('un contact sans contradiction ouverte relaie une liste vide, jamais un champ absent', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: [{ contact_id: 'c-1', position: 1, group: 'decision_maker' }],
        total: 1,
      })
      contacts.findByAccountForHttp.mockResolvedValue([
        { id: 'c-1', full_name: 'Claire Dubois', title: 'DSI', email: null, phone: null, linkedin_url: null },
      ])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        contacts: Array<{ conflicts: unknown[] }>
      }

      expect(out.contacts[0]?.conflicts).toEqual([])
    })

    // #219.8 (#3231, lot X50) — la relation personne↔entreprise DÉCLARÉE voyage
    // jusqu'à Laura ; absente = aucune clé (une absence ne fait pas de ligne).
    it('relaie la relation déclarée du contact, sans clé quand elle ne l’est pas', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: [
          { contact_id: 'c-1', position: 1, group: 'decision_maker' },
          { contact_id: 'c-2', position: 2, group: 'influencer' },
        ],
        total: 2,
      })
      contacts.findByAccountForHttp.mockResolvedValue([
        {
          id: 'c-1',
          full_name: 'Claire Dubois',
          title: 'DSI',
          email: null,
          phone: null,
          linkedin_url: null,
          declared_person_company_relation: 'employee_former',
        },
        {
          id: 'c-2',
          full_name: 'Marc Petit',
          title: 'RSSI',
          email: null,
          phone: null,
          linkedin_url: null,
          declared_person_company_relation: null,
        },
      ])
      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        contacts: Array<Record<string, unknown>>
      }
      expect(out.contacts[0]).toMatchObject({ declared_person_company_relation: 'employee_former' })
      expect(out.contacts[1]).not.toHaveProperty('declared_person_company_relation')
    })

    it('ne dépasse jamais cinq propositions — une bulle se lit, elle ne se dépouille pas', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({
        ranked: Array.from({ length: 8 }, (_, i) => ({ contact_id: `c-${i}`, position: i + 1, group: 'other' })),
        total: 8,
      })
      contacts.findByAccountForHttp.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({
          id: `c-${i}`,
          full_name: `Contact ${i}`,
          title: null,
          email: 'x@acme.fr',
          phone: null,
          linkedin_url: null,
        })),
      )

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        contacts: unknown[]
        truncated: boolean
      }

      expect(out.contacts).toHaveLength(5)
      expect(out.truncated).toBe(true)
    })

    // #2791 (recette écran 28/09/2026, ROCHE/Pharma) — Laura appelle CET outil
    // pour « le comité d'achat de X », et l'IA a besoin du secteur BRUT du
    // compte pour nommer les sièges propres au secteur (`sector_committee_seats`,
    // apps/ia). Sans lui, rien à côté des contacts trouvés ne peut être nommé.
    it('relaie le secteur BRUT du compte (`account_sector`), pour que l’IA nomme les sièges du secteur', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: 'Industrie pharmaceutique' } })
      contacts.rankForAccount.mockResolvedValue({ ranked: [], total: 0 })
      contacts.findByAccountForHttp.mockResolvedValue([])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        account_sector: string | null
      }

      expect(accounts.findOne).toHaveBeenCalledWith('a-1', 'u-1')
      expect(out.account_sector).toBe('Industrie pharmaceutique')
    })

    // #3243 (recette prod 03/10, CAPGEMINI, 3e fois) — le challenge « partenaire potentiel »
    // n'était évalué que sur un dossier OUVERT : demandé depuis /chat sans fiche ouverte,
    // le prompt ne portait aucun compte. Le pont relaie donc le profil d'acteur du compte.
    it('relaie le profil du compte (nom, NAF, type d’acteur) pour que le challenge se joue hors fiche (#3243)', async () => {
      accounts.findOne.mockResolvedValue({
        type: 'success',
        output: { sector: 'Conseil', company_name: 'CAPGEMINI', naf_code: '6202A', actor_type: null },
      })
      contacts.rankForAccount.mockResolvedValue({ ranked: [], total: 0 })
      contacts.findByAccountForHttp.mockResolvedValue([])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        account_profile: { company_name: string | null; naf_code: string | null; actor_type: string | null } | null
      }

      expect(out.account_profile).toEqual({ company_name: 'CAPGEMINI', naf_code: '6202A', actor_type: null })
    })

    it('⚠️ SAIT DIRE NON — un compte introuvable relaie `account_profile: null`, jamais un profil deviné (#3243)', async () => {
      accounts.findOne.mockResolvedValue({ type: 'failure', problem: { code: 'not_found', message: 'nope' } })
      contacts.rankForAccount.mockResolvedValue({ ranked: [], total: 0 })
      contacts.findByAccountForHttp.mockResolvedValue([])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        account_profile: unknown
      }

      expect(out.account_profile).toBeNull()
    })

    it('un compte sans secteur résolu relaie `null` — jamais un secteur deviné', async () => {
      accounts.findOne.mockResolvedValue({ type: 'success', output: { sector: null } })
      contacts.rankForAccount.mockResolvedValue({ ranked: [], total: 0 })
      contacts.findByAccountForHttp.mockResolvedValue([])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        account_sector: string | null
      }

      expect(out.account_sector).toBeNull()
    })

    it('un compte introuvable (Result en échec) relaie `null`, jamais une panne', async () => {
      accounts.findOne.mockResolvedValue({ type: 'failure', problem: { code: 'not_found', message: 'nope' } })
      contacts.rankForAccount.mockResolvedValue({ ranked: [], total: 0 })
      contacts.findByAccountForHttp.mockResolvedValue([])

      const out = (await controller.accountContacts({ userId: 'u-1', accountId: 'a-1' } as never)) as {
        account_sector: string | null
      }

      expect(out.account_sector).toBeNull()
    })
  })

  describe('le pipeline partenaire', () => {
    it('relaie la fiche COMPLÈTE — le score à cinq axes compris', async () => {
      partnerPipeline.list.mockResolvedValue([
        {
          id: 'p-1',
          siren: null,
          name: 'Astréa Conseil',
          stage: 'flux_actif',
          roles: ['client'],
          contactName: null,
          notes: null,
          needsReceived90d: 7,
          needsGiven90d: 2,
          placementsActive: 3,
          placementsTotal: 6,
          lastActivityAt: '2026-08-25T00:00:00.000Z',
          score: { score: null, axes: [], reason: 'moins de trois placements' },
        },
      ])
      const out = await controller.partnerPipeline({ userId: 'u-1' } as never)
      expect(partnerPipeline.list).toHaveBeenCalledWith('w-1')
      // Un score qui n'existe pas encore reste `null` AVEC sa raison — il ne
      // devient pas zéro parce qu'il n'y a que six placements.
      expect(out.partners[0]?.score).toEqual(expect.objectContaining({ score: null }))
    })
  })

  describe('la dynamique d’un territoire', () => {
    it('pose le score de débordement sur les ESN, sans le recalculer ailleurs', async () => {
      esnDirectory.ensureSeeded.mockResolvedValue(undefined)
      esnDirectory.knownNames.mockResolvedValue(['astrea conseil'])
      esnDirectory.factsByName.mockResolvedValue(
        new Map([['astrea conseil', { riskFlag: 'aucun', openToSubcontracting: 'inconnu', hiringBaseline: null }]]),
      )
      ia.territoryOverview.mockResolvedValue({
        department: '31',
        sinceDays: 90,
        market: { state: 'ready', offers: 120, hiringAccounts: [{ name: 'Latécoère', offers: 9 }] },
        competition: { state: 'ready', esnPresent: 40, density: null },
        overflow: { state: 'ready', esn: [{ name: 'Astréa Conseil', offers: 34 }] },
        accessible: { state: 'ready', openTenders: 3 },
        unknowns: ['Les panels fournisseurs privés.'],
      })
      const out = await controller.territoryOverview({ userId: 'u-1', department: '31' } as never)
      // Le score arrive du MÊME calcul que l'écran — `territory-overflow.ts`.
      expect(out.overflow.esn?.[0]?.score).toBeDefined()
      // Non mesuré n'est pas mesuré à zéro : sans historique de recrutement,
      // aucun axe n'est mesurable et le score reste `null`.
      expect(out.overflow.esn?.[0]?.score?.score).toBeNull()
      expect(out.overflow.esn?.[0]?.score?.notCollected.length).toBeGreaterThan(0)
      // Les entreprises qui recrutent — c'est `search_territory_accounts` du
      // §16, dans la même réponse.
      expect(out.market.hiringAccounts).toEqual([{ name: 'Latécoère', offers: 9 }])
      // La densité non calculable reste `null`, jamais un ratio approché.
      expect(out.competition.density).toBeNull()
    })

    it('applique la fenêtre par défaut de 90 jours, comme l’écran', async () => {
      esnDirectory.ensureSeeded.mockResolvedValue(undefined)
      esnDirectory.knownNames.mockResolvedValue([])
      ia.territoryOverview.mockResolvedValue({
        department: '31',
        sinceDays: 90,
        market: { state: 'unavailable', reason: 'source muette' },
        competition: { state: 'unavailable', reason: 'source muette' },
        overflow: { state: 'unavailable', reason: 'source muette' },
        accessible: { state: 'unavailable', reason: 'source muette' },
        unknowns: ['Tout.'],
      })
      const out = await controller.territoryOverview({ userId: 'u-1', department: '31' } as never)
      expect(ia.territoryOverview).toHaveBeenCalledWith(
        expect.objectContaining({ department: '31', sinceDays: 90 }),
        expect.anything(),
      )
      // Un bloc muet GARDE son état et sa raison : il ne devient pas une liste
      // vide, qui se lirait « il n'y a rien dans ce département ».
      expect(out.overflow.state).toBe('unavailable')
      expect(out.overflow.reason).toBe('source muette')
    })

    it('laisse 45 s à l’IA et ne rejoue pas : l’appelant attend plus que l’appelé × ses essais', async () => {
      esnDirectory.ensureSeeded.mockResolvedValue(undefined)
      esnDirectory.knownNames.mockResolvedValue([])
      ia.territoryOverview.mockResolvedValue({
        department: '67',
        sinceDays: 90,
        market: { state: 'unavailable', reason: 'x' },
        competition: { state: 'unavailable', reason: 'x' },
        overflow: { state: 'unavailable', reason: 'x' },
        accessible: { state: 'unavailable', reason: 'x' },
        unknowns: [],
      })
      await controller.territoryOverview({ userId: 'u-1', department: '67' } as never)
      expect(ia.territoryOverview).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 45_000, maxAttempts: 1 })
    })
  })

  describe('le réseau dormant', () => {
    it('demande SIX mois par défaut et ne fait sortir aucune coordonnée', async () => {
      contacts.findAllForUser.mockResolvedValue({
        data: [
          {
            id: 'c-1',
            account_id: 'a-1',
            full_name: 'Claire Meunier',
            title: 'DSI',
            company_name: 'ACME',
            decision_role: 'decision_maker',
            why_contact: 'a piloté la refonte',
            email: 'claire@example.com',
            phone: '+33600000000',
            linkedin_url: null,
          },
        ],
        pagination: { currentPage: 1, size: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
      })
      const out = await controller.dormantContacts({ userId: 'u-1' } as never)
      expect(contacts.findAllForUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ dormantMonths: 6 }))
      const serialised = JSON.stringify(out)
      // Le CANAL, jamais l'adresse : le modèle propose, le clic ouvre le
      // brouillon. Une adresse ici finirait recopiée dans une réponse.
      expect(serialised).not.toContain('claire@example.com')
      expect(serialised).not.toContain('+33600000000')
      expect(out.contacts[0]?.has_email).toBe(true)
      // La CAPACITÉ, pas l'éditeur — jusque dans le nom du champ : le modèle
      // reformule ce qu'il lit, et il lisait « has_linkedin » (GA-69).
      expect(out.contacts[0]?.has_network_profile).toBe(false)
      expect(JSON.stringify(out)).not.toContain('linkedin')
      // L'identifiant reste, lui : c'est ce qui permet d'enchaîner sur une
      // préparation de message sans redemander qui c'est.
      expect(out.contacts[0]?.contact_id).toBe('c-1')
    })

    it('honore le nombre de mois demandé', async () => {
      contacts.findAllForUser.mockResolvedValue({
        data: [],
        pagination: { currentPage: 1, size: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false },
      })
      const out = await controller.dormantContacts({ userId: 'u-1', months: 24 } as never)
      expect(contacts.findAllForUser).toHaveBeenCalledWith('u-1', expect.objectContaining({ dormantMonths: 24 }))
      expect(out.months).toBe(24)
      // Une liste VIDE est une réponse : « personne ne dort depuis 24 mois ».
      // C'est l'absence de réponse qui se dit autrement, et elle se dit côté
      // outil, quand le pont n'est pas joignable.
      expect(out.total).toBe(0)
    })

    /**
     * #2799 (épopée) / #2374.16 — le score n'est JAMAIS nu : les neuf axes
     * voyagent nommés, même quand la plupart ne sont pas évaluables (aucun
     * signal supplémentaire posé par défaut dans ce test).
     */
    it('#2374.16 — chaque contact porte les NEUF axes nommés (évalués ou non)', async () => {
      contacts.findAllForUser.mockResolvedValue({
        data: [
          {
            id: 'c-1',
            account_id: 'a-1',
            full_name: 'Claire Meunier',
            title: 'DSI',
            company_name: 'ACME',
            decision_role: 'technical',
            why_contact: 'a piloté la refonte',
            email: 'claire@example.com',
            phone: null,
            linkedin_url: 'https://linkedin.com/in/x',
          },
        ],
        pagination: { currentPage: 1, size: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
      })
      const out = await controller.dormantContacts({ userId: 'u-1' } as never)
      const score = out.contacts[0]?.reactivation_score
      expect(score?.axes).toHaveLength(9)
      expect(score?.axes.map((a: { key: string }) => a.key).sort()).toEqual(
        [
          'account_fit',
          'owner',
          'reachability',
          'reason',
          'recency',
          'relationship_quality',
          'role',
          'signal',
          'subject',
        ].sort(),
      )
      // Chaque axe a un libellé — jamais une clé technique nue à l'écran/au modèle.
      expect(score?.axes.every((a: { label: string }) => typeof a.label === 'string' && a.label.length > 0)).toBe(true)
      // Sans signal ni historique posés par `dormantReactivationSignals`
      // (mock par défaut : Map vide), plusieurs axes restent NON évaluables —
      // nommés, mais hors du dénominateur.
      const evaluated = score?.axes.filter((a: { evaluated: boolean }) => a.evaluated)
      expect(evaluated?.length).toBeLessThan(9)
      expect(score?.axes.some((a: { evaluated: boolean }) => !a.evaluated)).toBe(true)
    })

    /**
     * #2799 — `DORMANT_REACTIVATION_AXIS_LABELS_EN` existait déjà et était
     * testé côté contrat, mais aucun appelant ne passait la langue : ce
     * contrôleur renvoyait toujours les libellés FR à Laura, même pour un
     * utilisateur anglophone. `dto.locale` suit le même contrat que
     * `CopilotAnalysisPlanDto` (défaut `'fr'`, jamais un troisième état).
     */
    it("#2799 — locale 'en' renvoie les libellés d'axes en anglais", async () => {
      contacts.findAllForUser.mockResolvedValue({
        data: [
          {
            id: 'c-1',
            account_id: 'a-1',
            full_name: 'Claire Meunier',
            title: 'DSI',
            company_name: 'ACME',
            decision_role: 'technical',
            why_contact: 'a piloté la refonte',
            email: 'claire@example.com',
            phone: null,
            linkedin_url: null,
          },
        ],
        pagination: { currentPage: 1, size: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
      })
      const out = await controller.dormantContacts({ userId: 'u-1', locale: 'en' } as never)
      const score = out.contacts[0]?.reactivation_score
      const recency = score?.axes.find((a: { key: string }) => a.key === 'recency')
      expect(recency?.label).toBe('Length of silence')
      expect(JSON.stringify(out)).not.toContain('Ancienneté du silence')
    })

    /**
     * #2374.17 — LE cœur de l'épopée : un contact plus ANCIEN mais sans aucun
     * autre signal ne doit JAMAIS devancer un contact moins ancien mais riche
     * en signaux (compte, porteur, poste, raison, historique).
     */
    it('#2374.17 — un contact riche en signaux devance un contact simplement plus ANCIEN', async () => {
      contacts.findAllForUser.mockResolvedValue({
        data: [
          {
            id: 'old-and-bare',
            account_id: 'a-1',
            full_name: 'Contact ancien et nu',
            title: null,
            company_name: 'ACME',
            decision_role: null,
            why_contact: null,
            email: 'ancien@example.com',
            phone: null,
            linkedin_url: null,
          },
          {
            id: 'recent-and-rich',
            account_id: 'a-2',
            full_name: 'Contact récent et riche',
            title: 'DSI',
            company_name: 'Autre SA',
            decision_role: 'economic',
            why_contact: 'a signé le dernier contrat',
            email: 'recent@example.com',
            phone: null,
            linkedin_url: 'https://linkedin.com/in/y',
          },
        ],
        pagination: { currentPage: 1, size: 20, totalItems: 2, totalPages: 1, hasNext: false, hasPrev: false },
      })
      contacts.dormantReactivationSignals.mockResolvedValue(
        new Map([
          [
            'old-and-bare',
            {
              signals: null,
              accountPriorityScore: null,
              accountAssignedTo: null,
              pastActivityCount: null,
              lastActivitySubject: null,
              monthsSinceLastActivity: 48,
            },
          ],
          [
            'recent-and-rich',
            {
              signals: [{ label: 'A changé de poste' }],
              accountPriorityScore: 22,
              accountAssignedTo: 'member-1',
              pastActivityCount: 6,
              lastActivitySubject: 'Renouvellement',
              monthsSinceLastActivity: 7,
            },
          ],
        ]),
      )
      const out = await controller.dormantContacts({ userId: 'u-1' } as never)
      expect(out.contacts.map((c: { contact_id: string }) => c.contact_id)).toEqual(['recent-and-rich', 'old-and-bare'])
    })
  })

  describe('Laura compte avant de proposer (15/09/2026) — `POST contacts/count`', () => {
    it('relaie le filtre du contrat public à `countForUser` et rend le compte', async () => {
      contacts.countForUser.mockResolvedValueOnce(12)

      const out = await controller.contactsCount({
        userId: 'u-1',
        company: 'SNCF',
        role: 'decision_maker',
      } as never)

      expect(contacts.countForUser).toHaveBeenCalledWith('u-1', { company: 'SNCF', role: 'decision_maker' })
      expect(out).toEqual({ count: 12 })
    })

    it("rend 0 tel quel — c'est une mesure, pas une panne", async () => {
      contacts.countForUser.mockResolvedValueOnce(0)

      const out = await controller.contactsCount({ userId: 'u-1' } as never)

      expect(out).toEqual({ count: 0 })
    })

    it('NE RATTRAPE PAS une erreur du service : elle remonte au pont, jamais un `count: 0`', async () => {
      contacts.countForUser.mockRejectedValueOnce(new Error('connexion perdue'))

      await expect(controller.contactsCount({ userId: 'u-1' } as never)).rejects.toThrow('connexion perdue')
    })
  })

  describe('les contacts qui ont peut-être changé de poste (14e outil de territoire)', () => {
    const move = (over: Partial<Record<string, unknown>> = {}) => ({
      full_name: 'Camille Roux',
      company_name: 'Client Ordinaire SA',
      new_employer: 'Nouvel Employeur SAS',
      known_since: '2024-03-01T00:00:00.000Z',
      new_account_id: null,
      ...over,
    })

    it('fusionne comptes et ESN — même calcul, même dédoublonnage que la routine', async () => {
      const accountMove = move()
      const esnMove = move({
        full_name: 'Sacha Martin',
        company_name: 'SII',
        new_employer: 'Sopra Steria',
        new_account_id: 'acc-9',
      })
      accountQuery.mockImplementation((sql: string) =>
        Promise.resolve(String(sql).includes('esn_directory') ? [esnMove] : [accountMove]),
      )
      const out = await controller.jobChanges({ userId: 'u-1' } as never)
      // Les DEUX requêtes partent, sur l'espace résolu — jamais un autre.
      expect(accountQuery).toHaveBeenCalledWith(expect.stringContaining('FROM contacts c'), ['w-1'])
      expect(accountQuery).toHaveBeenCalledWith(expect.stringContaining('esn_directory'), ['w-1'])
      expect(out.presumed_moves).toHaveLength(2)
      expect(out.presumed_moves).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            contact_name: 'Camille Roux',
            tracked_account_name: 'Client Ordinaire SA',
            presumed_new_employer: 'Nouvel Employeur SAS',
          }),
          expect.objectContaining({ contact_name: 'Sacha Martin', new_employer_account_id: 'acc-9' }),
        ]),
      )
    })

    it('ne présente JAMAIS le signal comme un fait établi — la réponse porte sa base', async () => {
      accountQuery.mockResolvedValue([])
      const out = await controller.jobChanges({ userId: 'u-1' } as never)
      expect(out.presumed_moves).toEqual([])
      expect(out.basis.toLowerCase()).toContain('libell')
      expect(out.basis.toLowerCase()).toContain('jamais une confirmation')
    })

    it('LE SIGNAL ESN GAGNE, comme la routine — jamais deux signaux pour une même personne', async () => {
      const accountMove = move()
      const sameContactViaEsn = move({ known_since: '2024-05-01T00:00:00.000Z', new_account_id: 'acc-9' })
      accountQuery.mockImplementation((sql: string) =>
        Promise.resolve(String(sql).includes('esn_directory') ? [sameContactViaEsn] : [accountMove]),
      )
      const out = await controller.jobChanges({ userId: 'u-1' } as never)
      expect(out.presumed_moves).toHaveLength(1)
      expect(out.presumed_moves[0]?.new_employer_account_id).toBe('acc-9')
    })

    it('une panne SQL remonte comme une ERREUR — jamais comme une liste vide qui se lirait « personne n’a bougé »', async () => {
      accountQuery.mockRejectedValue(new Error('connexion perdue'))
      await expect(controller.jobChanges({ userId: 'u-1' } as never)).rejects.toThrow('connexion perdue')
    })

    /**
     * GA-324 — LOT 17 : `get_job_changes` dit au modèle « les contacts DU
     * PORTEFEUILLE », mais jusqu'ici `jobChanges` n'a jamais pris d'identifiant
     * utilisateur et agrégeait TOUT l'espace. Même mécanisme que
     * `chainBlockers` applique déjà (LOT 15, D5, `portfolioScopeFor`) :
     *  · visibilité `open` (le défaut assumé du produit) → rien ne change,
     *    tout l'espace ressort, EXACTEMENT comme avant ;
     *  · visibilité `restricted` et un rôle sans `team:manage` → seuls les
     *    contacts dont le compte SUIVI est porté par CET utilisateur (plus les
     *    comptes non attribués) ressortent.
     *
     * Ces tests LISENT vraiment le contenu de `presumed_moves` (pas seulement
     * les arguments d'appel de `accountQuery`) : un contact porté par un AUTRE
     * commercial doit disparaître de la réponse, pas seulement d'un paramètre.
     */
    describe('« les contacts du portefeuille » — le cloisonnement de portefeuille (D5)', () => {
      const mine = move({ full_name: 'Camille Roux', company_name: 'Client à moi SA', account_id: 'acc-mine' })
      const colleague = move({
        full_name: 'Julien Petit',
        company_name: 'Client du collègue SA',
        new_employer: 'Ailleurs SAS',
        account_id: 'acc-colleague',
      })

      /** Le mock distingue les TROIS requêtes par leur TEXTE, comme en
       *  production : les deux requêtes de mouvement (comptes / ESN), et la
       *  requête de PORTEFEUILLE (`ownedAccountIdsSql`) qui ne connaît ni
       *  `contacts` ni `esn_directory`. */
      const withOwnership = (ownedAccountIds: string[]) => {
        accountQuery.mockImplementation((sql: string) => {
          const text = String(sql)
          if (text.includes('esn_directory')) return Promise.resolve([])
          if (text.includes('FROM contacts c')) return Promise.resolve([mine, colleague])
          return Promise.resolve(ownedAccountIds.map(id => ({ id })))
        })
      }

      it('visibilité OUVERTE (le défaut) : les deux contacts ressortent — comportement d’aujourd’hui, inchangé', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('open')
        withOwnership(['acc-mine'])
        const out = await controller.jobChanges({ userId: 'u-1' } as never)
        expect(out.presumed_moves.map(m => m.contact_name)).toEqual(
          expect.arrayContaining(['Camille Roux', 'Julien Petit']),
        )
        expect(out.presumed_moves).toHaveLength(2)
      })

      it('visibilité RESTREINTE, rôle SANS team:manage : le contact d’un AUTRE commercial ne ressort PAS', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        withOwnership(['acc-mine'])
        const out = await controller.jobChanges({ userId: 'u-1' } as never)
        // LIT vraiment quelque chose : un seul contact, et c'est LE MIEN — pas
        // juste « la méthode a été appelée avec un paramètre de plus ».
        expect(out.presumed_moves).toHaveLength(1)
        expect(out.presumed_moves[0]?.contact_name).toBe('Camille Roux')
      })

      it('visibilité RESTREINTE mais AUCUN compte à moi : la liste se vide, elle ne garde pas tout l’espace', async () => {
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        withOwnership([])
        const out = await controller.jobChanges({ userId: 'u-1' } as never)
        expect(out.presumed_moves).toEqual([])
      })

      it('visibilité RESTREINTE mais rôle AVEC team:manage : toujours l’espace entier', async () => {
        // Un responsable qui ne verrait plus le portefeuille de son équipe ne
        // pourrait ni l'attribuer ni le rééquilibrer — même raison que
        // `portfolioScopeFor` documente pour `GET /accounts` et que
        // `chainBlockers` applique déjà.
        workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
        workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
        withOwnership(['acc-mine'])
        const out = await controller.jobChanges({ userId: 'u-1' } as never)
        expect(out.presumed_moves).toHaveLength(2)
      })
    })
  })

  /**
   * LOT 3 (perf), Défaut A — huit outils de lecture sans aucune borne de
   * sortie. `chains.blockers` acceptait déjà un `limit` (défaut interne 5,
   * jamais exposé ici) : ce qui manquait était le moyen de savoir si le
   * catalogue réel de blocages dépasse cette borne. La technique retenue
   * — demander UN de plus que ce qu'on montre, puis couper et dire si la
   * ligne surnuméraire est arrivée — ne change AUCUN comportement pour un
   * espace dont les blocages tiennent déjà dans la borne.
   */
  describe('les blocages de parcours — bornés, avec un drapeau de troncature honnête', () => {
    it('demande UN de plus que la borne affichée, coupe à la borne, et le DIT', async () => {
      chains.blockers.mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ chainKey: `k${i}` })) as never)
      const out = await controller.chainBlockers({ userId: 'u-1' } as never)
      // La borne de 5 catégories (`BLOCKER_LIMIT`) ne bouge pas : on demande
      // juste un témoin de plus pour détecter la coupe. Le 3e argument est le
      // scope de portefeuille (arbitrage A, LOT 15) : `null` en visibilité
      // `open` (le défaut du double posé dans `beforeEach`).
      expect(chains.blockers).toHaveBeenCalledWith('w-1', 6, null)
      expect(out.blockers).toHaveLength(5)
      expect(out.truncated).toBe(true)
    })

    it('ne prétend JAMAIS une troncature qui n’a pas eu lieu', async () => {
      chains.blockers.mockResolvedValue([{ chainKey: 'k0' }, { chainKey: 'k1' }] as never)
      const out = await controller.chainBlockers({ userId: 'u-1' } as never)
      expect(out.blockers).toHaveLength(2)
      expect(out.truncated).toBe(false)
    })

    it('exactement la borne, sans rien de plus : pas de troncature devinée', async () => {
      chains.blockers.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ chainKey: `k${i}` })) as never)
      const out = await controller.chainBlockers({ userId: 'u-1' } as never)
      expect(out.blockers).toHaveLength(5)
      expect(out.truncated).toBe(false)
    })
  })

  /**
   * #3264.14 (épopée #3264, lot R11 29/09) — la collision de sollicitation,
   * réduite à un contact, pour `apps/ia` (`prepare_message_for_contact`).
   */
  describe('contradictedMethodRules (#3289, #3264.41)', () => {
    it("rend les règles contredites de L'ESPACE résolu côté serveur", async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      methodRuleOutcomes.contradictedRuleIds.mockResolvedValue(['r1'])
      const out = await controller.contradictedMethodRules({ userId: 'u-1' } as never)
      expect(methodRuleOutcomes.contradictedRuleIds).toHaveBeenCalledWith('w-1')
      expect(out).toEqual({ ruleIds: ['r1'] })
    })

    it('une lecture impossible est une ERREUR nommée, jamais une liste vide', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      methodRuleOutcomes.contradictedRuleIds.mockResolvedValue(null)
      expect(await controller.contradictedMethodRules({ userId: 'u-1' } as never)).toEqual({
        error: 'method_rule_outcomes_unreadable',
      })
    })
  })

  describe('outreachSendTiming (#3289, #3264.31/.32/.33)', () => {
    it("lit le timing de L'ESPACE résolu côté serveur, filtre persona transmis", async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      sendTiming.forWorkspace.mockResolvedValue({ seniority: 'director', channels: [] })

      const out = await controller.outreachSendTiming({ userId: 'u-1', seniority: 'director' } as never)

      expect(sendTiming.forWorkspace).toHaveBeenCalledWith('w-1', 'director')
      expect(out).toEqual({ seniority: 'director', channels: [] })
    })

    it('une lecture impossible est une ERREUR nommée, jamais « aucun créneau »', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      sendTiming.forWorkspace.mockResolvedValue(null)

      const out = await controller.outreachSendTiming({ userId: 'u-1' } as never)

      expect(out).toEqual({ error: 'send_timing_unreadable' })
    })
  })

  describe('contactPreflight (#3219, #190.2 côté contact)', () => {
    it('délègue au MÊME contrôle que l’écran, contradictions tranchées comprises', async () => {
      const preflight = { contactId: 'c-1', action: 'export_crm', status: 'no_difference', items: [], unknowns: [] }
      ;(contacts as unknown as { preflight: jest.Mock }).preflight = jest.fn(
        async (
          _id: string,
          _userId: string,
          options: { readConflicts: (w: string, c: string) => Promise<unknown> },
        ) => {
          await options.readConflicts('w-1', 'c-1')
          return { type: 'success', output: preflight }
        },
      )
      conflicts.openConflicts.mockResolvedValue([])

      const out = await controller.contactPreflight({ userId: 'u-1', contactId: 'c-1', action: 'export_crm' } as never)

      expect(out).toEqual(preflight)
      expect(conflicts.openConflicts).toHaveBeenCalledWith('w-1', 'contact', 'c-1', { includeSettled: true })
    })

    it('un contact étranger à l’espace rend `contact_not_found`, jamais une exception brute', async () => {
      ;(contacts as unknown as { preflight: jest.Mock }).preflight = jest
        .fn()
        .mockResolvedValue({ type: 'failure', problem: { code: 'not_found', message: 'x' } })
      const out = await controller.contactPreflight({ userId: 'u-1', contactId: 'c-x' } as never)
      expect(out).toEqual({ error: 'contact_not_found' })
    })
  })

  describe('outreachContactCollision (#3264.14)', () => {
    it('rend `collision: true` et le nombre de séquences quand ce contact est en collision', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      pipeline.contactSolicitationCollisionFor.mockResolvedValue({
        contactId: 'c-1',
        contactName: 'Alex Martin',
        sequenceIds: ['seq-1', 'seq-2'],
      })

      const out = await controller.outreachContactCollision({ userId: 'u-1', contactId: 'c-1' } as never)

      expect(pipeline.contactSolicitationCollisionFor).toHaveBeenCalledWith('w-1', 'c-1')
      expect(out).toEqual({ collision: true, sequenceCount: 2 })
    })

    it('rend `collision: false` sans collision — jamais le nom du collègue', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      pipeline.contactSolicitationCollisionFor.mockResolvedValue(null)

      const out = await controller.outreachContactCollision({ userId: 'u-1', contactId: 'c-1' } as never)

      expect(out).toEqual({ collision: false, sequenceCount: 0 })
    })
  })

  /**
   * LOT 15, ARBITRAGE A — le pont demande le MÊME cloisonnement de
   * portefeuille (D5) que `GET /accounts`, pas une règle inventée pour lui.
   */
  describe('« mes dossiers » — le cloisonnement de portefeuille (D5)', () => {
    it('visibilité OUVERTE (le défaut) : AUCUN périmètre demandé — comportement d’aujourd’hui', async () => {
      chains.blockers.mockResolvedValue([])
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('open')
      await controller.chainBlockers({ userId: 'u-1' } as never)
      expect(chains.blockers).toHaveBeenCalledWith('w-1', expect.any(Number), null)
    })

    it('visibilité RESTREINTE, rôle SANS `team:manage` : seulement MON portefeuille', async () => {
      chains.blockers.mockResolvedValue([])
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'sales' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      await controller.chainBlockers({ userId: 'u-1' } as never)
      expect(chains.blockers).toHaveBeenCalledWith('w-1', expect.any(Number), {
        ownerId: 'u-1',
        includeUnassigned: true,
      })
    })

    it('visibilité RESTREINTE mais rôle AVEC `team:manage` : toujours l’espace entier', async () => {
      // Un responsable qui ne verrait plus le portefeuille de son équipe ne
      // pourrait ni l'attribuer ni le rééquilibrer — même raison que
      // `portfolioScopeFor` documente pour `GET /accounts`.
      chains.blockers.mockResolvedValue([])
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
      workspaceContext.portfolioVisibilityOf.mockResolvedValue('restricted')
      await controller.chainBlockers({ userId: 'u-1' } as never)
      expect(chains.blockers).toHaveBeenCalledWith('w-1', expect.any(Number), null)
    })
  })

  /**
   * LOT 3 (perf), Défaut A — même défaut, même technique : `accountsAwaitingAction`
   * acceptait déjà un `limit` (défaut interne 20) sans jamais dire si le
   * compte réel le dépasse.
   */
  describe('les comptes qui attendent une décision — bornés, avec un drapeau de troncature honnête', () => {
    const account = (i: number) => ({
      id: `a${i}`,
      companyName: `Compte ${i}`,
      reason: 'awaiting_decision' as const,
      lastActionAt: null,
    })

    it('demande UN de plus que la borne affichée, coupe à la borne, et le DIT', async () => {
      accounts.accountsAwaitingAction.mockResolvedValue(Array.from({ length: 21 }, (_, i) => account(i)) as never)
      const out = await controller.accountsToAct({ userId: 'u-1' } as never)
      // `staleDays` (30) reste le défaut du service — seule la marge de
      // détection change.
      expect(accounts.accountsAwaitingAction).toHaveBeenCalledWith('w-1', 30, 21)
      expect(out.accounts).toHaveLength(20)
      expect(out.truncated).toBe(true)
    })

    it('ne prétend JAMAIS une troncature qui n’a pas eu lieu', async () => {
      accounts.accountsAwaitingAction.mockResolvedValue([account(0)] as never)
      const out = await controller.accountsToAct({ userId: 'u-1' } as never)
      expect(out.accounts).toHaveLength(1)
      expect(out.truncated).toBe(false)
    })
  })

  /**
   * BEL-SC-239 — le plan de proposition, dans la conversation. Une LECTURE :
   * `proposalOutline` ne fait que relayer `ProposalsService.buildForProject`,
   * le MÊME assembleur que l'écran `/propositions`.
   */
  describe('proposalOutline', () => {
    it('résout l’espace de l’appelant et relaie le plan tel quel', async () => {
      const view = { project: { id: 'proj-1', label: 'x', accountId: 'acc-1', accountName: 'Contoso' }, outline: {} }
      proposals.buildForProject.mockResolvedValue(view)

      const out = await controller.proposalOutline({ userId: 'u-1', projectId: 'proj-1' } as never)

      expect(proposals.buildForProject).toHaveBeenCalledWith('proj-1', 'w-1')
      expect(out).toEqual(view)
    })

    it('un besoin hors espace se lit comme une absence, jamais une exception', async () => {
      proposals.buildForProject.mockResolvedValue(null)
      const out = await controller.proposalOutline({ userId: 'u-1', projectId: 'proj-1' } as never)
      expect(out).toEqual({ error: 'not_found' })
    })
  })

  /** #3209 (LAU-FINAL-215) — la répartition du portefeuille en quatre catégories. */
  describe('accountsPortfolioPriorities', () => {
    it('résout l’espace actif et rend la répartition telle quelle', async () => {
      const priorities = { now: [], toVerify: [], toWatch: [], notNow: [], capacityCap: 8 }
      const effortBudget = {
        weeklyAvailableHours: null,
        callsLast7Days: 0,
        paidAnalysesLast7Days: 0,
        workableAccounts: 0,
        contactsVolume: 0,
      }
      accounts.portfolioPriorities.mockResolvedValue(priorities as never)
      accounts.effortBudget.mockResolvedValue(effortBudget as never)
      const out = await controller.accountsPortfolioPriorities({ userId: 'u-1' } as never)
      expect(accounts.portfolioPriorities).toHaveBeenCalledWith('w-1', 'u-1')
      expect(out).toEqual({ ...priorities, effortBudget })
    })

    // #3245 (reste de #3209.3) — le budget voyage sur LA MÊME réponse, jamais
    // un second appel que le modèle devrait recomposer, et jamais une
    // deuxième lecture du portefeuille déjà lu.
    it('#3245 — passe la répartition déjà lue à effortBudget, jamais une deuxième lecture', async () => {
      const priorities = { now: [], toVerify: [], toWatch: [], notNow: [], capacityCap: 8 }
      accounts.portfolioPriorities.mockResolvedValue(priorities as never)
      accounts.effortBudget.mockResolvedValue({} as never)
      await controller.accountsPortfolioPriorities({ userId: 'u-1' } as never)
      expect(accounts.effortBudget).toHaveBeenCalledWith('w-1', priorities)
    })
  })

  /**
   * #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
   * le modèle d'équipe minimal lu par `get_account_preflight` (apps/ia).
   */
  describe('commercialLoadCapacity', () => {
    it('résout l’espace actif et rend la capacité telle quelle', async () => {
      const capacity = {
        consultant: { user_id: 'u-1', name: 'Sarah Martin' },
        maxTrackedAccounts: 40,
        trackedAccountsCount: 12,
        weeklyAvailableHours: 32,
      }
      accounts.commercialLoadCapacity.mockResolvedValue(capacity as never)
      const out = await controller.commercialLoadCapacity({ userId: 'u-1' } as never)
      expect(accounts.commercialLoadCapacity).toHaveBeenCalledWith('w-1', 'u-1')
      expect(out).toEqual(capacity)
    })
  })

  /** #3210 (LAU-FINAL-216) — les cas passés comparables à un compte. */
  describe('casesSimilar', () => {
    it('résout l’espace actif et rend les cas trouvés', async () => {
      const cases = { cases: [] }
      capitalisation.similarCases.mockResolvedValue(cases as never)
      const elsewhere = { basis: 'shared_anonymous_base', status: 'not_enough_shared_data' }
      sharedBase.caseOutcomesElsewhere.mockResolvedValue(elsewhere)
      const out = await controller.casesSimilar({ userId: 'u-1', accountId: 'acc-1' } as never)
      expect(capitalisation.similarCases).toHaveBeenCalledWith('w-1', 'acc-1')
      expect(out).toEqual({ ...cases, elsewhere })
    })

    it('P05.b — « dans la base commune » à côté des cas de l’espace, sur le même compte', async () => {
      capitalisation.similarCases.mockResolvedValue({ cases: [], caseMemory: [] } as never)
      const elsewhere = {
        basis: 'shared_anonymous_base',
        status: 'shared',
        lines: [{ dimension: 'sector', value: 'naf_62', won: 5, lost: 3, contributingWorkspaces: 4 }],
      }
      sharedBase.caseOutcomesElsewhere.mockResolvedValue(elsewhere)
      const out = await controller.casesSimilar({ userId: 'u-1', accountId: 'acc-1' } as never)
      expect(sharedBase.caseOutcomesElsewhere).toHaveBeenCalledWith('w-1', 'acc-1')
      expect(out).toMatchObject({ caseMemory: [], elsewhere })
    })

    it('P05.b — sait dire NON : une base commune en échec se NOMME', async () => {
      capitalisation.similarCases.mockResolvedValue({ cases: [] } as never)
      sharedBase.caseOutcomesElsewhere.mockRejectedValue(new Error('db down'))
      const out = await controller.casesSimilar({ userId: 'u-1', accountId: 'acc-1' } as never)
      expect(out).toMatchObject({ elsewhere: { error: 'shared_base_unavailable' } })
    })

    it('rend une erreur nommée quand le compte est introuvable dans cet espace', async () => {
      capitalisation.similarCases.mockResolvedValue(null as never)
      const out = await controller.casesSimilar({ userId: 'u-1', accountId: 'missing' } as never)
      expect(out).toEqual({ error: 'account_not_found' })
      expect(sharedBase.caseOutcomesElsewhere).not.toHaveBeenCalled()
    })
  })

  /** #4289.12 — le stade de relation par SIREN : le MÊME moteur que les cas similaires, borné à l'espace actif. */
  describe('relationStagesBySiren', () => {
    it('lit les stades dans l’espace ACTIF de l’appelant, jamais un autre', async () => {
      const bySiren = { '552081317': { relationStage: 'client_actif', source: 'missions' } }
      capitalisation.relationStagesBySiren.mockResolvedValue(bySiren as never)
      const out = await controller.relationStagesBySiren({ userId: 'u-1', sirens: ['552081317'] } as never)
      expect(capitalisation.relationStagesBySiren).toHaveBeenCalledWith('w-1', ['552081317'])
      expect(out).toEqual({ bySiren })
    })

    it('REFUS : le DTO rejette un SIREN mal formé (le contrat partagé, pas une seconde règle)', () => {
      const userId = '7f1c0c1e-3a43-4b8e-9d55-2d5b8f0a1c11'
      expect(CopilotRelationStagesBySirenDto.schema.safeParse({ userId, sirens: ['552081317'] }).success).toBe(true)
      expect(CopilotRelationStagesBySirenDto.schema.safeParse({ userId, sirens: ['abc'] }).success).toBe(false)
    })
  })

  /** #3278.3 — les canaux mesurés de l'espace. */
  describe('channelsPerformance', () => {
    it('résout l’espace actif et relaie la mesure TELLE QUELLE', async () => {
      const channels = [{ channel: 'call', sent: 20, replied: 8, sufficient: true, replyRate: 40 }]
      analysis.channelPerformanceFor.mockResolvedValue(channels)
      const out = await controller.channelsPerformance({ userId: 'u-1' } as never)
      expect(analysis.channelPerformanceFor).toHaveBeenCalledWith('w-1')
      expect(out).toEqual({ channels })
    })

    it('un espace sans aucun envoi mesurable rend une liste vide, jamais une ligne à zéro', async () => {
      analysis.channelPerformanceFor.mockResolvedValue([])
      expect(await controller.channelsPerformance({ userId: 'u-1' } as never)).toEqual({ channels: [] })
    })

    it('#3234 — by: role relaie la mesure par rôle TELLE QUELLE, sans toucher aux canaux', async () => {
      const roles = [{ role: 'technical', sent: 12, replied: 6, sufficient: true, replyRate: 50 }]
      analysis.rolePerformanceFor.mockResolvedValue(roles)
      const out = await controller.channelsPerformance({ userId: 'u-1', by: 'role' } as never)
      expect(analysis.rolePerformanceFor).toHaveBeenCalledWith('w-1')
      expect(out).toEqual({ roles })
    })

    it('#3211.11 — by: angle relaie la mesure par angle TELLE QUELLE', async () => {
      const angles = [{ angle: 'suite au poc', sent: 12, replied: 5, sufficient: true, replyRate: 42 }]
      analysis.anglePerformanceFor.mockResolvedValue(angles)
      const out = await controller.channelsPerformance({ userId: 'u-1', by: 'angle' } as never)
      expect(analysis.anglePerformanceFor).toHaveBeenCalledWith('w-1')
      expect(out).toEqual({ angles })
    })

    it('#3211.11 — by: cadence/route/priority relaie la recommandation par dimension TELLE QUELLE', async () => {
      const recommendation = {
        dimension: 'route',
        recommended: 'partenaire',
        reason: 'measured',
        values: [{ value: 'partenaire', positive: 11, judged: 12, sufficient: true }],
      }
      analysis.outcomeRecommendationFor.mockResolvedValue(recommendation)
      const elsewhere = { basis: 'shared_anonymous_base', status: 'not_enough_shared_data' }
      sharedBase.actionOutcomesElsewhere.mockResolvedValue(elsewhere)
      const out = await controller.channelsPerformance({ userId: 'u-1', by: 'route' } as never)
      expect(analysis.outcomeRecommendationFor).toHaveBeenCalledWith('w-1', 'route')
      expect(out).toEqual({ ...recommendation, elsewhere })
      expect(analysis.channelPerformanceFor).not.toHaveBeenCalled()
    })

    it('P05.a — « ailleurs » lit la base commune sur le segment du compte, à côté de « chez nous »', async () => {
      analysis.outcomeRecommendationFor.mockResolvedValue({
        dimension: 'cadence',
        recommended: null,
        reason: 'no_outcome',
        values: [],
      })
      const elsewhere = {
        basis: 'shared_anonymous_base',
        status: 'shared',
        segment: { sector: 'naf_64', sizeBand: 'eti' },
        contributingWorkspaces: 4,
        values: [{ value: 'relance', positive: 9, judged: 12, contributingWorkspaces: 4 }],
      }
      sharedBase.actionOutcomesElsewhere.mockResolvedValue(elsewhere)
      const out = await controller.channelsPerformance({ userId: 'u-1', by: 'cadence', accountId: 'a-1' } as never)
      expect(sharedBase.actionOutcomesElsewhere).toHaveBeenCalledWith('w-1', 'cadence', 'a-1')
      expect(out).toMatchObject({ reason: 'no_outcome', elsewhere })
    })

    it('P05.a — sait dire NON : une base commune en échec se NOMME, jamais « rien ailleurs »', async () => {
      analysis.outcomeRecommendationFor.mockResolvedValue({
        dimension: 'cadence',
        recommended: null,
        reason: 'no_outcome',
        values: [],
      })
      sharedBase.actionOutcomesElsewhere.mockRejectedValue(new Error('db down'))
      const out = await controller.channelsPerformance({ userId: 'u-1', by: 'cadence' } as never)
      expect(out).toMatchObject({ elsewhere: { error: 'shared_base_unavailable' } })
    })

    it('#3211.11 — lecteur absent : une erreur, jamais « rien de mesuré »', async () => {
      analysis.outcomeRecommendationFor.mockResolvedValue(null)
      const out = await controller.channelsPerformance({ userId: 'u-1', by: 'cadence' } as never)
      expect(out).toEqual({ error: 'outcome_recommendation_unavailable' })
    })
  })

  /** #3262.23 (épopée #3284) — la phrase de Laura sur un compte Focus qui stagne. */
  describe('accountFocusReview', () => {
    it('résout l’espace actif et relaie le signal TEL QUEL', async () => {
      const signal = {
        applicable: true,
        companyName: 'Acme',
        stale: true,
        daysInFocus: 45,
        recommendation: 'Trente jours sans mouvement : l’effort maximum n’est pas éternel.',
        suggestedLevel: 'extension',
      }
      pilotage.focusReviewForAccount.mockResolvedValue(signal as never)
      const out = await controller.accountFocusReview({ userId: 'u-1', accountId: 'acc-1' } as never)
      expect(pilotage.focusReviewForAccount).toHaveBeenCalledWith('w-1', 'acc-1')
      expect(out).toBe(signal)
    })

    it('rend une erreur nommée quand le compte est introuvable dans cet espace', async () => {
      pilotage.focusReviewForAccount.mockResolvedValue(null as never)
      const out = await controller.accountFocusReview({ userId: 'u-1', accountId: 'missing' } as never)
      expect(out).toEqual({ error: 'account_not_found' })
    })
  })
})

describe('InternalSecretGuard (rappel du contrat du pont)', () => {
  const guard = (secret: string) => new InternalSecretGuard({ get: () => secret } as unknown as ConfigService)

  const context = (header?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: header ? { 'x-internal-secret': header } : {} }) }),
    }) as never

  it('refuse quand aucun secret n’est configuré — jamais de fail-open', () => {
    expect(guard('').canActivate(context('anything'))).toBe(false)
  })

  it('refuse un secret erroné', () => {
    expect(guard('attendu').canActivate(context('faux'))).toBe(false)
  })

  it('accepte le secret exact', () => {
    expect(guard('attendu').canActivate(context('attendu'))).toBe(true)
  })
})

/**
 * #1489 — LANCER UNE ANALYSE DEPUIS LA CONVERSATION.
 *
 * Deux appels, et pas un. Le premier rend ce qu'on sait, le coût, le solde et
 * les QUESTIONS ; le second lance, et n'accepte qu'un jeton que seul le premier
 * sait produire.
 *
 * ⚠️ Ce qui se teste ici est la DÉCISION de Louis du 05/09, mot pour mot : on
 * demande confirmation avec des questions d'abord, **avec possibilité de « go »
 * sans avoir répondu à tout**.
 */
describe('CopilotBridgeController — lancer une analyse', () => {
  const accounts = { findCompletedByUserAndCompany: jest.fn() }
  const credits = { getCredits: jest.fn() }
  const analysis = { start: jest.fn() }
  // #2148.11 — la provenance (qui a lancé le dernier run) d'un dossier réutilisé.
  const analysisRuns = { getLastRunUserId: jest.fn(), getLastRunScope: jest.fn() }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(),
    extraPermissionsOf: jest.fn(),
    listMembers: jest.fn(),
  }
  // #1957.3 — le nombre de contacts déjà connus du compte, quand il existe.
  const contacts = { countForUser: jest.fn() }
  // #2263.1 — CRM et Market Memory, agrégés dans le MÊME appel que le cache
  // d'analyse : « tout ce que Bellum sait » avant une analyse payante.
  const crmRead = { findAccountPresence: jest.fn() }
  const marketMemory = { coverageFor: jest.fn() }
  const companies = { search: jest.fn() }
  let controller: CopilotBridgeController
  let previousSecret: string | undefined

  beforeEach(async () => {
    jest.resetAllMocks()
    previousSecret = process.env.INTERNAL_API_SECRET
    process.env.INTERNAL_API_SECRET = 'un-secret-de-test-suffisamment-long'
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'owner' })
    workspaceContext.extraPermissionsOf.mockResolvedValue([])
    workspaceContext.listMembers.mockResolvedValue([])
    accounts.findCompletedByUserAndCompany.mockResolvedValue(null)
    analysisRuns.getLastRunUserId.mockResolvedValue(null)
    analysisRuns.getLastRunScope.mockResolvedValue(null)
    credits.getCredits.mockResolvedValue({ credits_remaining: 122 })
    analysis.start.mockResolvedValue(success({ jobId: 'job-1', accountId: 'acc-1', launched: true }))
    contacts.countForUser.mockResolvedValue(0)
    crmRead.findAccountPresence.mockResolvedValue({
      provider: null,
      matched: false,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: null,
    })
    marketMemory.coverageFor.mockResolvedValue({ status: 'ok', coverage: { covered: false } })
    companies.search.mockResolvedValue({ suggestions: [] })

    const moduleRef = await Test.createTestingModule({
      controllers: [CopilotBridgeController],
      providers: [
        { provide: AccountsService, useValue: accounts },
        { provide: AnalysisService, useValue: analysis },
        { provide: LauraBatchFollowService, useValue: { follow: jest.fn(), settled: jest.fn() } },
        { provide: AnalysisRunsService, useValue: analysisRuns },
        { provide: CreditsService, useValue: credits },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: ContactsService, useValue: contacts },
        { provide: ConfigService, useValue: { get: () => 'secret-de-test' } },
        // #2263.1 — désormais consommés par `analysisPlan` : de vrais mocks,
        // plus des jetons hors sujet.
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: CrmReadService, useValue: crmRead },
        // #3260.8/.9 — la résolution de taille (`size_class`) qui alimente le
        // garde-fou de périmètre.
        { provide: CompaniesService, useValue: companies },
        ...[
          MailboxService,
          AgendaService,
          BriefingService,
          ChainsService,
          TalentService,
          DeliveryService,
          TimesheetsService,
          InvoiceReadinessService,
          MissionStartReadinessService,
          CapitalisationService,
          ProposalsService,
          PlaybooksService,
          OpenNeedsService,
          MatchingService,
          InverseMatchingService,
          TalentPoolService,
          RfpService,
          PilotageService,
          ProjectPipelineService,
          RevenueService,
          MissionScoresService,
          ForecastHorizonsService,
          LauraService,
          LauraProbeService,
          WeakestLinkDiagnosisService,
          AccountAccessService,
          PartnersService,
          PartnerPipelineService,
          EsnDirectoryService,
          IaClient,
          // #1822 / #1823 — hors sujet de CE bloc, comme les précédents.
          RoutinesService,
          ImportService,
          ImportOverviewForLauraService,
          CvBatchImportService,
          ActivitiesService,
          // #1822 (Lot 16) — hors sujet de CE bloc, comme les précédents.
          NotificationsService,
          // #1822 — les trois lectures de réglages ajoutées, hors sujet de CE
          // bloc mais nécessaires à la résolution.
          MemoryService,
          WorkspaceTeamService,
          CataloguesService,
          // #3219 — hors sujet de CE bloc (`accountContacts` n'y est pas testé).
          FieldConflictService,
          // Les dépendances hors sujet de CE bloc : présentes pour que Nest
          // résolve, jamais appelées.
        ].map(token => ({ provide: token, useValue: {} })),
        { provide: getRepositoryToken(ProfileEntity), useValue: {} },
        { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query: jest.fn() } } },
        // GA-07 : le contrôleur injecte le PORT (un `Symbol`), pas la classe —
        // hors de la liste ci-dessus, qui n'accepte que des jetons de classe.
        { provide: DEAL_STAGE_SLA_PORT, useValue: {} },
      ],
    }).compile()
    controller = moduleRef.get(CopilotBridgeController)
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.INTERNAL_API_SECRET
    else process.env.INTERNAL_API_SECRET = previousSecret
  })

  it('la préparation ne lance RIEN et ne débite RIEN', async () => {
    await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)
    expect(analysis.start).not.toHaveBeenCalled()
  })

  it('la préparation rend les questions — ni coût ni solde (#4464)', async () => {
    const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    expect(plan.questions?.length).toBeGreaterThanOrEqual(1)
    expect(plan.questions?.[0]?.question).toMatch(/\?$/)
    expect(plan).not.toHaveProperty('costCredits')
    expect(plan).not.toHaveProperty('creditsLeft')
    expect(plan.planToken).toBeTruthy()
  })

  /**
   * ⚠️ Un compte déjà analysé est DIT, avec sa date. Relancer reste possible —
   * un dossier de mars n'est pas un dossier d'aujourd'hui — mais on ne débite
   * pas un crédit sans que la personne sache qu'il en existe déjà un.
   */
  it('dit qu’un dossier existe déjà, et pose les questions du compte CONNU', async () => {
    accounts.findCompletedByUserAndCompany.mockResolvedValue({
      id: 'acc-9',
      company_name: 'OGF',
      status: 'completed',
      updated_at: new Date('2026-03-02T10:00:00.000Z'),
    })

    const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    expect(plan.account).toMatchObject({ id: 'acc-9', analysedAt: '2026-03-02T10:00:00.000Z' })
    expect(plan.preset).toBe('known-account')
  })

  /**
   * #2148.11 — LA PROVENANCE, DANS L'ESPACE : un dossier réutilisé nomme le
   * COLLÈGUE qui l'a produit, jamais un nom deviné, jamais SOI-MÊME, et jamais
   * au prix d'une lecture cross-workspace (`agent_docs/doctrine.md:35-36`).
   */
  describe('#2148.11 — analysedByName, la provenance d’un dossier réutilisé', () => {
    beforeEach(() => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'OGF',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
    })

    it('nomme le COLLÈGUE qui a lancé le dernier run, quand ce n’est pas l’appelant', async () => {
      analysisRuns.getLastRunUserId.mockResolvedValue('u-2')
      workspaceContext.listMembers.mockResolvedValue([
        { userId: 'u-1', email: 'moi@ex.fr', fullName: 'Moi Même', role: 'owner', isSelf: true },
        { userId: 'u-2', email: 'theo@ex.fr', fullName: 'Théo Haddad', role: 'member', isSelf: false },
      ])

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.account?.analysedByName).toBe('Théo Haddad')
    })

    it('ne se nomme jamais SOI-MÊME — « déjà connu » ne dit pas qui l’a fait à qui l’a fait', async () => {
      analysisRuns.getLastRunUserId.mockResolvedValue('u-1')
      workspaceContext.listMembers.mockResolvedValue([
        { userId: 'u-1', email: 'moi@ex.fr', fullName: 'Moi Même', role: 'owner', isSelf: true },
      ])

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.account?.analysedByName).toBeNull()
    })

    it('un auteur qui a quitté l’espace reste sans nom — jamais deviné', async () => {
      analysisRuns.getLastRunUserId.mockResolvedValue('u-parti')
      workspaceContext.listMembers.mockResolvedValue([
        { userId: 'u-1', email: 'moi@ex.fr', fullName: 'Moi Même', role: 'owner', isSelf: true },
      ])

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.account?.analysedByName).toBeNull()
    })

    it('aucun run retrouvé ⇒ pas de nom, jamais bloquant', async () => {
      analysisRuns.getLastRunUserId.mockResolvedValue(null)

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.account?.analysedByName).toBeNull()
    })

    it('une lecture en échec ne casse jamais la préparation — le nom reste absent', async () => {
      analysisRuns.getLastRunUserId.mockRejectedValue(new Error('db down'))

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.account?.analysedByName).toBeNull()
      expect(plan.planToken).toBeTruthy()
    })
  })

  /**
   * #1957.3 — le nombre de sources/objets visés, sur la MÊME carte que le
   * coût. Mesurable seulement pour un compte CONNU : un compte neuf n'a
   * encore aucun contact à re-visiter, et deviner un nombre serait justement
   * ce que GA-18/GA-19 interdit.
   */
  describe('#1957.3 — le nombre de contacts déjà connus, avant le clic', () => {
    it('un compte CONNU avec des contacts déjà en portefeuille porte `objectsCount`', async () => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'OGF',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
      contacts.countForUser.mockResolvedValue(12)

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'ogf' } as never)

      expect(plan.objectsCount).toBe(12)
      // Le filtre porte le nom CANONIQUE du dossier, jamais la graphie tapée
      // dans la conversation — la même règle que `_analysis_card` applique déjà.
      expect(contacts.countForUser).toHaveBeenCalledWith('u-1', { company: 'OGF' })
    })

    it('un compte JAMAIS analysé n’a pas de `objectsCount` — rien à mesurer, pas un zéro deviné', async () => {
      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan).not.toHaveProperty('objectsCount')
      expect(contacts.countForUser).not.toHaveBeenCalled()
    })

    it('un compte CONNU sans aucun contact reste sans `objectsCount` — jamais 0 affiché', async () => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'OGF',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
      contacts.countForUser.mockResolvedValue(0)

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan).not.toHaveProperty('objectsCount')
    })

    it('un comptage en échec ne fait jamais échouer la préparation', async () => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'OGF',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
      contacts.countForUser.mockRejectedValue(new Error('connexion perdue'))

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan).not.toHaveProperty('objectsCount')
      expect(plan.planToken).toBeTruthy()
    })
  })

  /**
   * #2263.1 — « réutiliser tout ce que Bellum sait avant une analyse payante ».
   * `analysisPlan` ne lisait que le cache d'analyse (`existing`) : un SEUL
   * appel qui agrège désormais aussi le CRM et Market Memory, best-effort —
   * une panne ou une absence de permission ne fait jamais échouer la
   * préparation, et une liste VIDE ne s'affiche jamais (GA-18/GA-19).
   */
  describe('#2263.1 — CRM et Market Memory agrégés dans la même préparation', () => {
    it('un CRM connecté avec un match ajoute "crm" à `knownFrom`', async () => {
      workspaceContext.extraPermissionsOf.mockResolvedValue(['crm:read'])
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'hubspot',
        matched: true,
        contactsCount: 2,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.knownFrom).toContain('crm')
    })

    it('sans la permission `crm:read`, `knownFrom` ne contient jamais "crm"', async () => {
      // `viewer` n'a AUCUNE permission de base ; un accord en propre lui donne
      // `analysis:run` (donc la préparation ne refuse pas) sans lui donner
      // `crm:read` — l'isolation exacte que ce test vérifie.
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })
      workspaceContext.extraPermissionsOf.mockResolvedValue(['analysis:run'])
      crmRead.findAccountPresence.mockResolvedValue({
        provider: 'hubspot',
        matched: true,
        contactsCount: 2,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.knownFrom ?? []).not.toContain('crm')
      expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    })

    it('une couverture Market Memory ajoute "marketMemory" à `knownFrom`', async () => {
      marketMemory.coverageFor.mockResolvedValue({ status: 'ok', coverage: { covered: true, marketPaths: 4 } })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan.knownFrom).toContain('marketMemory')
    })

    it('rien de connu nulle part ⇒ pas de champ `knownFrom` du tout', async () => {
      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan).not.toHaveProperty('knownFrom')
    })

    it('une panne CRM ou Market Memory ne fait jamais échouer la préparation', async () => {
      workspaceContext.extraPermissionsOf.mockResolvedValue(['crm:read'])
      crmRead.findAccountPresence.mockRejectedValue(new Error('CRM indisponible'))
      marketMemory.coverageFor.mockRejectedValue(new Error('lecture impossible'))

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan).not.toHaveProperty('knownFrom')
      expect(plan.planToken).toBeTruthy()
    })
  })

  /**
   * #3260.8/.9 (BEL-SC-231) — « Analyse Société Générale », sans plus de
   * précision, ne part jamais en silence sur le groupe entier quand le
   * registre classe l'entité GRANDE ENTREPRISE. Ne BLOQUE rien
   * (`c84_analyse_recherche_enrichissement_partent_sans_carte` reste en
   * vigueur) : nomme seulement un périmètre plausible et la raison, sur la
   * MÊME carte que le coût.
   */
  describe('#3260.8/.9 — garde-fou de périmètre avant un lancement à l’aveugle', () => {
    it('une GRANDE ENTREPRISE sans compte connu reçoit une suggestion de périmètre plus étroit', async () => {
      companies.search.mockResolvedValue({
        suggestions: [{ name: 'Société Générale', siren: '552120222', city: 'Paris', sector: '', size_class: 'GE' }],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Société Générale' } as never)

      expect(plan.scopeGuardrail).toEqual({
        suggestedScopeMode: 'business_unit',
        reason: expect.stringContaining('groupe'),
      })
    })

    it('#3434 — le chemin Pappers (effectif min/max, ni size_class ni libellé) déclenche aussi le garde-fou', async () => {
      // Le cas réel de « Analyse Michelin. » : `/companies/search` côté IA rend, sur le
      // chemin Pappers, `employees_min/max` — jamais `size_class` ni `headcount_label`.
      companies.search.mockResolvedValue({
        suggestions: [
          {
            name: 'Michelin',
            siren: '855200507',
            city: 'Clermont-Ferrand',
            sector: '',
            employees_min: 10000,
            employees_max: 49999,
          },
        ],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Michelin' } as never)

      expect(plan.scopeGuardrail).toEqual({
        suggestedScopeMode: 'business_unit',
        reason: expect.stringContaining('groupe'),
      })
    })

    it('#3434 — un effectif Pappers sous 5 000 ne déclenche rien', async () => {
      companies.search.mockResolvedValue({
        suggestions: [
          { name: 'Acme', siren: '552120222', city: 'Lyon', sector: '', employees_min: 50, employees_max: 99 },
        ],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Acme' } as never)

      expect(plan).not.toHaveProperty('scopeGuardrail')
    })

    it('une PME/ETI ne déclenche jamais la suggestion', async () => {
      companies.search.mockResolvedValue({
        suggestions: [{ name: 'Acme', siren: '552120222', city: 'Lyon', sector: '', size_class: 'PME' }],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Acme' } as never)

      expect(plan).not.toHaveProperty('scopeGuardrail')
    })

    it('un compte déjà connu ET déjà cadré (relance) ne consulte jamais le registre — jamais un appel réseau évitable', async () => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'Société Générale',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
      analysisRuns.getLastRunScope.mockResolvedValue({ scopeMode: 'direction', scopeSelection: null })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Société Générale' } as never)

      expect(plan).not.toHaveProperty('scopeGuardrail')
      expect(companies.search).not.toHaveBeenCalled()
    })

    it('#3434.1 — cherche large (8) et juge le plus gros homonyme, pas le seul rang 0', async () => {
      companies.search.mockResolvedValue({
        suggestions: [
          {
            name: 'Michelin Conseil',
            siren: '111111111',
            city: 'Lyon',
            sector: '',
            employees_min: 10,
            employees_max: 19,
          },
          { name: 'Michelin', siren: '855200507', city: 'Clermont-Ferrand', sector: '', size_class: 'GE' },
        ],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Michelin' } as never)

      expect(companies.search).toHaveBeenCalledWith('Michelin', 8)
      expect(plan.scopeGuardrail).toEqual({
        suggestedScopeMode: 'business_unit',
        reason: expect.stringContaining('groupe'),
      })
    })

    it('#3434.2 — la tranche ouverte « 10 000 salariés et plus » (ni min ni size_class) déclenche', async () => {
      companies.search.mockResolvedValue({
        suggestions: [
          {
            name: 'Michelin',
            siren: '855200507',
            city: 'Clermont-Ferrand',
            sector: '',
            headcount_label: '10 000 salariés et plus',
          },
        ],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Michelin' } as never)

      expect(plan.scopeGuardrail).toBeDefined()
    })

    it('#3434.3 — un dossier existant SANS périmètre sur un grand groupe pose aussi la garde', async () => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'Michelin',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
      analysisRuns.getLastRunScope.mockResolvedValue({ scopeMode: 'groupe', scopeSelection: null })
      companies.search.mockResolvedValue({
        suggestions: [{ name: 'Michelin', siren: '855200507', city: 'Clermont-Ferrand', sector: '', size_class: 'GE' }],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Michelin' } as never)

      expect(plan.account?.id).toBe('acc-9')
      expect(plan.scopeGuardrail).toEqual({
        suggestedScopeMode: 'business_unit',
        reason: expect.stringContaining('groupe'),
      })
    })

    it('#3434.3 — un dossier existant sans aucun run lisible compte comme sans périmètre', async () => {
      accounts.findCompletedByUserAndCompany.mockResolvedValue({
        id: 'acc-9',
        company_name: 'Michelin',
        status: 'completed',
        updated_at: new Date('2026-03-02T10:00:00.000Z'),
      })
      analysisRuns.getLastRunScope.mockResolvedValue(null)
      companies.search.mockResolvedValue({
        suggestions: [{ name: 'Michelin', siren: '855200507', city: '', sector: '', size_class: 'GE' }],
      })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Michelin' } as never)

      expect(plan.scopeGuardrail).toBeDefined()
    })

    it('#3434 — un périmètre déjà NOMMÉ dans la demande ne repose pas la question', async () => {
      companies.search.mockResolvedValue({
        suggestions: [{ name: 'Michelin', siren: '855200507', city: '', sector: '', size_class: 'GE' }],
      })

      const plan = await controller.analysisPlan({
        userId: 'u-1',
        company: 'Michelin — direction Data/IA France',
      } as never)

      expect(plan).not.toHaveProperty('scopeGuardrail')
      expect(plan.planToken).toBeTruthy()
    })

    it('#3434 — un log structuré rend la recette lisible, sans donnée personnelle', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
      companies.search.mockResolvedValue({
        suggestions: [
          { name: 'Michelin', siren: '855200507', city: '', sector: '', size_class: 'GE', employees_min: 10000 },
        ],
      })

      await controller.analysisPlan({ userId: 'u-1', company: 'Michelin' } as never)

      const call = log.mock.calls.find(([message]) => message === 'analysis_plan_scope')
      expect(call?.[1]).toEqual({
        suggestionsCount: 1,
        candidateSizeClass: 'GE',
        candidateHeadcountFloor: 10000,
        existing: false,
        scopeRequired: true,
      })
      expect(JSON.stringify(call)).not.toContain('u-1')
      log.mockRestore()
    })

    it('aucune suggestion trouvée par le registre ⇒ pas de garde-fou, jamais une taille devinée', async () => {
      companies.search.mockResolvedValue({ suggestions: [] })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Entité Obscure' } as never)

      expect(plan).not.toHaveProperty('scopeGuardrail')
    })

    it('une résolution de taille en échec ne casse jamais la préparation', async () => {
      companies.search.mockRejectedValue(new Error('Pappers indisponible'))

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'Société Générale' } as never)

      expect(plan).not.toHaveProperty('scopeGuardrail')
      expect(plan.planToken).toBeTruthy()
    })
  })

  /**
   * ⚠️ LA GARANTIE STRUCTURELLE. Sans jeton, rien ne part — et le seul moyen
   * d'en obtenir un est de passer par la préparation, qui rend les questions.
   */
  it('refuse de lancer sans le jeton de préparation', async () => {
    const result = await controller.analysisStart({
      userId: 'u-1',
      company: 'OGF',
      planToken: 'inventé',
    } as never)

    expect(result).toMatchObject({ error: 'plan_required' })
    expect(analysis.start).not.toHaveBeenCalled()
  })

  /**
   * ⚠️ LA DÉCISION DE LOUIS, MOT POUR MOT : « possibilité de go sans avoir
   * répondu à tout ». Zéro réponse est un cas NORMAL, pas une erreur.
   */
  it('lance sans AUCUNE réponse — « go » suffit', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    const result = await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken } as never)

    expect(result).toMatchObject({ accountId: 'acc-1', launched: true })
    expect(analysis.start).toHaveBeenCalledTimes(1)
  })

  it('emporte les réponses données, et seulement elles', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    const result = await controller.analysisStart({
      userId: 'u-1',
      company: 'OGF',
      planToken,
      preset: 'free',
      answers: { notes: 'Ils refont leur SI RH.' },
    } as never)

    expect(result.contextUsed).toEqual(['notes'])
    expect(analysis.start.mock.calls[0]?.[0]).toMatchObject({
      company_name: 'OGF',
      user_context: { preset: 'free', notes: 'Ils refont leur SI RH.' },
    })
  })

  // #2624.1 — le mécanisme existait déjà (`analysisScopeSelectionSchema`,
  // consommé par `AnalysisService.start`) mais ce DTO `.strict()` le rejetait
  // silencieusement : un cadrage saisi par le modèle n'atteignait jamais le run.
  it('fait voyager le territoire, la taille et les exclusions jusqu’à `AnalysisService.start`', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    await controller.analysisStart({
      userId: 'u-1',
      company: 'OGF',
      planToken,
      scope_mode: 'filiales',
      scope_selection: {
        geo_perimeter: 'france',
        excluded_entities: ['OGF Pompes Funèbres'],
        headcount_min: 50,
        headcount_max: 999,
      },
    } as never)

    expect(analysis.start.mock.calls[0]?.[0]).toMatchObject({
      company_name: 'OGF',
      scope_mode: 'filiales',
      scope_selection: {
        geo_perimeter: 'france',
        excluded_entities: ['OGF Pompes Funèbres'],
        headcount_min: 50,
        headcount_max: 999,
      },
    })
  })

  // #3704.5 — une entreprise TROUVÉE par la recherche rejoint l'analyse avec son identité légale :
  // le SIREN ancre le run (même scope lock que le sélecteur de périmètre), jamais une re-résolution
  // du nom (homonymes, groupe / marque / entité distincts).
  it('fait voyager le SIREN d’une cible trouvée jusqu’à `AnalysisService.start`', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'Maison Lumière' } as never)

    await controller.analysisStart({
      userId: 'u-1',
      company: 'Maison Lumière',
      planToken,
      siren: '123456789',
    } as never)

    expect(analysis.start.mock.calls[0]?.[0]).toMatchObject({ company_name: 'Maison Lumière', siren: '123456789' })
  })

  it('sans SIREN, la clé n’est pas posée — le run part comme avant', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken } as never)

    expect(analysis.start.mock.calls[0]?.[0]).not.toHaveProperty('siren')
  })

  // #3218 (lot RAW, recette G4 prod 11/10) — « lance-la » rendait « dossier réutilisé sans
  // débit » : `AnalysisService.start` ne relance un dossier frais QUE sur `relaunch`, que ce
  // DTO `.strict()` refusait et que ce pont ne transmettait pas.
  it('#3218 — une relance DEMANDÉE voyage jusqu’à `AnalysisService.start`', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'BNP Paribas' } as never)
    const dto = { userId: '11111111-1111-4111-8111-111111111111', company: 'BNP Paribas', planToken, relaunch: true }
    expect(CopilotAnalysisStartDto.schema.safeParse(dto).success).toBe(true)

    await controller.analysisStart({ ...dto, userId: 'u-1' } as never)

    expect(analysis.start.mock.calls[0]?.[0]).toMatchObject({ company_name: 'BNP Paribas', relaunch: true })
  })

  it('#3218 — sans relance demandée, la clé n’est pas posée (un dossier frais reste réutilisé)', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken, relaunch: false } as never)

    expect(analysis.start.mock.calls[0]?.[0]).not.toHaveProperty('relaunch')
  })

  /**
   * ⚠️ Le modèle peut inventer une clé. Le schéma de contexte est strict :
   * une clé de trop ferait rejeter TOUT le contexte, donc on perdrait les
   * réponses justes à cause d'une réponse fautive.
   */
  it('ignore une réponse à une question qui n’existe pas, sans perdre les autres', async () => {
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    const result = await controller.analysisStart({
      userId: 'u-1',
      company: 'OGF',
      planToken,
      preset: 'free',
      answers: { notes: 'Refonte SI RH', budgetInvente: '100k' },
    } as never)

    expect(result.contextUsed).toEqual(['notes'])
    expect(analysis.start.mock.calls[0]?.[0].user_context).toEqual({ preset: 'free', notes: 'Refonte SI RH' })
  })

  it('remonte l’échec du lancement au lieu de prétendre avoir lancé', async () => {
    analysis.start.mockResolvedValue(failure({ code: 'insufficient_credits', message: 'Plus de crédits.' }))
    const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

    const result = await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken } as never)

    expect(result).toMatchObject({ error: 'insufficient_credits' })
  })

  /**
   * #1956.14 — vérification 13/09. `POST /analysis/start` et `GET
   * /analysis/launch-plan` exigent `analysis:run` (`analysis.controller.ts`) ;
   * le pont, gardé par le seul secret interne, lançait pour n'importe quel
   * siège. Une analyse DÉBITE : Laura ne lance pas ce que l'écran refuse.
   */
  describe('#1956.14 — lancer exige `analysis:run`, le droit de l’écran', () => {
    const REFUSED = ['viewer', 'recruiter', 'finance', 'tech_admin'] as const
    const ALLOWED = ['owner', 'admin', 'sales_ops', 'sales', 'member'] as const

    it.each(REFUSED)('NON — un siège %s ne lance rien, même avec un jeton valide', async role => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })
      const planToken = issueAnalysisPlanToken('u-1', 'OGF')

      const result = await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken } as never)

      expect(result).toMatchObject({ error: 'analysis_forbidden' })
      expect(analysis.start).not.toHaveBeenCalled()
    })

    it.each(REFUSED)('NON — la préparation ne rend à un siège %s ni jeton ni questions', async role => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })

      const plan = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      expect(plan).toMatchObject({ error: 'analysis_forbidden' })
      expect(plan).not.toHaveProperty('planToken')
      expect(plan).not.toHaveProperty('questions')
    })

    it.each(ALLOWED)('un siège %s prépare puis lance (témoin)', async role => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role })
      const { planToken } = await controller.analysisPlan({ userId: 'u-1', company: 'OGF' } as never)

      const result = await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken } as never)

      expect(result).toMatchObject({ accountId: 'acc-1', launched: true })
      expect(analysis.start).toHaveBeenCalledTimes(1)
    })

    it('une permission accordée en propre suffit — les accords sont additifs, comme à l’écran', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'recruiter' })
      workspaceContext.extraPermissionsOf.mockResolvedValue(['analysis:run'])
      const planToken = issueAnalysisPlanToken('u-1', 'OGF')

      const result = await controller.analysisStart({ userId: 'u-1', company: 'OGF', planToken } as never)

      expect(result).toMatchObject({ launched: true })
    })

    it('le refus dit quoi faire au modèle, pas seulement « interdit »', async () => {
      workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w-1', role: 'viewer' })

      const result = await controller.analysisStart({
        userId: 'u-1',
        company: 'OGF',
        planToken: issueAnalysisPlanToken('u-1', 'OGF'),
      } as never)

      expect((result as { message?: string }).message).toMatch(/rôle/)
    })
  })
})
