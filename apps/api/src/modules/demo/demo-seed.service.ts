import { createHash, randomUUID } from 'node:crypto'
import { seedTeamGuardrails } from './demo-team-guardrails-seed'
import { seedTeamObjectives } from './demo-team-objectives-seed'
import { filtersKeyOf } from '../team-research/team-research-key'
import { ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { getMetadataArgsStorage, In, IsNull, Repository } from 'typeorm'
import {
  ACCOUNT_FOLLOW_MAX_PER_USER,
  signalStateKey,
  OPEN_PIPELINE_STAGES,
  AWAITING_TIMESHEET_STATUSES,
  duplicatePairKey,
  DEFAULT_ENTITY_NAME,
  INTERVENTION_THRESHOLDS,
  MANUAL_ACTION_WEEK_INDEX,
  NEED_OPEN_STATUSES,
  normalizeTags,
  ORG_ENRICHMENT_PROMPT_VERSION,
  OUTREACH_EDIT_POLICY,
  OUTREACH_PLAYBOOKS,
  anonymizedBenchProfile,
  buildBenchPushDraft,
  OUTREACH_SEQUENCE_TEMPLATES,
  OUTREACH_STEP_INTENT_LABELS,
  playbookSequenceName,
  playbookTemplateKey,
  PROFILE_CONTEXT_SCHEMA_VERSION,
  TERRITORY_COLLECTION_LIMITS,
  creditCostOf,
  deriveOrgEnrichmentJobStatus,
  deriveSubstatusFromStage,
  storageObjectPath,
  storedFileRetentionUntil,
  type StorageDomain,
  type OutreachDelayUnit,
  type OutreachEngagementSignal,
  type OutreachStepKind,
  type OutreachSequenceStatus,
  type OutreachSequenceStopEvent,
  type OutreachStepStatus,
  type OutreachTemplateKey,
  type NotificationType,
  notificationLevelFor,
  computeRfpImportPreviewIndicators,
  localMonthKey,
  persistedChatContext,
  offerPortfolioSchema,
  type BidDecision,
  type RfpOwnerRole,
  type RfpRequirement,
  type RfpRequirementKind,
  type RfpRequirementWeight,
  timelineSystemSubject,
  toStoredExperienceDate,
  INTAKE_STAGES,
  projectStageInSql,
} from '@bellum/contracts'
// #2567.3 (18/09/2026) — LES QUATRE FONCTIONS PURES DE LA FILE D'INTERVENTION,
// jamais recopiées : la démonstration doit produire ses lignes en EXÉCUTANT la
// même dérivation que le balayeur nocturne (`InterventionsSweeper`), pas en
// écrivant à la main un texte qui a l'air de sortir d'elle.
import {
  detectBlockedInvoicing,
  detectMissingTimesheets,
  detectNeedsWithoutShortlist,
  detectStalledSubmissions,
  type InvoicingRow,
  type MissingTimesheetRow,
  type NeedWithoutShortlistRow,
  type StalledSubmissionRow,
} from '../playbooks/intervention-rules'
import { AccountEntity } from '../../database/entities/account.entity'
import { buildDemoCrmDeals } from './demo-crm-deals'
import { buildDemoCrmWriteRequests } from './demo-crm-write-requests'
import { seedDemoCrmBackbone } from './demo-crm-backbone'
import { seedDemoCrmLinks } from './demo-crm-links'
import { seedDemoCrmSignature } from './demo-crm-signature'
import { seedDemoCrmMissionLifecycle } from './demo-crm-mission-lifecycle'
import { seedDemoCrmCounters } from './demo-crm-counters'
import { seedDemoCrmRecette } from './demo-crm-recette'
import { seedDemoCrmRecette2 } from './demo-crm-recette2'
import { returnedRows } from '../../database/returned-rows'
import { ALL_IMPORTED_SEQUENCES } from '../message-library/message-library.seed-data'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
// #3104 — la conversation d'exemple du panneau « Conversations » de /chat.
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { canonicalSkill } from '../consultants/skill-referential'
import { ANALYSIS_TRACKING_DEFINITION_KEY } from '../action-os/copilot-card-catalog'
import {
  LONG_JOB_SPECS,
  analysisSettlementSentence,
  contactVerificationLine,
  longJobProgressSentence,
} from '../action-os/long-job-catalog'
import { NoteEntity } from '../../database/entities/note.entity'
import { ProjectsService } from '../projects/projects.service'
import { WeakestLinkDiagnosisService } from '../weakest-link-diagnosis/weakest-link-diagnosis.service'
// #2151.59 — le SIREN d'un candidat Découvrir n'a pas de ligne en base ; la
// même dérivation STABLE (espace + SIREN) sert à seeder la note ci-dessous
// qu'à la lire côté écran (`DiscoverCandidateNotesService`). GA-07 : importée
// depuis son propre fichier — une fonction PURE, jamais le service — pour ne
// pas compter comme un couplage service→service (voir le docblock du fichier).
import { candidateNoteEntityId } from '../discover-notes/candidate-note-entity-id'
// #2873 — même raison GA-07 que `candidateNoteEntityId` juste au-dessus : une
// fonction PURE de `routines/routine-schedule.ts` (aucun service, aucune
// injection), pour écrire la MÊME clé d'unicité qu'une exécution réelle
// poserait — jamais une clé réinventée ici qui pourrait diverger.
import { routineRunKey } from '../routines/routine-schedule'
// ⚠️ `StorageClient` et non `StorageService` : le semis écrit ses LIGNES en SQL
// comme il le fait pour toutes les tables, et n'a besoin que de déposer les
// octets. C'est aussi ce qui garde la frontière de modules intacte (GA-07).
import { StorageClient } from '../storage/storage.client'
import { UserFavoriteEntity } from '../favorites/user-favorite.entity'
import { demoPdf, demoStorageObjectId } from './demo-stored-files'
import { DEMO_PLAYBOOK_SEQUENCES } from './demo-playbook-sequences'
import { DEMO_AUTOMATION_MESSAGES, DEMO_AUTOMATION_RULES, DEMO_AUTOMATION_TRIALS } from './demo-automations'
import { demoDocumentSourceFile } from './demo-document-files'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { SupabaseAuthGateway } from '../auth/supabase-auth.gateway'
import {
  demoBudgetAuthority,
  demoCadenceMessages,
  demoCareerLevers,
  demoContactActivity,
  demoContactSignals,
  demoFollowupMessage,
  demoImplicitFears,
  demoLanguage,
  demoLocale,
  demoLocation,
  demoPhoneScript,
  demoScope,
  demoTimezone,
  type DemoContactSeed,
  type DemoDossierSeed,
} from './demo-contact-profile'
import { DEMO_LEGAL_ENTITIES, DEMO_MISSION_LEGAL_ENTITY } from './demo-legal-entities'
import { demoCoordinateAvailability, demoEnrichmentCoordinates, demoEnrichmentTrace } from './demo-enrichment-trace'
import { demoMarginTargets } from './demo-margin-targets'
import { demoStockSnapshotRows } from './demo-stock-snapshots'
import {
  DEMO_CHAIN_MANUAL_MARKS,
  DEMO_PARTNER_RELATIONS,
  DEMO_TERRITORIES,
  DEMO_TERRITORY_SNAPSHOTS,
  DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE,
  DEMO_COLLEAGUES,
  DEMO_TEAM_RESEARCH,
  DEMO_TEAM_THREADS,
  DEMO_COLLEAGUE_ACTIVITY,
  DEMO_DELEGATED_ACTIONS,
  DEMO_SHARED_ACCOUNT_WORK,
  DEMO_CONSULTANTS,
  // #2569.4 — le parcours du lot N (import ZIP/messagerie).
  DEMO_CV_IMPORT_CONSULTANTS,
  type DemoCvImportConsultant,
  type DemoCvImportDocument,
  // #2818 — le sourcing externe de consultants.
  DEMO_EXTERNAL_SOURCING_CONSULTANTS,
  DEMO_EXTERNAL_SOURCING_PARTNER_NAME,
  DEMO_EXTERNAL_SOURCING_SKILL,
  DEMO_DELIVERY_CLIENT,
  DEMO_MISSING_EXPERTISE,
  DEMO_DELIVERY_CARRIER,
  DEMO_EXPERTISE_GROUNDINGS,
  DEMO_AGREEMENT_CONFIRMED_CONSULTANT,
  DEMO_CV_READ_THIS_WEEK,
  DEMO_STAFFING,
  DEMO_MISSION_BUSINESS_UNIT_TRANSFER,
  DEMO_CONTACT_SCOPE_DIFFERENCE,
  DEMO_MISSION_CLIENT_MANAGER,
  DEMO_MISSION_FRAME,
  DEMO_SIMILAR_CASES,
  DEMO_CRM_DEALS,
  DEMO_CRM_MIRROR,
  DEMO_ORG_CRM_MARKED_CONTACTS,
  crmMarkedContactIds,
  demoCrmPresence,
  DEMO_LOST_DEAL_REX,
  DEMO_SECOND_LOST_DEAL,
  DEMO_THIRD_LOST_DEAL,
  DEMO_START_READINESS_MISSION,
  DEMO_FORFAIT_PROFILE_NEEDS,
  DEMO_SUPERVISED_FORFAIT_MISSION,
  DEMO_SUPERVISED_FORFAIT_NEED,
  DEMO_FLAGSHIP_NEED,
  DEMO_FLAGSHIP_NEED_SOURCE_URL,
  DEMO_STAFFED_NEED,
  DEMO_NO_DEFENDABLE_PROFILE_NEED,
  DEMO_PILOTAGE_WEEK_MOVES,
  DEMO_PROBABILITY_CALIBRATION,
  DEMO_PIPE_L2,
  DEMO_RAG_DOCUMENTS,
  DEMO_DOSSIERS,
  DEMO_ESTIMATED_EMAIL_CONTACTS,
  DEMO_HAND_ENTERED_TALENT_FIELDS,
  demoCollectedAtColumns,
  DEMO_SG_ESN_PARTNERS,
  demoOrgCorrections,
  demoOrgEnrichmentJobs,
  DEMO_MEMBER_OBJECTIVE,
  DEMO_LEGAL_ENTITY,
  DEMO_BRIDGE_CONTACTS,
  DEMO_UNQUALIFIED_CONTACTS,
  DEMO_AUTO_MERGED_DUPLICATE,
  DEMO_PIPELINE_DETECTIONS,
  DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT,
  DEMO_MEMORY_FACTS,
  DEMO_OWNER,
  DEMO_ESN_PROFILE,
  DEMO_INFERRED_PLACED_ROLES,
  DEMO_IMPORT_HISTORY,
  DEMO_PERSONAL_CONTACTS,
  DEMO_SOLD_SENIORITY_LEVELS,
  DEMO_PLAN_TASKS,
  DEMO_PROFILE_CONTEXT,
  DEMO_ACTIVITIES,
  DEMO_EVENT_PARTICIPANTS,
  DEMO_TASKS,
  DEMO_NOTES,
  DEMO_DISCOVER_CANDIDATE_NOTE,
  DEMO_USER_ACTIONS,
  DEMO_CARD_RUN,
  DEMO_WORKFLOW_RUN,
  DEMO_ACTION_OS_APPROVAL,
  DEMO_COPILOT_CANCELLED_JOB,
  DEMO_COPILOT_DONE_JOB,
  DEMO_ANALYSED_ACCOUNTS,
  DEMO_EXTENSION_ACCOUNTS,
  DEMO_SUBMISSIONS_MIN_TOTAL,
  DEMO_JOB_OFFER_THREAD,
  DEMO_LONG_LAURA_THREAD,
  DEMO_RESTRICTED_SOURCE_THREAD,
  DEMO_SAMPLE_PLAN_V1,
  DEMO_SAMPLE_PLAN_V2,
  DEMO_COPILOT_LONG_JOB,
  demoInvoiceHistory,
  demoPilotageRecentPayments,
  demoUnmatchedPayments,
  DEMO_FACTORING,
  demoFactoringAssignments,
  DEMO_EXPENSE_POLICY,
  DEMO_EXPENSE_REPORTS,
  DEMO_BUSINESS_UNITS,
  DEMO_DOCUMENT_IDENTITY,
  DEMO_MARGIN_ALERT_THRESHOLD_PERCENT,
  DEMO_CONTACT_TARGET_LISTS,
  DEMO_TARGET_LIST,
  DEMO_TIERED_TARGET_LIST,
  DEMO_COMMERCIAL_OUTCOMES,
  DEMO_ANALYSIS_BATCH,
  DEMO_WORK_PROGRESS,
  DEMO_ACCOUNT_CRM_EXPORT,
  DEMO_IMPORT_MARKS,
  DEMO_CRM_COMPLETION,
  DEMO_ENTITY_RESOLUTION_CORRECTION,
  DEMO_WORK_CONTEXT,
  DEMO_RFP,
  DEMO_RFP_INTERRUPTED_IMPORT,
  DEMO_TIMESHEET_EXCEPTIONS,
  DEMO_ANALYSIS_RUNS,
  DEMO_HISTORY_RUNS,
  DEMO_VERIFICATION_RUNS,
  DEMO_OUTREACH_MESSAGES,
  DEMO_OUTREACH_CALL_TASKS,
  DEMO_INTEGRATION_SYNC_RUN,
  DEMO_MESSAGE_LIBRARY_ENTRIES,
  DEMO_MESSAGE_STYLE_TEMPLATES,
  DEMO_MESSAGE_STYLE_RULE_PROPOSALS,
  DEMO_SPRINT_PARTNER_ROUTE_PARTNER,
  DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER,
  DEMO_PERSONAL_ACCESS_EXTRA_SEEDS,
  DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS,
  DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS,
  DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS,
  DEMO_SCHEDULED_SEND_SEED_SPECS,
  DEMO_RECRUITMENT_SEED_SPECS,
  DEMO_TARGET_PERSONAS,
  DEMO_SG_COMPLETE_LEAD,
  DEMO_SHARED_BASE_ACTION_OUTCOMES,
  DEMO_SHARED_BASE_CASE_OUTCOMES,
  DEMO_SHARED_BASE_SIGNAL_DEALS,
  DEMO_SHARED_BASE_COMPANY_ROLES,
  DEMO_SHARED_BASE_MESSAGE_LEARNING,
  DEMO_SHARED_BASE_MARKET_PATTERNS,
  demoSourceUrl,
  DEMO_OUTREACH_ASSETS,
  DEMO_TEAM_POLICY,
  demoContactRawData,
  type DemoJobPostingProof,
  demoContactSource,
} from './demo-dataset'
import { buildDemoPipeRows } from './demo-pipe-journal'
import { seatName } from './demo-seat-names'
import { buildParityDealRows, DEMO_PARITY_ACTIVITIES, DEMO_PARITY_USER_ACTIONS } from './demo-parity-history'
import {
  rewriteActionOutcomeCells,
  rewriteCaseOutcomeCells,
  rewriteMarketPatternCells,
  rewriteMessageLearningCells,
  rewriteSignalDealCells,
} from '../shared-base/shared-base-writes'
import { upsertSharedCompanyPeople } from '../shared-base/shared-company-facts-writes'
import { normalizeRoleTitle } from '../contacts/target-persona-match'
// #2571.5 — le MÊME script que l'import en direct (`RfpService.create`,
// démonstration) : la salle ne montre jamais un écran que le produit ne sait
// pas rendre.
import { demoRfpAnalysis } from './demo-scripts'
// #3135 — l'empreinte stampée à CHAQUE semis réel, comparée au bail suivant
// par `DemoResetService` (voir `demo-seed-fingerprint.ts`).
import { DEMO_FORFAIT_DOSSIERS, DEMO_FORFAIT_FRAMED_OPPORTUNITY, DEMO_FORFAIT_PROJECTS } from './demo-forfait-dataset'
import { demoRoomVariantOf, demoSeedFingerprintFor, type DemoRoomVariant } from './demo-room-variant'
import { applyBpcePartnersAndNeeds } from './bpce-csv-complement'
import { resolveOrangeRelativeDates } from './orange-public-complement'
import { BPCE_SEED } from './bpce-seed'
import { briefPartners, commercialBriefOf } from './commercial-brief-seed'
import { DEMO_MARKET_ZONES, marketZoneInsertParams } from './market-brief-seed'
import { DEMO_SEQUENCE_TEMPLATES } from './demo-sequence-templates'
import {
  DEMO_HANDOFF_NOTE,
  DEMO_MANAGER_DIGEST,
  DEMO_TEAM_COLLEAGUE_ID,
  DEMO_TEAM_MESSAGE_EXAMPLES,
} from './demo-team-continuity'
import {
  DEMO_QUALIFICATION_ACCOUNT,
  DEMO_QUALIFICATION_ANALYSIS,
  DEMO_QUALIFICATION_GRID,
  DEMO_QUALIFICATION_MANUAL,
  demoQualificationSnapshot,
} from './demo-qualification-seed'
import { writeCsvPartners } from './compte-csv-writes'
import { DEMO_BPCE_REAL_CONTACTS_COMPANY } from './bpce-csv-mapping'
import { applySgCompleteLead, applySgPartnersAndNeeds } from './sg-csv-complement'
import { resolveDemoEmployment, type DemoApolloEnrichment } from './demo-contact-density'
import { buildDemoTeamInboxRows } from './demo-team-inbox'

/** Result of a demo-workspace creation — what the backoffice screen shows. */
export interface DemoWorkspaceResult {
  workspaceId: string
  name: string
  ownerUserId: string
  isDemo: true
  /** Number of golden dossiers present after the call (seeded or pre-existing). */
  accounts: number
  /** False when the workspace already held the dossiers (idempotent re-call). */
  seeded: boolean
}

const DEFAULT_DEMO_NAME = 'Démo Bellum'

/**
 * Ce qu'une fiche du jeu de données porte — la forme que {@link
 * DemoSeedService.demoContactRow} sait écrire.
 *
 * Elle vaut pour les contacts des six dossiers RÉELS comme pour ceux du client
 * d'exemple : la seule différence entre les deux est qu'ici les coordonnées
 * peuvent être renseignées, parce que la société n'existe pas. La FORME, elle,
 * est la même — sans quoi une des deux portes écrirait une fiche incomplète.
 */
type DemoSeedContact = DemoContactSeed & {
  photo_url: string | null
  email: string | null
  phone?: string | null
  /** #2629.2 — voir `DemoContact.linkedin_url` (demo-dataset.ts) : réservé aux
   *  contacts écrits à la main, jamais générés en série. */
  linkedin_url?: string | null
  profile_summary: string
  email_message: { subject: string; body: string } | null
  linkedin_message: string | null
  contact_score: number
  lifecycle_state: string
  /** #2296.30/.33 — voir `DemoContact.apollo_enrichment` (demo-dataset.ts). */
  apollo_enrichment?: DemoApolloEnrichment
  /**
   * #3716 — colonnes d'un import SANS champ d'accueil, sous leur intitulé
   * d'origine (`contacts.extra`). Réservé aux interlocuteurs FICTIFS : le
   * détail « Parcours et informations complémentaires » ne doit jamais s'ouvrir
   * en démo sur un contenu inventé pour une personne réelle. Absent = `{}`.
   */
  extra?: Record<string, string>
  exclusion_reason?: string | null
  /** #4556 — voir `DemoContact.location` (demo-dataset.ts) : `null` = lieu inconnu. */
  location?: string | null
  /** #2159.26 — les étiquettes du contact ; absent = aucune. */
  tags?: string[]
  /**
   * L'issue de la relation, telle que le commercial la DÉCLARE depuis la ligne
   * du contact. Absente = `new`, l'état de départ.
   *
   * ⚠️ Ne concerne que les interlocuteurs FICTIFS du client d'exemple. Déclarer
   * qu'un dirigeant réel nous a répondu inventerait un fait sur une personne.
   */
  user_status?: string
  /** #2390.8 — voir `demo-dataset.ts` : un fuseau posé au jeu de données. */
  timezone?: string
  /**
   * #2160.58 — la confirmation POSITIVE d'identité, déclarée depuis la carte
   * Corrections. `undefined` = jamais confirmé (l'état de départ).
   *
   * ⚠️ Ne concerne que les interlocuteurs FICTIFS du client d'exemple — même
   * garde que `user_status` juste au-dessus : déclarer qu'un dirigeant réel a
   * été confirmé inventerait un verdict humain sur une vraie personne.
   */
  identity_confirmed_at?: string
  /**
   * #2160.60 — la levée de la porte « homonyme non résolu » / « entité hors
   * périmètre », déclarée depuis la carte Corrections. `undefined` = jamais
   * levée. Contrairement à `identity_confirmed_at` : safe sur un SIÈGE
   * anonyme (`full_name` = intitulé de poste), même sur un dossier RÉEL —
   * voir `demo-dataset.ts` pour le détail de la garde.
   */
  recommendation_authorized_reason?: 'homonym_conflict' | 'entity_mismatch'
  declared_person_company_relation?: 'sponsor' | 'buyer'
  /**
   * #2120.68 / #2120.70 — provenance par champ (confiance, coût), portée par
   * les interlocuteurs SIMULÉS densifiés (`demo-contact-density.ts`). Absente
   * = non mesurée / non engagée (GA-18/19) : jamais une valeur basse, jamais 0.
   */
  email_confidence?: 'high' | 'medium' | 'low' | null
  phone_confidence?: 'high' | 'medium' | 'low' | null
  email_cost_credits?: number | null
  phone_cost_credits?: number | null
  /** #4178.1 — nature du numéro seedée (voir `demo-contact-density.ts`). */
  phone_nature?: 'professional_declared' | 'unknown'
  /** #2297.51 — coordonnées archivées par la rétention (voir `demo-dataset.ts`). */
  enrichment_archived_days_ago?: number
  enrichment_archive?: { email: string; phone: string }
  /**
   * #2297.26 reste (30/09/2026) — cette fiche est sous DÉLAI DE PROTECTION :
   * un enrichissement a déjà été tenté il y a peu, sans rien trouver de neuf
   * (`enrichmentCooldown`, `@bellum/contracts`). La date est relative au seed,
   * même patron que `enrichment_archived_days_ago` juste au-dessus — figée,
   * elle sortirait de la fenêtre de 30 jours au fil des mois et la salle
   * redeviendrait muette sans qu'aucun test ne rougisse. Réservé à un contact
   * SANS coordonnée (email/téléphone/LinkedIn tous `null`) : c'est justement
   * parce qu'aucune n'a été trouvée que la ligne « récemment enrichis »
   * (`bulkEnrichmentExclusionReason` → `on_cooldown`) a un cas à montrer.
   */
  recently_enriched_no_result_days_ago?: number
  /** #4106.4 — voir `DensityRow.cascadeSecondSource` (demo-contact-density.ts). */
  enrichment_cascade_sources?: 2
  /** #4107.4 — voir `DensityRow.smtpVerifiedEmail` : e-mail deviné puis vérifié SMTP. */
  email_verified?: true
  /**
   * #2295.4bis — décision Louis 18/09/2026 (question 24) : lève le verrou
   * #2295.4 de `classifyGroup()` pour ce contact, SANS affirmer qu'une
   * adresse a été vérifiée. Absent = `undefined`, transmis tel quel par
   * {@link DemoSeedService.demoContactRow} — ce fichier ne le POSE jamais
   * lui-même à `true`, seul `demo-dataset.ts` le fait.
   */
  demo_seed_first_door?: boolean
  /** SIG-B — voir `DemoContact.job_posting` (demo-dataset.ts). */
  job_posting?: DemoJobPostingProof
}

/**
 * Demo workspace provisioning + golden-dataset seeding (demo mode C1 Théo).
 *
 * Called from the admin backoffice only (`POST /internal/admin/workspaces/demo`,
 * behind `InternalSecretGuard`). The seeded data is FICTIONAL BY DESIGN (see
 * `demo-dataset.ts`) and confined to `is_demo` workspaces: contacts are stamped
 * `source = 'demo'`, accounts carry `raw_analysis.demo_seed = true`, and the
 * demo guards (CreditsService short-circuit + AnalysisService replay) keep it
 * from ever crossing into real billing or real pipelines.
 */
/**
 * Un mois d'historique de releve, pour la mission qui DERAPE (PDF 5 §7.2).
 *
 * `validated_days_ago` est la date de VALIDATION CLIENT : c'est elle qui rend
 * mesurable le signal « validation client de plus en plus lente ». `null` =
 * jamais valide, ce qui n'est pas « valide le jour meme ».
 */
type DemoDriftMonth = {
  months_ago: number
  days: number
  expected_days: number
  status: 'validated' | 'submitted'
  validated_days_ago: number | null
}

/**
 * LE PLAN DES SÉQUENCES DE DÉMONSTRATION (#1509→#1515).
 *
 * Exporté pour qu'une garde puisse vérifier que chaque `contact` EXISTE parmi
 * les contacts de la salle. La première version citait « Camille Roussel »
 * (une CONSULTANTE) et « Sophie Lemaire » (personne) : le semis les sautait
 * proprement, et la salle montrait deux lignes sur quatre **sans que rien ne
 * tombe**. Un semis qui saute en silence est un semis qu'on croit avoir fait.
 */
export const DEMO_OUTREACH_PLAN: readonly {
  contact: string
  template: OutreachTemplateKey
  status: OutreachSequenceStatus
  /**
   * #3421 lot G03 (30/09) — retour bêta : la condition d'arrêt d'une séquence
   * n'était vérifiable sur AUCUNE séquence réelle ou de démonstration
   * (`cancel_reason` du contrat se lit depuis `outreach_transitions`,
   * `OutreachService.cancelReasons` — jamais une colonne d'`outreach_sequences`
   * elle-même). Posé UNIQUEMENT quand `status: 'cancelled'`, il fait écrire
   * une ligne `outreach_transitions` (`to_state: 'cancelled'`) au semis, dans
   * la forme EXACTE que produit un arrêt réel (`stopSequencesForContact`,
   * `mailbox.service.ts:561`) — jamais une valeur devinée en plus.
   */
  cancelReason?: OutreachSequenceStopEvent
  /**
   * #2203.32 → .38 — L'ÉTIQUETTE de campagne, quand la séquence a été lancée
   * AVEC d'AUTRES. Absente = lancée seule, et c'est aussi ce que la salle doit
   * montrer : les deux cas existent en vrai.
   *
   * ⚠️ Deux séquences au moins la partagent, sinon le filtre de campagne
   * s'afficherait avec un groupe d'une personne — exactement ce que la règle
   * refuse (`campaign-label.ts` : une campagne se forme à plusieurs).
   */
  campaign?: string
  /**
   * Lot L-B (#4165) — l'unité des délais ; absente = `calendar_days` (le défaut
   * SQL, l'existant ne change pas en silence). Les séquences multicanal de la
   * salle comptent en jours ouvrés, comme toute séquence NEUVE.
   */
  delayUnit?: OutreachDelayUnit
  /**
   * Lot L-B — la séquence est en PAUSE VACANCES jusqu'à dans N jours (la pause a
   * commencé hier). Exige `status: 'paused'`.
   */
  vacationUntilDays?: number
  /** L'état de chaque étape, dans l'ordre du gabarit (ou de `kind` quand il est posé). */
  steps: readonly {
    status: OutreachStepStatus
    offsetDays: number
    /** Lot L-B — la nature de l'étape quand le plan est multicanal (sinon celle du gabarit). */
    kind?: OutreachStepKind
    /** Lot L-B — le libellé de l'étape multicanal (sinon celui du gabarit). */
    label?: string
    /** Lot L-B — l'issue DÉCLARÉE (invitation acceptée ou non, issue d'appel). */
    outcome?: string
    /** Lot L-B — l'étape a été sautée automatiquement : sa raison, journalisée. */
    skipReason?: string
    /**
     * #2909 (#2378.2) — le signal d'ouverture/clic RAPPORTÉ par le commercial
     * sur cette étape (jamais détecté automatiquement). Absent = rien
     * rapporté, le cas le plus courant — seedé sur UNE étape e-mail pour que
     * l'écran ne montre pas QUE le cas vide.
     */
    engagementSignal?: OutreachEngagementSignal
  }[]
}[] = [
  {
    contact: 'Lorenzo Bini Smaghi',
    template: 'prospection_3_touches',
    status: 'active',
    campaign: 'DSI grands comptes — septembre',
    steps: [
      { status: 'done', offsetDays: -4, engagementSignal: 'opened' },
      // Due AUJOURD'HUI : c'est elle qui remplit le compteur du même nom.
      { status: 'pending', offsetDays: 0 },
      { status: 'pending', offsetDays: 6 },
    ],
  },
  {
    // #2325.35 — LA COLLISION DE SOLLICITATION DE CONTACT, SEMÉE POUR LA SALLE.
    // Le même contact que ci-dessus reçoit une SECONDE cadence ACTIVE,
    // indépendante (aucune campagne partagée) : exactement le cas que
    // `detectContactSolicitationCollisions` doit remonter — sans lui, l'écran
    // livré resterait vide devant un prospect (craft rule n°9).
    contact: 'Lorenzo Bini Smaghi',
    template: 'referred_contact',
    status: 'active',
    steps: [
      { status: 'done', offsetDays: -2 },
      { status: 'pending', offsetDays: 2 },
    ],
  },
  {
    // #4163 LF — un siège sans nom ne reçoit pas de séquence : la cadence vise une personne NOMMÉE (même fonction, SNCF).
    contact: 'Grégory Pinault',
    template: 'cold_linkedin',
    status: 'active',
    campaign: 'DSI grands comptes — septembre',
    steps: [
      { status: 'done', offsetDays: -3 },
      { status: 'pending', offsetDays: 4 },
      { status: 'pending', offsetDays: 9 },
      { status: 'pending', offsetDays: 14 },
    ],
  },
  {
    contact: 'Isabelle Rouault',
    template: 'fresh_signal',
    status: 'completed',
    // #2873 (28/09/2026, recette salle démo Maëlle Lorquin) — la dernière
    // étape portait `-5` : à sept jours de la fenêtre de
    // `sequenceCompletedCrmUpdate` (`routine-executors.ts`), une salle prêtée
    // plusieurs jours sans être réensemencée pouvait sortir de la fenêtre
    // AVANT la visite suivante. Resserrée à `-3` (marge de quatre jours,
    // jamais zéro) : voir {@link seedSequenceCompletedCrmUpdateProposal}, qui
    // sème le PRODUIT de cette routine sur cette même échéance.
    steps: [
      { status: 'done', offsetDays: -12 },
      { status: 'done', offsetDays: -12 },
      { status: 'done', offsetDays: -9 },
      { status: 'done', offsetDays: -3 },
    ],
  },
  {
    contact: seatName('Directeur technique — entité numérique voyageurs'),
    template: 'cold_email',
    status: 'active',
    steps: [
      { status: 'done', offsetDays: -6 },
      { status: 'pending', offsetDays: 3 },
      { status: 'pending', offsetDays: 9 },
      { status: 'pending', offsetDays: 17 },
    ],
  },
  // #3421 lot G03 (30/09) — la condition d'arrêt, sur une séquence réelle du
  // cockpit : premier envoi FAIT, puis un refus — les deux étapes restantes
  // SAUTÉES (jamais relancées, doctrine « ne pas relancer après un refus
  // ferme »), exactement ce que `stopSequencesForContact` produit en
  // production sur une réponse de refus.
  {
    // #4163 LF — un siège sans nom ne reçoit pas de séquence : la cadence vise une personne NOMMÉE (même fonction, SNCF).
    contact: 'Grégory Pinault',
    template: 'nurturing',
    status: 'cancelled',
    cancelReason: 'refusal',
    steps: [
      { status: 'done', offsetDays: -20 },
      { status: 'skipped', offsetDays: 10 },
      { status: 'skipped', offsetDays: 40 },
    ],
  },
  // Lot D01 (06/10/2026, #3700) — LA CARTE « SÉQUENCES » DE LA FICHE : un contact
  // de la salle (Mathieu Brossard, interlocuteur SIMULÉ du client de livraison, SNCF —
  // compte GO) inscrit à UNE séquence active, premier message fait, relance à venir :
  // la fiche montre le résumé compact (nom, état, dernière étape, prochaine action).
  // Les contacts sans séquence (Nadia Perrin, Julien Castaing) montrent, eux, la fiche
  // SANS bloc : les deux états sont dans la salle.
  {
    contact: 'Mathieu Brossard',
    template: 'cold_email',
    status: 'active',
    steps: [
      { status: 'done', offsetDays: -5 },
      { status: 'pending', offsetDays: 2 },
      { status: 'pending', offsetDays: 8 },
      { status: 'pending', offsetDays: 16 },
    ],
  },
  // Lot L-B (#4165) — LES SÉQUENCES MULTICANAL DE LA SALLE (craft rule n°9). Une
  // campagne de trois cadences, en jours OUVRÉS, qui montrent chacune un cas :
  //  · Younes Berrada (LinkedIn seul, aucune adresse) : l'invitation n'est pas
  //    acceptée, le message qui la suit a été SAUTÉ — séquence linéaire, aucune
  //    branche — et la suite attend ;
  //  · Farah Guillet : invitation acceptée, message envoyé, appel JOINT, puis
  //    « RDV pris » — la séquence est terminée sur `meeting_booked` ;
  //  · Salomé Vidal : la séquence est en PAUSE VACANCES (reprise dans 6 jours) —
  //    c'est elle que le bandeau de l'écran Séquences nomme.
  // Les trois partagent les mêmes natures aux mêmes positions : les stats par
  // étape de la campagne lisent des colonnes comparables.
  {
    contact: 'Younes Berrada',
    template: 'cold_linkedin',
    status: 'active',
    campaign: 'Multicanal — octobre',
    delayUnit: 'business_days',
    steps: [
      { status: 'done', offsetDays: -6, kind: 'linkedin_invite', label: 'Invitation LinkedIn', outcome: 'pending' },
      {
        status: 'skipped',
        offsetDays: -3,
        kind: 'linkedin_message',
        label: 'Message après acceptation',
        skipReason: 'linkedin_invite_not_accepted',
      },
      { status: 'pending', offsetDays: 2, kind: 'call', label: 'Appel de découverte' },
    ],
  },
  {
    contact: 'Farah Guillet',
    template: 'cold_linkedin',
    status: 'cancelled',
    cancelReason: 'meeting_booked',
    campaign: 'Multicanal — octobre',
    delayUnit: 'business_days',
    steps: [
      { status: 'done', offsetDays: -12, kind: 'linkedin_invite', label: 'Invitation LinkedIn', outcome: 'accepted' },
      { status: 'done', offsetDays: -9, kind: 'linkedin_message', label: 'Message après acceptation' },
      { status: 'done', offsetDays: -5, kind: 'call', label: 'Appel de découverte', outcome: 'reached' },
      { status: 'skipped', offsetDays: 0, kind: 'email', label: 'Relance e-mail' },
    ],
  },
  {
    contact: 'Salomé Vidal',
    template: 'cold_linkedin',
    status: 'paused',
    vacationUntilDays: 6,
    campaign: 'Multicanal — octobre',
    delayUnit: 'business_days',
    steps: [
      { status: 'done', offsetDays: -8, kind: 'linkedin_invite', label: 'Invitation LinkedIn', outcome: 'accepted' },
      { status: 'pending', offsetDays: 7, kind: 'linkedin_message', label: 'Message après acceptation' },
      { status: 'pending', offsetDays: 10, kind: 'call', label: 'Appel de découverte' },
    ],
  },
]

/**
 * #3403.7 — LES VOIES D'ACCÈS PERSONNELLES SEMÉES, sur deux contacts déjà
 * semés (`DEMO_DOSSIERS` : Philippe Marchand et Isabelle Rouault chez SNCF) —
 * aucun contact fictif créé pour l'occasion.
 *
 * Deux voies, deux certitudes : Philippe Marchand (`consultant`, VÉRIFIÉ) rend un
 * accès vérifié ; Isabelle Rouault (`explicit_recommendation`, non vérifié)
 * reste une relation probable — la carte de l'onglet Accès doit montrer les
 * DEUX rendus, jamais une seule certitude (#3403.14).
 *
 * Exporté pour que `demo-coverage.spec.ts` vérifie le semis SANS relire le
 * corps de `seedPersonalAccessPaths`, même convention que `DEMO_OUTREACH_PLAN`
 * ci-dessus.
 */
export const DEMO_PERSONAL_ACCESS_PATH_SEEDS: readonly {
  contact: string
  linkKind: string
  verified: boolean
  authorizedAt: string
  channel: string
  warmth?: 'distant' | 'cordial' | 'close'
}[] = DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS.map(({ authorizedDaysAgo, authorizedAt, ...seed }) => ({
  ...seed,
  authorizedAt: authorizedAt ?? demoDaysAgo(authorizedDaysAgo ?? 0),
}))

/**
 * #3403 — LES QUATRE VOIES QUI NE PASSENT PAS PAR UN LIEN DÉCLARÉ, semées sur
 * des comptes DÉJÀ présents : l'état de relation CRM (`client_existant`), une
 * ESN référencée en rang 1 avec des placements réels (`esn_referencee`), et un
 * signal de changement de poste (`personne_changement_poste`).
 */
export { DEMO_PERSONAL_ACCESS_EXTRA_SEEDS }

/**
 * #3407.5 — « VEILLE À RÉVEILLER », SEMÉE : le compte déjà en veille
 * (`sprint: 'watch'`) entre en veille il y a 45 jours et reçoit un signal il y
 * a 10 jours — un fait DÉJÀ vrai à l'ouverture de la salle, jamais un geste
 * que la démo ferait pendant la visite. `DecisionStrip` (Pilotage) le propose,
 * sans jamais basculer le compte.
 *
 * Le compte N'EST PAS écrit en dur : c'est celui des `DEMO_DOSSIERS` qui porte
 * `sprint: 'watch'`. Le seul qui le portait (le dossier retiré le 01/10/2026)
 * a quitté la salle et les trois comptes cibles restants occupent d'autres
 * niveaux : `accountName` vaut `null` — la veille à réveiller n'est PAS
 * démontrable — jusqu'à l'arrivée d'un dossier en veille (ENGIE, TotalEnergies
 * ou Alstom, autre lot). Elle se rallume alors toute seule, sans toucher ce
 * fichier.
 */
export const DEMO_WATCH_WAKE_SEED = {
  accountName: DEMO_DOSSIERS.find(dossier => dossier.account.sprint === 'watch')?.account.company_name ?? null,
  enteredWatchDaysAgo: 45,
  signal: {
    label: 'Prise de poste annoncée à la tête de la fonction technique',
    detail: 'Une prise de poste récente rouvre la question du prestataire en place (signal de démonstration).',
    detectedDaysAgo: 10,
  },
} as const

/** Taille des lots d'écriture des contacts d'un dossier (voir `saveDossierContacts`). */
const SEED_CONTACT_CHUNK = 200

function demoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Postgres unique-violation. Driver-agnostic : TypeORM porte parfois le code
 * sur `.code`, parfois seulement sur le `.driverError` enveloppé — même garde
 * que `ContactsService.isUniqueViolation` (contacts.service.ts), dupliquée ici
 * à l'identique (comme dans `target-lists.service.ts`, `mailbox.service.ts`,
 * `sprints.service.ts`…) : une garde structurelle de trois lignes, pas une
 * règle métier — GA-26 vise les réglages, pas cette vérification.
 */
/**
 * #3289 — le dernier instant écoulé qui tombe un `weekday` (1 = lundi … 5 =
 * vendredi, UTC) à `utcHour`:00 UTC. Le jour courant compte seulement si
 * l'heure est déjà passée — jamais un instant futur pour une action FAITE.
 */
function lastSlotInstant(now: number, slot: { weekday: number; utcHour: number }): Date {
  for (let back = 0; back <= 7; back += 1) {
    const day = new Date(now - back * 24 * 60 * 60 * 1000)
    if (day.getUTCDay() !== slot.weekday) continue
    const candidate = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), slot.utcHour)
    if (candidate <= now) return new Date(candidate)
  }
  // Même jour de semaine, heure pas encore passée : la semaine précédente.
  const day = new Date(now - 7 * 24 * 60 * 60 * 1000)
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), slot.utcHour))
}

function isUniqueViolation(cause: unknown): boolean {
  const err = cause as { code?: string; driverError?: { code?: string } }
  return err?.code === '23505' || err?.driverError?.code === '23505'
}

/**
 * Le type RÉEL d'une colonne de `esn_profiles`, lu sur l'entité.
 *
 * `getMetadataArgsStorage()` plutôt qu'une `DataSource` : ce sont les décorateurs
 * eux-mêmes, disponibles dès l'import, donc lisibles par un test sans base.
 */
export function esnProfileColumnType(column: string): string | null {
  const found = getMetadataArgsStorage()
    .columns.filter(candidate => candidate.target === EsnProfileEntity)
    .find(candidate => (candidate.options.name ?? candidate.propertyName) === column)
  const type = found?.options.type
  return typeof type === 'string' ? type : null
}

/**
 * #2582 — LE CAST SE DÉCIDE SUR LE TYPE DE LA COLONNE, JAMAIS SUR LA FORME DE LA
 * VALEUR.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION (18/09/2026)
 * ───────────────────────────────────────────────────────────────────────────
 * Le placeholder se choisissait avec `Array.isArray(value) ? '::text[]' : ''`.
 * Un prédicat qui lit la forme JS ne peut pas distinguer un tableau de CHAÎNES
 * (colonne `text[]`) d'un tableau d'OBJETS (colonne `jsonb`). `esn_objectives`
 * est le second, et la base a rendu, à chaque visite de la salle de démo :
 *
 *   column "esn_objectives" is of type jsonb but expression is of type text[]
 *
 * Cette écriture est la PREMIÈRE du semis. Elle jetait donc avant toute autre,
 * `DemoPoolService.tidy()` avalait l'exception pour ne pas fermer la porte
 * (c'est son rôle, et il est juste), et le prospect entrait dans une salle
 * VIDE : zéro compte, zéro mission, zéro talent, zéro besoin. Le lien de
 * démonstration — la seule surface publique du produit — ne montrait plus rien,
 * sans qu'aucun 500 ne le signale.
 *
 * La correction ne rend pas le prédicat plus malin : elle lui retire la
 * question. C'est la COLONNE qui sait son type. Quatre colonnes de
 * `esn_profiles` sont `jsonb` (`answer_meta`, `esn_objectives`,
 * `offer_portfolio`, `profile_provenance`) ; une cinquième ajoutée demain sera
 * traitée juste sans que personne y pense.
 */
export function buildEsnProfileBindings(
  entries: ReadonlyArray<[string, unknown]>,
  columnType: (column: string) => string | null,
): { placeholders: string[]; values: unknown[] } {
  const placeholders: string[] = []
  const values: unknown[] = []
  entries.forEach(([column, value], index) => {
    // Les deux premiers paramètres positionnels sont user_id/workspace_id.
    const position = index + 3
    if (columnType(column) === 'jsonb') {
      // Une colonne `jsonb` reçoit du JSON, pas un tableau Postgres : `node-pg`
      // sérialise un tableau JS en littéral `{a,b}`, ce qui n'est pas du JSON.
      placeholders.push(`$${position}::jsonb`)
      values.push(JSON.stringify(value))
      return
    }
    placeholders.push(Array.isArray(value) ? `$${position}::text[]` : `$${position}`)
    values.push(value)
  })
  return { placeholders, values }
}

/** #2979 — la vue enregistrée de la salle : les critères de l'écran « Missions » (facette « à renouveler »). */
export const DEMO_MISSION_SAVED_VIEW = {
  name: 'Missions à renouveler',
  filters: { facets: ['toRenew'] },
} as const

/**
 * Louis 23/10 (lot R23-N-WEB-A) — la vue enregistrée du VIVIER (scope `talents`) : « Mes vues », revenu dans la barre de
 * Théo, ne s'ouvre pas sur la seule ligne « Enregistrer la vue courante… ». Un critère réel du contrat de recherche
 * (`talentSearchQuerySchema`) : la disponibilité déclarée « immédiate », que des profils de la salle portent.
 */
export const DEMO_TALENT_SAVED_VIEW = {
  name: 'Disponibles maintenant',
  filters: { availability: 'immediate' },
} as const

/**
 * Théo decouvrir-historique — les recherches enregistrées de la salle (scope `discover`) : « Mes recherches »
 * ne s'ouvre pas sur un bloc « Enregistrées » vide devant un prospect. Une personnelle sans cadence, une
 * partagée rejouée chaque semaine (dans l'application, jamais par e-mail), une partagée sans cadence. Les
 * critères sont réels (mots-clés, technologie observée) : rien d'un résultat figé.
 */
export const DEMO_DISCOVER_SAVED_VIEWS = [
  {
    name: 'SAP · France',
    filters: { technologiesObserved: 'SAP' },
    objective: 'Placer les deux consultants SAP disponibles en janvier.',
    shared: true,
    alertFrequency: 'weekly',
    alertChannel: 'in_app',
    lastRunDaysAgo: 4,
  },
  {
    name: 'Rang 2 cyber',
    filters: { keywords: 'cybersécurité', externalRecourseObserved: true },
    objective: 'Trouver deux titulaires de marchés cyber ouverts au rang 2.',
    shared: true,
    alertFrequency: 'manual',
    alertChannel: null,
    lastRunDaysAgo: null,
  },
  // #4285.1 — la recherche PROPOSÉE à l'arrivée (première ou dernière créée selon le tri de l'écran) doit montrer la
  // levée de fonds datée et son lien : « Banque & assurance · Île-de-France » (département 75, aucune levée) reste donc au
  // MILIEU. Gardé par `demo-discover-arrival-coverage.spec.ts`.
  {
    name: 'Banque & assurance · Île-de-France',
    filters: { keywords: 'banque assurance', department: '75' },
    objective: 'Ouvrir trois comptes Data / BI avant la fin de l’année.',
    shared: false,
    alertFrequency: 'manual',
    alertChannel: null,
    lastRunDaysAgo: 2,
  },
  // #4556.2 — « Reprendre » sur ces deux recherches rend des cartes (la salle répond la liste scriptée), jamais
  // « Résultat non vérifiable » ni une requête chargée sans carte. Gardées ≥ 8 cartes par `demo-discover-arrival-coverage.spec.ts`.
  {
    name: 'vue · Lille',
    filters: { keywords: 'vue', technologiesObserved: 'vue' },
    objective: 'Repérer les comptes qui recrutent des développeurs Vue dans les Hauts-de-France.',
    shared: false,
    alertFrequency: 'manual',
    alertChannel: null,
    lastRunDaysAgo: 6,
  },
  {
    name: 'Albi · 250 à 999',
    filters: { headcount: ['250-999'] },
    objective: 'Ouvrir deux comptes ETI en Occitanie.',
    shared: false,
    alertFrequency: 'manual',
    alertChannel: null,
    lastRunDaysAgo: 9,
  },
] as const

/**
 * Étape et issue du projet semé pour un besoin FERMÉ de la démo. Un besoin annulé n'a PAS d'étape
 * « abandoned » (refusée par `opportunities_stage_check`, ce qui a mis la salle hors service le 11/10) :
 * il dort (`dormant`) avec l'issue `abandoned`, comme l'import (`import-writer.service.ts`).
 */
export function closedNeedProjectStatus(status: 'won' | 'lost' | 'cancelled'): {
  stage: 'won' | 'lost' | 'dormant'
  outcome: 'won' | 'lost' | 'abandoned'
} {
  if (status === 'won') return { stage: 'won', outcome: 'won' }
  if (status === 'lost') return { stage: 'lost', outcome: 'lost' }
  return { stage: 'dormant', outcome: 'abandoned' }
}

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name)

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // #2150.14/.18 — le favori GOLDEN de la salle (voir `seedWorkspace`, plus bas).
    @InjectRepository(UserFavoriteEntity)
    private readonly favorites: Repository<UserFavoriteEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntityRow)
    private readonly accountEntities: Repository<AccountEntityRow>,
    @InjectRepository(AttackAngleEntity)
    private readonly attackAngles: Repository<AttackAngleEntity>,
    @InjectRepository(ActionPlanEntity)
    private readonly actionPlans: Repository<ActionPlanEntity>,
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    // #2569.4 — les documents d'ORIGINE du lot N (import ZIP/messagerie) :
    // deux fichiers pour la même personne, les deux consultables.
    @InjectRepository(ConsultantDocumentEntity)
    private readonly consultantDocuments: Repository<ConsultantDocumentEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    @InjectRepository(MemberObjectiveEntity)
    private readonly memberObjectives: Repository<MemberObjectiveEntity>,
    @InjectRepository(WorkflowRunEntity)
    private readonly workflowRuns: Repository<WorkflowRunEntity>,
    @InjectRepository(RagDocumentEntity)
    private readonly ragDocuments: Repository<RagDocumentEntity>,
    @InjectRepository(NoteEntity)
    private readonly notes: Repository<NoteEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    @InjectRepository(ConsultantSkillEntity)
    private readonly consultantSkills: Repository<ConsultantSkillEntity>,
    @InjectRepository(ConsultantExperienceEntity)
    private readonly consultantExperiences: Repository<ConsultantExperienceEntity>,
    // #2185.51 — un brouillon de message, seedé pour montrer le geste.
    @InjectRepository(TalentPreparedMessageEntity)
    private readonly talentPreparedMessages: Repository<TalentPreparedMessageEntity>,
    // La MÊME matérialisation qu'en production : la salle de démonstration ne
    // fabrique aucun projet, elle exécute la projection déterministe sur les
    // dossiers d'exemple.
    private readonly projects: ProjectsService,
    // BEL-SC-224 (#3253, P0) — même discipline : le diagnostic du maillon
    // faible de la salle est CALCULÉ à la fin du semis, sur les comptes,
    // actions et talents qui viennent d'être écrits — jamais une ligne tapée
    // à la main qui pourrait diverger du calcul réel.
    private readonly weakestLinkDiagnosis: WeakestLinkDiagnosisService,
    // Le dépôt des VRAIS fichiers de la salle (31/08/2026) : sans eux, les deux
    // écrans de pièces jointes s'ouvrent devant un prospect avec un bouton qui
    // ne mène nulle part — le défaut que ce lot corrige en production.
    private readonly storage: StorageClient,
    // #2571.5 — le dossier d'appel d'offres scripté de la salle (`seedRfp`).
    @InjectRepository(RfpEntity)
    private readonly rfps: Repository<RfpEntity>,
    // #3104 (27/09/2026) — au moins UNE conversation VISIBLE dans le panneau
    // « Conversations » de /chat au premier chargement (voir `seedWorkspace`,
    // et la raison écrite au-dessus de `chat_messages` dans `demo-coverage.ts`).
    @InjectRepository(ChatMessageEntity)
    private readonly chatMessages: Repository<ChatMessageEntity>,
    // #2946 — la demande d'approbation Action OS EN ATTENTE derrière la tâche
    // `source = 'action_os_approval'` (`seedWorkspace`, `DEMO_ACTION_OS_APPROVAL`).
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvalRequests: Repository<ApprovalRequestEntity>,
    // #4158.13 — les comptes d'authentification des collègues fictifs (`seedColleagues`).
    // `@Optional()` et EN DERNIER : sans lui (specs, hors Supabase), la salle reste
    // à un seul occupant au lieu de casser.
    @Optional() private readonly authGateway?: SupabaseAuthGateway,
  ) {}

  /**
   * #3699.6 — le catalogue d'assets outreach de la salle, et le vrai PDF fictif
   * de ceux qui en portent un (domaine `outreach_asset_file`). Un dépôt qui
   * échoue laisse l'asset SANS fichier (`seedStoredFile` rend `null`) — jamais
   * un identifiant sans octets derrière.
   */
  private async seedOutreachAssets(workspaceId: string, ownerUserId: string, depositedOn: string): Promise<void> {
    for (const asset of DEMO_OUTREACH_ASSETS) {
      const objectId = asset.file
        ? await this.seedStoredFile({
            workspaceId,
            domain: 'outreach_asset_file',
            fileKey: asset.file.fileKey,
            fileName: asset.file.fileName,
            title: asset.file.title,
            lines: asset.file.lines,
            depositedOn,
          })
        : null
      await this.accounts.manager.query(
        `INSERT INTO outreach_assets (workspace_id, user_id, title, description, category, usage_rights, storage_object_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [workspaceId, ownerUserId, asset.title, asset.description, asset.category, asset.usageRights, objectId],
      )
    }
  }

  /**
   * Dépose un fichier de la salle et écrit sa ligne — et rend son identifiant.
   *
   * ⚠️ Rend `null` quand le dépôt échoue, et ne l'invente jamais : la ligne
   * n'est alors PAS écrite, et l'écran retombe sur ce qu'il sait déjà dire —
   * « cette pièce est référencée, on ne la détient pas ». Un identifiant écrit
   * sans octets derrière aurait produit exactement le bouton mort que ce lot
   * existe pour supprimer.
   *
   * L'identifiant est DÉRIVÉ (`demoStorageObjectId`) et non tiré au hasard :
   * la salle est re-semée à chaque visiteur, et un identifiant neuf à chaque
   * fois laisserait derrière lui les octets du semis précédent.
   */
  private async seedStoredFile(input: {
    workspaceId: string
    domain: StorageDomain
    fileKey: string
    fileName: string
    title: string
    lines: readonly string[]
    /** La date du dépôt — l'échéance de conservation s'en déduit UNE fois. */
    depositedOn: string
    /** #3803 — un fichier déjà fabriqué (docx, xlsx, pptx…) ; absent = le PDF de `title`/`lines`. */
    file?: { bytes: Buffer; contentType: string }
  }): Promise<string | null> {
    const objectId = demoStorageObjectId(input.workspaceId, input.fileKey)
    const objectPath = storageObjectPath({
      workspaceId: input.workspaceId,
      domain: input.domain,
      objectId,
      fileName: input.fileName,
    })
    const { bytes, contentType } = input.file ?? {
      bytes: demoPdf(input.title, input.lines),
      contentType: 'application/pdf',
    }
    const retentionUntil = storedFileRetentionUntil(input.domain, input.depositedOn)
    if (!retentionUntil) return null

    try {
      await this.storage.put(objectPath, bytes, contentType)
    } catch (error) {
      // Le semis d'une salle ne DOIT pas s'arrêter parce que le magasin est
      // indisponible : tout le reste de la démonstration reste montrable.
      this.logger.warn(`Fichier de démonstration non déposé (${input.fileName}) : ${(error as Error).message}`)
      return null
    }

    // `ON CONFLICT (id)` : le semis est REJOUÉ à chaque visiteur, et la ligne
    // porte le même identifiant dérivé. Sans lui, le second passage lèverait.
    await this.accounts.manager.query(
      `INSERT INTO storage_objects
         (id, workspace_id, domain, object_path, file_name, content_type, byte_size, retention_until)
       VALUES ($1, $2, $3, $4, $5, $8, $6::bigint, $7::date)
       ON CONFLICT (id) DO UPDATE SET byte_size = EXCLUDED.byte_size, updated_at = now()`,
      [
        objectId,
        input.workspaceId,
        input.domain,
        objectPath,
        input.fileName,
        bytes.byteLength,
        retentionUntil,
        contentType,
      ],
    )
    return objectId
  }

  /**
   * Provision a demo workspace for `ownerUserId` and seed the golden dossiers.
   *
   * The ACTIVE workspace of a user is their oldest OWNED workspace
   * (`WorkspaceContextService.resolveActiveWorkspace`), so a second workspace
   * would never activate — instead:
   *  - the user's owned workspace is CONVERTED to demo when it is empty (the
   *    normal flow: a fresh account created just for demos, e.g.
   *    `demo@bellum-ai.com`, whose signup-seeded workspace holds no data);
   *  - a workspace that already holds REAL accounts is refused (409) so an
   *    operator typo can never flip a customer's workspace into free-demo mode;
   *  - a user owning no workspace at all gets a new demo one (+ owner member).
   *
   * Idempotent: re-calling on an existing demo workspace re-checks the seed and
   * inserts nothing when the dossiers are already there.
   */
  async createDemoWorkspace(
    ownerUserId: string,
    name?: string,
    opts: { ensureProfile?: boolean } = {},
  ): Promise<DemoWorkspaceResult> {
    const owner = await this.profiles.findOne({ where: { user_id: ownerUserId } })
    if (!owner) {
      // Le profil est créé PARESSEUSEMENT au premier chargement de l'app
      // (`ProfilesService.getMe`), donc un compte démo fraîchement créé côté
      // Supabase Auth n'en a pas encore. `ensureProfile` (opérateur, one-shot de
      // provisioning) le crée ici pour que le seed n'exige pas d'ouvrir l'app
      // d'abord. Si `ownerUserId` n'est pas un vrai utilisateur, la contrainte
      // de clé étrangère `profiles.user_id → auth.users` rejette l'insert — on
      // ne fabrique donc jamais un profil orphelin. Sans le flag, comportement
      // inchangé : 404.
      if (!opts.ensureProfile) {
        throw new NotFoundException(`User ${ownerUserId} not found`)
      }
      await this.profiles.save(this.profiles.create({ user_id: ownerUserId }))
    }

    const owned = await this.workspaces.findOne({
      where: { owner_user_id: ownerUserId },
      order: { created_at: 'ASC' },
    })

    let workspace: WorkspaceEntity
    if (owned) {
      const existingAccounts = await this.accounts.count({ where: { workspace_id: owned.id } })
      if (!owned.is_demo && existingAccounts > 0) {
        // Fail closed: converting a workspace that already holds real dossiers
        // would grant free actions on real data. Use a dedicated demo user.
        throw new ConflictException(
          'Ce workspace contient déjà des dossiers réels — impossible de le convertir en démo. Utilise un utilisateur dédié à la démo (compte fraîchement créé).',
        )
      }
      owned.is_demo = true
      owned.name = name ?? DEFAULT_DEMO_NAME
      // #4173 — l'échantillonnage pour les évals est ALLUMÉ par défaut depuis ce lot ;
      // une salle de démonstration n'a pas le droit de le cocher (403 au contrôleur).
      // Forcé ici plutôt que confié au défaut de colonne, qui ne distingue pas démo/réel.
      owned.chat_eval_sampling_enabled = false
      workspace = await this.workspaces.save(owned)
    } else {
      workspace = await this.workspaces.save(
        this.workspaces.create({
          name: name ?? DEFAULT_DEMO_NAME,
          owner_user_id: ownerUserId,
          is_demo: true,
          chat_eval_sampling_enabled: false,
        }),
      )
      await this.members.save(this.members.create({ workspace_id: workspace.id, user_id: ownerUserId, role: 'owner' }))
    }

    const seed = await this.seedWorkspace(workspace.id, ownerUserId)
    this.logger.log(
      `Demo workspace ready: ${workspace.id} (owner=${ownerUserId}, seeded=${seed.seeded}, accounts=${seed.accounts})`,
    )
    return {
      workspaceId: workspace.id,
      name: workspace.name,
      ownerUserId,
      isDemo: true,
      accounts: seed.accounts,
      seeded: seed.seeded,
    }
  }

  /**
   * Seed the golden dossiers into `workspaceId`. IDEMPOTENT (lazy-seed pattern,
   * same idea as `LibraryService.ensureSeeded`): when the workspace already has
   * any account, nothing is inserted — a re-call can never duplicate dossiers.
   * Every row is stamped with the workspace + owner and marked demo (`source =
   * 'demo'` on contacts, `raw_analysis.demo_seed` on accounts) so the fictional
   * data stays identifiable and confined.
   */
  async seedWorkspace(workspaceId: string, ownerUserId: string): Promise<{ seeded: boolean; accounts: number }> {
    const existing = await this.accounts.count({ where: { workspace_id: workspaceId } })
    if (existing > 0) {
      await this.nameOwnerIfUnnamed(ownerUserId)
      await this.backfillRecommendedRoute(workspaceId)
      return { seeded: false, accounts: existing }
    }

    // #4291 J — la VARIANTE de la salle (staffing ou forfait / conseil), lue sur son numéro : même semis pour
    // les deux, la variante forfait ajoute ses dossiers et ses projets à la fin (`seedForfaitVariant`).
    const variant = await this.roomVariant(workspaceId)

    // L'IDENTITÉ de la salle, rétablie comme le sont ses dossiers.
    await this.restoreOwnerIdentity(workspaceId, ownerUserId)

    /** Contacts déjà insérés, par nom — l'historique les référence par nom et
     *  n'a pas d'autre moyen de retrouver l'id généré à l'insert. */
    const contactIds = new Map<string, string>()
    const accountIds = new Map<string, string>()

    // Recette du 01/10/2026 (« Préparation » ≈ 60 s) : une durée PAR PHASE, loguée une
    // fois à la fin — des noms de phase et des millisecondes, jamais une donnée.
    const laps: string[] = []
    let lapStart = Date.now()
    const lap = (name: string): void => {
      const now = Date.now()
      laps.push(`${name}=${now - lapStart}ms`)
      lapStart = now
    }

    for (const dossier of DEMO_DOSSIERS) {
      await this.seedDossier(dossier, workspaceId, ownerUserId, accountIds, contactIds)
      lap(`dossier:${dossier.account.company_name.replace(/\s+/g, '-')}(${dossier.contacts.length})`)
    }

    // #2150.14/.18 — REVIREMENT ASSUMÉ DE #1800 (Louis 15/09/2026) : le favori
    // de compte revient, donc la salle doit en porter un — sinon le filtre
    // « Mes favoris » de `/accounts` s'ouvre sur du VIDE devant un prospect
    // (craft rule 9). Société Générale, et elle seule : comme dans un vrai
    // portefeuille, favori reste l'exception, pas la règle — des comptes tous
    // favoris ne prouveraient rien que le filtre sait déjà faire avec un.
    //
    // « Portés par un collègue » (#2150.15) N'A PAS son pendant ici : la salle
    // de démonstration n'a qu'UN occupant (voir la note sur `assigned_to`
    // plus haut, #1408) — inventer un second membre pour ce seul filtre
    // romprait cette décision. `demo-coverage.ts` porte la raison écrite.
    const favoriteAccountId = accountIds.get('Société Générale')
    if (favoriteAccountId) {
      await this.favorites.save(
        this.favorites.create({ user_id: ownerUserId, entity_type: 'account', entity_id: favoriteAccountId }),
      )
    }

    // #4267 — les comptes SUIVIS de la salle (un suivi est un geste explicite, 3 au plus).
    await this.seedAccountFollows(workspaceId, ownerUserId, accountIds)
    // Théo A signaux — la bibliothèque `/signals` et « Mes veilles » ne s'ouvrent pas vides.
    await this.seedSignalLibrary(workspaceId, ownerUserId, accountIds)

    // #2151.70 (16/09/2026, décision Louis) — LA CLOCHE, SEMÉE. Voir
    // {@link seedNotifications} pour le récit complet.
    await this.seedNotifications(ownerUserId, accountIds, workspaceId)

    // Boucle « salle incomplète » du 29/09/2026 : les périmètres s'écrivent AVANT
    // ce qui les cherche par leur nom — `seedCompanionData` (le compte client
    // d'exemple, `accounts.business_unit_id`, #2989) et la règle « Agence Lyon ».
    // Posés après, `demoBusinessUnitId` rendait `null`, la colonne restait vide
    // et `readRoom` re-purgeait la salle à CHAQUE entrée. Ne dépend de rien.
    await this.seedBusinessUnits(workspaceId, ownerUserId)
    lap('unites')

    // P05.a (#3246, lot 09/10) — la base anonyme commune de la salle : quatre
    // espaces FICTIFS, scope `demo`, jamais mêlés au réel. Voir {@link seedSharedBase}.
    await this.seedSharedBase()

    await this.seedCompanionData(workspaceId, ownerUserId, accountIds, contactIds)
    lap('companion')

    // L'HISTORIQUE DE CORRECTION de l'organigramme (OrgGraph FINAL §7). Sans
    // lui, le tiroir « Historique des corrections » s'ouvre VIDE devant un
    // prospect, et « versionné et réversible » n'a rien à montrer.
    //
    // ⚠️ LIT `accountIds` : vient donc APRÈS la boucle qui le remplit.
    await this.seedOrgCorrections(workspaceId, ownerUserId, accountIds)
    await this.seedOrgEnrichmentJobs(workspaceId, ownerUserId, accountIds)
    // #3235 — l'historique des analyses et la révision de verdict de Société Générale.
    await this.seedAnalysisRuns(workspaceId, ownerUserId, accountIds)
    lap('organigramme')

    // LA MÉMOIRE COLLECTIVE (01/09/2026) — le journal de contribution, sans
    // lequel le bandeau du bas dit « pas assez d'historique pour mesurer ».
    //
    // ⚠️ LIT `accountIds` : vient donc APRÈS la boucle qui le remplit. C'est le
    // défaut « ce qui LIT avant ce qui ÉCRIT », qui avait laissé sept missions
    // sans personne dessus.
    await this.seedBridgeContacts(workspaceId, ownerUserId, accountIds)

    // #1473 — les contacts « à qualifier », sans entreprise connue.
    await this.seedUnqualifiedContacts(workspaceId, ownerUserId)
    // #4016 L6 — un doublon CERTAIN déjà fusionné par Bellum : LIT un contact « à qualifier ».
    await this.seedAutoMergedDuplicate(workspaceId, ownerUserId)

    // #2648.1 — le contact dont l'accroche échoue avec une raison NOMMÉE.
    await this.seedIcebreakerInsufficientContextContact(workspaceId, ownerUserId)

    // #2927 — « Mes contacts personnels » (portée Personnel de l'import).
    await this.seedPersonalContacts(workspaceId, ownerUserId, accountIds)
    // Théo B c3-imports-sources.R4 — l'historique des imports (deux imports terminés).
    await this.seedImportHistory(workspaceId, ownerUserId)

    // #2155.13 — « Mes cibles ». LIT `accountIds` / `contactIds` : après la boucle qui les remplit.
    await this.seedTargetLists(workspaceId, ownerUserId, accountIds, contactIds)
    // #3753.7 — le ciblage tiéré de l'ESN (A/B/C, raison, problématiques) : LIT `accountIds`.
    await this.seedTieredTargetList(workspaceId, ownerUserId, accountIds)
    await this.seedContactTargetLists(workspaceId, ownerUserId, contactIds)
    // #2293.5 — un lot multi-comptes : LIT `accountIds`, après la boucle qui les remplit.
    await this.seedAnalysisBatch(workspaceId, ownerUserId, accountIds)
    await this.seedWorkProgressBatch(workspaceId, ownerUserId, accountIds)
    // #3014 — le résumé de première synchronisation, déjà terminé.
    await this.seedIntegrationSyncRun(workspaceId, ownerUserId)
    // #2284.67-.69 — la correction d'identité semée : LIT `accountIds`.
    await this.seedEntityResolutionCorrection(workspaceId, ownerUserId, accountIds)
    // #4188 — un compte « déjà envoyé » vers le CRM fictif de la salle : LIT `accountIds`.
    await this.seedAccountCrmExport(workspaceId, ownerUserId, accountIds)
    // #4051 — « Importé le … depuis … » sur les fiches d'exemple : un import passé, fictif.
    // #4459.4 — LIT `accountIds` : les contacts apportés de `DEMO_CRM_COMPLETION` restent sans trace.
    await this.seedImportMarks(workspaceId, accountIds)

    // #2455 — un contexte de travail enregistré, PERSONNEL : contrairement à
    // `team_comments` (`DEMO_INTENTIONALLY_EMPTY`, « suppose une équipe »), un
    // contexte n'a besoin que du seul occupant que la salle garantit (#1408).
    await this.seedWorkContext(workspaceId, ownerUserId)

    // #2571.5 — RÉFUTÉ EN RECETTE le 18/09/2026 : `/rfp` s'ouvrait sur « Aucun
    // appel d'offres importé » — la prévisualisation de besoin (#2571.2)
    // était juste, calculée, testée, et personne ne pouvait l'atteindre.
    await this.seedRfp(workspaceId, ownerUserId)

    // #2420.17 — le seuil d'alerte de marge de l'espace. Sans lui, Réglages ›
    // Finance montrerait « non réglé » à un prospect qui vient d'apprendre que
    // le réglage EXISTE.
    await this.seedMarginThreshold(workspaceId)
    await this.seedDocumentIdentity(workspaceId)

    // Marchés locaux (L5, 05/10/2026) — les quatre zones de la salle : Lille, Nantes–Saint-Nazaire, Lyon et axe
    // Genève, Suisse romande. Sans elles, Comptes › « Marchés locaux » s'ouvrirait vide devant un prospect.
    await this.seedMarketZones(workspaceId, ownerUserId)

    // #3754.6 — les postes cibles de l'ESN et leur niveau : sans eux le chemin recommandé de la salle n'aurait
    // jamais la raison « Niveau 1 pour vous — signataire ».
    await this.seedTargetPersonas(workspaceId, ownerUserId)

    // #3756.5 — la bibliothèque de modèles de séquence : deux campagnes fictives, trois étapes chacune.
    await this.seedSequenceTemplates(workspaceId)

    // #4158.30 / #4158.31 — le modèle partagé avec son auteur, et une action déléguée avec sa note.
    await this.seedTeamContinuity(workspaceId, ownerUserId)

    // #3755.9 — la grille de qualification de la salle et Société Générale qualifiée
    // axe par axe. Sans elles, Réglages › Règles d'espace montrerait « aucune grille »
    // et l'onglet Score de la fiche n'aurait pas sa carte de qualification.
    await this.seedQualificationGrid(workspaceId, ownerUserId)

    // #1509→#1515 — LES SÉQUENCES. Elles étaient « vides à dessein » avec pour
    // raison « une séquence sortante seedée laisserait croire que des e-mails
    // partent ». Cette raison ne tient plus : l'écran DIT trois fois que rien
    // ne part — le bandeau des canaux, la mention sous la fenêtre de création,
    // et les statuts eux-mêmes (« Préparée », « Prête à copier », « En attente
    // de ta validation »). Ce que la salle montrait, c'était un cockpit vide.
    //
    // ⚠️ LIT `contactIds` : vient donc APRÈS la boucle qui le remplit.
    lap('pont-et-cibles')
    await this.seedOutreachSequences(workspaceId, ownerUserId, contactIds)
    // Lot L-C (#4166) — les séquences créées depuis un modèle (« Partir d'un modèle »).
    await this.seedPlaybookSequences(workspaceId, ownerUserId, contactIds)
    // #2873 — recette salle démo 28/09/2026 (Maëlle Lorquin) : la séquence
    // `completed` ci-dessus ne produisait AUCUNE trace visible, parce que le
    // balayeur de routines ne tourne jamais en démo (`isDemoWorkspace`,
    // `RoutinesService.runDueFor`). Sème directement le PRODUIT que
    // `sequenceCompletedCrmUpdate` aurait déposé si elle avait tourné — jamais
    // le balayeur lui-même. ⚠️ LIT `contactIds` ET la séquence qui vient
    // d'être posée juste au-dessus : vient donc APRÈS les deux.
    await this.seedSequenceCompletedCrmUpdateProposal(ownerUserId, contactIds)
    // #2366 / #2382 — le centre d'approbation de l'outreach : un message par
    // vue, et un appel en rappel convenu. Même raison d'ordre : lit `contactIds`.
    await this.seedOutreachMessages(workspaceId, ownerUserId, contactIds)
    // Lot L-D1 (#4167) — les règles d'automatisation, leur journal et ce qu'elles ont préparé. LIT les
    // séquences nées d'un modèle (`seedPlaybookSequences`) et `contactIds` : vient après les deux.
    await this.seedAutomations(workspaceId, ownerUserId, contactIds)
    // #4739 — « Mes angles » : deux angles écrits à la main, personnels au commercial de démonstration.
    await this.seedUserAngles(workspaceId, ownerUserId)
    // #4737 — le mandat d'envoi LinkedIn et le résultat du geste : « voie non ouverte ». LIT `contactIds`.
    await this.seedLinkedInMandate(workspaceId, ownerUserId, contactIds)
    // #4163 LF (point 7) — les écritures CRM EN ATTENTE que la file « À traiter » montre : un lot et une écriture seule.
    // Jamais exécutées (`CrmController.decideWrite` saute l'écriture en démonstration).
    await this.seedCrmWriteRequests(workspaceId, ownerUserId)
    // #3702.9 — un mandat d'envoi délégué FICTIF sur les messages validés d'exemple. LIT les messages
    // qui viennent d'être posés : vient donc APRÈS. La démo n'envoie rien (le dispatcher saute les salles de démo).
    await this.seedOutreachDelegation(workspaceId, ownerUserId)
    // #2126.47-.60 (épopée #2787) — le ledger des outcomes commerciaux. Même
    // raison d'ordre que les deux appels ci-dessus : lit `accountIds`/`contactIds`.
    await this.seedCommercialOutcomes(workspaceId, ownerUserId, accountIds, contactIds)
    // #3403.7 — les voies d'accès PERSONNELLES de l'onglet Accès : des
    // autorisations d'introduction déjà ACCORDÉES, classées par type de lien.
    // Même raison d'ordre que les appels ci-dessus : lit `contactIds`.
    await this.seedPersonalAccessPaths(workspaceId, ownerUserId, contactIds, accountIds)
    // #3696 (parité démo, lot K12 07/10) — un brouillon + une variante précédente
    // déjà là à l'ouverture du panneau. Même raison d'ordre : lit `contactIds`.
    await this.seedMessageDraftVersions(workspaceId, ownerUserId, contactIds)
    // #2768 (#2369.9/.10/.7/.8/.14) — un template ACTIF et une proposition de
    // règle EN ATTENTE, pour que « Comparer » et les gestes Adopter/Refuser du
    // NO-GO soient recettables en salle de démo. Ne lit ni `accountIds` ni
    // `contactIds` : peut vivre n'importe où dans l'ordre, posé ici par
    // proximité avec les autres capacités de l'outreach/copilote.
    await this.seedMessageStyle(workspaceId, ownerUserId)
    await this.seedMessageLibrary(workspaceId, ownerUserId)
    await this.seedImportedSequences(workspaceId, ownerUserId)
    await this.seedMissionSavedView(workspaceId, ownerUserId)
    await this.seedTalentSavedView(workspaceId, ownerUserId)
    await this.seedDiscoverSavedViews(workspaceId, ownerUserId)
    lap('outreach')

    // #4016 L6 — le pipe « détecté, à revoir ». LIT les besoins, le vivier et
    // les positionnements semés plus haut : vient donc APRÈS eux.
    await this.seedPipelineDetections(workspaceId)

    // L2 Pilotage › Pipe (Louis 14/10/2026) — catégories déclarées, dates prévues, journal des
    // stades et des montants, dernier contact. LIT `accountIds` ET les opportunités déjà semées
    // (les déclarations s'y posent par libellé) : après les deux.
    await this.seedPipeDeclarations(workspaceId, ownerUserId, accountIds)

    // #4291 J — la salle FORFAIT / CONSEIL : ses comptes, ses projets à cadrer et gagnés, son profil d'espace.
    // AVANT le diagnostic (qui lit tous les comptes) et l'empreinte (posée en dernier : une salle forfait dont
    // cette étape a échoué reste « périmée » et sera re-semée, jamais servie à moitié).
    if (variant === 'forfait_conseil') await this.seedForfaitVariant(workspaceId, ownerUserId, accountIds, contactIds)

    // BEL-SC-224 (#3253, P0) — le diagnostic du maillon faible commercial,
    // CALCULÉ sur les comptes, actions et talents que ce semis vient
    // d'écrire — jamais une ligne inventée. Dernier appel du semis : il lit
    // tout ce qui précède (comptes, tâches de plan, projets, vivier).
    await this.weakestLinkDiagnosis.seedDiagnosisFor(workspaceId)
    lap('diagnostic')

    // #3135 — LA VERSION DU SEMIS, STAMPÉE SUR LA SALLE.
    //
    // Sans cette ligne, une salle complète est indiscernable d'une salle
    // complète mais PÉRIMÉE — exactement ce qui a laissé une salle déployée
    // avant #3135 montrer l'ancien jeu pour toujours. `DemoResetService` la
    // relit à chaque bail (`readRoom`) pour décider si une salle par ailleurs
    // complète doit quand même être purgée et re-semée.
    await this.workspaces.update({ id: workspaceId }, { demo_seed_fingerprint: demoSeedFingerprintFor(variant) })

    // Le semis DIT ce qu'il a écrit. Sans cette ligne, une salle servie à moitié
    // vide — un dossier au lieu de cinq, zéro contact — ne laissait aucune
    // trace : ni erreur, ni compteur, rien à quoi rattacher ce qu'un prospect
    // voyait à l'écran.
    this.logger.log(
      `Demo seed: workspace ${workspaceId} (${variant}) — ${accountIds.size} dossiers, ${contactIds.size} contacts`,
    )
    this.logger.log(`Demo seed durées par phase : ${laps.join(' ')}`)
    return {
      seeded: true,
      accounts: DEMO_DOSSIERS.length + (variant === 'forfait_conseil' ? DEMO_FORFAIT_DOSSIERS.length : 0),
    }
  }

  /** #4291 J — la variante d'une salle, lue sur son numéro (`demo_slot_index`). Sans ligne : staffing. */
  private async roomVariant(workspaceId: string): Promise<DemoRoomVariant> {
    const room = await this.workspaces.findOne({ where: { id: workspaceId } })
    return demoRoomVariantOf(room?.demo_slot_index)
  }

  /**
   * #4291 (lot J, décision Louis 21/10) — LA SALLE FORFAIT / CONSEIL, posée APRÈS le semis staffing entier.
   *
   *  - ses trois comptes fictifs passent par {@link seedDossier}, exactement comme les dossiers staffing :
   *    contacts nommés, entités, angles et plan — aucun compte mince ;
   *  - ses besoins se lisent comme des PROJETS À CADRER : périmètre (`context`), sponsor
   *    (`decision_maker_contact_id`, un contact du compte, FK existante en `ON DELETE SET NULL`), budget et
   *    échéance ; même forme d'INSERT que les besoins forfait de #4270.5 ;
   *  - un projet GAGNÉ porte sa mission en forfait encadré, liée par `need_id` (#4291.8) : suivie à la place
   *    d'une mission staffée, sans consultant ;
   *  - le profil d'espace `forfait_conseil` (#4270.1) : la navigation et la fiche besoin le lisent.
   *
   * Aucune table neuve : tout s'écrit dans des tables déjà purgées par espace (`demo-reset.service.ts`).
   */
  private async seedForfaitVariant(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
  ): Promise<void> {
    for (const dossier of DEMO_FORFAIT_DOSSIERS) {
      await this.seedDossier(dossier, workspaceId, ownerUserId, accountIds, contactIds)
    }

    const day = 86_400_000
    const now = Date.now()
    const isoDay = (offsetDays: number): string => new Date(now + offsetDays * day).toISOString().slice(0, 10)
    for (const project of DEMO_FORFAIT_PROJECTS) {
      const accountId = accountIds.get(project.company)
      if (!accountId) continue
      const location = DEMO_FORFAIT_DOSSIERS.find(d => d.account.company_name === project.company)?.account.headquarters
      await this.accounts.manager.query(
        `-- #4291 J — projet à cadrer (garde : demo-forfait-room.spec.ts)
         INSERT INTO project_needs
           (workspace_id, project_id, account_id, title, skills, seniority, headcount, location, contract_kind,
            status, status_changed_at, urgency, source, provenance, owner_id, context, budget_cents, deadline_at,
            decision_maker_contact_id, delivery_mode, supervision_role, client_team_names)
         SELECT $1::uuid, NULL, $2::uuid, $3::text, '[]'::jsonb, 'senior', 1, $13::text, 'forfait',
                $4::text, $5::timestamptz, 'normale', 'meeting_notes', 'human', $6::uuid, $7::text, $8::bigint,
                $9::timestamptz,
                (SELECT id FROM contacts WHERE workspace_id = $1::uuid AND account_id = $2::uuid AND full_name = $10::text LIMIT 1),
                'supervised', $11::text, $12::text[]
          WHERE NOT EXISTS (
            SELECT 1 FROM project_needs WHERE account_id = $2::uuid AND project_id IS NULL AND title = $3::text
          )`,
        [
          workspaceId,
          accountId,
          project.title,
          project.status,
          new Date(now - project.status_changed_days_ago * day).toISOString(),
          ownerUserId,
          project.scope,
          project.budget_cents,
          new Date(now + project.deadline_in_days * day).toISOString(),
          project.sponsor,
          project.supervision_role,
          project.client_team_names,
          location ?? null,
        ],
      )
      const m = project.mission
      if (!m) continue
      // MÊME forme que `seedSupervisedForfaitMission` (#3547), plus `need_id` : le projet gagné, suivi.
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `-- #4291 J — projet gagné suivi (forfait encadré, sans consultant)
         INSERT INTO missions
           (workspace_id, user_id, account_id, label, status, started_on, ends_on, daily_rate,
            contract_kind, role_title, owner_id, stage_entered_at, billing_contact_id,
            delivery_mode, supervision_role, client_team_size, client_team_names, need_id)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::numeric, 'forfait', $9, $2, $10::timestamptz, NULL,
                 $11::text, $12::text, $13::integer, $14::text[],
                 (SELECT id FROM project_needs WHERE workspace_id = $1 AND account_id = $3 AND title = $15 LIMIT 1))
         RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          accountId,
          m.label,
          m.status,
          isoDay(-m.started_days_ago),
          isoDay(m.ends_in_days),
          m.daily_rate,
          m.role_title,
          new Date(now - m.started_days_ago * day).toISOString(),
          m.delivery_mode,
          m.supervision_role,
          m.client_team_size,
          m.client_team_names,
          project.title,
        ],
      )
      if (!row) continue
      await this.accounts.manager.query(
        `INSERT INTO mission_commercial_terms (mission_id, workspace_id, loaded_daily_cost_cents, channel, requires_po)
         VALUES ($1, $2, $3, 'direct', false)`,
        [row.id, workspaceId, m.loaded_daily_cost_cents],
      )
    }

    // #4291.7 — l'affaire « Plan stratégique 2029 » (compte Société Générale) se lit comme un projet à cadrer : son
    // périmètre (jamais au-dessus d'une saisie) et son sponsor, contact du compte.
    await this.accounts.manager.query(
      `UPDATE opportunities
          SET scope_label = $3
        WHERE workspace_id = $1 AND label = $2 AND scope_label IS NULL`,
      [workspaceId, DEMO_FORFAIT_FRAMED_OPPORTUNITY.label, DEMO_FORFAIT_FRAMED_OPPORTUNITY.scope_label],
    )
    await this.accounts.manager.query(
      `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
       SELECT o.workspace_id, o.id, c.id, 'sponsor'
         FROM opportunities o
         JOIN contacts c ON c.account_id = o.account_id AND c.workspace_id = o.workspace_id AND c.full_name = $3
        WHERE o.workspace_id = $1 AND o.label = $2
       ON CONFLICT DO NOTHING`,
      [workspaceId, DEMO_FORFAIT_FRAMED_OPPORTUNITY.label, DEMO_FORFAIT_FRAMED_OPPORTUNITY.sponsor],
    )

    // #4270.1 — le profil d'espace (CHECK `esn_profiles_workspace_profile_check`) ; `seedEsnProfile` a posé la ligne.
    await this.accounts.manager.query(
      `UPDATE esn_profiles SET workspace_profile = $3 WHERE user_id = $1 AND workspace_id = $2 AND version = 1`,
      [ownerUserId, workspaceId, 'forfait_conseil'],
    )
  }

  /**
   * UN dossier de démonstration : le compte, ses contacts, ses entités, ses angles
   * et son plan. Extrait de la boucle de `seedWorkspace` (30/09/2026) pour que le
   * rattrapage d'un dossier neuf dans une salle déjà semée ({@link catchUpMissingDossier})
   * écrive EXACTEMENT ce que le semis écrit — jamais une seconde copie.
   */
  private async seedDossier(
    dossier: (typeof DEMO_DOSSIERS)[number],
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const account = await this.accounts.save(
      this.accounts.create({
        user_id: ownerUserId,
        workspace_id: workspaceId,
        // ⚠️ #1408 — LE RESPONSABLE, ET PAS SEULEMENT LE CRÉATEUR.
        //
        // Sans cette ligne, la salle de démonstration ouvrait le cockpit sur
        // du VIDE à partir du 04/09/2026 : « mon portefeuille » a cessé de
        // vouloir dire « ce que j'ai créé » pour vouloir dire « ce dont je
        // suis responsable », et aucun dossier de la salle n'avait de
        // responsable. C'est le défaut « le semis doit lire comme l'écran »,
        // pris avant la CI plutôt qu'en réunion.
        //
        // Ce n'est PAS un second siège inventé : l'occupant unique de la
        // salle est bien le responsable des trois dossiers, et une salle de
        // démonstration n'est le compte de personne d'autre. La retenue
        // écrite pour `contacts.assigned_to` — « l'attribution suppose une
        // équipe » — valait quand la colonne servait à répartir entre
        // plusieurs membres ; ici elle dit qui porte le dossier, et la
        // réponse est vraie avec un seul occupant.
        assigned_to: ownerUserId,
        company_name: dossier.account.company_name,
        // #2159.26 — le classement de travail de l'équipe fictive, normalisé.
        tags: normalizeTags(dossier.account.tags ?? []),
        // L'identité de registre (GA-96) : c'est elle qui ancre un
        // rafraîchissement. Sans elle, relancer un dossier de démonstration
        // afficherait « Résolution par nom » — c'est-à-dire montrerait au
        // prospect le défaut qu'on vient de corriger. `null` sur trois
        // dossiers, chacun avec sa raison écrite dans `demo-dataset.ts`.
        siren: dossier.account.siren,
        naf_code: dossier.account.naf_code,
        // #2117.11 — le pays de registre, lu par le bloc identité du hero.
        registry_country: dossier.account.registry_country,
        sector: dossier.account.sector,
        employees: dossier.account.employees,
        revenue: dossier.account.revenue,
        headquarters: dossier.account.headquarters,
        website: dossier.account.website,
        logo_url: dossier.account.logo_url,
        subsidiaries: dossier.account.subsidiaries,
        // #2165.24 / #2166.3 / #2165.16 — `undefined` sur les dossiers qui
        // n'en portent pas (cinq sur six) → `null`, « non renseigné » côté
        // écran, jamais un rôle deviné.
        group_head_siren: dossier.account.group_head_siren ?? null,
        group_role: dossier.account.group_role ?? null,
        group_link_source: dossier.account.group_link_source ?? null,
        group_link_observed_at: dossier.account.group_link_observed_at ?? null,
        // #3914 — `undefined` → `null` (pas d'origine Découvrir), seul
        // TotalEnergies porte les deux (voir `demo-dataset.ts`, `discoverOrigin`).
        origin: dossier.account.origin ?? null,
        discover_origin_reason: dossier.account.discover_origin_reason ?? null,
        // #3819 (lot RBB2) — les critères qui accompagnent l'origine (TotalEnergies seul).
        discover_origin_criteria: dossier.account.discover_origin_criteria ?? null,
        it_challenges: dossier.account.it_challenges,
        recent_signals: dossier.account.recent_signals,
        priority_score: dossier.account.priority_score,
        priority_justification: dossier.account.priority_justification,
        // #2291.2 (lot R, #2543.7) — `undefined` → `null` (« collecte
        // antérieure à cette capacité », deux dossiers sur trois, À DESSEIN) ;
        // seul SNCF la porte fraîche, pour montrer son `contract_model`
        // OBSERVÉ plutôt que le rattrapage.
        // Louis 13/10/2026 — REVU : plus aucun dossier « antérieur » en démo, les six
        // segments portent une date relative à l'ouverture de la salle.
        ...demoCollectedAtColumns(dossier.account, Date.now()),
        raw_analysis: dossier.account.raw_analysis as AccountEntity['raw_analysis'],
        // D213 — la version précédente du dossier, pour que le tiroir « ce
        // qui a changé » ait quelque chose à montrer. UN dossier sur cinq la
        // porte : les autres montrent l'état « on n'a pas de quoi comparer »,
        // qui n'est PAS « rien n'a changé » et doit se voir aussi.
        previous_raw_analysis:
          (dossier.account.previous_raw_analysis as AccountEntity['previous_raw_analysis']) ?? null,
        previous_analysis_at: dossier.account.previous_analysis_at
          ? new Date(dossier.account.previous_analysis_at)
          : null,
        // #1085 — la mémoire de relation, `competitiveEdge` compris. Sans
        // elle la carte s'ouvre vide en pleine démonstration : le visiteur
        // voit un formulaire, pas une capacité. Deux dossiers sur cinq
        // portent la mémoire COMPLÈTE, à dessein — un portefeuille où TOUT
        // est renseigné ne ressemble à aucun portefeuille réel.
        //
        // #2117.14 — LES CINQ portent au moins `owner` : le bloc identité du
        // hero nomme le propriétaire sur chaque dossier, et le seul membre
        // RÉEL de l'espace de démo (« Bellum Conseil » était solo ; ⚠️ renversé
        // le 29/10/2026, la salle compte des collègues fictifs) est
        // DEMO_OWNER (Maëlle Lorquin) — jamais un nom hors de cet espace.
        relationship_memory: dossier.account.relationship_memory as unknown as AccountEntity['relationship_memory'],
        // Lot D01 (06/10/2026) — un dossier peut être semé « en cours d'analyse ».
        status: dossier.account.analysis_status ?? 'completed',
        commercial_status: dossier.account.commercial_status,
        // #2165.13 — la SOURCE démo du preset Découvrir « Proches de mes
        // meilleures références ». `undefined` ⇒ `false` (défaut colonne).
        is_best_reference: dossier.account.is_best_reference ?? false,
        // #3245 (#3209.6) — le profil de pari déclaré ; `null` = non déclaré.
        bet_horizon: dossier.account.bet_horizon ?? null,
        bet_size: dossier.account.bet_size ?? null,
        bet_access: dossier.account.bet_access ?? null,
        bet_resource: dossier.account.bet_resource ?? null,
        // #3282 / #3263.30 — le niveau d'entrée du comité, saisi ; `null` = non déclaré.
        committee_entry_level: dossier.account.committee_entry_level ?? null,
        // Le board d'effort (`/sprints`, tome 5 §28-31) : sans ces deux
        // colonnes, `accounts.sprint` restait NULL sur les six comptes de la
        // salle et les DEUX files du board (arbitrage, exécution)
        // s'ouvraient vides — pas seulement l'une des deux.
        sprint: dossier.account.sprint,
        sprint_exit_reason: dossier.account.sprint_exit_reason,
        // BEL-SC-228 (#3257) — la décision générique attachée au niveau,
        // même défaut `?? null` que les autres champs optionnels du dossier.
        sprint_reason: dossier.account.sprint_reason ?? null,
        sprint_effort_estimate: dossier.account.sprint_effort_estimate ?? null,
        sprint_review_at: dossier.account.sprint_review_at ? new Date(dossier.account.sprint_review_at) : null,
        sprint_promotion_condition: dossier.account.sprint_promotion_condition ?? null,
        sprint_demotion_condition: dossier.account.sprint_demotion_condition ?? null,
        // #2116.10-12 — LA DATE DES FAITS DU CONTEXTE CANONIQUE.
        //
        // Le dossier rend l'ESN en place, les technologies et le chemin
        // d'accès avec la date de LEUR dimension (jamais `updated_at`, qu'un
        // refresh de signaux incrémente). Sans ces deux colonnes, les six
        // dossiers de la salle écriraient « date inconnue » sous chaque
        // fait : honnête sur un dossier réel jamais rafraîchi, FAUX ici —
        // ces dossiers ont été analysés, le run de démonstration est seedé
        // plus bas. Relatives à maintenant, comme tout le reste du semis :
        // une date figée vieillit et la salle finit par montrer des faits
        // « de plus de six mois ».
        entities_refreshed_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        strategy_refreshed_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      }),
    )

    accountIds.set(dossier.account.company_name, account.id)

    if (dossier.contacts.length > 0) {
      const saved = await this.saveDossierContacts(
        dossier.contacts.map(contact =>
          this.demoContactRow(contact, dossier.account, account.id, workspaceId, ownerUserId),
        ),
        account.id,
      )
      for (const contact of saved) {
        if (contact.full_name) contactIds.set(contact.full_name, contact.id)
      }
      await this.seedEstimatedEmails(saved, workspaceId)
      await this.seedAccountChangesBaseline(workspaceId, account.id, dossier.account.previous_analysis_at)
      await this.seedDepartedContactsFirst(workspaceId, account.id)

      // Les entités du compte (PDF 2 §2). DÉRIVÉES des libellés que les
      // contacts portent déjà, exactement comme la reprise en production :
      // rien n'est inventé, et l'écran montre le rattachement au lieu d'une
      // colonne « Entité » vide. Le périmètre non déterminé n'est créé que si
      // un contact du dossier n'a pas de division nommée.
      const labels = new Map<string, string>()
      let needsFallback = false
      for (const contact of saved) {
        const label = (contact.entity ?? '').trim()
        if (label) labels.set(label.toLowerCase(), label)
        else needsFallback = true
      }
      const entityRows = await this.accountEntities.save(
        [
          ...[...labels.values()].map(name => ({ name, is_default: false })),
          ...(needsFallback ? [{ name: DEFAULT_ENTITY_NAME, is_default: true }] : []),
        ].map(({ name, is_default }) =>
          this.accountEntities.create({
            workspace_id: workspaceId,
            account_id: account.id,
            name,
            kind: is_default ? 'unknown' : 'bu',
            is_default,
            rank1_incumbent: 'unknown',
          }),
        ),
      )
      const byLabel = new Map(entityRows.map(row => [row.name.trim().toLowerCase(), row.id]))
      const fallbackId = entityRows.find(row => row.is_default)?.id ?? null
      // Un UPDATE par ENTITÉ et non par contact : les comptes à brief commercial
      // (01/10/2026) portent jusqu'à 1 900 personnes, soit autant d'allers-retours
      // à la base qu'une ligne par ligne ; ils se regroupent par division.
      const idsByEntity = new Map<string, string[]>()
      for (const contact of saved) {
        const label = (contact.entity ?? '').trim().toLowerCase()
        const entityId = (label ? byLabel.get(label) : fallbackId) ?? fallbackId
        if (entityId) idsByEntity.set(entityId, [...(idsByEntity.get(entityId) ?? []), contact.id])
      }
      for (const [entityId, ids] of idsByEntity) {
        for (let start = 0; start < ids.length; start += SEED_CONTACT_CHUNK) {
          await this.contacts.update({ id: In(ids.slice(start, start + SEED_CONTACT_CHUNK)) }, { entity_id: entityId })
        }
      }
    }

    if (dossier.attackAngles.length > 0) {
      await this.attackAngles.save(
        dossier.attackAngles.map(angle =>
          this.attackAngles.create({
            account_id: account.id,
            user_id: ownerUserId,
            workspace_id: workspaceId,
            title: angle.title,
            description: angle.description,
            entry_point: angle.entry_point,
            is_recommended: angle.is_recommended,
            rank: angle.rank,
          }),
        ),
      )
    }

    // D13 : un compte d'extension n'a pas de plan (aucun plan inventé) — une absence, pas un plan vide.
    if (dossier.actionPlan.weeks.length === 0) return
    await this.actionPlans.save(
      this.actionPlans.create({
        account_id: account.id,
        user_id: ownerUserId,
        workspace_id: workspaceId,
        strategy_type: dossier.actionPlan.strategy_type,
        strategy_justification: dossier.actionPlan.strategy_justification,
        weeks: dossier.actionPlan.weeks as ActionPlanEntity['weeks'],
      }),
    )
  }

  /**
   * RATTRAPAGE d'UN dossier dans une salle DÉJÀ semée (`apps/api/scripts/demo-bpce-complement.ts`) :
   * `seedWorkspace` est idempotent sur la seule présence d'un compte, donc un dossier
   * ajouté à `DEMO_DOSSIERS` après coup n'y arrive jamais seul. Écrit le dossier `companyName`
   * s'il MANQUE (jamais deux fois), puis ses pistes et ses compléments. Borné à `workspaceId`.
   */
  async catchUpMissingDossier(
    workspaceId: string,
    ownerUserId: string,
    companyName: string,
  ): Promise<{ seeded: boolean; accountId: string | null }> {
    const dossier = DEMO_DOSSIERS.find(entry => entry.account.company_name === companyName)
    if (!dossier) return { seeded: false, accountId: null }
    const existing = await this.accounts.count({ where: { workspace_id: workspaceId, company_name: companyName } })
    if (existing > 0) return { seeded: false, accountId: null }

    const accountIds = new Map<string, string>()
    await this.seedDossier(dossier, workspaceId, ownerUserId, accountIds, new Map<string, string>())
    const accountId = accountIds.get(companyName) ?? null
    if (accountId) {
      await this.projects.materialize(accountId)
      if (companyName === DEMO_BPCE_REAL_CONTACTS_COMPANY) await this.seedBpceComplement(workspaceId, accountId)
      await this.seedBriefPartners(workspaceId, accountId, companyName)
    }
    return { seeded: true, accountId }
  }

  /**
   * Les ESN du brief commercial du compte (01/10/2026) dans `account_partners` —
   * la source que lit l'onglet « ESN présentes » (`TabPartners`). Le niveau de
   * preuve du classeur est gardé dans la ligne. Sans brief (SNCF) : rien. Les ESN
   * déjà posées par le relevé SG ou BPCE ne sont pas redoublées.
   */
  private async seedBriefPartners(workspaceId: string, accountId: string, companyName: string): Promise<void> {
    const brief = commercialBriefOf(companyName)
    if (!brief) return
    const alreadySeeded =
      companyName === DEMO_BPCE_REAL_CONTACTS_COMPANY
        ? BPCE_SEED.partners.map(partner => partner.name)
        : companyName === 'Société Générale'
          ? DEMO_SG_ESN_PARTNERS.map(partner => partner.name)
          : []
    await writeCsvPartners(
      (sql, params) => this.accounts.manager.query(sql, params),
      workspaceId,
      accountId,
      briefPartners(brief, alreadySeeded),
      false,
    )
  }

  /**
   * #3895 (arbitrage Louis 11/10) — l'historique des besoins FERMÉS d'un dossier (`DemoDossier.closedNeeds`) :
   * un projet clos (`besoin`, étape = statut final, `closed_at`) ET son besoin, avec le motif de fermeture.
   * Rien pour un dossier qui n'en déclare pas : un compte sans historique n'en invente pas.
   */
  private async seedBriefClosedNeeds(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    companyName: string,
  ): Promise<void> {
    const dossier = DEMO_DOSSIERS.find(item => item.account.company_name === companyName)
    for (const need of dossier?.closedNeeds ?? []) {
      const closedAt = new Date(Date.now() - need.closed_days_ago * 86_400_000).toISOString()
      const [project] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, closed_at, outcome,
            loss_reason, first_detected_at)
         VALUES ($1, $2, 'besoin', $3, $4, $5, $6::timestamptz, $6::timestamptz, $7, $8,
                 $6::timestamptz - interval '45 days')
         RETURNING id`,
        [
          workspaceId,
          accountId,
          need.title,
          need.status_reason,
          closedNeedProjectStatus(need.status).stage,
          closedAt,
          closedNeedProjectStatus(need.status).outcome,
          // Le motif de perte vient du catalogue de l'espace : jamais une phrase libre (le motif lisible
          // vit sur le besoin, `status_reason`).
          null,
        ],
      )
      if (!project) continue
      await this.accounts.manager.query(
        `-- #3895 : besoin FERMÉ d'un dossier réel (historique), pas un rôle du client de livraison.
         INSERT INTO project_needs
           (workspace_id, project_id, account_id, title, skills, seniority, headcount, location,
            status, status_reason, status_changed_at, source, provenance, owner_id, target_tjm_cents)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::timestamptz, 'meeting_notes', 'human', $12, $13)`,
        [
          workspaceId,
          project.id,
          accountId,
          need.title,
          JSON.stringify(need.skills),
          need.seniority,
          need.headcount,
          need.location,
          need.status,
          need.status_reason,
          closedAt,
          ownerUserId,
          // #4755 (lot 761) — le TJM du besoin passé, quand le dossier le porte ; absent = NULL, jamais 0.
          need.tjm_eur ? String(Math.round(need.tjm_eur * 100)) : null,
        ],
      )
    }
  }

  /**
   * Complément BPCE du 30/09/2026 — les ESN présentes (`account_partners`) et les
   * pistes « Besoin détecté » reliées à leur ligne du CSV. APRÈS `materialize` :
   * ce sont ses lignes que l'on complète. Les MÊMES écritures que le script de rattrapage.
   */
  private async seedBpceComplement(workspaceId: string, accountId: string): Promise<void> {
    await applyBpcePartnersAndNeeds((sql, params) => this.accounts.manager.query(sql, params), workspaceId, accountId, {
      dryRun: false,
    })
  }

  /**
   * LES CONTACTS « À QUALIFIER » — #1473.
   *
   * Ils passent par {@link demoContactRow}, comme tous les autres : c'est la
   * SEULE porte d'écriture de la table, et une seconde ferait diverger les
   * fiches (le défaut que le commentaire de `demoContactRow` documente déjà).
   * La différence tient en un argument — `null` au lieu d'un dossier — et c'est
   * exactement ce que la donnée dit : il n'y a pas d'entreprise.
   *
   * ⚠️ Aucune ENTITÉ n'est posée sur eux. Une entité est une filiale ou une BU
   * D'UN COMPTE ; leur en rattacher une les ferait apparaître au comité d'une
   * entreprise choisie au hasard. `entity_id` reste `null`, ce qui est l'état
   * vrai — et c'est aussi ce que fait l'API sur ce cas (`attachContact`).
   */
  /**
   * LES SÉQUENCES DE LA SALLE DE DÉMONSTRATION (#1509→#1515).
   *
   * Quatre lignes, choisies pour montrer quatre états différents — et pas une
   * de plus : une salle qui affiche vingt séquences ne montre pas mieux, elle
   * montre plus longtemps.
   *
   *  1. une échéance DUE aujourd'hui — celle qui remplit « À faire aujourd'hui » ;
   *  2. une cadence qui COURT, échéance plus loin, donc simplement « planifiée » ;
   *  3. une cadence TERMINÉE, pour que la progression montre autre chose que des
   *     séquences à moitié jouées ;
   *  4. un contact qui A RÉPONDU — le meilleur résultat d'une séquence.
   *
   * ⚠️ Les NOMS sont ceux des CONTACTS de la salle, vérifiés un par un. La
   * première version citait « Camille Roussel » et « Sophie Lemaire » : la
   * première est une CONSULTANTE (`DEMO_CONSULTANTS`), la seconde n'existe pas.
   * Le semis les sautait proprement — et la salle montrait deux lignes sur
   * quatre, sans que rien ne tombe. Mesuré en production le 04/09/2026.
   *
   * ⚠️ « A répondu » ne se DÉCIDE pas ici. Le serveur le dérive du statut du
   * CONTACT (`replied` / `meeting`), et c'est juste : la réponse est un fait de
   * la relation, pas une propriété de la cadence. Un semis qui prétendrait le
   * contraire afficherait l'inverse de ce que la fiche du contact dit.
   *
   * ⚠️ « Bloquées » reste à ZÉRO dans la salle, et c'est vrai : le seul état
   * bloquant atteignable est « e-mail sans messagerie connectée », or la salle
   * a une messagerie. Le forcer demanderait de mentir sur la connexion.
   *
   * ⚠️ AUCUNE étape n'a de brouillon dans son `payload` : le moteur n'envoie
   * rien, et un `email_draft` seedé ferait croire à un message écrit par le
   * produit pour quelqu'un qui n'a rien demandé. Le libellé suffit à lire la
   * cadence. (#3702 — vide À DESSEIN : en démo comme en prod, le brouillon naît
   * de la CRÉATION, rédigé par le moteur existant puis relu dans « À valider » ;
   * le semer ici le ferait passer pour un message que personne n'a préparé.)
   *
   * ⚠️ Les gabarits sont ceux du contrat, par leur NOM. Recopier une cadence à
   * la main ici la ferait diverger de celle que la création applique — c'est la
   * même table, elle vit à un seul endroit.
   */
  private async seedOutreachSequences(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const day = 86_400_000
    const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * day).toISOString()

    const plan = DEMO_OUTREACH_PLAN

    for (const entry of plan) {
      const contactId = contactIds.get(entry.contact)
      // Un contact absent de la salle SAUTE sa séquence plutôt que d'en créer
      // une orpheline : une ligne sans contact afficherait un tiret là où
      // l'écran promet un nom.
      if (!contactId) continue

      const template = OUTREACH_SEQUENCE_TEMPLATES[entry.template]
      // Épopée #2873 (#2367.14) — `sequence_completed_crm_update` filtre sur
      // `completed_at` (jamais `status` seul) : une séquence `completed` sans
      // cette date reste invisible à la routine par construction (elle vient
      // d'une migration additive, sans défaut deviné — voir
      // `OutreachSequenceCompletedAt`). La date REPREND celle de sa DERNIÈRE
      // étape déjà semée (`entry.steps.at(-1)`), jamais une date inventée en
      // plus : une séquence se termine quand sa dernière étape le fait.
      const lastStep = entry.steps.at(-1)
      const completedAt = entry.status === 'completed' && lastStep ? iso(lastStep.offsetDays) : null
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO outreach_sequences
           (workspace_id, user_id, contact_id, name, status, campaign_label,
            delay_unit, vacation_paused_at, vacation_until, template_key, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          contactId,
          template.name,
          entry.status,
          entry.campaign ?? null,
          // Lot L-B (#4165) — l'unité des délais et la pause vacances (la pause a commencé hier).
          // Posés AVANT `template_key` et `completed_at` : les gardes #2798 / #2873 les lisent
          // par position depuis la FIN du tableau.
          entry.delayUnit ?? 'calendar_days',
          entry.vacationUntilDays !== undefined ? iso(-1) : null,
          entry.vacationUntilDays !== undefined ? iso(entry.vacationUntilDays) : null,
          // #2798 — recette écran 27/09 : le badge de mode de campagne lit
          // cette colonne (`campaignModeLabel`, `sequences-cockpit.ts`) ;
          // jamais écrite ici avant ce lot, la salle de démo ne pouvait pas
          // le montrer (parité démo, craft rule n°9). Posée AVANT
          // `completed_at` : le test #2873 lit cette dernière par position
          // (`.at(-1)`), elle doit rester en fin de tableau.
          entry.template,
          completedAt,
        ],
      )
      const sequenceId = row?.id
      if (!sequenceId) continue

      for (const [index, step] of entry.steps.entries()) {
        const definition = template.steps[index]
        // Lot L-B — une étape multicanal porte sa propre nature ; sinon, celle du gabarit.
        const kind = step.kind ?? definition?.kind
        const label = step.label ?? definition?.label
        if (!kind || !label) continue
        await this.accounts.manager.query(
          `INSERT INTO outreach_sequence_steps
             (sequence_id, position, due_at, kind, payload, status, done_at, engagement_signal, engagement_signal_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
          [
            sequenceId,
            index,
            iso(step.offsetDays),
            kind,
            JSON.stringify({
              label,
              ...(step.outcome ? { outcome: step.outcome } : {}),
              ...(step.skipReason ? { skip_reason: step.skipReason } : {}),
              // #2202.36 — l'étape à faire a SON responsable : l'occupant unique de la salle (jamais un collègue inventé).
              ...(step.status === 'pending' ? { owner_id: ownerUserId } : {}),
            }),
            step.status,
            step.status === 'done' ? iso(step.offsetDays) : null,
            // #2909 — jamais deviné : `null` sauf la seule étape du jeu dont
            // le plan dit déjà le signal rapporté.
            step.engagementSignal ?? null,
            step.engagementSignal ? iso(step.offsetDays) : null,
          ],
        )
      }

      // Lot L-B — le saut automatique est JOURNALISÉ (même forme que
      // `OutreachCadenceService.skipUnacceptedLinkedinSteps`) : l'historique de
      // la séquence dit pourquoi cette étape n'a pas eu lieu.
      for (const step of entry.steps.filter(candidate => candidate.skipReason)) {
        await this.accounts.manager.query(
          `INSERT INTO outreach_transitions
             (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
           VALUES ($1, $2, 'sequence', $3, 'pending', 'step_skipped', $2, 'system', $4, 'applied')`,
          [workspaceId, ownerUserId, sequenceId, step.skipReason],
        )
      }

      // #3421 lot G03 (30/09) — `cancel_reason` du contrat se lit depuis
      // `outreach_transitions` (`OutreachService.cancelReasons`), jamais une
      // colonne d'`outreach_sequences` : sans cette ligne, une séquence
      // `cancelled` semée resterait avec `cancel_reason: null` à l'écran, et
      // le badge d'arrêt (« Refusée », « Adresse invalide »…) ne serait
      // jamais démontrable en démo. Même forme que l'arrêt réel
      // (`stopSequencesForContact`, `mailbox.service.ts:561`).
      if (entry.status === 'cancelled' && entry.cancelReason) {
        await this.accounts.manager.query(
          `INSERT INTO outreach_transitions
             (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
           VALUES ($1, $2, 'sequence', $3, 'active', 'cancelled', $2, 'system', $4, 'applied')`,
          [workspaceId, ownerUserId, sequenceId, entry.cancelReason],
        )
      }
    }
  }

  /**
   * Lot L-C (#4166, craft rule n°9) — LES SÉQUENCES NÉES D'UN MODÈLE.
   *
   * Écrites comme la création réelle de l'assistant : étapes libres (`template_key`
   * NULL), délais en jours ouvrés, aucune étiquette de campagne. Nature, libellé et
   * intention de chaque étape viennent du CONTRAT (`OUTREACH_PLAYBOOKS`), jamais
   * recopiés ici. Un contact absent de la salle SAUTE sa séquence (comme ailleurs).
   */
  private async seedPlaybookSequences(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const day = 86_400_000
    const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * day).toISOString()

    for (const entry of DEMO_PLAYBOOK_SEQUENCES) {
      const contactId = contactIds.get(entry.contact)
      if (!contactId) continue
      const playbook = OUTREACH_PLAYBOOKS[entry.playbook]
      // #5029 — une proposition de profil : le consultant résolu dans l'espace de la salle (absent ⇒ elle
      // saute, jamais une séquence « intercontrat » sans son consultant) et son brouillon anonymisé.
      const bench = entry.consultant ? await this.demoBenchPush(workspaceId, entry.consultant, entry.contact) : null
      if (entry.consultant && !bench) continue
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        // Mêmes colonnes, même ORDRE que `seedOutreachSequences` : les gardes (#2798, #2873) lisent
        // `template_key` et `completed_at` par position depuis la FIN du tableau de paramètres
        // (`consultant_id`, #5029, s'insère donc AVANT eux).
        `INSERT INTO outreach_sequences
           (workspace_id, user_id, contact_id, name, status, campaign_label,
            delay_unit, vacation_paused_at, vacation_until, consultant_id, template_key, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          contactId,
          playbookSequenceName(entry.playbook, entry.contact),
          entry.status,
          null,
          'business_days',
          null,
          null,
          bench?.consultantId ?? null,
          // #2798 — le gabarit d'origine gardé en référence (la spec exige qu'un modèle semé en ait un).
          playbookTemplateKey(entry.playbook),
          null,
        ],
      )
      const sequenceId = row?.id
      if (!sequenceId) continue
      for (const [index, step] of entry.steps.entries()) {
        const definition = playbook.steps[index]
        if (!definition) continue
        await this.accounts.manager.query(
          `INSERT INTO outreach_sequence_steps (sequence_id, position, due_at, kind, payload, status, done_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [
            sequenceId,
            index,
            iso(step.offsetDays),
            definition.kind,
            JSON.stringify({
              label: definition.label,
              offset_days: definition.offset_days,
              objective: OUTREACH_STEP_INTENT_LABELS[definition.intent],
              ...(step.outcome ? { outcome: step.outcome } : {}),
              // #5029 — le premier e-mail d'une proposition porte le brouillon ANONYMISÉ, à relire.
              ...(bench && index === 0 && definition.kind === 'email'
                ? { email_draft: { ...bench.draft, channel: 'email' }, draft_available: true }
                : {}),
            }),
            step.status,
            step.status === 'done' ? iso(step.offsetDays) : null,
          ],
        )
      }
    }
  }

  /**
   * #5029 — le consultant d'une proposition de profil, RÉSOLU dans l'espace de la salle, et le
   * brouillon composé par le MÊME constructeur que la création réelle (`buildBenchPushDraft`), à partir
   * du profil anonymisé (jamais le nom ni le TJM). `null` si le consultant ou le compte manque.
   */
  private async demoBenchPush(
    workspaceId: string,
    consultantName: string,
    contactName: string,
  ): Promise<{ consultantId: string; draft: { subject: string; body: string } } | null> {
    const consultant = DEMO_CONSULTANTS.find(candidate => candidate.full_name === consultantName)
    const dossier = DEMO_DOSSIERS.find(candidate => candidate.contacts.some(c => c.full_name === contactName))
    if (!consultant || !dossier) return null
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
      [workspaceId, consultantName],
    )
    if (!row?.id) return null
    const availableFrom =
      typeof consultant.available_in_days === 'number'
        ? new Date(Date.now() + consultant.available_in_days * 86_400_000).toISOString().slice(0, 10)
        : null
    const profile = anonymizedBenchProfile({
      title: consultant.title ?? null,
      seniority: consultant.seniority ?? null,
      years_experience: consultant.years_experience ?? null,
      skills: consultant.stack ?? [],
      available_from: availableFrom,
    })
    return { consultantId: row.id, draft: buildBenchPushDraft({ profile, accountName: dossier.account.company_name }) }
  }

  /**
   * #2873 (recette salle démo 28/09/2026, Maëlle Lorquin) — LA PROPOSITION DE
   * MISE À JOUR CRM, SEMÉE DIRECTEMENT — JAMAIS PAR LE BALAYEUR.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * La séquence `completed` d'Isabelle Rouault (SNCF) portait déjà sa
   * `completed_at` (voir le commentaire de `DEMO_OUTREACH_PLAN` ci-dessus,
   * #2873 initial) — mais AUCUNE carte de proposition n'apparaissait nulle
   * part (`/actions`, `/actions/sequences`, `/briefing`, la fiche du contact,
   * le compte SNCF), et le catalogue des automatisations affichait
   * « Séquence terminée : mise à jour CRM » comme « jamais exécutée ». Cause :
   * `RoutinesService.runDueFor` rend `0` AVANT toute lecture ou écriture dès
   * qu'`isDemoWorkspace` répond vrai (voir sa tête de fonction) — aucune
   * routine ne tourne JAMAIS depuis une salle de démonstration, y compris
   * celle-ci. Le PRODUIT de la routine n'existait donc nulle part, quelle que
   * soit la fraîcheur de `completed_at`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI EST SEMÉ, ET POURQUOI SOUS CETTE FORME EXACTE
   * ─────────────────────────────────────────────────────────────────────────
   * Deux lignes, dans le vocabulaire et la forme EXACTS que produirait
   * `RoutineExecutors.sequenceCompletedCrmUpdate` (`routine-executors.ts`) et
   * son appelant `RoutinesService.runDueFor` (`routines.service.ts`) s'ils
   * avaient tourné pour de vrai — jamais un texte réinventé pour l'occasion :
   *
   *  1. `routine_runs` — LA TRACE D'EXÉCUTION, pour que le catalogue affiche
   *     une dernière exécution au lieu de « jamais exécutée ». `run_key` REPREND
   *     `routineRunKey` (`routine-schedule.ts`), la même fonction qui pose la
   *     clé d'unicité en production — jamais une clé réinventée qui pourrait
   *     diverger. `notified: false` et `outcome` reprennent MOT POUR MOT ce que
   *     `sequenceCompletedCrmUpdate` rend au niveau global (`notified` y est
   *     TOUJOURS `false` — la doctrine « signale, n'écrit rien » se tient via
   *     `items`, jamais une notification globale). `created_at` est relatif au
   *     semis (« aujourd'hui »), pas à la clôture de la séquence : c'est la
   *     DATE D'EXÉCUTION du balayeur qui manquait à l'écran, pas une seconde
   *     date de clôture.
   *
   *     ⚠️ Ce `notified: false` est aussi ce qui laisse INTACT le compte
   *     `night_routines_run` (`demo-coverage.ts`, `RoutineRunEntity.notified =
   *     true` de la fenêtre) : cette ligne unique n'y ajoute rien, le zéro
   *     qu'il rend reste un zéro vrai.
   *
   *  2. `notifications` — LA CARTE ELLE-MÊME, à l'endroit où `RoutinesService`
   *     la déposerait réellement (`NotificationsService.createNotification`,
   *     `type: 'system'`, `origin: 'proactive'`) : titre, corps (nom du
   *     contact CONNU, jamais deviné) et lien `/contacts/:id` REPRENNENT mot
   *     pour mot le gabarit de `sequenceCompletedCrmUpdate`. C'est elle que
   *     `/actions`, `/briefing` et la cloche lisent — la même table que
   *     {@link seedNotifications}, qui la classe déjà SEEDÉE
   *     (`demo-coverage.ts`) ; cette ligne s'y ajoute plutôt que d'y dupliquer
   *     un second semis de `notifications`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI N'EST PAS SEMÉ, ET POURQUOI
   * ─────────────────────────────────────────────────────────────────────────
   * Aucune connexion CRM fictive n'est posée : `sequence_completed_crm_update`
   * porte `requires: []` dans `routine-catalog.ts` — elle ne dépend d'AUCUN
   * connecteur branché, exactement comme `positive_replies`. Une écriture CRM
   * réelle (la « porte » `OutboundWriteService`, doctrine « une écriture
   * CRM/ERP passe par une porte ») exigerait, elle, un CRM connecté — mais ce
   * n'est pas ce que cette routine produit : elle SIGNALE une notification,
   * elle n'écrit rien. `/pilotage` continue donc, à raison, de dire qu'aucun
   * CRM n'est connecté (`crm_connections` vide à dessein, décision antérieure
   * déjà écrite dans `demo-dataset.ts` et `demo-coverage.ts`) : les deux
   * écrans ne se contredisent pas.
   *
   * `sequenceId` (l'`objectId` que porterait un `item` réel) n'est pas semé
   * non plus : la clé d'unicité RÉELLE d'une occurrence `weekdays` est
   * `routineRunKey` (par JOUR, jamais par objet — `runContinuous`/`routineObjectKey`
   * ne s'applique qu'aux routines `cadence: 'continuous'`), donc rien ici n'a
   * besoin de l'identifiant de la séquence pour être fidèle à la forme réelle.
   */
  private async seedSequenceCompletedCrmUpdateProposal(
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const contactId = contactIds.get('Isabelle Rouault')
    // Même garde que partout ailleurs dans ce semis : un contact absent de la
    // salle SAUTE sa proposition plutôt que d'en créer une orpheline.
    if (!contactId) return

    const now = new Date()
    const HOUR = 60 * 60 * 1000
    const contactName = 'Isabelle Rouault'
    // Une seule séquence `completed` dans la fenêtre de sept jours
    // (`DEMO_OUTREACH_PLAN`, voir son commentaire) : `rows.length` vaut donc
    // `1`, MOT POUR MOT le gabarit `${rows.length} séquence(s) terminée(s) —
    // mise à jour CRM à proposer.` de `sequenceCompletedCrmUpdate` (le
    // pluriel entre parenthèses n'est jamais accordé, même convention que
    // `consultant(s)` ailleurs dans ce moteur).
    const outcome = '1 séquence(s) terminée(s) — mise à jour CRM à proposer.'

    await this.accounts.manager.query(
      `INSERT INTO routine_runs (user_id, routine_key, run_key, notified, outcome, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (run_key) DO NOTHING`,
      [
        ownerUserId,
        'sequence_completed_crm_update',
        routineRunKey(ownerUserId, 'sequence_completed_crm_update', 'Europe/Paris', now),
        false,
        outcome,
        new Date(now.getTime() - 2 * HOUR),
      ],
    )

    await this.accounts.manager.query(
      `INSERT INTO notifications (user_id, type, title, body, link, read_at, origin, created_at, priority, level, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        ownerUserId,
        'system',
        'Séquence terminée',
        `${contactName} a atteint la fin de sa séquence — propose une mise à jour de ton CRM.`,
        `/contacts/${contactId}`,
        null,
        'proactive',
        new Date(now.getTime() - 2 * HOUR),
        null,
        null,
        null,
      ],
    )
  }

  /**
   * #2366 / #2382 — les messages canoniques de la salle : versions (gabarit,
   * personnalisée, retouche), statut, preuve d'approbation quand il est validé,
   * et la transition de naissance au journal — l'historique n'est pas vide.
   */
  /**
   * #3702.9 (c89) — le mandat d'envoi délégué, FACTICE : il couvre les messages
   * `approved` déjà semés (empreinte = leurs versions relues), borné à 7 jours,
   * 20 envois, 9 h–18 h, expéditeur = la boîte fictive de la salle. Rien ne part :
   * `OutreachSendSweeper` saute toute salle de démo avant même de consulter le mandat.
   */
  private async seedOutreachDelegation(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    const approved = await q.query<{ id: string; contact_id: string; current_version: number }[]>(
      `SELECT id, contact_id, current_version FROM outreach_messages
        WHERE workspace_id = $1 AND status = 'approved' AND channel = 'email'`,
      [workspaceId],
    )
    if (approved.length === 0) return
    const messages = approved.map(row => ({ id: row.id, version: row.current_version }))
    const canonical = [...messages]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(item => `${item.id}:${item.version}`)
      .join('|')
    const contentHash = createHash('sha256').update(canonical).digest('hex')
    const [row] = await q.query<{ id: string }[]>(
      `INSERT INTO outreach_delegations
         (workspace_id, user_id, campaign_label, contact_ids, channels, sender_mailbox_id, messages, content_hash,
          window_start_hour, window_end_hour, starts_at, expires_at, max_messages, sent_count, validated_by, validated_at)
       VALUES ($1, $2, 'Démo — relance Q4', $3::jsonb, '["email"]'::jsonb, 'demo@bellum.example', $4::jsonb, $5,
          9, 18, now(), now() + interval '7 days', $6, 0, $7::jsonb, now())
       RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        JSON.stringify([...new Set(approved.map(r => r.contact_id))]),
        JSON.stringify(messages),
        contentHash,
        Math.min(20, messages.length),
        JSON.stringify([ownerUserId]),
      ],
    )
    if (!row?.id) return
    await q.query(
      `UPDATE outreach_messages
          SET approval = jsonb_set(approval, '{conditions}', (approval->'conditions') || to_jsonb($2::text))
        WHERE id = ANY($1::uuid[]) AND approval IS NOT NULL`,
      [messages.map(m => m.id), `delegation:${row.id}`],
    )
    await this.seedScopedMandates(workspaceId, ownerUserId)
  }

  /**
   * #4016 L5 — un mandat SIGNÉ par portée d'espace (séquences, Laura, relance
   * d'impayé, suivi de rendez-vous), FICTIF, borné à 14 jours / 30 envois, et UN
   * envoi qui ATTEND faute de mandat le couvrant : un message de Laura né AVANT
   * la signature (`predates_mandate` — pas de mandat rétroactif). La salle de
   * démo n'envoie toujours rien (`OutreachSendSweeper` la saute).
   */
  private async seedScopedMandates(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    const scoped: { scope: string; label: string }[] = [
      { scope: 'workspace_sequences', label: 'Démo — étapes e-mail des séquences' },
      { scope: 'laura_send', label: 'Démo — Laura envoie ce qu’elle prépare' },
      { scope: 'payment_reminder', label: 'Démo — relances d’impayé' },
      { scope: 'meeting_follow_up', label: 'Démo — suivi après rendez-vous' },
    ]
    for (const { scope, label } of scoped) {
      await q.query(
        `INSERT INTO outreach_delegations
           (workspace_id, user_id, scope, campaign_label, contact_ids, channels, sender_mailbox_id, messages, content_hash,
            window_start_hour, window_end_hour, starts_at, expires_at, max_messages, sent_count, validated_by, validated_at)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, '["email"]'::jsonb, 'demo@bellum.example', '[]'::jsonb, NULL,
            9, 18, now(), now() + interval '14 days', 30, 0, $5::jsonb, now())`,
        [workspaceId, ownerUserId, scope, label, JSON.stringify([ownerUserId])],
      )
    }
    // L'envoi qui ATTEND : un message e-mail en relecture, rattaché à la portée de Laura, né deux jours
    // avant la signature — le mandat ne le couvre pas, il reste à valider à la main.
    await q.query(
      `UPDATE outreach_messages
          SET mandate_scope = 'laura_send', mandate_originated_at = now() - interval '2 days'
        WHERE id = (
          SELECT id FROM outreach_messages
           WHERE workspace_id = $1 AND status = 'needs_review' AND channel = 'email'
           ORDER BY created_at ASC LIMIT 1)`,
      [workspaceId],
    )
  }

  /**
   * #4737 (craft rule n°9) — un mandat d'envoi LinkedIn FICTIF (période autour du semis, 5 par jour) et le résultat
   * du geste : « voie non ouverte » (aucune clé fournisseur), sans corps de message et sans preuve. Rien ne part
   * jamais depuis la salle de démonstration, et aucun appel fournisseur. Depuis la fusion (K2, 29/10) le mandat est
   * une délégation de portée `linkedin_send` (`outreach_delegations`), plus une ligne de `linkedin_mandates`.
   * Un contact absent de la salle SAUTE la ligne du journal.
   */
  private async seedLinkedInMandate(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const q = this.accounts.manager
    const rows = (await q.query(
      `INSERT INTO outreach_delegations
         (workspace_id, user_id, scope, campaign_label, contact_ids, channels, sender_mailbox_id, messages, content_hash,
          window_start_hour, window_end_hour, starts_at, expires_at, max_messages, sent_count, daily_limit, validated_by, validated_at)
       VALUES ($1, $2, 'linkedin_send', 'LinkedIn', '[]'::jsonb, '[]'::jsonb, 'linkedin', '[]'::jsonb, NULL,
          0, 24, now() - interval '1 day', now() + interval '30 days', 150, 0, 5, $3::jsonb, now()) RETURNING id`,
      [workspaceId, ownerUserId, JSON.stringify([ownerUserId])],
    )) as Array<{ id: string }>
    const mandateId = rows[0]?.id
    const contactId = [...contactIds.values()][0]
    if (!mandateId || !contactId) return
    await q.query(
      `INSERT INTO linkedin_send_log (workspace_id, user_id, mandate_id, contact_id, status, reason)
       VALUES ($1, $2, $3, $4, 'not_open', NULL)`,
      [workspaceId, ownerUserId, mandateId, contactId],
    )
  }

  /**
   * #4739 (craft rule n°9) — « Mes angles » : deux angles écrits à la main (source `human`), génériques et
   * fictifs — aucun nom de client, aucune donnée personnelle. Le lien de démonstration montre ainsi la
   * liste d'angles personnels de « Contacter » remplie, pas vide.
   */
  private async seedUserAngles(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    const angles = [
      {
        title: 'Conformité réglementaire',
        content:
          'Ouvrir sur l’échéance réglementaire du secteur et proposer un point de 20 minutes sur ce que cela change pour leurs équipes IT.',
      },
      {
        title: 'Renfort d’équipe projet',
        content:
          'Partir du projet en cours chez eux et proposer un profil senior disponible rapidement pour tenir le calendrier.',
      },
    ]
    for (const angle of angles) {
      await q.query(
        `INSERT INTO user_angles (user_id, workspace_id, title, content, source) VALUES ($1, $2, $3, $4, 'human')`,
        [ownerUserId, workspaceId, angle.title, angle.content],
      )
    }
  }

  /**
   * Lot L-D1 (#4167, craft rule n°9) — les règles d'automatisation de la salle, leur JOURNAL (le compteur
   * « 30 jours » le COMPTE : il n'est pas écrit en dur) et ce que les règles « préparer un e-mail » ont
   * déposé dans « À traiter » (`outreach_messages.source = 'automation'`, `needs_review`, le signal en
   * `reason`). Rien ne tourne en démo ; rien n'est envoyé. Un contact absent de la salle SAUTE sa ligne.
   */
  private async seedAutomations(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const q = this.accounts.manager
    const day = 86_400_000
    const ago = (days: number): Date => new Date(Date.now() - days * day)

    const ruleIds: string[] = []
    for (const rule of DEMO_AUTOMATION_RULES) {
      const [row] = await q.query<{ id: string }[]>(
        `INSERT INTO automation_rules
           (workspace_id, user_id, signal, action_kind, playbook_key, prepared_action, inactive_days,
            enabled, credit_cap, template_key, last_run_at, name, version, draft, draft_tested_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          rule.signal,
          rule.actionKind,
          rule.playbook ?? null,
          rule.prepared ?? null,
          rule.inactiveDays ?? null,
          rule.enabled,
          rule.creditCap,
          rule.templateKey ?? null,
          rule.lastRunDaysAgo === null ? null : ago(rule.lastRunDaysAgo),
          rule.name ?? null,
          rule.version ?? 1,
          rule.draft
            ? JSON.stringify({
                name: rule.draft.name,
                signal: rule.signal,
                action_kind: 'prepare_action',
                prepared_action: rule.draft.prepared,
                credit_cap: rule.creditCap,
              })
            : null,
          rule.draft?.tested ? ago(0) : null,
        ],
      )
      ruleIds.push(row?.id ?? '')
    }

    // Théo C automations-bibliotheque.N3 — le journal des essais (le nom de la règle est copié, comme en production).
    for (const trial of DEMO_AUTOMATION_TRIALS) {
      const rule = DEMO_AUTOMATION_RULES[trial.rule]
      const ruleId = ruleIds[trial.rule]
      if (!rule || !ruleId) continue
      await q.query(
        `INSERT INTO automation_rule_trials
           (workspace_id, user_id, rule_id, rule_name, signal, target, outcome, situations_read, situation_labels,
            would_act, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          workspaceId,
          ownerUserId,
          ruleId,
          trial.target === 'draft' && rule.draft ? rule.draft.name : (rule.name ?? rule.signal),
          rule.signal,
          trial.target,
          trial.outcome,
          trial.situationsRead,
          [...trial.labels],
          trial.wouldAct,
          trial.reason ?? null,
          ago(trial.daysAgo),
        ],
      )
    }

    // Les messages d'abord : le journal pointe celui que la règle a préparé.
    const messageByContact = new Map<string, string>()
    for (const entry of DEMO_AUTOMATION_MESSAGES) {
      const contactId = contactIds.get(entry.contact)
      if (!contactId) continue
      const [message] = await q.query<{ id: string }[]>(
        `INSERT INTO outreach_messages
           (workspace_id, user_id, contact_id, channel, intent, source, reason, status, current_version)
         VALUES ($1, $2, $3, 'email', $4, 'automation', $5, 'needs_review', 1) RETURNING id`,
        [workspaceId, ownerUserId, contactId, entry.intent, entry.reason],
      )
      if (!message?.id) continue
      messageByContact.set(entry.contact, message.id)
      await q.query(
        `INSERT INTO outreach_message_versions
           (workspace_id, user_id, message_id, version, kind, subject, body, author)
         VALUES ($1, $2, $3, 1, 'personalized', $4, $5, NULL)`,
        [workspaceId, ownerUserId, message.id, entry.subject, entry.body],
      )
      await q.query(
        `INSERT INTO outreach_transitions
           (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, tool, permission, result)
         VALUES ($1, $2, 'message', $3, NULL, 'needs_review', $2, 'system', 'created', 'outreach.messages.create', 'messages:send', 'applied')`,
        [workspaceId, ownerUserId, message.id],
      )
    }

    for (const [ruleIndex, rule] of DEMO_AUTOMATION_RULES.entries()) {
      const ruleId = ruleIds[ruleIndex]
      if (!ruleId) continue
      for (const [index, firing] of rule.firings.entries()) {
        const contactId = firing.contact ? (contactIds.get(firing.contact) ?? null) : null
        // Un contact absent de la salle saute sa ligne (sauf un écart « sans contact », qui n'en porte pas).
        if (firing.contact && !contactId) continue
        let sequenceId: string | null = null
        if (firing.linksSequence && contactId) {
          const [sequence] = await q.query<{ id: string }[]>(
            `SELECT id FROM outreach_sequences WHERE workspace_id = $1 AND contact_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [workspaceId, contactId],
          )
          sequenceId = sequence?.id ?? null
        }
        await q.query(
          `INSERT INTO automation_rule_firings
             (rule_id, workspace_id, user_id, signal, signal_ref, contact_id, outcome, reason, sequence_id, message_id,
              credits_spent, fired_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11)`,
          [
            ruleId,
            workspaceId,
            ownerUserId,
            rule.signal,
            `demo:${ruleIndex}:${index}`,
            contactId,
            firing.outcome,
            firing.reason ?? null,
            sequenceId,
            firing.outcome === 'prepared' && firing.contact ? (messageByContact.get(firing.contact) ?? null) : null,
            ago(firing.daysAgo),
          ],
        )
      }
    }
  }

  /**
   * #4163 LF (point 7, craft rule n°9) — les écritures CRM EN ATTENTE de la salle (`demo-crm-write-requests.ts`).
   * La file « À traiter » disait « Écriture CRM indisponible » ; elle porte désormais une carte de lot et une carte
   * seule. Rien n'est écrit nulle part : aucune connexion CRM n'est posée (le registre d'outils la montre branchée par
   * simple lecture) et la décision d'une demande de la salle n'appelle jamais le fournisseur.
   */
  private async seedCrmWriteRequests(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    const batchIds = new Map<string, string>()
    for (const request of buildDemoCrmWriteRequests(new Date())) {
      let batchId: string | null = null
      if (request.batchKey) {
        batchId = batchIds.get(request.batchKey) ?? randomUUID()
        batchIds.set(request.batchKey, batchId)
      }
      await q.query(
        `INSERT INTO outbound_write_requests
           (workspace_id, requested_by, provider, kind, payload, preview, origin, state, expires_at, batch_id)
         VALUES ($1, $2, 'hubspot', $3, $4::jsonb, $5::jsonb, $6, 'pending', $7, $8)`,
        [
          workspaceId,
          ownerUserId,
          request.kind,
          JSON.stringify(request.payload),
          JSON.stringify(request.preview),
          request.origin,
          request.expiresAt,
          batchId,
        ],
      )
    }
  }

  private async seedOutreachMessages(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const q = this.accounts.manager
    for (const entry of DEMO_OUTREACH_MESSAGES) {
      const contactId = contactIds.get(entry.contact)
      if (!contactId) continue
      const versions = [
        { kind: 'template', ...entry.template, author: null as string | null },
        { kind: 'personalized', subject: entry.subject, body: entry.body, author: ownerUserId },
        ...(entry.edit ? [{ kind: 'user_edit', ...entry.edit, author: ownerUserId }] : []),
      ]
      const approval =
        entry.status === 'approved'
          ? {
              author: ownerUserId,
              date: new Date().toISOString(),
              version: versions.length,
              audience: { kind: 'contact', contact_ids: [contactId], size: 1 },
              policy: OUTREACH_EDIT_POLICY,
              cost: null,
              conditions: ['no_blocker', `displayed_version:${versions.length}`, 'permission:messages:send'],
            }
          : null
      const [row] = await q.query<{ id: string }[]>(
        `INSERT INTO outreach_messages
           (workspace_id, user_id, contact_id, channel, intent, source, status, current_version, approval)
         VALUES ($1, $2, $3, 'email', $4, $5, $6, $7, $8::jsonb) RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          contactId,
          entry.intent,
          entry.source,
          entry.status,
          versions.length,
          approval ? JSON.stringify(approval) : null,
        ],
      )
      const messageId = row?.id
      if (!messageId) continue
      for (const [index, version] of versions.entries()) {
        await q.query(
          `INSERT INTO outreach_message_versions
             (workspace_id, user_id, message_id, version, kind, subject, body, author)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [workspaceId, ownerUserId, messageId, index + 1, version.kind, version.subject, version.body, version.author],
        )
      }
      for (const variable of entry.variables ?? []) {
        await q.query(
          `INSERT INTO outreach_message_variables
             (workspace_id, message_id, version, name, value, source, as_of, confidence, external_use, declared_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            workspaceId,
            messageId,
            versions.length,
            variable.name,
            variable.value,
            variable.source,
            variable.as_of,
            variable.confidence,
            variable.external_use,
            ownerUserId,
          ],
        )
      }
      for (const kind of entry.quality_flags ?? []) {
        await q.query(
          `INSERT INTO outreach_message_quality_flags (workspace_id, message_id, flagged_by, kind)
           VALUES ($1, $2, $3, $4)`,
          [workspaceId, messageId, ownerUserId, kind],
        )
      }
      await q.query(
        `INSERT INTO outreach_transitions
           (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, tool, permission, result)
         VALUES ($1, $2, 'message', $3, NULL, $4, $2, 'user', 'created', 'outreach.messages.create', 'messages:send', 'applied')`,
        [workspaceId, ownerUserId, messageId, entry.status],
      )
    }
    for (const call of DEMO_OUTREACH_CALL_TASKS) {
      const contactId = contactIds.get(call.contact)
      if (!contactId) continue
      const [row] = await q.query<{ id: string }[]>(
        `INSERT INTO outreach_call_tasks (workspace_id, user_id, contact_id, source, reason, objective, pitch, status, scheduled_at)
         VALUES ($1, $2, $3, 'today', $4, $5, $6, $7, $8) RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          contactId,
          call.reason,
          call.objective,
          call.pitch,
          call.status,
          // Lot L-A (#4164) — relatif au semis, comme `dueInDays` : une date écrite en dur se périmerait.
          new Date(Date.now() + call.scheduledInDays * 86_400_000).toISOString(),
        ],
      )
      if (!row?.id) continue
      await q.query(
        `INSERT INTO outreach_transitions
           (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, tool, permission, result)
         VALUES ($1, $2, 'call_task', $3, 'no_answer', $4, $2, 'user', 'Rappel convenu au téléphone', 'outreach.calls.transition', 'messages:send', 'applied')`,
        [workspaceId, ownerUserId, row.id, call.status],
      )
    }
  }

  /**
   * #2768 (#2369.9/.10/.7/.8/.14) — un template ACTIF (« Comparer » visible,
   * `MessageStyleTab.tsx` n'affiche le bouton que sur un canal parmi
   * email/linkedin/phone) et une proposition de règle `pending` (le geste
   * Adopter/Refuser que le NO-GO #2369.14 exige de pouvoir poser). Insertion
   * directe (comme `seedOutreachMessages` juste au-dessus) : la porte
   * `MessageStyleService.createTemplate`/`proposeRule` exige un rôle et un
   * contexte de requête que le semis n'a pas, et le statut `active` /
   * `version: 2` du template ne sont de toute façon pas ce que ces méthodes
   * posent à la création (`draft`, version 1).
   */
  private async seedMessageStyle(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    for (const template of DEMO_MESSAGE_STYLE_TEMPLATES) {
      // #2204.65 — la portée ÉQUIPE se résout par le NOM de l'équipe de la salle ; introuvable, on saute (jamais un
      // style d'équipe sans équipe : la contrainte SQL l'exige, et l'écran mentirait).
      const businessUnitId = template.businessUnitName
        ? await this.demoBusinessUnitId(workspaceId, template.businessUnitName)
        : null
      if (template.scope === 'business_unit' && !businessUnitId) continue
      await q.query(
        `INSERT INTO message_style_templates
           (workspace_id, user_id, objective, channel, persona, status, forbidden, version, pitch, tone, signature,
            scope, business_unit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
        [
          workspaceId,
          ownerUserId,
          template.objective,
          template.channel,
          template.persona,
          template.status,
          JSON.stringify(template.forbidden),
          template.version,
          // #2947 (#2204.60/.61/.63) — la salle montre les trois champs déclarés.
          template.pitch,
          template.tone,
          template.signature,
          template.scope ?? 'workspace',
          businessUnitId,
        ],
      )
    }
    for (const proposal of DEMO_MESSAGE_STYLE_RULE_PROPOSALS) {
      await q.query(
        `INSERT INTO message_style_rule_proposals
           (workspace_id, user_id, template_id, signal, observation, status)
         VALUES ($1, $2, NULL, $3, $4, 'pending')`,
        [workspaceId, ownerUserId, proposal.signal, proposal.observation],
      )
    }
  }

  /** #3427 — trois exemples FICTIFS, lus par l'onglet « Bibliothèque » de la base de connaissances. */
  private async seedMessageLibrary(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    for (const [index, entry] of DEMO_MESSAGE_LIBRARY_ENTRIES.entries()) {
      const variables = Array.from(new Set([...entry.body.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1])))
      await q.query(
        `INSERT INTO message_library_entries
           (workspace_id, created_by, title, body, origin, source_document, version, entry_date,
            channel, scenario_id, persona, decision_role, stage, route, objective,
            expected_variables, mandatory_facts, claims, status, mode, usage_constraints, fact_confirmations)
         VALUES ($1, $2, $3, $4, $5, $6, 1, now(), $7, $8, $9, $10, $11, $12, $13,
                 $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19::jsonb, $20::jsonb)`,
        [
          workspaceId,
          ownerUserId,
          entry.title,
          entry.body,
          'Démonstration',
          `Exemple de démonstration ${index + 1}`,
          entry.channel,
          entry.scenarioId,
          entry.persona,
          entry.decisionRole,
          entry.stage,
          entry.route,
          entry.objective,
          JSON.stringify(variables),
          JSON.stringify(entry.mandatoryFacts),
          JSON.stringify(entry.claims),
          entry.status,
          entry.mode,
          JSON.stringify(entry.usageConstraints),
          JSON.stringify(
            entry.confirmedFacts.map(fact => ({
              fact,
              confirmedBy: ownerUserId,
              confirmedAt: new Date().toISOString(),
            })),
          ),
        ],
      )
    }
  }

  /** #2927 — voir `DEMO_PERSONAL_CONTACTS`. Écrit dans `personal_contacts`, jamais dans `contacts`. */
  private async seedPersonalContacts(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    for (const contact of DEMO_PERSONAL_CONTACTS) {
      const accountId = accountIds.get(contact.account)
      if (!accountId) continue
      await this.accounts.manager.query(
        `INSERT INTO personal_contacts (workspace_id, user_id, account_id, full_name, title, email, source, lifecycle_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'import', 'detecte')`,
        [workspaceId, ownerUserId, accountId, contact.full_name, contact.title, contact.email],
      )
    }
  }

  /**
   * Théo B c3-imports-sources.R4 — « Historique des imports » : deux imports TERMINÉS (jamais un « en cours » ni un
   * « interrompu », dont les parts ne seraient plus au stockage). Le bilan par famille et les lignes écartées sont
   * semés avec, pour que « Voir le bilan » s'ouvre sur du contenu devant un prospect (craft rule n°9).
   */
  private async seedImportHistory(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    for (const entry of DEMO_IMPORT_HISTORY) {
      const family = Object.values(entry.breakdown)[0]
      const rows = (await q.query(
        `INSERT INTO universal_import_jobs
           (workspace_id, user_id, type, format, filename, status, parts_expected, parts_received, mapping,
            total_rows, committed_rows, imported_count, duplicate_count, rejected_count, to_reconcile_count,
            breakdown, sheet_passes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'done', 1, 1, '{}'::jsonb, $6, $6, $7, $8, $9, 0, $10::jsonb, $12::jsonb,
                 now() - ($11 || ' days')::interval, now() - ($11 || ' days')::interval)
         RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          entry.type,
          entry.format,
          entry.filename,
          entry.totalRows,
          entry.imported,
          family?.duplicates ?? 0,
          family?.rejected ?? 0,
          JSON.stringify(entry.breakdown),
          String(entry.daysAgo),
          // #5223 — un classeur de plusieurs feuilles : le bilan ventilé, chaque feuille terminée. `null` = une seule feuille.
          'sheets' in entry
            ? JSON.stringify(
                entry.sheets.map(sheet => ({
                  name: sheet.name,
                  // #5224 — chaque feuille se lit COMME un type : ici celui du classeur de la salle.
                  type: entry.type,
                  mapping: {},
                  done: true,
                  totalRows: sheet.totalRows,
                  committedRows: sheet.totalRows,
                  created: sheet.created,
                  duplicates: 0,
                  rejected: sheet.rejected,
                  toReconcile: 0,
                  reasons: [{ kind: 'rejected', reason: 'missing_required_field', count: sheet.rejected }],
                })),
              )
            : null,
        ],
      )) as Array<{ id: string }>
      const jobId = rows[0]?.id
      if (!jobId) continue
      // #4597.3 — « voir les N contacts / comptes » : les fiches importées de la salle portent l'identifiant de leur
      // import (le premier de chaque type), pour que le lien de l'historique s'ouvre sur du contenu. Borné à l'espace.
      if (entry.type === 'contact') {
        await q.query(
          `UPDATE contacts SET import_job_id = $1
            WHERE workspace_id = $2 AND source = 'import' AND import_job_id IS NULL`,
          [jobId, workspaceId],
        )
      } else if (entry.type === 'account') {
        await q.query(
          `UPDATE accounts SET import_job_id = $1
            WHERE workspace_id = $2 AND origin = 'import' AND import_job_id IS NULL`,
          [jobId, workspaceId],
        )
      }
      for (const issue of entry.issues) {
        await q.query(
          `INSERT INTO universal_import_issues (workspace_id, job_id, row_number, kind, reason, label, sheet)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [workspaceId, jobId, issue.row, issue.kind, issue.reason, issue.label, 'sheet' in issue ? issue.sheet : null],
        )
      }
    }
  }

  /**
   * #3437 / #3438 / #3440 — les séquences LinkedIn livrées avec le produit, dans la bibliothèque
   * de la démo : MÊMES textes, statuts et affirmations qu'en production (rien d'activé en plus) —
   * Laura les sert à un prospect comme à un client. Source unique : `ALL_IMPORTED_SEQUENCES`.
   */
  private async seedImportedSequences(workspaceId: string, ownerUserId: string): Promise<void> {
    const q = this.accounts.manager
    for (const entry of ALL_IMPORTED_SEQUENCES) {
      await q.query(
        `INSERT INTO message_library_entries
           (workspace_id, created_by, title, body, origin, source_document, version, entry_date,
            channel, scenario_id, persona, decision_role, stage, route, step, objective,
            expected_variables, mandatory_facts, claims, status, mode, usage_constraints, fact_confirmations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17::jsonb, $18::jsonb, $19::jsonb, $20, $21, $22::jsonb, '[]'::jsonb)`,
        [
          workspaceId,
          ownerUserId,
          entry.title,
          entry.text,
          entry.origin,
          entry.sourceDocument,
          entry.version,
          entry.date,
          entry.channel,
          entry.scenarioId,
          entry.persona,
          entry.decisionRole,
          entry.stage,
          entry.route,
          entry.step ?? null,
          entry.objective,
          JSON.stringify(entry.expectedVariables),
          JSON.stringify(entry.mandatoryFacts),
          JSON.stringify(entry.claims),
          entry.status,
          entry.mode,
          JSON.stringify(entry.usageConstraints),
        ],
      )
    }
  }

  /**
   * #2979 (Louis, 03/10/2026) — UNE vue enregistrée de « Missions » en salle. Tranché sans Louis :
   * ce renverse en partie l'ancienne raison de `saved_views` (« le filtre se compose en direct ») —
   * l'écran des filtres s'ouvrait sans aucune vue à rejouer devant un prospect. Une seule, le critère
   * le plus parlant (les missions à renouveler), au nom du propriétaire de la salle. Les recherches
   * enregistrées de Découvrir RESTENT vides : leur objectif est une intention que le visiteur n'a pas
   * formulée.
   */
  private async seedMissionSavedView(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO saved_views (workspace_id, owner_id, scope, name, filters, shared)
       VALUES ($1, $2, 'missions', $3, $4::jsonb, false)`,
      [workspaceId, ownerUserId, DEMO_MISSION_SAVED_VIEW.name, JSON.stringify(DEMO_MISSION_SAVED_VIEW.filters)],
    )
  }

  /** Louis 23/10 — la vue enregistrée du vivier (`DEMO_TALENT_SAVED_VIEW`), au nom du propriétaire de la salle. */
  private async seedTalentSavedView(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO saved_views (workspace_id, owner_id, scope, name, filters, shared)
       VALUES ($1, $2, 'talents', $3, $4::jsonb, false)`,
      [workspaceId, ownerUserId, DEMO_TALENT_SAVED_VIEW.name, JSON.stringify(DEMO_TALENT_SAVED_VIEW.filters)],
    )
  }

  /** Les recherches enregistrées de Découvrir (`DEMO_DISCOVER_SAVED_VIEWS`), au nom du propriétaire de la salle. */
  private async seedDiscoverSavedViews(workspaceId: string, ownerUserId: string): Promise<void> {
    for (const view of DEMO_DISCOVER_SAVED_VIEWS) {
      await this.accounts.manager.query(
        `INSERT INTO saved_views
           (workspace_id, owner_id, scope, name, filters, shared, objective, alert_frequency, alert_channel, last_run_at)
         VALUES ($1, $2, 'discover', $3, $4::jsonb, $5, $6, $7, $8,
                 CASE WHEN $9::int IS NULL THEN NULL ELSE now() - ($9::int * interval '1 day') END)`,
        [
          workspaceId,
          ownerUserId,
          view.name,
          JSON.stringify(view.filters),
          view.shared,
          view.objective,
          view.alertFrequency,
          view.alertChannel,
          view.lastRunDaysAgo,
        ],
      )
    }
  }

  private async seedUnqualifiedContacts(workspaceId: string, ownerUserId: string): Promise<void> {
    if (DEMO_UNQUALIFIED_CONTACTS.length === 0) return
    await this.contacts.save(
      DEMO_UNQUALIFIED_CONTACTS.map(contact => this.unqualifiedContactRow(contact, workspaceId, ownerUserId)),
    )
  }

  /**
   * #4016 L6 — LA FUSION AUTOMATIQUE, SEMÉE (`DEMO_AUTO_MERGED_DUPLICATE`).
   *
   * Même écriture que le balayeur (`GovernanceService.autoMergeContacts`) :
   * la fiche ressaisie est mise de côté et pointe vers la survivante, la paire
   * est journalisée `auto_merged`. Rien n'est envoyé ni écrit hors de la salle.
   */
  private async seedAutoMergedDuplicate(workspaceId: string, ownerUserId: string): Promise<void> {
    const source = DEMO_UNQUALIFIED_CONTACTS.find(
      contact => contact.full_name === DEMO_AUTO_MERGED_DUPLICATE.keptFullName,
    )
    if (!source?.email) return
    const kept = await this.contacts.findOne({
      where: { workspace_id: workspaceId, full_name: source.full_name, account_id: IsNull() },
      select: ['id'],
    })
    if (!kept) return
    const row = this.unqualifiedContactRow(
      { ...source, title: DEMO_AUTO_MERGED_DUPLICATE.absorbedTitle },
      workspaceId,
      ownerUserId,
    )
    row.deleted_at = new Date()
    row.merged_into_id = kept.id
    const [absorbed] = await this.contacts.save([row])
    if (!absorbed?.id) return
    await this.contacts.manager.query(
      `INSERT INTO duplicate_pairs
         (workspace_id, entity_type, pair_key, left_id, right_id, reason, confidence, decision, decided_at, absorbed_id)
       VALUES ($1, 'contact', $2, $3, $4, $5, $6, 'auto_merged', now(), $4)
       ON CONFLICT (workspace_id, entity_type, pair_key) DO NOTHING`,
      [
        workspaceId,
        duplicatePairKey(kept.id, absorbed.id),
        kept.id,
        absorbed.id,
        DEMO_AUTO_MERGED_DUPLICATE.reason,
        DEMO_AUTO_MERGED_DUPLICATE.confidence,
      ],
    )
  }

  /**
   * #4016 L6 — LE PIPE « DÉTECTÉ, À REVOIR », une ligne par passage
   * (`DEMO_PIPELINE_DETECTIONS`). Écrit exactement ce que le balayeur écrit :
   * des lignes `detected`, jamais l'affaire, le positionnement ou la mission —
   * c'est le clic du visiteur qui les crée. Les deux derniers passages LISENT
   * la salle (un besoin rattaché, un profil pas encore positionné ; un
   * positionnement sans mission) : rien n'est inventé, et un passage dont la
   * salle n'a pas la matière ne s'écrit pas.
   */
  private async seedPipelineDetections(workspaceId: string): Promise<void> {
    const { interest } = DEMO_PIPELINE_DETECTIONS
    await this.contacts.manager.query(
      `INSERT INTO pipeline_detections (workspace_id, kind, account_id, label, source_id, source_key)
       -- #4016.L6.a — la source EST le dernier appel semé du dossier (le lien « Voir l'appel » mène à du réel) ;
       -- sans appel semé, un identifiant neuf : aucun lien, jamais un lien inventé.
       SELECT a.workspace_id, 'interest_to_opportunity', a.id, $3,
              COALESCE((SELECT act.id FROM activities act
                         WHERE act.workspace_id = a.workspace_id AND act.account_id = a.id AND act.kind = 'call'
                         ORDER BY act.occurred_at DESC LIMIT 1), gen_random_uuid()),
              'demo:interest'
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.company_name = $2
        LIMIT 1
       ON CONFLICT (workspace_id, kind, source_key) DO NOTHING`,
      [workspaceId, interest.company, interest.label],
    )
    await this.contacts.manager.query(
      `INSERT INTO pipeline_detections (
         workspace_id, kind, account_id, label, source_id, source_key, project_id, need_id, consultant_id
       )
       SELECT pn.workspace_id, 'shortlist_to_submission', pn.account_id, pn.title,
              gen_random_uuid(), 'demo:shortlist', pn.project_id, pn.id, c.id
         FROM project_needs pn
         JOIN consultants c ON c.workspace_id = pn.workspace_id AND c.archived_at IS NULL
        WHERE pn.workspace_id = $1
          AND pn.project_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM submissions s WHERE s.project_id = pn.project_id AND s.consultant_id = c.id
          )
        ORDER BY pn.created_at, c.created_at
        LIMIT 1
       ON CONFLICT (workspace_id, kind, source_key) DO NOTHING`,
      [workspaceId],
    )
    await this.contacts.manager.query(
      `INSERT INTO pipeline_detections (
         workspace_id, kind, account_id, label, source_id, source_key,
         project_id, need_id, consultant_id, submission_id
       )
       SELECT s.workspace_id, 'interview_to_mission', o.account_id, o.label,
              COALESCE((SELECT i.id FROM interviews i WHERE i.submission_id = s.id LIMIT 1), gen_random_uuid()),
              'demo:interview', s.project_id, s.need_id, s.consultant_id, s.id
         FROM submissions s
         JOIN opportunities o ON o.id = s.project_id
        WHERE s.workspace_id = $1
          AND s.stage = 'interview'
          AND NOT EXISTS (SELECT 1 FROM missions m WHERE m.submission_id = s.id)
        ORDER BY s.created_at
        LIMIT 1
       ON CONFLICT (workspace_id, kind, source_key) DO NOTHING`,
      [workspaceId],
    )
  }

  /** Une ligne de contact « à qualifier » (#1473) — partagée par le semis et son doublon fusionné (#4016 L6). */
  private unqualifiedContactRow(
    contact: (typeof DEMO_UNQUALIFIED_CONTACTS)[number],
    workspaceId: string,
    ownerUserId: string,
  ): ContactEntity {
    return this.demoContactRow(
      {
        full_name: contact.full_name,
        title: contact.title,
        // Le libellé libre de division : vide, faute d'entreprise. Ce n'est
        // pas « périmètre non déterminé » chez un client — c'est l'absence
        // même de client.
        entity: '',
        family: 'IT',
        decision_role: 'unknown',
        // La priorité d'un contact non qualifié n'est pas MESURÉE : elle
        // sortira du score le jour où l'entreprise sera connue. `1` serait
        // un « faible » qu'aucun calcul n'a produit, `5` un « fort » encore
        // moins. On pose le milieu de l'échelle et la fiche l'explique.
        priority: 3,
        seniority: 'direction',
        key_points: contact.key_points,
        why_contact: contact.why_contact,
        photo_url: null,
        email: contact.email,
        phone: contact.phone,
        profile_summary: contact.profile_summary,
        email_message: null,
        linkedin_message: null,
        // Le score de contact se calcule CONTRE un dossier (proximité au
        // périmètre, alignement aux angles d'attaque). Sans dossier, il n'y
        // a rien à calculer : 0 dirait « mauvais contact », ce qui est faux.
        contact_score: 0,
        // `detecte` : l'identité est là, rien d'autre n'a été établi. C'est
        // littéralement l'état d'un contact à qualifier.
        lifecycle_state: 'detecte',
      },
      null,
      null,
      workspaceId,
      ownerUserId,
    )
  }

  /**
   * #2648.1 — LE contact dont l'accroche échoue avec une raison NOMMÉE. Voir
   * `DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT` (`demo-dataset.ts`) pour le
   * pourquoi complet. `account: null, accountId: null` comme les contacts « à
   * qualifier » juste au-dessus : la seule façon de garantir `recent_signals`
   * vide sans toucher aux signaux des six dossiers réels.
   */
  private async seedIcebreakerInsufficientContextContact(workspaceId: string, ownerUserId: string): Promise<void> {
    const contact = DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT
    await this.contacts.save([
      this.demoContactRow(
        {
          full_name: contact.full_name,
          title: contact.title,
          entity: contact.entity,
          family: 'IT',
          decision_role: contact.decision_role,
          // Comme les contacts « à qualifier » : rien n'a été calculé CONTRE un
          // dossier, `0` dirait « mauvais contact », ce qui est faux.
          priority: 3,
          seniority: 'direction',
          key_points: contact.key_points,
          why_contact: contact.why_contact,
          photo_url: null,
          email: contact.email,
          phone: contact.phone,
          profile_summary: contact.profile_summary,
          email_message: null,
          linkedin_message: null,
          contact_score: 0,
          lifecycle_state: 'detecte',
        },
        null,
        null,
        workspaceId,
        ownerUserId,
      ),
    ])
  }

  /**
   * #3104 (27/09/2026) — insère les contacts d'UN dossier en tolérant un
   * conflit d'unicité, au lieu de laisser un `INSERT` en masse avorter TOUT
   * le reste de `seedWorkspace` (les dossiers suivants, et tout ce qui est
   * seedé après eux — `chat_messages` compris, voir plus bas).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ EN PRODUCTION
   * ─────────────────────────────────────────────────────────────────────────
   * Un dossier portait volontairement deux contacts du même nom (première
   * version de #2297.18, « la paire d'homonymes du jeu », `demo-contact-
   * density.ts`) pour démontrer `homonym_conflict`. Un `INSERT` en masse de
   * tous les contacts d'un dossier viole alors l'index unique
   * `idx_contacts_account_normalized_name` (migration `ContactIdentityDedup`,
   * posé pour empêcher les VRAIS doublons d'un enrichissement concurrent) :
   * `seedWorkspace` levait une `QueryFailedError` en plein milieu de la
   * boucle des dossiers, et tout ce qui suit — la conversation d'exemple de
   * `chat_messages` (#3104) comprise — n'était jamais écrit.
   * `DemoPoolService.tidy()` avale cette exception (même doctrine que
   * l'incident du 28/08, `missions_opportunity_uniq`) : la salle restait
   * tronquée pour toujours, le conflit étant déterministe.
   *
   * Revirement du 27/09/2026 (même ticket #2297.18) : la paire elle-même a
   * été retirée du seed — l'ambiguïté qu'elle démontrait vient, en réel, du
   * FOURNISSEUR (People-Search rend plusieurs personnes pour un même nom),
   * jamais de deux lignes en base ; `ContactsService.enrichContactInDemo`
   * simule désormais cet événement sur UN seul contact
   * (`isDemoAmbiguousProviderMatch`, `demo-enrichment.ts`). Ce repli reste :
   * c'est une protection GÉNÉRALE contre tout conflit d'unicité sur les
   * contacts d'un dossier — y compris un contact laissé par un semis
   * partiel/concurrent précédent — pas seulement celui, corrigé, de cette
   * paire précise.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE CORRECTIF
   * ─────────────────────────────────────────────────────────────────────────
   * Même mécanisme que `ContactsService.insertToleratingDuplicates`
   * (contacts.service.ts) — déjà la porte de production pour ce cas exact —
   * simplifié : `seedWorkspace` n'ouvre pas de transaction englobante ici, un
   * repli ligne par ligne suffit. Le lot passe d'abord en un seul `INSERT` ;
   * sur un conflit d'unicité, on retente ligne par ligne et on écarte
   * seulement la ligne fautive (avec un log nommé), jamais les autres.
   */
  /**
   * #4016 L4.1 — l'e-mail ESTIMÉ de la salle : une provenance `inferred` sur le
   * champ `email` des contacts SIMULÉS de {@link DEMO_ESTIMATED_EMAIL_CONTACTS}.
   * La salle ne sonde jamais un vrai serveur de messagerie
   * (`EmailEstimateService` s'y arrête sur `demo`) : elle sème ce que la sonde
   * aurait écrit, avec la règle qui l'a produit et une date relative.
   */
  private async seedEstimatedEmails(saved: readonly ContactEntity[], workspaceId: string): Promise<void> {
    const estimated = saved.filter(
      contact => DEMO_ESTIMATED_EMAIL_CONTACTS.includes(contact.full_name) && (contact.email ?? '').trim(),
    )
    for (const contact of estimated) {
      await this.contacts.manager.query(
        `INSERT INTO field_provenance (workspace_id, entity_type, entity_id, field, source, confidence, actor_id, observed_at)
         VALUES ($1, 'contact', $2, 'email', 'inferred', NULL, NULL, now() - interval '2 days')
         ON CONFLICT (entity_type, entity_id, field) DO NOTHING`,
        [workspaceId, contact.id],
      )
    }
  }

  /**
   * #4180 (EX-10) — LA LIGNE DE BASE de « ce qui a changé depuis la dernière vérification ». Les contacts d'un
   * dossier réanalysé (`previous_analysis_at`) sont semés AUJOURD'HUI : sans cet antidatage, chacun
   * ressortirait « nouveau responsable » du seul fait du semis. Ils sont donc ramenés à 60 jours AVANT la
   * vérification. Aucune personne fictive n'est semée « arrivée depuis » : la section reste vide, à dessein
   * (`DEMO_ACCOUNT_CHANGES_COVERAGE`). Sans `previous_analysis_at`, rien n'est touché.
   */
  private async seedAccountChangesBaseline(
    workspaceId: string,
    accountId: string,
    previousAnalysisAt: string | undefined,
  ): Promise<void> {
    if (!previousAnalysisAt) return
    await this.contacts.manager.query(
      `UPDATE contacts SET created_at = $3::timestamptz - interval '60 days'
        WHERE workspace_id = $1 AND account_id = $2 AND created_at > $3::timestamptz`,
      [workspaceId, accountId, previousAnalysisAt],
    )
  }

  /**
   * V4-CORRECTIFS 4290.12 (#4055.8) — les contacts « a quitté l'entreprise » semés sortent sur la 1re page de
   * /contacts (tri par défaut : `created_at` décroissant). Le semis insère ~25 lignes par page au hasard des
   * identifiants : sans cet ordre, la preuve existe en base mais personne ne la voit en réunion (recette prod 20/10).
   */
  private async seedDepartedContactsFirst(workspaceId: string, accountId: string): Promise<void> {
    await this.contacts.manager.query(
      `UPDATE contacts SET created_at = now() + interval '1 minute'
        WHERE workspace_id = $1 AND account_id = $2 AND raw_data -> 'employmentCheck' ->> 'state' = 'left'`,
      [workspaceId, accountId],
    )
  }

  private async saveDossierContacts(rows: ContactEntity[], accountId: string | null): Promise<ContactEntity[]> {
    // Chemin nominal : un `save` du dossier, par lots de SEED_CONTACT_CHUNK (une seule requête
    // multi-lignes de 1 900 contacts dépasserait la borne de 65 535 paramètres du protocole
    // Postgres — comptes à brief commercial). `save` d'un tableau est UNE transaction : sur un
    // conflit, rien n'est écrit, il faut tout rejouer.
    try {
      return await this.contacts.save(rows, { chunk: SEED_CONTACT_CHUNK })
    } catch (cause) {
      if (!isUniqueViolation(cause)) throw cause
    }

    // Recette du 01/10/2026 (« Préparation » ≈ 60 s) : on rejoue LOT PAR LOT, et seul le lot
    // fautif (≤ 200 lignes) passe ligne par ligne — plus le dossier entier (~1 900
    // allers-retours sur Société Générale).
    const saved: ContactEntity[] = []
    let skipped = 0
    let fellBack = false
    for (let start = 0; start < rows.length; start += SEED_CONTACT_CHUNK) {
      const chunk = rows.slice(start, start + SEED_CONTACT_CHUNK)
      try {
        saved.push(...(await this.contacts.save(chunk)))
        continue
      } catch (cause) {
        if (!isUniqueViolation(cause)) throw cause
      }
      if (!fellBack) {
        fellBack = true
        this.logger.warn(`Semis : conflit d'unicité sur les contacts de ${accountId} — insertion ligne par ligne`)
      }
      for (const row of chunk) {
        try {
          saved.push(await this.contacts.save(row))
        } catch (rowCause) {
          if (!isUniqueViolation(rowCause)) throw rowCause
          skipped += 1
        }
      }
    }
    if (skipped > 0) {
      this.logger.warn(`Semis : ${skipped} contact(s) de démonstration écarté(s) pour doublon de nom sur ${accountId}`)
    }
    return saved
  }

  /**
   * UNE ligne `contacts`, et la seule façon d'en écrire une dans le semis.
   *
   * Ce bloc vivait à l'intérieur de la boucle des six dossiers. Le client
   * d'exemple, lui, n'avait aucun contact du tout ; le jour où il en a eu, deux
   * chemins d'écriture auraient existé pour la même table — et la dérivation de
   * fiche (`demo-contact-profile.ts`) n'aurait été appliquée que sur l'un des
   * deux. Un contact arrivé par l'autre porte se serait ouvert à moitié rempli
   * devant un prospect : périmètre vide, script d'appel vide, onglet
   * « Aucun signal ». C'est la règle « une dérivation vit à un seul endroit ».
   */
  private demoContactRow(
    contact: DemoSeedContact,
    /**
     * #1473 — `null` pour un contact À QUALIFIER, rencontré sans société
     * connue. Le dossier n'est pas manquant : il n'existe pas.
     */
    account: DemoDossierSeed | null,
    accountId: string | null,
    workspaceId: string,
    ownerUserId: string,
  ): ContactEntity {
    const traceSeededAt = new Date()
    const enrichmentTrace = demoEnrichmentTrace(contact, traceSeededAt)
    // E1 (#3698, #3822) — l'état par coordonnée, dérivé de la MÊME trace.
    const enrichmentCoordinates = demoEnrichmentCoordinates(contact, traceSeededAt)
    return this.contacts.create({
      account_id: accountId,
      user_id: ownerUserId,
      // #2160.9 — LE PORTEUR, comme `accounts.assigned_to` (#1408, juste
      // au-dessus dans ce fichier pour les comptes) : la salle de démonstration
      // n'a — délibérément — qu'UN occupant, donc l'attribution est vraie avec
      // un seul membre, jamais une équipe inventée. Sans elle, la fiche
      // contact ouvrirait sur « aucun porteur » devant un prospect, alors que
      // le compte voisin en montre déjà un.
      assigned_to: ownerUserId,
      workspace_id: workspaceId,
      full_name: contact.full_name,
      photo_url: contact.photo_url,
      title: contact.title,
      entity: contact.entity,
      family: contact.family,
      decision_role: contact.decision_role,
      priority: contact.priority,
      email: contact.email,
      // TOUJOURS `false`, y compris sur les interlocuteurs simulés qui
      // portent désormais une adresse (DEMO-02). `email_verified` veut
      // dire « un fournisseur a confirmé que cette adresse délivre » ; une
      // adresse en `.example` ne délivre par construction jamais. C'est
      // aussi l'état le plus fréquent d'un vrai enrichissement : une
      // adresse trouvée, pas encore vérifiée. L'état « prêt à contacter »
      // est porté par `lifecycle_state`, pas par ce drapeau.
      // #4107.4 — SEUL le contact semé avec `email_verified: true` (e-mail deviné puis vérifié SMTP) le porte.
      email_verified: contact.email_verified === true,
      // #2295.4bis — TRANSMIS tel quel, jamais POSÉ ici : seul `demo-dataset.ts`
      // écrit `true`. C'est le fait de SEMIS ("utilisable en démonstration")
      // qui lève le verrou #2295.4 de `classifyGroup()` sans jamais affirmer
      // qu'une adresse a été vérifiée — `email_verified` juste au-dessus reste
      // TOUJOURS `false`, les deux faits restent distincts sur la même ligne.
      demo_seed_first_door: contact.demo_seed_first_door ?? false,
      phone: contact.phone ?? null,
      // #2629.2 — `null` partout ailleurs (voir `DemoContact.linkedin_url`) :
      // seul un contact écrit à la main dans `demo-dataset.ts` le porte.
      linkedin_url: contact.linkedin_url ?? null,
      profile_summary: contact.profile_summary,
      why_contact: contact.why_contact,
      email_message: contact.email_message,
      linkedin_message: contact.linkedin_message,
      contact_score: contact.contact_score,
      seniority: contact.seniority,
      lifecycle_state: contact.lifecycle_state,
      // #2296.30/.33 — l'employeur détecté que `detectedNewEmployer` (web) lit
      // pour PROPOSER la recherche, jamais créer seul (doctrine, GA-26 : même
      // colonne que la production, `contacts.apollo_enrichment`).
      // #3970 — une arrivée simulée est datée RELATIVEMENT au seed (`started_days_ago`).
      apollo_enrichment: resolveDemoEmployment(contact.apollo_enrichment, Date.now()),
      // #3716 — colonnes importées sans champ d'accueil ; `{}` partout ailleurs.
      extra: contact.extra ?? {},
      key_points: contact.key_points,
      // Un contact écarté porte sa DATE et son MOTIF. La date est
      // relative au seed : figée, elle vieillirait à l'écran au fil des
      // mois et se lirait comme une base à l'abandon.
      excluded_at: contact.exclusion_reason ? new Date(Date.now() - 12 * 86_400_000) : null,
      exclusion_reason: contact.exclusion_reason ?? null,
      // #2160.58 — même patron que `excluded_at` juste au-dessus : la date
      // est relative au seed, sinon elle vieillirait à l'écran. `_by` porte
      // le SEUL occupant de la salle de démonstration (même raison que
      // `assigned_to`, plus haut dans cette méthode).
      identity_confirmed_at: contact.identity_confirmed_at ? new Date(Date.now() - 5 * 86_400_000) : null,
      identity_confirmed_by: contact.identity_confirmed_at ? ownerUserId : null,
      // #2160.60 — même patron que `identity_confirmed_at` juste au-dessus :
      // la date est relative au seed, `_by` porte le seul occupant de la
      // salle, `_reason` est TRANSMISE telle quelle (jamais devinée ici).
      recommendation_authorized_at: contact.recommendation_authorized_reason
        ? new Date(Date.now() - 6 * 86_400_000)
        : null,
      recommendation_authorized_by: contact.recommendation_authorized_reason ? ownerUserId : null,
      recommendation_authorized_reason: contact.recommendation_authorized_reason ?? null,
      // #219.8 (#3231) — relation DÉCLARÉE, interlocuteurs FICTIFS seulement.
      declared_person_company_relation: contact.declared_person_company_relation ?? null,
      // #2159.26 — normalisées par le MÊME `normalizeTags` que l'import : la
      // contrainte `contacts_tags_check` refuserait sinon le semis entier.
      tags: normalizeTags(contact.tags ?? []),
      // #2120.68 / #2120.70 — la confiance se voit aussi dans la salle de démo :
      // portées par les interlocuteurs SIMULÉS densifiés (`demo-contact-density.ts`,
      // `toContact()`), `null` par défaut pour tout le reste du jeu de données
      // (six dossiers réels, client d'exemple non densifié) — non mesurée / non
      // engagée, jamais une valeur basse, jamais 0 (GA-18/19).
      email_confidence: contact.email_confidence ?? null,
      phone_confidence: contact.phone_confidence ?? null,
      email_cost_credits: contact.email_cost_credits ?? null,
      phone_cost_credits: contact.phone_cost_credits ?? null,
      // #4178.1 — une nature accompagne tout numéro seedé ; sans numéro, aucune ligne.
      phone_nature: contact.phone ? (contact.phone_nature ?? 'unknown') : null,
      phone_nature_source: contact.phone ? 'provider' : null,
      // #2297.51 — UNE fiche simulée porte des coordonnées archivées par la
      // rétention : la date, relative au seed comme `excluded_at`, et l'archive
      // (que rien ne relit, `select: false`). La fiche le DIT à l'écran.
      enrichment_archived_at:
        contact.enrichment_archived_days_ago !== undefined
          ? new Date(Date.now() - contact.enrichment_archived_days_ago * 86_400_000)
          : null,
      enrichment_archive: contact.enrichment_archive ?? null,
      // #2297.26 reste — voir `DemoSeedContact.recently_enriched_no_result_days_ago`.
      // Le même patron que `enrichContactInDemo` (réel) écrirait sur un clic :
      // ici semé statiquement, pour que le délai de protection soit observable
      // dès l'ouverture de la salle, sans geste préalable du visiteur.
      // #3549.4 — la trace est écrite par `demoEnrichmentTrace` (un seul endroit,
      // GA-26) : l'essai récent resté vide (#2297.26) ET l'essai abouti pour un
      // canal seulement, que /contacts dit « Téléphone/E-mail non trouvé ».
      last_enrichment_at: enrichmentTrace?.last_enrichment_at ?? null,
      last_enrichment_result: enrichmentTrace?.last_enrichment_result ?? null,
      last_enrichment_missing: enrichmentTrace?.last_enrichment_missing ?? null,
      enrichment_coordinates: enrichmentCoordinates,
      // R22 a4 — la disponibilité annoncée par champ : les quatre états de la cellule « Coordonnées ».
      ...demoCoordinateAvailability(contact, traceSeededAt),
      // Tout ce qu'une analyse réelle écrit APRÈS la détection : périmètre,
      // pouvoir budgétaire, script d'appel, cadence, signaux, activité.
      // Dérivé (`demo-contact-profile.ts`) plutôt qu'écrit à la main :
      // un contact ajouté au jeu de données ne doit pas pouvoir arriver
      // à moitié rempli devant un prospect.
      //
      // ⚠️ #1473 — un contact À QUALIFIER n'a pas de dossier, donc RIEN de tout
      // ceci. Ce n'est pas une lacune du semis : périmètre, pouvoir budgétaire,
      // script d'appel, cadence, signaux et activité se DÉDUISENT tous de
      // l'entreprise. Les fabriquer à partir d'un dossier vide écrirait un
      // script d'appel qui ne parle d'aucune société — une donnée inventée
      // devant un prospect. La fiche montre l'identité, et le geste qui manque :
      // rattacher une entreprise.
      scope: account ? demoScope(contact, account) : null,
      budget_authority: demoBudgetAuthority(contact),
      phone_script: account ? demoPhoneScript(contact, account) : null,
      cadence_messages: account ? demoCadenceMessages(contact, account) : null,
      followup_message: account ? demoFollowupMessage(contact, account) : null,
      career_levers: demoCareerLevers(contact),
      implicit_fears: demoImplicitFears(contact),
      signals: account ? demoContactSignals(contact, account) : [],
      activity: account ? demoContactActivity(contact, account) : [],
      language: demoLanguage(contact),
      locale: demoLocale(contact),
      // #2390.8 — un fuseau posé au jeu de données gagne sur celui déduit de l'entité.
      timezone: contact.timezone ?? demoTimezone(contact),
      // #2165.38 — une location réelle, sinon Découvrir sort vide en démo.
      // `demoLocation` dérive la ville du SIÈGE du dossier ; un contact « à
      // qualifier » (#1473, `account === null`) n'a pas d'entreprise, donc pas
      // de siège à suivre — Camille Roussel, la seule des deux dont le
      // `why_contact` nomme un lieu, a été rencontrée à Paris (salon Big Data
      // & AI Paris) : Paris reste le repli plausible pour les deux fiches.
      location:
        contact.location !== undefined ? contact.location : account ? demoLocation(contact, account) : 'Paris, France',
      // SIG-B — la preuve d'un recruteur fictif, même forme que la collecte réelle.
      raw_data: demoContactRawData(contact),
      // The honest provenance stamp — demo contacts are fictional and
      // must never pass for a real source (see migration 1785950000000).
      // #4526.4 — sauf les contacts NOMMÉS d'origine CRM, pour que la puce « Mon CRM » compte en démo.
      source: demoContactSource(contact.full_name),
      // L'issue déclarée de la relation. Elle alimente l'entonnoir du tableau de
      // bord et les taux de conversion ; `DEMO_USER_ACTIONS` porte la trace
      // correspondante au journal, parce qu'en production les deux naissent du
      // MÊME geste. `'new'` par défaut : l'état de départ, celui que le visiteur
      // fait avancer lui-même depuis la ligne du contact.
      user_status: contact.user_status ?? 'new',
    })
  }

  /**
   * L'HISTORIQUE DE CORRECTION de l'organigramme du dossier d'exemple
   * (OrgGraph FINAL §7 ; ledger `org_graph_corrections`).
   *
   * Ce que la salle doit montrer, et qu'elle ne montrait pas : trois faits sur
   * une PERSONNE, dont un ANNULÉ avec sa pierre tombale. C'est la démonstration
   * entière de « versionné et réversible » — un tiroir vide ne prouve rien.
   *
   * #2310.54 — une quatrième ligne, sur une ENTITÉ (`objectType: 'entity'`),
   * s'y ajoute : le ledger et la route API l'acceptaient depuis le 29/08, mais
   * aucun écran ne pouvait encore l'écrire, donc aucune salle ne le montrait.
   *

   * ⚠️ La version est écrite sur la COLONNE `accounts.org_graph_version`, pas
   * seulement dans le blob : c'est elle que le verrou optimiste lit. Une salle
   * où la colonne dit 1 pendant que l'historique montre quatre versions
   * accepterait une correction posée sur une version périmée — le prospect
   * verrait un conflit qui n'existe pas, ou pire, n'en verrait pas un qui existe.
   *
   * ⚠️ Le blob est aligné dans la MÊME requête (`jsonb_set`). Deux endroits qui
   * portent la version du graphe doivent la porter identique, sinon l'écran et
   * le verrou ne parlent pas du même dossier.
   */
  /**
   * LES PLANS D'ENRICHISSEMENT du dossier d'exemple (§11 FINAL).
   *
   * Deux lignes, et deux etats differents a dessein : un plan TERMINE, dont
   * l'ecart entre le cout ANNONCE et le cout REEL se lit d'un coup d'oeil, et un
   * plan PARTIEL dont une vague est tombee — sans lui, le geste « reprendre »
   * n'aurait rien a reprendre dans la salle, et un prospect ne verrait jamais ce
   * qui arrive quand une vague echoue.
   *
   * La vague en echec porte `actualCredits: null`, jamais `0` : rien n'a ete
   * debite, et un zero se lirait « mesure, et gratuit ».
   */
  /**
   * #3235 (#3212.4/.6) — deux runs TERMINÉS par compte listé dans `DEMO_ANALYSIS_RUNS` : le journal
   * « Historique des analyses » n'est plus vide et `explainVerdictChange` a de quoi nommer la
   * révision. Lit `accountIds` : vient APRÈS la boucle des dossiers.
   */
  private async seedAnalysisRuns(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const day = 86_400_000
    for (const run of DEMO_ANALYSIS_RUNS) {
      const accountId = accountIds.get(run.company)
      if (!accountId) {
        this.logger.warn(`Run d'analyse de démonstration sans dossier : ${run.company}`)
        continue
      }
      const at = new Date(Date.now() - run.daysAgo * day).toISOString()
      await this.accounts.manager.query(
        `INSERT INTO analysis_runs
           (account_id, user_id, workspace_id, status, scope_mode, verdict_snapshot, scope_selection,
            created_at, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'completed', $4::text, $5::jsonb, $7::jsonb, $6::timestamptz,
                 ($6::timestamptz + interval '6 minutes'))`,
        [
          accountId,
          ownerUserId,
          workspaceId,
          run.scope_mode,
          JSON.stringify(run.verdict_snapshot),
          at,
          // Cadrage analyse (15/10) — « Cadrage appliqué » en tête du dossier ; NULL = run d'avant.
          run.scope_selection ? JSON.stringify(run.scope_selection) : null,
        ],
      )
    }
    // #3682 — « Dernière vérification » : un run terminé récent, sans snapshot de verdict (NULL).
    for (const run of DEMO_VERIFICATION_RUNS) {
      const accountId = accountIds.get(run.company)
      if (!accountId) {
        this.logger.warn(`Run de vérification de démonstration sans dossier : ${run.company}`)
        continue
      }
      const at = new Date(Date.now() - run.daysAgo * day).toISOString()
      await this.accounts.manager.query(
        `INSERT INTO analysis_runs
           (account_id, user_id, workspace_id, status, scope_mode, verdict_snapshot, scope_selection,
            created_at, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'completed', $4::text, NULL, $6::jsonb, $5::timestamptz,
                 ($5::timestamptz + interval '6 minutes'))`,
        // Théo B r1-recherche.N6 — le cadrage conservé (BPCE) ; NULL = pas de rappel en tête du dossier.
        [
          accountId,
          ownerUserId,
          workspaceId,
          run.scope_mode,
          at,
          run.scope_selection ? JSON.stringify(run.scope_selection) : null,
        ],
      )
    }
    // Théo B r2-mes-analyses — des analyses de profondeurs différentes, dont une ÉCHOUÉE (« Réessayer »).
    // `scope_selection` ne porte ici que la profondeur : aucun cadrage deviné.
    for (const run of DEMO_HISTORY_RUNS) {
      const accountId = accountIds.get(run.company)
      if (!accountId) {
        this.logger.warn(`Run d'historique de démonstration sans dossier : ${run.company}`)
        continue
      }
      const at = new Date(Date.now() - run.daysAgo * day).toISOString()
      await this.accounts.manager.query(
        `INSERT INTO analysis_runs
           (account_id, user_id, workspace_id, status, scope_mode, verdict_snapshot, scope_selection,
            created_at, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, NULL, $6::jsonb, $7::timestamptz,
                 ($7::timestamptz + interval '5 minutes'))`,
        [accountId, ownerUserId, workspaceId, run.status, run.scope_mode, JSON.stringify({ depth: run.depth }), at],
      )
    }
  }

  private async seedOrgEnrichmentJobs(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const day = 86_400_000

    for (const job of demoOrgEnrichmentJobs()) {
      const accountId = accountIds.get(job.companyName)
      // Un plan sans dossier ne s'ecrit pas : meme regle que les corrections
      // d'organigramme ci-dessous.
      if (!accountId) {
        this.logger.warn(`Plan d'enrichissement de demonstration sans dossier : ${job.companyName}`)
        continue
      }
      const createdAt = new Date(Date.now() - job.daysAgo * day).toISOString()
      await this.accounts.manager.query(
        `INSERT INTO org_enrichment_jobs
           (workspace_id, account_id, user_id, mode, target_params, wave_size, status,
            prompt_version, estimated_credits, actual_credits, waves, error, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::jsonb, $6, $7::text,
                 $8::text, $9, $10, $11::jsonb, $12::text, $13::timestamptz, $13::timestamptz)`,
        [
          workspaceId,
          accountId,
          ownerUserId,
          job.mode,
          JSON.stringify(job.targetParams),
          job.waveSize,
          // L'etat est DERIVE des vagues, jamais ecrit a la main — meme chemin
          // que la production (`deriveOrgEnrichmentJobStatus`).
          deriveOrgEnrichmentJobStatus(job.waves),
          ORG_ENRICHMENT_PROMPT_VERSION,
          job.estimatedCredits,
          job.actualCredits,
          JSON.stringify(job.waves),
          job.error,
          createdAt,
        ],
      )
    }
  }

  private async seedOrgCorrections(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const day = 86_400_000
    const touched = new Map<string, number>()

    for (const correction of demoOrgCorrections()) {
      const accountId = accountIds.get(correction.companyName)
      // Une correction sans dossier ne s'écrit pas : la contrainte la refuserait
      // et `POST /demo/session` partirait en 500 pour tous les prospects.
      if (!accountId) {
        this.logger.warn(`Correction d'organigramme de démonstration sans dossier : ${correction.companyName}`)
        continue
      }
      const createdAt = new Date(Date.now() - correction.daysAgo * day).toISOString()
      await this.accounts.manager.query(
        // ⚠️ Les colonnes jsonb sont CASTÉES : Postgres déduit le type depuis la
        // colonne cible dans un `VALUES` littéral, mais pas dès qu'on y met une
        // expression — un `null` non typé s'y fait refuser.
        `INSERT INTO org_graph_corrections
           (workspace_id, account_id, user_id, object_type, object_id, field,
            old_value, new_value, graph_version_before, graph_version_after,
            reason, evidence, created_at, reverted_at, motive)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text,
                 $7::jsonb, $8::jsonb, $9, $10,
                 $11::text, $12::jsonb, $13::timestamptz, $14::timestamptz, $15::text)`,
        [
          workspaceId,
          accountId,
          ownerUserId,
          correction.objectType,
          correction.objectId,
          correction.field,
          JSON.stringify(correction.oldValue),
          JSON.stringify(correction.newValue),
          correction.graphVersionBefore,
          correction.graphVersionAfter,
          correction.reason,
          JSON.stringify(correction.evidence),
          createdAt,
          // La pierre tombale d'une annulation. `null` = la correction tient
          // toujours ; elle sera rejouée après le prochain run.
          correction.reverted ? createdAt : null,
          // #2126.26 — le geste ; absent = « corriger », le défaut de la colonne.
          correction.motive ?? 'corrected',
        ],
      )
      touched.set(accountId, Math.max(touched.get(accountId) ?? 1, correction.graphVersionAfter))
    }

    for (const [accountId, version] of touched) {
      await this.accounts.manager.query(
        `UPDATE accounts
            SET org_graph_version = $2,
                raw_analysis = CASE
                  WHEN raw_analysis -> 'org' -> 'orgGraph' IS NULL THEN raw_analysis
                  ELSE jsonb_set(raw_analysis, '{org,orgGraph,graphVersion}', to_jsonb($2::int))
                END
          WHERE id = $1 AND workspace_id = $3`,
        [accountId, version, workspaceId],
      )
    }
  }

  /**
   * #3532 (recette Y20) — `materialize` écrit les besoins, défis et programmes
   * avec `first_detected_at = now()` : à l'instant du semis, donc PLUS RÉCENTS que
   * toute action semée, et le fil « Historique & preuves » (récent d'abord, douze
   * lignes) ne montrait qu'eux — « Message copié » et « Analyse terminée »,
   * semés à 4-5 h, restaient sous « Voir les lignes plus anciennes ». Ces lignes
   * naissent à l'analyse qui les a trouvées : on les date de la PREMIÈRE
   * `analysis_completed` du dossier (jeu de données), jamais d'une date inventée.
   * Seuls les dossiers qui portent une telle analyse sont touchés ; les lignes
   * déjà datées (signaux) gardent leur date.
   */
  private async dateMaterializedOpportunities(accountIds: Map<string, string>): Promise<void> {
    for (const [companyName, accountId] of accountIds) {
      const hoursAgo = DEMO_USER_ACTIONS.filter(
        action => action.company === companyName && action.action_type === 'analysis_completed',
      ).reduce<number | null>(
        (oldest, action) => (oldest === null ? action.hours_ago : Math.max(oldest, action.hours_ago)),
        null,
      )
      if (hoursAgo === null) continue
      await this.accounts.manager.query(
        `UPDATE opportunities
            SET first_detected_at = now() - make_interval(hours => $2::int)
          WHERE account_id = $1
            AND first_detected_at > now() - interval '1 hour'`,
        [accountId, hoursAgo],
      )
    }
  }

  /**
   * Ce qui vit AUTOUR des dossiers : le vivier de consultants, les traces
   * d'activité et les objectifs du mois.
   *
   * Sans eux, « Vivier », « Historique » et « Pilotage » s'ouvrent sur un état
   * vide au milieu d'une démonstration — l'espace a l'air de n'avoir jamais
   * servi, ce qui est exactement l'inverse de ce qu'une démo doit montrer.
   *
   * Toutes les dates sont ancrées sur MAINTENANT (le moment du seed, donc de la
   * remise à neuf entre deux visiteurs) : une date écrite en dur dans le jeu de
   * données afficherait « il y a huit mois » quelques mois après le déploiement.
   */
  private async seedCompanionData(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const now = Date.now()

    // Les PROJETS, matérialisés depuis `raw_analysis` par la MÊME projection
    // déterministe qu'en production. On ne fabrique donc aucun projet : on
    // exécute sur les dossiers d'exemple ce que le pipeline exécute sur un run
    // réel. Sans cette étape, l'écran Projets — le pivot du produit — s'ouvrirait
    // vide devant un prospect.
    for (const accountId of accountIds.values()) {
      await this.projects.materialize(accountId)
    }
    await this.dateMaterializedOpportunities(accountIds)

    // #3678.2 (recette G5, 11/10) — « Ce que ça change » : 0 occurrence en démo SNCF. La file affiche les
    // 3 pistes les plus récentes ; celles que `materialize` vient d'écrire (fraîches, sans
    // primary_domain_code) passaient devant, et une piste sans domaine n'écrit AUCUNE ligne d'impact
    // (« inconnu » ne s'affiche pas). Le dossier SNCF est un dossier IT : ses lignes d'intake
    // matérialisées portent le pack de l'offre de la salle (`esn_it`). Les signaux semés plus bas gardent
    // leur domaine propre (ou son absence, qui les laisse « isolés »).
    const sncfAccountId = accountIds.get(DEMO_DELIVERY_CARRIER)
    if (sncfAccountId) {
      await this.accounts.manager.query(
        `UPDATE opportunities
            SET primary_domain_code = $2
          WHERE account_id = $1
            AND primary_domain_code IS NULL
            AND ${projectStageInSql('stage', INTAKE_STAGES)}`,
        [sncfAccountId, 'esn_it'],
      )
    }

    // Complément SG du 28/09/2026 (retour de démo) — sur le compte Société
    // Générale : les ESN employeuses citées au CSV (« Les ESN présentes »
    // était vide) et les pistes « Besoin détecté » reliées à leur ligne source
    // (« la source du fait n'est pas identifiée » sur chacune). APRÈS
    // `materialize` : ce sont ses lignes que l'on complète. Les MÊMES
    // écritures que `scripts/demo-sg-complement.ts`, qui rattrape les salles
    // déjà semées.
    const societeGeneraleAccountId = accountIds.get('Société Générale')
    if (societeGeneraleAccountId) {
      await applySgPartnersAndNeeds(
        (sql, params) => this.accounts.manager.query(sql, params),
        workspaceId,
        societeGeneraleAccountId,
        { dryRun: false },
      )

      // #3679 — LA PISTE COMPLÈTE : voir le docblock de `DEMO_SG_COMPLETE_LEAD`
      // (`demo-dataset.ts`) pour la raison du choix de ce compte plutôt que SNCF.
      await applySgCompleteLead(
        (sql, params) => this.accounts.manager.query(sql, params),
        workspaceId,
        societeGeneraleAccountId,
        DEMO_SG_COMPLETE_LEAD,
        false,
      )
    }

    // Complément BPCE du 30/09/2026 — mêmes écritures, sur le compte Groupe BPCE.
    const bpceAccountId = accountIds.get(DEMO_BPCE_REAL_CONTACTS_COMPANY)
    if (bpceAccountId) await this.seedBpceComplement(workspaceId, bpceAccountId)

    // Les ESN présentes des cinq briefs commerciaux (01/10/2026) — APRÈS les
    // relevés SG et BPCE ci-dessus, dont les lignes gagnent sur un nom voisin.
    for (const [companyName, accountId] of accountIds) {
      await this.seedBriefPartners(workspaceId, accountId, companyName)
      // #3895 — l'historique des besoins FERMÉS (Sanofi).
      await this.seedBriefClosedNeeds(workspaceId, ownerUserId, accountId, companyName)
    }

    // ⚠️ LE VIVIER D'ABORD — il est LU par les deux étapes qui suivent.
    //
    // `advanceDemoPipeline` (le refus antérieur) et `seedDeliveryClient`
    // (positionnements, affectations de mission) retrouvent les consultants PAR
    // LEUR NOM, avec un `SELECT … FROM consultants WHERE workspace_id = $1`.
    // Écrits après, ils ne pouvaient pas y être : les deux lectures rendaient
    // zéro ligne et chaque `if (!consultantId) continue` sautait en silence.
    // Mesuré en production le 28/08 sur le lien public — sept missions bien
    // nommées et « Personne d'affecté » sur toutes.
    //
    // Le vivier ne dépend de RIEN d'autre (ni des comptes, ni des projets) : le
    // remonter ici est sans effet de bord, et c'est le seul ordre qui rende ces
    // deux lectures possibles.
    await this.seedVivier(workspaceId, ownerUserId, now)
    // #2175.29 (épopée #2880) — l'accord réel d'UN positionné, voir
    // `DEMO_AGREEMENT_CONFIRMED_CONSULTANT`. Deux horodatages de geste posés
    // sur une fiche du vivier qu'on vient d'écrire, relue par son nom.
    await this.accounts.manager.query(
      `UPDATE consultants
          SET tjm_validated_at = now() - interval '3 days', cv_validated_at = now() - interval '3 days'
        WHERE workspace_id = $1 AND full_name = $2`,
      [workspaceId, DEMO_AGREEMENT_CONFIRMED_CONSULTANT],
    )
    // Théo 23/10 — « CV lu = fiche qualifiée » : trois CV lus cette semaine.
    await this.accounts.manager.query(
      `UPDATE consultants SET cv_auto_read_at = now() - interval '2 days'
        WHERE workspace_id = $1 AND full_name = ANY($2)`,
      [workspaceId, [...DEMO_CV_READ_THIS_WEEK]],
    )
    // #2569.4 — le parcours du lot N (import ZIP/messagerie) doit être VISIBLE
    // en démonstration : un doublon résolu automatiquement, une exception
    // isolée pour revue. Après le vivier : ce sont des fiches EN PLUS, jamais
    // un rattachement dans les sept profils déjà réglés pour le matching.
    await this.seedCvImportExamples(workspaceId, ownerUserId)
    // #2818 — une fiche par source du port de sourcing externe, sans quoi
    // « Chercher hors vivier » s'ouvrirait vide sur tous les besoins de la
    // salle. Voir le docblock de `DEMO_EXTERNAL_SOURCING_CONSULTANTS`.
    await this.seedExternalSourcingExamples(workspaceId, ownerUserId)

    // Puis on avance quelques projets dans le pipe, comme un commercial l'aurait
    // fait, pour que les colonnes ne soient pas toutes à zéro. Le montant est
    // posé sur DEUX projets seulement : un pipe où tout est chiffré ne
    // ressemble à aucune réalité, et c'est le compteur « sans montant » qu'on
    // veut voir vivre.
    await this.advanceDemoPipeline(workspaceId, now, ownerUserId)

    // Puis la moitié « après la signature » : positionnements, missions,
    // préparation de facturation. Elle vit sur un client FICTIF, et la raison
    // est écrite au-dessus de `DEMO_DELIVERY_CLIENT`.
    await this.seedDeliveryClient(workspaceId, ownerUserId, now, accountIds, contactIds)

    // #3246 (lot X65) — les cas gagné / perdu que `find_similar_cases` compare
    // aux dossiers : sur BNP Paribas (décision Louis 04/10/2026), voir `DEMO_SIMILAR_CASES`.
    await this.seedSimilarCases(workspaceId, ownerUserId, now, accountIds)

    // #3918.b / #3920.crm / #3903 (lot M01) — les affaires du CRM de l'ESN chez Société Générale et
    // les signaux que les règles de production en tirent : voir `DEMO_CRM_DEALS`.
    await this.seedCrmDeals(workspaceId, now, accountIds)

    // Épopée #2880 (lot V33) — le croisement expertise ↔ fondement/preuve.
    // APRÈS le client de livraison et le vivier : ses preuves sont une mission
    // et un consultant de la salle, relus par leur NOM.
    await this.seedExpertiseGroundings(workspaceId, ownerUserId)

    // Décision Louis 04/10/2026 — plus aucun compte fictif dans la salle : les
    // comptes « plateforme d'intermédiation » et « acheteur public » sont
    // retirés (aucun vrai compte de la salle n'en est un) ; voir
    // `DEMO_ENTITY_RESOLUTION_COVERAGE` (demo-coverage.ts).

    // Recette prod 05/10 — CGI n'a PLUS de ligne `accounts` : une ESN partenaire
    // n'est pas un compte prospect (un compte vide ne s'affiche pas). Le
    // partenaire reste porté par `account_partners` (voir `DEMO_SPRINT_PARTNER_ROUTE_PARTNER`).

    // #2972 — le consultant en sous-traitance se rattache à ce compte partenaire (le vivier est écrit AVANT les comptes).
    await this.linkSubcontractorPartners(workspaceId, accountIds)

    // #3294 / #3278 — cinq comptes ouverts à UN contact : « comptes ouverts non étendus » se lit en salle.
    await this.seedExtensionAccounts(workspaceId, ownerUserId, accountIds)

    // #4193.6 — missions datées dans chaque fenêtre 30/60/90 jours (SNCF, Orange). APRÈS les comptes d'extension :
    // Orange en est un, et posé avant (dans `seedDeliveryClient`) le compte n'existait pas encore — ses trois missions
    // étaient sautées sans bruit (« 0 Orange » en recette 31/10, relevé par le job « Démo (semis sur vraie base) »).
    await seedDemoCrmCounters(this.accounts.manager, workspaceId, ownerUserId, now)

    // R33b (16/10) — parité d'historique et d'affaires des comptes de brief (Airbus, EDF, Renault, Thales, Orange) :
    // APRÈS les comptes d'extension, dont elle lit les contacts.
    await this.seedParityHistory(workspaceId, ownerUserId, accountIds)

    // #3544.5 — plus de 50 positionnements : APRÈS tous les autres (shortlists, refus, livraison).
    await this.seedSubmissionsBeyondFirstPage(workspaceId, ownerUserId)

    // #3407 (recette prod 02/10) — le niveau d'effort des comptes compagnons : ils
    // tiennent le HAUT de /accounts (le plus récent d'abord) et, sans niveau, la
    // liste n'y montrait aucun préfixe d'effort. APRÈS les quatre INSERT ci-dessus.
    await this.seedCompanionEffort(workspaceId, ownerUserId)

    // #4158.13 — l'équipe : trois collègues fictifs, leurs comptes, des actions
    // déléguées et de l'activité. APRÈS `seedCompanionEffort` (qui pose l'occupant
    // sur tout compte sans responsable) : les comptes des collègues lui sont repris.
    await this.seedColleagues(workspaceId, ownerUserId, accountIds, now)

    // #4158 (lot L4) — les garde-fous entre collègues : APRÈS `seedColleagues` (les collègues
    // fictifs de L2 n'existent pas avant). Sans collègue : aucun effet. Un échec ici ne doit pas faire échouer la salle entière.
    try {
      // Les lectures passent par les repositories (jamais de SQL brut sur `contacts`, GA-405).
      const showcaseId = accountIds.get('Société Générale') ?? null
      const showcaseContact = showcaseId
        ? await this.contacts.findOne({
            where: { workspace_id: workspaceId, account_id: showcaseId, deleted_at: IsNull() },
            order: { created_at: 'ASC' },
            select: ['id'],
          })
        : null
      await seedTeamGuardrails(this.accounts.manager, {
        workspaceId,
        ownerUserId,
        accountId: showcaseId,
        contactId: showcaseContact?.id ?? null,
      })
    } catch (error) {
      this.logger.warn('Garde-fous entre collègues : semis ignoré', { error })
    }

    // Théo D team-business.N2 — les cibles des collègues et UNE proposition de cible en attente (craft rule n°9).
    try {
      await seedTeamObjectives(this.accounts.manager, { workspaceId, ownerUserId, now: new Date(now) })
    } catch (error) {
      this.logger.warn('Objectifs de l’équipe : semis ignoré', { error })
    }

    // CE QUE LAURA GARDE EN TÊTE. Sans ces lignes, Réglages › Mémoire de Laura
    // s'ouvre vide devant un prospect — c'est-à-dire que l'écran qui répond
    // « voici ce que je retiens de toi, et voici comment tu l'effaces » ne
    // montre ni la mémoire, ni le geste de retrait. La raison complète est
    // au-dessus de `DEMO_MEMORY_FACTS`.
    for (const item of DEMO_MEMORY_FACTS) {
      const accountId = item.company ? (accountIds.get(item.company) ?? null) : null
      // Un fait attaché à un compte introuvable ne devient PAS un fait global :
      // il changerait de portée en silence. On le saute.
      if (item.company && !accountId) continue
      // #1918.2 — le PÉRIMÈTRE, résolu par son nom dans CET espace. Introuvable,
      // on saute : un élément d'équipe sans équipe ne filtrerait rien, et la
      // contrainte `memory_pinned_facts_business_unit_scope_requires_id_check`
      // le refuserait de toute façon.
      const businessUnitId = item.businessUnit ? await this.demoBusinessUnitId(workspaceId, item.businessUnit) : null
      if (item.scope === 'business_unit' && !businessUnitId) continue
      // #2260.7 — L'OBJET VISÉ, résolu par son NOM dans CET espace — le même
      // registre `contactIds` que le reste du semis pour un contact ; une
      // requête bornée à l'espace pour les trois autres (`demoNeedId`,
      // `demoConsultantId`, `demoMissionId`). Introuvable, on saute : un objet
      // visé qui ne désigne rien mentirait sur ce que la ligne est.
      let objectColumns = { contact_id: null, need_id: null, consultant_id: null, mission_id: null } as {
        contact_id: string | null
        need_id: string | null
        consultant_id: string | null
        mission_id: string | null
      }
      if (item.object) {
        const objectId =
          item.object.type === 'contact'
            ? (contactIds.get(item.object.name) ?? null)
            : item.object.type === 'need'
              ? await this.demoNeedId(workspaceId, item.object.name)
              : item.object.type === 'consultant'
                ? await this.demoConsultantId(workspaceId, item.object.name)
                : await this.demoMissionId(workspaceId, item.object.name)
        if (!objectId) continue
        objectColumns = {
          contact_id: item.object.type === 'contact' ? objectId : null,
          need_id: item.object.type === 'need' ? objectId : null,
          consultant_id: item.object.type === 'consultant' ? objectId : null,
          mission_id: item.object.type === 'mission' ? objectId : null,
        }
      }
      const day = 24 * 60 * 60 * 1000
      // #1918.1 — la portée est ÉCRITE : sans elle, la base retombe sur
      // `workspace` et la salle ne montrerait jamais « Toi uniquement ». Le
      // propriétaire (`ownerUserId`) est celui sous lequel le visiteur est
      // connecté : un élément « moi » semé pour quelqu'un d'autre lui serait
      // invisible — c'est la règle même que la portée pose.
      // ⚠️ Les QUATRE colonnes de désignation (#2260.7) sont AJOUTÉES EN FIN de
      // liste : insérées au milieu, elles décaleraient chaque `$n`.
      const inserted: unknown = await this.accounts.manager.query(
        `INSERT INTO memory_pinned_facts
           (user_id, workspace_id, account_id, fact, kind, origin, scope, business_unit_id, expires_at, created_at,
            contact_id, need_id, consultant_id, mission_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          ownerUserId,
          workspaceId,
          accountId,
          item.fact,
          item.kind,
          item.origin,
          item.scope,
          businessUnitId,
          item.expiresInDays === null ? null : new Date(now + item.expiresInDays * day).toISOString(),
          new Date(now - item.daysAgo * day).toISOString(),
          objectColumns.contact_id,
          objectColumns.need_id,
          objectColumns.consultant_id,
          objectColumns.mission_id,
        ],
      )
      // #1916.23 — L'HISTORIQUE semé : les gestes déjà faits sur l'élément, par
      // le propriétaire de la salle. Sans ligne insérée (conflit), il n'y a rien
      // à raconter : on ne rattache jamais un geste à une ligne devinée.
      const factId = Array.isArray(inserted) ? (inserted[0] as { id?: string } | undefined)?.id : undefined
      if (!factId) continue
      // Q1 (13/09) — une note de Laura CONFIRMÉE par le propriétaire de la salle :
      // la salle montre « Confirmée par <prénom> » à côté d'une note « à vérifier ».
      if (item.confirmedDaysAgo !== undefined) {
        await this.accounts.manager.query(
          `UPDATE memory_pinned_facts SET confirmed_at = $1, confirmed_by = $2 WHERE id = $3`,
          [new Date(now - item.confirmedDaysAgo * day).toISOString(), ownerUserId, factId],
        )
      }
      for (const step of item.history ?? []) {
        await this.accounts.manager.query(
          `INSERT INTO memory_fact_events
             (workspace_id, fact_id, actor_user_id, event, previous_value, new_value, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            workspaceId,
            factId,
            ownerUserId,
            step.event,
            step.previousValue,
            step.newValue,
            new Date(now - step.daysAgo * day).toISOString(),
          ],
        )
      }
    }

    // Les notes de terrain (socle CRM). Sans elles, le panneau « Notes » d'une
    // fiche s'ouvre vide au milieu d'une démonstration : le visiteur voit un
    // cadre, pas une capacité. Les dates sont relatives au seed pour qu'elles
    // ne vieillissent jamais.
    const noteRows = DEMO_NOTES.map(note => {
      const entityId = note.contact ? contactIds.get(note.contact) : accountIds.get(note.company)
      if (!entityId) return null
      const at = new Date(now - note.daysAgo * 24 * 60 * 60 * 1000)
      return this.notes.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        entity_type: note.contact ? 'contact' : 'account',
        entity_id: entityId,
        body: note.body,
        pinned: note.pinned,
        // #3895 — la portée entité du groupe : des comptes de la salle, nommés dans le jeu de données.
        also_applies_to_account_ids: (note.alsoAppliesTo ?? []).flatMap(name => accountIds.get(name) ?? []),
        created_at: at,
        updated_at: at,
      })
    }).filter((row): row is NoteEntity => row !== null)
    if (noteRows.length > 0) await this.notes.save(noteRows)

    // #2288.2 — les reçus de vérification à la demande, pour que la colonne
    // « Vérification » de la prospection inversée ne soit pas uniformément
    // « Non vérifié » devant un prospect.
    await this.seedMarketVerificationReceipts(workspaceId, ownerUserId, [...accountIds.keys()], now)

    // #2151.59 — une note de terrain sur un candidat DÉCOUVRIR, avant qu'il ne
    // devienne un compte. Le SIREN vient de `demoDiscoverResponse`
    // (`demo-scripts.ts`) : la salle ne fait aucun appel réseau, donc ce
    // premier candidat scripté (et son SIREN) est le même à chaque recherche.
    // Sans cette ligne, le panneau de notes du candidat que tout visiteur
    // croise en premier s'ouvrirait vide.
    {
      const at = new Date(now - DEMO_DISCOVER_CANDIDATE_NOTE.daysAgo * 24 * 60 * 60 * 1000)
      await this.notes.save(
        this.notes.create({
          workspace_id: workspaceId,
          user_id: ownerUserId,
          entity_type: 'discover_candidate',
          entity_id: candidateNoteEntityId(workspaceId, DEMO_DISCOVER_CANDIDATE_NOTE.siren),
          body: DEMO_DISCOVER_CANDIDATE_NOTE.body,
          pinned: false,
          created_at: at,
          updated_at: at,
        }),
      )
    }

    // La TIMELINE. Sans elle, l'onglet « Historique » d'un dossier s'ouvre sur
    // « aucune activité » au moment exact où un prospect demande ce que devient
    // l'historique de ses échanges.
    //
    // `source: 'manual'` sur toutes les lignes, et c'est délibéré : aucune
    // messagerie n'est connectée à une salle de démonstration, donc afficher
    // « lu dans ta messagerie » serait faux. La provenance est la seule chose
    // qu'on ne met pas en scène.
    const activityRowByIndex = new Map<number, ActivityEntity>()
    const activityRows = DEMO_ACTIVITIES.map((activity, activityIndex) => {
      const accountId = accountIds.get(activity.company)
      if (!accountId) return null
      const contactId = activity.contact ? (contactIds.get(activity.contact) ?? null) : null
      const at = new Date(now - activity.daysAgo * 24 * 60 * 60 * 1000)
      const row = this.activities.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        kind: activity.kind,
        // #2124.68 — `manual` pour tout ce qui s'échange, `system` pour la
        // trace d'une porte de décision : c'est le produit qui l'écrit quand
        // quelqu'un tranche, et la salle ne met pas en scène une provenance
        // qu'elle n'aurait pas.
        source: activity.source ?? 'manual',
        direction: activity.direction,
        subject: activity.subject,
        body: activity.body,
        body_truncated: false,
        occurred_at: at,
        duration_seconds: activity.durationSeconds,
        account_id: accountId,
        contact_id: contactId,
        project_id: null,
        link_reason: 'manual',
        external_id: null,
        external_url: null,
        created_at: at,
        // L'issue d'un appel (N11-B) : `undefined` sur tout ce qui n'est pas
        // un appel se lit `null` en base, comme un appel dont l'issue n'a pas
        // été renseignée — les deux ABSENCES sont la même valeur, et c'est
        // voulu (`activities_call_outcome_check` l'accepte pour les deux).
        call_outcome: activity.outcome ?? null,
        // #2377.1/.4/.6 — le debrief du compilateur de fin d'appel, seedé sur
        // le seul échange du jeu qui en porte un (voir `DemoActivity`).
        call_debrief: activity.callDebrief ?? null,
      })
      activityRowByIndex.set(activityIndex, row)
      return row
    }).filter((row): row is ActivityEntity => row !== null)
    if (activityRows.length > 0) await this.activities.save(activityRows)

    // #2974 — les participants d'événement : le contact de chaque réunion ou appel
    // qui en nomme un (`activity_participants`, lu par `CampaignAudienceService`).
    // Sans eux le sélecteur « Événement » de l'audience ne s'affichait jamais.
    // `handle` = le nom : aucune adresse n'est inventée, et ni `is_self` ni un
    // handle sans contact ne sont semés.
    const participantRows = DEMO_EVENT_PARTICIPANTS.flatMap(participant => {
      const activity = activityRowByIndex.get(participant.activityIndex)
      const contactId = contactIds.get(participant.contact)
      return activity?.id && contactId
        ? [
            {
              activity_id: activity.id,
              handle: participant.contact,
              display_name: participant.contact,
              contact_id: contactId,
              is_self: false,
            },
          ]
        : []
    })
    if (participantRows.length > 0) await this.activities.manager.insert(ActivityParticipantEntity, participantRows)

    // Les TÂCHES. Une en retard À DESSEIN : sans elle, l'écran « Aujourd'hui »
    // n'affiche jamais l'état qu'un commercial reconnaît le mieux, et le bloc
    // du retard resterait invisible en démonstration.
    const taskRows = DEMO_TASKS.map(entry => {
      const accountId = entry.company ? (accountIds.get(entry.company) ?? null) : null
      if (entry.company && !accountId) return null
      const due = new Date(now + entry.dueInDays * 24 * 60 * 60 * 1000)
      // #2392 — la date de création et la clôture sont relatives au seed : la
      // clôture de fin de journée lit « créée / close aujourd'hui ».
      const createdAt = new Date(now - (entry.createdDaysAgo ?? 3) * 24 * 60 * 60 * 1000)
      return this.tasks.create({
        workspace_id: workspaceId,
        owner_id: ownerUserId,
        created_by: ownerUserId,
        title: entry.title,
        details: entry.details,
        status: entry.closed?.status ?? 'todo',
        priority: entry.priority,
        due_on: due.toISOString().slice(0, 10),
        account_id: accountId,
        contact_id: entry.contact ? (contactIds.get(entry.contact) ?? null) : null,
        project_id: null,
        completed_at: entry.closed ? new Date(now) : null,
        completed_by: entry.closed ? ownerUserId : null,
        result_note: entry.closed?.resultNote ?? null,
        // #2105.2 — seedée sur la seule tâche du jeu qui en porte un.
        expected_result: entry.expectedResult ?? null,
        // #2395.4/#2395.9 (épopée #2901) — jamais deviné : `null` sauf la
        // seule tâche du jeu dont le texte dit déjà le canal choisi.
        channel: entry.channel ?? null,
        // #2395.8 (épopée #2871) — requis à l'écriture depuis ce lot.
        objective: entry.objective,
        // #3271.8 reste (épopée #3298) — seedé sur trois tâches seulement.
        ritual_key: entry.ritualKey ?? null,
        created_at: createdAt,
      })
    }).filter((row): row is TaskEntity => row !== null)
    if (taskRows.length > 0) await this.tasks.save(taskRows)

    // #2123.46/#2123.47 — les tâches du plan d'action que l'écran /actions
    // liste (`GET /plan-items/mine`). LIT `accountIds` : ne peut donc pas
    // vivre dans `restoreOwnerIdentity`, où aucun compte n'existe encore.
    // #2715.1 — LIT aussi `contactIds`, pour que la tâche SNCF
    // porte le `contact_id` de Directeur technique — entité numérique voyageurs (voir `seedPlanTasks`).
    await this.seedPlanTasks(ownerUserId, accountIds, contactIds, now)

    // La base de connaissance : des documents fictifs. Le dépôt est refusé en
    // démonstration (un visiteur n'y laisse pas un document de son entreprise),
    // donc sans eux l'onglet « Mes documents » resterait vide — et le copilote
    // n'aurait rien à citer.
    const savedRagDocuments = await this.ragDocuments.save(
      DEMO_RAG_DOCUMENTS.map(document => {
        // #2779 — un document `account` porte le compte SEMÉ résolu ici ; un
        // compte introuvable le ramène à l'espace (la base refuserait une ligne
        // `account` sans compte).
        const accountId = document.company ? accountIds.get(document.company) : undefined
        const scope = document.scope === 'account' && !accountId ? undefined : document.scope
        return this.ragDocuments.create({
          user_id: ownerUserId,
          workspace_id: workspaceId,
          title: document.title,
          content: document.content,
          category: document.category,
          ...(document.processingStatus ? { processing_status: document.processingStatus } : {}),
          ...(scope ? { scope: document.scope } : {}),
          ...(scope === 'account' && accountId ? { account_id: accountId } : {}),
        })
      }),
    )

    // #2431.5 (reste, épopée #2886) — le LIEN DE VERSION : un document
    // `replaces` un autre PAR TITRE (aucun des deux n'a d'id avant ce `save`).
    // On archive, on ne supprime pas : l'ancien reste en base, daté et relié.
    for (const document of DEMO_RAG_DOCUMENTS) {
      if (!document.replaces) continue
      const newDoc = savedRagDocuments.find(row => row.title === document.title)
      const oldDoc = savedRagDocuments.find(row => row.title === document.replaces)
      if (!newDoc || !oldDoc) continue
      await this.ragDocuments.update({ id: oldDoc.id }, { archived_at: new Date(now), replaced_by_id: newDoc.id })
    }

    // #3803 (3803.7) — l'ORIGINAL de chaque document qui en déclare un, fabriqué
    // depuis son contenu semé et rangé comme le ferait le dépôt (domaine
    // `rag_document_source`), puis lié au document. Un dépôt qui échoue laisse
    // le document SANS original : l'aperçu dit alors « original non conservé ».
    for (const document of DEMO_RAG_DOCUMENTS) {
      if (!document.source) continue
      const saved = savedRagDocuments.find(row => row.title === document.title)
      if (!saved) continue
      const objectId = await this.seedStoredFile({
        workspaceId,
        domain: 'rag_document_source',
        fileKey: `rag-source:${document.source.fileName}`,
        fileName: document.source.fileName,
        title: document.title,
        lines: [],
        depositedOn: new Date(now).toISOString().slice(0, 10),
        file: demoDocumentSourceFile({
          format: document.source.format,
          title: document.title,
          content: document.content,
          units: document.units,
        }),
      })
      if (objectId) await this.ragDocuments.update({ id: saved.id }, { source_object_id: objectId })
    }

    // #3750.8 — les MORCEAUX citables des documents à onglets, comme les
    // écrirait le service IA à l'ingestion (sans embedding : la salle
    // n'appelle aucun fournisseur — la recherche plein texte les trouve).
    await this.seedRagDocumentChunks(savedRagDocuments, ownerUserId, workspaceId)

    // #3699.6 — la bibliothèque de documents attachables (voir `DEMO_OUTREACH_ASSETS`).
    await this.seedOutreachAssets(workspaceId, ownerUserId, new Date(now).toISOString().slice(0, 10))

    await this.userActions.save(
      DEMO_USER_ACTIONS.map(action =>
        this.userActions.create({
          user_id: ownerUserId,
          workspace_id: workspaceId,
          account_id: action.company ? (accountIds.get(action.company) ?? null) : null,
          contact_id: action.contact ? (contactIds.get(action.contact) ?? null) : null,
          action_type: action.action_type,
          channel: action.channel,
          metadata: action.metadata,
          created_at: new Date(now - action.hours_ago * 3_600_000),
        }),
      ),
    )

    // #2866/#2200.34 — le pas `schedule_decision` cible une vraie ligne
    // `user_actions` (créée ICI, jamais un id inventé) pour que le geste UNDO
    // de l'Action Center (`UndoStepButton`, `cancel_reminder`) fonctionne en
    // démonstration exactement comme en production : sans cette ligne,
    // `externalRef` resterait `null` et le bouton ne s'afficherait jamais
    // devant un prospect — la même règle que « aucune écriture tierce n'est
    // simulée » ci-dessous, appliquée à ce qu'on peut aussi DÉFAIRE.
    const demoReminder = await this.userActions.save(
      this.userActions.create({
        user_id: ownerUserId,
        workspace_id: workspaceId,
        account_id: accountIds.get(DEMO_WORKFLOW_RUN.company) ?? null,
        contact_id: null,
        action_type: 'plan_action_added',
        channel: null,
        metadata: {
          label: 'Rappel programmé',
          detail: `Rappel — ${DEMO_WORKFLOW_RUN.company}`,
          status: 'Programmé',
          router_intent: 'schedule_reminder',
          remind_at: new Date(now + 3 * 24 * 3_600_000).toISOString(),
          source: 'internal_reminder',
        },
        created_at: new Date(now - DEMO_WORKFLOW_RUN.hours_ago * 3_600_000),
      }),
    )

    // Un run TERMINÉ pour que l'Action Center ne s'ouvre pas vide en démo. Ses
    // deux pas sont internes (notification + rappel) : aucune écriture tierce
    // n'est simulée, personne ne peut croire qu'un email fictif est parti.
    await this.workflowRuns.save(
      this.workflowRuns.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        definition_key: DEMO_WORKFLOW_RUN.definition_key,
        definition_version: DEMO_WORKFLOW_RUN.definition_version,
        trigger: DEMO_WORKFLOW_RUN.trigger as WorkflowRunEntity['trigger'],
        status: DEMO_WORKFLOW_RUN.status as WorkflowRunEntity['status'],
        account_id: accountIds.get(DEMO_WORKFLOW_RUN.company) ?? null,
        contact_id: null,
        correlation_id: `wf_demo_${DEMO_WORKFLOW_RUN.definition_key}`,
        idempotency_key: `demo-${workspaceId}-${DEMO_WORKFLOW_RUN.definition_key}`,
        steps: DEMO_WORKFLOW_RUN.steps.map(step => ({
          ...step,
          // #2866 — seul `schedule_decision` gagne une cible réelle ; les
          // autres pas gardent l'absence honnête que `DEMO_WORKFLOW_RUN` leur
          // donne déjà.
          externalRef: step.key === 'schedule_decision' ? demoReminder.id : step.externalRef,
          startedAt: new Date(now - DEMO_WORKFLOW_RUN.hours_ago * 3_600_000).toISOString(),
          finishedAt: new Date(now - DEMO_WORKFLOW_RUN.hours_ago * 3_600_000 + 4_000).toISOString(),
        })) as WorkflowRunEntity['steps'],
        estimated_credits: 0,
        spent_credits: 0,
        started_at: new Date(now - DEMO_WORKFLOW_RUN.hours_ago * 3_600_000),
        finished_at: new Date(now - DEMO_WORKFLOW_RUN.hours_ago * 3_600_000 + 4_000),
      }),
    )

    // #3532 (lot X80) — un run de carte « Préparer un message » TERMINÉ sur SG et sa ligne
    // `activities` (`workflow:<runId>`, comme `CopilotCardService.recordInTimeline`) : sans elle,
    // « Actions exécutées » restait vide en salle. Un seul pas (le catalogue n'en déclare qu'un).
    {
      const cardAt = now - DEMO_CARD_RUN.hours_ago * 3_600_000
      const cardAccountId = accountIds.get(DEMO_CARD_RUN.company) ?? null
      const cardRun = await this.workflowRuns.save(
        this.workflowRuns.create({
          workspace_id: workspaceId,
          user_id: ownerUserId,
          definition_key: DEMO_CARD_RUN.definition_key,
          definition_version: 1,
          trigger: 'copilot_proposal' as WorkflowRunEntity['trigger'],
          status: 'done' as WorkflowRunEntity['status'],
          account_id: cardAccountId,
          contact_id: null,
          correlation_id: `wf_demo_${DEMO_CARD_RUN.definition_key}`,
          idempotency_key: `demo-${workspaceId}-${DEMO_CARD_RUN.definition_key}`,
          steps: [
            {
              key: 'effect',
              intentType: 'generate_message',
              outcome: 'done',
              attempts: 1,
              externalRef: null,
              creditsSpent: 0,
              reason: DEMO_CARD_RUN.stepReason,
              startedAt: new Date(cardAt).toISOString(),
              finishedAt: new Date(cardAt + 3_000).toISOString(),
            },
          ] as WorkflowRunEntity['steps'],
          estimated_credits: 0,
          spent_credits: 0,
          started_at: new Date(cardAt),
          finished_at: new Date(cardAt + 3_000),
          result: {
            outcome: DEMO_CARD_RUN.outcome,
            occurredAt: new Date(cardAt + 3_000).toISOString(),
            actorName: null,
            targetObject: DEMO_CARD_RUN.targetObject,
            destination: null,
            externalRef: null,
            creditsSpent: 0,
            nextStep: DEMO_CARD_RUN.nextStep,
            connectionUsed: null,
          },
        }),
      )
      await this.activities.save(
        this.activities.create({
          workspace_id: workspaceId,
          user_id: ownerUserId,
          kind: 'workflow',
          source: 'system',
          direction: 'internal',
          subject: 'Préparer un message',
          body: DEMO_CARD_RUN.outcome,
          body_truncated: false,
          occurred_at: new Date(cardAt + 3_000),
          duration_seconds: null,
          account_id: cardAccountId,
          contact_id: null,
          project_id: null,
          link_reason: 'manual',
          external_id: `workflow:${cardRun.id}`,
          external_url: null,
          created_at: new Date(cardAt + 3_000),
        }),
      )
    }

    // #2946 — LA DEMANDE D'APPROBATION Action OS EN ATTENTE, pour que la tâche
    // `source = 'action_os_approval'` (le pont Action OS → Tâche,
    // `WorkflowRunnerService.createApprovalTasks`) ne reste pas seedée nulle
    // part. Même geste qu'en production (`requestApproval`) : le run se fige
    // EN ATTENTE — aucun de ses pas n'exécute (même raison que
    // `DEMO_WORKFLOW_RUN` ci-dessus : aucune écriture tierce n'est simulée
    // depuis une salle de démonstration) —, une demande `pending` le porte, et
    // la tâche REND VISIBLE le run sans dupliquer la décision (qui reste sur
    // l'approbation elle-même).
    const pendingApprovalRun = await this.workflowRuns.save(
      this.workflowRuns.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        definition_key: DEMO_ACTION_OS_APPROVAL.definition_key,
        definition_version: DEMO_ACTION_OS_APPROVAL.definition_version,
        trigger: DEMO_ACTION_OS_APPROVAL.trigger as WorkflowRunEntity['trigger'],
        status: 'awaiting_approval' as WorkflowRunEntity['status'],
        account_id: null,
        contact_id: null,
        correlation_id: `wf_demo_${DEMO_ACTION_OS_APPROVAL.definition_key}_approval`,
        idempotency_key: `demo-${workspaceId}-${DEMO_ACTION_OS_APPROVAL.definition_key}-approval`,
        steps: [],
        estimated_credits: DEMO_ACTION_OS_APPROVAL.estimated_credits,
        spent_credits: 0,
        started_at: null,
        finished_at: null,
      }),
    )
    await this.approvalRequests.save(
      this.approvalRequests.create({
        workspace_id: workspaceId,
        run_id: pendingApprovalRun.id,
        step_key: null,
        required_level: DEMO_ACTION_OS_APPROVAL.requiredLevel,
        state: 'pending',
        requested_by: ownerUserId,
        decided_by: null,
        decided_at: null,
        summary: DEMO_ACTION_OS_APPROVAL.summary,
        estimated_credits: DEMO_ACTION_OS_APPROVAL.estimated_credits,
        expires_at: new Date(now + 3 * 24 * 3_600_000),
        reason: null,
        assigned_to: null,
        snoozed_until: null,
      }),
    )
    // Même geste que `createApprovalTasks` en prod : `n2_user_approval` ne
    // délègue à personne, le décideur EST l'auteur du run — `owner_id` lui
    // revient directement, une seule tâche à seeder.
    await this.tasks.save(
      this.tasks.create({
        workspace_id: workspaceId,
        owner_id: ownerUserId,
        created_by: ownerUserId,
        title: `Valider : ${DEMO_ACTION_OS_APPROVAL.summary.split('\n')[0]}`.slice(0, 300),
        details: null,
        status: 'todo',
        priority: 'normal',
        due_on: new Date(now).toISOString().slice(0, 10),
        source: 'action_os_approval',
        expected_result: 'Décision : approuver ou refuser cette exécution.',
        // #2395.8 (épopée #2871) — même fait que `createApprovalTasks` en prod.
        objective: 'Approuver ou refuser l’exécution proposée.',
        account_id: null,
        contact_id: null,
        project_id: null,
        related_action_run_id: pendingApprovalRun.id,
        channel: null,
        created_at: new Date(now - DEMO_ACTION_OS_APPROVAL.hours_ago * 3_600_000),
      }),
    )

    /**
     * #1952 — LE TRAVAIL LONG QUI TOURNE, pour qu'une démonstration montre autre
     * chose que des exécutions déjà finies. La raison de chaque champ est écrite
     * au-dessus de {@link DEMO_COPILOT_LONG_JOB}.
     *
     * ⚠️ `result.outcome` est produit par la MÊME fonction que le code de
     * production (`longJobProgressSentence`) : une phrase recopiée ici
     * divergerait le jour où la formulation change, et la démonstration montrerait
     * un produit qui n'existe plus. `external_ref` reste nul — il n'y a aucun job
     * à observer dans une salle de démonstration, et le suivi ne conclut jamais
     * d'un silence.
     */
    const longJobStartedAt = new Date(now - DEMO_COPILOT_LONG_JOB.minutes_ago * 60_000)
    const longJobCompany = DEMO_COPILOT_LONG_JOB.company
    await this.workflowRuns.save(
      this.workflowRuns.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        definition_key: ANALYSIS_TRACKING_DEFINITION_KEY,
        definition_version: 1,
        trigger: 'copilot_proposal',
        status: 'running',
        account_id: accountIds.get(longJobCompany) ?? null,
        contact_id: null,
        correlation_id: `wf_demo_${ANALYSIS_TRACKING_DEFINITION_KEY}`,
        idempotency_key: `demo-${workspaceId}-${ANALYSIS_TRACKING_DEFINITION_KEY}`,
        // Le suivi n'a aucun pas à exécuter : il OBSERVE un travail qui tourne
        // ailleurs. Une liste vide est ici la vérité, pas un trou.
        steps: [],
        estimated_credits: DEMO_COPILOT_LONG_JOB.estimated_credits,
        spent_credits: DEMO_COPILOT_LONG_JOB.spent_credits,
        started_at: longJobStartedAt,
        finished_at: null,
        preview: {
          whatWillHappen: `Analyser ${longJobCompany}.`,
          targetObject: longJobCompany,
          destination: null,
          content: null,
          dataUsed: null,
          costCredits: DEMO_COPILOT_LONG_JOB.estimated_credits,
          connectionUsed: null,
          whatWillNotHappen: 'Aucun crédit en plus : débités au lancement, remboursés si l’analyse échoue.',
        },
        result: {
          outcome:
            longJobProgressSentence(
              LONG_JOB_SPECS.account_analysis,
              DEMO_COPILOT_LONG_JOB.phases_done,
              DEMO_COPILOT_LONG_JOB.phases_total,
            ) ?? 'Analyse lancée.',
          occurredAt: null,
          actorName: null,
          targetObject: longJobCompany,
          destination: null,
          externalRef: null,
          creditsSpent: DEMO_COPILOT_LONG_JOB.spent_credits,
          nextStep: null,
        },
      }),
    )

    /**
     * #1952.17 — LE TRAVAIL LONG QUE QUELQU'UN A ARRÊTÉ.
     *
     * Le pendant terminal du précédent, et le seul qui montre qu'une annulation
     * n'est pas un échec : pas le mot « échoué », pas de `nextStep` qui invite à
     * relancer — relancer, c'est redébiter. La raison de chaque champ est écrite
     * au-dessus de {@link DEMO_COPILOT_CANCELLED_JOB}.
     *
     * ⚠️ `result.outcome` vient de `analysisSettlementSentence`, la fonction du
     * produit (GA-26) : la phrase ne vit pas deux fois. `external_ref` reste nul
     * pour la même raison qu'au-dessus — il n'y a aucun job à observer dans une
     * salle de démonstration, et le suivi ne conclut jamais d'un silence.
     */
    const cancelledJobStartedAt = new Date(now - DEMO_COPILOT_CANCELLED_JOB.minutes_ago * 60_000)
    const cancelledJobCompany = DEMO_COPILOT_CANCELLED_JOB.company
    await this.workflowRuns.save(
      this.workflowRuns.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        definition_key: ANALYSIS_TRACKING_DEFINITION_KEY,
        definition_version: 1,
        trigger: 'copilot_proposal',
        status: 'cancelled',
        account_id: accountIds.get(cancelledJobCompany) ?? null,
        contact_id: null,
        correlation_id: `wf_demo_${ANALYSIS_TRACKING_DEFINITION_KEY}_cancelled`,
        idempotency_key: `demo-${workspaceId}-${ANALYSIS_TRACKING_DEFINITION_KEY}-cancelled`,
        steps: [],
        estimated_credits: DEMO_COPILOT_CANCELLED_JOB.estimated_credits,
        // Le crédit a été RENDU : « dépensé » = débit observé − remboursement
        // observé (I4). Zéro est ici une MESURE, pas un trou.
        spent_credits: 0,
        started_at: cancelledJobStartedAt,
        finished_at: new Date(cancelledJobStartedAt.getTime() + 90_000),
        preview: {
          whatWillHappen: `Analyser ${cancelledJobCompany}.`,
          targetObject: cancelledJobCompany,
          destination: null,
          content: null,
          dataUsed: null,
          costCredits: DEMO_COPILOT_CANCELLED_JOB.estimated_credits,
          connectionUsed: null,
          whatWillNotHappen: 'Aucun crédit en plus : débités au lancement, remboursés si l’analyse échoue.',
        },
        result: {
          outcome: analysisSettlementSentence(
            'cancelled',
            DEMO_COPILOT_CANCELLED_JOB.refunded_credits >= DEMO_COPILOT_CANCELLED_JOB.debited_credits,
          ),
          occurredAt: new Date(cancelledJobStartedAt.getTime() + 90_000).toISOString(),
          actorName: null,
          targetObject: cancelledJobCompany,
          destination: null,
          externalRef: null,
          creditsSpent: 0,
          // Ce que ce lot répare : une analyse arrêtée n'invite pas à relancer.
          nextStep: null,
          connectionUsed: null,
        },
      }),
    )

    /**
     * #1952.32 (#2844, lot h9 27/09/2026) — LE TRAVAIL LONG QUI A FINI, SEUL
     * DES TROIS À MONTRER « CE QUI DOIT ÊTRE VÉRIFIÉ ». La raison de chaque
     * champ est écrite au-dessus de {@link DEMO_COPILOT_DONE_JOB}.
     *
     * `toVerify` n'est PAS écrit en dur : il est RECALCULÉ ici à partir des
     * contacts RÉELLEMENT posés sur SNCF (`email_confidence` medium/low,
     * densifiés par `demo-contact-density.ts`, déjà en base à ce point du
     * semis), via la MÊME fonction pure que la production
     * (`contactVerificationLine`, GA-26) — jamais une liste de noms recopiée
     * qui divergerait du jeu de contacts le jour où il change.
     */
    const doneJobStartedAt = new Date(now - DEMO_COPILOT_DONE_JOB.minutes_ago * 60_000)
    const doneJobFinishedAt = new Date(doneJobStartedAt.getTime() + 4 * 60_000)
    const doneJobCompany = DEMO_COPILOT_DONE_JOB.company
    const doneJobAccountId = accountIds.get(doneJobCompany) ?? null
    const doneJobToVerify = doneJobAccountId
      ? (
          await this.contacts.find({
            where: { account_id: doneJobAccountId, workspace_id: workspaceId, email_confidence: In(['medium', 'low']) },
            take: 20,
          })
        )
          .map(contact => contactVerificationLine(contact.full_name, contact.email_confidence))
          .filter((line): line is string => line !== null)
      : []
    // #3416.x2 — « Ce que ça apprend » : le résultat RÉEL, recompté sur les contacts
    // posés sur ce compte (jamais un chiffre recopié qui divergerait du semis).
    const doneJobContacts = doneJobAccountId
      ? (
          await this.contacts.find({
            where: { account_id: doneJobAccountId, workspace_id: workspaceId, deleted_at: IsNull() },
            take: 500,
          })
        ).filter(contact => !contact.hidden)
      : []
    const doneJobFound =
      doneJobContacts.length > 0
        ? {
            contacts: doneJobContacts.length,
            verifiedEmails: doneJobContacts.filter(contact => contact.email_verified === true).length,
          }
        : null
    await this.workflowRuns.save(
      this.workflowRuns.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        definition_key: ANALYSIS_TRACKING_DEFINITION_KEY,
        definition_version: 1,
        trigger: 'copilot_proposal',
        status: 'done',
        account_id: doneJobAccountId,
        contact_id: null,
        correlation_id: `wf_demo_${ANALYSIS_TRACKING_DEFINITION_KEY}_done`,
        idempotency_key: `demo-${workspaceId}-${ANALYSIS_TRACKING_DEFINITION_KEY}-done`,
        steps: [],
        estimated_credits: DEMO_COPILOT_DONE_JOB.estimated_credits,
        spent_credits: DEMO_COPILOT_DONE_JOB.spent_credits,
        started_at: doneJobStartedAt,
        finished_at: doneJobFinishedAt,
        preview: {
          whatWillHappen: `Analyser ${doneJobCompany}.`,
          targetObject: doneJobCompany,
          destination: null,
          content: null,
          dataUsed: null,
          costCredits: DEMO_COPILOT_DONE_JOB.estimated_credits,
          connectionUsed: null,
          whatWillNotHappen: 'Aucun crédit en plus : débités au lancement, remboursés si l’analyse échoue.',
        },
        result: {
          outcome: analysisSettlementSentence('done', true),
          occurredAt: doneJobFinishedAt.toISOString(),
          actorName: null,
          targetObject: doneJobCompany,
          destination: null,
          externalRef: null,
          creditsSpent: DEMO_COPILOT_DONE_JOB.spent_credits,
          nextStep: null,
          connectionUsed: null,
          ...(doneJobToVerify.length > 0 ? { toVerify: doneJobToVerify } : {}),
          ...(doneJobFound ? { analysisFound: doneJobFound } : {}),
        },
      }),
    )

    /**
     * #3104 (recette N, 27/09/2026) — LA CONVERSATION D'EXEMPLE DU PANNEAU
     * « CONVERSATIONS » DE /chat.
     *
     * ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ (tranché sans Louis) de la doctrine
     * écrite au-dessus de `chat_messages` dans `demo-coverage.ts` (« la
     * démonstration consiste à poser une question à Laura »). Mesuré en
     * recette production (#3104) : un visiteur qui ouvre `/chat` en premier
     * geste — avant même de taper — voit « Aucune conversation », un panneau
     * qui se lit comme un produit vide plutôt que comme une invitation.
     *
     * Une seule conversation, avec `conversation_id` posé : `threadsBaseQuery`
     * (`ChatMessagesService`) rend un fil NOMMÉ visible à TOUT lecteur de
     * l'espace (`conversation_id IS NOT NULL`), pas seulement à son auteur —
     * donc visible quel que soit l'utilisateur sous lequel le visiteur se
     * connecte. Le titre, le statut (« reçu ») et l'auteur affiché continuent
     * de se DÉRIVER à la lecture (raison inchangée, écrite dans
     * `demo-coverage.ts`) : rien n'est semé pour eux.
     *
     * Ce qui reste VRAI, inchangé : tout NOUVEAU fil que le visiteur ouvre
     * lui-même en posant une question démarre vide et suit le moteur scripté
     * (`demo-turn.ts`) — cette ligne n'ajoute qu'UN fil déjà là, jamais un
     * historique.
     */
    const sampleConversationId = randomUUID()
    const sampleConversationStartedAt = new Date(now - 3 * 3_600_000)
    await this.chatMessages.save([
      this.chatMessages.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        account_id: null,
        conversation_id: sampleConversationId,
        role: 'user',
        content: 'Sur quels comptes je dois me concentrer cette semaine ?',
        created_at: sampleConversationStartedAt,
        archived_at: null,
      }),
      this.chatMessages.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        account_id: null,
        conversation_id: sampleConversationId,
        role: 'assistant',
        content:
          'Trois comptes ressortent avec un signal actif : SNCF (un besoin publié sur une entité), Groupe BPCE (plusieurs signaux de recrutement relevés) et Société générale (renouvellement dans moins de deux semaines). Dis-moi lequel regarder en premier.\n\n' +
          '```bellum-block\n' +
          JSON.stringify(DEMO_SAMPLE_PLAN_V1) +
          '\n```',
        created_at: new Date(sampleConversationStartedAt.getTime() + 45_000),
        archived_at: null,
      }),
    ])
    /**
     * #3192 (recette prod 02/10) — LE FIL DE ONZE TOURS : voir
     * `DEMO_LONG_LAURA_THREAD`. Un fil NOMMÉ (`conversation_id`), rattaché au
     * compte phare, daté d'hier : le contrôle de densité se voit sur la
     * dernière relance. Même logique de visibilité que la conversation
     * d'exemple ci-dessus.
     */
    const longThreadAccountId = accountIds.get(DEMO_LONG_LAURA_THREAD.accountName) ?? null
    const longThreadId = randomUUID()
    const longThreadStartedAt = now - 26 * 3_600_000
    await this.chatMessages.save(
      DEMO_LONG_LAURA_THREAD.turns.flatMap((turn, index) => {
        const askedAt = longThreadStartedAt + index * 4 * 60_000
        return [
          this.chatMessages.create({
            workspace_id: workspaceId,
            user_id: ownerUserId,
            account_id: longThreadAccountId,
            conversation_id: longThreadId,
            role: 'user',
            content: turn.question,
            created_at: new Date(askedAt),
            archived_at: null,
          }),
          this.chatMessages.create({
            workspace_id: workspaceId,
            user_id: ownerUserId,
            account_id: longThreadAccountId,
            conversation_id: longThreadId,
            role: 'assistant',
            content: turn.answer,
            created_at: new Date(askedAt + 30_000),
            archived_at: null,
          }),
        ]
      }),
    )
    /**
     * Théo L1 — sélecteur avancé — le fil parti d'une OFFRE D'EMPLOI : voir
     * `DEMO_JOB_OFFER_THREAD`. Un fil NOMMÉ rattaché au compte phare, même
     * visibilité que la conversation d'exemple ci-dessus.
     */
    const jobOfferThreadAccountId = accountIds.get(DEMO_JOB_OFFER_THREAD.accountName) ?? null
    const jobOfferThreadId = randomUUID()
    const jobOfferThreadStartedAt = now - DEMO_JOB_OFFER_THREAD.daysAgo * 24 * 3_600_000
    await this.chatMessages.save(
      DEMO_JOB_OFFER_THREAD.turns.flatMap((turn, index) => {
        const askedAt = jobOfferThreadStartedAt + index * 3 * 60_000
        return [
          this.chatMessages.create({
            workspace_id: workspaceId,
            user_id: ownerUserId,
            account_id: jobOfferThreadAccountId,
            conversation_id: jobOfferThreadId,
            role: 'user',
            content: turn.question,
            created_at: new Date(askedAt),
            archived_at: null,
          }),
          this.chatMessages.create({
            workspace_id: workspaceId,
            user_id: ownerUserId,
            account_id: jobOfferThreadAccountId,
            conversation_id: jobOfferThreadId,
            role: 'assistant',
            content: turn.answer,
            created_at: new Date(askedAt + 30_000),
            archived_at: null,
          }),
        ]
      }),
    )
    /**
     * #3775.a (lot M12, 09/10) — le fil qui cite une source PERSONNELLE : voir
     * `DEMO_RESTRICTED_SOURCE_THREAD`. Le contexte passe par la même porte
     * d'écriture que la production (`persistedChatContext`) ; ouvrir ce fil puis
     * « Partager dans l'espace » montre la ligne orange.
     */
    const restrictedThreadId = randomUUID()
    const restrictedThreadAskedAt = now - DEMO_RESTRICTED_SOURCE_THREAD.daysAgo * 24 * 3_600_000
    const restrictedThreadAccountId = accountIds.get(DEMO_RESTRICTED_SOURCE_THREAD.accountName) ?? null
    await this.chatMessages.save([
      this.chatMessages.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        account_id: restrictedThreadAccountId,
        conversation_id: restrictedThreadId,
        role: 'user',
        content: DEMO_RESTRICTED_SOURCE_THREAD.question,
        created_at: new Date(restrictedThreadAskedAt),
        archived_at: null,
      }),
      this.chatMessages.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        account_id: restrictedThreadAccountId,
        conversation_id: restrictedThreadId,
        role: 'assistant',
        content: DEMO_RESTRICTED_SOURCE_THREAD.answer,
        context: persistedChatContext(DEMO_RESTRICTED_SOURCE_THREAD.context),
        created_at: new Date(restrictedThreadAskedAt + 30_000),
        archived_at: null,
      }),
    ])
    // #2429.9 (épopée #2852, lot P07) — la version 2 du plan, modifiée par un humain : la
    // version 1 reste le texte du message. Rang 0 = le premier (et seul) bloc du message.
    const [samplePlanMessage] = await this.chatMessages.find({
      where: { conversation_id: sampleConversationId, role: 'assistant' },
    })
    if (samplePlanMessage) {
      await this.chatMessages.manager.query(
        `INSERT INTO chat_artifact_versions (workspace_id, message_id, block_rank, version, block, edited_by, created_at)
         VALUES ($1, $2, 0, 2, $3::jsonb, $4, $5)`,
        [
          workspaceId,
          samplePlanMessage.id,
          JSON.stringify(DEMO_SAMPLE_PLAN_V2),
          ownerUserId,
          new Date(sampleConversationStartedAt.getTime() + 600_000),
        ],
      )
    }

    // Le cockpit lit les objectifs du mois COURANT : le premier jour du mois en
    // cours, pas une date figée qui sortirait du périmètre au mois suivant.
    const month = new Date(now)
    await this.memberObjectives.save(
      this.memberObjectives.create({
        user_id: ownerUserId,
        workspace_id: workspaceId,
        period_month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`,
        target_meetings: DEMO_MEMBER_OBJECTIVE.target_meetings,
        target_accounts: DEMO_MEMBER_OBJECTIVE.target_accounts,
        target_revenue: DEMO_MEMBER_OBJECTIVE.target_revenue,
        target_qualified_needs: DEMO_MEMBER_OBJECTIVE.target_qualified_needs,
        target_placements: DEMO_MEMBER_OBJECTIVE.target_placements,
        target_margin_percent: DEMO_MEMBER_OBJECTIVE.target_margin_percent,
        target_consultants_on_mission: DEMO_MEMBER_OBJECTIVE.target_consultants_on_mission,
      }),
    )

    /**
     * LA SOCIÉTÉ QUI FACTURE — Réglages › Sociétés.
     *
     * Sans cette ligne, l'écran s'ouvre sur « Aucune société déclarée » devant
     * un prospect : la capacité multi-société se présente alors par son vide,
     * et rien à l'écran ne montre ce qu'une ligne contient. La raison de n'en
     * semer qu'UNE est écrite au-dessus de {@link DEMO_LEGAL_ENTITY}.
     *
     * #2944 (recette écran, 26/09) — RATTACHÉE aux missions de la salle
     * depuis ce lot. La raison d'origine (« rien ne la lit ») décrivait un
     * choix ASSUMÉ, pas un oubli — mais `/missions/facturation` l'a rendue
     * fausse dans l'autre sens : les 9 lignes de la salle affichaient
     * « Société facturante : non mesuré », exactement le vide qu'un prospect
     * découvre en réunion. Une SEULE société reste rattachée à TOUTES les
     * missions : ce n'est toujours pas un groupe (une raison sociale, pas
     * deux), c'est la même ESN qui facture chacune de ses missions — ce
     * qu'une salle de démonstration doit montrer.
     *
     * `ON CONFLICT DO NOTHING` : le semis est idempotent partout ailleurs, il
     * doit l'être ici aussi — un second passage ne doit pas buter sur le
     * contrôle d'unicité du nom. `RETURNING id` reste vide sur un second
     * passage (le conflit ne rend rien) : la lecture juste après retrouve
     * alors la ligne déjà semée, jamais une seconde société.
     */
    const insertedLegalEntity = await this.accounts.manager.query(
      `INSERT INTO legal_entities (workspace_id, name, registration_number, country, archived)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [workspaceId, DEMO_LEGAL_ENTITY.name, DEMO_LEGAL_ENTITY.registration_number, DEMO_LEGAL_ENTITY.country],
    )
    const legalEntityId: string | undefined =
      insertedLegalEntity[0]?.id ??
      (
        await this.accounts.manager.query(
          `SELECT id FROM legal_entities WHERE workspace_id = $1 AND lower(name) = lower($2) LIMIT 1`,
          [workspaceId, DEMO_LEGAL_ENTITY.name],
        )
      )[0]?.id
    if (legalEntityId) {
      // Jamais sur une mission déjà rattachée par un geste antérieur (le
      // visiteur a pu la changer depuis Réglages) : une correction humaine
      // gagne toujours, quelle que soit sa date.
      await this.accounts.manager.query(
        `UPDATE missions SET legal_entity_id = $1 WHERE workspace_id = $2 AND legal_entity_id IS NULL`,
        [legalEntityId, workspaceId],
      )
    }
  }

  /**
   * Rétablit le NOM du propriétaire de la salle.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE SALLE PEUT PERDRE SON NOM
   * ─────────────────────────────────────────────────────────────────────────
   * Deux chemins, tous deux vus en production le 28/08 :
   *
   *  - une salle du pool naît avec sa seule ADRESSE (`DemoPoolService`
   *    provisionne le profil sans identité), et le pied de la barre latérale
   *    retombe sur « Utilisateur » ;
   *  - un visiteur ouvre Réglages › Confidentialité et supprime le compte —
   *    qui n'est pas le sien mais celui de la salle. L'anonymisation RGPD écrit
   *    alors `[supprimé]` dans les deux champs et pose `anonymized_at`. C'est
   *    exactement son travail, et elle ne change pas ; ce qui manquait, c'est
   *    qu'une salle sans identité restait en service pour toujours, parce que
   *    `profiles` n'est purgée par aucune des trois listes de la remise à neuf
   *    (c'est l'identité, pas du contenu du visiteur).
   *
   * ⚠️ `anonymized_at` DOIT repartir à `null` avec le nom. Sans ça, le critère
   * de complétude verrait une salle éternellement anonymisée et la purgerait à
   * chaque prise de bail — une boucle bien pire que le défaut d'origine.
   *
   * Le nom vient du jeu de démonstration ({@link DEMO_OWNER}), jamais d'un
   * générateur. L'adresse, elle, n'est PAS réécrite : elle appartient au compte
   * d'authentification de la salle, et l'inventer ici la ferait diverger.
   */
  /**
   * LES MISES EN RELATION de la salle — le bandeau du bas de l'écran « Mémoire
   * collective ».
   *
   * ⚠️ `to_user_id` vaut `null` : le pont désigne un RÔLE et non une personne.
   * Ce n'est pas un raccourci — `workspace_members` et `profiles` portent une
   * clé étrangère DURE vers `auth.users(id)`, donc un collègue de démonstration
   * serait un vrai compte qui se connecte. Le détail est écrit dans
   * {@link DEMO_BRIDGE_CONTACTS}.
   *
   * ⚠️ Le mois est CALCULÉ (`date_trunc('month', now())`), jamais littéral : la
   * salle se remet à neuf à chaque visite, et « août 2026 » se périmerait au
   * premier changement de mois. C'est la même règle que les dates en offsets du
   * reste du jeu.
   *
   * ⚠️ Un compte introuvable est SAUTÉ, jamais remplacé par un autre : une trace
   * rattachée au mauvais dossier ferait compter un pont qui n'a pas eu lieu là.
   */
  /**
   * #2155.13 à .21 — « MES CIBLES ». Une liste avec son objectif, dont les
   * éléments RÉFÉRENCENT des fiches déjà semées — jamais une copie. Sans elle,
   * l'écran s'ouvrirait sur « Aucune liste pour l'instant » devant un prospect.
   */
  /**
   * #2005.3 / #2087.14 — LES PÉRIMÈTRES DE TRAVAIL (BU / agence).
   *
   * Le visiteur est rattaché aux DEUX premiers, pas au troisième : c'est ce qui
   * rend « Rejoindre » et « Demander l'accès » visibles côte à côte sur le même
   * écran. Son niveau d'accès reste `'workspace'` (le défaut) — une salle de
   * démonstration cloisonnée montrerait un portefeuille amputé sans que le
   * prospect comprenne pourquoi.
   */
  /**
   * #1918.2 — l'identifiant d'un périmètre de la salle, par son NOM. `null`
   * quand il n'existe pas : on ne devine jamais une équipe.
   */
  private async demoBusinessUnitId(workspaceId: string, name: string): Promise<string | null> {
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM business_units WHERE workspace_id = $1 AND name = $2 LIMIT 1`,
      [workspaceId, name],
    )
    return row?.id ?? null
  }

  /** #2260.7 — l'identifiant d'un besoin de la salle, par son TITRE. `null`
   *  quand il n'existe pas : on ne devine jamais un objet visé. */
  private async demoNeedId(workspaceId: string, title: string): Promise<string | null> {
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM project_needs WHERE workspace_id = $1 AND title = $2 LIMIT 1`,
      [workspaceId, title],
    )
    return row?.id ?? null
  }

  /** #2260.7 — l'identifiant d'un consultant du vivier, par son NOM. */
  private async demoConsultantId(workspaceId: string, fullName: string): Promise<string | null> {
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
      [workspaceId, fullName],
    )
    return row?.id ?? null
  }

  /** #2260.7 — l'identifiant d'une mission de la salle, par son LIBELLÉ. */
  private async demoMissionId(workspaceId: string, label: string): Promise<string | null> {
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM missions WHERE workspace_id = $1 AND label = $2 LIMIT 1`,
      [workspaceId, label],
    )
    return row?.id ?? null
  }

  /**
   * P05.a (#3246, lot 09/10) — « ce qui marche ailleurs », en démonstration.
   * Les contributions de quatre espaces FICTIFS (`DEMO_SHARED_BASE_ACTION_OUTCOMES`)
   * passent par la MÊME mutualisation que le réel — le seuil des trois espaces
   * s'applique à la salle comme partout (GA-43). Le périmètre `demo` est commun
   * à toutes les salles et RÉÉCRIT à l'identique : semer une salle de plus ne
   * change rien, et rien n'atteint `scope = 'live'`.
   */
  private async seedSharedBase(): Promise<void> {
    await rewriteActionOutcomeCells(this.accounts.manager, 'demo', [
      {
        dimension: 'cadence',
        rows: DEMO_SHARED_BASE_ACTION_OUTCOMES.flatMap(row => [
          {
            workspaceId: row.workspaceId,
            value: row.value,
            nafCode: null,
            employees: null,
            outcome: 'meeting_booked',
            count: row.positive,
          },
          {
            workspaceId: row.workspaceId,
            value: row.value,
            nafCode: null,
            employees: null,
            outcome: 'no_response',
            count: row.negative,
          },
        ]),
      },
    ])
    // P05.b — les cas gagnés / perdus des mêmes espaces fictifs.
    await rewriteCaseOutcomeCells(
      this.accounts.manager,
      'demo',
      DEMO_SHARED_BASE_CASE_OUTCOMES.flatMap(row => [
        {
          workspaceId: row.workspaceId,
          nafCode: row.nafCode,
          employees: row.employees,
          groupRole: row.groupRole,
          outcome: 'won' as const,
          count: row.won,
        },
        {
          workspaceId: row.workspaceId,
          nafCode: row.nafCode,
          employees: row.employees,
          groupRole: row.groupRole,
          outcome: 'lost' as const,
          count: row.lost,
        },
      ]),
    )
    // P05.c — les signaux suivis d'une affaire ouverte, chez les mêmes espaces fictifs.
    await rewriteSignalDealCells(
      this.accounts.manager,
      'demo',
      DEMO_SHARED_BASE_SIGNAL_DEALS.map(row => ({ ...row, nafCode: null })),
    )
    // #2877 GLOBAL — l'apprentissage des messages des mêmes espaces fictifs, lu par
    // le service IA à la génération d'un message dans la salle (scope `demo`).
    await rewriteMessageLearningCells(this.accounts.manager, 'demo', DEMO_SHARED_BASE_MESSAGE_LEARNING)
    // #4286.15.c (Louis 22/10/2026) — les tendances de marché des mêmes espaces fictifs, au profil de
    // Société Générale ; lues par `get_account_signals` (`marketPatterns`) dans la salle (scope `demo`).
    await rewriteMarketPatternCells(this.accounts.manager, 'demo', DEMO_SHARED_BASE_MARKET_PATTERNS)
    // #3989 — des rôles apportés par un utilisateur d'un espace fictif sur Société
    // Générale : la MÊME frontière que le réel, donc ANONYMISÉS (le rôle, jamais
    // la personne). Idempotent (clé unique), aucune ligne `live`.
    await upsertSharedCompanyPeople(
      this.accounts.manager,
      'demo',
      'siren_552120222',
      DEMO_SHARED_BASE_COMPANY_ROLES.map(row => ({ ...row, linkedinUrl: null, apolloId: null })),
      new Set(),
    )
  }

  private async seedBusinessUnits(workspaceId: string, ownerUserId: string): Promise<void> {
    for (const [index, unit] of DEMO_BUSINESS_UNITS.entries()) {
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO business_units
           (workspace_id, name, kind, territory, specialties, consultant_count, team_size,
            lead_user_id, portfolio_note, capacity_available_consultants, quarter_objective, status, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, 'active', $12)
         RETURNING id`,
        [
          workspaceId,
          unit.name,
          unit.kind,
          unit.territory,
          JSON.stringify(unit.specialties),
          unit.consultantCount,
          unit.teamSize,
          ownerUserId,
          unit.portfolioNote,
          // #2005.5 (DÉCISION Louis 17/09, lot CP2).
          unit.capacityAvailableConsultants,
          unit.quarterObjective,
          ownerUserId,
        ],
      )
      if (!row) continue
      // Le troisième reste SANS membre : sinon il n'existerait aucun périmètre
      // à rejoindre, et deux des trois boutons de l'écran seraient invisibles.
      if (index === 2) continue
      await this.accounts.manager.query(
        `INSERT INTO business_unit_members (workspace_id, business_unit_id, user_id, membership)
         VALUES ($1, $2, $3, $4)`,
        [workspaceId, row.id, ownerUserId, 'lead'],
      )
    }
  }

  /**
   * #2420.17 — le seuil d'alerte de marge de l'espace de démonstration.
   *
   * Même colonne que l'écriture réelle (`RevenueService.setMarginThreshold`) :
   * un seul endroit pose la valeur, le semis n'invente pas un second chemin.
   */
  private async seedMarginThreshold(workspaceId: string): Promise<void> {
    await this.accounts.manager.query(`UPDATE workspaces SET margin_alert_threshold_percent = $2 WHERE id = $1`, [
      workspaceId,
      DEMO_MARGIN_ALERT_THRESHOLD_PERCENT,
    ])
  }

  /**
   * Théo D settings-espace.N5 — la signature proposée et le pied de document de l'espace de démonstration.
   * Mêmes colonnes que l'écriture réelle (`WorkspaceBrandService.update`) : le semis n'invente pas un second chemin.
   */
  private async seedDocumentIdentity(workspaceId: string): Promise<void> {
    await this.accounts.manager.query(
      `UPDATE workspaces SET document_signature = $2, document_footer = $3 WHERE id = $1`,
      [workspaceId, DEMO_DOCUMENT_IDENTITY.signature, DEMO_DOCUMENT_IDENTITY.footer],
    )
  }

  /**
   * #3754.6 — UNE ligne `esn_target_personas` par poste visé (`DEMO_TARGET_PERSONAS`). Purgée à chaque remise à neuf
   * (`DEMO_PURGE_TABLES`) et sondée par la complétude (`DEMO_SEEDED_TABLES`) : les lignes portent `workspace_id = $1`.
   * Rejouable : la table est vidée de l'espace avant l'insertion (un semis rejoué ne double rien).
   */
  private async seedTargetPersonas(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(`DELETE FROM esn_target_personas WHERE workspace_id = $1`, [workspaceId])
    for (const persona of DEMO_TARGET_PERSONAS) {
      await this.accounts.manager.query(
        `INSERT INTO esn_target_personas (workspace_id, user_id, category, title, title_normalized, decision_level)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          ownerUserId,
          persona.category,
          persona.title,
          normalizeRoleTitle(persona.title),
          persona.decision_level,
        ],
      )
    }
  }

  /**
   * Marchés locaux (L5, 05/10/2026) — UNE ligne `market_zones` par zone de la salle (`DEMO_MARKET_ZONES`, briefs
   * convertis depuis les classeurs fournis : 0 appel LLM, `brief_origin = 'seed'`). `market_zones` est purgée à chaque
   * remise à neuf (`DEMO_PURGE_TABLES`) et SONDÉE par la complétude de la salle (`DEMO_SEEDED_TABLES`) : les lignes
   * portent `workspace_id = $1`, exactement ce que la sonde cherche — sans elles `readRoom` déclarerait la salle
   * incomplète et la re-purgerait à CHAQUE entrée (boucle du 29/09/2026). `ON CONFLICT DO NOTHING` : rejouable.
   */
  /**
   * #3755.9 — la grille de qualification de la salle (`DEMO_QUALIFICATION_GRID`, version 1,
   * active) et l'évaluation de `DEMO_QUALIFICATION_ACCOUNT` contre elle : ce que l'analyse a
   * évalué, plus UNE saisie du commercial qui prime. L'instantané du verdict est réécrit dans
   * `raw_analysis.qualification` avec l'identifiant RÉEL de la grille (le jeu de données porte un
   * placeholder). Les trois tables sont purgées à chaque remise à neuf (`DEMO_PURGE_TABLES`,
   * `DEMO_PURGE_JOIN_TABLES`) : la grille est réinsérée à neuf, jamais dupliquée.
   */
  private async seedQualificationGrid(workspaceId: string, ownerUserId: string): Promise<void> {
    const manager = this.accounts.manager
    const [grid] = (await manager.query(
      `INSERT INTO qualification_grids (workspace_id, version, active, created_by)
       VALUES ($1, 1, true, $2)
       ON CONFLICT (workspace_id, version) DO NOTHING
       RETURNING id`,
      [workspaceId, ownerUserId],
    )) as { id: string }[]
    if (!grid) return
    for (const c of DEMO_QUALIFICATION_GRID) {
      await manager.query(
        `INSERT INTO qualification_criteria
           (grid_id, code, label, kind, weight, description_max, description_zero, category, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [grid.id, c.code, c.label, c.kind, c.weight, c.description_max, c.description_zero, c.category, c.position],
      )
    }
    const [account] = (await manager.query(
      `SELECT id FROM accounts WHERE workspace_id = $1 AND company_name = $2 LIMIT 1`,
      [workspaceId, DEMO_QUALIFICATION_ACCOUNT],
    )) as { id: string }[]
    if (!account) return
    const evaluatedAt = new Date().toISOString()
    await manager.query(
      `INSERT INTO account_qualifications
         (workspace_id, account_id, grid_id, grid_version, analysis_evaluations, manual_evaluations, evaluated_at, updated_by)
       VALUES ($1, $2, $3, 1, $4::jsonb, $5::jsonb, $6, $7)
       ON CONFLICT (account_id, grid_id) DO NOTHING`,
      [
        workspaceId,
        account.id,
        grid.id,
        JSON.stringify(DEMO_QUALIFICATION_ANALYSIS),
        JSON.stringify(DEMO_QUALIFICATION_MANUAL),
        evaluatedAt,
        ownerUserId,
      ],
    )
    await manager.query(
      `UPDATE accounts
          SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('qualification', $1::jsonb)
        WHERE id = $2 AND workspace_id = $3`,
      [JSON.stringify(demoQualificationSnapshot(grid.id, evaluatedAt)), account.id, workspaceId],
    )
  }

  private async seedMarketZones(workspaceId: string, ownerUserId: string): Promise<void> {
    for (const entry of DEMO_MARKET_ZONES) {
      await this.accounts.manager.query(
        `INSERT INTO market_zones
           (workspace_id, slug, label, scope, departments, cantons, cities, brief, brief_origin, brief_generated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'seed', $9, $10)
         ON CONFLICT (workspace_id, slug) DO NOTHING`,
        marketZoneInsertParams(entry, workspaceId, ownerUserId),
      )
    }
  }

  /**
   * #3756.5 — la bibliothèque de modèles de séquence de la salle : DEUX campagnes fictives de trois étapes
   * (`DEMO_SEQUENCE_TEMPLATES`). `sequence_templates` est purgée à chaque remise à neuf (`DEMO_PURGE_TABLES`) et
   * sondée par la complétude (`DEMO_SEEDED_TABLES`). Rejouable : un modèle de même nom n'est pas dupliqué.
   */
  private async seedSequenceTemplates(workspaceId: string): Promise<void> {
    for (const template of DEMO_SEQUENCE_TEMPLATES) {
      const existing = (await this.accounts.manager.query(
        `SELECT id FROM sequence_templates WHERE workspace_id = $1 AND name = $2`,
        [workspaceId, template.name],
      )) as { id: string }[]
      if (existing.length > 0) continue
      const inserted = (await this.accounts.manager.query(
        `INSERT INTO sequence_templates (workspace_id, name, sector, tier_label) VALUES ($1, $2, $3, $4) RETURNING id`,
        [workspaceId, template.name, template.sector, template.tier_label],
      )) as { id: string }[]
      const templateId = inserted[0]?.id
      if (!templateId) continue
      for (const [position, step] of template.steps.entries()) {
        await this.accounts.manager.query(
          `INSERT INTO sequence_template_steps (template_id, position, delay_days, subject, body) VALUES ($1, $2, $3, $4, $5)`,
          [templateId, position, step.delay_days, step.subject, step.body],
        )
      }
      // #4426.7 — les scripts d'appel de la campagne, rangés avec le modèle (kind `call_script`).
      for (const [position, script] of template.call_scripts.entries()) {
        await this.accounts.manager.query(
          `INSERT INTO sequence_template_steps (template_id, position, delay_days, subject, body, kind) VALUES ($1, $2, 0, $3, $4, 'call_script')`,
          [templateId, position, script.title, script.body],
        )
      }
    }
  }

  /**
   * #4158.30 / #4158.31 — la continuité d'équipe, montrée en salle (voir `demo-team-continuity.ts`).
   *
   *  - les modèles de séquence de la salle sont écrits par le collègue fictif et PARTAGÉS avec l'équipe
   *    (`visibility = 'team'`, la valeur par défaut — posée explicitement pour que la salle dise ce
   *    qu'elle montre) ;
   *  - UNE action ouverte du plan est déléguée à l'occupant, avec la note de contexte du collègue.
   *
   * Des `UPDATE` sur des lignes déjà semées (modèles, tâches du plan) : aucune ligne neuve, donc aucun
   * décompte de `INSERT` ne bouge. Rejouable : rien n'est modifié si la ligne visée n'existe plus.
   */
  private async seedTeamContinuity(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `UPDATE sequence_templates
       SET created_by = $2, visibility = 'team', updated_at = now()
       WHERE workspace_id = $1 AND created_by IS NULL`,
      [workspaceId, DEMO_TEAM_COLLEAGUE_ID],
    )
    await this.accounts.manager.query(
      `UPDATE action_plan_items
       SET assigned_to = $1, handoff_by = $2, handoff_note = $3
       WHERE id = (
         SELECT i.id FROM action_plan_items i
         JOIN accounts a ON a.id = i.account_id
         WHERE i.user_id = $1 AND a.workspace_id = $4
           AND i.done = false AND i.execution_status = 'todo' AND i.assigned_to IS NULL
         ORDER BY i.due_date ASC NULLS LAST, i.created_at ASC
         LIMIT 1
       )`,
      [ownerUserId, DEMO_TEAM_COLLEAGUE_ID, DEMO_HANDOFF_NOTE, workspaceId],
    )
    // #4158.50 — deux exemples d'équipe dans la bibliothèque de messages (l'un écrit par le collègue).
    for (const example of DEMO_TEAM_MESSAGE_EXAMPLES) {
      const variables = Array.from(new Set([...example.body.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1])))
      await this.accounts.manager.query(
        `INSERT INTO message_library_entries
           (workspace_id, created_by, title, body, origin, source_document, version, entry_date,
            channel, scenario_id, persona, decision_role, stage, route, objective,
            expected_variables, mandatory_facts, claims, status, mode, usage_constraints, fact_confirmations, visibility)
         VALUES ($1, $2, $3, $4, 'Ajouté par l’équipe', 'Saisi depuis la bibliothèque', 1, now(), 'email_draft',
                 'cold_approach', 'decideur', 'non renseigné', 'non renseigné', 'non renseigné', 'non renseigné',
                 $5::jsonb, '[]'::jsonb, '[]'::jsonb, 'a_revoir', 'inspiration', '[]'::jsonb, '[]'::jsonb, 'team')`,
        [
          workspaceId,
          example.author === 'colleague' ? DEMO_TEAM_COLLEAGUE_ID : ownerUserId,
          example.title,
          example.body,
          JSON.stringify(variables),
        ],
      )
    }
  }

  /**
   * #2571.5 — l'appel d'offres de la salle de démonstration, avec son inconnue.
   *
   * RÉFUTÉ EN RECETTE le 18/09/2026 : `previewNeedFromRfp` (#2571.1/#2571.2)
   * était juste, calculée, testée — et personne ne pouvait l'atteindre en
   * démo, faute d'un seul dossier semé. `rfps` reste dans `DEMO_PURGE_TABLES`
   * (`demo-reset.service.ts`) : un visiteur qui l'a importé de son côté ne
   * doit rien laisser au suivant.
   *
   * Même chemin que `RfpService.create` en démo : `demoRfpAnalysis`
   * (`demo-scripts.ts`) porte déjà un émetteur, une échéance, quatre exigences
   * classées ET une cinquième volontairement AMBIGUË (« Pénalités de retard
   * et réversibilité en fin de marché ») — la salle ne montre donc jamais un
   * écran que le produit ne sait pas rendre. Statut `analysed` : exigences
   * extraites, décision pas encore prise (voir `rfpStatusSchema`) — l'état où
   * la prévisualisation a un sens, avant que l'humain tranche bid/no-bid.
   *
   * `account_id: null` — le dossier est un AO reçu en direct, pas rattaché à
   * l'un des six comptes de la salle : `previewNeedFromRfp` doit nommer
   * « aucun compte » pour que l'écran affiche le choix libre du projet,
   * exactement le cas qu'un AO non rapproché produit en production.
   */
  private async seedRfp(workspaceId: string, ownerUserId: string): Promise<void> {
    const existing = await this.rfps.count({ where: { workspace_id: workspaceId } })
    if (existing > 0) return

    const analysed = demoRfpAnalysis(DEMO_RFP.title)
    const requirements: RfpRequirement[] = (
      analysed.requirements as Array<{
        text: string
        section: string
        kind: RfpRequirementKind
        weight: RfpRequirementWeight
        ownerRole: RfpOwnerRole
        risk: string | null
      }>
    ).map((item, index) => ({
      id: randomUUID(),
      // Décoratif — comme à l'import réel (`RfpService.create`), jamais
      // rejoint hors de la ligne JSONB qui le porte (voir `RfpEntity`).
      rfp_id: randomUUID(),
      section: item.section,
      text: item.text,
      weight: item.weight,
      kind: item.kind,
      owner_role: item.ownerRole,
      // #2957 (#2181.19/.20/.22/.23) — LA dernière exigence (la clause
      // contractuelle AMBIGUË, voir `demoRfpAnalysis`) est semée `blocked`
      // plutôt que `to_produce` : elle attend une clarification côté client
      // (plafond de pénalités, format de réversibilité), le cas réel que ce
      // statut nomme. Un jeu de démonstration où toutes les exigences
      // partagent le même statut ne prouve jamais que le sélecteur (ajouté
      // par ce lot) sait afficher et poser les trois autres valeurs.
      answer_status: index === analysed.requirements.length - 1 ? 'blocked' : 'to_produce',
      answer_source: null,
      answer_text: null,
      // #2957 (#2181.10/.14) — VIDE À DESSEIN : chaque exigence scriptée porte
      // déjà sa propre raison de ne rien prouver (`item.risk`, ci-dessous —
      // « les références réelles vivent dans ton espace, pas dans la
      // démonstration »). Ajouter une preuve ici contredirait ce narratif :
      // la salle ne montre JAMAIS une preuve qu'un espace fictif ne peut pas
      // vraiment produire. Le formulaire « Ajouter une preuve » (#2181.42)
      // reste visible et utilisable en démo — seul l'état initial est vide.
      evidence: null,
      confidence: null,
      risk: item.risk,
      // #2180.27 — la salle sème UN dossier mono-document (voir le docblock
      // au-dessus) : rien à distinguer, comme à l'import réel d'un seul
      // fichier (`RfpService.create`).
      source_document: null,
      // #2957 (#2181.15) — l'exigence BLOQUÉE porte le commentaire d'équipe
      // qui dit POURQUOI : sans lui, le fil de commentaires s'ouvrirait vide
      // devant un prospect. #2181.16 (versions) reste VIDE À DESSEIN : aucune
      // exigence semée n'a de réponse rédigée, donc aucune réponse remplacée —
      // deux « Rédiger » successifs en salle en produisent une, réellement.
      ...(index === analysed.requirements.length - 1
        ? {
            comments: [
              {
                id: randomUUID(),
                author_id: ownerUserId,
                body: DEMO_RFP.blockedComment,
                created_at: new Date().toISOString(),
              },
            ],
          }
        : {}),
    }))

    const rfp = await this.rfps.save(
      this.rfps.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        account_id: null,
        title: analysed.title,
        issuer: analysed.issuer,
        // #2957 (#2180.54) — `pdf`, pas `pasted` : la salle sème désormais le
        // fichier SOURCE (juste en dessous), donc le dossier doit dire d'où il
        // vient, comme un import réel à un seul fichier (`sourceFormatOf`).
        source_format: 'pdf',
        status: 'analysed',
        due_at: new Date(analysed.dueAt),
        lots: analysed.lots,
        source_text: null,
        decision: analysed.decision as BidDecision,
        requirements,
      }),
    )

    // #2957 (#2180.54) — le fichier SOURCE du dossier, conservé comme à
    // l'import réel (`RfpService.persistDraft`). Un fichier fictif, jamais un
    // vrai document d'appel d'offres : la démo décrit toujours son propre
    // caractère fictif (voir `demoPdf`).
    const storageObjectId = await this.seedStoredFile({
      workspaceId,
      domain: 'rfp_source_document',
      fileKey: `rfp/${DEMO_RFP.title}/source`,
      fileName: 'Consultation_infrastructure_cloud.pdf',
      title: 'Appel d’offres de démonstration',
      lines: [
        `Dossier : ${analysed.title}`,
        `Émetteur : ${analysed.issuer ?? 'non précisé'}`,
        '',
        'Document FICTIF, produit pour la salle de démonstration Bellum.',
      ],
      depositedOn: new Date().toISOString().slice(0, 10),
    })
    if (storageObjectId) {
      await this.accounts.manager.query(
        `INSERT INTO rfp_source_documents (workspace_id, rfp_id, storage_object_id, position)
         VALUES ($1, $2, $3, 0)`,
        [workspaceId, rfp.id, storageObjectId],
      )
    }

    // #2957 (#2180.53) — un import INTERROMPU à reprendre : sans lui, la bannière
    // « Reprendre l'import » de `/rfp` serait un écran livré mais vide en salle.
    // Un aperçu déjà rendu, pas encore confirmé — les octets des fichiers n'y
    // sont jamais, seulement leur nom (voir `rfp_import_sessions`).
    const interrupted = demoRfpAnalysis(DEMO_RFP_INTERRUPTED_IMPORT.title)
    const interruptedDraft = {
      account_id: null,
      title: DEMO_RFP_INTERRUPTED_IMPORT.title,
      issuer: interrupted.issuer,
      reference: DEMO_RFP_INTERRUPTED_IMPORT.reference,
      source_format: 'pdf' as const,
      due_at: new Date(interrupted.dueAt).toISOString(),
      lots: interrupted.lots,
      source_text: null,
      decision: null,
      requirements,
      document_hash: createHash('sha256').update(DEMO_RFP_INTERRUPTED_IMPORT.title).digest('hex'),
      document_extraction: null,
    }
    await this.accounts.manager.query(
      `INSERT INTO rfp_import_sessions (workspace_id, user_id, status, title, pasted_text, document_names, preview)
       VALUES ($1, $2, 'in_progress', $3, NULL, $4::jsonb, $5::jsonb)`,
      [
        workspaceId,
        ownerUserId,
        DEMO_RFP_INTERRUPTED_IMPORT.title,
        JSON.stringify(DEMO_RFP_INTERRUPTED_IMPORT.documentNames),
        JSON.stringify({
          draft: interruptedDraft,
          indicators: computeRfpImportPreviewIndicators(interruptedDraft),
          duplicateOf: null,
          failedDocuments: [],
        }),
      ],
    )
  }

  /**
   * #2293.5 / .6 — le lot « Analyser une liste » de la salle : deux sous-jobs
   * terminés qui RÉFÉRENCENT les deux premiers dossiers semés, une ambiguïté
   * à confirmer, et (#2283.32, épopée #2983) une identité restée ambiguë
   * APRÈS l'analyse — `needs_resolution`, sur le troisième dossier semé.
   * Aucun débit (`charged = false`) : la démo ne débite jamais.
   */
  private async seedAnalysisBatch(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const [first, second, third] = [...accountIds.entries()]
    if (!first || !second || !third) return
    const [batch] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO analysis_batches (workspace_id, created_by, source) VALUES ($1, $2, $3) RETURNING id`,
      [workspaceId, ownerUserId, DEMO_ANALYSIS_BATCH.source],
    )
    if (!batch) return
    const rows: [number, string, string | null, string, unknown[]][] = [
      [0, first[0], first[1], 'done', []],
      [1, second[0], second[1], 'done', []],
      [2, DEMO_ANALYSIS_BATCH.ambiguous.name, null, 'to_confirm', DEMO_ANALYSIS_BATCH.ambiguous.candidates],
      [3, third[0], third[1], 'needs_resolution', DEMO_ANALYSIS_BATCH.needsResolution.candidates],
    ]
    for (const [position, name, accountId, state, candidates] of rows) {
      await this.accounts.manager.query(
        `INSERT INTO analysis_batch_items (batch_id, workspace_id, position, name, account_id, state, candidates, charged)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, false)`,
        [batch.id, workspaceId, position, name, accountId, state, JSON.stringify(candidates)],
      )
    }
  }

  /**
   * #4611.9 — le second lot de la salle : de quoi montrer à « où en est le travail lancé ? » des analyses
   * rendues, en cours, en file et une en erreur avec sa raison. Voir `DEMO_WORK_PROGRESS`. Aucun débit.
   */
  private async seedWorkProgressBatch(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const accounts = [...accountIds.entries()]
    const spec = DEMO_WORK_PROGRESS.analysisBatch
    const createdAt = new Date(Date.now() - spec.hoursAgo * 3_600_000).toISOString()
    const [batch] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO analysis_batches (workspace_id, created_by, source, created_at)
       VALUES ($1, $2, $3, $4::timestamptz) RETURNING id`,
      [workspaceId, ownerUserId, spec.source, createdAt],
    )
    if (!batch) return
    for (const [position, item] of spec.items.entries()) {
      const account = item.accountIndex === null ? undefined : accounts[item.accountIndex]
      // Un sous-job qui référence un dossier absent ne s'écrit pas : le lot reste cohérent avec ce qui est semé.
      if (item.accountIndex !== null && !account) continue
      const name = account?.[0] ?? ('name' in item ? item.name : 'Entreprise')
      await this.accounts.manager.query(
        `INSERT INTO analysis_batch_items
           (batch_id, workspace_id, position, name, account_id, state, candidates, failure_code, charged)
         VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, false)`,
        [batch.id, workspaceId, position, name, account?.[1] ?? null, item.state, item.failureCode],
      )
    }
  }

  /**
   * #3014 — le résumé de première synchronisation, déjà TERMINÉ. Voir le
   * docblock de `DEMO_INTEGRATION_SYNC_RUN` : sans OAuth réel en démo, c'est
   * le seul moyen pour un prospect de voir cet écran.
   */
  private async seedIntegrationSyncRun(workspaceId: string, ownerUserId: string): Promise<void> {
    const run = DEMO_INTEGRATION_SYNC_RUN
    const startedAt = new Date(Date.now() - run.started_minutes_ago * 60_000)
    const finishedAt = new Date(Date.now() - run.finished_minutes_ago * 60_000)
    await this.accounts.manager.query(
      `INSERT INTO integration_sync_runs
         (workspace_id, started_by, provider, status, summary, started_at, finished_at)
       VALUES ($1, $2, $3, 'completed', $4::jsonb, $5, $6)`,
      [workspaceId, ownerUserId, run.provider, JSON.stringify(run.summary), startedAt, finishedAt],
    )
  }

  /**
   * #2284.67-.69 — la correction d'identité de la salle : l'espace a CONFIRMÉ
   * l'entité résolue de SNCF. Version 1, auteur = l'occupant de la salle.
   * Même forme que le geste réel (`EntityResolutionCorrectionsService.record`).
   */
  /** #4188 — voir `DEMO_ACCOUNT_CRM_EXPORT` (demo-dataset.ts). */
  /**
   * #4051 — la trace d'import des fiches d'exemple (comptes, contacts, consultants) : `iso`/jours relatifs au semis,
   * jamais une date figée. Écrite comme `insertImportMarks` l'écrit (même table, même forme).
   */
  private async seedImportMarks(workspaceId: string, accountIds: Map<string, string>): Promise<void> {
    const at = new Date(Date.now() - DEMO_IMPORT_MARKS.daysAgo * 24 * 60 * 60 * 1000).toISOString()
    const mark = (table: 'accounts' | 'consultants', entityType: string, label: string) =>
      this.accounts.manager.query(
        `INSERT INTO record_import_marks (workspace_id, entity_type, entity_id, source_kind, source_label, imported_at)
         SELECT $1, $2, id, 'file', $3, $4::timestamptz FROM ${table} WHERE workspace_id = $1`,
        [workspaceId, entityType, label, at],
      )
    await mark('accounts', 'account', DEMO_IMPORT_MARKS.recordsFile)
    // #4459.4 — tous les contacts, SAUF ceux que l'analyse a apportés sur le dossier « Venu de ton CRM »
    // (`DEMO_CRM_COMPLETION`) : sans trace d'import, ils se lisent « Apporté par Bellum ».
    const completionAccountId = accountIds.get(DEMO_CRM_COMPLETION.companyName) ?? null
    await this.accounts.manager.query(
      `INSERT INTO record_import_marks (workspace_id, entity_type, entity_id, source_kind, source_label, imported_at)
       SELECT $1, 'contact', c.id, 'file', $2, $3::timestamptz FROM contacts c
        WHERE c.workspace_id = $1
          AND NOT (c.account_id IS NOT DISTINCT FROM $4::uuid AND c.full_name = ANY($5::text[]))`,
      [workspaceId, DEMO_IMPORT_MARKS.recordsFile, at, completionAccountId, [...DEMO_CRM_COMPLETION.broughtContacts]],
    )
    await mark('consultants', 'consultant', DEMO_IMPORT_MARKS.consultantsFile)
  }

  private async seedAccountCrmExport(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const accountId = accountIds.get(DEMO_ACCOUNT_CRM_EXPORT.companyName)
    if (!accountId) return
    await this.accounts.manager.query(
      `INSERT INTO account_crm_exports
         (workspace_id, account_id, provider, crm_record_id, last_action, destination_label, exported_by)
       VALUES ($1, $2, $3, $4, 'created', $5, $6)
       ON CONFLICT (account_id, provider) DO NOTHING`,
      [
        workspaceId,
        accountId,
        DEMO_ACCOUNT_CRM_EXPORT.provider,
        DEMO_ACCOUNT_CRM_EXPORT.crmRecordId,
        DEMO_ACCOUNT_CRM_EXPORT.destinationLabel,
        ownerUserId,
      ],
    )
  }

  private async seedEntityResolutionCorrection(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const accountId = accountIds.get(DEMO_ENTITY_RESOLUTION_CORRECTION.companyName)
    if (!accountId) return
    const { request } = DEMO_ENTITY_RESOLUTION_CORRECTION
    await this.accounts.manager.query(
      `INSERT INTO entity_resolution_corrections
         (workspace_id, account_id, version, decision, target_name, target_siren, note, decided_by)
       VALUES ($1, $2, 1, $3, $4, $5, $6, $7)`,
      [workspaceId, accountId, request.decision, request.target_name, request.target_siren, request.note, ownerUserId],
    )
  }

  /**
   * #2126.47-.60 (épopée #2787) — les DEUX FORMES d'outcome commercial semées :
   * un outcome porté par un contact précis, un outcome de portée compte (sans
   * contact). Voir `DEMO_COMMERCIAL_OUTCOMES` (demo-dataset.ts).
   *
   * Même choix que `seedTargetLists` juste en dessous : « le premier compte »
   * et « le premier contact » du semis, sans scénario dédié — l'écran doit
   * montrer l'OBJET dans ses deux états, pas une histoire précise.
   */
  private async seedCommercialOutcomes(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const [firstAccount, secondAccount] = [...accountIds.values()]
    const [firstContact] = [...contactIds.values()]
    if (!firstAccount) return
    if (firstContact) {
      await this.accounts.manager.query(
        `INSERT INTO commercial_outcomes (workspace_id, account_id, contact_id, outcome_type, reason, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          firstAccount,
          firstContact,
          DEMO_COMMERCIAL_OUTCOMES.contactOutcome.type,
          DEMO_COMMERCIAL_OUTCOMES.contactOutcome.reason,
          ownerUserId,
        ],
      )
    }
    const accountOnly = secondAccount ?? firstAccount
    await this.accounts.manager.query(
      `INSERT INTO commercial_outcomes (workspace_id, account_id, contact_id, outcome_type, reason, recorded_by)
       VALUES ($1, $2, NULL, $3, $4, $5)`,
      [
        workspaceId,
        accountOnly,
        DEMO_COMMERCIAL_OUTCOMES.accountOutcome.type,
        DEMO_COMMERCIAL_OUTCOMES.accountOutcome.reason,
        ownerUserId,
      ],
    )
  }

  /**
   * #3403.7 — LES VOIES D'ACCÈS PERSONNELLES, SEMÉES.
   *
   * Deux autorisations d'introduction déjà ACCORDÉES (`granted = true` — un
   * refus n'est jamais une voie ouverte, `account-access.service.ts`), sur
   * deux contacts RÉELLEMENT semés (Philippe Marchand et Isabelle Rouault chez
   * SNCF) : aucun contact fictif créé pour l'occasion.
   *
   * Deux voies du retour #3403, deux certitudes distinctes — pour que la carte
   * de l'onglet Accès montre les DEUX rendus (badge « Accès vérifié » et badge
   * neutre, jamais une garantie sans confirmation, #3403.14) :
   *  - Philippe Marchand, `consultant`, VÉRIFIÉ ⇒ voie « consultant déjà en place »,
   *    accès vérifié ;
   *  - Isabelle Rouault, `explicit_recommendation`, PAS vérifié ⇒ voie
   *    « recommandation directe », relation probable.
   *
   * Une troisième voie (« partenaire en rang 2 ») est DÉJÀ semée par ailleurs,
   * sans rien à ajouter ici : `DEMO_SPRINT_PARTNER_ROUTE_PARTNER` (SNCF,
   * `account_partners`, rang 2, partenaire). Les huit autres voies restent
   * `vide à dessein` — voir `DEMO_PERSONAL_ACCESS_PATHS_COVERAGE` et
   * `DEMO_PERSONAL_ACCESS_PATHS_REMAINING_VOIES_COVERAGE` (`demo-coverage.ts`).
   */
  private async seedPersonalAccessPaths(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
    accountIds: Map<string, string>,
  ): Promise<void> {
    for (const seed of DEMO_PERSONAL_ACCESS_PATH_SEEDS) {
      const contactId = contactIds.get(seed.contact)
      if (!contactId) continue
      await this.accounts.manager.query(
        `INSERT INTO introduction_authorizations
           (workspace_id, target_contact_id, granted, channel, authorized_at, recorded_by, link_kind, verified, warmth)
         VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8)`,
        [
          workspaceId,
          contactId,
          seed.channel,
          seed.authorizedAt,
          ownerUserId,
          seed.linkKind,
          seed.verified,
          seed.warmth ?? null,
        ],
      )
    }
    await this.seedPersonalAccessExtraPaths(workspaceId, ownerUserId, accountIds)
    await this.seedWatchWakeSignal(workspaceId, accountIds)
  }

  /** #3696 (parité démo, lot K12 07/10) — voir `DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS`. */
  private async seedMessageDraftVersions(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    for (const seed of DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS) {
      const contactId = contactIds.get(seed.contact)
      if (!contactId) continue
      await this.accounts.manager.query(
        `INSERT INTO message_draft_versions
           (workspace_id, contact_id, channel, subject, body, recorded_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7::int))`,
        [workspaceId, contactId, seed.channel, seed.subject, seed.body, ownerUserId, seed.createdDaysAgo],
      )
    }
    // #2370 — un message déjà préparé par canal neuf du composer (`DEMO_PREPARED_CHANNELS_COVERAGE`).
    for (const seed of DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS) {
      const contactId = contactIds.get(seed.contact)
      if (!contactId) continue
      await this.accounts.manager.query(
        `INSERT INTO message_draft_versions
           (workspace_id, contact_id, channel, subject, body, recorded_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7::int))`,
        [workspaceId, contactId, seed.channel, seed.subject, seed.body, ownerUserId, seed.createdDaysAgo],
      )
    }
    // Théo B C6.N2 — l'e-mail de suivi de Nadia Perrin est déjà RELU (validé, jamais envoyé) ; les autres restent « à relire ».
    const followUpContactId = contactIds.get('Nadia Perrin')
    if (followUpContactId) {
      await this.accounts.manager.query(
        `INSERT INTO message_draft_validations (workspace_id, version_id, content_hash, validated_by)
         SELECT v.workspace_id, v.id,
                encode(sha256(convert_to(COALESCE(v.edited_subject, v.subject, '') || E'\n' || COALESCE(v.edited_body, v.body), 'UTF8')), 'hex'),
                $3
           FROM message_draft_versions v
          WHERE v.workspace_id = $1 AND v.contact_id = $2 AND v.channel = 'follow_up_email'
          ORDER BY v.created_at DESC
          LIMIT 1
         ON CONFLICT (version_id) DO NOTHING`,
        [workspaceId, followUpContactId, ownerUserId],
      )
    }
    await this.seedScheduledSends(workspaceId, ownerUserId, contactIds)
  }

  /**
   * Théo C talents-recrutement — voir `DEMO_RECRUITMENT_SEED_SPECS`. Une ligne de journal par candidat rangé ; les
   * homonymes sont départagés par leur rang dans `DEMO_CV_IMPORT_CONSULTANTS`, jamais par le seul nom.
   */
  private async seedRecruitmentEvents(
    workspaceId: string,
    ownerUserId: string,
    rows: readonly { id: string }[],
  ): Promise<void> {
    for (const seed of DEMO_RECRUITMENT_SEED_SPECS) {
      const talentIndex = DEMO_CV_IMPORT_CONSULTANTS.map((persona, index) => ({ persona, index }))
        .filter(({ persona }) => persona.full_name === seed.persona)
        .at(seed.occurrence)?.index
      const talentId = talentIndex === undefined ? undefined : rows[talentIndex]?.id
      if (!talentId) continue
      await this.accounts.manager.query(
        `INSERT INTO talent_recruitment_events (workspace_id, talent_id, stage, reason, planned_at, changed_by)
         VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE date_trunc('hour', now()) + make_interval(days => $5::int) END, $6)`,
        [workspaceId, talentId, seed.stage, seed.reason ?? null, seed.inDays ?? null, ownerUserId],
      )
    }
  }

  /**
   * Théo M2 — envoi programmé — voir `DEMO_SCHEDULED_SEND_SEED_SPECS`. La dernière version du fil est VALIDÉE (même
   * empreinte que `draftContentHash`), puis datée. Aucun job n'est posé : rien ne part d'une salle de démonstration.
   */
  private async seedScheduledSends(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    for (const seed of DEMO_SCHEDULED_SEND_SEED_SPECS) {
      const contactId = contactIds.get(seed.contact)
      if (!contactId) continue
      await this.accounts.manager.query(
        `INSERT INTO message_draft_validations (workspace_id, version_id, content_hash, validated_by)
         SELECT v.workspace_id, v.id,
                encode(sha256(convert_to(COALESCE(v.edited_subject, v.subject, '') || E'\n' || COALESCE(v.edited_body, v.body), 'UTF8')), 'hex'),
                $4
           FROM message_draft_versions v
          WHERE v.workspace_id = $1 AND v.contact_id = $2 AND v.channel = $3
          ORDER BY v.created_at DESC
          LIMIT 1
         ON CONFLICT (version_id) DO NOTHING`,
        [workspaceId, contactId, seed.channel, ownerUserId],
      )
      await this.accounts.manager.query(
        `INSERT INTO scheduled_message_sends
           (workspace_id, user_id, version_id, validation_id, contact_id, content_hash, scheduled_at, time_zone, status)
         SELECT v.workspace_id, $4, v.id, val.id, v.contact_id, val.content_hash,
                date_trunc('hour', now()) + make_interval(hours => $5::int), $6, 'scheduled'
           FROM message_draft_versions v
           JOIN message_draft_validations val ON val.version_id = v.id AND val.workspace_id = v.workspace_id
          WHERE v.workspace_id = $1 AND v.contact_id = $2 AND v.channel = $3
          ORDER BY v.created_at DESC
          LIMIT 1
         ON CONFLICT DO NOTHING`,
        [workspaceId, contactId, seed.channel, ownerUserId, seed.inHours, seed.timeZone],
      )
    }
  }

  /**
   * L2 Pilotage › Pipe — voir `DEMO_PIPE_L2` : le commercial démo (seul : pas de
   * coéquipiers fictifs, Louis 14/10) porte des affaires sur les comptes RÉELS de
   * la salle, avec leur journal (stades, montants, dates prévues) et leur dernier
   * contact. Les dates sont relatives à « maintenant » (`buildDemoPipeRows`).
   * Les montants et dates sont écrits TELS QUELS dans le journal : l'INSERT ne
   * déclenche pas le trigger (UPDATE seulement), le journal est donc posé ici.
   */
  private async seedPipeDeclarations(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const run = (sql: string, params: unknown[]) => this.accounts.manager.query(sql, params)
    for (const declaration of DEMO_PIPE_L2.existingDeclarations) {
      await run(`UPDATE opportunities SET forecast_category = $3 WHERE workspace_id = $1 AND label = $2`, [
        workspaceId,
        declaration.label,
        declaration.category,
      ])
    }
    for (const row of buildDemoPipeRows(new Date())) {
      const { deal } = row
      const accountId = accountIds.get(deal.account)
      if (!accountId) continue
      const [created] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, amount_cents, estimated_amount,
            currency, expected_close_on, forecast_category, owner_id, first_detected_at, closed_at, outcome, source)
         VALUES ($1, $2, 'besoin', $3, $4, $5, $6, $7::bigint, $8::numeric, 'EUR', $9::date, $10, $11, $12, $13, $14, 'manual')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          accountId,
          deal.label,
          deal.detail,
          deal.stage,
          row.stageEnteredAt,
          deal.amountCents,
          deal.amountCents === null ? null : deal.amountCents / 100,
          row.expectedCloseOn,
          deal.category,
          ownerUserId,
          row.firstDetectedAt,
          row.closedAt,
          deal.stage === 'won' || deal.stage === 'lost' ? deal.stage : null,
        ],
      )
      if (!created) continue
      for (const step of row.transitions) {
        await run(
          `INSERT INTO commercial_transitions
             (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, proof, source, occurred_at)
           VALUES ($1, 'opportunity', $2, $3, $4, $5, NULL, 'human', $6)`,
          [workspaceId, created.id, step.from, step.to, ownerUserId, step.at],
        )
      }
      const change = (field: string, from: string | null, to: string | null, at: Date) =>
        run(
          `INSERT INTO opportunity_field_changes
             (workspace_id, opportunity_id, field, from_value, to_value, actor_id, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [workspaceId, created.id, field, from, to, ownerUserId, at],
        )
      for (const item of row.amountChanges) {
        await change('amount_cents', item.fromCents?.toString() ?? null, item.toCents?.toString() ?? null, item.at)
      }
      for (const item of row.closeDateChanges) await change('expected_close_on', item.from, item.to, item.at)
      if (row.lastActivityAt) {
        // Une touche SANS corps : seul le fait compte pour « sans activité depuis N jours ».
        await run(
          `INSERT INTO activities
             (workspace_id, user_id, kind, source, direction, subject, occurred_at, account_id, project_id, link_reason)
           VALUES ($1, $2, 'call', 'manual', 'outbound', 'Point d’avancement', $3, $4, $5, 'project_explicit')`,
          [workspaceId, ownerUserId, row.lastActivityAt, accountId, created.id],
        )
      }
    }
  }

  /**
   * R33b (16/10/2026) — voir `demo-parity-history.ts`. Mêmes tables et même forme que `DEMO_ACTIVITIES`,
   * `DEMO_USER_ACTIONS` et `seedPipeDeclarations`, pour les comptes de brief qui s'ouvraient vides. Les contacts des
   * comptes d'extension ne sont pas dans `contactIds` : leurs décideurs sont relus PAR NOM en base (un nom introuvable
   * fait SAUTER la ligne, jamais un contact fabriqué). Tout est purgé au reset par `workspace_id` / `ON DELETE CASCADE`
   * (`project_contacts` → `opportunities`) comme le reste du semis.
   */
  private async seedParityHistory(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const now = new Date()
    const run = (sql: string, params: unknown[]) => this.accounts.manager.query(sql, params)
    const activityRows = DEMO_PARITY_ACTIVITIES.flatMap(activity => {
      const accountId = accountIds.get(activity.company)
      if (!accountId) return []
      const at = new Date(now.getTime() - activity.daysAgo * 86_400_000)
      return [
        this.activities.create({
          workspace_id: workspaceId,
          user_id: ownerUserId,
          kind: activity.kind,
          source: 'manual',
          direction: activity.direction,
          subject: activity.subject,
          body: activity.body,
          body_truncated: false,
          occurred_at: at,
          duration_seconds: activity.durationSeconds,
          account_id: accountId,
          contact_id: null,
          project_id: null,
          link_reason: 'manual',
          external_id: null,
          external_url: null,
          created_at: at,
          call_outcome: activity.outcome ?? null,
          call_debrief: null,
        }),
      ]
    })
    if (activityRows.length > 0) await this.activities.save(activityRows)

    await this.userActions.save(
      DEMO_PARITY_USER_ACTIONS.flatMap(action => {
        const accountId = accountIds.get(action.company)
        if (!accountId) return []
        return [
          this.userActions.create({
            user_id: ownerUserId,
            workspace_id: workspaceId,
            account_id: accountId,
            contact_id: null,
            action_type: action.action_type,
            channel: action.channel,
            metadata: action.metadata,
            created_at: new Date(now.getTime() - action.hours_ago * 3_600_000),
          }),
        ]
      }),
    )

    const contactIdsByAccount = new Map<string, Map<string, string>>()
    const contactsOf = async (accountId: string): Promise<Map<string, string>> => {
      const known = contactIdsByAccount.get(accountId)
      if (known) return known
      const rows = (await run(`SELECT id, full_name FROM contacts WHERE workspace_id = $1 AND account_id = $2`, [
        workspaceId,
        accountId,
      ])) as { id: string; full_name: string }[]
      const byName = new Map<string, string>(rows.map(contact => [contact.full_name, contact.id]))
      contactIdsByAccount.set(accountId, byName)
      return byName
    }

    for (const row of buildParityDealRows(now)) {
      const { deal } = row
      const accountId = accountIds.get(deal.account)
      if (!accountId) continue
      const [created] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, amount_cents, estimated_amount,
            currency, expected_close_on, forecast_category, owner_id, first_detected_at, closed_at, outcome, source)
         VALUES ($1, $2, 'besoin', $3, $4, $5, $6, $7::bigint, $8::numeric, 'EUR', $9::date, $10, $11, $12, $13, $14, 'manual')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          accountId,
          deal.label,
          deal.detail,
          deal.stage,
          row.stageEnteredAt,
          deal.amountCents,
          deal.amountCents === null ? null : deal.amountCents / 100,
          row.expectedCloseOn,
          deal.category,
          ownerUserId,
          row.firstDetectedAt,
          row.closedAt,
          deal.stage === 'won' || deal.stage === 'lost' ? deal.stage : null,
        ],
      )
      if (!created) continue
      for (const step of row.transitions) {
        await run(
          `INSERT INTO commercial_transitions
             (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, proof, source, occurred_at)
           VALUES ($1, 'opportunity', $2, $3, $4, $5, NULL, 'human', $6)`,
          [workspaceId, created.id, step.from, step.to, ownerUserId, step.at],
        )
      }
      const contactIdByName = await contactsOf(accountId)
      for (const link of deal.contacts) {
        const contactId = contactIdByName.get(link.full_name)
        if (!contactId) continue
        await run(
          `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [workspaceId, created.id, contactId, link.role],
        )
      }
      if (row.lastActivityAt) {
        await run(
          `INSERT INTO activities
             (workspace_id, user_id, kind, source, direction, subject, occurred_at, account_id, project_id, link_reason)
           VALUES ($1, $2, 'call', 'manual', 'outbound', 'Point d’avancement', $3, $4, $5, 'project_explicit')`,
          [workspaceId, ownerUserId, row.lastActivityAt, accountId, created.id],
        )
      }
    }
  }

  /** #3407.5 — voir `DEMO_WATCH_WAKE_SEED`. */
  private async seedWatchWakeSignal(workspaceId: string, accountIds: Map<string, string>): Promise<void> {
    const seed = DEMO_WATCH_WAKE_SEED
    const accountId = seed.accountName ? accountIds.get(seed.accountName) : undefined
    if (!accountId) return
    await this.accounts.manager.query(
      `UPDATE accounts SET sprint_entered_at = now() - make_interval(days => $3::int)
        WHERE id = $1 AND workspace_id = $2 AND sprint = 'watch'`,
      [accountId, workspaceId, seed.enteredWatchDaysAgo],
    )
    await this.accounts.manager.query(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, source, confidence, first_detected_at)
       SELECT $1, $2, 'signal', $3, $4, 'detected', now() - make_interval(days => $5::int), 'signal', 'medium',
              now() - make_interval(days => $5::int)
        WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = $2 AND o.label = $3)`,
      [workspaceId, accountId, seed.signal.label, seed.signal.detail, seed.signal.detectedDaysAgo],
    )
  }

  /** Les trois voies hors lien déclaré — voir `DEMO_PERSONAL_ACCESS_EXTRA_SEEDS`. */
  private async seedPersonalAccessExtraPaths(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const extra = DEMO_PERSONAL_ACCESS_EXTRA_SEEDS
    const clientId = accountIds.get(extra.clientAccount)
    if (clientId) {
      // Fusionne dans `salesContext.relationship` sans écraser le reste du
      // dossier : la clé que `readRelationshipState` (contrat) relit.
      await this.accounts.manager.query(
        `UPDATE accounts
            SET raw_analysis = jsonb_set(
              COALESCE(raw_analysis, '{}'::jsonb),
              '{salesContext,relationship}',
              '{"state":"client_actif","derivation":"declared","confidence":90,"evidence":["relation client active déclarée par l’équipe de démonstration"]}'::jsonb,
              true)
          WHERE id = $1 AND workspace_id = $2`,
        [clientId, workspaceId],
      )
    }
    const dormantId = accountIds.get(extra.dormantAccount)
    if (dormantId) {
      await this.accounts.manager.query(
        `UPDATE accounts
            SET raw_analysis = jsonb_set(
              COALESCE(raw_analysis, '{}'::jsonb),
              '{salesContext,relationship}',
              '{"state":"dormant","derivation":"declared","confidence":80,"evidence":["relation passée en sommeil, déclarée par l’équipe de démonstration"]}'::jsonb,
              true)
          WHERE id = $1 AND workspace_id = $2`,
        [dormantId, workspaceId],
      )
    }
    const esnAccountId = accountIds.get(extra.referencedEsn.accountName)
    if (esnAccountId) {
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at, declared_by)
         VALUES ($1, $2, $3, 'rank1', 'partner', NULL, 'declared', $4, NULL, $5, now() - make_interval(days => $6::int), $7)
         ON CONFLICT (account_id, lower(name)) DO UPDATE
           SET rank = EXCLUDED.rank, relationship = EXCLUDED.relationship, source = 'declared',
               placements = EXCLUDED.placements, scope = EXCLUDED.scope, declared_by = EXCLUDED.declared_by`,
        [
          workspaceId,
          esnAccountId,
          extra.referencedEsn.name,
          extra.referencedEsn.placements,
          extra.referencedEsn.perimeter,
          extra.referencedEsn.detectedDaysAgo,
          ownerUserId,
        ],
      )
    }
    // SEMIS-PREUVES 4292.10 (#4271.2) — l'accès à bâtir : un rang 1 installé sur une entité DÉJÀ dérivée des
    // contacts. UPDATE (jamais INSERT) : une entité absente ne s'invente pas, elle se signale.
    const toBuildId = accountIds.get(extra.toBuildAccess.accountName)
    if (toBuildId) {
      const updated = returnedRows<{ id: string }>(
        await this.accounts.manager.query(
          `UPDATE account_entities SET rank1_incumbent = 'yes'
          WHERE workspace_id = $1 AND account_id = $2 AND lower(name) = lower($3) RETURNING id`,
          [workspaceId, toBuildId, extra.toBuildAccess.entityName],
        ),
      )
      if (updated.length === 0) {
        this.logger.warn(
          `Accès à bâtir : entité « ${extra.toBuildAccess.entityName} » introuvable sur ${extra.toBuildAccess.accountName} — le statut restera non établi.`,
        )
      }
    }
    // SEMIS-PREUVES 4295.19 (#4016.44) — le coût d'accès « estimé » : un compte source (verrou + coût déclarés)
    // et un compte cible (même verrou, aucun coût). Garde : demo-semis-preuves-20-10.spec.ts.
    const estimate = extra.costEstimate
    const declareAccessFact = async (
      accountName: string,
      kind: 'lock' | 'cost' | 'access_status',
      value: string,
      detail: string,
      daysAgo: number,
    ) => {
      const accountId = accountIds.get(accountName)
      if (!accountId) return
      await this.accounts.manager.query(
        `INSERT INTO access_facts
           (workspace_id, account_id, kind, value, detail, source, provenance, observed_at)
         SELECT $1, $2, $3, $4, $5, 'déclaré dans Bellum', 'human', now() - make_interval(days => $6::int)
          WHERE NOT EXISTS (SELECT 1 FROM access_facts WHERE account_id = $2 AND kind = $3 AND provenance = 'human')`,
        [workspaceId, accountId, kind, value, detail, daysAgo],
      )
    }
    // #4802 — l'état d'accès POSÉ À LA MAIN sur les deux comptes de la démo : le geste de la fiche compte est
    // visible, et les deux ordres d'interlocuteurs (#4271) se voient sans rien déclarer en réunion.
    await declareAccessFact(
      extra.referencedEsn.accountName,
      'access_status',
      'referenced',
      'Une ESN est déjà référencée sur ce compte.',
      12,
    )
    await declareAccessFact(
      extra.toBuildAccess.accountName,
      'access_status',
      'to_build',
      'Le rang 1 est installé ailleurs : l’accès est à bâtir.',
      12,
    )
    await declareAccessFact(
      estimate.source.accountName,
      'lock',
      estimate.lock,
      estimate.lockDetail,
      estimate.source.daysAgo,
    )
    await declareAccessFact(
      estimate.source.accountName,
      'cost',
      estimate.source.cost,
      estimate.source.costDetail,
      estimate.source.daysAgo,
    )
    await declareAccessFact(
      estimate.target.accountName,
      'lock',
      estimate.lock,
      estimate.lockDetail,
      estimate.target.daysAgo,
    )
    const jobAccountId = accountIds.get(extra.jobChange.accountName)
    if (jobAccountId) {
      await this.accounts.manager.query(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, source, stage, stage_entered_at,
            access_mode, confidence, first_detected_at, updated_at)
         SELECT $1, $2, 'signal', $3, $4, 'relation antérieure', 'detected', now(),
                'introduction_relation', 'medium', now() - make_interval(days => $5::int), now()
          WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = $2 AND o.label = $3)`,
        [workspaceId, jobAccountId, extra.jobChange.label, extra.jobChange.detail, extra.jobChange.daysAgo],
      )
    }
  }

  /**
   * #4267 (craft rule 9) — le responsable suit les premiers comptes du jeu, jamais plus que le plafond
   * (`ACCOUNT_FOLLOW_MAX_PER_USER`) : ce sont les comptes que le briefing lit déjà (`take: 3`), et des
   * comptes RÉELS de la salle — un id absent de `accountIds` n'est jamais écrit.
   */
  private async seedAccountFollows(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const followed = DEMO_DOSSIERS.map(dossier => accountIds.get(dossier.account.company_name))
      .filter((id): id is string => Boolean(id))
      .slice(0, ACCOUNT_FOLLOW_MAX_PER_USER)
    if (followed.length === 0) return
    await this.accounts.manager.query(
      `INSERT INTO account_follows (user_id, workspace_id, account_id)
       SELECT $1, $2, unnest($3::uuid[])
       ON CONFLICT (user_id, account_id) DO NOTHING`,
      [ownerUserId, workspaceId, followed],
    )
  }

  /**
   * Théo A signaux (craft rule 9) — LA BIBLIOTHÈQUE D'INFORMATIONS ET SES VEILLES, REMPLIES.
   *
   *  · États : un signal ENREGISTRÉ, un ÉCARTÉ, un à la CORBEILLE, posés sur des faits RÉELS des dossiers semés (la clé
   *    est celle du contrat, `signalStateKey`, appliquée au libellé du signal — jamais un texte inventé pour l'occasion) ;
   *  · Veilles : « Transformation & Data » (active, 3 jours, comptes suivis) et « Actualités <compte> » (en pause,
   *    5 jours) dont le compte n'est PAS suivi : l'écran nomme le compte à suivre à nouveau et l'état « En pause » (#4506).
   *
   * Un id absent de `accountIds` n'est jamais écrit, et chaque ligne est idempotente (`ON CONFLICT` / `NOT EXISTS`).
   */
  private async seedSignalLibrary(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const dossiers = DEMO_DOSSIERS.flatMap(dossier => {
      const id = accountIds.get(dossier.account.company_name)
      return id ? [{ id, name: dossier.account.company_name, signals: dossier.account.recent_signals }] : []
    })
    const withSignals = dossiers.filter(dossier => dossier.signals.length > 0)
    const plan: Array<{ dossier: (typeof dossiers)[number]; at: number; state: 'saved' | 'discarded' | 'trashed' }> = []
    if (withSignals[0]) plan.push({ dossier: withSignals[0], at: 0, state: 'saved' })
    if (withSignals[1]) plan.push({ dossier: withSignals[1], at: 0, state: 'saved' })
    if (withSignals[2]) plan.push({ dossier: withSignals[2], at: 0, state: 'discarded' })
    const trashed = withSignals[0]
    if (trashed && trashed.signals.length > 1)
      plan.push({ dossier: trashed, at: trashed.signals.length - 1, state: 'trashed' })
    // Un signal sans libellé n'a pas de clé (contrainte `signal_user_states_key_len`) : il n'est jamais écrit.
    const writable = plan.filter(item => (item.dossier.signals[item.at]?.signal ?? '').trim() !== '')
    if (writable.length > 0) {
      await this.accounts.manager.query(
        `INSERT INTO signal_user_states (user_id, workspace_id, account_id, signal_key, state)
         SELECT $1, $2, t.account_id, t.signal_key, t.state
           FROM unnest($3::uuid[], $4::text[], $5::text[]) AS t(account_id, signal_key, state)
         ON CONFLICT (user_id, account_id, signal_key) DO NOTHING`,
        [
          ownerUserId,
          workspaceId,
          writable.map(item => item.dossier.id),
          writable.map(item => signalStateKey(item.dossier.signals[item.at]?.signal ?? '')),
          writable.map(item => item.state),
        ],
      )
    }

    const followed = new Set(dossiers.slice(0, ACCOUNT_FOLLOW_MAX_PER_USER).map(dossier => dossier.id))
    const followedDossiers = dossiers.filter(dossier => followed.has(dossier.id))
    const unfollowed = dossiers.find(dossier => !followed.has(dossier.id))
    const writeWatch = async (
      name: string,
      accountIdsOfWatch: string[],
      cadence: string,
      state: 'active' | 'paused',
      keywords: string[],
    ) => {
      if (accountIdsOfWatch.length === 0) return
      await this.accounts.manager.query(
        `INSERT INTO signal_watches (user_id, workspace_id, name, account_ids, natures, keywords, cadence, starts_on, timezone, channel, shared, state)
         SELECT $1, $2, $3, $4::uuid[], '{}'::text[], $5::text[], $6, CURRENT_DATE, 'Europe/Paris', 'in_app', false, $7
          WHERE NOT EXISTS (SELECT 1 FROM signal_watches w WHERE w.user_id = $1 AND w.workspace_id = $2 AND w.name = $3 AND w.archived_at IS NULL)`,
        [ownerUserId, workspaceId, name, accountIdsOfWatch, keywords, cadence, state],
      )
    }
    await writeWatch(
      'Transformation & Data',
      followedDossiers.slice(0, 2).map(dossier => dossier.id),
      '3_days',
      'active',
      ['data', 'transformation'],
    )
    if (unfollowed) {
      await writeWatch(`Actualités ${unfollowed.name}`, [unfollowed.id], '5_days', 'paused', [])
    }
  }

  private async seedTargetLists(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const [firstAccount, secondAccount] = [...accountIds.values()]
    const [firstContact] = [...contactIds.values()]
    if (!firstAccount) return
    const [list] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO target_lists
         (workspace_id, created_by, owner_user_id, name, objective, team, visibility, source, source_query, status, next_action)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        DEMO_TARGET_LIST.name,
        DEMO_TARGET_LIST.objective,
        DEMO_TARGET_LIST.team,
        DEMO_TARGET_LIST.visibility,
        DEMO_TARGET_LIST.source,
        JSON.stringify(DEMO_TARGET_LIST.sourceQuery),
        DEMO_TARGET_LIST.status,
        DEMO_TARGET_LIST.nextAction,
      ],
    )
    if (!list) return
    const [callNext, sendNext, noNext] = DEMO_TARGET_LIST.nextActions
    const [signalReason, reportReason, salonReason] = DEMO_TARGET_LIST.selectionReasons
    const items = [
      {
        account: firstAccount,
        contact: null,
        priority: 'high',
        status: 'ready_to_contact',
        provenance: 'discover',
        next: callNext,
        reason: signalReason,
        removed: false,
      },
      {
        account: secondAccount ?? null,
        contact: null,
        priority: 'medium',
        status: 'in_progress',
        provenance: 'analysis',
        next: sendNext,
        reason: reportReason,
        removed: false,
      },
      {
        account: null,
        contact: firstContact ?? null,
        priority: null,
        status: 'to_review',
        provenance: 'manual',
        next: noNext,
        reason: salonReason,
        removed: false,
      },
      // #2156.31 — une ligne RETIRÉE avec son motif. Elle ne s'affiche plus dans
      // la liste, et c'est précisément ce qu'une suppression aurait perdu.
      {
        account: secondAccount ?? null,
        contact: null,
        priority: null,
        status: 'dropped',
        provenance: 'import',
        next: null,
        reason: null,
        removed: true,
      },
    ].filter(item => item.account ?? item.contact)
    for (const item of items) {
      await this.accounts.manager.query(
        `INSERT INTO target_list_items
           (target_list_id, workspace_id, account_id, contact_id, selection_reason, priority, owner_user_id,
            work_status, provenance, next_action, removed_at, removal_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          list.id,
          workspaceId,
          item.account,
          item.contact,
          item.reason,
          item.priority,
          ownerUserId,
          item.status,
          item.provenance,
          item.next,
          item.removed ? new Date() : null,
          item.removed ? DEMO_TARGET_LIST.removal.reason : null,
        ],
      )
    }
  }

  /**
   * Théo B c2-mes-listes — une liste de contacts « en cours » et une liste ARCHIVÉE, pour que l'onglet Contacts
   * de « Mes listes » et sa ligne « 1 liste archivée » soient pleins. Les contacts sont ceux déjà semés,
   * répartis sans recouvrement : aucune fiche inventée.
   */
  private async seedContactTargetLists(
    workspaceId: string,
    ownerUserId: string,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const contacts = [...contactIds.values()]
    let offset = 0
    for (const spec of DEMO_CONTACT_TARGET_LISTS) {
      const members = contacts.slice(offset, offset + spec.contactCount)
      offset += spec.contactCount
      if (members.length === 0) continue
      const [list] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO target_lists
           (workspace_id, created_by, owner_user_id, name, objective, visibility, source, status, next_action)
         VALUES ($1, $2, $2, $3, $4, 'workspace', 'manual', $5, $6) RETURNING id`,
        [workspaceId, ownerUserId, spec.name, spec.objective, spec.status, spec.nextAction],
      )
      if (!list) continue
      for (const contact of members) {
        await this.accounts.manager.query(
          `INSERT INTO target_list_items
             (target_list_id, workspace_id, contact_id, owner_user_id, work_status, provenance)
           VALUES ($1, $2, $3, $4, 'in_progress', 'manual')`,
          [list.id, workspaceId, contact, ownerUserId],
        )
      }
    }
  }

  /**
   * #3753.7 — le ciblage tiéré d'une ESN, tel qu'un import l'aurait écrit : une
   * liste `source: 'import'`, des éléments `provenance: 'import'` qui portent la
   * LETTRE du tier (`tier_label`), la priorité qui en découle, la raison et les
   * hypothèses du vendeur. Les comptes sont les dossiers déjà semés — aucun
   * compte n'est inventé pour cette liste. L'élément sans tier n'a ni lettre ni
   * priorité : l'écran n'affiche alors aucune ligne de tier.
   */
  private async seedTieredTargetList(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const accounts = [...accountIds.values()]
    if (accounts.length === 0) return
    const [list] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO target_lists
         (workspace_id, created_by, owner_user_id, name, objective, visibility, source, status)
       VALUES ($1, $2, $2, $3, $4, 'workspace', 'import', 'ready') RETURNING id`,
      [workspaceId, ownerUserId, DEMO_TIERED_TARGET_LIST.name, DEMO_TIERED_TARGET_LIST.objective],
    )
    if (!list) return
    const priorityOfTier = { A: 'high', B: 'medium', C: 'low' } as const
    for (const [index, item] of DEMO_TIERED_TARGET_LIST.items.entries()) {
      const account = accounts[index]
      if (!account) break
      const hypotheses =
        item.addressableIssues || item.upcomingItProjects
          ? JSON.stringify({
              addressable_issues: item.addressableIssues,
              upcoming_it_projects: item.upcomingItProjects,
            })
          : null
      await this.accounts.manager.query(
        `INSERT INTO target_list_items
           (target_list_id, workspace_id, account_id, selection_reason, priority, tier_label,
            seller_hypotheses, owner_user_id, work_status, provenance)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'to_review', 'import')`,
        [
          list.id,
          workspaceId,
          account,
          item.reason,
          item.tier ? priorityOfTier[item.tier] : null,
          item.tier,
          hypotheses,
          ownerUserId,
        ],
      )
    }
  }

  /**
   * #2455 — un contexte de travail ENREGISTRÉ, déjà là au premier chargement de
   * « Mes contextes de travail » (`WorkContextsSection.tsx`) : la salle a un
   * seul occupant, toujours propriétaire (#1408), donc rien ne bloque une
   * démonstration personnelle — contrairement à `team_comments`
   * (`DEMO_INTENTIONALLY_EMPTY`, qui suppose une équipe).
   */
  private async seedWorkContext(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO work_contexts
         (workspace_id, owner_user_id, name, visibility, status, sectors, territories, objective)
       VALUES ($1, $2, $3, 'personal', 'enregistre', $4, $5, $6)`,
      [
        workspaceId,
        ownerUserId,
        DEMO_WORK_CONTEXT.name,
        JSON.stringify(DEMO_WORK_CONTEXT.sectors),
        JSON.stringify(DEMO_WORK_CONTEXT.territories),
        DEMO_WORK_CONTEXT.objective,
      ],
    )
  }

  private async seedBridgeContacts(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    for (const bridge of DEMO_BRIDGE_CONTACTS) {
      const accountId = accountIds.get(bridge.account)
      if (!accountId) continue
      await this.accounts.manager.query(
        `INSERT INTO workspace_bridge_contacts
           (workspace_id, account_id, kind, from_user_id, to_user_id, bridged_month)
         VALUES ($1, $2, $3, $4, NULL, date_trunc('month', now() AT TIME ZONE 'UTC')::date)
         ON CONFLICT DO NOTHING`,
        [workspaceId, accountId, bridge.kind, ownerUserId],
      )
    }
  }

  /**
   * #3406 — une salle semée avant que son profil porte un nom n'est jamais
   * rejouée (`seedWorkspace` sort sur `existing > 0`) : « Enregistré par »
   * retombait sur l'e-mail. On ne rétablit QUE le prénom et le nom, QUE s'ils
   * sont tous deux vides — jamais le fuseau ni le reste de l'identité, jamais
   * un nom déjà posé.
   */
  /**
   * #2959 (recette prod 03/10) — une salle OCCUPÉE n'est jamais purgée sous les yeux de son
   * visiteur (voir `DemoResetService`) : celle de la recette gardait son dossier Groupe BPCE
   * d'avant la route calculée, d'où « Route recommandée » absente et « Plan à préciser ».
   * On pose la route SEMÉE sur les comptes de démonstration qui n'en portent pas — jamais
   * par-dessus une route existante, jamais ailleurs que sur un compte de la salle.
   */
  private async backfillRecommendedRoute(workspaceId: string): Promise<void> {
    for (const dossier of DEMO_DOSSIERS) {
      const route = dossier.account.raw_analysis['recommendedRoute']
      if (!route) continue
      await this.accounts.manager.query(
        `UPDATE accounts
            SET raw_analysis = jsonb_set(COALESCE(raw_analysis, '{}'::jsonb), '{recommendedRoute}', $3::jsonb)
          WHERE workspace_id = $1 AND company_name = $2
            AND raw_analysis ->> 'demo_seed' = 'true'
            AND raw_analysis -> 'recommendedRoute' IS NULL`,
        [workspaceId, dossier.account.company_name, JSON.stringify(route)],
      )
    }
  }

  private async nameOwnerIfUnnamed(ownerUserId: string): Promise<void> {
    const owner = await this.profiles.findOne({ where: { user_id: ownerUserId } })
    if (!owner || owner.first_name?.trim() || owner.last_name?.trim()) return
    await this.profiles.update(
      { user_id: ownerUserId },
      { first_name: DEMO_OWNER.first_name, last_name: DEMO_OWNER.last_name },
    )
  }

  private async restoreOwnerIdentity(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.profiles.update(
      { user_id: ownerUserId },
      {
        first_name: DEMO_OWNER.first_name,
        last_name: DEMO_OWNER.last_name,
        // Le FUSEAU de la salle, remis à chaque bail (décision Louis,
        // 14/09/2026) : un visiteur peut le changer pendant sa visite — c'est
        // le geste qu'on veut lui faire faire — et le visiteur suivant ne doit
        // pas hériter du fuseau du précédent.
        timezone: DEMO_OWNER.timezone,
        anonymized_at: null,
      },
    )
    await this.restoreOwnerOnboardingCompletion(ownerUserId)
    await this.seedEsnProfile(workspaceId, ownerUserId)
    await this.seedProfileContext(ownerUserId)
  }

  /**
   * #1921 (13/09/2026, Louis) — L'ONBOARDING DE LA SALLE, TERMINÉ.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * `user_onboarding_state` n'était écrite nulle part par ce service. Une ligne
   * absente vaut `not_started` (`OnboardingService.ensureState`), et
   * `routes/welcome.tsx` redirige vers `/onboarding` tant que le statut n'est
   * pas `completed` — un visiteur de la salle ne pouvait donc jamais atteindre
   * l'écran qui fait parler Laura en premier (« Laisse Laura choisir »).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ICI, ET POURQUOI EN SQL BRUT
   * ─────────────────────────────────────────────────────────────────────────
   * Cette table n'est délibérément PAS purgée entre deux visiteurs —
   * `demo-reset.service.ts` le documente déjà (« purging re-triggers the
   * questionnaire on every visit ») — donc écrire ici, au même endroit que la
   * restauration du nom (`restoreOwnerIdentity`), suffit à la fois pour le tout
   * premier semis d'une salle neuve ET pour rattraper une ligne qui aurait pu
   * être créée à `not_started` par un chargement d'app antérieur au semis. Le
   * SQL brut suit le même motif que `workspace_bridge_contacts`/`storage_objects`
   * plus haut : `user_onboarding_state` n'a pas de repository injecté dans ce
   * service, et lui en ajouter décalerait positionnellement les nombreux specs
   * qui construisent `DemoSeedService(...)` par position.
   *
   * `current_stage_id` reprend EXACTEMENT le stage que `OnboardingService.complete()`
   * pose pour un vrai utilisateur (`transition_summary`) — jamais un stage
   * inventé pour la démo. `ON CONFLICT` réécrit la même ligne à chaque semis :
   * idempotent, sans jamais fabriquer un second propriétaire.
   *
   * ⚠️ Ce geste seul ne suffisait PAS : il donne l'ACCÈS à `/welcome`, pas son
   * contenu. `esn_profiles` restait vide à dessein pour cette raison précise
   * (« c'est l'onboarding qui le remplit ») — devenue fausse dès lors que plus
   * personne n'y passe. Voir {@link seedEsnProfile}, juste en dessous, pour la
   * suite de ce même lot.
   */
  private async restoreOwnerOnboardingCompletion(ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO user_onboarding_state (user_id, current_stage_id, status, skipped_at)
       VALUES (
         $1,
         (SELECT id FROM onboarding_stage_definitions WHERE code = 'transition_summary'),
         'completed',
         NULL
       )
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'completed',
         current_stage_id = EXCLUDED.current_stage_id,
         skipped_at = NULL,
         updated_at = now()`,
      [ownerUserId],
    )
  }

  /**
   * #1921 (13/09/2026, Louis) — LE PROFIL ESN DE LA SALLE, SEMÉ.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * `restoreOwnerOnboardingCompletion` donne l'ACCÈS à `/welcome`, mais
   * `esn_profiles` restait vide — la carte « Ton profil » de cet écran
   * (`toWelcomeProfileSummary.ts`) affichait donc « À compléter » sur ses
   * quatre lignes (nom, taille, expertises, secteurs) à un prospect qui vient
   * d'atteindre un écran présenté comme le fruit d'un questionnaire déjà
   * rempli. La raison d'origine du vide — « c'est l'onboarding qui le remplit »
   * — ne tient plus dès lors que plus personne n'y passe.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI EN SQL BRUT, POURQUOI CE CONTENU, POURQUOI PAS TOUT
   * ─────────────────────────────────────────────────────────────────────────
   * Même motif que {@link restoreOwnerOnboardingCompletion} : pas de
   * repository dédié dans ce service (le constructeur en compte déjà dix-sept,
   * décalés positionnellement dans les specs). `{@link DEMO_ESN_PROFILE}`
   * (`demo-dataset.ts`) porte le détail et la justification de chaque valeur —
   * rien n'y est inventé sans se lire ailleurs dans le jeu de données (le banc
   * de consultants, les six dossiers, la doctrine « un seul occupant »).
   *
   * `workspace_id` + `is_workspace_canonical: true` : cette table est PURGÉE
   * par espace (`DEMO_PURGE_TABLES`), contrairement à `user_onboarding_state`
   * — sans `workspace_id`, la ligne survivrait à une purge sans que le
   * prochain semis la retrouve pour la réécrire, et le prochain visiteur
   * hériterait du profil du précédent (aucun risque ici, le contenu est
   * IDENTIQUE à chaque semis, mais la lecture resterait fausse).
   *
   * ⚠️ `offer_portfolio` (le LEXIQUE de l'espace, D17) N'EST PAS ici, et ne
   * doit jamais l'être : sa propre raison, documentée dans `demo-coverage.ts`
   * (montrer le vocabulaire PAR DÉFAUT du produit), n'a rien à voir avec
   * l'identité de l'ESN et reste entièrement valide.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LOT « LA PARITÉ DÉMO DU QUESTIONNAIRE » (15/09/2026) — COLONNES DÉRIVÉES,
   * PAS RECOPIÉES
   * ─────────────────────────────────────────────────────────────────────────
   * Ce semis ne portait que 10 des 89 clés du questionnaire ({@link
   * DEMO_ESN_PROFILE} n'en portait pas plus) : `demo-coverage.spec.ts` raisonne
   * au niveau TABLE, donc `esn_profiles` restait classée SEEDÉE pendant que 37+
   * colonnes neuves (L15, L19, #2054, #2055) restaient vides — trou fermé par
   * `demo-esn-profile-columns-coverage.spec.ts`.
   *
   * La requête construit désormais ses colonnes et ses paramètres depuis
   * `Object.entries(DEMO_ESN_PROFILE)` plutôt que de les recopier un par un :
   * une colonne ajoutée au jeu de données rejoint le semis SANS toucher cette
   * requête, et il ne peut pas exister de décalage entre la liste de colonnes
   * et la liste de valeurs (les deux viennent du même tableau). Les colonnes
   * `text[]` sont castées automatiquement (`Array.isArray`) ; les neuf colonnes
   * volontairement vides (`offer_portfolio` ci-dessus, et les huit listées dans
   * `DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE`, `demo-coverage.ts`) sont
   * simplement ABSENTES de {@link DEMO_ESN_PROFILE} — jamais insérées, jamais
   * écrasées, la base garde leur défaut (`NULL` / `'{}'`).
   */
  /**
   * #2582 — LE CAST SE DÉCIDE SUR LE TYPE DE LA COLONNE, JAMAIS SUR LA FORME DE
   * LA VALEUR.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ EN PRODUCTION (18/09/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * Le placeholder se choisissait avec `Array.isArray(value) ? '::text[]' : ''`.
   * Un prédicat qui lit la forme JS ne peut pas distinguer un tableau de CHAÎNES
   * (colonne `text[]`) d'un tableau d'OBJETS (colonne `jsonb`). `esn_objectives`
   * est le second, et la base a rendu, à chaque visite de la salle :
   *
   *   column "esn_objectives" is of type jsonb but expression is of type text[]
   *
   * Cette écriture est la PREMIÈRE du semis. Elle jetait donc avant toute autre,
   * `tidy()` avalait l'exception pour ne pas fermer la porte (c'est son rôle), et
   * le prospect entrait dans une salle VIDE : zéro compte, zéro mission, zéro
   * talent, zéro besoin. Le lien de démonstration — la seule surface publique du
   * produit — ne montrait plus rien, sans qu'aucun 500 ne le signale.
   *
   * La correction ne rend pas le prédicat plus malin : elle lui retire la
   * question. C'est la COLONNE qui sait son type, et TypeORM la connaît déjà.
   * Quatre colonnes de `esn_profiles` sont `jsonb` (`answer_meta`,
   * `esn_objectives`, `offer_portfolio`, `profile_provenance`) ; une cinquième
   * ajoutée demain sera traitée juste sans que personne y pense.
   */
  private async seedEsnProfile(workspaceId: string, ownerUserId: string): Promise<void> {
    const entries = Object.entries(DEMO_ESN_PROFILE) as ReadonlyArray<[string, unknown]>
    const columns = entries.map(([column]) => column)
    const { placeholders, values } = buildEsnProfileBindings(entries, esnProfileColumnType)
    const assignments = columns.map(column => `${column} = EXCLUDED.${column}`)

    await this.accounts.manager.query(
      `INSERT INTO esn_profiles (
         user_id, workspace_id, version, is_current, is_workspace_canonical,
         ${columns.join(', ')}
       )
       VALUES (
         $1, $2, 1, true, true,
         ${placeholders.join(', ')}
       )
       ON CONFLICT (user_id, version) DO UPDATE SET
         workspace_id = EXCLUDED.workspace_id,
         is_current = true,
         is_workspace_canonical = true,
         ${assignments.join(',\n         ')},
         updated_at = now()`,
      [ownerUserId, workspaceId, ...values],
    )

    // Métiers placés DÉDUITS (11/10/2026, craft rule 9) — la vraie déduction sur
    // le contexte semé (`DEMO_INFERRED_PLACED_ROLES`), écrite À CÔTÉ du déclaré.
    // Horodatée maintenant : l'écran les sert tels quels, avec leurs indices.
    await this.accounts.manager.query(
      `UPDATE esn_profiles SET inferred_placed_roles = $1::jsonb, inferred_placed_roles_at = now(), dismissed_inferred_roles = '{}'
        WHERE user_id = $2 AND version = 1`,
      [JSON.stringify(DEMO_INFERRED_PLACED_ROLES), ownerUserId],
    )

    // #3238.8 — seul réglage du portefeuille d'offre semé (voir
    // `DEMO_SOLD_SENIORITY_LEVELS`) ; le lexique reste vide, donc le
    // vocabulaire par défaut du produit. Passe par le schéma du contrat : la
    // forme écrite est celle que le service d'écriture écrirait.
    await this.accounts.manager.query(
      `UPDATE esn_profiles SET offer_portfolio = $3::jsonb WHERE user_id = $1 AND workspace_id = $2 AND version = 1`,
      [
        ownerUserId,
        workspaceId,
        JSON.stringify(offerPortfolioSchema.parse({ sold_seniority_levels: [...DEMO_SOLD_SENIORITY_LEVELS] })),
      ],
    )
  }

  /**
   * #2075 — LE CONTEXTE DE PROFIL (sortie du Profileur), SEMÉ.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * DEUX OBJETS, PAS UN SEUL
   * ─────────────────────────────────────────────────────────────────────────
   * {@link seedEsnProfile} sème les RÉPONSES BRUTES au questionnaire
   * (`esn_profiles`) — c'est ce que lit `/welcome`. L'audit commercial
   * (`/settings/profile/audit`) lit un objet DIFFÉRENT : la lecture DÉRIVÉE que
   * produit le Profileur (`profiles.profile_context`), jamais seedée avant ce
   * lot — l'écran s'ouvrait donc vide en démo, le second câble coupé nommé par
   * l'écrivain de la page.
   *
   * `{@link DEMO_PROFILE_CONTEXT}` (`demo-dataset.ts`) porte le détail de
   * chaque champ et sa justification. Comme {@link seedEsnProfile}, ce geste
   * RÉTABLIT à chaque semis neuf plutôt que d'écrire une fois : `profiles`
   * n'est jamais purgée par espace (voir `demo-reset.service.ts`), mais
   * `profile_context_revisions` L'EST par UTILISATEUR
   * (`DEMO_PURGE_USER_TABLES`) à chaque reprise de bail — sans réécriture ici,
   * l'entête de l'écran retomberait sur « Aucune version enregistrée » dès le
   * second visiteur.
   *
   * D9 (décision Louis 14/09/2026, valider le contexte commercial) — VALIDÉ,
   * plus « succeeded ». La raison d'avant tenait pour un compte réel (« un
   * contexte fraîchement resemé n'a pas encore été relu par personne ») :
   * elle ne tient plus ici, parce que le geste de validation
   * (`POST /profile-context/validate`, bouton « Valider » sur
   * `/settings/profile/audit`) est lui-même une capacité livrée qu'un
   * prospect doit pouvoir VOIR, pas seulement actionner — un écran qui ne
   * montre jamais l'état « Validé le … par … » ne le vend pas. La salle de
   * démonstration est un décor rétabli à chaque bail, jamais un historique :
   * la dater d'hier n'y ment à personne.
   *
   * #2084.14 — L'INSTANTANÉ EST DATÉ « ANCIEN », DÉLIBÉRÉMENT.
   *
   * `AuditHero` (`/settings/profile/audit`) nomme désormais l'état « cet
   * audit date du … » au-delà d'`AUDIT_STALE_AFTER_DAYS` (180 jours,
   * `apps/web/.../commercial-audit/lib/audit-freshness.ts`, GA-26). Sans
   * `created_at` explicite ici, l'INSERT retombait sur le défaut SQL —
   * l'instant du semis — donc toujours FRAIS : la bannière et son geste
   * existant (`requestRefresh`, Réglages › Profil) restaient invisibles en
   * démo, prouvés seulement par un test unitaire. `AUDIT_REVISION_AGE_DAYS`
   * la date à plus de 200 jours pour rester sûrement au-delà du seuil même
   * si celui-ci change un jour.
   */
  private async seedProfileContext(ownerUserId: string): Promise<void> {
    const ctx = DEMO_PROFILE_CONTEXT
    const day = 24 * 60 * 60 * 1000
    const AUDIT_REVISION_AGE_DAYS = 220
    await this.profiles.update(
      { user_id: ownerUserId },
      {
        profile_context: ctx,
        profile_context_status: 'validated',
        profile_context_version: 1,
        profile_context_validated_at: new Date(Date.now() - day),
        // #2010.17 — la même invariant que `validate()` : la version validée
        // est TOUJOURS celle qui vient d'être stampée `validated_at` ci-dessus.
        last_validated_context_version: 1,
        // #2073.8 — LA STRATÉGIE CHOISIE, DÉLIBÉRÉMENT DIFFÉRENTE DE LA
        // CALCULÉE (`ctx.idealAccountProfile.entryStrategy` = `bottomUp`).
        // Une salle qui sème les deux champs à la MÊME valeur ne prouverait
        // rien : un visiteur ne pourrait pas distinguer « le champ choisi
        // fonctionne » de « seul le champ calculé s'affiche ». `multiThread`
        // montre les DEUX badges sur des cartes différentes (« Recommandée »
        // sur l'entrée par le terrain, « Stratégie retenue » sur l'entrée
        // sur plusieurs fils) et fait lire la conséquence « accounts »
        // (`AuditConsequences`) sur la voie CHOISIE — la preuve que #2073.11
        // fait bien entrer le champ choisi là où le calculé entrait.
        chosen_entry_strategy: 'multiThread',
        // #2074.16 — UNE SEULE des deux ruptures que ce semis déclenche
        // (`tooManySimultaneousMarkets`/`keyAccountsWithoutAccessPath`, voir
        // `demo-audit-first-moves-coverage.spec.ts`) porte une décision.
        // Semer les DEUX à `valide` cacherait le badge « Proposé » par
        // défaut — même raison que `chosen_entry_strategy` ci-dessus : la
        // salle doit voir les DEUX états, pas un seul répété. `ruleId` =
        // `AuditMove.ruleId`, même clé que lit `AuditFirstMoves.tsx`.
        audit_move_decisions: {
          tooManySimultaneousMarkets: { status: 'valide', decidedAt: new Date(Date.now() - day).toISOString() },
        },
      },
    )
    await this.accounts.manager.query(
      `INSERT INTO profile_context_revisions (user_id, version, schema_version, profile_context, created_at)
       VALUES ($1, 1, $2, $3::jsonb, $4)
       ON CONFLICT (user_id, version) DO UPDATE SET
         schema_version = EXCLUDED.schema_version,
         profile_context = EXCLUDED.profile_context,
         created_at = EXCLUDED.created_at`,
      [
        ownerUserId,
        PROFILE_CONTEXT_SCHEMA_VERSION,
        JSON.stringify(ctx),
        new Date(Date.now() - AUDIT_REVISION_AGE_DAYS * day),
      ],
    )
    // #2075.12 / #2075.13 (épopée #2774) — UNE note de chaque genre, pour que
    // la salle prouve les DEUX gestes plutôt qu'un seul répété (même principe
    // que `audit_move_decisions` juste au-dessus) : un commentaire sur le
    // VERDICT (`target_key: 'verdict'`, même clé que `AuditVerdict.tsx`), un
    // refus sur la colonne « Arrêter » (`target_key: 'stop'`, même clé que
    // `AuditDecisionColumns.tsx`).
    // #2075.14 (épopée #2880, lot V33) — et UN bloc validé seul (« Prioriser
    // les bons comptes », `consequence:accounts`, même clé que
    // `AuditConsequences.tsx`) : la salle montre un bloc validé à côté de
    // cinq qui ne le sont pas encore.
    await this.accounts.manager.query(
      `INSERT INTO commercial_audit_feedback (workspace_id, user_id, target_key, kind, comment_text, created_at)
       VALUES
         (NULL, $1, 'verdict', 'comment', 'On en a déjà parlé en comité — je garde un œil dessus.', $2),
         (NULL, $1, 'stop', 'refused', NULL, $2),
         (NULL, $1, 'consequence:accounts', 'validated', NULL, $2)`,
      [ownerUserId, new Date(Date.now() - day)],
    )
  }

  /**
   * #2123.46/#2123.47 (16/09/2026, parité démo) — LES TÂCHES DU PLAN
   * D'ACTION, SEMÉES POUR L'ÉCRAN `/actions`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ, ET POURQUOI IL EST INVISIBLE AUX DEUX GARDES DE TÊTE DE
   * `demo-coverage.ts`
   * ─────────────────────────────────────────────────────────────────────────
   * `GET /plan-items/mine` (branché le 16/09/2026 côté écran, `MyPlanTasks`)
   * était prête et testée côté API, et `action_plan_items` ne portait AUCUNE
   * ligne dans le jeu de démo : le widget se serait ouvert vide sur le lien
   * public. Même angle mort que {@link seedProfileContext} ci-dessus :
   * `action_plan_items` est purgée par UTILISATEUR (`DEMO_PURGE_USER_TABLES`,
   * `demo-reset.service.ts`), jamais par espace, donc ni le leak guard
   * `workspace_id` ni la couverture PAR TABLE de `demo-coverage.spec.ts` (qui
   * ne lit que `DEMO_PURGE_TABLES`) ne peuvent la voir par construction. La
   * classer dans l'une ou l'autre ferait échouer « ne classe que des tables
   * réellement purgées » — même raison, documentée en détail dans
   * `demo-coverage.ts` juste avant `DEMO_SEEDED_TABLES`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ICI, ET PAS DANS `restoreOwnerIdentity`
   * ─────────────────────────────────────────────────────────────────────────
   * `profile_context` (ci-dessus) et `esn_profiles` sont scopés à
   * l'UTILISATEUR SEUL — aucune colonne `account_id` — donc `restoreOwnerIdentity`
   * peut les écrire avant que le premier compte existe. `action_plan_items`
   * porte une colonne `account_id` NON NULLABLE : elle a besoin d'un compte
   * RÉEL, et {@link seedWorkspace} n'en a encore créé aucun au moment où
   * `restoreOwnerIdentity` tourne. Ce geste est donc appelé depuis
   * `seedCompanionData`, une fois `accountIds` peuplé par la boucle sur
   * {@link DEMO_DOSSIERS} — le même besoin (« LIT `accountIds` ») que
   * `DEMO_USER_ACTIONS` juste plus bas.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE CONTENU : MÊME FORME QUE LA PORTE `POST /plan-items`
   * ─────────────────────────────────────────────────────────────────────────
   * Chaque ligne reprend EXACTEMENT les colonnes que
   * {@link ActionPlanItemsService.createManual} écrit pour une action
   * manuelle du formulaire du plan (`week_index = MANUAL_ACTION_WEEK_INDEX`,
   * `source: 'human'`, `execution_status: 'todo'`) — la salle de démonstration
   * ne fabrique pas un second chemin, elle sème le résultat du même geste
   * qu'un commercial ferait à la main. {@link DEMO_PLAN_TASKS} porte le détail
   * de chaque tâche et sa raison, en particulier POURQUOI l'une des trois n'a
   * aucune échéance et une autre est en retard.
   *
   * Aucune écriture en `ON CONFLICT` : contrairement à `profile_context` (clé
   * naturelle `(user_id, version)`), un `action_plan_item` n'a pas de clé
   * naturelle en dehors de son UUID généré, et ce geste ne tourne que sur une
   * salle qui vient d'être vidée de ses comptes (donc de ses anciennes lignes,
   * purgées AVANT `accounts` par `DEMO_PURGE_USER_TABLES` — voir
   * `demo-reset.service.ts`) : il ne peut pas y avoir de doublon à fusionner.
   */
  private async seedPlanTasks(
    ownerUserId: string,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    // Une seule bande de position par compte (`MANUAL_ACTION_WEEK_INDEX`),
    // exactement comme `createManual` : le pas s'incrémente PAR COMPTE, pas
    // globalement, pour rester lisible si {@link DEMO_PLAN_TASKS} porte un
    // jour deux tâches sur le même dossier.
    const stepByAccount = new Map<string, number>()
    for (const task of DEMO_PLAN_TASKS) {
      const accountId = accountIds.get(task.company)
      if (!accountId) continue
      const stepIndex = stepByAccount.get(accountId) ?? 0
      stepByAccount.set(accountId, stepIndex + 1)
      const dueDate =
        task.dueInDays === null ? null : new Date(now + task.dueInDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      // #2715.1 — le `contact_id`, quand la tâche en nomme un (SNCF
      // LOGISTIQUE/Directeur technique — entité numérique voyageurs) : c'est la colonne que
      // `ActionPlanItemsService.withSendStatus` lit pour rattacher un envoi
      // vérifié à CET item plutôt qu'au compte entier.
      const contactId = task.contact ? (contactIds.get(task.contact) ?? null) : null
      // #2396.1 (24/09/2026) — une tâche FAITE porte son mode de complétion et
      // sa date de complétion RELATIVE au semis (`completedDaysAgo`, jamais
      // une date en dur). `null`/`'todo'` sur les sept tâches d'origine,
      // restées ouvertes à l'identique.
      const isDone = task.executionStatus === 'done'
      const completedAt = isDone
        ? task.completedSlot
          ? lastSlotInstant(now, task.completedSlot)
          : new Date(now - (task.completedDaysAgo ?? 0) * 24 * 60 * 60 * 1000)
        : null
      await this.accounts.manager.query(
        `INSERT INTO action_plan_items (
           user_id, account_id, source_plan_id, label, week_index, step_index,
           done, execution_status, snoozed_until, assigned_to, owner_name,
           contact_id, cadence_step, target_kind, target_id, target_label,
           reason, depends_on_item_id, source, source_at, confidence,
           cost_credits, due_date, completed_at, last_reminded_on,
           expected_outcome, kpi, completion_mode, outcome, channel, stop_condition,
           method_rule
         )
         VALUES (
           $1, $2, NULL, $3, $4, $5,
           $10, $11, NULL, NULL, $6,
           $20, $19, NULL, NULL, NULL,
           $18, NULL, 'human', now(), NULL,
           NULL, $7, $12, NULL,
           $8, $9, $13, $14, $15, $16,
           $17
         )`,
        // #2123.46 — le résultat attendu et l'indicateur, dans LEURS colonnes
        // (`1795380046123`), comme `createManual` les écrit. #2396.1 — le
        // mode de complétion et l'issue, `null` sur les tâches restées
        // ouvertes. `contactId` reste EN DERNIER (des tests le lisent par
        // `.at(-1)`).
        [
          ownerUserId,
          accountId,
          task.label,
          MANUAL_ACTION_WEEK_INDEX,
          stepIndex,
          task.ownerName,
          dueDate,
          task.expectedOutcome,
          task.kpi,
          isDone,
          isDone ? 'done' : 'todo',
          completedAt,
          task.completionMode ?? null,
          task.outcome ?? null,
          // #3289 — le canal (colonne `channel`), `null` sur les tâches d'origine.
          task.channel ?? null,
          // #3287 (#3265.2) — la condition d'arrêt de CETTE action, `null` sinon.
          task.stopCondition ?? null,
          // #3274.4 — la règle du corpus méthode, `null` sauf sur le scénario « règle
          // contredite ».
          task.methodRule ?? null,
          // #4163 LF — le « pourquoi » de la relance (`reason`), `null` quand aucune n'est écrite.
          task.reason ?? null,
          // #4418 — la touche de cadence (`relance`…) d'une relance issue d'un « Marquer envoyé »,
          // `null` sur les actions saisies à la main. `contactId` reste EN DERNIER.
          task.cadenceStep ?? null,
          contactId,
        ],
      )
    }
  }

  /**
   * #3068 — L'INTERRUPTION DÉCLARÉE ET PAS ENCORE CONFIRMÉE, SEMÉE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * `deriveStaffing` (`@bellum/contracts`) rend `a_confirmer` — badge
   * « Interruption à confirmer » sur `TalentAvailabilityBadge`, dans le
   * vivier `/consultants` — dès qu'une affectation porte
   * `interruptionUnconfirmed: true`, LU sur `mission_interruptions
   * .availability_confirmed = false` (`unconfirmedInterruptionMissionIds`,
   * `apps/api/src/common/mission-interruptions.ts`). Avant ce lot, AUCUNE
   * ligne `mission_interruptions` n'existait dans le jeu de démo : le
   * prédicat existait, testé, câblé sur trois services (`staffing.service.ts`,
   * `talent.service.ts`, `matching.service.ts`) — et ne produisait jamais son
   * état en salle (craft rule n°9).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE MISSION, ET POURQUOI SON STATUT NE CHANGE PAS
   * ─────────────────────────────────────────────────────────────────────────
   * Rattachée à « Cadrage données transport — lot 2 » (Inès Kaczmarek) —
   * aucune autre garde de démonstration ne lit sa disponibilité DÉRIVÉE
   * (`demo-planning-coverage.spec.ts` ne teste la surallocation que sur Yanis
   * Berthier ; `demo-no-defendable-profile-coverage.spec.ts` fige
   * `derivedAvailability: 'unknown'` à la main pour les sept profils, jamais
   * une reconstitution de leurs affectations réelles).
   *
   * `MissionInterruptionPanel` (fiche mission) ne s'affiche que sur une
   * mission `status: 'terminated'`, et aucune des dix missions de la salle ne
   * porte ce statut (voir `demo-coverage.ts`, `mission_interruptions`) — en
   * changer une romprait la surallocation de Yanis Berthier, le bon de
   * commande manquant du `renewal_status` de cette même mission, et une
   * dizaine de gardes qui la citent par son statut exact. Le prédicat visé
   * ici lit `mission_assignments` × `mission_interruptions`, jamais le statut
   * de la mission : semer la ligne SANS toucher au statut livre exactement le
   * geste empêché (le badge du vivier), sans rouvrir un chantier plus large
   * que #3068.
   *
   * `availability_confirmed` reste à `false` (défaut de la table) : c'est
   * L'ÉTAT VISÉ, pas une valeur en attente d'un second geste que la salle ne
   * pourrait jamais rejouer.
   */
  private async seedMissionInterruption(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
  ): Promise<void> {
    const missionId = missionIds.get('Cadrage données transport — lot 2')
    if (!missionId) return
    await this.accounts.manager.query(
      `INSERT INTO mission_interruptions
         (workspace_id, mission_id, responsibility, risk, confidentiality_acknowledged,
          non_solicitation_acknowledged, note, declared_by)
       VALUES ($1, $2, $3, $4, true, true, $5, $6)`,
      [
        workspaceId,
        missionId,
        'client',
        'moyen',
        'Le client a suspendu le lot données sans date de reprise annoncée ; la disponibilité du consultant reste à reconfirmer avant tout nouveau placement.',
        ownerUserId,
      ],
    )
  }

  /**
   * #2151.70 (16/09/2026, décision Louis) — LA CLOCHE, SEMÉE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * `notifications` n'était semée NULLE PART en démo, et elle n'était NI dans
   * `DEMO_SEEDED_TABLES` NI dans `DEMO_INTENTIONALLY_EMPTY`
   * (`demo-coverage.ts`) : une garde AVEUGLE, pas une exemption —
   * `demo-coverage.spec.ts` ne lisait que les tables scopées `workspace_id`,
   * et `notifications` est scopée `user_id` (`DEMO_PURGE_USER_TABLES`). Les
   * TROIS réglages de la cloche étaient déjà visibles et actionnables en
   * démo ; c'est le CONTENU qui manquait — un visiteur ouvrait le dropdown
   * sur « Aucune notification ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LES DIX TYPES, MESURÉS — PAS DEVINÉS
   * ─────────────────────────────────────────────────────────────────────────
   * `notificationTypeSchema` (`@bellum/contracts/schemas/notifications.ts`) en
   * compte DIX, pas treize : `buy_signal`, `weekly_summary`, `weekly_digest`,
   * `daily_digest`, `relance`, `credit_low`, `action_overdue`, `changelog`,
   * `system`, `discover_alert`. Un exemplaire de CHACUN, dans le vocabulaire
   * et la forme exacts que chaque producteur écrit en production
   * (`notifications.service.ts`, `notifications.scheduler.ts`,
   * `weekly-digest.service.ts`, `daily-digest.service.ts`,
   * `discover-alert.service.ts`, `session-registry.service.ts`) — jamais un
   * mot inventé pour occuper la ligne.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CES COMPTES, POURQUOI CES DATES
   * ─────────────────────────────────────────────────────────────────────────
   * Rien n'est un univers parallèle : Société Générale, Groupe BPCE et SNCF
   * sont les trois dossiers de {@link DEMO_DOSSIERS} déjà seedés — le signal
   * SNCF reprend même le premier `sncfSignals[0]` mot pour mot. Les dates sont RELATIVES à l'instant du semis
   * (`Date.now() - …`), jamais en dur : une salle est prêtée trente minutes,
   * et une notification datée « 12 septembre » serait fausse le 13.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ TENSION ASSUMÉE SUR `credit_low`
   * ─────────────────────────────────────────────────────────────────────────
   * `DEMO_BILLING_ANNOUNCEMENTS_INTENTIONALLY_SILENT.credits_low`
   * (`demo-coverage.ts`) documente que `GET /credits` rend TOUJOURS
   * `credits_low: false` en démo — aucun abonnement, aucun cycle, rien à
   * mesurer, et un bandeau de facturation inventé sur un lien public serait
   * la donnée fictive que ce jeu s'interdit. La cloche montre pourtant un
   * exemplaire du type `credit_low` : c'est un ÉVÉNEMENT PASSÉ (marqué lu,
   * daté à 9 jours), au même titre que les neuf autres — une illustration de
   * ce à quoi ce type de message ressemble, pas une jauge de facturation
   * relue à chaque ouverture. Un visiteur qui irait comparer avec l'écran
   * Facturation n'y verrait aucun mur — c'est la même distinction que le
   * produit fait déjà partout ailleurs entre un ÉVÉNEMENT ponctuel et un
   * ÉTAT recalculé en direct. Signalé à Louis dans le rapport de ce lot,
   * pas tranché en silence.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI EN SQL BRUT
   * ─────────────────────────────────────────────────────────────────────────
   * Même motif que {@link restoreOwnerOnboardingCompletion} et
   * {@link seedProfileContext} : pas de repository `NotificationEntity`
   * injecté dans ce service, et lui en ajouter décalerait positionnellement
   * les nombreux specs qui construisent `DemoSeedService(...)` par position.
   * Pas d'`ON CONFLICT` : `notifications` est purgée à chaque bail
   * (`DEMO_PURGE_USER_TABLES`), donc systématiquement vide quand ce semis
   * tourne — contrairement à `profile_context_revisions`, dont le parent
   * (`profiles`) n'est jamais purgé.
   */
  private async seedNotifications(
    ownerUserId: string,
    accountIds: Map<string, string>,
    workspaceId: string,
  ): Promise<void> {
    const HOUR = 60 * 60 * 1000
    const DAY = 24 * HOUR
    const ago = (ms: number): Date => new Date(Date.now() - ms)
    // Une date de CALENDRIER (pour « échéance dépassée (2026-09-13) »),
    // relative comme le reste — jamais le littéral d'un jour fixe.
    const calendarDaysAgo = (days: number): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(ago(days * DAY))

    const sncfId = accountIds.get('SNCF') ?? null
    const societeGeneraleId = accountIds.get('Société Générale') ?? null
    // #3920.crm — les faits CRM de la salle, tels que `seedCrmDeals` les consigne.
    const crmFacts = buildDemoCrmDeals(new Date()).signals.map(signal => signal.evidence)

    type SeedRow = {
      type: NotificationType
      title: string
      body: string
      link: string | null
      origin: 'proactive' | 'user_triggered'
      createdAt: Date
      readAt: Date | null
      // #2404.3 — optionnel : une ligne SANS priorité garde `level: null`
      // (`notificationLevelFor`, ci-dessous), exactement le cas que l'écran
      // doit rendre sans jamais l'afficher « Information ».
      priority?: number
      // #2404.7 — optionnel : une ligne sans source nommée garde `source: null`
      // (GA-18/GA-19) — la démonstration ne fabrique une source que là où le
      // produit réel en fournirait une (la messagerie CONNECTÉE, jamais un de
      // nos fournisseurs).
      source?: string | null
      // #3922.n — le lien vérifiable du signal cité, le MÊME que celui du signal
      // semé (`demoSourceUrl`, domaine réservé `example.org`) : la cloche porte
      // sa preuve comme le produit réel le fait désormais.
      sourceUrl?: string | null
      sourceKind?: 'press' | 'bodacc' | 'job' | 'official' | null
    }

    const rows: SeedRow[] = [
      // #4158.28 — le digest du lundi : la synthèse d'équipe, en dénombrements (aucun nom, aucune
      // probabilité), comme `ManagerDigestService` la dépose. Lien : le tableau d'équipe.
      {
        type: 'manager_digest',
        title: DEMO_MANAGER_DIGEST.title,
        body: DEMO_MANAGER_DIGEST.body,
        link: DEMO_MANAGER_DIGEST.link,
        origin: 'proactive',
        createdAt: ago(5 * HOUR),
        readAt: null,
      },
      // #2151.61/#2151.23 — la capacité a une garde SPÉCIFIQUE (Découvrir), et
      // ici c'est le RAPPEL DE CADENCE d'une recherche enregistrée — un canal
      // différent, jamais seedé ailleurs. Aucun corps : `discover-alert.service.ts`
      // n'en écrit pas non plus (`title` + `link` + `origin: 'proactive'` seuls).
      {
        type: 'discover_alert',
        title: 'Recherche « Aéronautique & Défense — Île-de-France » à rejouer',
        body: '',
        link: '/discover',
        origin: 'proactive',
        createdAt: ago(3 * HOUR),
        readAt: null,
      },
      // Reprend `sncfSignals[0].signal` mot pour mot (`demo-dataset.ts`) —
      // le même signal que porte déjà le dossier SNCF.
      {
        type: 'buy_signal',
        title: 'Nouveau signal — SNCF',
        body: 'Partenariat de trois ans avec l’Institut Polytechnique de Paris sur l’IA, les données, la robotique, la maintenance prédictive et les jumeaux numériques (+2 autres)',
        // #3922.7 — mène à la VEILLE, où chaque signal porte son lien vers la preuve.
        link: sncfId ? `/accounts/${sncfId}?tab=veille` : null,
        origin: 'user_triggered',
        createdAt: ago(6 * HOUR),
        readAt: null,
        // #2404.3 — la démonstration montre le niveau NOMMÉ le plus haut sur
        // le signal le plus visible de la salle (SNCF).
        priority: 82,
        // #2404.7 — rattrapé le 21/09/2026 : `notifyBuySignalForAccount`
        // relaie maintenant `recent_signals[0].source`. Reprend
        // `sncfSignals[0].source` mot pour mot (`demo-dataset.ts`), comme
        // le produit réel le ferait désormais pour ce même compte.
        source: 'Communiqué de presse',
        sourceUrl: demoSourceUrl('press', 'sncf-1'),
        sourceKind: 'press',
      },
      // #3920.1 (craft rule n°9) — UNE alerte par SOURCE, pas seulement la presse : une annonce
      // BODACC, un événement du registre officiel, une offre lue sur une page carrières. Chaque
      // `body` reprend un signal de `demo-dataset.ts` mot pour mot, `source` est le nom lisible
      // que le produit réel afficherait (un registre public ou le site du compte — jamais un de
      // nos fournisseurs), et le lien mène à la veille où ce signal porte sa preuve cliquable.
      {
        type: 'buy_signal',
        title: 'Nouveau signal — Société Générale',
        body: 'Augmentation de capital publiée au registre',
        link: societeGeneraleId ? `/accounts/${societeGeneraleId}?tab=veille` : null,
        origin: 'user_triggered',
        createdAt: ago(8 * HOUR),
        readAt: null,
        priority: 60,
        source: 'Annonces légales officielles',
        sourceUrl: demoSourceUrl('bodacc', 'sg-3'),
        sourceKind: 'bodacc',
      },
      {
        type: 'buy_signal',
        title: 'Nouveau signal — SNCF',
        body: 'Nouvel établissement — Lyon (siège régional Auvergne-Rhône-Alpes)',
        link: sncfId ? `/accounts/${sncfId}?tab=veille` : null,
        origin: 'user_triggered',
        createdAt: ago(9 * HOUR),
        readAt: null,
        priority: 55,
        source: 'Registre officiel des entreprises (Sirene)',
        sourceUrl: demoSourceUrl('official', 'sncf-etablissement-lyon'),
        sourceKind: 'official',
      },
      {
        type: 'buy_signal',
        title: 'Nouveau signal — SNCF',
        body: 'Offre publiée sur la page carrières : Architecte cloud — Saint-Denis',
        link: sncfId ? `/accounts/${sncfId}?tab=veille` : null,
        origin: 'user_triggered',
        createdAt: ago(11 * HOUR),
        readAt: null,
        priority: 50,
        source: 'Page carrières du groupe',
        sourceUrl: demoSourceUrl('job', 'sncf-architecte-cloud'),
        sourceKind: 'job',
      },
      // #3920.crm (lot M01, 09/10) — la source CRM : UNE alerte pour les affaires de Société Générale
      // (`DEMO_CRM_DEALS`), dont le texte est le fait que les MÊMES règles que la production en tirent
      // (`buildDemoCrmDeals`, même ordre que le balayage), même forme que
      // `NotificationsService.notifyCrmSignalsForAccount`. Source « Votre CRM » : la capacité, jamais l'éditeur.
      ...(societeGeneraleId && crmFacts.length > 0
        ? [
            {
              type: 'buy_signal' as const,
              title: 'Nouveau signal — Société Générale',
              body: `${crmFacts[0]}${crmFacts.length > 1 ? ` (+${crmFacts.length - 1} autre${crmFacts.length > 2 ? 's' : ''})` : ''}`,
              link: `/accounts/${societeGeneraleId}?tab=veille`,
              origin: 'user_triggered' as const,
              createdAt: ago(12 * HOUR),
              readAt: null,
              priority: 50,
              source: 'Votre CRM',
            },
          ]
        : []),
      {
        type: 'action_overdue',
        title: '2 actions en retard',
        body: `« Envoyer la proposition commerciale » (Groupe BPCE) — échéance dépassée (${calendarDaysAgo(3)}), +1 autre.`,
        link: '/dashboard',
        origin: 'user_triggered',
        createdAt: ago(15 * HOUR),
        readAt: null,
        // #2404.3 — un second niveau, plus bas, pour que la démonstration
        // montre l'ÉCHELLE plutôt qu'une seule valeur.
        priority: 40,
      },
      {
        type: 'relance',
        title: 'Relance en retard — Société Générale',
        body: `Relancer après le comité budgétaire — échéance dépassée (${calendarDaysAgo(2)}).`,
        link: societeGeneraleId ? `/accounts/${societeGeneraleId}` : null,
        origin: 'user_triggered',
        createdAt: ago(24 * HOUR),
        readAt: ago(20 * HOUR),
      },
      // Zéro producteur en production aujourd'hui (voir le docblock de
      // `notificationTypeSchema`) : la seule annonce ci-dessous est un fait
      // RÉEL du produit — les alertes Découvrir ont livré le 15/09/2026,
      // hier — jamais un jalon interne inventé pour remplir la ligne.
      {
        type: 'changelog',
        title: 'Nouveau : les alertes de recherches enregistrées',
        body: 'Découvrir peut désormais te prévenir quand une recherche enregistrée arrive à sa cadence — plus besoin d’y repenser.',
        link: null,
        origin: 'user_triggered',
        createdAt: ago(28 * HOUR),
        readAt: ago(27 * HOUR),
      },
      {
        type: 'daily_digest',
        title: 'Votre veille du jour : 3 signaux sur 2 comptes',
        body: '3 signaux détectés aujourd’hui sur 2 comptes suivis. En tête : SNCF.',
        link: '/dashboard',
        origin: 'user_triggered',
        createdAt: ago(30 * HOUR),
        readAt: ago(29 * HOUR),
      },
      // Reprend `session-registry.service.ts` mot pour mot (alerte de
      // partage de session) — le seul exemple de `system` qui ne demande
      // aucune ligne de plus (pas de demande d'approbation en attente à
      // fabriquer).
      {
        type: 'system',
        title: 'Connexions simultanées détectées',
        body: 'Votre compte est utilisé depuis plusieurs appareils et lieux en même temps. Si votre équipe partage cet accès, ajoutez un siège pour rester en règle.',
        link: '/settings/team',
        origin: 'user_triggered',
        createdAt: ago(2 * DAY),
        readAt: ago(2 * DAY - HOUR),
      },
      {
        type: 'weekly_digest',
        title: 'Votre veille de la semaine : 5 signaux sur 3 comptes',
        body: '5 signaux détectés cette semaine sur 3 comptes suivis. En tête : SNCF.',
        link: '/dashboard',
        origin: 'user_triggered',
        createdAt: ago(4 * DAY),
        readAt: ago(4 * DAY - HOUR),
      },
      {
        type: 'weekly_summary',
        title: 'Votre semaine sur BellumAI',
        body: '6 comptes suivis, 1 nouveau cette semaine. Priorité : SNCF — priorité 6/100.',
        link: '/dashboard',
        origin: 'user_triggered',
        createdAt: ago(6 * DAY),
        readAt: ago(6 * DAY - HOUR),
      },
      // Voir le docblock ⚠️ ci-dessus : événement PASSÉ, marqué lu, daté à 9
      // jours — jamais une jauge relue en direct.
      {
        type: 'credit_low',
        title: 'Crédits bientôt épuisés',
        body: 'Il te reste 4 crédits sur 20 ce cycle. Recharge ou change d’offre pour ne pas être bloqué.',
        link: '/billing',
        origin: 'user_triggered',
        createdAt: ago(9 * DAY),
        readAt: ago(9 * DAY - HOUR),
      },
      // #2404.7 — D'OÙ vient l'information : ce type-ci tient la sienne de
      // `engagement-alerts.service.ts::emitClientReply` — ce que l'espace a
      // BRANCHÉ (sa messagerie), jamais un de nos fournisseurs (le signal
      // `buy_signal` ci-dessus tient désormais la sienne d'un registre public
      // nommable ou de la presse — même règle, deux origines). `body` reprend
      // mot pour mot le gabarit réel : le FAIT, jamais l'expéditeur ni l'objet
      // (D65).
      {
        type: 'client_reply',
        title: 'Une réponse est arrivée',
        body: 'Une réponse est arrivée dans ta messagerie depuis hier. Elle se lit dans ta boîte, pas ici.',
        link: '/inbox',
        origin: 'user_triggered',
        createdAt: ago(10 * HOUR),
        readAt: null,
        source: 'Gmail',
      },
      // #1940.1 (12/09/2026) / #1940.7 (23/09/2026) — `chat_mention` et
      // `chat_action_assigned` restent VOLONTAIREMENT absents d'ici : les deux
      // exigent un DEUXIÈME compte réel (le collègue mentionné, ou assigné) —
      // et la salle de démonstration n'en porte qu'UN seul
      // (`demo-seed.service.ts` — « un collègue de démonstration serait un
      // vrai compte qui se connecte »). Inventer une seconde identité pour
      // remplir cette ligne serait la donnée fictive que ce jeu s'interdit ;
      // la table `notifications` reste classée SEEDÉE (`demo-coverage.ts`)
      // sur les types qu'elle PEUT montrer honnêtement.
      //
      // #4158.14 (14/10/2026) — REVIREMENT ASSUMÉ ci-dessus, décision Louis du
      // 14/10 (« l'espace démo reçoit des collègues fictifs ») : la boîte
      // d'ÉQUIPE se montre. Les auteurs sont des identifiants SANS profil ni
      // accès (`demo-team-inbox.ts`) — aucun compte qui se connecte.
    ]

    const teamRows = buildDemoTeamInboxRows(accountIds)

    for (const row of rows) {
      const priority = row.priority ?? null
      // #2404.3 — MÊME dérivation que `notifications.service.ts` (GA-26, un
      // réglage vit à un seul endroit) : la démonstration ne fabrique jamais
      // son propre niveau, elle rejoue `notificationLevelFor` sur la même
      // priorité qu'elle écrit.
      const level = notificationLevelFor(priority)
      const source = row.source ?? null
      await this.accounts.manager.query(
        `INSERT INTO notifications (user_id, type, title, body, link, read_at, origin, created_at, priority, level, source, source_url, source_kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          ownerUserId,
          row.type,
          row.title,
          row.body,
          row.link,
          row.readAt,
          row.origin,
          row.createdAt,
          priority,
          level,
          source,
          row.sourceUrl ?? null,
          row.sourceUrl ? (row.sourceKind ?? null) : null,
        ],
      )
    }

    for (const row of teamRows) {
      const createdAt = ago(row.ageMs)
      await this.accounts.manager.query(
        `INSERT INTO notifications (user_id, type, title, body, link, read_at, origin, created_at, workspace_id, actor_user_id)
         VALUES ($1, $2, $3, '', $4, $5, 'user_triggered', $6, $7, $8)`,
        [
          ownerUserId,
          row.type,
          row.title,
          row.link,
          row.read ? new Date(createdAt.getTime() + HOUR / 2) : null,
          createdAt,
          workspaceId,
          row.actorUserId,
        ],
      )
    }
  }

  /**
   * Le VIVIER de la salle — les talents, et les compétences qu'ils déclarent.
   *
   * Écrit AVANT tout ce qui le cite, et c'est la raison d'être de cette méthode
   * séparée : deux étapes du semis retrouvent un consultant PAR SON NOM
   * (`advanceDemoPipeline` pour le refus antérieur, `seedDeliveryClient` pour
   * les positionnements et les affectations de mission). Un vivier écrit après
   * elles rend leurs lectures vides, et chaque rattachement est alors sauté en
   * silence — sept missions sans personne dessus, mesuré en production le 28/08.
   */
  private async seedVivier(workspaceId: string, ownerUserId: string, now: number): Promise<void> {
    // I31 (05/10) — `consultants_subcontracting_partner_check` : un sous-traitant naît AVEC son partenaire. L'ancre
    // est donc posée AVANT l'INSERT (le rattachement par UPDATE, après coup, arrivait trop tard et faisait échouer
    // tout le semis).
    const partnerIdByName = new Map<string, string>()
    for (const name of new Set(DEMO_CONSULTANTS.flatMap(c => (c.partner_account ? [c.partner_account] : [])))) {
      partnerIdByName.set(name, (await this.ensurePartnerAnchor(workspaceId, ownerUserId, name)).id)
    }
    const savedConsultants = await this.consultants.save(
      DEMO_CONSULTANTS.map(consultant =>
        this.consultants.create({
          user_id: ownerUserId,
          workspace_id: workspaceId,
          full_name: consultant.full_name,
          title: consultant.title,
          partner_account_id: consultant.partner_account
            ? (partnerIdByName.get(consultant.partner_account) ?? null)
            : null,
          seniority: consultant.seniority,
          // Années d'expérience et géocodage (décision du 31/08/2026, écran
          // Vivier) — coordonnées RÉELLES et FIXES : la salle de démo ne fait
          // AUCUN appel réseau à `api-adresse.data.gouv.fr` au semis.
          years_experience: consultant.years_experience,
          latitude: consultant.latitude,
          longitude: consultant.longitude,
          availability: consultant.availability,
          // Théo C talents-vivier.N2 — la dernière confirmation de la déclaration. `undefined` reste `null` :
          // « jamais confirmée » est un état réel (la fiche se lit « À reconfirmer · sans confirmation »).
          availability_checked_at:
            consultant.availability_checked_days_ago === undefined
              ? null
              : new Date(now - consultant.availability_checked_days_ago * 86_400_000),
          available_from:
            consultant.available_in_days == null
              ? null
              : new Date(now + consultant.available_in_days * 86_400_000).toISOString().slice(0, 10),
          contract_type: consultant.contract_type,
          // L'engagement se DÉDUIT du cadre contractuel déjà déclaré : un CDI
          // est un salarié. En inventer un autre ferait apparaître des coûts
          // d'achat sur des gens que l'ESN d'exemple salarie.
          // #2948 (#2329.28) — `engagement_kind_override` prime sur cette
          // déduction : `partenaire` n'a pas de `contract_type` qui le désigne.
          engagement_kind:
            consultant.engagement_kind_override ??
            (consultant.contract_type === 'cdi'
              ? 'salarie'
              : consultant.contract_type === 'freelance'
                ? 'freelance'
                : consultant.contract_type === 'portage'
                  ? 'portage'
                  : 'inconnu'),
          // Le mode de travail (écran Vivier, PDF-22 §01) — `undefined` reste
          // `null` en base : non renseigné est un état réel, pas un défaut à
          // combler pour six profils sur sept.
          remote_preference: consultant.remote_preference ?? null,
          // #2948 (#2329.19/.22/.23)
          site_frequency: consultant.site_frequency ?? null,
          international_mobility: consultant.international_mobility ?? null,
          mobility_restrictions: consultant.mobility_restrictions ?? null,
          // #2948 (#2329.30-.34)
          process_in_progress: consultant.process_in_progress ?? null,
          process_exclusive: consultant.process_exclusive ?? null,
          process_other_interviews: consultant.process_other_interviews ?? null,
          process_decision_deadline:
            consultant.process_decision_deadline_in_days == null
              ? null
              : new Date(now + consultant.process_decision_deadline_in_days * 86_400_000).toISOString().slice(0, 10),
          // #2185.10 — LE RÉFÉRENT COMMERCIAL. `undefined` reste `null` : « non
          // attribué » est l'état ordinaire de cinq profils sur sept ; les deux
          // autres portent l'unique occupant de la salle (même patron que
          // `assigned_to` sur les comptes/contacts), pour que « Suivi par… »
          // se VOIE en démo.
          owner_user_id: consultant.owned_by_visitor ? ownerUserId : null,
          // #2182.39 / #2182.54 — le DERNIER ÉCHANGE. La colonne « Dernière
          // interaction » et le filtre « Fraîcheur » lisent cette colonne, que
          // rien n'écrivait : les sept profils auraient dit « non mesuré ».
          // ⚠️ `undefined` reste `null` : « aucun échange enregistré » est un
          // état réel, et l'écrire « aujourd'hui » serait une donnée inventée.
          last_contact_at:
            consultant.last_contact_days_ago === undefined
              ? null
              : new Date(now - consultant.last_contact_days_ago * 86_400_000),
          // D'où vient la fiche, et les déplacements acceptés. Les deux
          // colonnes existaient et n'étaient jamais écrites : la fiche talent
          // affichait « Non renseigné » sur ses sept profils, à l'endroit même
          // où un prospect regarde. `travel_acceptance` reste `null` sur deux
          // profils — « on n'a pas demandé » est un état réel.
          source: consultant.source,
          travel_acceptance: consultant.travel_acceptance ?? null,
          // #2182.51 — le CONSENTEMENT. `undefined` reste `null` : « jamais
          // recueilli » (état `none`) est l'état ordinaire de la majorité des
          // profils, pas un défaut à combler — quatre profils sur sept le
          // gardent tel quel, les trois autres font mordre chacun des trois
          // états restants que `consentState()` distingue (voir
          // `demo-dataset.ts`, docblock `consent_given_days_ago`).
          consent_given_at:
            consultant.consent_given_days_ago === undefined
              ? null
              : new Date(now - consultant.consent_given_days_ago * 86_400_000),
          consent_expires_at:
            consultant.consent_expires_in_days === undefined
              ? null
              : new Date(now + consultant.consent_expires_in_days * 86_400_000),
          consent_basis: consultant.consent_basis ?? null,
          tjm: consultant.tjm,
          // #2329.12-.16 — LES MÉTADONNÉES DU TJM, distinctes du montant :
          // `undefined` reste `null`, « non renseigné » est l'état ordinaire
          // de la majorité des profils (même patron que `consent_basis`
          // ci-dessus). `observed_at_days_ago` se convertit en date ISO
          // comme `available_from` : une date figée dans le code vieillirait
          // au fil des relectures de ce fichier.
          tjm_metadata: consultant.tjm_metadata
            ? {
                currency: consultant.tjm_metadata.currency,
                source: consultant.tjm_metadata.source,
                context: consultant.tjm_metadata.context,
                observed_at:
                  consultant.tjm_metadata.observed_at_days_ago == null
                    ? null
                    : new Date(now - consultant.tjm_metadata.observed_at_days_ago * 86_400_000)
                        .toISOString()
                        .slice(0, 10),
                confidential: consultant.tjm_metadata.confidential,
              }
            : null,
          stack: [...consultant.stack],
          sectors: [...consultant.sectors],
          zones: [...consultant.zones],
          references: [...consultant.references],
          languages: consultant.languages.map(item => ({ ...item })),
          clearances: [...consultant.clearances],
          wants: consultant.wants,
          notes: consultant.notes,
          cv_text: consultant.cv_text,
          // #3410.10/.11/.13/.14 — `undefined` reste `null`/`[]` en base :
          // l'état ordinaire de six profils sur sept.
          preferred_client_types: consultant.preferred_client_types ?? null,
          refused_clients: consultant.refused_clients ?? null,
          environments_to_avoid: consultant.environments_to_avoid ?? null,
          non_negotiable_conditions: consultant.non_negotiable_conditions ?? null,
          // #3406 — retour bêta #3406. `undefined` reste `null` : l'état
          // ordinaire de six profils sur sept.
          field_reports: consultant.field_reports
            ? consultant.field_reports.map(report => ({
                id: randomUUID(),
                accountId: null,
                accountName: report.accountName,
                entity: report.entity ?? null,
                team: null,
                manager: null,
                project: null,
                technologies: [],
                teamSize: null,
                partnersObserved: [],
                painPoints: null,
                possibleSponsor: report.possibleSponsor ?? null,
                decisionMakers: report.decisionMakers ?? [],
                uncoveredNeed: report.uncoveredNeed ?? null,
                peopleToContact: report.peopleToContact ?? [],
                introductionPossible: null,
                notForCommercialUse: report.notForCommercialUse ?? false,
                confidentialityLevel: report.confidentialityLevel,
                usageAuthorization: null,
                scope: null,
                confidence: report.confidence,
                recordedByUserId: ownerUserId,
                recordedByName: report.recordedByName,
                declaredAt: new Date(now - report.declaredDaysAgo * 86_400_000).toISOString(),
              }))
            : null,
        }),
      ),
    )

    // Les COMPÉTENCES TYPÉES du vivier, dérivées de la stack déjà déclarée.
    //
    /**
     * #2195.12 — LE MANAGER, EN SECONDE PASSE, ET C'EST OBLIGATOIRE.
     *
     * `consultants.manager_id` pointe vers un autre `consultants.id` : aucun de
     * ces identifiants n'existe avant le `save` ci-dessus. Les rattacher dans
     * le même insert reviendrait à inventer des UUID, donc à écrire une clé
     * étrangère qui ne résout rien.
     *
     * Les fiches SANS manager en restent sans : « non renseigné » est l'état
     * ordinaire d'une colonne qu'on vient d'ouvrir, et la démo doit le montrer
     * tel quel plutôt que de remplir sept fiches pour faire joli.
     */
    const consultantIdByName = new Map(
      (Array.isArray(savedConsultants) ? savedConsultants : []).map(row => [row.full_name, row.id]),
    )
    const withManager = DEMO_CONSULTANTS.filter(consultant => consultant.manager_full_name)
    for (const consultant of withManager) {
      const id = consultantIdByName.get(consultant.full_name)
      const managerId = consultantIdByName.get(consultant.manager_full_name ?? '')
      // Un rattachement dont l'une des deux fiches manque est SAUTÉ, jamais
      // écrit à moitié : une clé étrangère absente ferait échouer tout le semis.
      if (!id || !managerId || id === managerId) continue
      await this.consultants.update({ id }, { manager_id: managerId })
    }

    // #4577.3 — « Saisi à la main » se montre : une correction humaine datée sur un champ de fiche. Posée APRÈS le
    // semis des valeurs (la provenance suppose une valeur), jamais sur une fiche absente du vivier.
    for (const entry of DEMO_HAND_ENTERED_TALENT_FIELDS) {
      const id = consultantIdByName.get(entry.full_name)
      if (!id) continue
      for (const field of entry.fields) {
        await this.consultants.manager.query(
          `INSERT INTO field_provenance (workspace_id, entity_type, entity_id, field, source, confidence, actor_id, observed_at)
           VALUES ($1, 'consultant', $2, $3, 'human', NULL, $4, now() - ($5 || ' days')::interval)
           ON CONFLICT (entity_type, entity_id, field) DO NOTHING`,
          [workspaceId, id, field, ownerUserId, String(entry.daysAgo)],
        )
      }
    }

    // Dérivées et non inventées : afficher un niveau « expert » qu'aucune
    // donnée d'exemple ne porte serait de la mise en scène. Le niveau reste
    // `autonome` et la source `declared` — ce que la stack dit réellement, ni
    // plus ni moins. Sans elles, le panneau « Compétences » d'une fiche talent
    // s'ouvre vide alors que la stack juste au-dessus est remplie : un écran
    // qui se contredit lui-même sous les yeux d'un prospect.
    //
    // #2328.24 — la DERNIÈRE compétence de chaque stack est semée `inferred`
    // (mot trouvé, jamais une expérience détaillée) : sans ça, la marque
    // « à vérifier » (`TalentSkillsDialog.tsx`) serait un écran livré mais
    // vide en démo (craft rule n°9) — un prospect ne verrait jamais ce que ce
    // chantier vient de poser.
    // Théo C talents-vivier.R3 — les PREMIÈRES compétences d'un profil qui en porte (`proven_skill_count`) sont
    // semées PROUVÉES (source `mission`), pour que l'axe « Compétences prouvées » du score se lise en démo.
    const provenByName = new Map(DEMO_CONSULTANTS.map(item => [item.full_name, item.proven_skill_count ?? 0]))
    const skillRows = (Array.isArray(savedConsultants) ? savedConsultants : []).flatMap(consultant =>
      (consultant.stack ?? []).map((skill, index) => {
        const isLast = index === (consultant.stack?.length ?? 0) - 1
        const proven = index < (provenByName.get(consultant.full_name ?? '') ?? 0)
        return this.consultantSkills.create({
          consultant_id: consultant.id,
          workspace_id: workspaceId,
          skill: canonicalSkill(skill) ?? skill.toLowerCase(),
          raw_label: null,
          level: isLast ? 'inconnu' : 'autonome',
          years: null,
          last_used_year: null,
          source: proven ? 'mission' : isLast ? 'cv' : 'declared',
          inferred: isLast && !proven,
        })
      }),
    )
    if (skillRows.length > 0) await this.consultantSkills.save(skillRows)

    // Théo C talents-vivier.A12 — « Mes favoris » : deux profils dans les favoris de l'unique occupant de la salle.
    const favoriteTalents = DEMO_CONSULTANTS.filter(item => item.favorite)
      .map(item => consultantIdByName.get(item.full_name))
      .filter((id): id is string => Boolean(id))
    if (favoriteTalents.length > 0) {
      await this.favorites.save(
        favoriteTalents.map(id =>
          this.favorites.create({ user_id: ownerUserId, entity_type: 'talent', entity_id: id }),
        ),
      )
    }

    // #2328.9/.10/.22/.23 (épopée #2793) — UNE preuve nommée, dérivée du
    // `cv_text`/`references` DÉJÀ écrits pour Camille Roussel juste au-dessus
    // : rien n'est inventé, le texte est copié tel quel. Sans elle, le badge
    // « Preuve » que ce chantier pose sur une compétence (`TalentSkillsDialog`)
    // n'aurait jamais rien à montrer en démonstration (craft rule n°9) — un
    // écran livré mais vide se découvre en réunion, pas en CI.
    //
    // Le CV dit « opérateur d'énergie », jamais le nom de la société : c'est
    // un client MASQUÉ, distinct d'un client simplement non renseigné (#2328.23).
    const camilleId = consultantIdByName.get('Camille Roussel')
    const camilleKubernetes = skillRows.find(row => row.consultant_id === camilleId && row.skill === 'kubernetes')
    if (camilleId && camilleKubernetes) {
      const [experience] = await this.consultantExperiences.save([
        this.consultantExperiences.create({
          consultant_id: camilleId,
          workspace_id: workspaceId,
          entreprise: null,
          client_final: null,
          client_masked: true,
          client_masked_reason: 'Le CV cite « opérateur d’énergie », jamais de nom d’entreprise.',
          secteur: 'Énergie',
          role: 'Architecte plateforme',
          date_debut: '2022-01-01',
          date_fin: '2026-01-01',
          contexte: 'Conception et exploitation d’un socle Kubernetes multi-région, industrialisé en Terraform.',
          realisations: 'Budget d’erreur tenu deux ans de suite.',
          technologies: ['Kubernetes', 'Terraform'],
          responsabilites: 'Conception et exploitation du socle plateforme.',
          preuve:
            '2022-2026 — Architecte plateforme, opérateur d’énergie. Conception et exploitation d’un socle ' +
            'Kubernetes multi-région, industrialisé en Terraform. Observabilité de bout en bout, budget ' +
            'd’erreur tenu deux ans de suite.',
        }),
      ])
      await this.consultantSkills.update(
        { id: camilleKubernetes.id },
        {
          source_experience_id: experience.id,
          source_project: 'Socle Kubernetes multi-région pour un opérateur d’énergie',
        },
      )
    }

    /**
     * #2185.51 — « Préparer un message » : UN brouillon seedé, jamais un
     * envoi (aucune colonne d'envoi n'existe sur cette table). Posé sur le
     * même profil que le référent commercial (`owned_by_visitor`) pour que
     * « Suivi par » et « Préparer un message » se lisent sur la MÊME fiche,
     * plutôt que d'éparpiller les deux gestes récents sur des profils
     * différents que le visiteur devrait chercher.
     */
    const ownedConsultantName = DEMO_CONSULTANTS.find(consultant => consultant.owned_by_visitor)?.full_name
    const ownedConsultantId = ownedConsultantName ? consultantIdByName.get(ownedConsultantName) : undefined
    if (ownedConsultantId) {
      await this.talentPreparedMessages.save(
        this.talentPreparedMessages.create({
          consultant_id: ownedConsultantId,
          workspace_id: workspaceId,
          channel: 'email',
          subject: 'Disponibilité pour une mission Cloud',
          body: 'Bonjour, je reviens vers vous pour faire le point sur votre disponibilité et une mission qui pourrait vous correspondre.',
          prepared_by: ownerUserId,
        }),
      )
    }
  }

  /**
   * #2569.4 — le parcours du lot N (import ZIP / messagerie) doit être VISIBLE
   * en démonstration : un doublon résolu automatiquement (#2569.2), une
   * exception isolée pour revue (#2569.3). Voir `DEMO_CV_IMPORT_CONSULTANTS`
   * pour le détail des deux histoires.
   *
   * Ces fiches sont EN PLUS des sept de `DEMO_CONSULTANTS` — jamais un
   * rattachement dans ce groupe, dont le matching dépend d'un compte exact.
   * Aucun appel de modèle : les documents portent leur texte tel quel, comme
   * `cv_text` l'est déjà pour les sept autres profils.
   */
  private async seedCvImportExamples(workspaceId: string, ownerUserId: string): Promise<void> {
    // Le document le plus RÉCENT porte le texte courant de la fiche — la même
    // règle que `incomingCvIsMoreRecent` (#2569.2) : la donnée la plus récente
    // gagne, jamais la dernière insérée.
    const latestOf = (persona: DemoCvImportConsultant): DemoCvImportDocument | null =>
      [...persona.documents].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).at(-1) ?? null

    // Un seul `save([...])`, comme `seedVivier` : c'est ce qui rend les
    // identifiants générés relisibles PAR POSITION juste après, sans deviner
    // un UUID qui n'existe pas encore.
    const savedConsultants = await this.consultants.save(
      DEMO_CV_IMPORT_CONSULTANTS.map(persona => {
        const latest = latestOf(persona)
        return this.consultants.create({
          user_id: ownerUserId,
          workspace_id: workspaceId,
          full_name: persona.full_name,
          kind: 'candidate',
          source: persona.source,
          review_status: persona.review_status,
          qualified_at: persona.review_status === 'qualified' ? new Date() : null,
          cv_text: latest?.text ?? null,
          cv_captured_at: latest ? new Date(latest.capturedAt) : null,
          // #2542.3 — porte l'état du texte ACTUEL de la fiche, même règle que
          // `cv_captured_at` juste au-dessus : c'est le document le plus
          // récent qui qualifie ce que `cv_text` vaut.
          cv_extraction_partial: latest?.partial ?? false,
          notes: persona.notes,
          // #2183.21/#2183.26 (#2784) — l'état d'ARRIVÉE du geste de revue,
          // sans le rejouer (voir le commentaire sur `DemoCvImportConsultant`
          // dans `demo-dataset.ts`). `undefined` reste `null`.
          location: persona.location ?? null,
          education: persona.education ? [...persona.education] : null,
          // #3935.2a — `undefined` reste `null` : « non lu », jamais une liste vide.
          environments: persona.environments ? [...persona.environments] : null,
          tools: persona.tools ? [...persona.tools] : null,
          certifications: persona.certifications ? [...persona.certifications] : null,
        })
      }),
    )
    const rows = Array.isArray(savedConsultants) ? savedConsultants : [savedConsultants]
    await this.seedRecruitmentEvents(workspaceId, ownerUserId, rows)

    const documentRows = DEMO_CV_IMPORT_CONSULTANTS.flatMap((persona, index) => {
      const consultantId = rows[index]?.id
      if (!consultantId) return []
      return persona.documents.map(document =>
        this.consultantDocuments.create({
          consultant_id: consultantId,
          workspace_id: workspaceId,
          kind: 'cv',
          filename: document.filename,
          extracted_text: document.text,
          uploaded_by: ownerUserId,
          content_sha256: createHash('sha256').update(document.text, 'utf8').digest('hex'),
          captured_at: new Date(document.capturedAt),
          experience_keys: [],
          extraction_partial: document.partial ?? false,
        }),
      )
    })
    if (documentRows.length > 0) await this.consultantDocuments.save(documentRows)

    // #3935.2b — les expériences lues dans le CV, en provenance `model` par champ
    // (même forme que `CvParseService.writeExperiences`) : la ligne « Expériences »
    // de la fiche les montre en salle, sans rejouer de lecture.
    const experienceRows = DEMO_CV_IMPORT_CONSULTANTS.flatMap((persona, index) => {
      const consultantId = rows[index]?.id
      if (!consultantId) return []
      return (persona.experiences ?? []).map(experience => {
        const provenance: Record<string, 'model'> = { role: 'model' }
        if (experience.entreprise) provenance['entreprise'] = 'model'
        if (experience.date_debut) provenance['date_debut'] = 'model'
        if (experience.date_fin) provenance['date_fin'] = 'model'
        if (experience.realisations) provenance['realisations'] = 'model'
        // #3935 (lot P03) — même conversion que `CvParseService` : l'année au 1er
        // janvier ET sa précision `year`, jamais un mois affiché.
        const start = toStoredExperienceDate(experience.date_debut)
        const end = toStoredExperienceDate(experience.date_fin)
        return this.consultantExperiences.create({
          consultant_id: consultantId,
          workspace_id: workspaceId,
          role: experience.role,
          entreprise: experience.entreprise,
          realisations: experience.realisations,
          date_debut: start.date,
          date_debut_precision: start.precision,
          date_fin: end.date,
          date_fin_precision: end.precision,
          preuve: experience.preuve,
          field_provenance: provenance,
        })
      })
    })
    if (experienceRows.length > 0) await this.consultantExperiences.save(experienceRows)
  }

  /**
   * #2818 — une fiche par source du port de sourcing externe
   * (`ExternalSourcingService`), voir le docblock de
   * `DEMO_EXTERNAL_SOURCING_CONSULTANTS` pour pourquoi ni les sept profils du
   * vivier ni les personas du lot N ne peuvent porter cette démonstration.
   *
   * Chaque fiche décline `DEMO_EXTERNAL_SOURCING_SKILL` (« Kubernetes ») en
   * `consultant_skills`, la compétence du besoin phare de SNCF — sans
   * quoi les trois requêtes SQL du port rendraient une liste vide, juste mais
   * inutile à montrer.
   */
  /** Ancre `accounts` (statut `deleted`) d'une ESN partenaire — trouvée si déjà semée, sinon créée. */
  private async ensurePartnerAnchor(
    workspaceId: string,
    ownerUserId: string,
    companyName: string,
  ): Promise<AccountEntity> {
    const existing = await this.accounts.findOne({ where: { workspace_id: workspaceId, company_name: companyName } })
    if (existing) return existing
    return this.accounts.save(
      this.accounts.create({
        user_id: ownerUserId,
        workspace_id: workspaceId,
        company_name: companyName,
        status: 'deleted',
      }),
    )
  }

  private async seedExternalSourcingExamples(workspaceId: string, ownerUserId: string): Promise<void> {
    // L'ESN partenaire n'est qu'une ANCRE de clé étrangère : `partner_account_id`
    // référence `accounts(id)`. Recette prod 05/10 — elle apparaissait dans
    // /accounts comme un compte quasi vide. Statut `deleted` = le mécanisme
    // existant qui l'exclut de la liste, des compteurs et de Découvrir
    // (`DELETED_ACCOUNT_STATUS`) : une ESN partenaire n'est pas un prospect.
    const partnerAccount = await this.ensurePartnerAnchor(workspaceId, ownerUserId, DEMO_EXTERNAL_SOURCING_PARTNER_NAME)

    const savedConsultants = await this.consultants.save(
      DEMO_EXTERNAL_SOURCING_CONSULTANTS.map(persona =>
        this.consultants.create({
          user_id: ownerUserId,
          workspace_id: workspaceId,
          full_name: persona.full_name,
          title: persona.title,
          kind: persona.sourceKind === 'inbound_candidacy' ? 'candidate' : 'consultant',
          // `sous_traitance` + `partner_account_id` EST la définition de
          // `partner_bench` (voir le docblock du port) — jamais une catégorie
          // à côté de ces deux colonnes.
          engagement_kind: persona.sourceKind === 'partner_bench' ? 'sous_traitance' : 'inconnu',
          partner_account_id: persona.sourceKind === 'partner_bench' ? partnerAccount.id : null,
          // `csv_ats_import` ET `inbound_candidacy` sont RELUS — la définition
          // même de « pas encore le vivier qualifié » (voir le docblock du
          // port). `partner_bench` est qualifié : c'est le banc DÉJÀ qualifié
          // d'un partenaire, pas une fiche à revoir.
          review_status:
            persona.sourceKind === 'partner_bench' || persona.sourceKind === 'external_directory'
              ? 'qualified'
              : 'needs_review',
          external_sourcing_origin:
            persona.sourceKind === 'external_directory'
              ? {
                  sourceKind: 'external_directory',
                  needId: null,
                  importedAt: new Date().toISOString(),
                  externalRef: 'external_directory:demo-1',
                }
              : null,
          source:
            persona.sourceKind === 'csv_ats_import'
              ? 'ats'
              : persona.sourceKind === 'network_referral'
                ? 'cooptation'
                : persona.sourceKind === 'external_directory'
                  ? 'annuaire_externe'
                  : null,
        }),
      ),
    )

    const skillRows = (Array.isArray(savedConsultants) ? savedConsultants : [savedConsultants]).map(consultant =>
      this.consultantSkills.create({
        consultant_id: consultant.id,
        workspace_id: workspaceId,
        skill: DEMO_EXTERNAL_SOURCING_SKILL.toLowerCase(),
        source: 'declared',
      }),
    )
    await this.consultantSkills.save(skillRows)
  }

  /**
   * La moitié « après la signature » de la démonstration.
   *
   * Un client FICTIF (voir {@link DEMO_DELIVERY_CLIENT}) porte un besoin gagné,
   * trois positionnements, deux missions et leurs relevés. Sans lui, les écrans
   * Positionnements, Missions et Prêt à facturer s'ouvraient vides devant un
   * prospect — c'est-à-dire que la moitié ATS du produit ne se montrait pas.
   *
   * Tout est inséré en SQL direct plutôt qu'en repositories : ce sont des lignes
   * plates, et huit dépôts de plus dans le constructeur ne rendraient pas le
   * fichier plus clair.
   */
  /**
   * `accountIds` / `contactIds` sont les registres PARTAGÉS du semis : ce que
   * cette méthode écrit doit y être déclaré, sinon les étapes suivantes — le
   * journal d'activité en particulier — ne savent pas relier une trace au client
   * d'exemple et posent `account_id: null`. C'est la cause racine « ce qui LIT
   * après ce qui ÉCRIT », déjà payée deux fois ici : le semis n'échoue pas, il
   * écrit des lignes orphelines, en silence.
   */
  private async seedDeliveryClient(
    workspaceId: string,
    ownerUserId: string,
    now: number,
    accountIds: Map<string, string>,
    contactIds: Map<string, string>,
  ): Promise<void> {
    const client = DEMO_DELIVERY_CLIENT
    const day = 86_400_000
    const iso = (offsetDays: number): string => new Date(now - offsetDays * day).toISOString()
    const dateOnly = (offsetDays: number): string => new Date(now - offsetDays * day).toISOString().slice(0, 10)

    // #2989 — le filtre BU de `/missions/planification` lit `businessUnitName`,
    // DÉRIVÉ de `accounts.business_unit_id` (`delivery.service.ts:97`), jamais
    // posé ici jusqu'ici : `businessUnitOptions` n'avait donc aucune option à
    // montrer en démonstration, quand bien même le mécanisme (comme le filtre
    // Compétence) est réel. `seedBusinessUnits` tourne AVANT ce semis : le
    // périmètre existe déjà quand on le cherche par son nom.
    const businessUnitId = await this.demoBusinessUnitId(workspaceId, DEMO_BUSINESS_UNITS[0].name)

    // Décision Louis 04/10/2026 — AUCUN compte créé : la livraison est posée sur
    // le VRAI dossier porteur, déjà semé (voir `DEMO_DELIVERY_CLIENT`). On n'y
    // écrit que des gestes de l'équipe de démonstration (statut client, meilleure
    // référence, BU, déclaration « client interne », étiquette) et la clé de
    // RELATION, fusionnée dans son `raw_analysis` sans rien écraser d'autre.
    const carrierId = accountIds.get(client.account.company_name)
    if (!carrierId) {
      this.logger.warn(
        `Compte porteur de la livraison « ${client.account.company_name} » introuvable — livraison non semée.`,
      )
      return
    }
    await this.accounts.manager.query(
      `UPDATE accounts
          SET commercial_status = $3,
              is_best_reference = $4,
              business_unit_id = $5::uuid,
              declared_internal_client_mode = $6,
              declared_internal_sponsor = $9,
              declared_internal_users = $10,
              declared_legal_entity = $11,
              declared_end_client = $12,
              declared_route_scope = $13,
              declared_route_objectives = $14,
              declared_route_timing = $15,
              declared_route_event = $16,
              declared_route_budget = $17,
              declared_route_availability = $18,
              tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}'::text[]) || $7::text[]))),
              raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || $8::jsonb
        WHERE id = $1 AND workspace_id = $2`,
      [
        carrierId,
        workspaceId,
        client.account.commercial_status,
        client.account.is_best_reference,
        // #2989 — `null` si le périmètre n'a pas résolu (ne devine jamais une BU).
        businessUnitId,
        // #219.6 (#3231) — la déclaration « client interne » (geste de l'équipe).
        client.account.declared_internal_client_mode,
        // #2159.26 — l'étiquette de l'équipe, normalisée.
        normalizeTags(client.account.tags),
        JSON.stringify(client.analysis),
        // #219.6 (J05) — les quatre rôles de la direction interne, nommés par l'équipe.
        client.account.declared_internal_sponsor,
        client.account.declared_internal_users,
        client.account.declared_legal_entity,
        client.account.declared_end_client,
        // #3278.2 (lot M11) — trois critères de route déclarés par l'équipe.
        client.account.declared_route_scope,
        client.account.declared_route_objectives,
        client.account.declared_route_timing,
        // #3278.1 (décision Louis 11/10/2026) — le fait de la route « événement ou communauté ».
        client.account.declared_route_event,
        // #3278.2b (Louis 15/10) — budget et disponibilité déclarés ; le réseau existant reste vide À DESSEIN.
        client.account.declared_route_budget,
        client.account.declared_route_availability,
      ],
    )
    const account = { id: carrierId }

    /**
     * ⚠️ LES INTERLOCUTEURS D'ABORD — la boucle des missions les LIT.
     *
     * L'ordre n'est pas une préférence de lecture, c'est la condition pour que
     * `billing_contact` devienne un `billing_contact_id`. Écrits après la boucle
     * des missions, ces deux contacts n'existeraient pas au moment où elle
     * résout le nom : chaque mission partirait avec `null`, sans erreur et sans
     * test rouge. C'est la cause racine déjà payée ici deux fois — sept missions
     * et « Personne d'affecté » sur toutes, mesuré en production le 28/08.
     *
     * Ils passent par la MÊME porte que les contacts des six dossiers réels
     * ({@link demoContactRow}) : leur fiche est donc dérivée comme les autres,
     * et ne peut pas s'ouvrir à moitié remplie devant un prospect.
     *
     * Le compte ne porte pas de `recent_signals` — son analyse est volontairement
     * mince — donc les signaux de la fiche sont dérivés des postes ouverts qu'elle
     * porte VRAIMENT. Rien n'est inventé : c'est la même donnée, lue à la maille
     * du contact.
     */
    const contactIdsByName = new Map<string, string>()
    if (client.contacts.length > 0) {
      // Le dossier porteur, relu tel que le semis l'a écrit : les fiches des deux
      // interlocuteurs se dérivent de SES faits, jamais de ceux d'un client fictif.
      const carrierDossier = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === client.account.company_name)
      const accountSeed: DemoDossierSeed = {
        company_name: client.account.company_name,
        sector: carrierDossier?.account.sector ?? '',
        headquarters: carrierDossier?.account.headquarters ?? '',
        recent_signals: carrierDossier?.account.recent_signals ?? [],
      }
      const saved = await this.contacts.save(
        client.contacts.map(contact => this.demoContactRow(contact, accountSeed, account.id, workspaceId, ownerUserId)),
      )
      for (const contact of saved) {
        if (!contact.full_name) continue
        contactIdsByName.set(contact.full_name, contact.id)
        // …et dans le registre PARTAGÉ, pour que le journal d'activité puisse
        // rattacher une issue déclarée (« a répondu », « rendez-vous décroché »)
        // à l'interlocuteur qui la porte.
        contactIds.set(contact.full_name, contact.id)
      }
      // #4016 L4.1 — l'e-mail ESTIMÉ d'un interlocuteur SIMULÉ du client.
      await this.seedEstimatedEmails(saved, workspaceId)
    }
    // Décision Louis 04/10/2026 — les interlocuteurs de livraison sont les
    // fiches DÉJÀ semées par le dossier porteur (sièges sans nom du dossier
    // SNCF) : le registre partagé les résout, aucune personne n'est créée.
    for (const [name, id] of contactIds) {
      if (!contactIdsByName.has(name)) contactIdsByName.set(name, id)
    }

    // #3219 (#190.2 côté contact, décision Louis 11/10/2026) — le contrôle avant
    // action d'un contact s'ouvre sur un VRAI écart de portée : deux relevés
    // `pipeline` du poste, chacun avec la portée DÉCLARÉE de son analyse, écrits
    // comme l'écrit `ProvenanceService.commit` (une ligne par écriture). Le second
    // porte la valeur que la fiche affiche — le journal ne contredit jamais la
    // ligne. Un siège ANONYME (jamais une personne nommée) : aucun verdict sur
    // quiconque. Un nom qui ne résout pas ne sème rien, et le dit.
    const scoped = DEMO_CONTACT_SCOPE_DIFFERENCE
    const scopedContactId = contactIdsByName.get(scoped.contact) ?? null
    if (scopedContactId) {
      for (const [oldValue, write] of [
        [null, scoped.first],
        [scoped.first.value, scoped.second],
      ] as const) {
        await this.accounts.manager.query(
          `INSERT INTO record_field_audit
             (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id, rule, scope, created_at)
           VALUES ($1, 'contact', $2, $3, $4, $5, 'pipeline', NULL, NULL, $6, $7::timestamptz)`,
          [workspaceId, scopedContactId, scoped.field, oldValue, write.value, write.scope, iso(write.daysAgo)],
        )
      }
    } else {
      this.logger.warn(
        `Contact de démonstration « ${scoped.contact} » introuvable — l'écart de portée du contrôle avant action n'est pas semé.`,
      )
    }

    // Les sociétés de services reliées au client FICTIF — la demande n°3 du bêta
    // testeur, sur le seul compte du jeu qui n'existe pas.
    //
    // Le rang, la relation et l'origine sont portés par le JEU DE DONNÉES depuis
    // #2122 : deux lignes restent en `analysis`, parce que c'est ce que le
    // pipeline produirait et que l'écran doit montrer le badge « détecté » ; une
    // seule est `declared`, celle qui enseigne qu'une parole d'équipe vaut preuve
    // là où une détection sans date ne vaut rien. Trois lignes toutes déclarées
    // donneraient une fausse impression de certitude — c'est le refus d'origine,
    // il tient toujours.
    for (const partner of client.partners) {
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at, declared_by, competitive_risk, complementarity, next_verification_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (account_id, lower(name)) DO UPDATE
           SET rank = EXCLUDED.rank, relationship = EXCLUDED.relationship, note = EXCLUDED.note,
               source = EXCLUDED.source, certainty = EXCLUDED.certainty, scope = EXCLUDED.scope,
               detected_at = EXCLUDED.detected_at, declared_by = EXCLUDED.declared_by,
               competitive_risk = EXCLUDED.competitive_risk, complementarity = EXCLUDED.complementarity,
               next_verification_at = EXCLUDED.next_verification_at`,
        [
          workspaceId,
          account.id,
          partner.name,
          partner.rank,
          partner.relationship,
          partner.note,
          partner.partnerSource,
          partner.certainty,
          partner.scope,
          // #2122 — `null` quand la ligne n'a pas de date : une détection sans
          // date ne prouve rien, et lui en inventer une la ferait AFFIRMER.
          partner.detectedDaysAgo === null ? null : iso(partner.detectedDaysAgo),
          // #2298.7 — QUI a déclaré. `null` sur toute ligne `analysis` (le
          // pipeline n'a personne à nommer) ; sur la SEULE ligne `declared`
          // de ce jeu, l'auteur du compte de démonstration — la preuve que
          // « Déclarée par <nom> le <date> » se lit. Les compétiteurs seedés
          // par `seedNeedVerdict` gardent volontairement `declared_by NULL` :
          // c'est l'autre état, « auteur inconnu », qui doit aussi se voir
          // quelque part dans la démonstration.
          partner.partnerSource === 'declared' ? ownerUserId : null,
          // #3205.4 (épopée #3239) — trois des quatre champs manquants de la
          // fiche prestataire, parité démo (craft rule n°9).
          partner.competitiveRisk,
          partner.complementarity,
          // `iso` retranche des jours (date PASSÉE) — une prochaine
          // vérification est une date FUTURE, d'où le signe inversé.
          partner.nextVerificationDaysFromNow === null ? null : iso(-partner.nextVerificationDaysFromNow),
        ],
      )
    }

    // #3095 — la ligne « crédit de site » (posée aussi sur Société Générale) a
    // disparu avec le client fictif (décision Louis 04/10/2026) : aucune
    // détection de crédit de site n'est observée sur un vrai compte de la salle.
    const flagshipAccountId = accountIds.get('Société Générale')

    /**
     * #3095 (lot N05, 08/10/2026) — LA LIGNE REDEVIENT PROUVABLE EN SALLE, SUR
     * UN VRAI COMPTE.
     *
     * Rouverte le 08/10 sur la foi que « la ligne de crédit de site a disparu
     * avec le client fictif » prouvait que la détection manquait en PRODUCTION
     * — ce n'est pas le cas : `provider_footprint_subdomains.py` (crt.sh,
     * décision Louis 02/10/2026, épopée #3239) et `provider_footprint_mentions.py`
     * tournent déjà sur chaque analyse réelle, fusionnés dans la MÊME liste
     * `esnPresence` que `site_credit_partners.py` (`phase1_research.py:1499-1522`).
     * Ce qui manquait réellement est ce que CE lot répare : la preuve
     * qu'on peut la rejouer dans la salle SANS passer par un compte fictif.
     *
     * Nom et note repris du commentaire ci-dessus (« Structura Web (exemple) »,
     * déjà marqué comme illustratif) — même pédagogie, posée cette fois sur
     * Société Générale, qui porte déjà ses dizaines d'ESN réelles du brief
     * (`esn-presentes`) : cette ligne-ci en est distincte par construction
     * (nom hors référentiel), donc jamais un doublon à fusionner avec elles.
     * `certainty: 'moyenne'` — pas `'forte'` — parce que c'est le SOUS-DOMAINE
     * que ce lot restaure, et un CNAME montre qu'un service répond sous le
     * nom du compte, pas qu'il y est prestataire IT (même barème que
     * `provider_footprint_subdomains.py`).
     */
    if (flagshipAccountId) {
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at, declared_by)
         VALUES ($1, $2, $3, 'unknown', 'unknown', $4, 'analysis', 0, 'moyenne', NULL, $5, NULL)
         ON CONFLICT (account_id, lower(name)) DO UPDATE
           SET note = EXCLUDED.note, source = EXCLUDED.source, certainty = EXCLUDED.certainty,
               detected_at = EXCLUDED.detected_at`,
        [
          workspaceId,
          flagshipAccountId,
          'Structura Web (exemple)',
          'Sous-domaine détecté (certificats publics) : support.societegenerale.com pointe vers structura-web.com.',
          dateOnly(4),
        ],
      )
    }

    /**
     * #3257.4 (lot restes, 29/09) — LE PARTENAIRE DE LA ROUTE PARTENAIRE.
     *
     * BNP Paribas est en `partner_route` (voir `demo-dataset.ts`) : sa carte du
     * board d'effort lit son partenaire dans `account_partners`. Décision Louis
     * 04/10/2026 : une VRAIE ESN observée par le brief du compte, DÉCLARÉE
     * partenaire par l'équipe de démonstration (auteur = le compte de démo).
     * Le brief a souvent déjà écrit la ligne observée : la déclaration la
     * PROMEUT (`DO UPDATE` : rang, relation, note, source `declared`) au lieu
     * d'en écrire une seconde — rejouer la salle ne double jamais la ligne.
     */
    const partnerRoute = DEMO_SPRINT_PARTNER_ROUTE_PARTNER
    const partnerRouteAccountId = accountIds.get(partnerRoute.accountName)
    if (partnerRouteAccountId) {
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at, declared_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'declared', 0, NULL, NULL, NULL, $7)
         ON CONFLICT (account_id, lower(name)) DO UPDATE
           SET rank = EXCLUDED.rank, relationship = EXCLUDED.relationship, note = EXCLUDED.note,
               source = 'declared', declared_by = EXCLUDED.declared_by`,
        [
          workspaceId,
          partnerRouteAccountId,
          partnerRoute.name,
          partnerRoute.rank,
          partnerRoute.relationship,
          partnerRoute.note,
          ownerUserId,
        ],
      )
    }

    /**
     * #3296 (#3269.6) — LE PARTENAIRE QUI DÉCLENCHE `suggested_switch` SUR LE BOARD.
     *
     * Même geste que le bloc BNP Paribas ci-dessus, sur un compte qui n'est PAS
     * encore en `partner_route` (Groupe BPCE, `volume`) : c'est cette ligne que
     * `SprintsService.board()` lit pour proposer (jamais écrire) le passage
     * en route partenaire — la règle existait depuis #3257.8 sans qu'aucun
     * compte de démo ne la déclenche.
     */
    const suggestedSwitchPartner = DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER
    const suggestedSwitchAccountId = accountIds.get(suggestedSwitchPartner.accountName)
    if (suggestedSwitchAccountId) {
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at, declared_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'declared', 0, NULL, NULL, NULL, $7)
         ON CONFLICT (account_id, lower(name)) DO UPDATE
           SET rank = EXCLUDED.rank, relationship = EXCLUDED.relationship, note = EXCLUDED.note,
               source = 'declared', declared_by = EXCLUDED.declared_by`,
        [
          workspaceId,
          suggestedSwitchAccountId,
          suggestedSwitchPartner.name,
          suggestedSwitchPartner.rank,
          suggestedSwitchPartner.relationship,
          suggestedSwitchPartner.note,
          ownerUserId,
        ],
      )
    }

    /**
     * LES SOCIÉTÉS DE L'ESN, écrites AVANT tout ce qui les porte —
     * `legal_contracts.legal_entity_id` compris, pas seulement
     * `missions.legal_entity_id` plus bas dans ce fichier.
     *
     * #2869 (lot V5, 28/09/2026) — DÉPLACÉ ici depuis juste avant la boucle
     * des missions : le contrat juridique de Société Générale juste en dessous
     * `SELECT`ait cette même société AVANT que ce bloc ne l'ait écrite (il
     * vivait alors « plus bas dans ce fichier », comme le disait l'ancien
     * commentaire du bloc contrat) — sur une salle JAMAIS encore semée, la
     * ligne n'existait pas et `legal_entity_id` partait `null`. La fiche
     * contrat de démonstration affichait alors « société non mesurée », et
     * le NO-GO (#2422.11, `legalContractChainNoGo`) ne pouvait jamais
     * comparer deux sociétés puisque l'une d'elles était toujours absente.
     * Ce qui LIT vient toujours après ce qui ÉCRIT — la règle que ce
     * commentaire énonçait déjà, mais que l'ordre du fichier ne tenait pas.
     *
     * ⚠️ `ON CONFLICT DO NOTHING` sur `(workspace_id, lower(name))`, l'index
     * unique de la migration : une remise à neuf de la salle ne doit pas
     * dupliquer les sociétés, et surtout pas réécrire celles qu'un visiteur
     * aurait renommées de sa main pendant sa visite.
     */
    const legalEntityIds = new Map<string, string>()
    for (const entity of DEMO_LEGAL_ENTITIES) {
      await this.accounts.manager.query(
        `INSERT INTO legal_entities (workspace_id, name, registration_number, country, vat_number, address, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          entity.name,
          entity.registration_number,
          entity.country,
          entity.vat_number,
          entity.address,
          entity.currency,
        ],
      )
      // Relu plutôt que rendu par `RETURNING` : sur un conflit, `RETURNING` ne
      // rend AUCUNE ligne, et la société existante n'aurait alors pas d'id —
      // toutes les missions repartiraient non rattachées à la deuxième remise à
      // neuf, sans que rien ne le montre.
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `SELECT id FROM legal_entities WHERE workspace_id = $1 AND lower(name) = lower($2)`,
        [workspaceId, entity.name],
      )
      if (row) legalEntityIds.set(entity.name, row.id)
      else this.logger.warn(`Société de démonstration « ${entity.name} » introuvable après écriture.`)
    }

    /**
     * #2422.4 (épopée #2869, LAU-FINAL-136) — UN CONTRAT JURIDIQUE, sur le
     * même dossier vedette que la ligne de crédit de site juste au-dessus
     * (« un visiteur n'ouvre jamais le client fictif depuis /accounts » vaut
     * ici aussi). `ON CONFLICT DO NOTHING` sur l'unique paire
     * `(account_id, lower(label))` que la migration pose : une remise à neuf
     * de la salle ne duplique pas la ligne.
     *
     * Signé, fenêtre PASSÉE→FUTURE (`legalContractLifecycle` la lit `active`),
     * société ESN résolue via `legalEntityIds` (bloc juste au-dessus, ÉCRIT
     * avant d'être LU depuis le 28/09/2026) plutôt que par une constante
     * d'id : dupliquer l'id ici le ferait diverger si la société venait à
     * être renommée.
     */
    if (flagshipAccountId) {
      await this.accounts.manager.query(
        `INSERT INTO legal_contracts
           (workspace_id, account_id, type, label, counterparty_name, legal_entity_id, owner_id,
            starts_on, ends_on, scope, source, status, documents)
         VALUES ($1, $2, 'framework', 'Contrat-cadre Société Générale 2026', $3, $4, $5, $6, $7, $8, 'direct', 'signed', $9::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          flagshipAccountId,
          'Société Générale',
          legalEntityIds.get('BELLUM CONSEIL') ?? null,
          ownerUserId,
          // `dateOnly(joursÉcoulés)` de ce fichier compte les jours ÉCOULÉS
          // depuis maintenant (positif = passé), tronqué en `date` — même
          // fonction que `missions.started_on`/`ends_on` plus bas. Fenêtre
          // PASSÉE→FUTURE : signé il y a 180 jours, encore valide dans 185.
          dateOnly(180),
          dateOnly(-185),
          'Prestations de conseil et de régie, France entière.',
          // #2422.10 (lot X54) — des PIÈCES, dont une réservée à `finance:read` :
          // le visiteur voit la version, la signature et la portée de lecture.
          JSON.stringify([
            {
              label: 'Contrat-cadre signé',
              url: null,
              version: 1,
              signedAt: dateOnly(180),
              expiresOn: dateOnly(-185),
              visibility: 'workspace',
            },
            {
              label: 'Grille tarifaire (annexe 2)',
              url: null,
              version: 2,
              signedAt: dateOnly(90),
              expiresOn: dateOnly(-185),
              visibility: 'finance',
            },
          ]),
        ],
      )
    }

    /**
     * #2151.23 / #2151.61 — L'ALERTE DE DÉCOUVRIR DANS « AUJOURD'HUI ».
     *
     * Le bloc du brief lit `discover_alert_events` : sans une ligne ici, un
     * prospect ouvrirait Aujourd'hui sur « aucun déclenchement » et ne verrait
     * jamais à quoi ressemble une alerte — l'écran livré mais vide qui se
     * découvre en réunion.
     *
     * DEUX lignes, et pas une seule : c'est la deuxième qui enseigne la règle.
     *  - `new_signal` naît dans Aujourd'hui (genre urgent, `surface = 'today'`) ;
     *  - `new_relationship` naît SANS surface, et n'apparaît donc PAS dans
     *    Aujourd'hui — elle arrivera par la notification ou par le canal choisi,
     *    jamais par les deux (#2151.25). Le visiteur voit ainsi qu'Aujourd'hui
     *    trie, plutôt que de tout déverser.
     *
     * Les deux portent le compte FICTIF : elles disent qu'il s'est passé quelque
     * chose sur un dossier qui n'existe pas, jamais sur une entreprise réelle.
     * ⚠️ Rien ne PART d'une salle de démonstration — ces lignes s'affichent, et
     * l'émetteur sortant refuse les espaces de démonstration avant toute lecture.
     */
    for (const alert of [
      { kind: 'new_signal', surface: 'today', daysAgo: 1 },
      { kind: 'new_relationship', surface: null, daysAgo: 2 },
    ] as const) {
      await this.accounts.manager.query(
        `INSERT INTO discover_alert_events
           (workspace_id, kind, event_key, subject_id, subject_label, saved_view_id, surface, occurred_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
         ON CONFLICT (workspace_id, event_key) DO NOTHING`,
        [
          workspaceId,
          alert.kind,
          // La MÊME forme de clé que `discoverAlertEventKey` : genre, sujet,
          // jour. La semer autrement ferait qu'un balayage réel re-consignerait
          // le même fait sous une seconde clé — le doublon, semé par la démo.
          `${alert.kind}:${account.id}:${iso(alert.daysAgo).slice(0, 10)}`,
          account.id,
          client.account.company_name,
          alert.surface,
          iso(alert.daysAgo),
        ],
      )
    }

    // Le pipeline PARTENAIRE (tome 4). Trois ESN fictives, trois étapes : ce
    // qui se montre est le CYCLE, et le fait qu'un score n'existe pas avant
    // trois placements.
    const partnerRelationIdByName = new Map<string, string>()
    for (const partner of DEMO_PARTNER_RELATIONS) {
      // #3270 — les dix-sept champs de gouvernance, semés SEULEMENT pour les
      // deux ESN dont `DEMO_PARTNER_RELATIONS` porte un `governance` — les
      // deux autres gardent `null` partout (l'état de départ réel).
      const governance = partner.governance ?? {}
      const [row] = await this.accounts.manager.query(
        `INSERT INTO partner_relations
           (workspace_id, name, stage, roles, contact_name, notes,
            needs_received_90d, needs_given_90d, placements_active, placements_total, last_activity_at,
            non_solicitation, entry_door_scope, accounts_accessible, accounts_forbidden, profiles_sought,
            domains_covered, margin_floor_percent, margin_share_percent, account_ownership, action_ownership,
            presentation_terms, payment_terms, delay_terms, our_contact_name, our_contact_email,
            duration_terms, exit_conditions, referencing_proof, confidentiality_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                 $22, $23, $24, $25, $26, $27, $28, $29, $30)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          partner.name,
          partner.stage,
          partner.roles,
          partner.contactName,
          partner.notes,
          partner.needsReceived90d,
          partner.needsGiven90d,
          partner.placementsActive,
          partner.placementsTotal,
          iso(partner.lastActivityDaysAgo),
          partner.nonSolicitation,
          governance.entryDoorScope ?? null,
          governance.accountsAccessible ?? null,
          governance.accountsForbidden ?? null,
          governance.profilesSought ?? null,
          governance.domainsCovered ?? null,
          governance.marginFloorPercent ?? null,
          governance.marginSharePercent ?? null,
          governance.accountOwnership ?? null,
          governance.actionOwnership ?? null,
          governance.presentationTerms ?? null,
          governance.paymentTerms ?? null,
          governance.delayTerms ?? null,
          governance.ourContactName ?? null,
          governance.ourContactEmail ?? null,
          governance.durationTerms ?? null,
          governance.exitConditions ?? null,
          governance.referencingProof ?? null,
          governance.confidentialityLevel ?? null,
        ],
      )
      if (row?.id) partnerRelationIdByName.set(partner.name, row.id)
    }

    /**
     * #3404.5 — LE LIEN ENTRE LA PRÉSENCE RANG 2 (`client.partners`, insérée
     * plus haut) ET LE CADRE GOUVERNÉ (`DEMO_PARTNER_RELATIONS`, ci-dessus) —
     * après coup, parce que la seconde table n'existait pas encore à la
     * première insertion. `partnerRelationIdByName` porte déjà l'id : même
     * nom des deux côtés (« mc2i »), par construction.
     */
    const haldenRelationId = partnerRelationIdByName.get('mc2i')
    if (haldenRelationId) {
      await this.accounts.manager.query(
        `UPDATE account_partners SET partner_relation_id = $1
         WHERE workspace_id = $2 AND account_id = $3 AND lower(name) = lower($4)`,
        [haldenRelationId, workspaceId, account.id, 'mc2i'],
      )
      // #3270.6 (recette prod 02/10) — la MÊME présence rang 2, liée au MÊME
      // cadre, sur Société Générale : c'est le tiroir de ses opportunités que
      // la recette ouvre, et `ProjectPartnerGovernancePanel` ne se rend que
      // pour un compte qui porte une ESN rang 2 gouvernée. Aucune relation
      // neuve : le lien `partner_relation_id` suit celle du client d'exemple.
      // Sans le compte SG dans la salle, le SELECT ne rend rien — rien ne s'écrit.
      // Décision Louis 04/10/2026 — mc2i est OBSERVÉE chez Société Générale
      // (relevé du compte) : la qualification rang 2 de l'équipe PROMEUT la
      // ligne observée, elle n'invente pas une présence.
      const haldenOnSg = DEMO_DELIVERY_CLIENT.partners.find(p => p.name === 'mc2i')
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, partner_relation_id)
         SELECT a.workspace_id, a.id, $3, 'rank2', 'partner', $4, 'analysis', 0, $5, $6, $2
           FROM accounts a
          WHERE a.workspace_id = $1 AND a.company_name = $7
         ON CONFLICT (account_id, lower(name)) DO UPDATE SET partner_relation_id = EXCLUDED.partner_relation_id,
           rank = 'rank2', relationship = 'partner'`,
        [
          workspaceId,
          haldenRelationId,
          'mc2i',
          haldenOnSg?.note ?? null,
          haldenOnSg?.certainty ?? null,
          haldenOnSg?.scope ?? null,
          'Société Générale',
        ],
      )
    }

    /**
     * #2887 (#2371.8) — UNE revue de CV, sur le partenaire en flux actif
     * (« Talan / Talan Consulting »), vers la première du vivier (« Camille Roussel »,
     * `seedVivier` plus haut) : le geste RESTE montrable de bout en bout — le
     * brief et le TJM affichés viennent de la vraie fiche consultant, jamais
     * dupliqués ici. `margin_share_pct` porte une valeur déclarée, pour
     * montrer aussi la ligne « partage négocié » plutôt que son absence.
     */
    const astreaId = partnerRelationIdByName.get('Talan / Talan Consulting')
    if (astreaId) {
      const [camille] = await this.accounts.manager.query(
        `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
        [workspaceId, 'Camille Roussel'],
      )
      if (camille?.id) {
        await this.accounts.manager.query(
          `INSERT INTO partner_cv_pushes
             (workspace_id, partner_relation_id, consultant_id, margin_share_pct, status, outcome, prepared_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [workspaceId, astreaId, camille.id, 15, 'preparee', 'en_attente', ownerUserId],
        )
      }
    }

    // Les territoires suivis. L'ABONNEMENT est scopé à l'espace ; les PHOTOS
    // (`territory_snapshots`) sont PARTAGÉES et n'en portent donc aucun.
    for (const department of DEMO_TERRITORIES) {
      await this.accounts.manager.query(
        `INSERT INTO territory_subscriptions (workspace_id, user_id, department)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [workspaceId, ownerUserId, department],
      )
    }

    // TROIS photos par territoire, ÉTIQUETÉES `demo` (31/08/2026).
    //
    // Elles n'étaient pas seedées, et la raison écrite était juste : la table
    // est partagée, « en fabriquer de fausses ferait mentir la moyenne de tout
    // le monde ». Le prix en était un écran Marché MORT devant un prospect —
    // « Aucune photo encore prise », quatre fois.
    //
    // `source = 'demo'` lève l'objection sans la contourner : la médiane de
    // recrutement (`refreshBaselines`), le balayage du lundi et le tableau d'un
    // espace client lisent tous `'sweep'` et ne verront JAMAIS ces lignes.
    //
    // ⚠️ TROIS et non une : la variation se lit entre deux photos. Une seule
    // ferait répondre « non mesuré » partout — juste, et illisible en réunion.
    // Les dates sont calculées ici : figées, elles cesseraient d'être « la
    // semaine dernière » au premier lundi suivant.
    for (const photo of DEMO_TERRITORY_SNAPSHOTS) {
      const takenOn = new Date(Date.now() - photo.weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10)
      await this.accounts.manager.query(
        `INSERT INTO territory_snapshots
           (department, taken_on, offers, esn_present, open_tenders, awarded_contracts,
            buyers_with_incumbent, top_technologies, esn_hiring, collection_limits, source)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, 'demo')
         ON CONFLICT DO NOTHING`,
        [
          photo.department,
          takenOn,
          photo.offers,
          photo.esnPresent,
          photo.openTenders,
          photo.awardedContracts,
          photo.buyersWithIncumbent,
          JSON.stringify(photo.topTechnologies),
          JSON.stringify(photo.esnHiring),
          // Les MÊMES bornes que la collecte réelle : une salle qui montrerait
          // des bornes inventées ne démontrerait pas le produit.
          JSON.stringify(TERRITORY_COLLECTION_LIMITS),
        ],
      )
    }

    // TROIS mois de photos des indicateurs de stock. Sans elles, les tuiles de
    // `/pilotage` et les huit lignes de `/pilotage/qualite` s'ouvrent sans
    // aucune tendance devant un prospect — l'écran que ce chantier remplit.
    //
    // ⚠️ Trois et non une : depuis que la variation se lit entre DEUX PHOTOS
    // (`metricDelta`), un seul mois semé ferait répondre « non mesuré » partout,
    // ce qui est juste et se lit en réunion comme un produit qui ne mesure pas.
    //
    // Les dates sont calculées au semis : figées, elles cesseraient d'être « le
    // mois dernier » au premier changement de mois.
    for (const row of demoStockSnapshotRows(workspaceId)) {
      await this.accounts.manager.query(
        `INSERT INTO stock_snapshots (workspace_id, taken_on, metric_key, value, provenance, denominator)
         VALUES ($1, $2::date, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [row.workspaceId, row.takenOn, row.metricKey, row.value, row.provenance, row.denominator],
      )
    }

    // L'OBJECTIF MENSUEL DE MARGE (D7 du 26/08, levé le 31/08/2026).
    //
    // Sans lui, l'anneau « Taux de réalisation » de `/pilotage/finance` s'ouvre
    // sur « objectif non défini » devant un prospect — ce qui est le
    // comportement JUSTE, et se lit en réunion comme un écran vide. La salle est
    // un décor assumé : elle montre la capacité, pas l'absence de capacité.
    //
    // ⚠️ TROIS mois, et les mêmes que les photos ci-dessus : le sélecteur de
    // période ouvre sur le mois PRÉCÉDENT, et un objectif posé sur le seul mois
    // courant laisserait l'écran d'arrivée sans cible. Les mois sont CALCULÉS,
    // jamais écrits en dur — un objectif figé sur « 2026-08 » cesserait d'être
    // trouvé au premier changement de mois, et l'anneau redeviendrait muet sans
    // qu'aucun test ne rougisse.
    //
    // ⚠️ `DO NOTHING` ici, alors que la SAISIE fait `DO UPDATE` : le semis ne
    // doit jamais écraser un objectif qu'un visiteur de la salle vient de poser
    // lui-même. Le geste humain gagne, y compris en démonstration.
    for (const target of demoMarginTargets()) {
      await this.accounts.manager.query(
        `INSERT INTO finance_margin_targets (workspace_id, month, target_percent)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, month) DO NOTHING`,
        [workspaceId, target.month, target.targetPercent],
      )
    }

    // #2770.37 — LA POLITIQUE D'ÉQUIPE (Réglages › Équipe), lue par Laura quand elle
    // organise une journée. Même discipline que l'objectif de marge juste au-dessus :
    // `DO NOTHING`, le semis n'écrase jamais une politique qu'un visiteur vient de poser.
    await this.accounts.manager.query(
      `INSERT INTO workspace_team_policy_settings
         (workspace_id, prospecting_windows, forbidden_windows, max_meetings_per_day, daily_call_target)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
       ON CONFLICT (workspace_id) DO NOTHING`,
      [
        workspaceId,
        JSON.stringify(DEMO_TEAM_POLICY.prospectingWindows),
        JSON.stringify(DEMO_TEAM_POLICY.forbiddenWindows),
        DEMO_TEAM_POLICY.maxMeetingsPerDay,
        DEMO_TEAM_POLICY.dailyCallTarget,
      ],
    )

    // Les entités : la porte de filiale, lue depuis la TABLE par l'onglet Accès.
    //
    // ⚠️ Elles portent AUSSI le dossier de facturation (26/08/2026), lu par la
    // lentille delivery de `/accounts`. `contactIdsByName` est rempli plus haut
    // (le semis des contacts précède celui-ci), donc le contact de facturation
    // se résout ici sans rien lire d'à moitié écrit.
    //
    // ⚠️ Aucune DATE FIGÉE : l'échéance du contrat est calculée au semis, comme
    // la photo des stocks juste au-dessus. Écrite en dur, elle finirait par
    // afficher « contrat expiré » toute seule dans quelques mois, et la salle
    // montrerait un bloqueur que personne n'a voulu.
    for (const entity of client.entities) {
      const billing = entity.billing
      const billingContactId = billing ? (contactIdsByName.get(billing.contactName) ?? null) : null
      if (billing && !billingContactId) {
        this.logger.warn(
          `Entité de démonstration « ${entity.name} » : contact de facturation « ${billing.contactName} » introuvable — le dossier partira sans contact.`,
        )
      }
      await this.accounts.manager.query(
        // ⚠️ Les colonnes d'IDENTITÉ (31/08/2026) sont ajoutées EN FIN de liste,
        // comme partout dans ce fichier : insérées au milieu, elles décaleraient
        // chaque `$n` et les gardes qui lisent ces paramètres PAR RANG liraient
        // la mauvaise valeur en restant vertes.
        `INSERT INTO account_entities
           (workspace_id, account_id, name, kind, is_default, rank1_incumbent,
            is_billing, legal_name, payment_terms_days, contract_expires_on, billing_contact_id,
            siren, siret, identity_source, identity_checked_on)
         VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14::date)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          account.id,
          entity.name,
          entity.kind,
          entity.rank1,
          billing !== null,
          billing?.legalName ?? null,
          // VIDE À DESSEIN sur le jeu d'exemple : c'est le bloqueur
          // « conditions de règlement inconnues » que la lentille doit montrer.
          billing?.paymentTermsDays ?? null,
          billing ? dateOnly(-billing.contractExpiresInDays) : null,
          billingContactId,
          // Le SIREN et le SIRET de la carte du portefeuille. Le numéro échoue
          // volontairement la clé de Luhn : il ne peut désigner aucune
          // entreprise réelle (voir `demo-dataset.ts`).
          entity.siren,
          entity.siret,
          // La preuve d'identité : la source ET la date, ou aucune des deux.
          // ⚠️ La date est CALCULÉE au semis, jamais figée — écrite en dur, elle
          // vieillirait de mois en mois et la démonstration finirait par
          // montrer une vérification abandonnée depuis deux ans.
          entity.identity?.source ?? null,
          entity.identity ? dateOnly(entity.identity.checkedDaysAgo) : null,
        ],
      )
    }

    // Ce qu'on sait de l'accès. Le fait de VERROUILLAGE est en provenance
    // `pipeline`, le COÛT en provenance `human` : c'est la démonstration de la
    // règle d'arbitrage — une déclaration humaine ne se fait jamais écraser par
    // une réanalyse.
    for (const fact of client.accessFacts) {
      await this.accounts.manager.query(
        `INSERT INTO access_facts
           (workspace_id, account_id, kind, value, detail, source, provenance, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          account.id,
          fact.kind,
          fact.value,
          fact.detail,
          fact.source,
          fact.provenance,
          iso(fact.observedDaysAgo),
        ],
      )
    }

    const [project] = await this.accounts.manager.query<{ id: string }[]>(
      // ⚠️ `expected_close_on` est AJOUTÉE EN FIN de liste, comme partout dans
      // ce fichier : insérée au milieu, elle décalerait chaque `$n` et les
      // gardes qui lisent ces paramètres PAR RANG liraient la mauvaise valeur
      // en restant vertes.
      //
      // ⚠️ Et c'est `dateOnly`, jamais `iso` : la colonne est de type `date`.
      // Un horodatage complet y passerait le typage et ferait dépendre la
      // valeur de l'heure de la visite — le défaut « un seed doit avoir la
      // forme que l'écran lit », déjà payé deux fois dans ce fichier.
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at,
          amount_cents, estimated_amount, currency, closed_at, outcome, first_detected_at,
          application_sector_codes, primary_domain_code, expected_close_on)
       VALUES ($1, $2, 'besoin', $3, $4, 'won', $5, $6, $7, 'EUR', $5, 'won', $8, $9::text[], $10, $11::date)
       RETURNING id`,
      [
        workspaceId,
        account.id,
        client.project.label,
        client.project.detail,
        iso(30),
        client.project.amount_cents,
        client.project.amount_cents / 100,
        iso(45),
        client.project.application_sector_codes,
        client.project.primary_domain_code,
        dateOnly(-client.project.expected_close_in_days),
      ],
    )
    if (!project) return

    // Les consultants sont déjà seedés : on les retrouve par leur nom plutôt que
    // de les recréer. Un profil dupliqué dans le vivier se verrait tout de suite.
    const consultantRows = await this.accounts.manager.query<{ id: string; full_name: string }[]>(
      `SELECT id, full_name FROM consultants WHERE workspace_id = $1`,
      [workspaceId],
    )
    const byName = new Map(consultantRows.map(row => [row.full_name, row.id]))

    for (const submission of client.submissions) {
      const consultantId = byName.get(submission.consultant)
      // Un positionnement sans consultant retrouvé est SAUTÉ, pas inventé : une
      // ligne orpheline afficherait un positionnement sans personne dedans.
      if (!consultantId) continue

      // #2189.39 (épopée #2940) — la prochaine action, toujours datée ET
      // attribuée : jamais l'une sans l'autre, même en démo.
      const nextActionLabel = 'next_action_label' in submission ? submission.next_action_label : null
      const nextActionDueDays =
        'next_action_due_days_from_now' in submission ? submission.next_action_due_days_from_now : undefined
      const nextActionDueAt = typeof nextActionDueDays === 'number' ? dateOnly(-nextActionDueDays) : null

      // #2887 (#2371.9) — l'accord du consultant, déclaré avant l'envoi
      // (#2320.18). `null` sur un jeu démo qui ne le seed pas, jamais deviné —
      // même garde que `channel`/`message` plus bas.
      const consultantAgreement = 'consultant_agreement' in submission ? submission.consultant_agreement : null
      const consultantAgreementDateDaysAgo =
        'consultant_agreement_date_days_ago' in submission ? submission.consultant_agreement_date_days_ago : undefined
      const consultantAgreementDate =
        consultantAgreement !== null && typeof consultantAgreementDateDaysAgo === 'number'
          ? dateOnly(consultantAgreementDateDaysAgo)
          : null

      // #3068 — IDEMPOTENT sur `submissions_unique` (project_id, consultant_id,
      // coalesce(need_id, uuid-zéro)) : une salle réparée pendant qu'un
      // visiteur l'occupe encore (`DemoPoolService.tidy('repair')` →
      // `DemoResetService.repairIfIncomplete`) purge `submissions` mais
      // retrouve le MÊME projet — un second passage republiait donc ce même
      // triplet, et l'`INSERT` nu faisait échouer TOUT le re-semis
      // (« duplicate key value violates unique constraint "submissions_unique" »,
      // vu en production le 28/09 sur la salle Société Générale : positionnements
      // manquants, semis figé à chaque entrée). `ON CONFLICT DO NOTHING` :
      // la ligne existe déjà, on ne la réécrit pas — comme `seedStaffedNeed`
      // un peu plus bas retrouve son `project_needs` avant d'écrire.
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO submissions
           (workspace_id, project_id, consultant_id, stage, substatus, stage_entered_at, submitted_at,
            first_feedback_at, closed_at, outcome_reason, outcome_detail, proposed_rate_cents, owner_id,
            channel, message, availability, conditions,
            next_action_label, next_action_due_at, next_action_owner_id,
            consultant_agreement, consultant_agreement_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
           DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          project.id,
          consultantId,
          submission.stage,
          // #2335.1 — `null` sur un jeu démo qui ne le seed pas : jamais deviné.
          'substatus' in submission ? submission.substatus : null,
          iso(submission.closed_days_ago),
          iso(submission.submitted_days_ago),
          submission.first_feedback_days_ago === null ? null : iso(submission.first_feedback_days_ago),
          iso(submission.closed_days_ago),
          submission.outcome_reason,
          'outcome_detail' in submission ? submission.outcome_detail : null,
          submission.proposed_rate_cents,
          ownerUserId,
          // #2177.24 / .8 / .28 / .30 — même garde que `substatus` ci-dessus :
          // `null` sur un jeu démo qui ne les seed pas, jamais deviné.
          'channel' in submission ? submission.channel : null,
          'message' in submission ? submission.message : null,
          'availability' in submission ? submission.availability : null,
          'conditions' in submission ? submission.conditions : null,
          nextActionLabel,
          nextActionDueAt,
          nextActionLabel ? ownerUserId : null,
          // #2887 (#2371.9) — l'accord du consultant, déclaré avant l'envoi.
          consultantAgreement,
          consultantAgreementDate,
        ],
      )
      if (!row) continue

      if (submission.feedback) {
        await this.accounts.manager.query(
          `INSERT INTO submission_feedback
             (submission_id, workspace_id, technical, experience, communication, price, verbatim, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            row.id,
            workspaceId,
            submission.feedback.technical,
            submission.feedback.experience,
            submission.feedback.communication,
            submission.feedback.price,
            submission.feedback.verbatim,
            ownerUserId,
          ],
        )
      }

      // #2335.5 — le retour CONSULTANT, une table séparée du retour client
      // (`submission_feedback` ci-dessus) : jamais le même bloc.
      // `'consultant_feedback' in submission` prouve la PRÉSENCE de la clé,
      // pas l'absence d'`undefined` sur sa valeur — la constante locale porte
      // le narrowing pour TypeScript comme pour le lecteur.
      if ('consultant_feedback' in submission && submission.consultant_feedback) {
        const cf = submission.consultant_feedback
        await this.accounts.manager.query(
          `INSERT INTO submission_consultant_feedback
             (submission_id, workspace_id, interest, understanding, manager, mission, conditions, concerns, availability, decision, verbatim, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            row.id,
            workspaceId,
            cf.interest,
            cf.understanding,
            cf.manager,
            cf.mission,
            cf.conditions,
            cf.concerns,
            cf.availability,
            cf.decision,
            cf.verbatim,
            ownerUserId,
          ],
        )
      }

      if (submission.interview_days_ago !== null) {
        await this.accounts.manager.query(
          `INSERT INTO interviews (submission_id, workspace_id, scheduled_at, mode, client_attendees, outcome, notes)
           VALUES ($1, $2, $3, 'remote', $4, 'positive', $5)`,
          [
            row.id,
            workspaceId,
            iso(submission.interview_days_ago),
            ['Responsable exploitation', 'Architecte plateforme'],
            'Échange technique d’une heure. Le client confirme le besoin d’astreinte.',
          ],
        )
      }
    }

    /**
     * #2329.35-.41 (épopée #2948) — le consentement à représenter, PAR
     * COMPTE, sur les deux talents déjà positionnés sur CE compte ci-dessus :
     * sans semis, la porte G4 ne montrerait jamais que « jamais demandé » en
     * démonstration, et le cas REFUS (celui qui bloque vraiment) resterait
     * invisible devant un prospect.
     *
     * Yanis Berthier — accord donné, aucune restriction : le chemin « ok ».
     * Salomé Dufour — refus EXPLICITE pour CE compte : le chemin qui bloque
     * réellement la porte, distinct d'un consentement simplement absent.
     */
    const yanisId = byName.get('Yanis Berthier')
    const salomeId = byName.get('Salomé Dufour')
    if (yanisId) {
      await this.accounts.manager.query(
        `INSERT INTO consultant_account_consent
           (workspace_id, consultant_id, account_id, can_store, can_contact, can_represent, source, recorded_at)
         VALUES ($1, $2, $3, true, true, true, $4, $5)`,
        [workspaceId, yanisId, account.id, 'Accord donné en entretien', iso(30)],
      )
    }
    if (salomeId) {
      await this.accounts.manager.query(
        `INSERT INTO consultant_account_consent
           (workspace_id, consultant_id, account_id, can_store, can_contact, can_represent, restrictions, source, recorded_at)
         VALUES ($1, $2, $3, true, true, false, $4, $5, $6)`,
        [
          workspaceId,
          salomeId,
          account.id,
          'Ancien employeur du groupe — ne pas la présenter ici',
          'Écrit par la personne le 12/09',
          iso(30),
        ],
      )
    }

    // Le mois que l'écran « Prêt à facturer » regarde par défaut est le mois
    // PRÉCÉDENT : un relevé posé sur le mois courant n'apparaîtrait nulle part.
    const previous = new Date(now)
    previous.setDate(1)
    previous.setMonth(previous.getMonth() - 1)
    // ⚠️ `localMonthKey` et non `toISOString()` : le 1er du mois à 00 h 30 à
    // Paris, l'instant UTC est encore le dernier jour du mois d'AVANT — le semis
    // aurait posé ses relevés deux mois en arrière et l'écran « Prêt à facturer »
    // se serait vidé chaque nuit.
    const periodMonth = `${localMonthKey(previous)}-01`

    /**
     * Le 1er d'un mois passé, en clé locale — même précaution que ci-dessus :
     * un `toISOString()` sur le 1er à 00 h 30 à Paris retomberait sur le mois
     * d'avant, et l'historique de dérive glisserait d'un cran chaque nuit.
     */
    const monthStart = (monthsAgo: number, from: number): string => {
      const at = new Date(from)
      at.setDate(1)
      at.setMonth(at.getMonth() - monthsAgo)
      return `${localMonthKey(at)}-01`
    }

    /**
     * ⚠️ UN projet par mission — la contrainte l'exige, et le semis la violait.
     *
     * `missions_opportunity_uniq` (migration `1790140000001`, BEL-FIX-001) est un
     * index UNIQUE sur `missions(opportunity_id)` : un projet porte **au plus une**
     * mission. Le semis rattachait les CINQ missions du client d'exemple au MÊME
     * projet — la deuxième violait donc la contrainte.
     *
     * Pourquoi ça n'est jamais sorti : les salles du pool avaient été semées AVANT
     * que cet index n'existe, et le semis n'avait plus jamais été rejoué. C'est la
     * réparation d'une salle tronquée — livrée le 28/08 — qui l'a rejoué pour la
     * première fois, et le `POST /demo/session` est parti en 500 pour TOUS les
     * prospects. Du code juste, jamais RE-exécuté : la variante la plus discrète
     * du défaut n°1 de ce dépôt.
     *
     * La première mission garde le projet gagné du client (c'est lui que les
     * positionnements portent) ; chacune des suivantes reçoit le sien, gagné lui
     * aussi, nommé d'après elle. Aucune donnée inventée : le libellé, le montant
     * et les dates viennent de la mission qu'il porte.
     */
    let missionIndex = 0

    /**
     * Le moment du REJET — jamais avant la clôture du mois qu'il concerne, et
     * jamais dans le futur.
     *
     * Un relevé se dépose une fois le mois fini ; il ne peut donc pas avoir été
     * refusé avant. Or `rejected_days_ago` se compte depuis AUJOURD'HUI : les
     * premiers jours d'un mois, « il y a onze jours » tombe DANS le mois que le
     * relevé couvre, et la salle afficherait « rejeté le 20 » sur le relevé de
     * ce même mois — une date qui se contredit elle-même, visible seulement
     * quelques jours par mois, c'est-à-dire le genre de défaut qu'on découvre
     * en réunion.
     *
     * Le premier jour du mois COURANT est par construction postérieur à la
     * clôture du mois précédent : c'est le plancher. Le plafond est l'instant
     * présent, parce que ce plancher peut être postérieur à `now` quand la
     * démonstration tourne le 1er du mois avant 9 h 12 UTC.
     */
    // ⚠️ Le mois COURANT se lit sur le MÊME calendrier que `periodMonth`, qui
    // est local. Les deux étaient sur deux horloges : `periodMonth` avait été
    // corrigé pour l'heure locale (GA-126) et ce plancher était resté en UTC,
    // si bien que le 1er du mois avant 02 h 00 le plancher désignait le mois
    // que le relevé COUVRE au lieu du suivant. Deux horloges dans un même
    // calcul de dates ne se voient jamais dans un test qui tourne à midi.
    const currentMonthStart = new Date(`${localMonthKey(new Date(now))}-01T09:12:00.000Z`)
    const rejectedAt = (offsetDays: number): string =>
      new Date(Math.min(now, Math.max(currentMonthStart.getTime(), now - offsetDays * day))).toISOString()
    /**
     * #2415.7 — la DEADLINE de correction, dérivée du MÊME jour de rejet que
     * `rejectedAt` plus une marge — jamais une date indépendante qui pourrait
     * tomber avant le rejet lui-même. `graceDays` par défaut (7) : le délai
     * ordinaire laissé pour corriger et redéposer un relevé.
     */
    const correctionDeadline = (offsetDays: number, graceDays = 7): string =>
      new Date(Math.min(now, Math.max(currentMonthStart.getTime(), now - offsetDays * day)) + graceDays * day)
        .toISOString()
        .slice(0, 10)

    /**
     * L'id de chaque mission, PAR LIBELLÉ — pour l'historique de facturation.
     *
     * ⚠️ Il se remplit DANS la boucle, et l'historique s'écrit après elle. Une
     * facture pend d'une mission par une clé étrangère `NOT NULL` : l'écrire
     * avant reviendrait à lire une table que personne n'a encore remplie, et le
     * seed sauterait chaque ligne en silence — le défaut mesuré en production le
     * 28/08 sur les affectations (« Personne d'affecté » sur sept missions).
     */
    const missionIds = new Map<string, string>()

    // #2869 (lot V5, 28/09/2026) — `legalEntityIds` (les deux sociétés de
    // l'ESN) est désormais écrit PLUS HAUT dans cette fonction, avant le
    // contrat juridique de Société Générale qui le lit aussi : voir le commentaire
    // à sa nouvelle place. Ce qui suit continue de le LIRE, jamais de le
    // réécrire une seconde fois.

    for (const mission of client.missions) {
      const missionProjectId = await this.projectForMission(
        workspaceId,
        ownerUserId,
        account.id,
        project.id,
        mission,
        missionIndex,
        iso,
      )
      missionIndex += 1

      /**
       * QUI SIGNE — le nom du jeu de données, résolu sur les fiches écrites
       * plus haut.
       *
       * Un nom qui ne résout pas ne casse RIEN : la mission part avec `null`,
       * qui est un état que le produit sait afficher (« contact de facturation
       * inconnu »). Mais il ne passe pas en SILENCE : c'est le silence, et lui
       * seul, qui avait laissé sept missions sans personne d'affecté sur le lien
       * public. Une salle amputée qui le dit se répare ; une salle amputée qui
       * se tait se découvre en réunion.
       */
      let billingContactId: string | null = null
      if (mission.billing_contact) {
        billingContactId = contactIdsByName.get(mission.billing_contact) ?? null
        if (!billingContactId) {
          this.logger.warn(
            `Mission de démonstration « ${mission.label} » : contact de facturation « ${mission.billing_contact} » introuvable — la ligne partira sans contact.`,
          )
        }
      }

      /**
       * QUI VALIDE LE RELEVÉ — le contact CRA (30/08/2026, panneau latéral de
       * planification, PDF-22 §7), même résolution et même filet que le
       * contact de facturation juste au-dessus : un nom qui ne résout pas part
       * en `null` et le DIT dans le journal, il ne casse rien en silence.
       */
      let craContactId: string | null = null
      if (mission.cra_contact) {
        craContactId = contactIdsByName.get(mission.cra_contact) ?? null
        if (!craContactId) {
          this.logger.warn(
            `Mission de démonstration « ${mission.label} » : contact CRA « ${mission.cra_contact} » introuvable — la ligne partira sans contact.`,
          )
        }
      }

      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        // `contract_kind` et `role_title` voyagent avec : sans eux, les trois
        // missions de démonstration se ressembleraient, et l'écran des relevés
        // réclamerait un CRA au forfait — exactement le faux positif qu'on
        // vient de supprimer.
        // ⚠️ `stage_entered_at` voyage AVEC : sans lui, la colonne « Dans ce
        // statut » de la liste lit le défaut `now()` et les sept missions de la
        // salle affichent toutes « depuis 0 jour ». Un tableau dont une colonne
        // rend la même valeur partout ne montre pas ce qu'elle sert à voir.
        // ⚠️ `billing_contact_id` voyage AVEC, et il n'y était pas : sans lui,
        // `assessInvoiceReadiness` posait `missing_billing_contact` sur les SEPT
        // missions de la salle — les deux « prêtes à facturer » comprises. Un
        // prospect ouvrait donc un écran « Prêt à facturer » où rien ne l'était,
        // et le badge « a signé N missions » n'avait aucune ligne à rendre.
        // Le paramètre est CASTÉ : ces `null`-là sont ceux que Postgres ne sait
        // plus typer dès que la requête devient un `INSERT … SELECT`, et c'est
        // ce qui avait déjà mis `POST /demo/session` en 500 dans ce fichier.
        // ⚠️ Les colonnes sont AJOUTÉES EN FIN de liste : insérée au milieu,
        // l'une d'elles décalerait chaque `$n` et les gardes qui lisent ces
        // paramètres par rang liraient la mauvaise valeur en restant vertes.
        // `cra_contact_id` (30/08/2026) suit le même motif que
        // `billing_contact_id` juste au-dessus.
        // ⚠️ `legal_entity_id` est AJOUTÉ EN FIN de liste (01/09/2026), pour la
        // raison écrite juste au-dessus : inséré au milieu, il décalerait chaque
        // `$n` et les gardes qui lisent ces paramètres par rang liraient la
        // mauvaise valeur en restant vertes.
        // ⚠️ `renewal_status` et son horodatage sont AJOUTÉS EN FIN de liste
        // (16/09/2026), pour la raison écrite juste au-dessus. `renewal_status_by`
        // n'est PAS semé : la salle n'a qu'un utilisateur, et lui attribuer la
        // décision ferait dire à l'écran « posé par vous » sur des lignes que le
        // prospect vient de découvrir. `null` = « on ne sait pas qui », qui est
        // la vérité d'un jeu de démonstration.
        // ⚠️ `renewal_client_rail`/`renewal_consultant_rail` (#2413.49 à .57,
        // épopée #2965) suivent la MÊME règle, EN FIN de liste.
        `INSERT INTO missions
           (workspace_id, user_id, account_id, opportunity_id, label, status, started_on, ends_on, daily_rate,
            contract_kind, role_title, owner_id, stage_entered_at, billing_contact_id, cra_contact_id,
            legal_entity_id, renewal_status, renewal_status_at, renewal_client_rail, renewal_consultant_rail,
            end_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $2, $12::timestamptz, $13::uuid, $14::uuid, $15::uuid,
                 $16::text, $17::timestamptz, $18::jsonb, $19::jsonb, $20::text)
         RETURNING id`,
        [
          workspaceId,
          ownerUserId,
          account.id,
          missionProjectId,
          mission.label,
          mission.status,
          dateOnly(mission.started_days_ago),
          mission.ends_in_days === null ? null : dateOnly(-mission.ends_in_days),
          mission.daily_rate,
          mission.contract_kind,
          mission.role_title,
          // Jamais postérieur au démarrage : on n'entre pas dans un statut
          // avant d'avoir commencé. `Math.min` borne les deux sens.
          iso(Math.min(mission.stage_entered_days_ago ?? 0, mission.started_days_ago)),
          billingContactId,
          craContactId,
          // Une mission ABSENTE de la table de rattachement part `null`, et
          // c'est le cas qu'un prospect doit voir : il explique pourquoi la
          // somme des deux sociétés est inférieure au total « toutes ».
          legalEntityIds.get(DEMO_MISSION_LEGAL_ENTITY[mission.label] ?? '') ?? null,
          // #2195.22 à .29 — le statut de la RECONDUCTION, distinct du statut de
          // la MISSION juste au-dessus. `?? null` et jamais `?? 'non_engage'` :
          // une mission sans statut dans le jeu est « personne n'a encore ouvert
          // cette ligne », et la replier sur un constat serait exactement le
          // « non mesuré rendu à zéro » que cet écran existe pour éviter.
          mission.renewal_status ?? null,
          // La date accompagne la valeur ou reste `null` avec elle : un statut
          // sans date se lirait comme une nouvelle fraîche pour toujours.
          // Douze jours en arrière — assez pour que « depuis quand ? » ait une
          // réponse lisible, assez peu pour qu'elle ne soit pas périmée.
          mission.renewal_status ? iso(12) : null,
          // #2413.49 à .52 — le rail CLIENT, `?? null` : un rail jamais ouvert
          // dans le jeu de données, jamais un rail à `non_demande` inventé.
          mission.renewal_client_rail ? JSON.stringify(mission.renewal_client_rail) : null,
          // #2413.53 à .56 — le rail CONSULTANT, même règle.
          mission.renewal_consultant_rail ? JSON.stringify(mission.renewal_consultant_rail) : null,
          // #3068 — le motif TYPÉ de fin de mission (`missions.end_reason`,
          // migration `1796321339461-MissionEndChecklist`). `?? null` : une
          // mission sans motif dans le jeu est « personne n'a encore clos
          // cette ligne », jamais un motif deviné.
          mission.end_reason ?? null,
        ],
      )
      if (!row) continue
      missionIds.set(mission.label, row.id)

      // #2836 — le MANAGER CLIENT, écrit APRÈS l'INSERT plutôt que dans sa
      // liste de colonnes : les gardes du semis lisent ses `$n` par rang, et
      // un paramètre de plus les décalerait. Même filet que le contact CRA :
      // un nom qui ne résout pas part en `null` et le dit dans le journal.
      // Refonte Théo MISSIONS-A — l'OBJECTIF et le PÉRIMÈTRE de la carte d'identité du dossier, écrits APRÈS
      // l'INSERT pour la même raison que le manager client ci-dessous (les `$n` de l'INSERT se lisent par rang).
      const frame = DEMO_MISSION_FRAME[mission.label]
      if (frame) {
        await this.accounts.manager.query(
          `UPDATE missions SET objective = $1, perimeter = $2 WHERE id = $3 AND workspace_id = $4`,
          [frame.objective, frame.perimeter, row.id, workspaceId],
        )
      }

      const clientManagerName = DEMO_MISSION_CLIENT_MANAGER[mission.label]
      if (clientManagerName) {
        const clientManagerId = contactIdsByName.get(clientManagerName) ?? null
        if (clientManagerId) {
          await this.accounts.manager.query(
            `UPDATE missions SET client_manager_contact_id = $1 WHERE id = $2 AND workspace_id = $3`,
            [clientManagerId, row.id, workspaceId],
          )
        } else {
          this.logger.warn(
            `Mission de démonstration « ${mission.label} » : manager client « ${clientManagerName} » introuvable — la ligne partira sans manager client.`,
          )
        }
      }

      // #3413 « autre BU » — le transfert semé, écrit APRÈS l'INSERT (même raison
      // que le manager client : les `$n` de l'INSERT sont lus par rang). Même
      // forme que le geste réel : la colonne de la mission ET la ligne du journal.
      const transfer = DEMO_MISSION_BUSINESS_UNIT_TRANSFER[mission.label]
      if (transfer) {
        const targetBuId = await this.demoBusinessUnitId(workspaceId, transfer.toBusinessUnit)
        if (targetBuId) {
          await this.accounts.manager.query(
            `UPDATE missions SET business_unit_id = $1 WHERE id = $2 AND workspace_id = $3`,
            [targetBuId, row.id, workspaceId],
          )
          await this.accounts.manager.query(
            `INSERT INTO record_field_audit
               (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id, rule, created_at)
             VALUES ($1, 'mission', $2, 'business_unit_id', $3, $4, 'human', $5, 'mission_business_unit_transfer', $6::timestamptz)`,
            [
              workspaceId,
              row.id,
              transfer.fromBusinessUnit,
              transfer.toBusinessUnit,
              ownerUserId,
              iso(transfer.daysAgo),
            ],
          )
        } else {
          this.logger.warn(
            `Mission de démonstration « ${mission.label} » : BU cible « ${transfer.toBusinessUnit} » introuvable — le transfert n'est pas semé.`,
          )
        }
      }

      const consultantId = byName.get(mission.consultant)
      if (consultantId) {
        // #2407.4 (suite) — consentement, documents, risques DÉCLARÉS : UNE
        // seule affectation les porte (la mission terminée de Camille
        // Roussel), pour que l'onglet « Qui est dessus » ne s'ouvre pas muet
        // sur cette capacité (craft rule n°9) — les huit autres missions
        // restent `null`, l'état « non renseigné » que le produit sait dire.
        const isDeclaredExample = mission.label === 'Migration du socle applicatif vers les conteneurs — lot 1'
        await this.accounts.manager.query(
          `INSERT INTO mission_assignments
             (mission_id, workspace_id, consultant_id, load_percent, starts_on, ends_on,
              consent_given, consent_date, documents_expected, documents_received, declared_risks)
           VALUES ($1, $2, $3, 100, $4, $5, $6, $7::date, $8, $9, $10)`,
          [
            row.id,
            workspaceId,
            consultantId,
            dateOnly(mission.started_days_ago),
            mission.ends_in_days === null ? null : dateOnly(-mission.ends_in_days),
            isDeclaredExample ? true : null,
            isDeclaredExample ? dateOnly(mission.started_days_ago) : null,
            isDeclaredExample ? 'Casier judiciaire, habilitation sécurité site client' : null,
            isDeclaredExample ? 'Casier judiciaire' : null,
            isDeclaredExample ? 'Dépendance à un seul expert sur la bascule des conteneurs' : null,
          ],
        )

        /**
         * #3068 — LA DÉCLARATION D'INTERRUPTION, NON CONFIRMÉE.
         *
         * `availability_confirmed: false` par construction (même garde que
         * `MissionEndService.declareInterruption`, jamais le même appel qui
         * la lèverait) : c'est le fait UNIQUE qui bascule `deriveStaffing`
         * en `a_confirmer` sur cette mission — vivier, stats, filtres — dès
         * que Léa Fontaine n'a plus d'affectation active. Voir le docblock de
         * sa mission (`DEMO_DELIVERY_CLIENT.missions`) pour pourquoi elle est
         * la seule à porter ce cas en démonstration.
         */
        if (mission.end_reason === 'interruption') {
          await this.accounts.manager.query(
            `INSERT INTO mission_interruptions
               (workspace_id, mission_id, responsibility, risk, confidentiality_acknowledged,
                non_solicitation_acknowledged, note, availability_confirmed, declared_by, declared_at)
             VALUES ($1, $2, $3, $4, true, true, $5, false, $6, $7::timestamptz)
             ON CONFLICT DO NOTHING`,
            [
              workspaceId,
              row.id,
              'client',
              'moyen',
              'Le client a mis fin au programme avant son terme faute de budget reconduit pour la suite.',
              ownerUserId,
              iso(mission.stage_entered_days_ago ?? 0),
            ],
          )
        }
      }

      // ⚠️ Les colonnes AJOUTÉES sont EN FIN de liste : insérées au milieu,
      // elles décaleraient chaque `$n` et les valeurs partiraient dans les
      // mauvaises colonnes sans qu'aucun type ne s'y oppose.
      //
      // `requires_po` porte le bloqueur « bon de commande exigé et absent », et
      // `partner_commission_daily_cents` la seconde moitié du coût d'une mission
      // intermédiée — les deux étaient LUES par le produit et écrites nulle
      // part jusqu'au 29/08/2026. La salle les remplit maintenant que le
      // formulaire des conditions commerciales sait les écrire : l'inverse
      // aurait montré en démonstration une capacité qu'aucun client n'a.
      //
      // `po_issued_on` / `po_amount_cents` / `po_volume_days` (30/08/2026) :
      // même histoire, un lot plus tard. Absentes du dataset (`undefined`),
      // elles partent `null` — c'est exactement le cas « volume non renseigné »
      // qu'une mission de la salle existe pour montrer.
      //
      // Les paramètres nullables SANS autre occurrence typée dans la requête
      // sont CASTÉS : Postgres cesse de déduire leur type dès qu'une requête
      // devient un `INSERT … SELECT` — c'est ce qui avait déjà mis
      // `POST /demo/session` en 500 dans ce fichier.
      await this.accounts.manager.query(
        // `payment_terms_days` / `payment_terms_basis` (30/08/2026, panneau
        // latéral de planification) — AJOUTÉES EN FIN, même motif que le bon
        // de commande juste au-dessus : absentes du dataset (`undefined`),
        // elles partent `null` sur les huit autres missions, l'état « délai
        // non renseigné » que le produit sait déjà afficher.
        `INSERT INTO mission_commercial_terms
           (mission_id, workspace_id, loaded_daily_cost_cents, channel, po_number, billing_cadence, notice_days,
            requires_po, partner_commission_daily_cents, po_issued_on, po_amount_cents, po_volume_days,
            payment_terms_days, payment_terms_basis,
            cost_source, currency, cost_breakdown, cost_recorded_rate_cents, po_valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10::date, $11::bigint, $12::numeric,
           $13::integer, $14::text, $15::text, $16::text, $17::jsonb, $18::bigint, $19::date)`,
        [
          row.id,
          workspaceId,
          mission.loaded_daily_cost_cents,
          mission.channel,
          mission.po_number,
          mission.billing_cadence,
          mission.notice_days,
          mission.requires_po,
          mission.partner_commission_daily_cents,
          mission.po_issued_on_days_ago == null ? null : dateOnly(mission.po_issued_on_days_ago),
          mission.po_amount_cents ?? null,
          mission.po_volume_days ?? null,
          mission.payment_terms_days ?? null,
          mission.payment_terms_basis ?? null,
          // #2420 — le moteur de marge, AJOUTÉ EN FIN : source, devise,
          // décomposition et TJM de référence du coût. Absents du dataset, ils
          // partent `null` / `{}` — « source non déclarée », le noyau historique.
          mission.cost_source ?? null,
          mission.currency ?? null,
          JSON.stringify(mission.cost_breakdown ?? {}),
          mission.cost_recorded_rate_cents ?? null,
          // #2566.2 — AJOUTÉ EN FIN, même motif que les colonnes juste
          // au-dessus. Absent du dataset (`undefined`), il part `null` sur
          // les autres missions — « pas d'échéance connue », l'état que le
          // produit affiche déjà.
          mission.po_valid_until_days_ago == null ? null : dateOnly(mission.po_valid_until_days_ago),
        ],
      )

      // Les frais (30/08/2026) : SEULE la première mission en porte. Les huit
      // autres restent SANS ligne, à dessein — c'est ce qui garde visible l'état
      // le plus fréquent en clientèle, « marge hors frais », à côté de celui que
      // ce lot ajoute. `mission.expenses` est optionnel exprès : un tableau
      // vide et un champ absent produiraient la même absence, autant ne pas
      // écrire `[]` huit fois.
      // #2783 — les avenants de démonstration : `proposed`/`accepted` seulement,
      // jamais `active` (aucune application aux champs vivants de la mission).
      for (const amendment of mission.amendments ?? []) {
        await this.accounts.manager.query(
          `INSERT INTO mission_amendments
             (workspace_id, mission_id, event_type, status, effective_from, proof, previous_term, new_term, note,
              requested_by, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5::date, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::timestamptz)`,
          [
            workspaceId,
            row.id,
            amendment.event_type,
            amendment.status,
            dateOnly(-amendment.effective_in_days),
            amendment.proof,
            amendment.previous_term ? JSON.stringify(amendment.previous_term) : null,
            JSON.stringify(amendment.new_term),
            amendment.note,
            ownerUserId,
            amendment.status === 'accepted' ? ownerUserId : null,
            amendment.status === 'accepted' ? new Date().toISOString() : null,
          ],
        )
      }

      for (const expense of mission.expenses ?? []) {
        await this.accounts.manager.query(
          `INSERT INTO mission_expenses (mission_id, workspace_id, label, amount_cents, expense_date, entered_by, source)
           VALUES ($1, $2, $3, $4, $5, $6, 'human')`,
          [row.id, workspaceId, expense.label, expense.amount_cents, dateOnly(expense.days_ago), ownerUserId],
        )
      }

      /**
       * LE DOSSIER D'ADMINISTRATION DES VENTES (31/08/2026).
       *
       * DEUX missions sur neuf en portent un, et les sept autres restent SANS
       * ligne — c'est délibéré, et c'est ce qui remplit l'écran :
       *
       *  - la mission qui finit dans 28 jours porte un dossier COMPLET :
       *    la file ADV montre donc qu'un dossier peut se clôturer ;
       *  - celle qui n'a pas de date de fin en porte un À MOITIÉ FAIT :
       *    référence et conditions saisies, coordonnées jamais transmises,
       *    entité jamais désignée ;
       *  - les sept autres n'ont AUCUNE ligne, et leurs quatre motifs ADV
       *    s'allument — dont deux missions qui ajoutent `missing_po` et
       *    `missing_billing_contact`, les deux codes repris de la facturation.
       *
       * Les six motifs réellement calculés sont donc visibles en démonstration.
       * Le septième — `kyc_not_validated` — est RÉSERVÉ et n'est produit par
       * aucun calcul : sa pastille affiche « non mesuré », jamais « 0 ».
       *
       * ⚠️ Aucune de ces colonnes ne porte de moyen de paiement. Ce qui est
       * semé de la transmission est une DATE.
       */
      if (mission.adv) {
        const entityName = mission.adv.client_entity
        const [advEntity] = entityName
          ? await this.accounts.manager.query<{ id: string }[]>(
              `SELECT id FROM account_entities
                WHERE workspace_id = $1 AND account_id = $2 AND name = $3
                LIMIT 1`,
              [workspaceId, account.id, entityName],
            )
          : []
        // Même règle que le contact de facturation juste au-dessus : un nom qui
        // ne résout pas ne casse rien, mais il ne passe pas en SILENCE — sans
        // ce cri, le dossier « complet » de la salle deviendrait incomplet sans
        // que personne ne sache pourquoi.
        if (entityName && !advEntity) {
          this.logger.warn(
            `Mission de démonstration « ${mission.label} » : entité de facturation « ${entityName} » introuvable — le dossier ADV partira sans entité.`,
          )
        }
        await this.accounts.manager.query(
          `INSERT INTO mission_adv_records
             (mission_id, workspace_id, client_billing_reference, payment_terms_days,
              payment_details_transmitted_at, client_entity_id, updated_by)
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7)`,
          [
            row.id,
            workspaceId,
            mission.adv.client_billing_reference,
            mission.adv.payment_terms_days,
            mission.adv.payment_details_transmitted_days_ago == null
              ? null
              : iso(mission.adv.payment_details_transmitted_days_ago),
            advEntity?.id ?? null,
            ownerUserId,
          ],
        )
      }

      // Les factures FOURNISSEUR (30/08/2026) — même mission, même raison :
      // `mission.supplier_invoices` optionnel, une seule mission en porte.
      for (const invoice of mission.supplier_invoices ?? []) {
        await this.accounts.manager.query(
          `INSERT INTO supplier_invoices
             (mission_id, workspace_id, reference, amount_cents, invoice_date, status, entered_by, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'human')`,
          [
            row.id,
            workspaceId,
            invoice.reference,
            invoice.amount_cents,
            dateOnly(invoice.days_ago),
            invoice.status,
            ownerUserId,
          ],
        )
      }

      /**
       * LE PAIEMENT SORTANT (31/08/2026) — l'argent qui SORT vers le consultant.
       *
       * ⚠️ Il est semé APRÈS les factures fournisseur, et ce n'est pas
       * cosmétique : la ligne se rattache à la plus récente facture de la
       * mission, et l'écrire avant lui laisserait `supplier_invoice_id` à
       * `null` — le défaut « ce qui LIT après ce qui ÉCRIT », déjà payé ici.
       *
       * ⚠️ Trois missions seulement en portent une, sur les neuf. Les six
       * autres restent en `non_genere` — un état DÉDUIT, jamais semé : créer une
       * ligne par mois et par consultant « au cas où » ferait mesurer notre
       * propre semis au compteur « paiement non généré » de la maquette.
       *
       * ⚠️ Aucune coordonnée bancaire n'est écrite, et la table n'en a pas :
       * la salle montre le SUIVI d'un paiement, jamais son déclenchement.
       */
      if (mission.outgoing_payment) {
        const payment = mission.outgoing_payment
        await this.accounts.manager.query(
          `INSERT INTO outgoing_payments
             (mission_id, workspace_id, consultant_id, period_month, supplier_invoice_id,
              amount_cents, settled_amount_cents, status, scheduled_on, paid_on,
              reminders_sent, last_reminder_at, validated_at, validated_by,
              rejected_at, rejection_reason, entered_by, source)
           SELECT $1, $2, $3::uuid, $4::date,
                  (SELECT s.id FROM supplier_invoices s
                    WHERE s.mission_id = $1 AND s.workspace_id = $2
                    ORDER BY s.invoice_date DESC, s.created_at DESC LIMIT 1),
                  $5::bigint, $6::bigint, $7, $8::date, $9::date,
                  $10, $11::timestamptz, $12::timestamptz, $13::uuid,
                  $14::timestamptz, $15::text, $16, 'human'`,
          [
            row.id,
            workspaceId,
            consultantId ?? null,
            periodMonth,
            payment.amount_cents,
            payment.settled_amount_cents,
            payment.status,
            payment.scheduled_days_ago === null ? null : dateOnly(payment.scheduled_days_ago),
            payment.paid_days_ago === null ? null : dateOnly(payment.paid_days_ago),
            payment.reminders_sent,
            // Une relance CONSIGNÉE porte sa date : un compteur à 1 sans date
            // ne dit pas depuis quand on attend, et c'est la seule chose qu'on
            // regarde devant un paiement en retard.
            payment.reminders_sent > 0 ? iso(4) : null,
            // Un paiement ASSUMÉ porte qui l'a assumé et quand — les deux, ou
            // aucun des deux : une date sans auteur se relit « personne ».
            payment.status === 'valide' || payment.status === 'paye' ? iso(10) : null,
            payment.status === 'valide' || payment.status === 'paye' ? ownerUserId : null,
            payment.status === 'rejete' ? iso(4) : null,
            payment.rejection_reason,
            ownerUserId,
          ],
        )
      }

      // Pas de relevé = ligne BLOQUÉE, et c'est le second état que l'écran doit
      // montrer. On n'en fabrique donc pas un pour faire joli.
      if (mission.timesheet) {
        await this.accounts.manager.query(
          // Le CONSULTANT est porté par le relevé : la maille de l'écran est
          // mission × consultant, et un relevé sans consultant s'y afficherait
          // « personne d'affecté » alors que quelqu'un l'est.
          // La TRACE du rejet voyage avec le relevé, statut compris. Elle
          // survit au redépôt : un relevé `submitted` qui porte une date et un
          // motif est un relevé rejeté PUIS corrigé, et c'est ce que l'écran
          // écrit. Effacer le motif au redépôt ferait disparaître la seule
          // réponse à « pourquoi ce mois a-t-il fait un aller-retour ? ».
          //
          // ⚠️ Les deux paramètres sont CASTÉS. Un `VALUES` littéral comme
          // celui-ci suffirait — Postgres y déduit le type depuis la colonne
          // cible. Le cast est écrit quand même parce que la déduction s'arrête
          // dès que la requête devient un `INSERT … SELECT` : un `null` non
          // typé s'y fait refuser en « could not determine data type », et
          // c'est ce qui avait mis `POST /demo/session` en 500 dans ce fichier.
          // Ces deux colonnes-ci sont justement celles qui portent des `null`.
          // #2196.24 — `reminders_sent`/`last_reminder_at` ne voyagent QUE
          // quand le jeu de données les porte (le cas ESCALADE) : les laisser
          // à `0`/`null` en littéral pour toutes les autres lignes est la
          // décision déjà écrite plus haut pour l'historique de facturation —
          // on ne montre pas des relances envoyées à des clients fictifs qui
          // n'en ont jamais reçu.
          `INSERT INTO mission_timesheets
             (mission_id, consultant_id, period_month, days, status, expected_days, gap_explanation,
              rejected_at, rejection_reason, contested_days, correction_deadline, reminders_sent, last_reminder_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::text, $10::numeric, $11::date, $12, $13::timestamptz)`,
          [
            row.id,
            consultantId ?? null,
            periodMonth,
            mission.timesheet.days,
            mission.timesheet.status,
            mission.timesheet.expected_days,
            mission.timesheet.gap_explanation,
            // La contrainte `mission_timesheets_rejection_reason_check` tient
            // le COUPLE en base : une date sans motif est refusée. Les deux
            // champs partent donc toujours ensemble depuis le jeu de données.
            mission.timesheet.rejected_days_ago === null ? null : rejectedAt(mission.timesheet.rejected_days_ago),
            mission.timesheet.rejection_reason,
            // #2415.7 — `mission_timesheets_contested_days_check` tient le
            // MÊME couple : dès qu'un rejet existe, la quantité contestée et
            // la deadline de correction sont non nulles, ici comme en base.
            mission.timesheet.rejected_days_ago === null ? null : (mission.timesheet.contested_days ?? null),
            mission.timesheet.rejected_days_ago === null
              ? null
              : correctionDeadline(mission.timesheet.rejected_days_ago),
            mission.timesheet.reminders_sent ?? 0,
            mission.timesheet.last_reminder_at_days_ago != null
              ? rejectedAt(mission.timesheet.last_reminder_at_days_ago)
              : null,
          ],
        )
      }

      /**
       * L'HISTORIQUE QUI FAIT VOIR UNE DÉRIVE — PDF 5 §7.2.
       *
       * ⚠️ Un seul relevé ne suffit PAS, et c'est tout le sujet du détecteur :
       * « deux signaux minimum, sur trois mois minimum ». Avec le relevé unique
       * de chaque mission, la salle n'aurait montré que des missions « qu'on ne
       * sait pas lire » — vrai, mais on ne verrait jamais l'alerte elle-même.
       *
       * Les mois PRÉCÉDENTS sont donc semés sur la mission qui dérape. Ils
       * portent leur propre `period_month` et n'écrasent pas le relevé courant :
       * `mission_timesheets` est unique par (mission, mois, consultant).
       */
      const history = (mission as { driftHistory?: DemoDriftMonth[] }).driftHistory ?? []
      for (const month of history) {
        await this.accounts.manager.query(
          `INSERT INTO mission_timesheets
             (mission_id, consultant_id, period_month, days, status, expected_days, gap_explanation,
              validated_by_client_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::text, $8::timestamptz)
           ON CONFLICT DO NOTHING`,
          [
            row.id,
            consultantId ?? null,
            monthStart(month.months_ago, now),
            month.days,
            month.status,
            month.expected_days,
            null,
            month.validated_days_ago === null ? null : rejectedAt(month.validated_days_ago),
          ],
        )
      }

      // #2563/#2566 (lot G2) — la FACTURE RECONDUITE d'une mission longue : les
      // mois déjà préparés (jours saisis sans relevé conservé, N° de bon de
      // commande du mois) et l'option « préparer chaque mois ». Absents du
      // dataset (`undefined`), les huit autres missions n'ont aucune ligne :
      // « rien de préparé » est l'état le plus fréquent.
      for (const prepared of mission.month_preparations ?? []) {
        await this.accounts.manager.query(
          `INSERT INTO mission_month_preparations
             (workspace_id, mission_id, period_month, manual_days, po_number, prepared_by, prepared_automatically)
           VALUES ($1, $2, $3::date, $4::numeric, $5::text, $6, false)
           ON CONFLICT DO NOTHING`,
          [
            workspaceId,
            row.id,
            monthStart(prepared.months_ago, now),
            prepared.manual_days,
            prepared.po_number,
            ownerUserId,
          ],
        )
      }
      if (mission.auto_prepare_invoice) {
        await this.accounts.manager.query(
          `INSERT INTO mission_invoice_auto_prepare (mission_id, workspace_id, enabled_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [row.id, workspaceId, ownerUserId],
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // #2195.33 — L'AFFAIRE DE RENOUVELLEMENT, ET SON LIEN À LA MISSION
    // ─────────────────────────────────────────────────────────────────────────
    // ⚠️ APRÈS la boucle des missions — elle LIT `missionIds`. C'est la cause
    // racine déjà payée plusieurs fois dans ce fichier (« ce qui LIT avant ce
    // qui ÉCRIT ») : posée avant, l'affaire serait créée sans rattachement, et
    // la salle montrerait un renouvellement détaché de la mission qu'il
    // prolonge — exactement ce que la décision du 16/09 refuse.
    //
    // Deux écritures, pas une : l'affaire côté `opportunities`, le lien côté
    // `missions.renewal_opportunity_id`. `opportunity_id` n'est PAS touché — il
    // nomme l'affaire qui a produit la mission, jamais celle qui la prolonge.
    await this.seedManualRenewalProject(workspaceId, account.id, missionIds, ownerUserId)

    // #2338 / #2409 — la mission PAS ENCORE DÉMARRÉE, sa checklist partielle.
    await this.seedStartReadinessMission(workspaceId, ownerUserId, account.id, byName, now)

    // #3547 — le FORFAIT ENCADRÉ : une mission sans consultant, rôle tenu, équipe client.
    await this.seedSupervisedForfaitMission(workspaceId, ownerUserId, account.id, now)

    // #2422.6 (épopée #2869, lot R24 07/10/2026) — LE LIEN SIGNÉ, RÉVOQUÉ À DESSEIN.
    //
    // « une mission + un contrat » (la portée exigée par le service) suppose les
    // DEUX sur le MÊME compte — or le seul contrat juridique semé jusqu'ici
    // (Société Générale, bloc plus haut) vit sur un compte SANS AUCUNE mission
    // (toutes les missions de la salle vivent sur le dossier PORTEUR, `account.id`,
    // depuis la décision du 04/10/2026). Plutôt que d'écrire un lien dont le
    // mission_id et le contract_id ne partageraient pas de compte — une ligne de
    // démonstration qui ne pourrait jamais exister par le service réel — ce bloc
    // pose un DEUXIÈME contrat, minimal, sur le dossier porteur lui-même.
    //
    // Voir `DEMO_LEGAL_CONTRACT_UPLOAD_LINK_COVERAGE` (`demo-coverage.ts`) pour la
    // raison du choix RÉVOQUÉ plutôt qu'actif : une porte publique, sans session,
    // ne doit jamais pouvoir écrire dans une salle que des visiteurs partagent.
    {
      await this.accounts.manager.query(
        `INSERT INTO legal_contracts
           (workspace_id, account_id, type, label, counterparty_name, legal_entity_id, owner_id, source, status)
         VALUES ($1, $2, 'mission_agreement', $3, $4, $5, $6, 'direct', 'signed')
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          account.id,
          `Contrat de mission — ${client.account.company_name}`,
          client.account.company_name,
          legalEntityIds.get('BELLUM CONSEIL') ?? null,
          ownerUserId,
        ],
      )
      const [missionContract] = await this.accounts.manager.query<{ id: string }[]>(
        `SELECT id FROM legal_contracts WHERE workspace_id = $1 AND account_id = $2 AND lower(label) = lower($3)`,
        [workspaceId, account.id, `Contrat de mission — ${client.account.company_name}`],
      )
      const demoMissionId = missionIds.get('Fiabilisation plateforme — renfort exploitation') ?? null
      const [existingLink] = await this.accounts.manager.query<{ id: string }[]>(
        `SELECT id FROM legal_contract_upload_links WHERE workspace_id = $1 AND contract_id = $2 LIMIT 1`,
        [workspaceId, missionContract?.id ?? null],
      )
      if (missionContract && demoMissionId && !existingLink) {
        const rawToken = `cup_demo_${randomUUID()}`
        await this.accounts.manager.query(
          `INSERT INTO legal_contract_upload_links
             (workspace_id, contract_id, mission_id, token_hash, created_by, created_at, expires_at, revoked_at)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $6::timestamptz)`,
          [
            workspaceId,
            missionContract.id,
            demoMissionId,
            createHash('sha256').update(rawToken).digest('hex'),
            ownerUserId,
            iso(1),
            iso(-6),
          ],
        )
      } else if (!demoMissionId) {
        this.logger.warn(
          `Lien de dépôt de démonstration : mission « Fiabilisation plateforme — renfort exploitation » introuvable — lien non semé.`,
        )
      }
    }

    await this.seedInvoiceHistory(workspaceId, ownerUserId, missionIds, now)
    await this.seedPilotageRecentPayments(workspaceId, ownerUserId, missionIds, now)

    // #2419.9 — APRÈS l'historique de facturation, sans dépendre de
    // `missionIds` : un paiement « à rapprocher » n'a, par construction,
    // aucune facture à retrouver.
    await this.seedUnmatchedPayments(workspaceId, ownerUserId, now)

    // #2196.31 — APRÈS la boucle des missions : elle LIT `missionIds`.
    await this.seedTimesheetExceptions(workspaceId, ownerUserId, account.id, missionIds, now)

    // L3 Pilotage › Staffing — coûts, congés, jours saisis ce mois-ci, seuil TACE. APRÈS la boucle des missions
    // (elle LIT `missionIds`) et après le vivier (les consultants se retrouvent par leur nom).
    await this.seedStaffing(workspaceId, missionIds, now)

    // Les gestes hors outil cochés sur les missions (#1503). APRÈS la boucle des
    // missions, comme tout ce qui LIT `missionIds` : un libellé qui n'est pas
    // encore un identifiant produirait une checklist rattachée à rien.
    await this.seedChainManualMarks(workspaceId, ownerUserId, missionIds)

    // APRÈS l'historique de facturation, et ce n'est pas cosmétique : une
    // cession porte sur une créance FACTURÉE, et l'écran ne la retient que si
    // la facture existe. Semer l'inverse produirait des cessions que le
    // « Cession manquante » compterait deux fois — le défaut « ce qui LIT avant
    // ce qui ÉCRIT », déjà payé ici.
    await this.seedFactoring(workspaceId, ownerUserId, missionIds, now)
    // ⚠️ APRÈS la boucle des missions — elle LIT `missionIds`. Les notes « en
    // attente » portent leur mission, et un libellé qui n'est pas encore un id
    // partirait `null` : la salle montrerait des notes détachées de toute
    // mission, et le lien avec la marge serait invisible. C'est la cause racine
    // déjà payée deux fois dans ce fichier.
    await this.seedExpenseReports(workspaceId, ownerUserId, account.id, missionIds, now)

    // #2412 — le double pouls de satisfaction (client/consultant) de la
    // mission active, pour que l'onglet « Synthèse » ne s'ouvre jamais muet
    // (craft rule n°9). APRÈS la boucle des missions, comme tout ce qui LIT
    // `missionIds`.
    await this.seedMissionFeedback(workspaceId, ownerUserId, missionIds)

    await this.seedOpenNeeds(workspaceId, ownerUserId, account.id, byName, iso, dateOnly, contactIdsByName)

    // X66 / #3547 — le forfait encadré, lu aussi sur la fiche du BESOIN au forfait de la salle.
    await this.accounts.manager.query(
      `UPDATE project_needs
          SET delivery_mode = 'supervised', supervision_role = $3, client_team_size = $4, client_team_names = $5::text[]
        WHERE workspace_id = $1 AND title = $2 AND contract_kind = 'forfait'`,
      [
        workspaceId,
        DEMO_SUPERVISED_FORFAIT_NEED.title,
        DEMO_SUPERVISED_FORFAIT_NEED.supervision_role,
        DEMO_SUPERVISED_FORFAIT_NEED.client_team_size,
        DEMO_SUPERVISED_FORFAIT_NEED.client_team_names,
      ],
    )

    // #2558.1 — LE BESOIN SANS PROJET. Indépendant de la boucle ci-dessus :
    // `seedOpenNeeds` rattache chaque rôle à `project.id`, et c'est exactement
    // la forme que ce lot ne doit PAS reproduire. Voir le docblock de
    // `seedNeedWithoutProject` plus bas.
    await this.seedNeedWithoutProject(workspaceId, ownerUserId, account.id, iso)
    await this.seedInternalHireNeed(workspaceId, ownerUserId, account.id, iso)
    await this.seedMissingExpertise(workspaceId, ownerUserId, account.id, iso)

    // #2178 — LE BESOIN SANS PROFIL DÉFENDABLE. Même famille que le besoin
    // sans projet juste au-dessus (indépendant de la boucle des missions),
    // et pour la même raison : `NoMatchCausesBanner` / `NextBestMoveActions`
    // (craft rule n°9) ne se découvrent pas sans un besoin qui produise
    // RÉELLEMENT le zéro en le faisant tourner. Voir le docblock de
    // `DEMO_NO_DEFENDABLE_PROFILE_NEED` (`demo-dataset.ts`) pour la preuve que
    // le zéro est garanti. RATTACHÉ à `account.id` (le client FICTIF SNCF
    // LOGISTIQUE), JAMAIS à l'une des six sociétés RÉELLES de
    // `DEMO_DOSSIERS` : `demo-seed.service.spec.ts` (« ne pose aucun de ces
    // rôles sur l'une des six sociétés RÉELLES ») l'interdit, et c'est la
    // même règle que `seedOpenNeeds` juste au-dessus applique déjà.
    await this.seedNoDefendableProfileNeed(workspaceId, ownerUserId, account.id, iso)
    // #4270.5 — le profil forfait/conseil : un besoin à cadrer et un projet gagné suivi (la salle reste staffing).
    await this.seedForfaitProfileNeeds(workspaceId, ownerUserId, account.id, iso)

    // ⚠️ APRÈS la boucle des missions — elle LIT ce que cette boucle a écrit.
    // C'est la cause racine déjà payée trois fois dans ce fichier (« ce qui LIT
    // avant ce qui ÉCRIT ») : posé avant, ce rôle serait rattaché à une mission
    // qui n'existe pas encore, et la salle montrerait « 0 mission attribuée »
    // sur le seul besoin qui en porte une.
    await this.seedStaffedNeed(workspaceId, ownerUserId, project.id, iso)

    // #2567.K6 / #2567.3 — DERNIER, et ce n'est plus cosmétique depuis ce lot :
    // les quatre requêtes ajoutées par #2567.3 LISENT les besoins et les
    // positionnements que `seedOpenNeeds` vient d'écrire ci-dessus (`ce qui LIT
    // après ce qui ÉCRIT »), en plus des missions de la boucle du dessus. Les
    // trois lignes historiques de #2567.K6 (`subject_id` de mission) restent,
    // elles, satisfaites dès `missionIds` — l'ordre ne leur coûte rien.
    await this.seedInterventions(workspaceId, ownerUserId, missionIds, now)

    // #2953 (#2193.25-30) — LE SUIVI vient d'apparaître dans l'onglet Synthèse
    // du dossier mission (`MissionTrackingSection`) : sans lui, ce panneau
    // s'ouvrirait vide au milieu d'une démonstration — même raison que
    // `DEMO_NOTES` pour les comptes, sur la même mission que `seedMissionFeedback`.
    await this.seedMissionTracking(workspaceId, ownerUserId, missionIds)

    // #4192 (L1 CRM/ATS) — trois positionnements Société Générale avec jours et coût (marge prévue).
    await seedDemoCrmBackbone(this.accounts.manager, workspaceId, ownerUserId)
    // #4195 (L4) — affaire SNCF prête à signer : deux positionnements retenus.
    await seedDemoCrmSignature(this.accounts.manager, workspaceId, ownerUserId, now)

    // #4194 (L3) — la chaîne Orange que le panneau latéral unique suit.
    await seedDemoCrmLinks(this.accounts.manager, workspaceId, ownerUserId, now)

    // #4196 (L5) — le cycle de vie d'une mission : prolongée (avenant), terminée, consultants qui suivent.
    await seedDemoCrmMissionLifecycle(this.accounts.manager, workspaceId, ownerUserId, now)

    // #4191 (recette 2, E5) — l'affaire vitrine du panneau « Objets liés » (Orange, à défaut Société Générale) — ne crée aucune mission, donc avant
    // `seedDemoCrmRecette` qui doit rester le DERNIER `seedDemoCrm*`.
    await seedDemoCrmRecette2(this.accounts.manager, workspaceId, ownerUserId, now)

    // #4191 (recette 15/10, D1) — l'affaire et le besoin d'origine de chaque mission en cours (après TOUS les semis de missions).
    await seedDemoCrmRecette(this.accounts.manager, workspaceId, ownerUserId, now)

    // #2193.51 (épopée #2953) — LES DOCUMENTS de la mission, même dépendance
    // que `seedMissionTracking` juste au-dessus : `missionIds` doit être peuplée.
    await this.seedMissionDocuments(workspaceId, missionIds)

    // #3068 — même dépendance : `missionIds` doit être peuplée.
    await this.seedMissionInterruption(workspaceId, ownerUserId, missionIds)
  }

  /**
   * Épopée #2880 (lot V33) — voir {@link DEMO_EXPERTISE_GROUNDINGS}. Un objet
   * source introuvable par son nom ⇒ la ligne n'est PAS écrite (jamais un
   * « prouvé » sans preuve) ; la purge (`demo-reset.service.ts`) vide la table
   * avant chaque semis, donc rien ne se duplique.
   */
  private async seedExpertiseGroundings(workspaceId: string, ownerUserId: string): Promise<void> {
    const sourceSql = {
      mission: `SELECT id FROM missions WHERE workspace_id = $1 AND label = $2 LIMIT 1`,
      consultant: `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2 LIMIT 1`,
    } as const
    for (const grounding of DEMO_EXPERTISE_GROUNDINGS) {
      let sourceId: string | null = null
      if (grounding.source) {
        const [row] = await this.accounts.manager.query<{ id: string }[]>(sourceSql[grounding.source.type], [
          workspaceId,
          grounding.source.name,
        ])
        if (!row) {
          this.logger.warn(`Preuve de démonstration « ${grounding.source.name} » introuvable — ligne non écrite.`)
          continue
        }
        sourceId = row.id
      }
      await this.accounts.manager.query(
        `INSERT INTO expertise_groundings
           (workspace_id, expertise_key, kind, state, state_source, source_type, source_id, label, confidentiality, created_by)
         VALUES ($1, $2, $3, $4, 'user', $5, $6, $7, $8, $9)`,
        [
          workspaceId,
          grounding.expertise_key,
          grounding.kind,
          grounding.state,
          grounding.source?.type ?? null,
          sourceId,
          grounding.label,
          grounding.confidentiality,
          ownerUserId,
        ],
      )
    }
  }

  /**
   * #4158.13 (Louis, 14/10/2026) — L'ÉQUIPE de la salle : trois collègues fictifs
   * ({@link DEMO_COLLEAGUES}), assez pour que la barre latérale affiche « Équipe »
   * et que `/team` montre une équipe vivante.
   *
   * ⚠️ LA DÉMONSTRATION NE DOIT JAMAIS CASSER à cause d'eux. Chaque collègue est
   * monté séparément et sans lever : un compte d'authentification qui ne se crée
   * pas (Supabase indisponible, adresse déjà prise par un autre identifiant), ou
   * l'absence de passerelle, laisse la salle à UN occupant — l'état d'avant ce
   * lot — et le dit dans le journal. Rien n'est jamais à moitié monté : un
   * collègue n'apparaît dans `workspace_members` qu'une fois son compte, puis son
   * profil, écrits.
   *
   * Les comptes d'authentification sont créés SANS mot de passe, comme celui de
   * l'occupant (`DemoPoolService.resolvePoolUser`), sur un domaine réservé : ils
   * ne se connectent pas. `workspace_members` n'est pas purgée par un reset
   * (`DEMO_KEEP_TABLES`) : l'écriture est donc idempotente. Le reste — comptes
   * repris, actions déléguées, activité — l'est par le semis lui-même, qui ne
   * tourne que sur une salle vidée de ses comptes.
   *
   * Les comptes repris sont des comptes SECONDAIRES : les dossiers vedettes
   * restent à l'occupant, dont tout le parcours de démonstration dépend.
   */
  private async seedColleagues(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const ready: (typeof DEMO_COLLEAGUES)[number][] = []
    for (const colleague of DEMO_COLLEAGUES) {
      try {
        if (await this.ensureColleagueIdentity(workspaceId, colleague)) ready.push(colleague)
      } catch (error) {
        this.logger.warn(
          `Demo seed: colleague ${colleague.key} skipped — ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    if (ready.length === 0) return

    try {
      const byKey = new Map(ready.map(colleague => [colleague.key, colleague]))
      for (const colleague of ready) {
        for (const company of colleague.accounts) {
          const accountId = accountIds.get(company)
          if (!accountId) continue
          // Le compte ET ses contacts : « Porté par » se lit sur les deux écrans.
          await this.accounts.manager.query(
            `UPDATE accounts SET assigned_to = $3 WHERE id = $1 AND workspace_id = $2`,
            [accountId, workspaceId, colleague.userId],
          )
          await this.accounts.manager.query(
            `UPDATE contacts SET assigned_to = $3 WHERE account_id = $1 AND workspace_id = $2`,
            [accountId, workspaceId, colleague.userId],
          )
        }
      }

      let step = 50
      for (const action of DEMO_DELEGATED_ACTIONS) {
        const colleague = byKey.get(action.colleague)
        const accountId = accountIds.get(action.company)
        if (!colleague || !accountId) continue
        const dueDate = new Date(now + action.dueInDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        await this.accounts.manager.query(
          `INSERT INTO action_plan_items (
             user_id, account_id, label, week_index, step_index, done, execution_status,
             assigned_to, owner_name, source, source_at, due_date
           )
           VALUES ($1, $2, $3, $4, $5, false, 'todo', $6, $7, 'human', now(), $8)`,
          [
            ownerUserId,
            accountId,
            action.label,
            MANUAL_ACTION_WEEK_INDEX,
            step++,
            colleague.userId,
            `${colleague.first_name} ${colleague.last_name}`,
            dueDate,
          ],
        )
      }

      // #2128.19 — une analyse EN COURS par un collègue sur son compte : le bandeau de collaboration la nomme.
      const running = DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE
      const runner = byKey.get(running.colleague)
      const runningAccountId = accountIds.get(running.company)
      if (runner && runningAccountId) {
        await this.accounts.manager.query(
          `INSERT INTO analysis_runs (account_id, user_id, workspace_id, status, scope_mode, created_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'analyzing', 'group', $4::timestamptz)`,
          [runningAccountId, runner.userId, workspaceId, new Date(now - running.minutesAgo * 60_000).toISOString()],
        )
      }

      // 29/10/2026 — le compte ANALYSÉ par l'occupant, TRAVAILLÉ par un collègue (#4731). Une tâche, jamais
      // une ligne `user_actions` : deux auteurs sur un compte se liraient comme une collision de prospection.
      for (const work of DEMO_SHARED_ACCOUNT_WORK) {
        const colleague = byKey.get(work.colleague)
        const accountId = accountIds.get(work.company)
        if (!colleague || !accountId) continue
        const dueDate = new Date(now + work.dueInDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        await this.accounts.manager.query(
          `INSERT INTO action_plan_items (
             user_id, account_id, label, week_index, step_index, done, execution_status,
             assigned_to, owner_name, source, source_at, due_date
           )
           VALUES ($1, $2, $3, $4, $5, false, 'todo', $6, $7, 'human', now(), $8)`,
          [
            ownerUserId,
            accountId,
            work.label,
            MANUAL_ACTION_WEEK_INDEX,
            step++,
            colleague.userId,
            `${colleague.first_name} ${colleague.last_name}`,
            dueDate,
          ],
        )
      }

      const activity = DEMO_COLLEAGUE_ACTIVITY.flatMap(entry => {
        const colleague = byKey.get(entry.colleague)
        const accountId = accountIds.get(entry.company)
        if (!colleague || !accountId) return []
        return [
          this.userActions.create({
            user_id: colleague.userId,
            workspace_id: workspaceId,
            account_id: accountId,
            contact_id: null,
            action_type: entry.action_type,
            channel: null,
            metadata: {},
            created_at: new Date(now - entry.hours_ago * 3_600_000),
          }),
        ]
      })
      if (activity.length > 0) await this.userActions.save(activity)
      // Théo D team-activite.N2 — un sujet d'équipe ouvert, qui mentionne l'occupant de la salle.
      for (const thread of DEMO_TEAM_THREADS) {
        const author = byKey.get(thread.colleague)
        const accountId = accountIds.get(thread.company)
        if (!author || !accountId) continue
        await this.accounts.manager.query(
          `INSERT INTO team_comments (workspace_id, author_user_id, body, account_id, mentioned_user_ids, created_at)
           VALUES ($1, $2, $3, $4, $5::uuid[], $6)`,
          [
            workspaceId,
            author.userId,
            thread.body,
            accountId,
            [ownerUserId],
            new Date(now - thread.hoursAgo * 3_600_000),
          ],
        )
      }
      // Théo D team-recherches — les recherches conservées de l'équipe, lisibles par tout membre.
      for (const research of DEMO_TEAM_RESEARCH) {
        const authorId = research.author === 'owner' ? ownerUserId : byKey.get(research.author)?.userId
        if (!authorId) continue
        const researchAccountIds = research.accounts.flatMap(company => accountIds.get(company) ?? [])
        const at = new Date(now - research.daysAgo * 86_400_000)
        await this.accounts.manager.query(
          `INSERT INTO team_research_entries
             (workspace_id, user_id, title, scope_label, filters, filters_key, result_count, account_ids, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::uuid[], $9, $9)
           ON CONFLICT (workspace_id, user_id, filters_key) DO NOTHING`,
          [
            workspaceId,
            authorId,
            research.title,
            research.scopeLabel,
            JSON.stringify(research.filters),
            filtersKeyOf(research.filters),
            research.resultCount,
            researchAccountIds,
            at,
          ],
        )
      }
    } catch (error) {
      this.logger.warn(`Demo seed: team data incomplete — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * #4158.13 — compte d'authentification, profil, puis appartenance : dans cet
   * ordre, parce que les deux dernières portent une clé étrangère dure vers le
   * premier. `false` = ce collègue n'est pas monté (et n'est PAS membre).
   */
  private async ensureColleagueIdentity(
    workspaceId: string,
    colleague: (typeof DEMO_COLLEAGUES)[number],
  ): Promise<boolean> {
    if (!this.authGateway) {
      this.logger.warn(`Demo seed: colleague ${colleague.key} skipped — no auth gateway`)
      return false
    }
    const existing = await this.authGateway.findUserById(colleague.userId)
    if (!existing) {
      // Aucun `password` : le compte n'a pas d'identifiants, il n'y a rien à fuiter.
      const { error } = await this.authGateway.client.auth.admin.createUser({
        id: colleague.userId,
        email: colleague.email,
        email_confirm: true,
      })
      if (error) {
        this.logger.warn(`Demo seed: colleague ${colleague.key} skipped — auth user not created (${error.message})`)
        return false
      }
    }

    const profile = await this.profiles.findOne({ where: { user_id: colleague.userId } })
    if (profile) {
      await this.profiles.update(
        { user_id: colleague.userId },
        { first_name: colleague.first_name, last_name: colleague.last_name, anonymized_at: null },
      )
    } else {
      await this.profiles.save(
        this.profiles.create({
          user_id: colleague.userId,
          email: colleague.email,
          first_name: colleague.first_name,
          last_name: colleague.last_name,
        }),
      )
    }

    const member = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: colleague.userId } })
    if (!member) {
      await this.members.save(
        this.members.create({ workspace_id: workspaceId, user_id: colleague.userId, role: colleague.role }),
      )
    }
    return true
  }

  /**
   * lot X80 (#3407) — le RESPONSABLE : l'occupant unique de la salle (#1408),
   * sur tout compte inséré sans `assigned_to` ; ne touche pas un compte déjà
   * porté. (Le niveau d'effort du compte compagnon CGI est parti avec lui,
   * recette 05/10.)
   */
  private async seedCompanionEffort(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `UPDATE accounts SET assigned_to = $2 WHERE workspace_id = $1 AND assigned_to IS NULL`,
      [workspaceId, ownerUserId],
    )
  }

  /**
   * #3918.b (lot M01) — `crm_deal_facts` + `canonical_trigger_events` pour Société Générale.
   *
   * Le balayage de production exclut les espaces de démonstration (`w.is_demo = false`) : la salle
   * écrit donc elle-même ce qu'il aurait écrit, avec les MÊMES règles (`buildDemoCrmDeals`). Le
   * rattachement au compte passe par son SIREN (#3918.a, jamais par le nom), relu sur la ligne
   * `accounts` déjà semée — sans SIREN, aucun rattachement et aucun signal sous le compte.
   */
  private async seedCrmDeals(workspaceId: string, now: number, accountIds: Map<string, string>): Promise<void> {
    const accountId = accountIds.get(DEMO_CRM_DEALS.account)
    if (!accountId) return
    const [account] = await this.accounts.manager.query<{ siren: string | null }[]>(
      `SELECT siren FROM accounts WHERE id = $1`,
      [accountId],
    )
    const siren = account?.siren ?? null
    if (!siren) return
    // #4072.1 — des contacts DÉJÀ connus du CRM de l'ESN : l'organigramme les marque. Posé par le
    // dépôt `ContactEntity` (GA-405), sur des personnes déjà semées du compte, jamais inventées.
    const known = crmMarkedContactIds(
      await this.contacts.find({
        where: { workspace_id: workspaceId, account_id: accountId },
        select: { id: true, full_name: true },
      }),
      demoCrmPresence(DEMO_ORG_CRM_MARKED_CONTACTS.account, now),
    )
    if (known.length > 0) {
      await this.contacts.update(
        { id: In(known) },
        {
          crm_record_id: 'demo-crm-contact',
          crm_synced_at: new Date(now - DEMO_ORG_CRM_MARKED_CONTACTS.syncedDaysAgo * 86_400_000),
        },
      )
    }
    const { facts, signals } = buildDemoCrmDeals(new Date(now))
    const factIds = new Map<string, string>()
    for (const fact of facts) {
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO crm_deal_facts
           (workspace_id, provider, deal_id, name, stage_label, amount, deal_created_at, closed_at,
            last_activity_at, is_closed, is_won, company_siren, account_id, account_link_basis)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'siren')
         RETURNING id`,
        [
          workspaceId,
          fact.provider,
          fact.deal_id,
          fact.name,
          fact.stage_label,
          fact.amount,
          fact.deal_created_at,
          fact.closed_at,
          fact.last_activity_at,
          fact.is_closed,
          fact.is_won,
          siren,
          accountId,
        ],
      )
      if (row) factIds.set(fact.deal_id, row.id)
    }
    await this.seedCrmMirror(workspaceId, now, accountId)
    for (const signal of signals) {
      const subjectId = factIds.get(signal.dealId)
      if (!subjectId) continue
      await this.accounts.manager.query(
        `INSERT INTO canonical_trigger_events (workspace_id, kind, source_module, payload, occurred_at)
         VALUES ($1, $2, 'crm/crm-deal-signals.sweeper', $3::jsonb, $4)`,
        [
          workspaceId,
          signal.kind,
          JSON.stringify({ subjectType: 'crm_deal', subjectId, evidence: signal.evidence, accountId }),
          signal.occurredAt,
        ],
      )
    }
  }

  /**
   * SYNC-A — le MIROIR CRM de Société Générale (`DEMO_CRM_MIRROR`) : propriétaire, pipeline et étapes,
   * les trois affaires de `DEMO_CRM_DEALS` rattachées au compte, et leurs activités. Ce que la fiche
   * compte (`GET /crm/mirror/accounts/:id`) et Laura lisent en production, par le même lecteur.
   */
  private async seedCrmMirror(workspaceId: string, now: number, accountId: string): Promise<void> {
    const day = 86_400_000
    const at = (daysAgo: number | null) => (daysAgo === null ? null : new Date(now - daysAgo * day))
    const q = (sql: string, params: unknown[]) => this.accounts.manager.query(sql, params)
    const { owner, pipeline, activities, lostReason, dealCustomFields } = DEMO_CRM_MIRROR
    await q(
      `INSERT INTO crm_owners (workspace_id, provider, external_id, name) VALUES ($1, 'demo', $2, $3)
       ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
      [workspaceId, owner.external_id, owner.name],
    )
    const [pipe] = await q(
      `INSERT INTO crm_pipelines (workspace_id, provider, external_id, label) VALUES ($1, 'demo', $2, $3)
       ON CONFLICT (workspace_id, provider, external_id) DO UPDATE SET label = EXCLUDED.label
       RETURNING id`,
      [workspaceId, pipeline.external_id, pipeline.label],
    )
    const pipelineId = (pipe as { id?: string } | undefined)?.id
    if (pipelineId)
      for (const stage of pipeline.stages)
        await q(
          `INSERT INTO crm_stages (workspace_id, provider, external_id, pipeline_id, label, position, status)
           VALUES ($1, 'demo', $2, $3, $4, $5, $6) ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
          [workspaceId, stage.external_id, pipelineId, stage.label, stage.position, stage.status],
        )
    for (const deal of DEMO_CRM_DEALS.deals) {
      const stage = pipeline.stages.find(candidate => candidate.label === deal.stage_label)
      const status = deal.is_closed ? (deal.is_won ? 'won' : 'lost') : 'open'
      await q(
        `INSERT INTO crm_deals
           (workspace_id, provider, external_id, title, pipeline_external_id, stage_external_id, stage_label,
            amount, currency, status, lost_reason, crm_created_at, closed_at, owner_external_id, account_id,
            crm_updated_at, crm_custom_fields)
         VALUES ($1, 'demo', $2, $3, $4, $5, $6, $7, 'EUR', $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
         ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
        [
          workspaceId,
          deal.deal_id,
          deal.name,
          pipeline.external_id,
          stage?.external_id ?? null,
          deal.stage_label,
          deal.amount,
          status,
          status === 'lost' ? lostReason : null,
          at(deal.created_days_ago),
          at(deal.closed_days_ago),
          owner.external_id,
          accountId,
          at(deal.last_activity_days_ago),
          JSON.stringify(dealCustomFields[deal.deal_id as string] ?? {}),
        ],
      )
    }
    // #4604 — la provenance PAR CHAMP que la fiche lit (« vient de <CRM> » à côté du nom) : le nom du compte du
    // miroir vient du CRM fictif de la salle. Jamais une ligne `human` : corriger reste le geste du visiteur.
    await q(
      `INSERT INTO field_provenance (workspace_id, entity_type, entity_id, field, source)
       VALUES ($1, 'account', $2, 'company_name', 'connector')
       ON CONFLICT (entity_type, entity_id, field) DO NOTHING`,
      [workspaceId, accountId],
    )
    for (const activity of activities)
      await q(
        `INSERT INTO crm_activities
           (workspace_id, provider, external_id, kind, subject, occurred_at, done, owner_external_id,
            account_id, deal_external_id)
         VALUES ($1, 'demo', $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id, provider, external_id) DO NOTHING`,
        [
          workspaceId,
          activity.external_id,
          activity.kind,
          activity.subject,
          at(activity.days_ago),
          activity.done,
          owner.external_id,
          accountId,
          activity.deal_id,
        ],
      )
  }

  /** #3295 — INSERT d'un REX de perte (champs déjà qualifiés fait / hypothèse, jamais devinés). */
  private async insertLostDealRex(
    workspaceId: string,
    ownerUserId: string,
    projectId: string,
    accountId: string,
    rex: typeof DEMO_LOST_DEAL_REX | typeof DEMO_SECOND_LOST_DEAL.rex,
  ): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO lost_deal_rex
         (workspace_id, project_id, account_id, sponsor, route_used, last_action, last_action_distinction,
          declared_motif, declared_motif_note, declared_motif_distinction, suspected_motif,
          suspected_motif_note, suspected_motif_distinction, what_team_knows_now,
          what_team_knows_now_distinction, angles_not_tried, reuse_targets, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::text[], $17::text[], $18)`,
      [
        workspaceId,
        projectId,
        accountId,
        rex.sponsor,
        rex.route_used,
        rex.last_action.value,
        rex.last_action.distinction,
        rex.declared_motif,
        rex.declared_motif_note.value,
        rex.declared_motif_note.distinction,
        rex.suspected_motif,
        rex.suspected_motif_note.value,
        rex.suspected_motif_note.distinction,
        rex.what_team_knows_now.value,
        rex.what_team_knows_now.distinction,
        [],
        [],
        ownerUserId,
      ],
    )
  }

  /** #3295 — la 2e perte documentée de la salle : opportunité perdue + REX, sur ENGIE (vrai compte). */
  private async seedSecondLostDeal(
    workspaceId: string,
    ownerUserId: string,
    now: number,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const { account: carrier, lost, rex } = DEMO_SECOND_LOST_DEAL
    const carrierId = accountIds.get(carrier.company_name)
    if (!carrierId) return
    const [opportunity] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, closed_at, outcome,
          loss_reason, primary_domain_code, loss_reason_code, first_detected_at)
       VALUES ($1, $2, 'besoin', $3, $4, 'lost', $5::timestamptz, $5::timestamptz, 'lost', $6, $7, $8,
               $5::timestamptz - interval '60 days')
       RETURNING id`,
      [
        workspaceId,
        carrierId,
        lost.label,
        lost.detail,
        new Date(now - lost.closed_days_ago * 86_400_000).toISOString(),
        lost.loss_reason,
        lost.primary_domain_code,
        lost.loss_reason_code,
      ],
    )
    if (opportunity) await this.insertLostDealRex(workspaceId, ownerUserId, opportunity.id, carrierId, rex)
  }

  /** #4289.2 — la perte sur un autre client actif (voir {@link DEMO_THIRD_LOST_DEAL}) : opportunité perdue, sans REX. */
  private async seedThirdLostDeal(workspaceId: string, now: number, accountIds: Map<string, string>): Promise<void> {
    const { account: carrier, lost } = DEMO_THIRD_LOST_DEAL
    const carrierId = accountIds.get(carrier.company_name)
    if (!carrierId) return
    await this.accounts.manager.query(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, closed_at, outcome,
          loss_reason, primary_domain_code, loss_reason_code, first_detected_at)
       VALUES ($1, $2, 'besoin', $3, $4, 'lost', $5::timestamptz, $5::timestamptz, 'lost', $6, $7, $8,
               $5::timestamptz - interval '60 days')`,
      [
        workspaceId,
        carrierId,
        lost.label,
        lost.detail,
        new Date(now - lost.closed_days_ago * 86_400_000).toISOString(),
        lost.loss_reason,
        lost.primary_domain_code,
        lost.loss_reason_code,
      ],
    )
  }

  /**
   * #3246 — voir {@link DEMO_SIMILAR_CASES}. Sur un vrai compte de la salle
   * (décision Louis 04/10/2026), une opportunité PERDUE (avec son motif) et une
   * mission TERMINÉE avec son retour.
   */
  private async seedSimilarCases(
    workspaceId: string,
    ownerUserId: string,
    now: number,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const day = 86_400_000
    const dateOnly = (offsetDays: number): string => new Date(now + offsetDays * day).toISOString().slice(0, 10)
    const { account: carrier, lost, won } = DEMO_SIMILAR_CASES
    // Décision Louis 04/10/2026 — plus de compte fictif : les cas vivent sur un
    // VRAI compte de la salle, déjà semé (aucun INSERT de compte ici).
    const carrierId = accountIds.get(carrier.company_name)
    if (!carrierId) return
    const account = { id: carrierId }

    const [opportunity] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, closed_at, outcome,
          loss_reason, primary_domain_code, strategy, buying_model, loss_reason_code, first_detected_at)
       VALUES ($1, $2, 'besoin', $3, $4, 'lost', $5::timestamptz, $5::timestamptz, 'lost', $6, $7, $8, $9, $10,
               $5::timestamptz - interval '60 days')
       RETURNING id`,
      [
        workspaceId,
        account.id,
        lost.label,
        lost.detail,
        new Date(now - lost.closed_days_ago * day).toISOString(),
        lost.loss_reason,
        lost.primary_domain_code,
        lost.strategy,
        lost.buying_model,
        // #3989.9 — le motif dans la liste fermée commune (démo, craft n°9).
        lost.loss_reason_code,
      ],
    )

    // #3246 (R17 15/10) — « Organisation de la décision » de la perte : deux contacts DÉJÀ semés du compte,
    // rattachés (jamais fabriqués) — un sponsor et un prescripteur, AUCUN décideur : la fiche montre
    // « Décideur : non renseigné » et « Ce qui manque : Décideur, Acheteur », le cas honnête.
    if (opportunity) {
      // GA-405 — par `ContactEntity`, jamais une lecture brute de plus sur `contacts`.
      const comite = await this.contacts.find({
        select: { id: true },
        where: { account_id: account.id },
        order: { created_at: 'ASC' },
        take: 2,
      })
      const roles = ['sponsor', 'prescripteur']
      for (const [index, contact] of comite.entries()) {
        await this.accounts.manager.query(
          `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [workspaceId, opportunity.id, contact.id, roles[index]],
        )
      }
    }

    // #3295 — décision Louis (brief P01 07/10) : pas de dossier fictif « (exemple) » pour la démo des
    // pertes, le REX approfondit la MÊME opportunité perdue (`project_id` n'est pas unique sur
    // `lost_deal_rex`, voir l'entité). Un seul REX reste sous le seuil de deux convergents qu'exige
    // une proposition d'apprentissage (NO-GO #3272.7) : `lost_deal_rule_proposals` et
    // `workspace_method_rules` restent vides pour leur propre raison (`demo-coverage.ts`).
    if (opportunity)
      await this.insertLostDealRex(workspaceId, ownerUserId, opportunity.id, account.id, DEMO_LOST_DEAL_REX)

    // #3295 — 2e REX de perte (décision Louis 11/10/2026), sur un AUTRE vrai compte de la salle.
    await this.seedSecondLostDeal(workspaceId, ownerUserId, now, accountIds)
    await this.seedThirdLostDeal(workspaceId, now, accountIds)

    // ⚠️ MÊME forme d'INSERT que `seedStartReadinessMission` (mêmes colonnes,
    // même rang des `$n`) : les gardes du semis lisent ces paramètres PAR RANG.
    const [mission] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO missions
         (workspace_id, user_id, account_id, opportunity_id, label, status, started_on, ends_on, daily_rate,
          contract_kind, role_title, owner_id, stage_entered_at, billing_contact_id, cra_contact_id,
          legal_entity_id, renewal_status, renewal_status_at, renewal_client_rail, renewal_consultant_rail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $2, $12::timestamptz, $13::uuid, $14::uuid, $15::uuid,
               $16::text, $17::timestamptz, $18::jsonb, $19::jsonb)
       RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        account.id,
        null,
        won.label,
        won.status,
        dateOnly(-won.started_days_ago),
        dateOnly(won.ends_in_days),
        won.daily_rate,
        won.contract_kind,
        won.role_title,
        new Date(now + won.ends_in_days * day).toISOString(),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    )
    if (!mission) return
    await this.accounts.manager.query(
      `INSERT INTO rex_entries
         (workspace_id, mission_id, account_id, summary, what_worked, what_failed, strategy, buying_model, collected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        workspaceId,
        mission.id,
        account.id,
        won.rex.summary,
        won.rex.what_worked,
        won.rex.what_failed,
        won.rex.strategy,
        won.rex.buying_model,
        ownerUserId,
      ],
    )
  }

  /**
   * #3544.5 — voir {@link DEMO_SUBMISSIONS_MIN_TOTAL}. Complète `submissions` jusqu'au total voulu avec les couples
   * (affaire, consultant) de la salle, dans un ordre stable (md5) ; jamais « accepté ». IDEMPOTENT (`ON CONFLICT`,
   * #2873) et sans effet si le total est déjà atteint.
   */
  private async seedSubmissionsBeyondFirstPage(workspaceId: string, ownerUserId: string): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO submissions
         (workspace_id, project_id, consultant_id, stage, stage_entered_at, submitted_at, closed_at, outcome_reason, owner_id)
       SELECT $1::uuid, pick.project_id, pick.consultant_id, pick.stage,
              now() - make_interval(days => pick.age),
              CASE WHEN pick.stage = 'shortlisted' THEN NULL ELSE now() - make_interval(days => pick.age + 6) END,
              CASE WHEN pick.stage IN ('rejected', 'withdrawn') THEN now() - make_interval(days => pick.age) END,
              CASE pick.stage WHEN 'rejected' THEN 'other_supplier' WHEN 'withdrawn' THEN 'candidate_declined' END,
              $3::uuid
         FROM (
           SELECT ranked.project_id, ranked.consultant_id,
                  (ARRAY['shortlisted', 'submitted', 'interview', 'submitted', 'rejected', 'interview', 'withdrawn', 'submitted'])
                    [1 + (ranked.rn % 8)::int] AS stage,
                  (3 + (ranked.rn % 40))::int AS age
             FROM (
               SELECT o.id AS project_id, c.id AS consultant_id,
                      row_number() OVER (ORDER BY md5(o.id::text || c.id::text)) AS rn
                 FROM opportunities o
                CROSS JOIN consultants c
                WHERE o.workspace_id = $1 AND o.kind = 'besoin' AND c.workspace_id = $1
                  AND NOT EXISTS (
                    SELECT 1 FROM submissions s WHERE s.project_id = o.id AND s.consultant_id = c.id)
             ) ranked
            ORDER BY ranked.rn
            LIMIT GREATEST(0, $2::int - (SELECT count(*) FROM submissions WHERE workspace_id = $1))
         ) pick
       ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
         DO NOTHING`,
      [workspaceId, DEMO_SUBMISSIONS_MIN_TOTAL, ownerUserId],
    )
  }

  /**
   * #2972 — pose `consultants.partner_account_id` sur les consultants en sous-traitance du jeu (`partner_account`,
   * par NOM de compte). Le partenaire est l'ANCRE Groupe INTM (statut `deleted`, hors /accounts) : CGI n'a plus de
   * ligne `accounts`, l'ancien UPDATE ne trouvait rien et sautait en silence. L'ancre se relit donc en base (le map
   * `accountIds` ne porte que les comptes visibles), (ordre garanti : l'ancre est semée avant).
   */
  private async linkSubcontractorPartners(workspaceId: string, _accountIds: Map<string, string>): Promise<void> {
    for (const consultant of DEMO_CONSULTANTS) {
      if (!consultant.partner_account) continue
      // #2972 — `RETURNING` : l'ancre est semée par `seedExternalSourcingExamples` juste avant, l'UPDATE trouve sa ligne.
      const linked = returnedRows<{ id: string }>(
        await this.accounts.manager.query(
          `UPDATE consultants SET partner_account_id = a.id
             FROM accounts a
            WHERE consultants.workspace_id = $1 AND consultants.full_name = $2
              AND a.workspace_id = $1 AND a.company_name = $3
          RETURNING consultants.id`,
          [workspaceId, consultant.full_name, consultant.partner_account],
        ),
      )
      // #2972 — l'ancien UPDATE sautait en silence : un lien qui ne trouve rien se dit.
      if (linked.length === 0) {
        this.logger.warn(
          `Semis : partenaire « ${consultant.partner_account} » introuvable pour ${consultant.full_name}`,
        )
      }
    }
  }

  /**
   * #3294 / #3278 — voir {@link DEMO_EXTENSION_ACCOUNTS}. D13 (06/10/2026) : le compte s'écrit par {@link seedDossier},
   * le MÊME chemin que les dossiers des briefs (fiche, score au palier « non arbitré », siège de décision) — plus un
   * second INSERT minimal qui laissait /accounts quasi vide.
   */
  private async seedExtensionAccounts(
    workspaceId: string,
    ownerUserId: string,
    accountIds: Map<string, string>,
  ): Promise<void> {
    const now = Date.now()
    // 12/10/2026 — les comptes ANALYSÉS (Airbus, EDF, Renault, Thales) passent par la MÊME boucle : ils portent en plus
    // leurs angles d'attaque et leur plan d'action réels (les comptes minces n'en ont pas — aucun plan inventé).
    for (const { contacts, nextAction, attackAngles, actionPlan, ...account } of [
      ...DEMO_EXTENSION_ACCOUNTS,
      ...DEMO_ANALYSED_ACCOUNTS,
    ]) {
      // 13/10/2026 (parité Orange / BPCE) — les offres d'emploi portent `posted_days_ago` : leur date est RELATIVE à
      // l'ouverture de la salle, posée ICI (jamais dans l'empreinte du jeu de démo, qui changerait à chaque démarrage).
      const datedSignals = resolveOrangeRelativeDates(account.recent_signals, now)
      await this.seedDossier(
        {
          account: {
            ...account,
            recent_signals: datedSignals,
            raw_analysis: Array.isArray((account.raw_analysis as Record<string, unknown>)['recent_signals'])
              ? {
                  ...account.raw_analysis,
                  recent_signals: resolveOrangeRelativeDates(
                    (account.raw_analysis as Record<string, unknown>)[
                      'recent_signals'
                    ] as typeof account.recent_signals,
                    now,
                  ),
                }
              : account.raw_analysis,
          },
          contacts: [...contacts],
          attackAngles: attackAngles ?? [],
          actionPlan: actionPlan ?? { strategy_type: 'land_and_expand', strategy_justification: '', weeks: [] },
        },
        workspaceId,
        ownerUserId,
        accountIds,
        new Map<string, string>(),
      )
      // D13 : une tâche ouverte à venir — sans elle, « À programmer » s'affichait sur un compte qu'on vient d'analyser.
      const accountId = accountIds.get(account.company_name)
      if (!accountId) continue
      // 12/10/2026 — un compte d'extension qui porte un dossier de compte (Orange) : ses ESN vont dans « ESN présentes »
      // (`account_partners`), comme celles des dossiers de brief. Sans dossier : rien (aucune ESN inventée).
      await this.seedBriefPartners(workspaceId, accountId, account.company_name)
      await this.tasks.save(
        this.tasks.create({
          workspace_id: workspaceId,
          owner_id: ownerUserId,
          created_by: ownerUserId,
          title: nextAction.title,
          details: null,
          status: 'todo',
          priority: 'normal',
          due_on: new Date(now + nextAction.dueInDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          account_id: accountId,
          contact_id: null,
          project_id: null,
          completed_at: null,
          completed_by: null,
          result_note: null,
          expected_result: nextAction.expectedResult,
          channel: null,
          objective: nextAction.objective,
          ritual_key: null,
          created_at: new Date(now),
        }),
      )
    }
  }

  /**
   * LE RÔLE POURVU, ET SA MISSION (31/08/2026, colonne `missions.need_id`).
   *
   * Ce que ce semis rend visible et que rien d'autre ne rend : le quatrième
   * chiffre du bandeau « Staffing » d'une fiche besoin. Sans lui, la salle
   * n'affiche « Mission attribuée » que sur des besoins encore ouverts, donc
   * « 0 » partout — une capacité livrée qui a l'air d'une capacité vide.
   *
   * Le contenu du rôle vit dans {@link DEMO_STAFFED_NEED} et non en dur ici :
   * une garde qui voudrait vérifier ce que la salle montre doit pouvoir le lire
   * depuis le jeu de données.
   *
   * ⚠️ `WHERE NOT EXISTS` : la salle se remet à neuf en rejouant ce semis, et
   * un second passage ne doit pas poser un second rôle. La règle est la même
   * que celle du besoin phare quelques centaines de lignes plus haut.
   *
   * ⚠️ L'`UPDATE` porte la MÊME règle que la production
   * (`ProjectsController.soleNeedOf`) : il ne lie que si l'affaire ne porte
   * qu'un seul rôle. La salle montre donc ce que le produit fait, pas une
   * version arrangée — et le jour où quelqu'un ajoutera un second rôle sur ce
   * projet, la salle basculera d'elle-même sur « non mesuré », comme en
   * clientèle.
   */
  /**
   * #2338 / #2409 — une mission `onboarding` (début dans douze jours), son
   * consultant PLANIFIÉ, et DEUX gestes seulement (accord client, bon de
   * commande) : la fiche montre « Accords à confirmer », « Bloqué » et nomme
   * l'accord du consultant manquant. Rien d'autre n'est semé sur elle — elle
   * n'a encore rien produit.
   */
  private async seedStartReadinessMission(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    consultantIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const day = 86_400_000
    const m = DEMO_START_READINESS_MISSION
    const startsOn = new Date(now + m.starts_in_days * day).toISOString().slice(0, 10)
    // ⚠️ MÊME forme d'INSERT que la boucle des missions (mêmes colonnes, même
    // rang des `$n`) : les gardes du semis lisent ces paramètres PAR RANG.
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO missions
         (workspace_id, user_id, account_id, opportunity_id, label, status, started_on, ends_on, daily_rate,
          contract_kind, role_title, owner_id, stage_entered_at, billing_contact_id, cra_contact_id,
          legal_entity_id, renewal_status, renewal_status_at, renewal_client_rail, renewal_consultant_rail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $2, $12::timestamptz, $13::uuid, $14::uuid, $15::uuid,
               $16::text, $17::timestamptz, $18::jsonb, $19::jsonb)
       RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        accountId,
        null,
        m.label,
        m.status,
        startsOn,
        null,
        m.daily_rate,
        m.contract_kind,
        m.role_title,
        new Date(now - 4 * day).toISOString(),
        null,
        null,
        null,
        null,
        null,
        // #2413.49 à .57 — une mission qui n'a pas encore commencé n'a aucun
        // rail ouvert.
        null,
        null,
      ],
    )
    if (!row) return
    const consultantId = consultantIds.get(m.consultant)
    if (consultantId) {
      await this.accounts.manager.query(
        `INSERT INTO mission_assignments (mission_id, workspace_id, consultant_id, load_percent, starts_on, ends_on, status)
         VALUES ($1, $2, $3, 100, $4::date, $5::date, 'planned')`,
        [row.id, workspaceId, consultantId, startsOn, null],
      )
    }
    for (const check of m.checks) {
      await this.accounts.manager.query(
        `INSERT INTO mission_start_checks (workspace_id, mission_id, item_key, proof, confirmed_by, confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
        [
          workspaceId,
          row.id,
          check.item,
          check.proof,
          ownerUserId,
          new Date(now - check.confirmed_days_ago * day).toISOString(),
        ],
      )
    }
  }

  /**
   * #3547 — le forfait encadré de la salle : une mission `active` SANS affectation,
   * qui porte le mode, le rôle tenu et l'équipe côté client, et dont la marge se
   * calcule depuis ses conditions commerciales. Aucun consultant n'est inventé.
   * La salle se remet à neuf par un semis neuf (comme les autres missions de cette fonction).
   */
  private async seedSupervisedForfaitMission(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    now: number,
  ): Promise<void> {
    const day = 86_400_000
    const m = DEMO_SUPERVISED_FORFAIT_MISSION
    // ⚠️ MÊME forme d'INSERT que la boucle des missions (`INSERT … VALUES`, les
    // colonnes LUES PAR LEUR NOM par les gardes du semis) : `billing_contact_id`
    // y est, à `null` — « contact de facturation inconnu » reste un bloqueur nommé.
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO missions
         (workspace_id, user_id, account_id, label, status, started_on, ends_on, daily_rate,
          contract_kind, role_title, owner_id, stage_entered_at, billing_contact_id,
          delivery_mode, supervision_role, client_team_size, client_team_names)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::numeric, $9, $10, $2, $11::timestamptz, $12::uuid,
               $13::text, $14::text, $15::integer, $16::text[])
       RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        accountId,
        m.label,
        m.status,
        new Date(now - m.started_days_ago * day).toISOString().slice(0, 10),
        new Date(now + m.ends_in_days * day).toISOString().slice(0, 10),
        m.daily_rate,
        m.contract_kind,
        m.role_title,
        new Date(now - m.stage_entered_days_ago * day).toISOString(),
        null,
        m.delivery_mode,
        m.supervision_role,
        m.client_team_size,
        m.client_team_names,
      ],
    )
    if (!row) return
    await this.accounts.manager.query(
      `INSERT INTO mission_commercial_terms (mission_id, workspace_id, loaded_daily_cost_cents, channel, requires_po)
       VALUES ($1, $2, $3, 'direct', false)`,
      [row.id, workspaceId, m.loaded_daily_cost_cents],
    )
  }

  private async seedStaffedNeed(
    workspaceId: string,
    ownerUserId: string,
    projectId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    const need = DEMO_STAFFED_NEED
    // ⚠️ CHAQUE paramètre est CASTÉ : dans un `INSERT … SELECT`, la liste du
    // SELECT est résolue AVANT d'être rapprochée des colonnes, et un paramètre
    // sans contexte y retombe sur `text`. C'est le « inconsistent types deduced
    // for parameter » qui a déjà mis `POST /demo/session` en 500.
    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      // ⚠️ L'ORDRE DES COLONNES est celui de la boucle `client.openNeeds`
      // ci-dessus, `status_reason` compris (à `null` ici — un rôle pourvu n'a
      // pas de motif d'arrêt). Ce n'est pas de la coquetterie : les gardes du
      // semis lisent ces paramètres PAR RANG (`params[9]` = l'état,
      // `params[11]` = la date d'étape), et une colonne omise décale tout ce
      // qui suit sans qu'aucun type ne s'y oppose — la « jointure par
      // position » déjà payée dans ce dépôt.
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, seniority, headcount, target_tjm_cents, location,
          contract_kind, status, status_reason, status_changed_at, urgency, source, provenance, owner_id, context,
          remote)
      -- #2558.1 — account_id est NOT NULL depuis la migration
      -- 1795711263408. Il se DERIVE du projet ici, en SQL, plutot que de
      -- prendre un rang de paramètre : les gardes du semis lisent ces
      -- paramètres PAR RANG, et en insérer un décalerait tout ce qui suit.
       SELECT $1::uuid, $2::uuid,
              (SELECT o.account_id FROM opportunities o WHERE o.id = $2::uuid),
              $3::text, $4::jsonb, $5::text, $6::integer, $7::bigint, $8::text,
              $9::text, $10::text, $11::text, $12::timestamptz, $13::text, $14::text, $15::text, $16::uuid, $17::text,
              -- #2173.29 — AJOUTÉE EN FIN DE LISTE, même raison que plus haut.
              $18::text
        WHERE NOT EXISTS (SELECT 1 FROM project_needs WHERE project_id = $2)
       RETURNING id`,
      [
        workspaceId,
        projectId,
        need.title,
        JSON.stringify(need.skills),
        need.seniority,
        need.headcount,
        need.target_tjm_cents,
        need.location,
        need.contract_kind,
        need.status,
        null,
        iso(need.status_changed_days_ago),
        need.urgency,
        need.source,
        need.provenance,
        ownerUserId,
        need.context,
        need.remote,
      ],
    )
    if (!row) return

    // #2191.17/#2191.18 (24/09/2026, recette f9f23f887) — MÊME COPIE que
    // `DeliveryService.inheritNeedContext` au handoff réel : la mission ne
    // reçoit pas que `need_id`, elle reçoit aussi `remote_preference` et
    // `location` du besoin — sinon `MissionDetailTabs.tsx` (qui lit CES
    // colonnes de la mission, jamais celles du besoin) affiche « non repris
    // du besoin » même quand {@link DEMO_STAFFED_NEED} porte la valeur.
    await this.accounts.manager.query(
      `UPDATE missions SET need_id = $1, remote_preference = $4, location = $5
        WHERE workspace_id = $2
          AND opportunity_id = $3
          AND need_id IS NULL
          AND (SELECT COUNT(*) FROM project_needs n WHERE n.project_id = $3) = 1`,
      [row.id, workspaceId, projectId, need.remote, need.location],
    )
  }

  /**
   * LES NOTES DE FRAIS de la salle (31/08/2026).
   *
   * Ce que ce semis doit produire à l'écran, et qu'aucun autre ne produit :
   *  - trois tuiles NON VIDES — une file vide ne montre pas un produit ;
   *  - les DEUX verdicts de conformité. `F-2026-006` est conforme,
   *    `2026-04-001` est « non vérifiée » parce qu'elle porte une catégorie que
   *    le barème ne plafonne pas. Une salle toujours conforme donnerait
   *    l'impression que le contrôle est décoratif ;
   *  - une anomalie RÉELLE : le doublon exact de `0146`, qui est aussi la
   *    raison de son refus.
   *
   * ⚠️ Il lit comme l'ÉCRAN : la liste groupe par note et somme les lignes,
   * donc chaque note semée a au moins une ligne — une note sans ligne
   * afficherait « 0,00 € » sur une file censée montrer des montants.
   *
   * ⚠️ AUCUNE ligne `mission_expenses` n'est écrite ici, même pour les notes
   * validées. Semer la ligne de coût ferait bouger la marge nette des missions
   * de la salle, documentée par le lot du 30/08 (500 € sur UNE seule mission).
   * Le lien se démontre autrement, et mieux : les notes EN ATTENTE portent leur
   * mission, et valider depuis l'écran écrit la ligne pour de vrai.
   */
  private async seedExpenseReports(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const [policy] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO expense_policies (workspace_id, account_id, label, reimbursement_basis)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [workspaceId, accountId, DEMO_EXPENSE_POLICY.label, DEMO_EXPENSE_POLICY.reimbursement_basis],
    )
    if (!policy) return

    for (const cap of DEMO_EXPENSE_POLICY.caps) {
      await this.accounts.manager.query(
        `INSERT INTO expense_policy_caps (policy_id, workspace_id, category, cap_cents, vat_recoverable)
         VALUES ($1, $2, $3, $4::bigint, $5)`,
        // ⚠️ `effective_from` n'est PAS écrit : les plafonds de la salle sont
        // « en vigueur depuis toujours ». Les dater d'aujourd'hui ferait basculer
        // toutes les notes antérieures — donc toute la salle — sur « non
        // vérifiée », ce qui est exactement le verdict qu'on ne veut pas partout.
        [policy.id, workspaceId, cap.category, cap.cap_cents, cap.vat_recoverable],
      )
    }

    const anchor = new Date(now)

    // Le barème kilométrique, daté du 1er janvier de l'année en cours : une date
    // en dur périmerait la salle au premier janvier suivant.
    const mileageFrom = `${anchor.getUTCFullYear()}-01-01`
    for (const rate of DEMO_EXPENSE_POLICY.mileageRates) {
      await this.accounts.manager.query(
        `INSERT INTO expense_mileage_rates (policy_id, workspace_id, fiscal_horsepower, cents_per_km, effective_from)
         VALUES ($1, $2, $3::int, $4::bigint, $5::date)`,
        [policy.id, workspaceId, rate.fiscal_horsepower, rate.cents_per_km, mileageFrom],
      )
    }
    for (const report of DEMO_EXPENSE_REPORTS) {
      // Le mois de la note, ancré sur AUJOURD'HUI : `Date.UTC(y, m, 1)` accepte
      // un mois négatif et retombe sur l'année précédente, ce qui évite un
      // calcul à la main qui se tromperait en janvier.
      const month = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - report.monthsAgo, 1))
      const periodMonth = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`
      // ⚠️ Seuls `validated` et `rejected` portent une date de décision. Le test
      // d'origine était `status === 'pending' ? null : …` : à l'arrivée du
      // brouillon, il aurait daté la décision d'une note que PERSONNE n'a
      // décidée — et l'écran aurait affiché « Décidée le 5 » sur un brouillon.
      const decided =
        report.status === 'validated' || report.status === 'rejected'
          ? new Date(month.getUTCFullYear(), month.getUTCMonth() + 1, 5)
          : null
      // Un BROUILLON n'a pas de date de dépôt — la contrainte
      // `expense_reports_submitted_at_check` l'exige pour tous les autres.
      const submittedAt =
        report.status === 'draft' ? null : new Date(month.getUTCFullYear(), month.getUTCMonth() + 1, 2).toISOString()

      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO expense_reports
           (workspace_id, mission_id, account_id, bearer_name, bearer_user_id, reference, period_month,
            status, submitted_at, decided_at, decided_by, rejection_reason)
         VALUES ($1, $2::uuid, $3, $4, NULL, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::uuid, $11::text)
         RETURNING id`,
        [
          workspaceId,
          // Un libellé absent de la carte rend `null` : c'est le cas des notes
          // sans mission, pas une erreur à masquer.
          report.missionLabel ? (missionIds.get(report.missionLabel) ?? null) : null,
          accountId,
          report.bearer_name,
          report.reference,
          periodMonth,
          report.status,
          submittedAt,
          decided === null ? null : decided.toISOString(),
          decided === null ? null : ownerUserId,
          report.rejection_reason,
        ],
      )
      if (!row) continue

      for (const line of report.lines) {
        await this.accounts.manager.query(
          `INSERT INTO expense_report_lines
             (expense_report_id, workspace_id, category, label, spent_on, city, detail, amount_cents, vat_rate_bps,
              distance_km, fiscal_horsepower)
           VALUES ($1, $2, $3, $4, $5::date, $6::text, $7::text, $8::bigint, $9::int, $10::int, $11::int)`,
          [
            row.id,
            workspaceId,
            line.category,
            line.label,
            `${periodMonth}-${String(line.dayOfMonth).padStart(2, '0')}`,
            line.city,
            line.detail,
            line.amount_cents,
            line.vat_rate_bps,
            // ⚠️ `in` et non un accès direct : onze lignes sur douze n'ont NI
            // distance NI puissance — la question ne s'y pose pas, et `0 km`
            // serait une mesure, donc une mesure fausse.
            'distance_km' in line ? line.distance_km : null,
            'fiscal_horsepower' in line ? line.fiscal_horsepower : null,
          ],
        )
      }

      for (const attachment of report.attachments) {
        // ⚠️ De VRAIS octets sur les pièces marquées `stored` (31/08/2026) :
        // sans eux, la salle rouvrirait le défaut que ce lot corrige — un
        // justificatif nommé, daté, et rien derrière. Les autres restent
        // délibérément sans fichier, pour que la phrase « référencée, non
        // stockée » reste visible quelque part.
        const storageObjectId = attachment.stored
          ? await this.seedStoredFile({
              workspaceId,
              domain: 'expense_receipt',
              fileKey: `expense/${report.reference}/${attachment.file_name}`,
              fileName: attachment.file_name,
              title: 'Justificatif de demonstration',
              lines: [
                `Note de frais ${report.reference}`,
                `Porteur : ${report.bearer_name}`,
                `Periode : ${periodMonth}`,
                '',
                'Document FICTIF, produit pour la salle de demonstration Bellum.',
              ],
              depositedOn: `${periodMonth}-28`,
            })
          : null
        await this.accounts.manager.query(
          `INSERT INTO expense_report_attachments
             (expense_report_id, workspace_id, file_name, content_type, byte_size, storage_object_id, retention_until)
           VALUES ($1, $2, $3, $4, $5::bigint, $6, $7::date)`,
          [
            row.id,
            workspaceId,
            attachment.file_name,
            attachment.content_type,
            // `null` = poids inconnu : l'écran écrit « non mesuré », jamais
            // « 0 KB ». Une pièce de la salle en porte un exprès.
            attachment.byte_size,
            // `null` = pièce RÉFÉRENCÉE sans octets : l'écran n'offre alors
            // aucun bouton, et il le DIT.
            storageObjectId,
            // Dix ans est le Code de commerce FRANÇAIS (L123-22) ; la durée est
            // un PARAMÈTRE côté contrats, pas un chiffre codé dans le calcul.
            `${Number(periodMonth.slice(0, 4)) + 10}${periodMonth.slice(4)}-28`,
          ],
        )
      }
    }
  }

  /**
   * L'HISTORIQUE DE FACTURATION du client d'exemple — D42 (Louis, 28/08/2026).
   *
   * Sans lui, `RevenueService.dso()` ne lit AUCUNE ligne et la tuile « Délai de
   * paiement » du pilotage affiche pour toujours « non mesurable — 0 facture sur
   * les 10 nécessaires ». Le calcul est juste et livré ; il n'avait rien à lire.
   *
   * Ce qui est écrit, et pourquoi c'est écrit LÀ :
   *
   *  - APRÈS les missions. `mission_id` est une clé étrangère `NOT NULL`, et le
   *    libellé ne devient un id que dans la boucle du dessus.
   *  - `reminders_sent` à ZÉRO, en LITTÉRAL. Décision de Louis : on ne montre
   *    pas des relances envoyées à des clients fictifs qui n'en ont jamais reçu.
   *    Un paramètre, lui, finirait par se remplir depuis le jeu de données.
   *  - `state = 'invoiced'` : ces mois sont sortis de la surveillance parce que
   *    quelqu'un les a facturés dans son outil comptable. C'est aussi ce qui les
   *    tient hors du balayeur d'interventions, qui ne regarde que `blocked`.
   *  - AUCUN montant préparatoire : il se recalcule à chaque lecture depuis les
   *    relevés, et c'est la seule moitié VRAIE de l'ancienne raison de
   *    couverture (« l'état de facturation se recalcule »).
   *
   * Les dates viennent de {@link demoInvoiceHistory}, qui les dérive une seule
   * fois : deux chemins qui les referaient divergeraient.
   */
  /**
   * CE QUI REMPLIT LA CHECKLIST DES GESTES HORS OUTIL (craft rule n°9, #1503).
   *
   * Les positions viennent du CATALOGUE et sont vérifiées contre lui : cocher
   * une étape du flux dérivé serait refusé par le service, et une position qui
   * n'existe plus laisserait une case orpheline que rien n'afficherait.
   */
  /**
   * #2412 — le double pouls de satisfaction, semé sur LA mission active de la
   * salle (« Fiabilisation plateforme — renfort exploitation »).
   *
   * Deux entrées, une par rail, qui DIVERGENT volontairement (#2412.8) : le
   * client est ravi, le consultant est sous tension. Les fusionner en une
   * moyenne ferait disparaître exactement le cas qui compte commercialement —
   * c'est aussi le cas que la doctrine « un score n'est jamais nu » interdit
   * de réduire à un chiffre. `source: 'human'`, comme la route qui les
   * écrirait vraiment (`POST delivery/missions/:id/feedback`, toujours
   * `source: 'human'` — #2412.7/#2412.9).
   *
   * Les neuf autres missions de la salle restent SANS entrée : un rail sans
   * avis dit « pas encore d'avis » à l'écran, jamais un score à 0 (doctrine
   * « on n'affiche pas ce qu'on n'a pas »).
   */
  private async seedMissionFeedback(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
  ): Promise<void> {
    const missionId = missionIds.get('Fiabilisation plateforme — renfort exploitation')
    if (!missionId) return
    const day = 86_400_000
    const iso = (offsetDays: number): string => new Date(Date.now() - offsetDays * day).toISOString()
    // #2408.16 / #2408.33 — chaque entrée porte son NIVEAU déclaré : le
    // consultant au plus bas allume l'exception « Satisfaction basse » et
    // remplit la colonne Satisfaction de /missions ; les autres missions
    // restent « non mesurée » (aucune entrée), jamais un niveau inventé.
    const entries: {
      rail: 'client' | 'consultant'
      note: string
      daysAgo: number
      level: 'low' | 'medium' | 'high'
    }[] = [
      {
        rail: 'client',
        note: 'Yanis est très réactif sur les incidents, l’équipe lui fait confiance en autonomie.',
        daysAgo: 6,
        level: 'high',
      },
      {
        rail: 'consultant',
        note: 'La charge d’astreinte est soutenue depuis deux semaines — à regarder avant la reconduction.',
        daysAgo: 3,
        level: 'low',
      },
    ]
    for (const entry of entries) {
      await this.accounts.manager.query(
        `INSERT INTO mission_feedback (mission_id, workspace_id, rail, note, private, source, recorded_by, created_at, level)
         VALUES ($1, $2, $3, $4, false, 'human', $5, $6::timestamptz, $7)`,
        [missionId, workspaceId, entry.rail, entry.note, ownerUserId, iso(entry.daysAgo), entry.level],
      )
    }
  }

  /**
   * #2953 (#2193.25-30) — LE SUIVI, semé sur LA mission active de la salle
   * (« Fiabilisation plateforme — renfort exploitation »), même mission que
   * `seedMissionFeedback` juste au-dessus : sans ces lignes, le panneau
   * « Suivi » qui vient d'apparaître dans l'onglet Synthèse (`NotesPanel`,
   * `entityType: 'mission'`) s'ouvrirait vide au milieu d'une démonstration —
   * même raison, mot pour mot, que `DEMO_NOTES` pour les comptes (craft rule
   * n°9).
   *
   * Deux entrées, deux des six catégories citées par #2193 (un point client,
   * une décision) : assez pour prouver la capacité, pas un roman. Les neuf
   * autres missions de la salle restent SANS entrée : une absence de note dit
   * « rien de noté pour l'instant » à l'écran (`notes.empty`), jamais un vide
   * masqué.
   */
  private async seedMissionTracking(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
  ): Promise<void> {
    const missionId = missionIds.get('Fiabilisation plateforme — renfort exploitation')
    if (!missionId) return
    const day = 86_400_000
    const now = Date.now()
    const entries: { body: string; daysAgo: number; pinned: boolean }[] = [
      {
        body: 'Point client : le sponsor demande un point d’avancement mensuel plutôt que trimestriel à partir de novembre.',
        daysAgo: 4,
        pinned: true,
      },
      {
        body: 'Décision : on ne remplace pas Yanis pendant la période d’astreinte soutenue, on ajuste plutôt le rythme des tickets P2 avec le client.',
        daysAgo: 2,
        pinned: false,
      },
    ]
    const rows = entries.map(entry => {
      const at = new Date(now - entry.daysAgo * day)
      return this.notes.create({
        workspace_id: workspaceId,
        user_id: ownerUserId,
        entity_type: 'mission',
        entity_id: missionId,
        body: entry.body,
        pinned: entry.pinned,
        created_at: at,
        updated_at: at,
      })
    })
    await this.notes.save(rows)
  }

  /**
   * #2193.51 (épopée #2953) — LES DOCUMENTS de la mission, semés sur LA
   * mission active de la salle (« Fiabilisation plateforme — renfort
   * exploitation »), même mission que `seedMissionTracking`/
   * `seedMissionFeedback` juste au-dessus : sans ces lignes, la section
   * « Documents » qui vient d'apparaître dans l'onglet Historique
   * (`MissionDocumentsPanel`) s'ouvrirait vide au milieu d'une démonstration
   * — même raison, mot pour mot, que `seedMissionTracking` (craft rule n°9).
   *
   * Trois entrées, trois statuts REPRÉSENTÉS (`signed`/`draft`/`sent`) — même patron
   * que `projectDocuments` (#2171.24) juste au-dessus dans `demo-dataset.ts`.
   * Les neuf autres missions de la salle restent SANS document : une absence
   * dit « rien de suivi pour l'instant » à l'écran (`documents.empty`),
   * jamais un vide masqué.
   */
  private async seedMissionDocuments(workspaceId: string, missionIds: Map<string, string>): Promise<void> {
    const missionId = missionIds.get('Fiabilisation plateforme — renfort exploitation')
    if (!missionId) return
    for (const document of DEMO_DELIVERY_CLIENT.missionDocuments) {
      // #2095.45 (L1) — `sentDaysAgo` date l'envoi d'un avenant (`updated_at`),
      // lu par la carte « avenant en attente de signature ». Absent : maintenant.
      const sentDaysAgo = 'sentDaysAgo' in document ? document.sentDaysAgo : 0
      await this.accounts.manager.query(
        `INSERT INTO mission_documents (workspace_id, mission_id, kind, name, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' days')::interval)`,
        [workspaceId, missionId, document.kind, document.name, document.status, sentDaysAgo],
      )
    }
  }

  private async seedChainManualMarks(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
  ): Promise<void> {
    for (const entry of DEMO_CHAIN_MANUAL_MARKS) {
      const missionId = missionIds.get(entry.missionLabel)
      if (!missionId) {
        this.logger.warn(`Checklist de démonstration sans mission : ${entry.missionLabel}`)
        continue
      }
      for (const position of entry.positions) {
        await this.accounts.manager.query(
          `INSERT INTO chain_manual_marks (workspace_id, chain_key, subject_id, position, marked_by)
           VALUES ($1, 'onboarding_delivery', $2, $3, $4)
           ON CONFLICT (workspace_id, chain_key, subject_id, position) DO NOTHING`,
          [workspaceId, missionId, position, ownerUserId],
        )
      }
    }
  }

  /**
   * #2195.33 — LE RÉSULTAT DU GESTE « construire la proposition », en démo.
   *
   * Une seule ligne, et elle porte les deux faits que le bouton produit : une
   * affaire de nature `manual` au pipe, et le lien `renewal_opportunity_id` sur
   * la mission qu'elle prolonge.
   *
   * ⚠️ Une mission introuvable ne fabrique RIEN. L'affaire ne se sème pas sans
   * son lien : une affaire de renouvellement rattachée à rien se lirait comme
   * une affaire ordinaire, et la démonstration ne montrerait plus ce qu'elle
   * existe pour montrer.
   */
  private async seedManualRenewalProject(
    workspaceId: string,
    accountId: string,
    missionIds: Map<string, string>,
    ownerUserId: string,
  ): Promise<void> {
    const projet = DEMO_DELIVERY_CLIENT.manualRenewalProject
    const missionId = missionIds.get(projet.missionLabel)
    if (!missionId) return

    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, objective, stage, stage_entered_at,
          source, confidence, amount_cents, currency, expected_close_on, first_detected_at, owner_id)
       VALUES ($1, $2, 'manual', $3, $4, $5, $6, now(), NULL, NULL, $7, 'EUR', $8, now(), $9)
       ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
       RETURNING id`,
      [
        workspaceId,
        accountId,
        projet.label,
        projet.detail,
        projet.objective,
        projet.stage,
        projet.amount_cents,
        projet.expected_close_on,
        // #4291.3 — un porteur NOMMÉ (l'occupant de la salle) : jamais « Non attribué » sur l'affaire de 216 000 €.
        ownerUserId,
      ],
    )
    if (!row) return

    // #4291.3 — les interlocuteurs, PAR NOM dans le compte : un nom introuvable ne lie rien (jamais un contact fabriqué).
    for (const link of projet.contacts) {
      await this.accounts.manager.query(
        `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
         SELECT $1, $2, c.id, $5 FROM contacts c
          WHERE c.account_id = $3 AND c.workspace_id = $1 AND c.full_name = $4
          LIMIT 1
         ON CONFLICT DO NOTHING`,
        [workspaceId, row.id, accountId, link.full_name, link.role],
      )
    }

    await this.accounts.manager.query(
      `UPDATE missions SET renewal_opportunity_id = $1 WHERE id = $2 AND workspace_id = $3`,
      [row.id, missionId, workspaceId],
    )
  }

  /**
   * #2196.31 — l'exception « non applicable » de la salle, et sa ligne au
   * JOURNAL de la mission (l'historique du compte porteur) — la même forme que
   * celle qu'écrit `TimesheetsController` : objet système `<mission · mois> —
   * timesheet_not_applicable`, motif en corps, auteur = l'occupant.
   *
   * Le mois est celui de la FIN de mission (`date_trunc` sur `ends_on`), lu en
   * base : jamais un mois deviné côté code qui pourrait tomber hors de la
   * fenêtre de la mission.
   */
  /**
   * L3 Pilotage › Staffing — voir `DEMO_STAFFING`. Un nom de consultant ou de mission qui ne se résout pas est SAUTÉ,
   * jamais inventé. Les jours saisis ce mois-ci sont une part des jours ouvrés ÉCOULÉS (hors fériés : la marge
   * `share` < 1 absorbe l'écart) ; au tout début du mois, rien n'est saisi — « non mesuré » reste vrai.
   */
  private async seedStaffing(workspaceId: string, missionIds: Map<string, string>, now: number): Promise<void> {
    const consultantRows = await this.accounts.manager.query<{ id: string; full_name: string }[]>(
      `SELECT id, full_name FROM consultants WHERE workspace_id = $1`,
      [workspaceId],
    )
    const byName = new Map(consultantRows.map(row => [row.full_name, row.id]))
    const day = 86_400_000
    const dateOnly = (offsetDays: number): string => new Date(now + offsetDays * day).toISOString().slice(0, 10)

    for (const [name, cents] of Object.entries(DEMO_STAFFING.dailyCostCents)) {
      await this.accounts.manager.query(
        `UPDATE consultants SET cost_rate_cents = $3 WHERE workspace_id = $1 AND full_name = $2`,
        [workspaceId, name, cents],
      )
    }

    for (const absence of DEMO_STAFFING.absences) {
      const consultantId = byName.get(absence.consultant)
      if (!consultantId) continue
      await this.accounts.manager.query(
        `INSERT INTO consultant_absences (workspace_id, consultant_id, kind, starts_on, ends_on)
         VALUES ($1, $2, $3, $4::date, $5::date)`,
        [
          workspaceId,
          consultantId,
          absence.kind,
          dateOnly(absence.starts_in_days),
          dateOnly(absence.starts_in_days + absence.length_days - 1),
        ],
      )
    }

    await this.accounts.manager.query(`UPDATE workspaces SET tace_alert_threshold_percent = $2 WHERE id = $1`, [
      workspaceId,
      DEMO_STAFFING.taceThresholdPercent,
    ])

    const today = new Date(now)
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    let elapsed = 0
    for (
      let cursor = monthStart.getTime();
      cursor < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      cursor += day
    ) {
      const weekday = new Date(cursor).getUTCDay()
      if (weekday !== 0 && weekday !== 6) elapsed += 1
    }
    if (elapsed < 2) return
    const periodMonth = `${monthStart.toISOString().slice(0, 7)}-01`
    for (const sheet of DEMO_STAFFING.currentMonthTimesheets) {
      const missionId = missionIds.get(sheet.mission)
      const consultantId = byName.get(sheet.consultant)
      if (!missionId || !consultantId) continue
      await this.accounts.manager.query(
        `INSERT INTO mission_timesheets (mission_id, consultant_id, period_month, days, status)
         VALUES ($1, $2, $3::date, $4, 'submitted')
         ON CONFLICT DO NOTHING`,
        [missionId, consultantId, periodMonth, Math.round(elapsed * sheet.share * 2) / 2],
      )
    }
  }

  private async seedTimesheetExceptions(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    for (const exception of DEMO_TIMESHEET_EXCEPTIONS) {
      const missionId = missionIds.get(exception.mission_label)
      if (!missionId) continue
      const markedAt = new Date(now - exception.marked_days_ago * 86_400_000)
      const rows = await this.accounts.manager.query<{ period_month: string | Date }[]>(
        `INSERT INTO mission_timesheet_exceptions
           (workspace_id, mission_id, consultant_id, period_month, reason, created_by, created_at)
         SELECT $1, m.id, asg.consultant_id, date_trunc('month', m.ends_on)::date, $3, $4, $5::timestamptz
           FROM missions m
           LEFT JOIN mission_assignments asg ON asg.mission_id = m.id
          WHERE m.id = $2 AND m.ends_on IS NOT NULL
          LIMIT 1
         ON CONFLICT DO NOTHING
         RETURNING period_month`,
        [workspaceId, missionId, exception.reason, ownerUserId, markedAt.toISOString()],
      )
      const month = rows[0]?.period_month
      const monthKey = month instanceof Date ? month.toISOString().slice(0, 7) : String(month ?? '').slice(0, 7)
      await this.activities.save(
        this.activities.create({
          workspace_id: workspaceId,
          user_id: ownerUserId,
          kind: 'workflow',
          source: 'system',
          direction: 'internal',
          subject: timelineSystemSubject(
            monthKey ? `${exception.mission_label} · ${monthKey}` : exception.mission_label,
            'timesheet_not_applicable',
          ),
          body: exception.reason,
          body_truncated: false,
          occurred_at: markedAt,
          duration_seconds: null,
          account_id: accountId,
          contact_id: null,
          project_id: null,
          link_reason: null,
          external_id: null,
          external_url: null,
          created_at: markedAt,
        }),
      )
    }
  }

  private async seedInvoiceHistory(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    for (const invoice of demoInvoiceHistory(now)) {
      const missionId = missionIds.get(invoice.missionLabel)
      // Une facture sans mission ne s'écrit pas — la contrainte la refuserait,
      // et `POST /demo/session` partirait en 500 pour tous les prospects.
      // `demo-seed.service.spec.ts` compte les lignes émises pour que ce
      // `continue` ne puisse pas vider la salle en silence.
      if (!missionId) {
        this.logger.warn(`Facture de démonstration sans mission : ${invoice.missionLabel}`)
        continue
      }

      await this.accounts.manager.query(
        // ⚠️ Les colonnes nullables sont CASTÉES. Postgres déduit le type depuis
        // la colonne cible dans un `VALUES` littéral, mais la déduction s'arrête
        // dès que la requête devient un `INSERT … SELECT` : un `null` non typé
        // s'y fait refuser en « could not determine data type ». C'est ce qui
        // avait déjà mis `POST /demo/session` en 500 dans ce fichier.
        `INSERT INTO invoice_readiness
           (workspace_id, mission_id, period_month, state, invoice_reference, invoiced_amount_cents,
            invoiced_at, invoiced_by, due_on, paid_at, paid_amount_cents,
            disputed_at, dispute_reason, dispute_resolved_at, reminders_sent)
         VALUES ($1, $2, $3::date, 'invoiced', $4, $5,
                 $6::timestamptz, $7, $8::date, $9::timestamptz, $10,
                 $11::timestamptz, $12::text, $13::timestamptz, 0)`,
        [
          workspaceId,
          missionId,
          invoice.periodMonth,
          invoice.reference,
          invoice.invoicedAmountCents,
          invoice.invoicedAt,
          ownerUserId,
          invoice.dueOn,
          invoice.paidAt,
          invoice.paidAmountCents,
          // La contrainte `invoice_dispute_reason_check` tient le COUPLE en
          // base : une date de litige sans motif est refusée. Les deux champs
          // partent donc toujours ensemble depuis le jeu de données.
          invoice.disputedAt,
          invoice.disputeReason,
          // `invoice_dispute_resolution_check` : on ne lève pas un litige que
          // personne n'a ouvert.
          invoice.disputeResolvedAt,
        ],
      )
    }
  }

  /**
   * #2419.9 — LE PAIEMENT NON RAPPROCHÉ du client d'exemple.
   *
   * Sans mission ni facture à retrouver (`invoice_readiness_id` explicitement
   * `null`) : c'est le sens même de « à rapprocher » (#2419.1). Le seau « Non
   * rapproché » de `/pilotage/finance` lit `GET /delivery/payments`, qui lit
   * cette table — la laisser vide ferait un écran livré et muet.
   */
  private async seedUnmatchedPayments(workspaceId: string, ownerUserId: string, now: number): Promise<void> {
    for (const payment of demoUnmatchedPayments(now)) {
      await this.accounts.manager.query(
        `INSERT INTO invoice_payments
           (workspace_id, invoice_readiness_id, amount_cents, received_on, payer, reference, source, recorded_by)
         VALUES ($1, $2::uuid, $3, $4::date, $5, $6, 'manual', $7)`,
        [workspaceId, null, payment.amountCents, payment.receivedOn, payment.payer, payment.reference, ownerUserId],
      )
    }
  }

  /**
   * LA CESSION DE CRÉANCE du client d'exemple (31/08/2026).
   *
   * Sans elle, `/missions/cessions` s'ouvre sur quatre compteurs à zéro et un
   * tableau vide : un écran livré et muet, ce qu'un prospect découvre en
   * réunion. Craft rule n°9.
   *
   * Ce qui est écrit, et pourquoi c'est écrit LÀ :
   *
   *  - APRÈS `seedInvoiceHistory`. Une cession porte sur une créance facturée,
   *    et `FactoringService.prepare` le REFUSE autrement : semer des cessions
   *    sans facture ferait une salle qui montre ce que le produit interdit.
   *  - UN seul contrat. Deux factors sur un client d'exemple donneraient un
   *    écran plus riche et un récit plus faible : ce n'est pas la situation
   *    d'une ESN qui commence à affacturer.
   *  - Le taux et le plafond viennent du jeu de données ; les MONTANTS, eux,
   *    sont dérivés des factures par {@link demoFactoringAssignments}. Deux
   *    chemins qui les referaient divergeraient, et l'écran des cessions
   *    contredirait celui des encaissements sur la même créance.
   */
  private async seedFactoring(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const day = 86_400_000
    const dateOnly = (daysAgo: number): string => new Date(now - daysAgo * day).toISOString().slice(0, 10)

    const [contract] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO factoring_contracts
         (workspace_id, factor_name, contract_reference, commission_rate_bps, outstanding_limit_cents,
          status, started_on)
       VALUES ($1, $2, $3, $4, $5, 'active', $6::date)
       RETURNING id`,
      [
        workspaceId,
        DEMO_FACTORING.contract.factor_name,
        DEMO_FACTORING.contract.contract_reference,
        DEMO_FACTORING.contract.commission_rate_bps,
        DEMO_FACTORING.contract.outstanding_limit_cents,
        dateOnly(DEMO_FACTORING.contract.started_days_ago),
      ],
    )
    // Un contrat qui n'est pas revenu ferait partir chaque cession en violation
    // de clé étrangère, c'est-à-dire `POST /demo/session` en 500 pour tous les
    // prospects. On le dit, et on s'arrête.
    if (!contract) {
      this.logger.warn('Contrat d’affacturage de démonstration non inséré : aucune cession ne sera semée')
      return
    }

    for (const assignment of demoFactoringAssignments(now)) {
      const missionId = missionIds.get(assignment.missionLabel)
      if (!missionId) {
        this.logger.warn(`Cession de démonstration sans mission : ${assignment.missionLabel}`)
        continue
      }

      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        // ⚠️ Colonnes nullables CASTÉES, même raison qu'ailleurs dans ce
        // fichier : un `null` non typé se fait refuser en « could not
        // determine data type » dès que la requête cesse d'être un `VALUES`
        // littéral, et c'est ce qui a déjà mis la démonstration en 500.
        `INSERT INTO receivable_assignments
           (workspace_id, contract_id, mission_id, period_month, status,
            assigned_amount_cents, commission_rate_bps, assigned_on, settled_on, decision_reason)
         VALUES ($1, $2, $3, $4::date, $5, $6::bigint, $7::integer, $8::date, $9::date, $10::text)
         RETURNING id`,
        [
          workspaceId,
          contract.id,
          missionId,
          assignment.periodMonth,
          assignment.status,
          assignment.assignedAmountCents,
          assignment.commissionRateBps,
          assignment.assignedOn,
          assignment.settledOn,
          assignment.decisionReason,
        ],
      )
      if (!row) continue

      for (const settlement of assignment.settlements) {
        await this.accounts.manager.query(
          `INSERT INTO factoring_settlements
             (workspace_id, contract_id, assignment_id, received_on, amount_cents, reference, recorded_by)
           VALUES ($1, $2, $3, $4::date, $5, $6, $7)`,
          [
            workspaceId,
            contract.id,
            row.id,
            settlement.receivedOn,
            settlement.amountCents,
            settlement.reference,
            ownerUserId,
          ],
        )
      }
    }

    // Le règlement que rien ne rapproche : `assignment_id` reste `null`, et
    // c'est LA file de travail de l'écran, pas un oubli de semis.
    for (const settlement of DEMO_FACTORING.unreconciled_settlements) {
      await this.accounts.manager.query(
        `INSERT INTO factoring_settlements
           (workspace_id, contract_id, assignment_id, received_on, amount_cents, reference, recorded_by)
         VALUES ($1, $2, NULL, $3::date, $4, $5, $6)`,
        [
          workspaceId,
          contract.id,
          dateOnly(settlement.days_ago),
          settlement.amount_cents,
          settlement.reference,
          ownerUserId,
        ],
      )
    }
  }

  /**
   * Le projet d'UNE mission — le premier reprend celui du client, les suivants
   * naissent de la mission elle-même.
   *
   * `missions_opportunity_uniq` interdit deux missions sur un même projet. Le
   * projet gagné du client reste porté par la PREMIÈRE mission, parce que c'est
   * lui que les positionnements (`submissions`) citent : le déplacer casserait
   * l'entonnoir de l'écran Vivier. Les suivantes reçoivent chacune le leur.
   *
   * Rien n'est inventé : le libellé, le montant et la date viennent de la
   * mission. Le montant est le TJM × 20 jours — une estimation ASSUMÉE et dite
   * comme telle dans le détail, pas un chiffre présenté comme mesuré.
   */
  private async projectForMission(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    clientProjectId: string,
    mission: { label: string; daily_rate: number | null; started_days_ago: number },
    index: number,
    iso: (offsetDays: number) => string,
  ): Promise<string> {
    if (index === 0) return clientProjectId

    const [row] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at,
          amount_cents, estimated_amount, currency, closed_at, outcome, first_detected_at)
       VALUES ($1, $2, 'besoin', $3, $4, 'won', $5, $6, $7, 'EUR', $5, 'won', $5)
       RETURNING id`,
      [
        workspaceId,
        accountId,
        mission.label,
        mission.daily_rate === null
          ? 'Prestation au forfait — le montant se facture aux jalons, pas au jour.'
          : 'Montant estimé sur vingt jours au tarif de la mission.',
        iso(mission.started_days_ago),
        mission.daily_rate === null ? null : mission.daily_rate * 20 * 100,
        mission.daily_rate === null ? null : mission.daily_rate * 20,
      ],
    )
    if (!row) throw new Error(`Demo seed: impossible de créer le projet de la mission « ${mission.label} »`)
    void ownerUserId
    return row.id
  }

  /**
   * Les rôles OUVERTS du client d'exemple — ce qui remplit le kanban des besoins.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI MANQUAIT
   * ─────────────────────────────────────────────────────────────────────────
   * La salle ne portait qu'UN besoin, dans un seul état : le kanban s'ouvrait
   * donc avec une colonne remplie sur dix, et le pied contextuel de chaque
   * colonne — celui qui dit ce qui bloque chez elle — ne pouvait pas se voir
   * changer. Et AUCUN positionnement ne portait de `need_id` : `shortlist_count`
   * valait donc zéro sur tous les besoins de la démonstration, si bien que la
   * colonne Shortlist annonçait « aucune » partout.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE SEED LIT COMME L'ÉCRAN
   * ─────────────────────────────────────────────────────────────────────────
   * `shortlist_count` n'est PAS un compte de la table `shortlists` — celle-là
   * est vide à dessein, composer une sélection est le geste que la démonstration
   * fait faire. C'est `(SELECT COUNT(*) FROM submissions sub WHERE sub.need_id =
   * need.id)` (`OpenNeedsService.list`). Ce sont donc des POSITIONNEMENTS
   * rattachés au rôle qu'on écrit ici, et rien d'autre ne ferait bouger le
   * chiffre.
   */
  /**
   * LA PROCHAINE ACTION D'UN PROJET DU PIPE — la parité démo de #1325 (4/9).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE VRAIE TÂCHE, ET PAS UN CHAMP
   * ─────────────────────────────────────────────────────────────────────────
   * La carte du pipe ne lit pas une colonne d'`opportunities` : elle lit la
   * tâche encore ouverte la plus proche (`tasks.project_id`, prédicat
   * `taskStillOpenSql`), exactement comme l'entête de colonne compte celles qui
   * n'en ont aucune. Semer autre chose remplirait le jeu de données sans rien
   * changer à l'écran — « un seed doit avoir la forme que l'écran lit », le
   * défaut que ce fichier a déjà payé deux fois.
   *
   * ⚠️ `undefined` = ce projet n'a DÉLIBÉRÉMENT aucune action programmée, et on
   * n'en invente pas une. C'est ce qui fait exister, en démonstration, la carte
   * « Sans prochaine action » avec un chiffre non nul et la ligne « Aucune
   * prochaine action » sur une carte — deux états que le produit rend.
   *
   * ⚠️ `due_on` est une colonne `date` : elle prend `dateOnly`, jamais un
   * horodatage. Un `iso()` y passerait le typage et ferait dépendre l'échéance
   * de l'heure de la visite.
   */
  private async seedProjectNextAction(
    workspaceId: string,
    ownerUserId: string,
    projectId: string,
    nextAction: { title: string; dueInDays: number } | undefined,
    dateOnly: (offsetDays: number) => string,
  ): Promise<void> {
    if (!nextAction) return
    await this.accounts.manager.query(
      `INSERT INTO tasks (workspace_id, owner_id, created_by, title, status, priority, due_on, project_id)
       VALUES ($1, $2, $2, $3, 'todo', 'normal', $4::date, $5)`,
      [workspaceId, ownerUserId, nextAction.title, dateOnly(-nextAction.dueInDays), projectId],
    )
  }

  /**
   * #2567.K6 (18/09/2026) — LA FILE « CE QUI ATTEND TA DÉCISION », EN DÉMO.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CES TROIS LIGNES, ET AUCUNE AUTRE
   * ─────────────────────────────────────────────────────────────────────────
   * `interventions` se remplit normalement toute seule (`InterventionsSweeper`,
   * balayage quotidien), et le balayeur EXCLUT explicitement les espaces de
   * démonstration — sans ce semis, l'écran d'arrivée montrerait « Rien n'attend
   * de décision », honnête mais vide, sur un jeu de données qui contient
   * pourtant deux natures détectables.
   *
   * Ce qui suit N'EST PAS inventé : c'est exactement ce que le balayeur
   * poserait lui-même s'il n'excluait pas cette salle, seuils et phrases de
   * détail identiques à `intervention-rules.ts` (`detectRenewalsAtRisk`,
   * `detectMissionsWithoutEndDate`) — voir `DEMO_INTENTIONALLY_EMPTY` /
   * `DEMO_SEEDED_TABLES` (`demo-coverage.ts`) pour l'historique de cette
   * décision.
   *
   *  - `renewal_at_risk` sur « Industrialisation d’un cas d’usage de recherche — mise en
   *    production » (`ends_in_days: 28`, sous les 30 j du seuil).
   *  - `mission_without_end_date` × 2, sur « Cadrage données transport — lot 2 »
   *    (52 jours) et « Socle conteneurisé des applications terrain — run »
   *    (138 jours) — toutes deux au-dessus du seuil de 30 j, en régie, sans
   *    `ends_on` À DESSEIN (voir leurs commentaires dans `demo-dataset.ts` :
   *    marge non mesurable pour l'une, disponibilité inconnue pour l'autre).
   *
   * `timesheet_missing` et `payment_overdue` restent muets PAR CONSTRUCTION
   * (relances à zéro, factures toutes payées) : y seeder une ligne
   * contredirait les données que ce même fichier écrit ailleurs. Les huit
   * autres natures ne sont pas auditées ici — aucune ligne n'y est fabriquée.
   *
   * `ON CONFLICT DO NOTHING` : même idempotence que
   * `PlaybooksService.open` (index unique `workspace_id, kind, subject_id`).
   */
  private async seedInterventions(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const day = 86_400_000
    const rows: { kind: string; missionLabel: string; detail: string; openedDaysAgo?: number }[] = [
      {
        kind: 'renewal_at_risk',
        missionLabel: 'Industrialisation d’un cas d’usage de recherche — mise en production',
        detail:
          'Industrialisation d’un cas d’usage de recherche — mise en production : fin prévue dans 28 jours, aucun renouvellement ouvert.',
      },
      {
        kind: 'mission_without_end_date',
        missionLabel: 'Cadrage données transport — lot 2',
        detail:
          'Cadrage données transport — lot 2 : en cours depuis 52 jours sans date de fin — aucune alerte de renouvellement ne peut partir, et la mission est exclue du chiffre d’affaires restant.',
      },
      // #2402.13 (24/09/2026, recette f9f23f887) — SANS `opened_at`, la colonne
      // retombe sur son défaut SQL `now()` (migration `1789419374625`) : les
      // TROIS lignes de ce tableau s'ouvraient il y a « 15 minutes », l'âge du
      // semis lui-même, et `isInterventionStale`
      // (`@bellum/contracts/schemas/playbook.ts`, seuil `INTERVENTION_STALE_DAYS`
      // = 60 j) ne pouvait JAMAIS montrer « Périmé » en démonstration — capacité
      // livrée, testée (`playbook.interventions.test.ts`), jamais visible sur le
      // lien public. `openedDaysAgo: 70` sur cette seule ligne, RELATIF au
      // semis : la mission tourne depuis 138 jours, une alerte ouverte depuis
      // 70 est une histoire cohérente, pas une date au hasard.
      {
        kind: 'mission_without_end_date',
        missionLabel: 'Socle conteneurisé des applications terrain — run',
        detail:
          'Socle conteneurisé des applications terrain — run : en cours depuis 138 jours sans date de fin — aucune alerte de renouvellement ne peut partir, et la mission est exclue du chiffre d’affaires restant.',
        openedDaysAgo: 70,
      },
    ]
    for (const row of rows) {
      const missionId = missionIds.get(row.missionLabel)
      if (!missionId) continue
      const openedAt = new Date(now - (row.openedDaysAgo ?? 0) * day)
      await this.accounts.manager.query(
        `INSERT INTO interventions (workspace_id, kind, subject_type, subject_id, owner_id, detail, state, opened_at)
         VALUES ($1, $2, 'mission', $3, $4, $5, 'open', $6::timestamptz)
         ON CONFLICT DO NOTHING`,
        [workspaceId, row.kind, missionId, ownerUserId, row.detail, openedAt.toISOString()],
      )
    }

    await this.seedRetentionDomainsSource(workspaceId, missionIds, now)
    await this.seedRetentionDomainsDerived(workspaceId, now)
    await this.seedInvoiceAttachments(workspaceId, missionIds, now)
    await this.seedStaffingCollisionIntervention(workspaceId)
  }

  /**
   * #2814 — LA PIÈCE JOINTE d'une facture préparée.
   *
   * Un bon de commande signé, avec de vrais octets, sur le mois COURANT de
   * « Fiabilisation plateforme » — l'une des deux missions réellement prêtes
   * de la salle, donc celle dont la prévisualisation de facture s'ouvre. La
   * seconde mission prête n'en porte aucune, à dessein : la phrase d'absence
   * se montre aussi. La facture reste PRÉPARÉE : rien n'est émis ni envoyé.
   *
   * Même règle que les autres fichiers de la salle : un dépôt qui échoue ne
   * produit AUCUNE ligne (`seedStoredFile` rend `null`) — jamais une pièce
   * listée sans octets derrière.
   */
  private async seedInvoiceAttachments(
    workspaceId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const missionLabel = 'Fiabilisation plateforme — renfort exploitation'
    const missionId = missionIds.get(missionLabel)
    if (!missionId) return
    const periodMonth = `${localMonthKey(new Date(now))}-01`
    const fileName = 'Bon-de-commande-signe.pdf'
    const storageObjectId = await this.seedStoredFile({
      workspaceId,
      domain: 'invoice_attachment',
      fileKey: `invoice/${missionLabel}/${periodMonth}/${fileName}`,
      fileName,
      title: 'Bon de commande de demonstration',
      lines: [
        `Mission : ${missionLabel}`,
        `Mois : ${periodMonth.slice(0, 7)}`,
        '',
        'Document FICTIF, produit pour la salle de demonstration Bellum.',
      ],
      depositedOn: new Date(now).toISOString().slice(0, 10),
    })
    if (!storageObjectId) return
    await this.accounts.manager.query(
      `INSERT INTO invoice_attachments (workspace_id, mission_id, period_month, storage_object_id, file_name)
       VALUES ($1, $2, $3::date, $4, $5)`,
      [workspaceId, missionId, periodMonth, storageObjectId, fileName],
    )
  }

  /**
   * #2206.12 — LA SIXIÈME NATURE, « COLLISION ÉQUIPE », EN DÉMO.
   *
   * `detectStaffingCollisionInterventions` (`intervention-rules.ts`) est PURE
   * et déjà testée ; le balayeur nocturne l'appelle en production mais
   * EXCLUT les espaces de démonstration, même règle que les trois lignes
   * historiques de #2567.K6 juste au-dessus. Sans ce semis, la nature
   * n'aurait aucune ligne à montrer sur le lien public alors que le jeu de
   * données porte réellement la collision : Antoine Rivière, shortlisté sur
   * DEUX besoins ouverts distincts (`demo-dataset.ts`, voir le commentaire
   * #2206.12 sur le second). La ligne se pose sur le premier des deux
   * positionnements trouvés — même convention que `detectStaffingCollisionInterventions`.
   */
  private async seedStaffingCollisionIntervention(workspaceId: string): Promise<void> {
    const submissions = await this.accounts.manager.query<{ id: string; need_title: string }[]>(
      `SELECT s.id, n.title AS need_title
         FROM submissions s
         JOIN consultants c ON c.id = s.consultant_id
         JOIN project_needs n ON n.id = s.need_id
        WHERE s.workspace_id = $1 AND c.full_name = $2
        ORDER BY n.title`,
      [workspaceId, 'Antoine Rivière'],
    )
    if (submissions.length < 2) return

    await this.accounts.manager.query(
      `INSERT INTO interventions (workspace_id, kind, subject_type, subject_id, owner_id, detail, state)
       VALUES ($1, 'staffing_collision', 'submission', $2, NULL, $3, 'open')
       ON CONFLICT DO NOTHING`,
      [
        workspaceId,
        submissions[0].id,
        'Antoine Rivière est positionné sur 2 besoins concurrents à la fois (2 positionnements ouverts) — personne n’a encore tranché lequel prioriser.',
      ],
    )
  }

  /**
   * #2567.3 (18/09/2026) — LA SOURCE DE TROIS DES CINQ DOMAINES RESTANTS : CRA,
   * FACTURATION, BONS DE COMMANDE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE MISSION, ET POURQUOI DEUX LIGNES DESSUS
   * ─────────────────────────────────────────────────────────────────────────
   * « Cadrage données transport — lot 2 » (Inès Kaczmarek) porte déjà, dans
   * `demo-dataset.ts`, exactement les caractéristiques que
   * `assessInvoiceReadiness` (`@bellum/contracts`) lit pour bloquer un mois :
   * `timesheet: null` (aucun relevé), `loaded_daily_cost_cents: null` (coût
   * chargé inconnu), `requires_po: true` avec `po_number: null` (le bon de
   * commande EXIGÉ et ABSENT — « le seul endroit du jeu où le bloqueur
   * `missing_po` se déclenche », déjà documenté sur la mission elle-même), et
   * `billing_contact: null`. Ces quatre faits ne sont PAS reseedés ici : ils
   * sont DÉJÀ dans le jeu de données. Ce qui manquait pour qu'une file
   * d'intervention les VOIE est la PERSISTANCE — le balayeur nocturne
   * (`InterventionsSweeper`) exclut cette salle, et sans lui rien n'écrit
   * jamais la ligne que ces deux INSERT posent à la main, avec les MÊMES
   * seuils que `INTERVENTION_THRESHOLDS`.
   *
   * Un seul mois, le premier de la mission (`started_days_ago: 52` dans le
   * jeu de données — `monthStart(52)` calcule le 1er du mois qui le contient,
   * donc AU MOINS cinquante-deux jours avant `now`, largement au-dessus des
   * quarante d'`invoicingBlockedDays`) : deux faits DIFFÉRENTS sur le MÊME
   * mois — le relevé jamais arrivé (CRA) ET la facture qui en dépend restée
   * bloquée (facturation, bon de commande compris) — plutôt qu'une seconde
   * mission inventée pour chaque domaine.
   *
   * ⚠️ `reminders_sent: INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert`
   * (deux), jamais un nombre en dur : le semis touche PILE le seuil, la borne
   * la plus honnête pour prouver que c'est bien LUI qui décide.
   */
  private async seedRetentionDomainsSource(
    workspaceId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    const missionId = missionIds.get('Cadrage données transport — lot 2')
    if (!missionId) return

    const day = 86_400_000
    const monthStart = (daysAgo: number): string => `${localMonthKey(new Date(now - daysAgo * day))}-01`
    const period = monthStart(52)
    const lastReminderAt = new Date(now - 5 * day).toISOString()

    const [consultant] = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = $2`,
      [workspaceId, 'Inès Kaczmarek'],
    )

    // LE RELEVÉ — jamais déposé, deux relances envoyées : la donnée SOURCE du
    // domaine CRA (`timesheet_missing`).
    await this.accounts.manager.query(
      `INSERT INTO mission_timesheets
         (mission_id, consultant_id, period_month, days, status, expected_days, reminders_sent, last_reminder_at)
       VALUES ($1, $2::uuid, $3::date, 0, 'missing', 20, $4, $5::timestamptz)
       ON CONFLICT DO NOTHING`,
      [
        missionId,
        consultant?.id ?? null,
        period,
        INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert,
        lastReminderAt,
      ],
    )

    // LA FACTURE DU MÊME MOIS — bloquée pour les quatre raisons que la mission
    // porte déjà (voir le docblock ci-dessus). Le domaine BONS DE COMMANDE se
    // lit dans CE bloqueur, `missing_po`, cité tel quel par
    // `detectBlockedInvoicing` dans le détail de l'intervention.
    await this.accounts.manager.query(
      `INSERT INTO invoice_readiness
         (workspace_id, mission_id, period_month, state, blockers, reminders_sent, last_reminder_at)
       VALUES ($1, $2, $3::date, 'blocked', $4::jsonb, 1, $5::timestamptz)
       ON CONFLICT (mission_id, period_month) DO NOTHING`,
      [
        workspaceId,
        missionId,
        period,
        JSON.stringify(['missing_timesheet', 'missing_cost', 'missing_po', 'missing_billing_contact']),
        lastReminderAt,
      ],
    )
  }

  /**
   * #2567.3 — LA DÉRIVATION RÉELLE, EXÉCUTÉE SUR CE QUI VIENT D'ÊTRE SEMÉ.
   *
   * Les quatre requêtes ci-dessous sont EXACTEMENT celles
   * d'`InterventionsSweeper` (`playbooks/interventions.sweeper.ts` —
   * `stalledSubmissions`, `missingTimesheets`, `blockedInvoicing`,
   * `needsWithoutShortlist`), colonne pour colonne, MOINS la jointure
   * `w.is_demo = false` qui exclut cette salle du balayage réel : c'est tout
   * le sujet du lot. Le RÉSULTAT part dans les mêmes fonctions PURES
   * (`detectStalledSubmissions`, `detectMissingTimesheets`,
   * `detectBlockedInvoicing`, `detectNeedsWithoutShortlist`) — jamais un
   * `detail` retapé à la main. Sans `seedRetentionDomainsSource` ci-dessus et
   * sans le troisième profil positionné du besoin « Ingénieur infrastructure
   * — socle conteneurisé du portail » (`demo-dataset.ts`, Marc Ouedraogo) et
   * sans le besoin « Ingénieur systèmes — supervision des systèmes temps réel »
   * déjà sans profil (`shortlist: []`, `status_changed_days_ago: 19`), ces
   * quatre requêtes rendraient zéro ligne — c'est le rouge que
   * `demo-retention-domains-coverage.spec.ts` prouve en retirant le semis.
   */
  private async seedRetentionDomainsDerived(workspaceId: string, now: number): Promise<void> {
    const nowDate = new Date(now)

    const stalledRows = await this.accounts.manager.query<StalledSubmissionRow[]>(
      `SELECT s.id, s.submitted_at, s.first_feedback_at, s.closed_at, s.owner_id,
              c.full_name AS consultant_name, a.company_name AS account_name
         FROM submissions s
         LEFT JOIN consultants c ON c.id = s.consultant_id
         LEFT JOIN opportunities p ON p.id = s.project_id
         LEFT JOIN accounts a ON a.id = p.account_id
        WHERE s.workspace_id = $1
          AND s.first_feedback_at IS NULL
          AND s.closed_at IS NULL
          AND s.submitted_at IS NOT NULL
          AND s.submitted_at < now() - ($2 || ' days')::interval`,
      [workspaceId, INTERVENTION_THRESHOLDS.submissionSilenceDays],
    )
    for (const draft of detectStalledSubmissions(stalledRows, nowDate)) {
      await this.insertIntervention(workspaceId, draft)
    }

    const timesheetRows = await this.accounts.manager.query<MissingTimesheetRow[]>(
      `SELECT ts.id, ts.period_month, ts.reminders_sent, m.label AS mission_label, m.user_id AS owner_id
         FROM mission_timesheets ts
         JOIN missions m ON m.id = ts.mission_id
        WHERE m.workspace_id = $1
          AND ts.status = ANY($2)
          AND ts.reminders_sent >= $3`,
      [workspaceId, [...AWAITING_TIMESHEET_STATUSES], INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert],
    )
    for (const draft of detectMissingTimesheets(timesheetRows)) {
      await this.insertIntervention(workspaceId, draft)
    }

    const invoicingRows = await this.accounts.manager.query<InvoicingRow[]>(
      `SELECT r.id, r.period_month, r.state, r.invoiced_at, r.blockers,
              m.label AS mission_label, m.user_id AS owner_id
         FROM invoice_readiness r
         LEFT JOIN missions m ON m.id = r.mission_id
        WHERE r.workspace_id = $1
          AND r.state = 'blocked'
          AND r.invoiced_at IS NULL
          AND r.period_month < (now() - ($2 || ' days')::interval)::date`,
      [workspaceId, INTERVENTION_THRESHOLDS.invoicingBlockedDays],
    )
    for (const draft of detectBlockedInvoicing(invoicingRows, nowDate)) {
      await this.insertIntervention(workspaceId, draft)
    }

    const needRows = await this.accounts.manager.query<NeedWithoutShortlistRow[]>(
      `SELECT n.id, n.title, n.status_changed_at, n.owner_id
         FROM project_needs n
        WHERE n.workspace_id = $1
          AND n.status = ANY($2)
          AND n.staffable <> 'no'
          AND n.status_changed_at IS NOT NULL
          AND n.status_changed_at < now() - ($3 || ' days')::interval
          AND NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = n.id)`,
      [workspaceId, [...NEED_OPEN_STATUSES], INTERVENTION_THRESHOLDS.needWithoutShortlistDays],
    )
    for (const draft of detectNeedsWithoutShortlist(needRows, nowDate)) {
      await this.insertIntervention(workspaceId, draft)
    }
  }

  /** Une ligne de la file, produite par une des fonctions PURES de
   *  `intervention-rules.ts` — jamais un `detail` tapé à la main. */
  private async insertIntervention(
    workspaceId: string,
    draft: { kind: string; subjectType: string; subjectId: string; ownerId: string | null; detail: string },
  ): Promise<void> {
    await this.accounts.manager.query(
      `INSERT INTO interventions (workspace_id, kind, subject_type, subject_id, owner_id, detail, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       ON CONFLICT DO NOTHING`,
      [workspaceId, draft.kind, draft.subjectType, draft.subjectId, draft.ownerId, draft.detail],
    )
  }

  /**
   * #4349 V.2 — LES BESOINS REFUSÉS FAUTE DE PROFIL, semés (craft rule n°9). Voir {@link DEMO_MISSING_EXPERTISE}.
   * `staffable = 'no'` + `staffable_decided_at` : ce que `MissingExpertiseService` relit. Idempotent par titre.
   */
  private async seedMissingExpertise(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    for (const need of DEMO_MISSING_EXPERTISE.needs) {
      await this.accounts.manager.query(
        `-- #4349 V.2 — refus faute de profil (détecteur d'expertise manquante), pas des rôles du kanban
         INSERT INTO project_needs
           (workspace_id, project_id, account_id, title, skills, headcount, target_tjm_cents, duration_months,
            contract_kind, status, status_changed_at, source, provenance, owner_id, staffable, staffable_decided_at)
         SELECT $1::uuid, NULL, $2::uuid, $3::text, $4::jsonb, 1, $5::bigint, $6::integer,
                'regie', 'cancelled', $7::timestamptz, 'manual', 'pipeline', $8::uuid, 'no', $7::timestamptz
          WHERE NOT EXISTS (
            SELECT 1 FROM project_needs WHERE account_id = $2 AND project_id IS NULL AND title = $3
          )`,
        [
          workspaceId,
          accountId,
          need.title,
          // `{ term }` : la forme que le détecteur (`rawTerms`) et le filtre par compétence lisent.
          JSON.stringify([{ term: DEMO_MISSING_EXPERTISE.skill }]),
          need.target_tjm_cents,
          need.duration_months,
          iso(need.refused_days_ago),
          ownerUserId,
        ],
      )
    }
  }

  /**
   * #3681 — UNE ANNONCE DE RECRUTEMENT INTERNE, semée (craft rule n°9). Voir
   * {@link DEMO_DELIVERY_CLIENT.internalHireNeed} : `contract_kind: 'recrutement'`
   * est le témoin, l'écran la nomme sans la compter comme demande ouverte.
   * `project_id` NULL littéral, comme {@link seedNeedWithoutProject}.
   */
  private async seedInternalHireNeed(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    const need = DEMO_DELIVERY_CLIENT.internalHireNeed
    await this.accounts.manager.query(
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, headcount, location, contract_kind, status,
          status_changed_at, source, provenance, owner_id, context)
       SELECT $1::uuid, NULL, $2::uuid, $3::text, '[]'::jsonb, 1, $4::text, 'recrutement', 'open',
              $5::timestamptz, 'job_posting', 'pipeline', $6::uuid, $7::text
        WHERE NOT EXISTS (
          SELECT 1 FROM project_needs WHERE account_id = $2 AND project_id IS NULL AND title = $3
        )`,
      [workspaceId, accountId, need.title, need.location, iso(need.status_changed_days_ago), ownerUserId, need.context],
    )
  }

  /**
   * #2558.1 — LE BESOIN SANS PROJET, semé (craft rule n°9).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE SEMIS EXISTE
   * ─────────────────────────────────────────────────────────────────────────
   * `project_needs.project_id` est NULLABLE depuis la migration
   * `1795711263408-NeedWithoutProject` (vague J, 18/09/2026), la lecture
   * (`OpenNeedsService.list`) fait un `LEFT JOIN` sur le projet, et
   * `POST /projects/needs` accepte un besoin sans identifiant de projet dans
   * l'URL. Trois preuves déjà vraies en production — et AUCUN semis
   * n'écrivait jamais `project_id: NULL` : `seedOpenNeeds` juste en dessous
   * rattache chaque rôle à `project.id`, sans exception. La capacité existait
   * et ne se voyait pas — exactement le motif que ce dépôt répète : du code
   * juste, calculé, testé, que personne n'appelle.
   *
   * ⚠️ `project_id` est écrit en `NULL` LITTÉRAL dans le SQL, jamais un
   * paramètre lié à une valeur qui pourrait devenir non nulle par erreur — un
   * besoin sans projet n'est pas une valeur oubliée, c'est une valeur PLEINE
   * (même doctrine que le commentaire de `saveNeed` dans
   * `project-pipeline.service.ts`).
   *
   * ⚠️ `WHERE NOT EXISTS` : la salle se remet à neuf en rejouant ce semis, et
   * un second passage ne doit pas poser une seconde ligne — même garde que
   * `seedStaffedNeed` un peu plus bas dans ce fichier.
   */
  private async seedNeedWithoutProject(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    const need = DEMO_DELIVERY_CLIENT.needWithoutProject
    await this.accounts.manager.query(
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, seniority, headcount, target_tjm_cents, location,
          contract_kind, status, status_reason, status_changed_at, urgency, source, provenance, owner_id,
          languages, clearances, context, expertise, stack, constraints, min_tjm_cents, budget_cents)
       SELECT $1::uuid, NULL, $2::uuid, $3::text, $4::jsonb, $5::text, $6::integer, $7::bigint, $8::text,
              $9::text, $10::text, $11::text, $12::timestamptz, $13::text, $14::text, $15::text, $16::uuid,
              $17::jsonb, $18::text[], $19::text, $20::text, $21::jsonb, $22::text, $23::bigint, $24::bigint
        WHERE NOT EXISTS (
          SELECT 1 FROM project_needs WHERE account_id = $2 AND project_id IS NULL AND title = $3
        )`,
      [
        workspaceId,
        accountId,
        need.title,
        JSON.stringify(need.skills),
        need.seniority,
        need.headcount,
        need.target_tjm_cents,
        need.location,
        need.contract_kind,
        need.status,
        need.status_reason,
        iso(need.status_changed_days_ago),
        need.urgency,
        need.source,
        need.provenance,
        ownerUserId,
        JSON.stringify(need.languages),
        need.clearances,
        need.context,
        need.expertise,
        JSON.stringify(need.stack),
        need.constraints,
        need.min_tjm_cents,
        need.budget_cents,
      ],
    )
  }

  /**
   * #4270.5 — les deux besoins du PROFIL FORFAIT (`DEMO_FORFAIT_PROFILE_NEEDS`, voir son docblock). `project_id`
   * NULL littéral, `WHERE NOT EXISTS` : la salle se rejoue sans doublon. Le besoin gagné est rattaché à la
   * mission en forfait encadré déjà semée (`missions.need_id`) : la fiche lit « 1 projet suivi », jamais « 0 ».
   */
  private async seedForfaitProfileNeeds(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    for (const need of Object.values(DEMO_FORFAIT_PROFILE_NEEDS)) {
      await this.accounts.manager.query(
        `-- #4270.5 — besoin du profil forfait (garde : demo-forfait-profile-needs.spec.ts)
         INSERT INTO project_needs
           (workspace_id, project_id, account_id, title, skills, seniority, headcount, location, contract_kind,
            status, status_changed_at, urgency, source, provenance, owner_id, context, budget_cents,
            delivery_mode, supervision_role, client_team_names, decision_maker_contact_id)
         SELECT $1::uuid, NULL, $2::uuid, $3::text, '[]'::jsonb, 'senior', 1, 'Paris', 'forfait',
                $4::text, $5::timestamptz, 'normale', 'meeting_notes', 'human', $6::uuid, $7::text, $8::bigint,
                'supervised', $9::text, $10::text[],
                -- SEMIS-PREUVES 4291.7 — le sponsor : une PERSONNE du compte (NULL si absente, jamais devinée)
                (SELECT c.id FROM contacts c WHERE c.workspace_id = $1::uuid AND c.account_id = $2::uuid AND c.full_name = $11::text LIMIT 1)
          WHERE NOT EXISTS (
            SELECT 1 FROM project_needs WHERE account_id = $2 AND project_id IS NULL AND title = $3
          )`,
        [
          workspaceId,
          accountId,
          need.title,
          need.status,
          iso(need.status_changed_days_ago),
          ownerUserId,
          need.context,
          need.budget_cents,
          need.supervision_role,
          need.client_team_names,
          need.sponsor_contact_name,
        ],
      )
    }
    await this.accounts.manager.query(
      `UPDATE missions
          SET need_id = (SELECT id FROM project_needs WHERE workspace_id = $1 AND title = $2 LIMIT 1)
        WHERE workspace_id = $1 AND label = $3 AND need_id IS NULL`,
      [workspaceId, DEMO_FORFAIT_PROFILE_NEEDS.won.title, DEMO_SUPERVISED_FORFAIT_MISSION.label],
    )
  }

  /**
   * #2178 — LE BESOIN SANS PROFIL DÉFENDABLE, semé (craft rule n°9).
   *
   * Le contenu vit dans {@link DEMO_NO_DEFENDABLE_PROFILE_NEED} — voir son
   * docblock dans `demo-dataset.ts` pour la preuve que le zéro est GARANTI,
   * pas fabriqué : ce semis n'écrit qu'un `project_needs` ordinaire, et c'est
   * `MatchingService.execute` (le moteur réel à treize axes) qui produit
   * `recommended: []` / `borderline: []` en le faisant tourner contre le
   * vivier, quand la salle ouvre ce besoin.
   *
   * MÊME forme que {@link seedNeedWithoutProject} juste au-dessus
   * (`project_id` NULL LITTÉRAL, jamais un paramètre qui pourrait devenir non
   * nul par erreur) : ce besoin n'a pas de dossier, et il n'en fabrique pas un
   * pour exister. `WHERE NOT EXISTS` — la salle se remet à neuf en rejouant ce
   * semis, un second passage ne doit pas poser une seconde ligne.
   */
  private async seedNoDefendableProfileNeed(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    const need = DEMO_NO_DEFENDABLE_PROFILE_NEED
    await this.accounts.manager.query(
      // ⚠️ MÊME discipline de CAST que `seedStaffedNeed`/`seedNeedWithoutProject` :
      // dans un `INSERT … SELECT`, un paramètre sans autre occurrence typée
      // retombe sur `text`, et c'est ce qui a déjà mis `POST /demo/session`
      // en 500 pour toute la salle.
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, seniority, headcount, target_tjm_cents, location,
          contract_kind, status, status_reason, status_changed_at, urgency, source, provenance, owner_id, context,
          remote, languages, stack)
       SELECT $1::uuid, NULL, $2::uuid, $3::text, $4::jsonb, $5::text, $6::integer, $7::bigint, $8::text,
              $9::text, $10::text, $11::text, $12::timestamptz, $13::text, $14::text, $15::text, $16::uuid, $17::text,
              $18::text, $19::jsonb, $20::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM project_needs WHERE account_id = $2 AND project_id IS NULL AND title = $3
        )`,
      [
        workspaceId,
        accountId,
        need.title,
        JSON.stringify(need.skills),
        need.seniority,
        need.headcount,
        need.target_tjm_cents,
        need.location,
        need.contract_kind,
        need.status,
        null,
        iso(need.status_changed_days_ago),
        need.urgency,
        need.source,
        need.provenance,
        ownerUserId,
        need.context,
        need.remote,
        JSON.stringify(need.languages),
        JSON.stringify(need.stack),
      ],
    )
  }

  /**
   * #2967 (lot V39) — le journal `commercial_transitions` d'UN besoin semé :
   * naissance puis état courant. Rien n'est écrit pour un besoin resté
   * `to_qualify` au-delà de sa naissance — une absence ne fait aucune ligne.
   */
  private async seedNeedStatusJournal(
    workspaceId: string,
    actorId: string,
    needId: string,
    input: { status: string; reason: string | null; changedAt: string; bornAt: string; source: 'human' | 'laura' },
  ): Promise<void> {
    const insert = (from: string | null, to: string, proof: string | null, source: string, at: string) =>
      this.accounts.manager.query(
        `INSERT INTO commercial_transitions
           (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, proof, source, occurred_at)
         VALUES ($1, 'need', $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
        [workspaceId, needId, from, to, actorId, proof, source, at],
      )
    await insert(null, 'to_qualify', null, 'human', input.bornAt)
    if (input.status !== 'to_qualify') {
      await insert('to_qualify', input.status, input.reason, input.source, input.changedAt)
    }
  }

  /**
   * #4016 L1 (décision Louis 11/10/2026) — la calibration de la probabilité en
   * salle : sept affaires closes (gagnées ET perdues) dont le parcours est écrit
   * au journal `commercial_transitions` — c'est lui que relit
   * `DealProbabilityService` pour savoir quel stade une perdue avait atteint —,
   * puis une affaire ouverte en négociation dans les trois mois à venir.
   * Contenu : {@link DEMO_PROBABILITY_CALIBRATION}.
   */
  private async seedProbabilityCalibration(
    workspaceId: string,
    accountId: string,
    actorId: string,
    iso: (offsetDays: number) => string,
    dateOnly: (offsetDays: number) => string,
  ): Promise<void> {
    const calibration = DEMO_PROBABILITY_CALIBRATION
    const transition = (subjectId: string, from: string | null, to: string, at: string) =>
      this.accounts.manager.query(
        `INSERT INTO commercial_transitions
           (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, proof, source, occurred_at)
         VALUES ($1, 'opportunity', $2, $3, $4, $5, NULL, 'human', $6::timestamptz)`,
        [workspaceId, subjectId, from, to, actorId, at],
      )
    for (const deal of calibration.closedDeals) {
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, stage, stage_entered_at, closed_at, outcome,
            amount_cents, estimated_amount, currency, first_detected_at)
         VALUES ($1, $2, 'besoin', $3, $4, $5, $5, $4, $6::bigint, $7::numeric, 'EUR', $8)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          deal.label,
          deal.outcome,
          iso(deal.closed_days_ago),
          // Aucun motif de perte : le catalogue de l'espace n'est pas inventé ici
          // (NULL = personne ne l'a dit).
          deal.amount_cents,
          deal.amount_cents / 100,
          iso(deal.closed_days_ago + 60),
        ],
      )
      if (!row) continue
      // Le parcours, un pas tous les dix jours avant l'issue, puis l'issue.
      const path = OPEN_PIPELINE_STAGES.slice(0, OPEN_PIPELINE_STAGES.indexOf(deal.reached) + 1)
      let previous: string | null = null
      for (const [index, stage] of path.entries()) {
        await transition(row.id, previous, stage, iso(deal.closed_days_ago + (path.length - index) * 10))
        previous = stage
      }
      await transition(row.id, previous, deal.outcome, iso(deal.closed_days_ago))
    }
    const open = calibration.openDeal
    const [openRow] = await this.accounts.manager.query<{ id: string }[]>(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at,
          amount_cents, estimated_amount, currency, first_detected_at, expected_close_on)
       VALUES ($1, $2, 'besoin', $3, $4, $5, $6, $7::bigint, $8::numeric, 'EUR', $9, $10::date)
       RETURNING id`,
      [
        workspaceId,
        accountId,
        open.label,
        open.detail,
        open.stage,
        iso(open.stage_entered_days_ago),
        open.amount_cents,
        open.amount_cents / 100,
        iso(open.stage_entered_days_ago + 30),
        dateOnly(-open.expected_close_in_days),
      ],
    )
    if (openRow) await transition(openRow.id, null, open.stage, iso(open.stage_entered_days_ago))
  }

  /**
   * Refonte Pilotage L1 (craft rule 9) — « CE QUI A BOUGÉ » du Cockpit : les
   * affaires de {@link DEMO_PILOTAGE_WEEK_MOVES}, chacune avec son parcours écrit
   * au journal `commercial_transitions` (sujet `opportunity`), dates relatives à
   * la visite. Les comptes sont ceux des briefs de la salle : un compte absent
   * (jeu réduit) est ignoré avec un avertissement — jamais remplacé par un
   * compte inventé, et jamais une erreur qui ferait tomber `POST /demo/session`.
   */
  private async seedPilotageWeekMoves(
    workspaceId: string,
    actorId: string,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    const names = [...new Set(DEMO_PILOTAGE_WEEK_MOVES.map(move => move.account))]
    const accountRows = await this.accounts.manager.query<{ id: string; company_name: string }[]>(
      `SELECT id, company_name FROM accounts WHERE workspace_id = $1 AND company_name = ANY($2::text[])`,
      [workspaceId, names],
    )
    const accountIdByName = new Map(accountRows.map(row => [row.company_name, row.id]))
    for (const move of DEMO_PILOTAGE_WEEK_MOVES) {
      const accountId = accountIdByName.get(move.account)
      const last = move.path[move.path.length - 1]
      const first = move.path[0]
      if (!accountId || !last || !first) {
        this.logger.warn(`Affaire de la semaine sans compte de démonstration : ${move.account}`)
        continue
      }
      const closed = last.to === 'won' || last.to === 'lost'
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, stage, stage_entered_at, closed_at, outcome,
            amount_cents, estimated_amount, currency, first_detected_at)
         VALUES ($1, $2, 'manual', $3, $4, $5::timestamptz, $6::timestamptz, $7::text,
                 $8::bigint, $9::numeric, 'EUR', $10::timestamptz)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          move.label,
          last.to,
          iso(last.days_ago),
          closed ? iso(last.days_ago) : null,
          closed ? last.to : null,
          move.amount_cents,
          move.amount_cents === null ? null : move.amount_cents / 100,
          iso(first.days_ago),
        ],
      )
      if (!row) continue
      let previous: string | null = null
      for (const step of move.path) {
        await this.accounts.manager.query(
          `INSERT INTO commercial_transitions
             (workspace_id, subject_type, subject_id, from_state, to_state, actor_id, proof, source, occurred_at)
           VALUES ($1, 'opportunity', $2, $3, $4, $5, NULL, 'human', $6::timestamptz)`,
          [workspaceId, row.id, previous, step.to, actorId, iso(step.days_ago)],
        )
        previous = step.to
      }
    }
  }

  /**
   * Refonte Pilotage L1 — les règlements de la semaine (Cockpit › « encaissé »).
   * `ON CONFLICT DO NOTHING` : l'unicité `(mission, mois)` ne doit jamais faire
   * tomber la création de la salle, quelle que soit la date de la visite.
   */
  private async seedPilotageRecentPayments(
    workspaceId: string,
    ownerUserId: string,
    missionIds: Map<string, string>,
    now: number,
  ): Promise<void> {
    for (const payment of demoPilotageRecentPayments(now)) {
      const missionId = missionIds.get(payment.missionLabel)
      if (!missionId) {
        this.logger.warn(`Règlement de démonstration sans mission : ${payment.missionLabel}`)
        continue
      }
      await this.accounts.manager.query(
        // Le commentaire SQL est le marqueur que `demo-seed.service.spec.ts` lit pour ne pas
        // compter ces règlements dans « l'historique de facturation D42 » (jeu distinct).
        `/* pilotage-week-payments */
         INSERT INTO invoice_readiness
           (workspace_id, mission_id, period_month, state, invoice_reference, invoiced_amount_cents,
            invoiced_at, invoiced_by, due_on, paid_at, paid_amount_cents, reminders_sent)
         VALUES ($1, $2, $3::date, 'invoiced', $4, $5::bigint, $6::timestamptz, $7, $8::date,
                 $9::timestamptz, $5::bigint, 0)
         ON CONFLICT (mission_id, period_month) DO NOTHING`,
        [
          workspaceId,
          missionId,
          payment.periodMonth,
          payment.reference,
          payment.invoicedAmountCents,
          payment.invoicedAt,
          ownerUserId,
          payment.dueOn,
          payment.paidAt,
        ],
      )
    }
  }

  private async seedOpenNeeds(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    consultantIdsByName: Map<string, string>,
    iso: (offsetDays: number) => string,
    dateOnly: (offsetDays: number) => string,
    // #3624 — nom → id des contacts déjà semés (pas de lecture SQL brute de `contacts`, GA-405).
    contactIdsByName: Map<string, string>,
  ): Promise<void> {
    const client = DEMO_DELIVERY_CLIENT
    // Documents et étapes se rattachent par TITRE (`client.needDocuments`,
    // `client.needSteps`) — cette table se remplit PENDANT la boucle
    // d'insertion ci-dessous, et se relit APRÈS elle : ce qui LIT doit venir
    // après ce qui ÉCRIT.
    const needIdsByTitle = new Map<string, string>()
    // #2967 — la première vraie transition semée porte la source `laura`.
    let lauraJournalPending = true

    const [project] = await this.accounts.manager.query<{ id: string }[]>(
      // Même règle que l'affaire gagnée : la colonne de date part EN FIN de
      // liste, et en `date` nue (`dateOnly`), jamais en horodatage.
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at,
          amount_cents, estimated_amount, currency, first_detected_at,
          application_sector_codes, primary_domain_code, expected_close_on, objective, risks, scope_label)
       VALUES ($1, $2, 'besoin', $3, $4, $5, $6, $7, $8, 'EUR', $9, $10::text[], $11, $12::date, $13, $14, $15)
       RETURNING id`,
      [
        workspaceId,
        accountId,
        client.openProject.label,
        client.openProject.detail,
        client.openProject.stage,
        iso(21),
        client.openProject.amount_cents,
        client.openProject.amount_cents / 100,
        iso(38),
        client.openProject.application_sector_codes,
        client.openProject.primary_domain_code,
        dateOnly(-client.openProject.expected_close_in_days),
        // #2172.37 — l'objectif écrit à la conversion. EN FIN de liste, comme
        // toute colonne ajoutée dans ce fichier : insérée au milieu, elle
        // décalerait chaque `$n` et les gardes qui lisent ces paramètres PAR
        // RANG liraient la mauvaise valeur en restant vertes.
        client.openProject.objective,
        // #2324.37 — les risques de l'affaire, en fin de liste (même raison).
        client.openProject.risks,
        // #3266.1 (#3292) — le grain équipe/site/projet, en fin de liste (même raison).
        client.openProject.scope_label,
      ],
    )
    if (!project) return
    await this.seedProjectNextAction(workspaceId, ownerUserId, project.id, client.openProject.nextAction, dateOnly)

    // ─────────────────────────────────────────────────────────────────────────
    // LES DEUX AUTRES AFFAIRES OUVERTES DU PIPE
    // ─────────────────────────────────────────────────────────────────────────
    // Elles ne portent AUCUN rôle ouvert : les besoins du kanban restent
    // accrochés au projet ci-dessus, qui les porte tous. Elles servent le PIPE —
    // trois colonnes occupées au lieu d'une, des échéances étalées, et une
    // affaire dont personne n'a encore chiffré le périmètre.
    //
    // ⚠️ `amount_cents` vaut `null` quand le jeu ne le porte pas — jamais `0`.
    // `pipelineSummary` compte alors la ligne dans `without_amount` au lieu de
    // l'additionner, et l'écran écrit « au moins X € » plutôt que de faire
    // passer un total partiel pour un total. Un `0` ici annulerait la règle
    // « non mesuré n'est jamais zéro » à l'endroit exact où elle se voit.
    for (const deal of client.pipelineProjects) {
      const amountCents = deal.amount_cents ?? null
      // `RETURNING id` : l'insertion était muette, et la prochaine action a
      // besoin de savoir à QUEL projet elle se rattache. Une tâche sans
      // `project_id` remplit l'écran « Aujourd'hui » et laisse la carte du pipe
      // dire « aucune prochaine action » — deux écrans qui se contredisent sur
      // la même démonstration.
      const [dealRow] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at,
            amount_cents, estimated_amount, currency, first_detected_at,
            application_sector_codes, primary_domain_code, expected_close_on, owner_id)
         VALUES ($1, $2, 'besoin', $3, $4, $5, $6, $7::bigint, $8::numeric, 'EUR', $9, $10::text[], $11, $12::date, $13)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          deal.label,
          deal.detail,
          deal.stage,
          // #2107.2 — `stage_entered_days_ago` porte le jour explicite quand
          // une affaire doit franchir le seuil de fraîcheur de l'ontologie ;
          // 17 reste le défaut historique de ce jeu sinon.
          iso(deal.stage_entered_days_ago ?? 17),
          amountCents,
          amountCents === null ? null : amountCents / 100,
          iso(31),
          deal.application_sector_codes,
          deal.primary_domain_code,
          dateOnly(-deal.expected_close_in_days),
          // #4191.9 — le porteur de la salle : « Par commercial » ne montre plus que « Non attribué ».
          ownerUserId,
        ],
      )
      if (dealRow) {
        await this.seedProjectNextAction(workspaceId, ownerUserId, dealRow.id, deal.nextAction, dateOnly)
      }
    }

    // #4137 — le dossier ARCHIVÉ de la salle (onglet « Archivés » du pipe).
    await this.accounts.manager.query(
      `INSERT INTO opportunities
         (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, closed_at, outcome,
          first_detected_at, archived_at)
       VALUES ($1, $2, 'besoin', $3, $4, 'dormant', $5, $5, 'abandoned', $6, $7)`,
      [
        workspaceId,
        accountId,
        client.archivedProject.label,
        client.archivedProject.detail,
        iso(client.archivedProject.archived_days_ago + 5),
        iso(client.archivedProject.detected_days_ago),
        iso(client.archivedProject.archived_days_ago),
      ],
    )

    // #4016 L1 — les affaires closes qui CALIBRENT la probabilité, et l'affaire
    // ouverte des trois mois à venir qui la montre (craft rule 9).
    await this.seedProbabilityCalibration(workspaceId, accountId, ownerUserId, iso, dateOnly)
    // Refonte Pilotage L1 — « ce qui a bougé » du Cockpit, sur les comptes à brief de la salle.
    await this.seedPilotageWeekMoves(workspaceId, ownerUserId, iso)

    // ─────────────────────────────────────────────────────────────────────────
    // #1889 — LES SIGNAUX DÉTECTÉS
    // ─────────────────────────────────────────────────────────────────────────
    // `kind: 'signal'` ET `stage: 'detected'` : la forme EXACTE que le produit
    // écrit, et la seule qui fasse exister en démonstration les deux états que
    // l'onglet Projets d'un dossier sépare — « n projets » d'un côté, « n
    // signaux, comptés à part » de l'autre. Une ligne semée à une étape du pipe
    // aurait rempli le jeu sans rien changer à l'écran.
    //
    // ⚠️ NI montant NI échéance : un signal n'est pas chiffré. Écrire `0` ou une
    // date devinée annulerait « non mesuré n'est jamais zéro » à l'endroit où
    // elle se voit.
    //
    // ⚠️ #2172 — l'identifiant de chaque ligne est RETENU : la file « Pistes à
    // qualifier » archive une décision par CLÉ de piste, et la clé est l'id de
    // la ligne. Sans `RETURNING`, le semis d'écartement devrait inventer une
    // clé — donc écarter une piste qui n'existe pas.
    const signalIds: string[] = []
    for (const signal of client.detectedSignals) {
      const [signalRow] = (await this.accounts.manager.query(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, source, confidence,
            primary_domain_code, first_detected_at)
         VALUES ($1, $2, 'signal', $3, $4, 'detected', $5, 'signal', 'medium', $6, $5)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          signal.label,
          signal.detail,
          iso(signal.detected_days_ago),
          signal.primary_domain_code ?? null,
        ],
      )) as { id: string }[]
      signalIds.push(signalRow?.id ?? '')
    }

    // ─────────────────────────────────────────────────────────────────────────
    // #2172 — LA PISTE ÉCARTÉE, AVEC SON MOTIF
    // ─────────────────────────────────────────────────────────────────────────
    // On ARCHIVE, on ne supprime pas : la ligne écartée reste dans
    // `opportunities`, et c'est la DÉCISION qui la sort de la file active. La
    // salle doit montrer les deux — sinon la démonstration laisse croire qu'un
    // refus efface la donnée.
    //
    // ⚠️ `scope` n'est pas passé : la colonne vaut `workspace` par défaut, et la
    // contrainte SQL refuse tout le reste. Un semis qui l'écrirait serait le
    // premier endroit du dépôt à prétendre qu'une portée se choisit.
    const dismissedLeadId = signalIds[client.dismissedLead.signalIndex]
    if (dismissedLeadId) {
      await this.accounts.manager.query(
        `INSERT INTO qualification_lead_decisions
           (workspace_id, account_id, lead_key, decision, reason, note, decided_by, decided_at)
         VALUES ($1, $2, $3, 'dismissed', $4, $5, $6, $7)
         ON CONFLICT (workspace_id, lead_key) DO NOTHING`,
        [
          workspaceId,
          accountId,
          dismissedLeadId,
          client.dismissedLead.reason,
          client.dismissedLead.note,
          ownerUserId,
          iso(4),
        ],
      )
    }

    // #3679 — la piste EN VEILLE : une pause datée, sans motif (`shape_check`).
    const snoozedLeadId = signalIds[client.snoozedLead.signalIndex]
    if (snoozedLeadId) {
      await this.accounts.manager.query(
        `INSERT INTO qualification_lead_decisions
           (workspace_id, account_id, lead_key, decision, reason, note, snoozed_until, decided_by, decided_at)
         VALUES ($1, $2, $3, 'snoozed', NULL, NULL, $4, $5, $6)
         ON CONFLICT (workspace_id, lead_key) DO NOTHING`,
        [workspaceId, accountId, snoozedLeadId, iso(-client.snoozedLead.snoozedInDays), ownerUserId, iso(2)],
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // #1889 — LES PROJETS REPRIS D'UN FICHIER
    // ─────────────────────────────────────────────────────────────────────────
    // `kind: 'imported'`, exactement ce que `ImportWriterService.writeProjects`
    // pose. C'est le seul endroit du produit où une ligne DIT qu'elle ne vient
    // d'aucune analyse, et c'est la question d'un prospect qui reprend une base.
    //
    // ⚠️ `source: 'import'` aussi — la provenance, comme pour un contact repris.
    // La ranger avec les lignes dérivées effacerait la seule information qui
    // permet, plus tard, de savoir à quoi faire confiance.
    for (const projet of client.importedProjects) {
      const [importedRow] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, source, confidence,
            amount_cents, currency, expected_close_on, first_detected_at)
         VALUES ($1, $2, 'imported', $3, $4, $5, $6, 'import', NULL, $7, $8, $9, $6)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          projet.label,
          projet.detail,
          projet.stage,
          iso(21),
          projet.amount_cents,
          projet.amount_cents === null ? null : 'EUR',
          projet.expected_close_on,
        ],
      )
      // #3712 — le contact rattaché à la ligne reprise (cas « Détecté » d'une fiche Contact) : PAR NOM, un nom
      // introuvable fait SAUTER la ligne (jamais un contact fabriqué).
      for (const link of projet.contacts ?? []) {
        const contactId = contactIdsByName.get(link.full_name)
        if (!importedRow || !contactId) continue
        await this.accounts.manager.query(
          `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [workspaceId, importedRow.id, contactId, link.role],
        )
      }
    }

    // #3676 / #3714 — « Signaux et besoins » : demande confirmée, affaire travaillée
    // à titre générique, généralité sans travail, programme nommé. Le montant,
    // quand il est là, est celui que le commercial a SAISI ; absent = absent, jamais 0.
    for (const cas of client.signalsAndNeedsCases) {
      const [inserted] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, stage, stage_entered_at, source, confidence,
            amount_cents, currency, first_detected_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $7)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          cas.kind,
          cas.label,
          cas.detail,
          cas.stage,
          iso(cas.days_ago),
          // `source` NULL pour une déduction, comme `materialize` : le témoin n'est
          // jamais le nom de la voie.
          cas.source,
          cas.kind === 'implication' ? 'low' : 'medium',
          cas.amount_cents,
          cas.amount_cents === null ? null : 'EUR',
        ],
      )
      // #3624 (R2 07/10) — les interlocuteurs de la demande : rattachés PAR NOM aux contacts déjà
      // semés du compte ; un nom introuvable fait SAUTER la ligne (jamais un contact fabriqué).
      for (const link of cas.contacts ?? []) {
        const contactId = contactIdsByName.get(link.full_name)
        if (!inserted || !contactId) continue
        await this.accounts.manager.query(
          `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [workspaceId, inserted.id, contactId, link.role],
        )
      }
    }

    // ⚠️ Les DEUX listes, dans la même boucle. Un besoin refusé est un
    // `project_needs` ordinaire — il porte seulement un verdict G3 et un statut
    // `lost`, qui n'a pas de colonne sur le kanban. Les tenir séparés dans le
    // jeu de données garde la garde du kanban vraie ; les semer ensemble évite
    // un second chemin d'écriture qui divergerait au premier champ ajouté.
    for (const need of [...client.openNeeds, ...client.refusedNeeds]) {
      /**
       * Les quatre champs que SEULS les besoins refusés portent.
       *
       * Un accès nommé plutôt qu'une propriété optionnelle sur chaque entrée
       * ouverte : les rôles ouverts n'ont pas de verdict G3, et leur en poser un
       * à `undefined` ferait croire qu'il a été décidé. Ce que la base reçoit,
       * elle, est le défaut de la colonne — `unknown`, « personne n'a regardé ».
       */
      const gate = need as Partial<{
        duration_months: number | null
        staffable: 'unknown' | 'yes' | 'no'
        staffable_reason: string | null
        staffable_decided_days_ago: number | null
        /** #2173.49 — l'unique besoin ARCHIVÉ de la salle : voir
         *  `DEMO_DELIVERY_CLIENT.openNeeds`, l'entrée « Data analyst reporting ».
         *  `null` pour tous les autres — un rangement, jamais un défaut. */
        archived_days_ago: number | null
        /** #2323.22 / #2323.18 — la porte PRÉSENTER. Absent sur un rôle qui
         *  n'en parle pas : le défaut de la colonne s'applique plus bas. */
        presentation_process: string | null
        profile_type_agreement: 'unknown' | 'agreed' | 'not_agreed'
        /** #2323.38-.42 — le moteur de contradictions. `null`/absent sur un
         *  rôle qui n'en parle pas : le défaut honnête de la colonne (non
         *  renseigné), jamais une valeur devinée. */
        interview_rounds: number | null
        onsite_days_per_week: number | null
        freelance_excluded: boolean | null
        budget_validated: boolean | null
        /** #2939 (#2174.32/.34) — comment le client décide, et les achats.
         *  `null`/absent sur un rôle qui n'en parle pas : le défaut honnête de
         *  la colonne, jamais une valeur devinée. Pas de `decision_maker_contact_id`
         *  ici : aucun besoin de la salle n'en porte non plus pour
         *  `contact_id` (l'interlocuteur) — même absence, pas un choix isolé
         *  pour ce champ. */
        decision_process: string | null
        procurement_involvement: 'implique' | 'non_implique' | null
        /** #3409.2 — la NATURE du besoin (`convergence_state`). `null`/absent
         *  sur un rôle qui n'en parle pas : le défaut honnête de la colonne,
         *  jamais un niveau deviné. */
        convergence_state: 'besoin_exprime' | 'besoin_detecte' | 'projet_plausible' | 'projet_confirme' | null
        /** #3389.13 — la reprise prévue d'une veille, en jours à partir
         *  d'aujourd'hui. `null`/absent : une veille sans échéance. */
        resume_in_days: number | null
      }>
      const [row] = await this.accounts.manager.query<{ id: string }[]>(
        `INSERT INTO project_needs
           (workspace_id, project_id, account_id, title, skills, seniority, headcount, target_tjm_cents, location,
            contract_kind, status, status_reason, status_changed_at, urgency, source, provenance,
            start_on, deadline_at, owner_id,
            languages, clearances, context, expertise, stack, constraints, min_tjm_cents, budget_cents,
            duration_months, staffable, staffable_reason, staffable_decided_at, archived_at, remote,
            presentation_process, profile_type_agreement,
            interview_rounds, onsite_days_per_week, freelance_excluded, budget_validated,
            decision_process, procurement_involvement, convergence_state, resume_on)
         VALUES ($1, $2,
                 -- #2558.1 — le compte, dérivé du projet en SQL : les gardes du
                 -- semis lisent ces paramètres PAR RANG, et en insérer un
                 -- décalerait tout ce qui suit.
                 (SELECT o.account_id FROM opportunities o WHERE o.id = $2),
                 $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19::jsonb, $20::text[], $21, $22, $23::jsonb, $24, $25, $26,
                 $27::integer, $28::text, $29::text, $30::timestamptz, $31::timestamptz,
                 -- #2173.29 — AJOUTÉE EN FIN DE LISTE : les gardes du semis
                 -- lisent ces paramètres PAR RANG, et en insérer un au milieu
                 -- décalerait tout ce qui suit.
                 $32::text,
                 -- #2323.18 / #2323.22 — même règle : AJOUTÉES EN FIN DE LISTE.
                 $33::text, $34::text,
                 -- #2323.38-.42 — même règle : AJOUTÉES EN FIN DE LISTE.
                 $35::integer, $36::integer, $37::boolean, $38::boolean,
                 -- #2939 (#2174.32/.34) — même règle : AJOUTÉES EN FIN DE LISTE.
                 $39::text, $40::text,
                 -- #3409.2 — même règle : AJOUTÉE EN FIN DE LISTE.
                 $41::text,
                 -- #3389.13 — même règle : AJOUTÉE EN FIN DE LISTE.
                 $42::date)
         RETURNING id`,
        [
          workspaceId,
          project.id,
          need.title,
          // Un TABLEAU D'OBJETS, jamais des chaînes : le filtre par compétence
          // fait `s->>'term'` sur chaque élément, et une chaîne y rendrait NULL.
          JSON.stringify(need.skills),
          need.seniority,
          need.headcount,
          need.target_tjm_cents,
          need.location,
          need.contract_kind,
          need.status,
          need.status_reason,
          // L'âge dans l'étape : la mesure sur laquelle repose la moitié du pied
          // de carte. Ancrée sur MAINTENANT, donc sur la remise à neuf de la
          // salle — une date en dur vieillirait de visite en visite.
          iso(need.status_changed_days_ago),
          need.urgency,
          need.source,
          need.provenance,
          // Une DATE NUE : la colonne est de type `date`, et le compteur
          // « démarre bientôt » y compare un intervalle en jours.
          need.start_in_days === null ? null : dateOnly(-need.start_in_days),
          need.deadline_in_days === null ? null : iso(-need.deadline_in_days),
          ownerUserId,
          // CE QUE LE POSTE EXIGE, et ce qu'il raconte.
          //
          // ⚠️ `languages` et `stack` sont du `jsonb` — donc une CHAÎNE JSON,
          // comme `skills` juste au-dessus. `clearances` est un `text[]` natif :
          // le pilote pg lie un tableau JS directement, et lui passer du JSON
          // écrirait un unique élément « ["..."] ».
          //
          // ⚠️ Ces six-là ne sont pas décoratifs : l'axe 12 du rapprochement
          // (« une habilitation manquante ÉCARTE ») n'a rien à écarter tant
          // qu'aucun rôle n'exige rien — la salle montrerait treize axes annoncés
          // et n'en verrait jamais un seul agir.
          JSON.stringify(need.languages),
          need.clearances,
          need.context,
          need.expertise,
          JSON.stringify(need.stack),
          need.constraints,
          // `null` et jamais 0 : « personne n'a fixé de plancher » et « le
          // plancher est zéro » appellent des gestes opposés.
          need.min_tjm_cents,
          need.budget_cents,
          /**
           * LE REFUS FAUTE DE PROFIL — PDF 4 §8.4, et la parité démo qui va avec.
           *
           * `staffable: 'no'` est ce que lit le détecteur d'expertise manquante.
           * Sans ces quatre colonnes, la salle de démo montrerait un vivier sans
           * jamais montrer ce qu'il COÛTE de ne pas l'avoir — l'écran serait
           * livré et vide, et ça se découvrirait en réunion.
           *
           * `duration_months` accompagne `target_tjm_cents` parce que le
           * chiffrage exige les DEUX : un €/jour sans durée ne devient jamais un
           * €, et on ne devine pas douze mois.
           */
          gate.duration_months ?? null,
          gate.staffable ?? 'unknown',
          gate.staffable_reason ?? null,
          gate.staffable_decided_days_ago == null ? null : iso(gate.staffable_decided_days_ago),
          // #2173.49 — ARCHIVÉ, jamais un statut : cette colonne est la SEULE
          // qui change pour le besoin rangé de la salle, `status` ci-dessus
          // reste celui du jeu de données (`to_qualify`).
          gate.archived_days_ago == null ? null : iso(gate.archived_days_ago),
          // #2173.29 — LE TÉLÉTRAVAIL. `null` reste `null` : la salle porte
          // délibérément deux besoins « non renseigné », jamais un
          // `'sur_site'` deviné.
          need.remote,
          // #2323.22 / #2323.18 — la porte PRÉSENTER, les deux critères
          // ajoutés par ce lot. `?? null` / `?? 'unknown'` : un besoin qui ne
          // les nomme pas dans le jeu de données garde le défaut honnête de la
          // colonne, jamais un accord ou un processus deviné.
          gate.presentation_process ?? null,
          gate.profile_type_agreement ?? 'unknown',
          // #2323.38-.42 — le moteur de contradictions. `?? null` : un rôle
          // qui ne les nomme pas dans le jeu de données reste « non renseigné »,
          // jamais une valeur devinée.
          gate.interview_rounds ?? null,
          gate.onsite_days_per_week ?? null,
          gate.freelance_excluded ?? null,
          gate.budget_validated ?? null,
          // #2939 (#2174.32/.34) — même règle `?? null` : un rôle qui ne les
          // nomme pas dans le jeu de données reste « non renseigné ».
          gate.decision_process ?? null,
          gate.procurement_involvement ?? null,
          // #3409.2 — même règle `?? null` : un rôle qui ne le nomme pas dans
          // le jeu de données reste « jamais évalué ».
          gate.convergence_state ?? null,
          // #3389.13 — la reprise prévue d'une veille. `null` = pas de date.
          gate.resume_in_days == null ? null : iso(-gate.resume_in_days).slice(0, 10),
        ],
      )
      if (!row) continue
      needIdsByTitle.set(need.title, row.id)

      // #2967 (lot V39) — LE JOURNAL DES ÉTATS du besoin, lu par l'onglet
      // Historique (`NeedHistoryTab`, `GET /projects/needs/:id/status-history`).
      // Deux lignes au plus, tirées des champs DÉJÀ semés : la naissance
      // (`to_qualify`, comme `ProjectPipelineService.saveNeed` l'écrit) puis
      // l'entrée dans l'état courant à `status_changed_at`, avec son motif
      // comme preuve. La PREMIÈRE vraie transition porte la source `laura`
      // (proposition validée) : la salle montre les deux formes de l'écran.
      await this.seedNeedStatusJournal(workspaceId, ownerUserId, row.id, {
        status: need.status,
        reason: need.status_reason ?? null,
        changedAt: iso(need.status_changed_days_ago),
        bornAt: iso(need.status_changed_days_ago - 7),
        source: lauraJournalPending && need.status !== 'to_qualify' ? 'laura' : 'human',
      })
      if (need.status !== 'to_qualify') lauraJournalPending = false

      for (const entry of need.shortlist) {
        const consultantId = consultantIdsByName.get(entry.consultant)
        // Un positionnement sans consultant retrouvé est SAUTÉ, pas inventé.
        if (!consultantId) continue
        await this.accounts.manager.query(
          // `need_id` est LA colonne du lot : sans elle la ligne existe, la
          // shortlist reste à zéro, et l'écran dit « aucun profil positionné »
          // au-dessus d'un profil positionné.
          //
          // #2177.11 / .12 / .13 / .15 — `substatus` posé avec la MÊME
          // dérivation que `SubmissionsService.create` (`deriveSubstatusFromStage`),
          // jamais un texte recopié à la main : sans lui, aucune fiche
          // shortlist/submitted de la démo ne montrait le bouton d'avancée du
          // sous-statut ajouté par ce lot.
          // #3068 — même garde qu'au positionnement direct plus haut
          // (`client.submissions`) : IDEMPOTENT sur `submissions_unique`, pour
          // qu'une salle réparée pendant qu'un visiteur l'occupe encore
          // retrouve la MÊME shortlist au lieu de faire échouer tout le
          // re-semis sur un doublon.
          `INSERT INTO submissions
             (workspace_id, project_id, need_id, consultant_id, stage, substatus, stage_entered_at,
              submitted_at, proposed_rate_cents, owner_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
             DO NOTHING`,
          [
            workspaceId,
            project.id,
            row.id,
            consultantId,
            entry.stage,
            deriveSubstatusFromStage(entry.stage, null),
            iso(entry.stage_entered_days_ago),
            entry.submitted_days_ago === null ? null : iso(entry.submitted_days_ago),
            // `null` et jamais 0 : un tarif non encore proposé se lirait
            // « gratuit », et personne ne relit un chiffre qui a l'air d'exister.
            entry.proposed_rate_cents,
            ownerUserId,
          ],
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // LES DOCUMENTS ET LES ÉTAPES — APRÈS la boucle, comme `needIdsByTitle`
    // le veut : ce qui LIT (`client.needDocuments`, `client.needSteps`) vient
    // après ce qui ÉCRIT (l'insertion des besoins ci-dessus).
    // ─────────────────────────────────────────────────────────────────────
    for (const document of client.needDocuments) {
      const needId = needIdsByTitle.get(document.need)
      // Un titre qui ne retrouve pas de besoin est SAUTÉ, pas inventé — même
      // règle que `need.shortlist` ci-dessus pour un consultant introuvable.
      if (!needId) continue
      // Mêmes deux moitiés que les justificatifs : deux pièces qui S'OUVRENT,
      // et des pièces qu'on suit sans les détenir — « en attente » veut dire
      // qu'on attend encore le fichier.
      const storageObjectId = document.stored
        ? await this.seedStoredFile({
            workspaceId,
            domain: 'need_document',
            fileKey: `need/${document.need}/${document.name}`,
            fileName: document.name,
            title: 'Piece d’affaire de demonstration',
            lines: [
              `Besoin : ${document.need}`,
              `Nature : ${document.kind}`,
              '',
              'Document FICTIF, produit pour la salle de demonstration Bellum.',
            ],
            depositedOn: iso(30).slice(0, 10),
          })
        : null
      await this.accounts.manager.query(
        `INSERT INTO need_documents (workspace_id, need_id, kind, name, status, storage_object_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, needId, document.kind, document.name, document.status, storageObjectId],
      )
    }

    for (const [index, step] of client.needSteps.entries()) {
      const needId = needIdsByTitle.get(step.need)
      if (!needId) continue
      await this.accounts.manager.query(
        `INSERT INTO need_steps (workspace_id, need_id, label, status, position, done_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          needId,
          step.label,
          step.status,
          index,
          // Jamais une date inventée sur une étape non terminée — voir le
          // docblock de `NeedStepsService.updateStatus`.
          step.status === 'done' ? iso(2) : null,
        ],
      )
    }

    // #2171.22 — les étapes de l'OPPORTUNITÉ elle-même (`project.id`), pas
    // d'indirection par titre : un seul projet dans ce lot.
    for (const [index, step] of client.projectSteps.entries()) {
      await this.accounts.manager.query(
        `INSERT INTO project_steps (workspace_id, project_id, label, status, position, done_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, project.id, step.label, step.status, index, step.status === 'done' ? iso(2) : null],
      )
    }

    // #2171.24 — les documents de l'OPPORTUNITÉ elle-même, distincts de
    // `need_documents` (un rôle précis) : suivis au niveau de l'affaire.
    for (const document of client.projectDocuments) {
      await this.accounts.manager.query(
        `INSERT INTO project_documents (workspace_id, project_id, kind, name, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [workspaceId, project.id, document.kind, document.name, document.status],
      )
    }

    await this.seedNeedVerdict(
      workspaceId,
      ownerUserId,
      accountId,
      project.id,
      needIdsByTitle,
      consultantIdsByName,
      iso,
    )

    // Théo C projects-besoins — « Périmé — à revérifier » : le premier rôle ouvert de la salle date de douze jours
    // et n'a aucun profil positionné ; la pastille et le filtre « Périmés » ont donc quelque chose à montrer.
    // `created_at` est la SEULE colonne touchée, et seulement pour un besoin tout juste semé (idempotent).
    const staleDemoNeed = DEMO_DELIVERY_CLIENT.openNeeds[0]
    if (staleDemoNeed) {
      await this.notes.manager.query(
        `UPDATE project_needs SET created_at = now() - interval '12 days'
          WHERE workspace_id = $1 AND title = $2 AND created_at > now() - interval '1 day'`,
        [workspaceId, staleDemoNeed.title],
      )
    }
  }

  /**
   * CE QUI REMPLIT LE VERDICT « GO / NO-GO » D'UN BESOIN (craft rule n°9).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE SEMIS EXISTE
   * ─────────────────────────────────────────────────────────────────────────
   * Le verdict lit trois choses que la salle ne portait pas : un
   * rapprochement DÉJÀ exécuté (`match_runs` / `match_run_entries`), les
   * contacts de l'affaire et leur rôle (`project_contacts`), et des
   * partenaires nommément CONCURRENTS. Sans elles, la fiche s'ouvrait sur
   * « JE MANQUE DE DONNÉES » avec quatre absences — honnête, et invendable :
   * un prospect n'y verrait jamais ce que l'écran sait faire.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ IL N'EN REMPLIT QU'UN SEUL, ET C'EST LE POINT
   * ─────────────────────────────────────────────────────────────────────────
   * Un seul des cinq rôles porte un rapprochement. Les quatre autres gardent
   * leur verdict « je manque de données » avec leurs absences NOMMÉES — c'est
   * la moitié qu'on oublie de seeder, et la seule qui démontre que le produit
   * dit ce qu'il ignore. Voir le docblock de `DEMO_DELIVERY_CLIENT.needVerdict`.
   *
   * ⚠️ Rien n'est INVENTÉ : un titre de rôle introuvable, un consultant non
   * résolu ou un compte sans contact fait SAUTER la ligne, exactement comme la
   * shortlist et les documents juste au-dessus.
   */
  private async seedNeedVerdict(
    workspaceId: string,
    ownerUserId: string,
    accountId: string,
    projectId: string,
    needIdsByTitle: Map<string, string>,
    consultantIdsByName: Map<string, string>,
    iso: (offsetDays: number) => string,
  ): Promise<void> {
    const client = DEMO_DELIVERY_CLIENT
    const plan = client.needVerdict

    // ── Les concurrents du panel ───────────────────────────────────────────
    // `ON CONFLICT DO NOTHING` : le semis d'analyse a pu écrire le même nom, et
    // une salle se remet à neuf sans jamais échouer sur un doublon.
    for (const competitor of client.competitors) {
      await this.accounts.manager.query(
        `INSERT INTO account_partners
           (workspace_id, account_id, name, rank, relationship, source, placements, scope)
         VALUES ($1, $2, $3, 'unknown', 'competitor', 'declared', 0, $4)
         ON CONFLICT (account_id, lower(name)) DO NOTHING`,
        [workspaceId, accountId, competitor.name, competitor.scope],
      )
    }

    // ── Les contacts de l'affaire, AUCUN décideur ─────────────────────────
    // Les contacts existent déjà (semés par l'analyse) : on les RATTACHE, on
    // n'en fabrique pas. Un compte sans contact laisse simplement l'axe
    // « accès » non renseigné, ce qui est vrai.
    const contacts = await this.accounts.manager.query<{ id: string }[]>(
      `SELECT id FROM contacts WHERE account_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [accountId, client.projectContactRoles.length],
    )
    for (const [index, contact] of contacts.entries()) {
      const role = client.projectContactRoles[index]
      if (!role) continue
      await this.accounts.manager.query(
        `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [workspaceId, projectId, contact.id, role],
      )
    }

    // ── LE rapprochement, sur un seul rôle ────────────────────────────────
    const needId = needIdsByTitle.get(plan.need)
    if (!needId) return
    // #3712 — le MÊME besoin nomme son interlocuteur (le sponsor de l'affaire) : la fiche de cette
    // personne montre alors un projet ET un besoin, par identité (`project_needs.contact_id`), pas par
    // son nom. Les autres contacts du compte n'y sont PAS rattachés — c'est le cas « compte seul ».
    const interlocutor = contacts[0]
    if (interlocutor) {
      await this.accounts.manager.query(
        `UPDATE project_needs SET contact_id = $2 WHERE id = $1 AND workspace_id = $3`,
        [needId, interlocutor.id, workspaceId],
      )
    }
    const entries = plan.entries
      .map(entry => ({ ...entry, consultantId: consultantIdsByName.get(entry.consultant) }))
      .filter((entry): entry is typeof entry & { consultantId: string } => Boolean(entry.consultantId))
    // Un rapprochement sans un seul profil résolu n'est pas un rapprochement
    // vide, c'est un semis raté : mieux vaut n'en écrire aucun et laisser
    // l'axe dire « personne n'a regardé le vivier ».
    if (entries.length === 0) return

    const [run] = await this.accounts.manager.query<{ id: string }[]>(
      // `criteria` et `weights` sont FIGÉS au contrat : le journal doit rester
      // rejouable. On y met la forme minimale que le verdict n'utilise pas mais
      // que la colonne exige — il lit `threshold`, `evaluated_count` et les
      // entrées, rien d'autre.
      `INSERT INTO match_runs
         (workspace_id, user_id, need_id, direction, criteria, weights, threshold,
          evaluated_count, prefiltered_count, truncated, exclusion_counts, created_at)
       VALUES ($1, $2, $3, 'need_to_pool', $4::jsonb, $5::jsonb, $6, $7, 0, false, '[]'::jsonb, $8)
       RETURNING id`,
      [
        workspaceId,
        ownerUserId,
        needId,
        JSON.stringify({ needId, role: plan.need }),
        JSON.stringify({}),
        plan.threshold,
        plan.evaluated,
        iso(plan.runDaysAgo),
      ],
    )
    if (!run) return

    // #2916 / #2399.2 (c93) — le run est celui de la routine « Matcher un
    // besoin entrant » : la fiche le dit « lancé automatiquement ». Une ligne
    // par besoin (clé primaire), comme en production.
    if (plan.autoLaunched) {
      await this.accounts.manager.query(
        `INSERT INTO need_auto_matches (need_id, workspace_id, user_id, status, run_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'done', $4, $5, $5)
         ON CONFLICT (need_id) DO NOTHING`,
        [needId, workspaceId, ownerUserId, run.id, iso(plan.runDaysAgo)],
      )
    }

    for (const [index, entry] of entries.entries()) {
      await this.accounts.manager.query(
        `INSERT INTO match_run_entries
           (run_id, consultant_id, rank, correspondence_score, pushable_score, bucket, axes, exclusions, created_at)
         VALUES ($1, $2, $3, $4, $5, 'recommended', $6::jsonb, '[]'::jsonb, $7)`,
        [
          run.id,
          entry.consultantId,
          index,
          entry.correspondence,
          entry.pushable,
          // Les trois axes que le verdict RELIT, écrits dans la forme du
          // moteur (`matchAxisResultSchema`). Les neuf autres ne sont pas
          // fabriqués : le verdict ne les lit pas, et en inventer des scores
          // ferait mentir le tiroir de rapprochement s'il relisait ce journal.
          JSON.stringify([
            // Refonte Théo — l'axe des compétences obligatoires, au format de `skillAxis` (preuves
            // couvertes, « — manque … ») : la fiche le relit en clair (`matchInClear`).
            {
              axis: 'must_have',
              score: Math.round(
                (entry.mustHave.covered.length * 100) / (entry.mustHave.covered.length + entry.mustHave.missing.length),
              ),
              weight: 25,
              detail:
                entry.mustHave.missing.length === 0
                  ? `les ${entry.mustHave.covered.length} compétences attendues sont prouvées`
                  : `${entry.mustHave.covered.length}/${entry.mustHave.covered.length + entry.mustHave.missing.length} couvertes — manque ${entry.mustHave.missing.join(', ')}`,
              evidence: entry.mustHave.covered.map(label => ({ label, source: 'mission' })),
            },
            { axis: 'availability', score: entry.availability, weight: 12, detail: '', evidence: [] },
            { axis: 'rate', score: entry.rate, weight: 8, detail: '', evidence: [] },
            { axis: 'sector', score: entry.sector, weight: 8, detail: '', evidence: [] },
          ]),
          iso(plan.runDaysAgo),
        ],
      )
    }
  }

  /**
   * Fait vivre le pipe de démonstration : quelques projets avancés, deux
   * montants, un rôle recherché.
   *
   * Aucun projet n'est FABRIQUÉ — ils viennent tous de la matérialisation, donc
   * du contenu réel des dossiers d'exemple. Ce qui est simulé ici, ce sont les
   * GESTES qu'un commercial aurait faits : déplacer une carte, chiffrer une
   * affaire, écrire le poste cherché. La sélection est déterministe (les plus
   * anciens d'abord) pour qu'une salle remise à neuf montre toujours la même
   * chose à deux prospects différents.
   */
  private async advanceDemoPipeline(workspaceId: string, now: number, ownerUserId: string): Promise<void> {
    // La sélection doit être CELLE DE L'ÉCRAN, pas une variante.
    //
    // La version d'avant filtrait sur `opportunities.workspace_id` seul, alors
    // que toutes les lectures du pipe passent par
    // `(o.workspace_id = $1 OR a.workspace_id = $1)` — l'écart est documenté
    // dans `ProjectsService` : la colonne peut être transitoirement NULL, le
    // rattachement de vérité est celui du COMPTE. Conséquence observée en
    // production : le pipe de démonstration s'ouvrait avec ses cinq colonnes à
    // zéro alors que 73 projets étaient bien matérialisés — le seed ne trouvait
    // rien à avancer et sortait en silence.
    //
    // Règle générale : un seed qui ne lit pas comme l'écran peut remplir des
    // lignes que l'écran n'affichera pas, ou n'en remplir aucune, et les deux se
    // découvrent devant un prospect.
    const projects = await this.notes.manager.query<{ id: string; label: string }[]>(
      `SELECT o.id, o.label
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id
        WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
        ORDER BY o.first_detected_at ASC, o.id ASC
        LIMIT 9`,
      [workspaceId],
    )
    if (projects.length === 0) return

    // Une répartition qui laisse voir les cinq colonnes ET l'entonnoir d'entrée :
    // un pipe où tout est au même endroit ne montre pas qu'il y a des étapes.
    const plan: { stage: string; amountCents: number | null }[] = [
      { stage: 'qualified', amountCents: 4_500_000 },
      { stage: 'qualified', amountCents: null },
      { stage: 'confirmed', amountCents: 9_000_000 },
      { stage: 'profiles_submitted', amountCents: null },
      { stage: 'negotiation', amountCents: 12_000_000 },
      { stage: 'won', amountCents: 7_500_000 },
    ]

    for (const [index, target] of plan.entries()) {
      const project = projects[index]
      if (!project) break
      const enteredAt = new Date(now - (plan.length - index) * 6 * 24 * 3_600_000)
      await this.notes.manager.query(
        // Les casts de `$3` et `$4` ne sont pas décoratifs : ils sont ce qui fait
        // tourner la requête. Dans `stage_entered_at = $3`, Postgres déduit le
        // type depuis la colonne ; dans `CASE … THEN $3 ELSE NULL END`, il n'a
        // AUCUN contexte et retombe sur `text`. Le même paramètre recevait donc
        // deux types selon l'endroit, et le serveur refusait la requête entière
        // — « inconsistent types deduced for parameter $3 ». En production, ce
        // refus faisait échouer le seed, donc `POST /demo/session` en 500, donc
        // « Démo indisponible » pour tout visiteur du lien public.
        `UPDATE opportunities
            SET stage = $2,
                stage_entered_at = $3::timestamptz,
                closed_at = CASE WHEN $2 = 'won' THEN $3::timestamptz ELSE NULL END,
                outcome = CASE WHEN $2 = 'won' THEN 'won' ELSE NULL END,
                amount_cents = $4::bigint,
                estimated_amount = CASE WHEN $4::bigint IS NULL THEN NULL ELSE ($4::bigint / 100.0) END,
                currency = 'EUR'
          WHERE id = $1`,
        [project.id, target.stage, enteredAt, target.amountCents],
      )
    }

    // Un rôle recherché sur le projet le plus avancé du pipe : sans lui,
    // l'onglet « Rôles recherchés » s'ouvre vide sur la carte qu'un prospect
    // clique en premier.
    const flagship = projects[4] ?? projects[0]
    if (!flagship) return
    // Le contenu de ce besoin vit dans {@link DEMO_FLAGSHIP_NEED}, et non plus en
    // dur dans ce SQL : la garde qui vérifie quelles COLONNES du kanban des
    // besoins la démonstration remplit doit pouvoir le lire depuis le jeu de
    // données, sans recopier son état à la main.
    const flagshipNeed = DEMO_FLAGSHIP_NEED
    await this.notes.manager.query(
      // ⚠️ CHAQUE paramètre est CASTÉ, et ce n'est pas décoratif. Dans un
      // `INSERT … VALUES`, Postgres déduit le type de chaque paramètre depuis la
      // colonne visée ; dans un `INSERT … SELECT`, la liste du SELECT est
      // résolue AVANT d'être rapprochée des colonnes, et un paramètre sans
      // contexte y retombe sur `text`. C'est le même piège que le
      // « inconsistent types deduced for parameter » qui faisait répondre 500 à
      // `POST /demo/session` en production — la version d'avant ne l'avait pas
      // parce qu'elle écrivait des littéraux en dur.
      `INSERT INTO project_needs
         (workspace_id, project_id, account_id, title, skills, seniority, headcount, target_tjm_cents, location,
          contract_kind, status, status_changed_at, urgency, source, provenance, owner_id, remote)
      -- #2558.1 — account_id est NOT NULL depuis la migration
      -- 1795711263408. Il se DERIVE du projet ici, en SQL, plutot que de
      -- prendre un rang de paramètre : les gardes du semis lisent ces
      -- paramètres PAR RANG, et en insérer un décalerait tout ce qui suit.
       SELECT $1::uuid, $2::uuid,
              (SELECT o.account_id FROM opportunities o WHERE o.id = $2::uuid),
              $3::text, $4::jsonb, $5::text, $6::integer, $7::bigint, $8::text,
              $9::text, $10::text, now() - ($11 || ' days')::interval, $12::text, $13::text, $14::text, $15::uuid,
              -- #2173.29 — AJOUTÉE EN FIN DE LISTE, même raison que plus haut.
              $16::text
        WHERE NOT EXISTS (SELECT 1 FROM project_needs WHERE project_id = $2)`,
      [
        workspaceId,
        flagship.id,
        flagshipNeed.title,
        JSON.stringify(flagshipNeed.skills),
        flagshipNeed.seniority,
        flagshipNeed.headcount,
        flagshipNeed.target_tjm_cents,
        flagshipNeed.location,
        flagshipNeed.contract_kind,
        flagshipNeed.status,
        String(flagshipNeed.status_changed_days_ago),
        flagshipNeed.urgency,
        flagshipNeed.source,
        flagshipNeed.provenance,
        ownerUserId,
        flagshipNeed.remote,
      ],
    )

    // Deux besoins PROPOSÉS par l'analyse, en attente d'un geste (PDF 4, PE5).
    //
    // Ils sont seedés et non laissés vides parce que c'est justement la
    // distinction que l'écran sert à montrer : ce que l'outil a VU n'est pas
    // encore dans le pipe, et quelqu'un doit dire oui. Un écran vide ne
    // raconterait rien — et le worker d'analyse ne tourne pas en démonstration,
    // donc rien ne les produirait.
    await this.notes.manager.query(
      `INSERT INTO need_proposals
         (workspace_id, account_id, title, skills, location, source, source_url, detected_at, raw)
       SELECT $1, o.account_id, v.title, v.skills::text[], v.location, 'job_ad', v.url,
              now() - (v.age || ' days')::interval, '{}'::jsonb
         FROM opportunities o
        CROSS JOIN (VALUES
           ('Ingénieur DevOps — plateforme de paiement', ARRAY['Kubernetes','Terraform','GitLab CI'], 'Paris', 'https://exemple.example/offres/devops-paiement', '4'),
           ('Data engineer — socle décisionnel', ARRAY['Spark','Airflow','SQL'], 'Nantes', 'https://exemple.example/offres/data-engineer-socle', '11')
         ) AS v(title, skills, location, url, age)
        WHERE o.id = $2
          AND NOT EXISTS (SELECT 1 FROM need_proposals WHERE workspace_id = $1)`,
      [workspaceId, flagship.id],
    )

    // Théo C projects-besoins — le besoin phare naît d'une offre repérée (proposition ACCEPTÉE) : sa page
    // d'origine voyage sur la ligne du besoin et se lit sans ouvrir de détail.
    await this.notes.manager.query(
      `INSERT INTO need_proposals
         (workspace_id, account_id, title, skills, location, source, source_url, detected_at, raw,
          status, decided_at, created_need_id)
       SELECT n.workspace_id, n.account_id, n.title, ARRAY['Kubernetes','Terraform'], n.location, 'job_ad', $3,
              now() - interval '14 days', '{}'::jsonb, 'accepted', now() - interval '13 days', n.id
         FROM project_needs n
        WHERE n.workspace_id = $1 AND n.project_id = $2 AND n.title = $4
          AND NOT EXISTS (SELECT 1 FROM need_proposals p WHERE p.created_need_id = n.id)`,
      [workspaceId, flagship.id, DEMO_FLAGSHIP_NEED_SOURCE_URL, flagshipNeed.title],
    )

    // Un refus ANTÉRIEUR chez ce même client (PDF 4 §13, exigence de démo).
    //
    // Sans lui, le drapeau « déjà refusé chez ce client » — celui qui évite de
    // repousser quelqu'un dont le client n'a pas voulu — ne se voit nulle part
    // dans la démonstration. Il porte son motif : un refus sans raison ne dit
    // pas s'il est rejouable.
    const rejected = await this.notes.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND full_name = 'Antoine Rivière' LIMIT 1`,
      [workspaceId],
    )
    // #2873 (29/09) — le NOT EXISTS ci-dessous seul est « vérifier puis écrire » : deux semis
    // concurrents passaient la garde et le second levait `submissions_unique` (reset failed).
    // D'où l'`ON CONFLICT DO NOTHING` en plus.
    const rejectedId = rejected[0]?.id
    if (rejectedId) {
      await this.notes.manager.query(
        `INSERT INTO submissions
           (workspace_id, project_id, consultant_id, stage, stage_entered_at, submitted_at,
            first_feedback_at, closed_at, outcome_reason, outcome_detail, owner_id)
         SELECT $1, $2, $3, 'rejected', now() - interval '40 days', now() - interval '55 days',
                now() - interval '45 days', now() - interval '40 days', 'skills',
                'Le client cherchait une expertise réseau que le profil n’a pas.', $4
          WHERE NOT EXISTS (
            SELECT 1 FROM submissions WHERE project_id = $2 AND consultant_id = $3)
         ON CONFLICT (project_id, consultant_id, coalesce(need_id, '00000000-0000-0000-0000-000000000000'::uuid))
           DO NOTHING`,
        [workspaceId, flagship.id, rejectedId, ownerUserId],
      )
    }
  }

  /**
   * #2288.2 — LA CONSERVATION, EN DÉMONSTRATION.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CES LIBELLÉS-LÀ, ET PAS DES NOMS INVENTÉS
   * ─────────────────────────────────────────────────────────────────────────
   * Un reçu dit « cet espace a fait vérifier ce LIBELLÉ, ce jour-là ». Les
   * libellés viennent donc des comptes DÉJÀ analysés de la salle : dans le
   * récit de la démonstration, ces comptes ont été analysés, et une analyse EST
   * la vérification. Inventer trois noms d'entreprise produirait des lignes que
   * l'écran ne peut jamais montrer — un semis vert sur un tableau vide, le
   * défaut exact que cette chaîne existe pour empêcher.
   *
   * ⚠️ On ne sème RIEN dans les quatre tables de la mémoire marché : elles sont
   * PARTAGÉES entre espaces concurrents (voir le bloc ⚠️⚠️ de
   * `demo-coverage.ts`). La liste des environnements compatibles reste donc le
   * corpus RÉEL ; les reçus ci-dessous éclairent les libellés qui s'y
   * recoupent, et les autres lignes disent « Non vérifié », ce qui est vrai et
   * ce que #2288.3 promet explicitement.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * TROIS ÉTATS, PARCE QU'UN SEUL NE MONTRERAIT RIEN
   * ─────────────────────────────────────────────────────────────────────────
   * Une vérification FRAÎCHE (conservée, sortie du coût), une VIEILLIE (le fait
   * redevient inconnu, la ligne reste) et une CORRIGÉE À LA MAIN (elle gagne,
   * aucune vérification automatique ne la reprend). Les dates sont relatives au
   * semis : elles ne vieillissent jamais.
   */
  private async seedMarketVerificationReceipts(
    workspaceId: string,
    ownerUserId: string,
    companyNames: readonly string[],
    now: number,
  ): Promise<void> {
    const day = 24 * 60 * 60 * 1000
    const scripted: readonly { daysAgo: number; outcome: 'verified' | 'unknown'; corrected: boolean }[] = [
      { daysAgo: 3, outcome: 'verified', corrected: false },
      { daysAgo: 95, outcome: 'verified', corrected: false },
      { daysAgo: 12, outcome: 'verified', corrected: true },
    ]
    for (const [index, plan] of scripted.entries()) {
      const companyName = companyNames[index]
      if (!companyName) continue
      const at = new Date(now - plan.daysAgo * day)
      await this.accounts.manager.query(
        `INSERT INTO market_verification_receipts
           (workspace_id, user_id, consultant_id, company_name, company_key, verified_at, outcome,
            credits_announced, corrected_by_user_id, corrected_at, archived_at)
         SELECT $1::uuid, $2::uuid, NULL, $3::text, $4::text, $5::timestamptz, $6::text,
                $7::integer, $8::uuid, $9::timestamptz, NULL
          WHERE NOT EXISTS (
            SELECT 1 FROM market_verification_receipts
             WHERE workspace_id = $1::uuid AND company_key = $4::text AND archived_at IS NULL
          )`,
        [
          workspaceId,
          ownerUserId,
          companyName,
          companyName.trim().toLowerCase(),
          at,
          plan.outcome,
          // Le coût ANNONCÉ, tel que la grille le dit — jamais un nombre écrit ici.
          plan.outcome === 'verified' ? creditCostOf('account_analysis') : null,
          plan.corrected ? ownerUserId : null,
          plan.corrected ? at : null,
        ],
      )
    }
  }

  /**
   * #3750.8 — les MORCEAUX citables (`rag_document_chunks`) des documents de la
   * salle qui portent des `units` (un classeur à onglets) : un morceau par
   * onglet, `chunk_index` dans l'ordre, sans embedding (la salle n'appelle
   * aucun fournisseur ; la recherche plein texte les trouve, comme en
   * production sans `EMBEDDING_API_KEY`). Même forme que ce qu'écrit le service
   * IA (`rag_chunks.write_document_chunks`).
   */
  private async seedRagDocumentChunks(
    savedRagDocuments: RagDocumentEntity[],
    ownerUserId: string,
    workspaceId: string,
  ): Promise<void> {
    for (const document of DEMO_RAG_DOCUMENTS) {
      if (!document.units?.length) continue
      const saved = savedRagDocuments.find(row => row.title === document.title)
      if (!saved?.id) continue
      for (const [index, unit] of document.units.entries()) {
        // Casts explicites : le type d'un paramètre se décide en SQL, jamais
        // sur la forme JS de la valeur.
        await this.ragDocuments.manager.query(
          `INSERT INTO rag_document_chunks (document_id, user_id, workspace_id, chunk_index, unit_label, content)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::text, $6::text)`,
          [saved.id, ownerUserId, workspaceId, index, unit.label, unit.content],
        )
      }
    }
  }
}
