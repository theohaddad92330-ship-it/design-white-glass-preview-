import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { EXTERNAL_SOURCE_DEADLINE_MS, timedSource, withDeadline } from './briefing-source-timing'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../account-facts/module-tokens'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm'
import {
  type AgendaEvent,
  type ChainBlocker,
  type CriticalRisk,
  type CriticalRiskKind,
  LONG_ABSENCE_DAYS,
  SINCE_LAST_VISIT_LINES,
  applyRoleFitFeedback,
  buildTaskAgenda,
  compileDayClosureTasks,
  type BriefingAction,
  type BriefingActionKind,
  type BriefingAgendaBlock,
  type BriefingBlockState,
  type BriefingMailBlock,
  type BriefingRoleFitPreferences,
  type BriefingTasksBlock,
  type ContactApolloDetails,
  type DailyBriefing,
  type DayClosure,
  type JobTrackingCard,
  type Task,
  type SinceLastVisitDigest,
  type SinceLastVisitLine,
  type WorkspaceRole,
  // #2147.5 (correctif 26/09 soir) — le job composite de Laura (#2276), pour
  // que « Aujourd'hui » lise AUSSI ce type de job réel (voir la note sur
  // `jobTrackingCardSchema`, `daily-briefing.ts`). Fonctions PURES : GA-07 ne
  // les compte pas (même remarque que `pipelineHealth` plus bas).
  LAURA_JOB_DEFINITION_KEY,
  lauraJobBriefSchema,
  lauraJobAwaitsApproval,
  lauraJobGesturesOf,
  lauraJobNextStepOf,
  lauraJobRemainingCredits,
  lauraJobProgressOf,
  lauraJobStateOf,
  lauraJobStepNeedsApproval,
  needStaffableNotRefusedSql,
  needStillOpenSql,
  daysUntilEnd,
  renewalWindow,
  renewalWindowBoundDays,
  resolveRenewalWindowDays,
  computeRfpCompliance,
  type RfpRequirement,
  // #2106.9/#2107.1/#2107.2 (épopée #2801) — LE MÊME diagnostic de pipe que
  // `ProjectPipelineService.health` (`project-pipeline.service.ts`), jamais
  // recalculé (GA-26). Importer CE service ferait monter GA-07 à son plafond
  // (276/276, zéro marge, mesuré le 25/09 — voir #2107.9/.11) ; les fonctions
  // PURES de `@bellum/contracts` n'y comptent pas, seule la requête SQL est
  // recopiée, à l'identique.
  pipelineHealth,
  type PipelineHealthRow,
  taskStillOpenSql,
  briefingActionSourceKey,
  financeScopeClause,
  hasPermission,
  portfolioScopeFor,
  type FinanceScope,
  assessInvoiceReadiness,
  expectsTimesheet,
  type ContractKind,
  type TimesheetStatus,
  type BillingCadence,
  type ProtectedTime,
  protectedTimeWorkdayHours,
  readProtectedTime,
  type AgendaPreferences,
  readAgendaPreferences,
  type AgendaSlotProposalPreview,
  readAgendaSlotRejections,
  readBriefingCardDispositions,
  withBriefingCardDisposition,
  excludeDisposedBriefingActions,
  type BriefingCardDispositionRequest,
  wasSlotRejectedToday,
  withAgendaSlotRejection,
  type SlotProposalPriorityAccount,
  type FocusPlanBlockOutcome,
  type FocusPlanBlockOutcomeRead,
  type MailThread,
  overdueDaysFromDueOn,
  agendaProviderSchema,
  mailboxProviderSchema,
  userRoleFramesTeam,
  REPLIES_TO_TREAT_REQUEST,
} from '@bellum/contracts'
import { unsettledInvoiceSql } from '../../common/invoice-settlement'
import { InFlight, ShortTtlCache } from '../../common/short-ttl-cache'
// #2107.9 / #2107.11 / #2107.16 — la dérivation PURE du statut CRA
// (`buildTimesheetLine`), pas le service `TimesheetsService` : importer le
// SERVICE ferait monter le cliquet GA-07 (`module-boundaries.spec.ts`, déjà à
// son plafond), alors que ce fichier n'est ni un service ni injecté — même
// raisonnement que `contactSourceTag` juste en dessous. `assessInvoiceReadiness`
// (`@bellum/contracts`, importé ci-dessus) EST déjà un contrat partagé.
import { buildTimesheetLine } from '../delivery/timesheet-view'
import type { DomainMatchableAccount } from '../agenda/meeting-account-domain-match'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AgendaBellumCreatedEventEntity } from '../../database/entities/agenda-bellum-created-event.entity'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { FocusPlanBlockOutcomeEntity } from '../../database/entities/focus-plan-block-outcome.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { NoteEntity } from '../../database/entities/note.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { WORKSPACE_SCOPE_COLUMN } from '../workspace/workspace-scoping'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { AgendaCreateResult, AgendaReadScope } from '../agenda/agenda-backend'
import { AgendaService } from '../agenda/agenda.service'
import { detectConflicts } from '../agenda/free-slots'
import { zonedDateKey } from '../agenda/time-zone'
// #2147.5 (correctif 26/09 soir) — même lien qu'une mention ou une assignation
// de carte (#1940.1/#1940.7) : une fonction pure, pas `IaProxyController`
// (GA-07 est à son plafond).
import { chatNotificationLink } from '../ia-proxy/chat-notification-link'
// La définition PARTAGÉE de « ce contact n'est plus chez ce compte » (`RISQUE`),
// appliquée par quatre modules. Ce n'est pas un service : l'importer ne fait pas
// monter le cliquet GA-07, et la recopier ferait diverger la cinquième lecture.
import { contactSourceTag } from '../analysis/contact-score'
import { ChainsService } from '../chains/chains.service'
import { DEMO_BELLUM_CREATED_EVENT_ID } from '../demo/demo-agenda'
import { demoBriefing } from '../demo/demo-briefing'
import { DEMO_OWNER } from '../demo/demo-dataset'
import type { MailboxReadScope } from '../mailbox/mailbox-backend'
import { MailboxService } from '../mailbox/mailbox.service'
import { looksLikeNonCommercialTravelDocument } from '../mailbox/no-reply'
import { salesImplicationForLabel, sourceLinkForLabel } from '../signal-history/signal-history.projection'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { TasksService } from '../tasks/tasks.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  AVAILABILITY_RECONFIRM_AFTER_DAYS,
  SUBMISSION_NO_RESPONSE_AFTER_DAYS,
  CONSULTANT_FREEING_SOON_DAYS,
  FRESH_SIGNAL_HOURS,
  MISSION_ENDING_SOON_DAYS,
  NEED_STALE_AFTER_DAYS,
  RFP_DUE_SOON_DAYS,
  buildAllBriefingActions,
  buildBriefingActions,
  CONTACT_LEFT_LOOKBACK_DAYS,
  excludeObjectsAlreadyTasked,
  MISSION_STARTING_SOON_DAYS,
  OTHER_INVOICE_BLOCKERS,
  type OtherInvoiceBlocker,
  MEETING_FOLLOWUP_LOOKBACK_HOURS,
  selectEndedMeetingsAwaitingFollowup,
  selectMeetingsToPrepare,
} from './briefing-actions'
import {
  RENEWAL_AT_RISK,
  freshSignalDetections,
  measuredLine,
  signalsDetectedSince,
  unmeasuredLine,
} from './since-last-visit'
import { resolveTimeZone } from './time-zone-input'
import { orderActionsForRole } from './briefing-role-order'

/**
 * La raison d'échec portée par l'exception, quand elle en porte une.
 *
 * Le service agenda distingue déjà « le fournisseur n'a pas répondu » de « son
 * API est éteinte » ; perdre cette distinction en chemin obligerait
 * l'utilisateur à attendre que ça repasse tout seul, ce qui n'arrivera pas.
 */
function failureReason(error: unknown): string {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.()
  const reason = (response as { reason?: unknown } | undefined)?.reason
  return typeof reason === 'string' && reason ? reason : 'agenda_unavailable'
}

// Un signal « frais » l'est depuis moins de 48 h (un brief du lundi doit voir le
// week-end) : `FRESH_SIGNAL_HOURS`, importé de `briefing-actions.ts`. Le nombre
// vivait ici, et la carte qui ANNONCE le critère à l'écran vit là-bas : deux
// copies auraient fini par dire « 48 h » sur une sélection à 72 h.
/** Silence par défaut avant de considérer qu'un fil demande une relance. */
const DEFAULT_SILENCE_DAYS = 7

/**
 * #4009 — une fiche supprimée est un soft delete : la ligne reste, avec ses
 * signaux, missions et runs. Le brief ne la cite JAMAIS (décision Louis 11/10,
 * #3670) — chaque lecture de `accounts` de ce fichier porte cette borne,
 * gardée par `briefing-deleted-accounts.spec.ts`. Même valeur que
 * `accounts.service.ts`.
 */
const UNCITED_ACCOUNT_STATUSES = ['deleted', 'archived'] as const

/** Perf 29/09/2026 — durée de retenue d'un bloc agenda / messagerie qui a répondu. */
const PROVIDER_BLOCK_TTL_MS = 60_000
/**
 * Combien de contacts ENRICHIS dans la fenêtre on examine pour la ligne
 * « changements de poste ».
 *
 * Une borne, parce que la règle `RISQUE` se décide en TypeScript sur
 * `raw_data` : sans elle, un import de dix mille contacts ferait charger dix
 * mille blobs pour une ligne de trois mots. Deux cents couvre très largement ce
 * qu'un enrichissement produit entre deux visites.
 *
 * Quand elle COUPE, la ligne passe `partial` et ne rend AUCUN nombre — pas un
 * total tronqué qui se lirait comme un total. C'est la même règle que le
 * `truncated` d'une recherche de messagerie : « la borne a coupé, ne crois pas
 * ce compte » plutôt qu'un chiffre faux qu'on ne peut pas contredire.
 */
const JOB_CHANGE_SCAN_LIMIT = 200

/**
 * #2106.9 (recette 26/09, tranché sans Louis) — combien de jours depuis
 * `stage_entered_at` avant qu'une affaire SANS prochaine action mérite la
 * carte « Aujourd'hui ». Un jour : le temps qu'un commercial pose la
 * prochaine action après avoir ouvert l'affaire, sans faire du bruit sur une
 * affaire créée il y a deux minutes.
 */
const PROJECT_NO_NEXT_ACTION_MIN_AGE_DAYS = 1

/**
 * #2770 (#2101.14) — combien de comptes de plus que `limit` on lit avant de
 * filtrer les refus du jour, pour que le classement rendu porte toujours
 * `limit` comptes tant qu'il en existe assez. Un filet, pas un cas attendu :
 * un commercial ne refuse pas dix comptes prioritaires le même jour.
 */
const AGENDA_SLOT_PROPOSAL_RANK_HEADROOM = 10

/**
 * LE BRIEF DU JOUR.
 *
 * Déclencheur n°1 des méta-analyses besoins et première démonstration de la
 * liste « ordre recommandé des démonstrations ». Il agrège trois sources déjà
 * servies ailleurs — l'agenda, la messagerie, les signaux des comptes suivis —
 * et n'en crée aucune : c'est un aiguilleur, pas une couche de données de plus.
 *
 * La discipline qui compte ici est celle des blocs manquants. Une source non
 * connectée, une portée absente ou une panne rendent un bloc VIDE assorti de sa
 * raison, jamais un brief tronqué qui se lirait « rien à faire aujourd'hui ».
 * C'est la traduction directe du garde-fou « ne pas halluciner un succès » et de
 * la règle produit « si Gmail n'est pas connecté, ne pas afficher Active ».
 *
 * Aucune de ces lectures ne consomme de crédit : elles n'appellent ni modèle ni
 * fournisseur de données payant.
 */
/**
 * #3973 — ce que le brief a le droit de LIRE pour un fil de Laura (« Outils et
 * sources ») : les messageries et agendas décochés. Passé par le SEUL pont
 * copilote ; l'écran et les routines n'en passent aucun (lecture inchangée).
 */
export type BriefingReadScope = { mailbox?: MailboxReadScope; agenda?: AgendaReadScope }

/** Tous les backends d'une famille exclus : rien à lire, sans même sonder. */
function excludesEvery(excluded: readonly string[] | undefined, all: readonly string[]): boolean {
  return all.every(provider => excluded?.includes(provider))
}

/** La clé de mémoire courte : celle d'avant sans exclusion, une clé PROPRE au périmètre sinon. */
function scopedCacheKey(userId: string, excluded: readonly string[] | undefined): string {
  return excluded?.length ? `u:${userId}|x:${[...excluded].sort().join(',')}` : `u:${userId}`
}

/** Théo A today-jour — les deux champs de lien d'un signal ; `null`/`null` quand le signal n'a pas d'URL vérifiable. */
function sourceLinkFields(
  recentSignals: unknown,
  label: string | null,
): { signalSourceUrl: string | null; signalSourceKind: string | null } {
  const link = label ? sourceLinkForLabel(recentSignals, label) : null
  return { signalSourceUrl: link?.url ?? null, signalSourceKind: link?.kind ?? null }
}

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name)

  /**
   * Perf 29/09/2026 (`GET /briefing/today` 8,5 s, `/briefing/actions` 5,7 s) —
   * `build()` / `allActions()` lancent ~25 producteurs EN PARALLÈLE, et chacun
   * résolvait pour lui-même l'espace actif (2 à 4 requêtes sur un pool de 10) :
   * ~19 résolutions, ~60 requêtes, pour UNE réponse. Les appels CONCURRENTS de
   * la même personne partagent une résolution ; rien n'est retenu une fois
   * finie (`InFlight`, pas de TTL) — un changement d'espace ou de rôle vaut dès
   * l'appel suivant, jamais une valeur périmée.
   */
  private readonly workspaceInFlight = new InFlight<{ workspaceId: string; role: WorkspaceRole }>()

  /**
   * Perf 29/09/2026 — l'agenda et la messagerie sont des appels SORTANTS chez le
   * fournisseur (Calendar, Gmail : 1 + 3 recherches) sur le chemin de LECTURE, à
   * chaque ouverture de /briefing, /actions et du tableau de bord. Un bloc qui
   * a RÉPONDU (`ready`) est retenu 60 s par personne ; jamais un bloc dégradé
   * (non connecté, portée manquante, partiel, en panne) : se connecter ou
   * réessayer se voit tout de suite, et `readAt` garde l'instant de la vraie
   * lecture (jamais une heure devinée). Clé : la personne — la connexion à la
   * boîte et à l'agenda est personnelle, indépendante de l'espace.
   */
  private readonly agendaStatusInFlight = new InFlight<Awaited<ReturnType<AgendaService['status']>>>()
  private readonly mailboxStatusInFlight = new InFlight<Awaited<ReturnType<MailboxService['status']>>>()
  private readonly pastEventsCache = new ShortTtlCache<Awaited<ReturnType<AgendaService['listEventsDetailed']>>>(
    PROVIDER_BLOCK_TTL_MS,
  )
  private readonly agendaBlockCache = new ShortTtlCache<BriefingAgendaBlock>(PROVIDER_BLOCK_TTL_MS)
  private readonly mailBlockCache = new ShortTtlCache<BriefingMailBlock>(PROVIDER_BLOCK_TTL_MS)

  constructor(
    private readonly agenda: AgendaService,
    private readonly mailbox: MailboxService,
    private readonly signalHistory: SignalHistoryService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    // Les quatre tables que les cinq lignes « depuis ta dernière visite »
    // lisent. On lit le SCHÉMA plutôt que le service du module voisin : le
    // cliquet GA-07 est à son plafond, et `RoutinesModule`/`PlaybooksModule`
    // importent déjà `BriefingModule` — les leur importer ferait un cycle.
    // ⚠️ Toute entité injectée ici DOIT être déclarée dans `briefing.module.ts`
    // (GA-20) : l'oubli ne casse aucun test unitaire et empêche l'API de
    // démarrer en production.
    @InjectRepository(ActivityEntity) private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(InterventionEntity) private readonly interventions: Repository<InterventionEntity>,
    // #2803 (#2389.4) — Opportunités : `attack_angles` avait 0 référence dans
    // ce module. Même pattern, même raison (GA-07) : `AnalysisModule` n'importe
    // pas `BriefingModule` aujourd'hui, mais `AttackAnglesService` porte des
    // dépendances au-delà du simple compte par fenêtre — importer le service
    // pour UN `count()` ferait monter le cliquet pour rien.
    @InjectRepository(AttackAngleEntity) private readonly attackAngles: Repository<AttackAngleEntity>,
    // #2803 (#2389.4) — Travaux nocturnes : `RoutineRunEntity` tourne déjà
    // (`RoutinesService`) mais n'était lu par AUCUNE des douze sources du
    // brief. Même pattern GA-07 que `attackAngles` juste au-dessus : lire le
    // SCHÉMA plutôt qu'importer `RoutinesModule`, qui importe déjà
    // `BriefingModule` (le cycle serait immédiat).
    @InjectRepository(RoutineRunEntity) private readonly routineRuns: Repository<RoutineRunEntity>,
    // #2397.7 — le sac de préférences personnelles (`user_preferences`),
    // injecté en ENTITÉ (voir le docblock de `briefing.module.ts`).
    @InjectRepository(UserPreferenceEntity) private readonly userPreferences: Repository<UserPreferenceEntity>,
    // #2106.30 (épopée #2802) — les actions du plan, pour compter celles dont
    // la `due_date` a expiré sans être traitées. Même pattern GA-07/GA-20 que
    // les entités ci-dessus (le cliquet est à son plafond) : lire le schéma
    // plutôt qu'importer `ActionsModule`.
    @InjectRepository(ActionPlanItemEntity) private readonly actionPlanItems: Repository<ActionPlanItemEntity>,
    // #2106.31 (épopée #2802) — le journal `user_actions`, pour un agrégat
    // SERVEUR sur la fenêtre entière (« traité par un collègue ») — jamais un
    // filtre posé sur les lignes déjà tronquées que `ActionsService` sert au
    // Journal.
    @InjectRepository(UserActionEntity) private readonly userActions: Repository<UserActionEntity>,
    // #2147.5 (correctif 26/09 soir) — le job composite de Laura (`laura_job`,
    // #2276) vit sur `workflow_runs`. Même pattern GA-07 : entité, pas
    // `LauraJobService` (`ActionOsModule` porte bien plus que ce dont la carte
    // de suivi a besoin).
    @InjectRepository(WorkflowRunEntity) private readonly workflowRuns: Repository<WorkflowRunEntity>,
    // #2095.12 (épopée #2993) — « ce rendez-vous a-t-il une note ? »
    // (`notes.source_event_id`, #2103.1). Même pattern GA-07 que les entités
    // ci-dessus : le schéma, pas `NotesService`.
    @InjectRepository(NoteEntity) private readonly meetingNotes: Repository<NoteEntity>,
    // #2770 (#2101.19/.21/.22/.37) — la preuve locale qu'un évènement a été
    // écrit par `confirmSlotProposal`, pour que la grille/le plateau
    // d'agenda partagés distinguent une suggestion BellumAI sans round-trip
    // `extendedProperties` chez le fournisseur.
    @InjectRepository(AgendaBellumCreatedEventEntity)
    private readonly bellumCreatedEvents: Repository<AgendaBellumCreatedEventEntity>,
    // #2770.63/.64/.65 (#2391.51/.52/.53) — la mesure post-bloc d'un plan de
    // journée, sur le même identifiant que `confirmFocusPlanBlock` rend.
    @InjectRepository(FocusPlanBlockOutcomeEntity)
    private readonly focusPlanBlockOutcomes: Repository<FocusPlanBlockOutcomeEntity>,
    // Optionnel : le brief doit continuer de s'afficher si le module des tâches
    // est retiré (règle #7). Absent, le bloc le DIT plutôt que d'afficher une
    // liste vide qui se lirait « rien à faire aujourd'hui ».
    @Optional() private readonly tasksService?: TasksService,
    /**
     * Les parcours. `@Optional()` pour la même raison que les tâches : retirer
     * le module des parcours (règle #7) doit retirer un bloc du brief, pas
     * empêcher le brief de s'afficher.
     */
    @Optional() private readonly chains?: ChainsService,
    /** #3386 — le rôle MÉTIER déclaré (`esn_profiles.user_role`). Optionnel :
     *  des specs construisent ce service sans lui (même discipline que
     *  `chains`) ; sans lui, aucun rôle n'est deviné. */
    @Optional() @InjectRepository(EsnProfileEntity) private readonly esnProfiles?: Repository<EsnProfileEntity>,
    // #4068.6 — le lecteur unique des faits du compte, par sa PORTE (GA-07 : jamais le service d'un autre
    // module). Optionnel : sans lui, la carte « compte à surveiller » garde tout le reste.
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
  ) {}

  /**
   * @param clientTimeZone Le fuseau du NAVIGATEUR, envoyé par le client à
   *   CHAQUE appel — jamais stocké. `undefined` (l'écran n'en envoie pas
   *   encore, ou un identifiant illisible) retombe sur
   *   {@link resolveTimeZone}'s default, à l'identique du comportement
   *   d'avant ce paramètre : AUCUN appelant existant ne change de résultat.
   */
  async build(
    userId: string,
    now: Date = new Date(),
    clientTimeZone?: string | null,
    readAs?: WorkspaceRole | null,
    businessRole?: string | null,
    readScope: BriefingReadScope = {},
  ): Promise<DailyBriefing> {
    const timeZone = resolveTimeZone(clientTimeZone)
    // #3386 — l'écran et Laura parlent du même ordre : sans rôle transmis, on lit
    // celui que la personne a DÉCLARÉ (profil), jamais un rôle deviné.
    const declaredRole = businessRole ?? (await this.declaredBusinessRole(userId))
    const readsAs = userRoleFramesTeam(declaredRole) ? (readAs ?? null) : null

    // Salle de démonstration : un visiteur ne branche pas sa boîte Gmail sur un
    // lien qu'on lui a envoyé. Sans ce chemin, l'écran s'ouvrirait sur « aucune
    // messagerie connectée » devant un prospect — deux écrans livrés, deux
    // écrans vides. Le jeu est fictif et le montre (adresses `.example`).
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return this.buildDemo(userId, now, timeZone, readAs)
    }

    // #4293.11 — chaque source est mesurée (`briefing.source name=… ms=…`) : la plus lente se lit au journal.
    const src = <T>(name: string, load: Promise<T>): Promise<T> => timedSource(this.logger, name, load)
    const [
      profile,
      agendaBlock,
      mailBlock,
      tasksBlock,
      accountsToWatch,
      chainBlockers,
      criticalRisks,
      role,
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      roleFit,
      protectedTime,
      agendaPreferences,
      missionsEndingSoon,
      consultantsFreeingSoon,
      availabilityToReconfirm,
      missionsWithoutEndDate,
      brokenConnectors,
      renewalsNotEngaged,
      submissionsWithoutResponse,
      rfpsWithUncoveredRequirements,
      accountsWithoutOwner,
      projectHealth,
      invoicingCards,
      runningJobs,
      contactsBounced,
      meetingsWithoutFollowup,
      engineCards,
    ] = await Promise.all([
      src('profiles.findOne', this.profiles.findOne({ where: { user_id: userId } })),
      // #4293.11 — les deux sources EXTERNES sont bornées : passé le délai, le bloc dit « indisponible » (raison
      // nommée) et l'écran rend tout le reste au lieu d'attendre la plus lente.
      src(
        'buildAgendaBlock',
        withDeadline(this.buildAgendaBlock(userId, now, readScope.agenda), EXTERNAL_SOURCE_DEADLINE_MS, () => ({
          state: 'unavailable' as const,
          reason: 'agenda_timeout',
          readAt: null,
          events: [],
          conflicts: [],
          needsPreparation: [],
          unfollowedMeetings: [],
        })),
      ),
      src(
        'buildMailBlock',
        withDeadline(this.buildMailBlock(userId, now, readScope.mailbox), EXTERNAL_SOURCE_DEADLINE_MS, () => ({
          state: 'unavailable' as const,
          reason: 'mailbox_timeout',
          readAt: null,
          awaitingReply: [],
          unread: [],
          positiveReplies: [],
        })),
      ),
      src('buildTasksBlock', this.buildTasksBlock(userId, now)),
      src('buildAccountsToWatch', this.buildAccountsToWatch(userId, now)),
      src('buildChainBlockers', this.buildChainBlockers(userId)),
      src('buildCriticalRisks', this.buildCriticalRisks(userId, now)),
      src('readRole', this.readRole(userId)),
      src('buildStaleNeeds', this.buildStaleNeeds(userId)),
      src('buildMissionsEnding', this.buildMissionsEnding(userId)),
      src('buildOverdueInvoices', this.buildOverdueInvoices(userId, now)),
      src('buildRfpsDueSoon', this.buildRfpsDueSoon(userId)),
      src('readRoleFit', this.readRoleFit(userId)),
      src('readProtectedTime', this.readProtectedTime(userId)),
      src('readAgendaPreferences', this.readAgendaPreferences(userId)),
      src('buildMissionsEndingSoon', this.buildMissionsEndingSoon(userId, now)),
      src('buildConsultantsFreeingSoon', this.buildConsultantsFreeingSoon(userId, now)),
      src('buildAvailabilityToReconfirm', this.buildAvailabilityToReconfirm(userId)),
      src('buildMissionsWithoutEndDate', this.buildMissionsWithoutEndDate(userId)),
      src('buildBrokenConnectors', this.buildBrokenConnectors(userId)),
      src('buildRenewalsNotEngaged', this.buildRenewalsNotEngaged(userId, now)),
      src('buildSubmissionsWithoutResponse', this.buildSubmissionsWithoutResponse(userId)),
      src('buildRfpsWithUncoveredRequirements', this.buildRfpsWithUncoveredRequirements(userId)),
      src('buildAccountsWithoutOwner', this.buildAccountsWithoutOwner(userId)),
      // #2106.9/#2107.1/#2107.2 (doublon, épopée #2801) — même raison que
      // `buildAccountsWithoutOwner` juste au-dessus : sans cette ligne, la
      // lecture reste faite mais n'atteint jamais l'appelant réel.
      src('buildProjectHealth', this.buildProjectHealth(userId, now)),
      src('buildInvoicingCards', this.buildInvoicingCards(userId, now)),
      src('buildRunningJobs', this.buildRunningJobs(userId)),
      // #2095.41 (épopée #2993) — même raison : sans cette ligne,
      // `buildContactsBounced` est lu mais n'atteint jamais l'appelant réel.
      src('buildContactsBounced', this.buildContactsBounced(userId)),
      // #2095.12 (épopée #2993) — même raison : sans cette ligne,
      // `buildMeetingsWithoutFollowup` est lu mais n'atteint jamais l'appelant
      // réel.
      src('buildMeetingsWithoutFollowup', this.buildMeetingsWithoutFollowup(userId, now, readScope.agenda)),
      // L1 (31/10/2026) — les cinq lectures du moteur de cartes : sans cette
      // ligne, elles seraient écrites et jamais appelées.
      src('buildEngineCards', this.buildEngineCards(userId)),
    ])
    // #2095.60 — l'angle déjà calculé des comptes qui ont bougé.
    const angles = await src(
      'readAngles',
      this.readAngles(
        userId,
        accountsToWatch.map(entry => entry.accountId),
      ),
    )

    const actions = buildBriefingActions({
      now,
      meetings: agendaBlock.needsPreparation,
      conflicts: agendaBlock.conflicts,
      awaitingReply: mailBlock.awaitingReply,
      unread: mailBlock.unread,
      positiveReplies: mailBlock.positiveReplies,
      missionsEndingSoon,
      // #2106.6 — sans cette ligne, `buildConsultantsFreeingSoon` est lu mais
      // n'atteint jamais l'appelant réel : la carte ne peut jamais apparaître.
      consultantsFreeingSoon,
      // #2107.6 — même raison : sans cette ligne, `buildAvailabilityToReconfirm`
      // est lu mais n'atteint jamais l'appelant réel.
      availabilityToReconfirm,
      // #2107.8 — même raison : sans cette ligne, `buildMissionsWithoutEndDate`
      // est lu mais n'atteint jamais l'appelant réel.
      missionsWithoutEndDate,
      // #2107.15 — même raison : sans cette ligne, `buildBrokenConnectors` est
      // lu mais n'atteint jamais l'appelant réel.
      brokenConnectors,
      // #2107.10 — même raison : sans cette ligne, `buildRenewalsNotEngaged`
      // est lu mais n'atteint jamais l'appelant réel.
      renewalsNotEngaged,
      // #2107.4 — même raison : sans cette ligne, `buildSubmissionsWithoutResponse`
      // est lu mais n'atteint jamais l'appelant réel.
      submissionsWithoutResponse,
      // #2107.14 — même raison : sans cette ligne, `buildRfpsWithUncoveredRequirements`
      // est lu mais n'atteint jamais l'appelant réel.
      rfpsWithUncoveredRequirements,
      // #2107.18 — même raison : sans cette ligne, `buildAccountsWithoutOwner`
      // est lu mais n'atteint jamais l'appelant réel.
      accountsWithoutOwner,
      // #2106.9/#2107.1/#2107.2 — même raison : sans cette ligne,
      // `buildProjectHealth` est lu mais n'atteint jamais l'appelant réel.
      projectsWithoutNextAction: projectHealth.withoutNextAction,
      staleProjects: projectHealth.stale,
      // #2107.9/#2107.11/#2107.16 — même raison : sans ces trois lignes,
      // `buildInvoicingCards` est lu mais n'atteint jamais l'appelant réel.
      craMissing: invoicingCards.craMissing,
      invoicesReady: invoicingCards.invoicesReady,
      invoicingBlockedMissingData: invoicingCards.invoicingBlockedMissingData,
      // #2095.41 — même raison : sans cette ligne, `buildContactsBounced` est
      // lu mais n'atteint jamais l'appelant réel.
      contactsBounced,
      // #2095.12 — même raison : sans cette ligne, `buildMeetingsWithoutFollowup`
      // est lu mais n'atteint jamais l'appelant réel.
      meetingsWithoutFollowup,
      // L1 — #2095.6 (facture bloquée), #2095.10/#2095.45/#2095.41 (donnée
      // critique, démarrage, avenant, contact parti).
      invoicesBlocked: invoicingCards.invoicesBlocked,
      ...engineCards,
      accountsWithFreshSignal: accountsToWatch.map(entry => ({
        accountId: entry.accountId,
        companyName: entry.companyName,
        detectedAt: entry.detectedAt,
        detectionExact: entry.detectionExact,
        signalLabel: entry.signalLabel,
        logoUrl: entry.logoUrl,
        website: entry.website,
        // #2095.60 — l'angle déjà calculé, jamais rédigé ici.
        angle: angles.get(entry.accountId) ?? null,
      })),
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      roleFit,
      // #2095.19 / #2993 — `owner` de chaque carte : le brief reste
      // strictement individuel, donc toujours SON lecteur.
      ownerId: userId,
    })

    return {
      date: zonedDateKey(now, timeZone),
      timeZone,
      firstName: profile?.first_name?.trim() || null,
      // #2095.12 (épopée #2993) — `unfollowedMeetings` REJOINT le bloc agenda :
      // même bassin de résolution que `events` côté écran (`BriefingPage.tsx`,
      // `meetingEventFromActionId`), jamais une seconde lecture.
      agenda: { ...agendaBlock, unfollowedMeetings: meetingsWithoutFollowup },
      mail: mailBlock,
      // #2387.7 — la MÊME lecture que la carte #2107.4, exposée à l'écran pour
      // la section « en attente des autres ».
      awaitingClientProfiles: submissionsWithoutResponse,
      tasks: tasksBlock,
      protectedTime,
      agendaPreferences,
      accountsToWatch,
      // #2151.23 / #2151.61 — les alertes de Découvrir sont posées PAR-DESSUS,
      // par `BriefingController.today()` : elles se lisent sur l'ESPACE, alors
      // que tout ce service se construit sur l'utilisateur. Le défaut est vide
      // et la date `null` — « aucun déclenchement », jamais « 0 alerte ».
      discoverAlerts: [],
      discoverAlertsLastEventAt: null,
      chainBlockers,
      criticalRisks,
      runningJobs,
      // #1936.11 — LE BRIEF VARIE SELON LE RÔLE, PAR L'ORDRE SEUL.
      //
      // Arbitré par Louis le 16/09/2026 : tout le monde voit les mêmes faits ;
      // un commercial ouvre sur ses comptes et ses relances, un manager sur les
      // écarts, un dirigeant sur le pipe et la charge. `orderActionsForRole`
      // lui-même reste un ordonnancement, jamais un filtrage (la raison du
      // « après la troncature » est dans `briefing-role-order.ts`) — le retrait
      // juste avant (#2105.53) est d'une autre nature : il retire une carte déjà
      // transformée en tâche pour TOUT LE MONDE, avant que le rôle n'entre en jeu.
      actions: orderActionsForRole(
        await this.excludeDisposed(
          userId,
          now,
          // #2095.74 — un objet déjà dans la journée par une tâche n'est pas
          // aussi une priorité.
          excludeObjectsAlreadyTasked(this.excludeAlreadyTransformed(actions, tasksBlock.tasks), tasksBlock.tasks, now),
        ),
        // décision Louis 12/10 — « Lire comme » dans le produit : seul un rôle qui ENCADRE peut lire dans l'ordre
        // d'un autre rôle ; pour tout autre, `readAs` est ignoré. L'ordre seul change (c76), jamais le contenu.
        readsAs ?? role,
        // #3386 — le rôle métier déclaré (transmis par Laura, sinon lu au profil) réordonne aussi.
        readsAs ? null : declaredRole,
      ),
      generatedAt: now.toISOString(),
    }
  }

  /** #3386 — l'intitulé de poste déclaré, `null` si absent ou illisible (jamais deviné). */
  private async declaredBusinessRole(userId: string): Promise<string | null> {
    try {
      const row = await this.esnProfiles?.findOne({ where: { user_id: userId }, select: ['user_role'] })
      return row?.user_role?.trim() || null
    } catch (error) {
      this.logger.warn(`Briefing: rôle métier illisible — ${(error as Error).message}`)
      return null
    }
  }

  /**
   * #2107 (Centre d'actions) — TOUTES LES ACTIONS CANDIDATES, JAMAIS
   * PLAFONNÉES.
   *
   * `build()` classe le même ensemble mais le TRONQUE à `BRIEFING_ACTIONS_MAX`
   * (`buildBriefingActions` → `protectFromFollowUpEviction`) : mesuré en
   * recette écran le 25/09/2026 (prod `1371ef9d38`, #2107.4/#2107.8/#2107.14)
   * — un jour ordinaire (4 `payment_overdue` + 1 `mission_end` + 2 e-mails)
   * suffit à remplir les sept places et évince en SILENCE les genres de
   * priorité 12-17 (mission sans date, profil sans retour, exigence AO non
   * couverte, compte sans owner…), qui n'apparaissent alors JAMAIS nulle
   * part — ni sur le brief, ni sur `/actions`, qui relisait la même liste
   * déjà tronquée. Un déclencheur qu'on ne voit jamais n'existe pas pour
   * l'utilisateur.
   *
   * Appelle `buildAllBriefingActions` — la MÊME fonction pure que `build()`
   * (jamais une seconde dérivation) — sans le plafond final, puis le MÊME
   * `orderActionsForRole` : le rang d'une carte partagée par les deux écrans
   * ne diverge jamais entre eux.
   *
   * Bornée par construction : chaque lecture qui alimente l'ensemble porte
   * déjà sa propre limite SQL raisonnable (`LIMIT 20`/`LIMIT 50`…, les mêmes
   * que celles qui nourrissent `build()`). En ajouter une seconde ici
   * recréerait exactement le défaut que ce point corrige.
   *
   * ⚠️ Le câblage (quels producteurs appeler, avec quelles données) est
   * VOLONTAIREMENT le même que `build()`/`buildDemo()`, dupliqué comme ces
   * deux méthodes le sont déjà l'une de l'autre dans ce service — jamais la
   * DÉRIVATION elle-même, qui reste unique dans `buildAllBriefingActions`.
   */
  async allActions(userId: string, now: Date = new Date()): Promise<BriefingAction[]> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return this.allActionsDemo(userId, now)
    }

    const [
      agendaBlock,
      mailBlock,
      tasksBlock,
      accountsToWatch,
      role,
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      roleFit,
      missionsEndingSoon,
      consultantsFreeingSoon,
      availabilityToReconfirm,
      missionsWithoutEndDate,
      brokenConnectors,
      renewalsNotEngaged,
      submissionsWithoutResponse,
      rfpsWithUncoveredRequirements,
      accountsWithoutOwner,
      invoicingCards,
      contactsBounced,
      meetingsWithoutFollowup,
      engineCards,
    ] = await Promise.all([
      this.buildAgendaBlock(userId, now),
      this.buildMailBlock(userId, now),
      // #2105.53 (correctif) — pour `excludeAlreadyTransformed` ci-dessous ;
      // même lecture que `build()`, jamais une seconde requête ad hoc.
      this.buildTasksBlock(userId, now),
      this.buildAccountsToWatch(userId, now),
      this.readRole(userId),
      this.buildStaleNeeds(userId),
      this.buildMissionsEnding(userId),
      this.buildOverdueInvoices(userId, now),
      this.buildRfpsDueSoon(userId),
      this.readRoleFit(userId),
      this.buildMissionsEndingSoon(userId, now),
      this.buildConsultantsFreeingSoon(userId, now),
      this.buildAvailabilityToReconfirm(userId),
      this.buildMissionsWithoutEndDate(userId),
      this.buildBrokenConnectors(userId),
      this.buildRenewalsNotEngaged(userId, now),
      this.buildSubmissionsWithoutResponse(userId),
      this.buildRfpsWithUncoveredRequirements(userId),
      this.buildAccountsWithoutOwner(userId),
      this.buildInvoicingCards(userId, now),
      this.buildContactsBounced(userId),
      this.buildMeetingsWithoutFollowup(userId, now),
      this.buildEngineCards(userId),
    ])
    const angles = await this.readAngles(
      userId,
      accountsToWatch.map(entry => entry.accountId),
    )

    const candidates = buildAllBriefingActions({
      now,
      meetings: agendaBlock.needsPreparation,
      conflicts: agendaBlock.conflicts,
      awaitingReply: mailBlock.awaitingReply,
      unread: mailBlock.unread,
      positiveReplies: mailBlock.positiveReplies,
      missionsEndingSoon,
      consultantsFreeingSoon,
      availabilityToReconfirm,
      missionsWithoutEndDate,
      brokenConnectors,
      renewalsNotEngaged,
      submissionsWithoutResponse,
      rfpsWithUncoveredRequirements,
      accountsWithoutOwner,
      craMissing: invoicingCards.craMissing,
      invoicesReady: invoicingCards.invoicesReady,
      invoicingBlockedMissingData: invoicingCards.invoicingBlockedMissingData,
      contactsBounced,
      meetingsWithoutFollowup,
      // L1 — #2095.6 (facture bloquée), #2095.10/#2095.45/#2095.41 (donnée
      // critique, démarrage, avenant, contact parti).
      invoicesBlocked: invoicingCards.invoicesBlocked,
      ...engineCards,
      accountsWithFreshSignal: accountsToWatch.map(entry => ({
        accountId: entry.accountId,
        companyName: entry.companyName,
        detectedAt: entry.detectedAt,
        detectionExact: entry.detectionExact,
        signalLabel: entry.signalLabel,
        logoUrl: entry.logoUrl,
        website: entry.website,
        // #2095.60 — l'angle déjà calculé, jamais rédigé ici.
        angle: angles.get(entry.accountId) ?? null,
      })),
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      roleFit,
      ownerId: userId,
    })

    return orderActionsForRole(
      await this.excludeDisposed(
        userId,
        now,
        // #2095.74 — même retrait qu'au brief.
        excludeObjectsAlreadyTasked(
          this.excludeAlreadyTransformed(candidates, tasksBlock.tasks),
          tasksBlock.tasks,
          now,
        ),
      ),
      role,
      await this.declaredBusinessRole(userId),
    )
  }

  /**
   * #2105.53 (correctif) — retire du brief les cartes déjà transformées en
   * tâche OUVERTE (`briefingActionSourceKey`, `@bellum/contracts`).
   *
   * Avant cette tranche, la garde de dédup ne vivait QUE côté client
   * (`briefingActionHasOpenTask`, `apps/web`) : elle annotait la carte
   * « déjà transformée » plutôt que la retirer, et la carte restait affichée
   * À CÔTÉ de la tâche qu'elle a produite — exactement le doublon que le
   * critère de recette d'origine refuse (#2105 : « pas de tâche dupliquée
   * entre priorités et liste »). Cette méthode retire la carte à la SOURCE ;
   * la garde client reste (défense en profondeur pour une tâche créée avant
   * cette tranche, ou par un appelant qui ne poserait pas `sourceLabelKey`).
   *
   * Comparaison sur la clé de libellé — jamais le texte traduit, l'API n'a
   * pas de dictionnaire de traduction (voir `briefing-labels.spec.ts`).
   *
   * PURE : prend les tâches ouvertes déjà lues par l'appelant plutôt que de
   * les relire (`build()`/`buildDemo()` les ont déjà via `buildTasksBlock` —
   * une seconde lecture serait une requête de plus pour la même réponse).
   */
  private excludeAlreadyTransformed(candidates: BriefingAction[], openTasks: readonly Task[]): BriefingAction[] {
    const occupied = new Set(
      openTasks
        .filter((t): t is Task & { sourceLabelKey: string } => t.sourceLabelKey !== null)
        .map(t => `${t.sourceLabelKey}::${t.accountId ?? t.contactId ?? ''}`),
    )
    if (occupied.size === 0) return candidates
    return candidates.filter(action => {
      const linkedId =
        action.businessObject?.kind === 'account' || action.businessObject?.kind === 'contact'
          ? action.businessObject.id
          : null
      return !occupied.has(`${briefingActionSourceKey(action)}::${linkedId ?? ''}`)
    })
  }

  /**
   * #2107 — même ensemble non plafonné, pour la salle de démonstration.
   *
   * Câblage IDENTIQUE à `buildDemo()` (mêmes producteurs, mêmes données
   * seedées) — volontairement PAS `missionsEndingSoon`/`consultantsFreeingSoon`/
   * `availabilityToReconfirm`/`brokenConnectors`/`roleFit` : `buildDemo()` ne
   * les appelle pas non plus (`buildBrokenConnectors` afficherait une panne
   * permanente sur un connecteur que la salle refuse par construction — voir
   * son docblock). La parité démo porte sur ce que `/briefing/today` sait
   * déjà montrer en salle, jamais sur un ensemble plus large inventé ici.
   *
   * ⚠️ #2107.9/#2107.11/#2107.16 — `buildInvoicingCards` (CRA manquant,
   * facture prête, donnée bloquante) est ABSENT ici pour la MÊME famille de
   * raison : sa portée est TOUJOURS « les miennes » (`financeScopeClause`,
   * scope `own` sur l'utilisateur appelant), alors que la salle de démo
   * provisionne un utilisateur FRAIS à chaque visite — le jeu de données
   * (`demo-dataset.ts`, missions à `owner_id`/compte assignés à la persona de
   * démo canonique) ne correspondrait à AUCUNE visite, et la carte
   * n'apparaîtrait jamais, silencieusement. Seeder spécifiquement pour cette
   * portée romprait le jeu déjà réglé de `demo-account-invoice-readiness-coverage.spec.ts`
   * et `mission-scores-axis-without-data.spec.ts`, qui tiennent chacun un état
   * précis de `mission_timesheets`/`mission_commercial_terms` pour d'autres
   * écrans. Retenu, raison écrite plutôt qu'un silence.
   */
  private async allActionsDemo(userId: string, now: Date): Promise<BriefingAction[]> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    const { workspaceId, role } = await this.resolveWorkspace(userId)
    const seeded = await this.accounts.find({
      where: { workspace_id: workspaceId, status: Not(In([...UNCITED_ACCOUNT_STATUSES])) },
      // #2097.21 (correctif) — `website` en plus : les cinq dossiers de la
      // salle portent de VRAIES sociétés (SNCF, Société Générale…), avec leur VRAI
      // site — `logo_url`, lui, reste `null` à dessein (doctrine
      // `demo-dataset.ts` : on ne persiste pas la marque d'un tiers). Le
      // favicon réel qu'un site sert publiquement n'est pas concerné par
      // cette règle, exactement comme sur `/accounts` en salle.
      select: ['id', 'company_name', 'website'],
      // #3287 reste (30/09/2026, recette prod) — SANS cet `order`, Postgres
      // ne garantit rien sur les trois lignes rendues : `DemoSeedService`
      // écrit les comptes un par un (`for (const dossier of DEMO_DOSSIERS)`),
      // donc `created_at` croît dans le MÊME ordre que le semis — c'est ce
      // que « les trois premiers dossiers » veut dire (`demo-dataset.ts`,
      // docblock `DEMO_DOSSIERS`), jamais un ordre physique qui peut changer
      // d'un balayage à l'autre sans qu'aucun test ne rougisse.
      order: { created_at: 'ASC' },
      take: 3,
    })
    const briefing = demoBriefing({
      now,
      timeZone: resolveTimeZone(undefined),
      // Salle démo : la persona, jamais le prénom du compte réel qui la visite (R21-FIX, 15/10).
      firstName: DEMO_OWNER.first_name,
      accounts: seeded.map(account => ({
        accountId: account.id,
        companyName: account.company_name,
        website: account.website ?? null,
      })),
    })

    const [
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      missionsWithoutEndDate,
      renewalsNotEngaged,
      submissionsWithoutResponse,
      rfpsWithUncoveredRequirements,
      accountsWithoutOwner,
      tasksBlock,
      contactsBounced,
      meetingsWithoutFollowup,
      engineCards,
    ] = await Promise.all([
      this.buildStaleNeeds(userId),
      this.buildMissionsEnding(userId),
      this.buildOverdueInvoices(userId, now),
      this.buildRfpsDueSoon(userId),
      this.buildMissionsWithoutEndDate(userId),
      this.buildRenewalsNotEngaged(userId, now),
      this.buildSubmissionsWithoutResponse(userId),
      this.buildRfpsWithUncoveredRequirements(userId),
      this.buildAccountsWithoutOwner(userId),
      // #2105.53 (correctif) — pour `excludeAlreadyTransformed` ci-dessous.
      this.buildTasksBlock(userId, now),
      this.buildContactsBounced(userId),
      this.buildMeetingsWithoutFollowup(userId, now),
      // L1 — les lectures du moteur passent sur le jeu SEMÉ de la salle,
      // comme en production (craft rule n°9).
      this.buildEngineCards(userId),
    ])

    const candidates = buildAllBriefingActions({
      now,
      meetings: briefing.agenda.needsPreparation,
      conflicts: briefing.agenda.conflicts,
      awaitingReply: briefing.mail.awaitingReply,
      unread: briefing.mail.unread,
      positiveReplies: briefing.mail.positiveReplies,
      accountsWithFreshSignal: briefing.accountsToWatch.map(entry => ({
        accountId: entry.accountId,
        companyName: entry.companyName,
        detectedAt: entry.detectedAt,
        detectionExact: entry.detectionExact,
        signalLabel: entry.signalLabel,
        logoUrl: entry.logoUrl,
        website: entry.website,
      })),
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      missionsWithoutEndDate,
      renewalsNotEngaged,
      submissionsWithoutResponse,
      rfpsWithUncoveredRequirements,
      accountsWithoutOwner,
      contactsBounced,
      meetingsWithoutFollowup,
      ...engineCards,
      ownerId: userId,
    })

    return orderActionsForRole(
      await this.excludeDisposed(
        userId,
        now,
        // #2095.74 — même retrait qu'au brief.
        excludeObjectsAlreadyTasked(
          this.excludeAlreadyTransformed(candidates, tasksBlock.tasks),
          tasksBlock.tasks,
          now,
        ),
      ),
      role ?? null,
      await this.declaredBusinessRole(userId),
    )
  }

  /**
   * #2392 (LAU-FINAL-106) — LA CLÔTURE DE FIN DE JOURNÉE, compilée sur des
   * données RÉELLES : les tâches de la personne (ouvertes + closes/créées
   * aujourd'hui) et ses fils sortants restés sans réponse. Les cartes encore à
   * valider (section 6) sont posées par l'appelant, qui a Action OS.
   *
   * Le pendant du brief du matin, et les mêmes lectures (GA-26) : les tâches
   * par `TasksService`, la messagerie par `buildMailBlock` — en salle de
   * démonstration, les fils scriptés du brief démo ; les tâches passent par le
   * CHEMIN DE PRODUCTION (elles sont seedées).
   *
   * Aucune écriture, aucun crédit : c'est une lecture. Reporter, déléguer,
   * abandonner se décident tâche par tâche sur la carte, et passent par
   * `PATCH /tasks/:id` au clic (#2392.4).
   */
  async dayClosure(
    userId: string,
    now: Date = new Date(),
    clientTimeZone?: string | null,
  ): Promise<Omit<DayClosure, 'toValidate'>> {
    const timeZone = resolveTimeZone(clientTimeZone)
    const today = zonedDateKey(now, timeZone)
    const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    const demo = await this.workspaceContext.isDemoWorkspace(userId)

    const [tasksRead, mail] = await Promise.all([
      this.readClosureTasks(userId, now),
      demo
        ? Promise.resolve(demoBriefing({ now, timeZone, firstName: null, accounts: [] }).mail)
        : this.buildMailBlock(userId),
    ])
    const sections = compileDayClosureTasks({
      tasks: tasksRead.tasks,
      today,
      tomorrow,
      dayOf: iso => zonedDateKey(new Date(iso), timeZone),
    })
    return {
      date: today,
      timeZone,
      tasksState: tasksRead.state,
      tasksReason: tasksRead.reason,
      ...sections,
      waitingOn: { state: mail.state, reason: mail.reason, threads: mail.awaitingReply },
    }
  }

  /** #2392 — ouvertes + closes/créées dans les 36 dernières heures, dédoublonnées par id. */
  private async readClosureTasks(
    userId: string,
    now: Date,
  ): Promise<{ state: 'ready' | 'unavailable'; reason: string | null; tasks: Task[] }> {
    if (!this.tasksService) return { state: 'unavailable', reason: 'Les tâches ne sont pas activées.', tasks: [] }
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const since = new Date(now.getTime() - 36 * 60 * 60 * 1000)
      const [open, touched] = await Promise.all([
        this.tasksService.openForUser(userId, workspaceId),
        this.tasksService.closedOrCreatedSince(userId, workspaceId, since),
      ])
      const byId = new Map<string, Task>()
      for (const task of [...open, ...touched]) byId.set(task.id, task)
      return { state: 'ready', reason: null, tasks: [...byId.values()] }
    } catch (error) {
      this.logger.warn(`Day closure: tasks unavailable — ${(error as Error).message}`)
      return { state: 'unavailable', reason: 'Les tâches n’ont pas pu être lues.', tasks: [] }
    }
  }

  /**
   * #1936.11 — le rôle de la personne dans son espace actif, ou `null`.
   *
   * ⚠️ Un échec de lecture rend `null`, et `null` rend l'ordre d'AVANT ce
   * champ : le brief ne disparaît pas parce qu'on n'a pas su lire un rôle, et il
   * ne bascule pas non plus sur une lecture devinée.
   */
  /** Le statut de l'agenda est lu 3 fois par brief (bloc agenda, connecteurs
   *  cassés, rendez-vous sans suite), chacun payant test « démo » + jeton :
   *  les appels concurrents partagent UNE lecture, rien n'est retenu ensuite. */
  private agendaStatus(userId: string): Promise<Awaited<ReturnType<AgendaService['status']>>> {
    return this.agendaStatusInFlight.run(userId, () => this.agenda.status(userId))
  }

  /** Même raison que {@link agendaStatus}, pour la messagerie. */
  private mailboxStatus(userId: string): Promise<Awaited<ReturnType<MailboxService['status']>>> {
    return this.mailboxStatusInFlight.run(userId, () => this.mailbox.status(userId))
  }

  private resolveWorkspace(userId: string): Promise<{ workspaceId: string; role: WorkspaceRole }> {
    return this.workspaceInFlight.run(userId, () => this.workspaceContext.resolveActiveWorkspace(userId))
  }

  private async readRole(userId: string): Promise<WorkspaceRole | null> {
    try {
      const { role } = await this.resolveWorkspace(userId)
      return role
    } catch (error) {
      this.logger.warn(`briefing: rôle illisible pour ${userId}`, error instanceof Error ? error.stack : undefined)
      return null
    }
  }

  /**
   * #2397.7 — le retour utilisateur sur le classement, par genre de carte.
   *
   * Un échec de lecture rend `{}` : le brief se construit à l'identique d'avant
   * ce lot (aucun axe `roleFit` évalué), jamais une lecture devinée.
   */
  private async readRoleFit(userId: string): Promise<BriefingRoleFitPreferences> {
    try {
      const row = await this.userPreferences.findOne({ where: { user_id: userId } })
      const bag = row?.preferences?.briefingRoleFit
      return bag && typeof bag === 'object' ? (bag as BriefingRoleFitPreferences) : {}
    } catch (error) {
      this.logger.warn(
        `briefing: retour utilisateur illisible pour ${userId}`,
        error instanceof Error ? error.stack : undefined,
      )
      return {}
    }
  }

  /**
   * #2101.13 — LE TEMPS PROTÉGÉ de cette personne, lu dans le MÊME sac
   * `user_preferences` que `readRoleFit` juste au-dessus — clé `protectedTime`,
   * réglée par `PATCH /memory/preferences` (`MemoryService.patchPreferences`,
   * validée par `userPreferencesPatchSchema`). `readProtectedTime` (contrat)
   * rend `null` sur une valeur absente ou corrompue : jamais une fenêtre
   * devinée. Un échec de lecture rend `null` pour la même raison que
   * `readRole` — le brief ne casse pas parce qu'une préférence est illisible.
   */
  private async readProtectedTime(userId: string): Promise<ProtectedTime | null> {
    try {
      const row = await this.userPreferences.findOne({ where: { user_id: userId } })
      return readProtectedTime(row?.preferences ?? null)
    } catch (error) {
      this.logger.warn(
        `briefing: temps protégé illisible pour ${userId}`,
        error instanceof Error ? error.stack : undefined,
      )
      return null
    }
  }

  /**
   * #2770.27 — les HEURES DE TRAVAIL de cette personne pour le plan de Laura :
   * son temps protégé (réglage explicite), ramené à des heures pleines par
   * `protectedTimeWorkdayHours`. `null` = aucun réglage (ou illisible) : les
   * heures ouvrées de la requête restent, jamais une fenêtre devinée.
   */
  async workdayWindowOf(userId: string): Promise<{ workdayStartHour: number; workdayEndHour: number } | null> {
    return protectedTimeWorkdayHours(await this.readProtectedTime(userId))
  }

  /**
   * #2770.28 — LES PRÉFÉRENCES D'AGENDA pour le plan de journée de Laura,
   * même porte publique que #2770.27 (`workdayWindowOf`) : le contrat
   * existant (`agenda-preferences.ts`), jamais un second réglage parallèle.
   * `{}` = rien réglé (ou illisible) : le moteur garde son comportement
   * inchangé (voir `chat_tools.py::_focus_budget_minutes`).
   */
  async agendaPreferencesOf(userId: string): Promise<Partial<AgendaPreferences>> {
    return this.readAgendaPreferences(userId)
  }

  /**
   * #2101.17 — LES PRÉFÉRENCES D'AGENDA de cette personne, au-delà du seul
   * temps protégé (`agenda-preferences.ts`) : combien de minutes lui faut un
   * dossier, combien de créneaux garder en réserve. Même sac, même lecture
   * tolérante par champ que `readProtectedTime` — un champ illisible ou
   * absent ne casse pas le brief, il rend simplement `{}` (défauts globaux
   * inchangés côté `agenda-compact.ts`).
   */
  private async readAgendaPreferences(userId: string): Promise<Partial<AgendaPreferences>> {
    try {
      const row = await this.userPreferences.findOne({ where: { user_id: userId } })
      return readAgendaPreferences(row?.preferences ?? null)
    } catch (error) {
      this.logger.warn(
        `briefing: préférences d'agenda illisibles pour ${userId}`,
        error instanceof Error ? error.stack : undefined,
      )
      return {}
    }
  }

  /**
   * #2397.7 — POSE le geste : « ceci correspond à mon rôle » (`engaged: true`)
   * ou son retrait (`engaged: false`). Upsert sur `user_preferences`, comme
   * `MemoryService.patchPreferences` (même table, même sac) — lu en entité ici
   * plutôt qu'en service voisin pour ne pas faire monter le cliquet GA-07 (voir
   * le docblock de `briefing.module.ts`). Ne touche JAMAIS `priority` : c'est
   * `buildBriefingActions`/`axesFor` qui portent la garantie qu'une obligation
   * ne descend jamais sous son seuil.
   */
  async setRoleFit(userId: string, kind: BriefingActionKind, engaged: boolean): Promise<void> {
    const existing = await this.userPreferences.findOne({ where: { user_id: userId } })
    const currentBag = existing?.preferences?.briefingRoleFit
    const nextBag = applyRoleFitFeedback(
      currentBag && typeof currentBag === 'object' ? (currentBag as BriefingRoleFitPreferences) : {},
      kind,
      engaged,
    )
    const preferences = { ...(existing?.preferences ?? {}), briefingRoleFit: nextBag }
    if (existing) {
      existing.preferences = preferences
      await this.userPreferences.save(existing)
    } else {
      await this.userPreferences.save(this.userPreferences.create({ user_id: userId, preferences }))
    }
  }

  /** Le jour civil UTC, `YYYY-MM-DD` — la même granularité que la mémoire de
   *  refus (#2101.40), jamais une heure précise qu'un fuseau ferait varier. */
  private todayKey(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10)
  }

  /**
   * #2770 (#2101.19/.21/.22/.30/.37/.40) — LA PRÉVISUALISATION FIGÉE D'UN
   * CRÉNEAU PROPOSÉ POUR CE COMPTE.
   *
   * #2101.40 — un refus posé AUJOURD'HUI pour ce compte suspend la
   * proposition avant même de calculer un créneau : proposer quand même
   * referait exactement ce que le refus voulait arrêter.
   *
   * `confirmSlotProposal` écrit EXACTEMENT le `slot` rendu ici, jamais un
   * recalcul au clic — la même garantie que la file CRM (prévisualisation
   * figée, GA-26). Les heures ouvrées et le fuseau reprennent le défaut déjà
   * posé par les routines qui proposent un créneau (`routine-executors.ts`,
   * `meetingCancelled`) — jamais un second réglage deviné ici.
   */
  async previewSlotProposal(
    userId: string,
    accountId: string,
    durationMinutes: number,
  ): Promise<AgendaSlotProposalPreview> {
    const today = this.todayKey()
    const existing = await this.userPreferences.findOne({ where: { user_id: userId } })
    const rejections = readAgendaSlotRejections(existing?.preferences ?? null)
    if (wasSlotRejectedToday(rejections, accountId, today)) return { status: 'suppressed' }

    const now = new Date()
    const slots = await this.agenda.freeSlots(userId, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 10 * 24 * 3600_000).toISOString(),
      durationMinutes,
      workdayStartHour: 9,
      workdayEndHour: 18,
      workdays: [1, 2, 3, 4, 5],
      timeZone: 'Europe/Paris',
      limit: 1,
    })
    const slot = slots[0]
    if (!slot) return { status: 'no_slot' }
    // #2101.30 — la CONSÉQUENCE : le seul fait direct et mesurable de ce
    // geste, jamais une capacité recalculée en double d'`agenda-compact.ts`
    // (GA-26, qui vit côté web et lit le temps protégé de la personne).
    return {
      status: 'ready',
      slot: { start: slot.start, end: slot.end },
      consequence: { freeMinutesConsumed: durationMinutes },
    }
  }

  /**
   * #2770 (#2101.19/.21) — LA PORTE : écrit EXACTEMENT le créneau que
   * `previewSlotProposal` a montré, sur un geste explicite — jamais seule.
   * `AgendaService.createEvent` (déjà là, `POST /agenda/events`) fait
   * l'écriture réelle ; `titleFor` (déjà là) préfixe le sujet du nom du
   * compte, comme tout autre évènement créé depuis l'écran.
   */
  async confirmSlotProposal(
    userId: string,
    input: { accountId: string; summary: string; start: string; end: string },
  ): Promise<AgendaCreateResult> {
    const account = await this.accounts.findOne({ where: { id: input.accountId }, select: ['id', 'company_name'] })
    const created = await this.agenda.createEvent(userId, {
      summary: input.summary,
      accountName: account?.company_name ?? undefined,
      startsAt: input.start,
      endsAt: input.end,
      attendees: [],
      addConferencing: true,
      reminderMinutes: 60,
      inviteSelf: false,
      timeZone: 'Europe/Paris',
    })
    // #2770 (#2101.19/.21/.22/.37) — la preuve locale, POSÉE APRÈS coup :
    // l'agenda du fournisseur est déjà écrit (la ligne ci-dessus n'a pas
    // levé), donc un échec ici ne doit jamais faire croire que le
    // rendez-vous n'a pas été créé — seule la distinction visuelle serait
    // manquante, jamais le rendez-vous lui-même.
    try {
      await this.bellumCreatedEvents.insert({
        user_id: userId,
        account_id: input.accountId,
        external_event_id: created.id,
      })
    } catch (error) {
      this.logger.warn(`confirmSlotProposal: marqueur local non posé pour ${created.id} — ${(error as Error).message}`)
    }
    return created
  }

  /**
   * #2770.49/.50/.51 — LA PORTE D'ÉCRITURE D'UN BLOC DE PLAN DE JOURNÉE.
   *
   * `propose_focus_plan` (#2391, `chat_tools.py`) n'écrit RIEN — la carte de
   * chat montre une proposition à revoir. Ce geste explicite écrit EXACTEMENT
   * le titre et les horaires que la carte a montrés, via `AgendaService.
   * createEvent` (déjà là) — même porte que `confirmSlotProposal` ci-dessus,
   * mais SANS compte : un bloc de plan de journée (« session d'appels »,
   * « tâches administratives »…) n'en a pas. `agenda_bellum_created_event.
   * account_id` est désormais optionnel (migration `1796350215111`, GA-11/
   * GA-12 — la contrainte SQL élargie AVANT ce code).
   *
   * `start`/`end` sont normalisés en UTC (`Z`) avant l'écriture : le modèle
   * peut les rendre avec un décalage local (`+02:00`), et `agendaEventDraft
   * Schema.startsAt/endsAt` (`@bellum/contracts`) n'accepte que `Z` — le même
   * INSTANT, jamais un horaire recalculé.
   */
  async confirmFocusPlanBlock(
    userId: string,
    input: { title: string; start: string; end: string },
  ): Promise<AgendaCreateResult> {
    const created = await this.agenda.createEvent(userId, {
      summary: input.title,
      startsAt: new Date(input.start).toISOString(),
      endsAt: new Date(input.end).toISOString(),
      attendees: [],
      addConferencing: false,
      reminderMinutes: 15,
      inviteSelf: false,
      timeZone: 'Europe/Paris',
    })
    // #2770.49/.50/.51 — la preuve locale, POSÉE APRÈS coup, même raison que
    // `confirmSlotProposal` : l'agenda du fournisseur est déjà écrit, un échec
    // ici ne doit jamais faire croire que le bloc n'a pas été créé.
    try {
      await this.bellumCreatedEvents.insert({
        user_id: userId,
        account_id: null,
        external_event_id: created.id,
      })
    } catch (error) {
      this.logger.warn(
        `confirmFocusPlanBlock: marqueur local non posé pour ${created.id} — ${(error as Error).message}`,
      )
    }
    return created
  }

  /**
   * #2770.52 — L'ANNULATION D'UN BLOC RÉELLEMENT CRÉÉ.
   *
   * `confirmFocusPlanBlock` ci-dessus écrit réellement l'évènement et rend son
   * identifiant fournisseur (`created.id`) ; c'est ce SEUL identifiant, tenu
   * par la carte de chat depuis la confirmation, que ce geste transmet à
   * `AgendaService.deleteEvent` — la primitive que six lots précédents (25→29
   * septembre) avaient vérifiée absente de `AgendaService`. Le marqueur local
   * (`agenda_bellum_created_event`) n'est pas effacé : une fois l'évènement
   * annulé chez le fournisseur, `listEvents` ne le rend plus jamais, la ligne
   * devient orpheline sans être interrogée par aucun appelant — l'effacer ne
   * changerait rien d'observable et violerait « on archive, on ne supprime
   * pas » pour un gain nul.
   */
  async cancelFocusPlanBlock(userId: string, eventId: string): Promise<void> {
    await this.agenda.deleteEvent(userId, eventId)
  }

  /**
   * #2770.63/.64/.65 (#2391.51/.52/.53) — LA MESURE POST-BLOC, un CLIC,
   * jamais une surveillance (#2391.56).
   *
   * Sur le SEUL identifiant que `confirmFocusPlanBlock` a rendu — même
   * principe que `cancelFocusPlanBlock` ci-dessus. UPSERT, contrairement à
   * `agenda_bellum_created_event` (append-only) : une correction humaine
   * gagne toujours, quelle que soit sa date — se tromper de bouton n'est
   * pas une écriture qu'on ne peut jamais reprendre.
   */
  async setFocusPlanBlockOutcome(
    userId: string,
    eventId: string,
    outcome: FocusPlanBlockOutcome,
    declared: { note?: string; actualMinutes?: number } = {},
  ): Promise<void> {
    // #2770.66/.67 — le résultat libre et la durée sont DÉCLARÉS par la personne :
    // absents de l'appel, ils ne sont PAS dans l'upsert, donc un simple clic ne
    // EFFACE jamais ce qu'elle avait écrit avant (une correction gagne, un
    // silence ne corrige rien).
    await this.focusPlanBlockOutcomes.upsert(
      {
        user_id: userId,
        external_event_id: eventId,
        outcome,
        ...(declared.note !== undefined ? { result_note: declared.note } : {}),
        ...(declared.actualMinutes !== undefined ? { actual_minutes: declared.actualMinutes } : {}),
        updated_at: new Date(),
      },
      ['user_id', 'external_event_id'],
    )
  }

  /**
   * #2391.54 / #2391.55 — LA LECTURE de ce que `setFocusPlanBlockOutcome` a
   * écrit : l'état, le résultat libre et la durée réelle DÉCLARÉS. Bornée aux
   * blocs de CETTE personne (`user_id`) et aux identifiants demandés — jamais
   * l'historique entier. `null` reste `null` : un clic seul n'a déclaré ni
   * note ni durée, et « non déclaré » ne se rend jamais `0` (GA-18).
   */
  async listFocusPlanBlockOutcomes(userId: string, eventIds: readonly string[]): Promise<FocusPlanBlockOutcomeRead[]> {
    if (eventIds.length === 0) return []
    const rows = await this.focusPlanBlockOutcomes.find({
      where: { user_id: userId, external_event_id: In([...eventIds]) },
    })
    return rows.map(row => ({
      eventId: row.external_event_id,
      outcome: row.outcome,
      note: row.result_note ?? null,
      actualMinutes: row.actual_minutes ?? null,
      updatedAt: new Date(row.updated_at).toISOString(),
    }))
  }

  /**
   * #2770 (#2101.19/.21/.22/.37) — les identifiants que la grille/le
   * plateau d'agenda partagés croisent avec `event.id` pour poser
   * `AgendaEvent.createdByBellum`. Jamais un second calcul : juste ce que
   * `confirmSlotProposal` a réellement enregistré pour cet utilisateur.
   */
  async listBellumCreatedEventIds(userId: string): Promise<string[]> {
    // Salle de démonstration : `confirmSlotProposal` y est bloqué (comme
    // toute écriture agenda), donc aucune vraie ligne n'existe jamais pour un
    // utilisateur démo. Le seul évènement démo écrit par cette porte
    // (`demo-event-nova-creneau-propose`) est nommé ici plutôt que déduit.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return [DEMO_BELLUM_CREATED_EVENT_ID]
    }
    const rows = await this.bellumCreatedEvents.find({ where: { user_id: userId }, select: ['external_event_id'] })
    return rows.map(row => row.external_event_id)
  }

  /**
   * #2770 (#2101.40) — « PAS MAINTENANT » : mémorise le refus pour AUJOURD'HUI,
   * même sac `user_preferences` que `setRoleFit` ci-dessus. Rien n'est écrit
   * dans l'agenda — c'est la différence avec `confirmSlotProposal`.
   */
  async rejectSlotProposal(userId: string, accountId: string): Promise<void> {
    const today = this.todayKey()
    const existing = await this.userPreferences.findOne({ where: { user_id: userId } })
    const rejections = readAgendaSlotRejections(existing?.preferences ?? null)
    const preferences = {
      ...(existing?.preferences ?? {}),
      agendaSlotRejections: withAgendaSlotRejection(rejections, accountId, today),
    }
    if (existing) {
      existing.preferences = preferences
      await this.userPreferences.save(existing)
    } else {
      await this.userPreferences.save(this.userPreferences.create({ user_id: userId, preferences }))
    }
  }

  /**
   * #2770 (#2101.14) — LE CLASSEMENT PAR PRIORITÉ, POUR CHOISIR À QUI PROPOSER
   * UN CRÉNEAU EN PREMIER.
   *
   * Correction du bilan du 27/09 12:20Z (repris par le lot `feat/lot-h5-27-09`,
   * commit `97ed0d639`) : le lien compte↔rendez-vous existe déjà
   * (`meeting-account-match.ts`, web), mais AUCUN moteur ne classait encore
   * les comptes PAR PRIORITÉ pour choisir LEQUEL proposer — la porte
   * `previewSlotProposal` restait à l'initiative explicite du commercial, qui
   * devait déjà savoir quel compte ouvrir. Cette méthode ne calcule PAS un
   * nouveau score : elle relit `accounts.priority_score`, déjà posé par
   * l'analyse (GA-26), et l'ORDONNE — jamais un second calcul.
   *
   * Deux filtres, jamais un troisième deviné :
   *  - un compte SANS score mesuré est exclu, pas classé dernier (GA-18/19 —
   *    « non mesuré » n'est jamais un zéro implicite) ;
   *  - un compte refusé AUJOURD'HUI (#2101.40, même mémoire que
   *    `previewSlotProposal`) est exclu — le proposer quand même referait
   *    exactement ce que le refus voulait arrêter.
   *
   * Périmètre : le même que partout ailleurs sur le produit
   * (`portfolioVisibilityOf`/`portfolioScopeFor`, D5) — un compte hors du
   * périmètre de l'appelant n'apparaît pas, même règle que `/accounts`.
   */
  async topAccountsForSlotProposal(userId: string, limit = 3): Promise<SlotProposalPriorityAccount[]> {
    const { workspaceId, role } = await this.resolveWorkspace(userId)
    const scope = await this.myScope(userId, workspaceId, role)

    // Marge sur la limite demandée : un refus posé aujourd'hui pour l'un des
    // `limit` premiers ne doit pas réduire le nombre de comptes rendus.
    const ownerClause = scope.kind === 'own' ? ' AND a.assigned_to = $3::uuid' : ''
    const params: unknown[] = [workspaceId, limit + AGENDA_SLOT_PROPOSAL_RANK_HEADROOM]
    if (scope.kind === 'own') params.push(scope.userId)
    const rows = await this.accounts.manager.query<{ id: string; company_name: string; priority_score: number }[]>(
      `SELECT a.id, a.company_name, a.priority_score
         FROM accounts a
        WHERE a.workspace_id = $1
          AND a.status NOT IN ('deleted', 'archived')
          AND a.priority_score IS NOT NULL${ownerClause}
        ORDER BY a.priority_score DESC
        LIMIT $2`,
      params,
    )

    const existing = await this.userPreferences.findOne({ where: { user_id: userId } })
    const rejections = readAgendaSlotRejections(existing?.preferences ?? null)
    const today = this.todayKey()

    return rows
      .filter(row => !wasSlotRejectedToday(rejections, row.id, today))
      .slice(0, limit)
      .map(row => ({ accountId: row.id, companyName: row.company_name, priorityScore: Number(row.priority_score) }))
  }

  /**
   * #2390.4/#2390.17 (épopée #2926) — les comptes du portefeuille utilisables
   * pour rattacher un rendez-vous PAR DOMAINE (`matchAccountByDomain`,
   * `agenda/meeting-account-domain-match.ts`) : le seul lien assez sûr pour
   * proposer une tâche de préparation SANS geste humain. `website IS NOT
   * NULL` en amont : un compte sans domaine connu ne peut jamais matcher,
   * inutile de le transporter jusqu'à l'appelant pour qu'il le rejette.
   */
  async accountsForMeetingDomainMatch(workspaceId: string): Promise<DomainMatchableAccount[]> {
    if (!workspaceId) return []
    return this.accounts.manager.query<DomainMatchableAccount[]>(
      `SELECT id, company_name, website FROM accounts WHERE workspace_id = $1 AND website IS NOT NULL AND status NOT IN ('deleted', 'archived')`,
      [workspaceId],
    )
  }

  /**
   * #2099.17-.32 / #2099.52 (épopée #2767) — POSE un geste sur une carte :
   * Reporter, Pas pertinent (motif), Déjà traité. Même sac `user_preferences`
   * que `setRoleFit` : un geste PERSONNEL, jamais une écriture sur l'objet
   * source (#2099.32) — refuser une relance ne touche ni le fil ni le compte.
   */
  async setCardDisposition(
    userId: string,
    request: BriefingCardDispositionRequest,
    now: Date = new Date(),
  ): Promise<void> {
    const existing = await this.userPreferences.findOne({ where: { user_id: userId } })
    const preferences = {
      ...(existing?.preferences ?? {}),
      briefingCardDispositions: withBriefingCardDisposition(
        readBriefingCardDispositions(existing?.preferences ?? null),
        request,
        now,
      ),
    }
    if (existing) {
      existing.preferences = preferences
      await this.userPreferences.save(existing)
    } else {
      await this.userPreferences.save(this.userPreferences.create({ user_id: userId, preferences }))
    }
  }

  /**
   * #2099.52 — un refus est respecté : retire les cartes que CETTE personne a
   * reportées, refusées ou déclarées traitées (`excludeDisposedBriefingActions`).
   * Une préférence illisible ne casse pas le brief : la liste revient entière.
   */
  private async excludeDisposed(userId: string, now: Date, actions: BriefingAction[]): Promise<BriefingAction[]> {
    try {
      const row = await this.userPreferences.findOne({ where: { user_id: userId } })
      return excludeDisposedBriefingActions(actions, readBriefingCardDispositions(row?.preferences ?? null), now)
    } catch (error) {
      this.logger.warn(
        `briefing: gestes sur les cartes illisibles pour ${userId}`,
        error instanceof Error ? error.stack : undefined,
      )
      return actions
    }
  }

  /**
   * LES BLOCAGES DE PARCOURS DU MATIN (#1506).
   *
   * « 3 dossiers attendent un retour client depuis plus de 7 jours » se vérifie
   * sur les objets ; « pense à relancer » ne se vérifie pas. Le bloc ne montre
   * QUE ce qui bloque — le parcours complet a son écran.
   *
   * ⚠️ Un échec ici rend une liste VIDE, jamais une erreur : le brief du matin
   * ne doit pas disparaître parce qu'une lecture transverse a échoué. Et une
   * liste vide se lit « rien ne bloque », ce qui reste vrai dans les deux cas
   * où elle survient — aucun blocage, ou aucun parcours lisible.
   */
  /**
   * #2107.48 — LA VISIBILITÉ DE PORTEFEUILLE, APPLIQUÉE À CE QUE `/briefing`
   * MONTRE.
   *
   * Mesuré le 25/09/2026 : les producteurs de ce service ne filtraient QUE par
   * `workspace_id` — sur un espace cloisonné (§`portfolio-visibility.ts`, D5),
   * un commercial sans `team:manage` voyait donc les missions, besoins et AO
   * de TOUTE l'équipe dans SON brief personnel, alors que `/accounts` et
   * `/projects` les lui masquaient déjà. Deux écrans, deux réponses au sujet du
   * même portefeuille.
   *
   * `portfolioScopeFor` (`@bellum/contracts`, D5) est la SEULE définition de
   * « ce que ce membre voit » — jamais recalculée ici. `financeScopeClause` est
   * la SEULE traduction SQL de « le mien, ou personne » (déjà celle du pipe,
   * `project-pipeline.service.ts`) : une portée `null` (open, ou `team:manage`)
   * devient `{kind:'workspace'}`, donc AUCUNE clause ajoutée — même requête,
   * au byte près, pour les espaces qui n'ont jamais activé le cloisonnement.
   */
  private async myScope(userId: string, workspaceId: string, role: WorkspaceRole): Promise<FinanceScope> {
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, userId)
    return scope ? { kind: 'own', workspaceId, userId: scope.ownerId } : { kind: 'workspace', workspaceId }
  }

  /**
   * #2107.48 — LE MÊME PÉRIMÈTRE, POUR `rfps` — qui ne porte NI `owner_id`
   * NI le pendant `financeScopeClause` attend (`rfps.user_id` est
   * l'IMPORTATEUR, pas le périmètre de lecture — voir `rfp.entity.ts`). Un AO
   * SANS compte encore rattaché (`account_id IS NULL`, l'intake avant
   * qualification) reste visible de tous, même règle que « ce que personne ne
   * porte » (`portfolioScopeFor`, `includeUnassigned`).
   */
  private rfpAccountScopeClause(
    scope: FinanceScope,
    alias: string,
    nextParam: number,
  ): { sql: string; params: unknown[] } {
    if (scope.kind === 'workspace') return { sql: '', params: [] }
    return {
      sql:
        ` AND (${alias}.account_id IS NULL` +
        ` OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = ${alias}.account_id` +
        ` AND (a.assigned_to = $${nextParam}::uuid OR a.assigned_to IS NULL)))`,
      params: [scope.userId],
    }
  }

  /**
   * #2107.3 — LES BESOINS OUVERTS SANS SHORTLIST, POUR LE BRIEF.
   *
   * ⚠️ Cette requête n'est PAS `CrmRoutinesService.needsWithoutShortlist` : la
   * recopier importerait le service d'un module voisin (GA-07 est à son
   * plafond, voir `module-boundaries.spec.ts`). Elle en reprend seulement les
   * DEUX prédicats gouvernés par le contrat (`needStillOpenSql`,
   * `needStaffableNotRefusedSql`) — jamais la forme de la porte G3 recopiée à
   * la main — et ajoute `n.id`, qui manque à la version de la routine (une
   * notification n'a pas besoin d'ouvrir le besoin, ce brief si).
   */
  private staleNeedsSql(scope: FinanceScope): { sql: string; params: unknown[] } {
    // #2107.48 — le besoin d'un compte hors du périmètre de l'appelant ne
    // produit plus de carte : même clause que le pipe (`financeScopeClause`).
    const scopeClause = financeScopeClause(scope, 'n', 3)
    // #3389.13 — la seconde moitié de la liste : une VEILLE dont la date de
    // reprise (posée par l'utilisateur) est échue. Une seule requête (UNION ALL)
    // pour garder un seul appel et les mêmes paramètres ; `days` y est le retard
    // sur la date, `resume_on` la date elle-même (NULL sur la première moitié).
    // Sans date posée, une veille ne remonte jamais : rien n'a été promis.
    return {
      sql: `(SELECT n.id,
                n.title,
                FLOOR(EXTRACT(EPOCH FROM (now() - n.created_at)) / 86400)::int AS days,
                NULL::text AS resume_on
           FROM project_needs n
          WHERE n.workspace_id = $1
            AND ${needStillOpenSql('n.status')}
            AND ${needStaffableNotRefusedSql('n.staffable')}
            AND n.created_at < now() - ($2 || ' days')::interval${scopeClause.sql}
            AND NOT EXISTS (SELECT 1 FROM shortlists s WHERE s.need_id = n.id)
          ORDER BY n.created_at ASC
          LIMIT 20)
         UNION ALL
         (SELECT n.id,
                n.title,
                (CURRENT_DATE - n.resume_on)::int AS days,
                to_char(n.resume_on, 'YYYY-MM-DD') AS resume_on
           FROM project_needs n
          WHERE n.workspace_id = $1
            AND n.status = 'on_hold'
            AND n.resume_on IS NOT NULL
            AND n.resume_on <= CURRENT_DATE${scopeClause.sql}
          ORDER BY n.resume_on ASC
          LIMIT 20)`,
      params: scopeClause.params,
    }
  }

  /**
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildChainBlockers} : le brief du matin ne doit pas disparaître
   * parce qu'une lecture transverse a échoué.
   */
  private async buildStaleNeeds(
    userId: string,
  ): Promise<Array<{ id: string; title: string; days: number; resumeOn?: string | null }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const { sql, params } = this.staleNeedsSql(scope)
      const rows = await this.accounts.manager.query<
        Array<{ id: string; title: string; days: number; resume_on?: string | null }>
      >(sql, [workspaceId, NEED_STALE_AFTER_DAYS, ...params])
      return rows.map(({ resume_on, ...need }) => (resume_on ? { ...need, resumeOn: resume_on } : need))
    } catch (error) {
      this.logger.warn(`Besoins sans shortlist illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2095.2 — LES MISSIONS QUI APPROCHENT DE LEUR FIN, POUR LE BRIEF.
   *
   * Même patron que {@link staleNeedsSql} : une lecture locale, déterministe,
   * sur nos propres tables — aucune dépendance à un connecteur externe.
   * `status IN ('active', 'onboarding')` est le prédicat déjà partagé par
   * `MissionScoresService.SECURED_PREDICATE` et une dizaine d'autres lectures
   * de ce module : une mission terminée ou pas encore signée n'a pas d'échéance
   * à annoncer.
   */
  private missionsEndingSql(scope: FinanceScope): { sql: string; params: unknown[] } {
    // #2107.48 — une mission d'un compte hors du périmètre de l'appelant ne
    // produit plus de carte.
    const scopeClause = financeScopeClause(scope, 'm', 3)
    return {
      sql: `SELECT m.id,
                m.label,
                (m.ends_on - current_date)::int AS days_until_end
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status IN ('active', 'onboarding')
            AND m.ends_on IS NOT NULL
            AND m.ends_on BETWEEN current_date AND current_date + ($2 || ' days')::interval${scopeClause.sql}
          ORDER BY m.ends_on ASC
          LIMIT 20`,
      params: scopeClause.params,
    }
  }

  /**
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildStaleNeeds} : le brief du matin ne doit pas disparaître parce
   * qu'une lecture transverse a échoué.
   */
  private async buildMissionsEnding(
    userId: string,
  ): Promise<Array<{ id: string; label: string; daysUntilEnd: number }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const { sql, params } = this.missionsEndingSql(scope)
      const rows = await this.accounts.manager.query<Array<{ id: string; label: string; days_until_end: number }>>(
        sql,
        [workspaceId, MISSION_ENDING_SOON_DAYS, ...params],
      )
      return rows.map(row => ({ id: row.id, label: row.label, daysUntilEnd: row.days_until_end }))
    } catch (error) {
      this.logger.warn(`Missions arrivant à échéance illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2107.8 — LES MISSIONS ACTIVES SANS DATE DE FIN.
   *
   * {@link missionsEndingSql} EXCLUT explicitement `ends_on IS NULL` : une
   * mission sans date n'y apparaît donc jamais, dans aucune fenêtre, aucun
   * jour. Même prédicat de statut que {@link missionsEndingSql}
   * (`'active', 'onboarding'`) — une mission terminée ou pas encore signée
   * n'a rien à annoncer.
   */
  private missionsWithoutEndDateSql(scope: FinanceScope): { sql: string; params: unknown[] } {
    // #2107.48 — même clause de périmètre que {@link missionsEndingSql}.
    const scopeClause = financeScopeClause(scope, 'm', 2)
    return {
      sql: `SELECT m.id, m.label
               FROM missions m
              WHERE m.workspace_id = $1
                AND m.status IN ('active', 'onboarding')
                AND m.ends_on IS NULL${scopeClause.sql}
              ORDER BY m.started_on ASC NULLS LAST
              LIMIT 20`,
      params: scopeClause.params,
    }
  }

  /**
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildStaleNeeds} : le brief du matin ne doit pas disparaître parce
   * qu'une lecture transverse a échoué.
   */
  private async buildMissionsWithoutEndDate(userId: string): Promise<Array<{ id: string; label: string }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const { sql, params } = this.missionsWithoutEndDateSql(scope)
      const rows = await this.accounts.manager.query<Array<{ id: string; label: string }>>(sql, [
        workspaceId,
        ...params,
      ])
      return rows
    } catch (error) {
      this.logger.warn(`Missions sans date de fin illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2095.7 — LES PAIEMENTS EN RETARD, POUR LE BRIEF.
   *
   * `unsettledInvoiceSql` est le MÊME prédicat que `MissionScoresService`
   * (`overdue_invoices`) — jamais une seconde forme écrite à la main (#2419.4 :
   * un `paid_at IS NULL` nu ferait ressortir une facture pourtant réglée en
   * partie). `DISTINCT ON` garde l'échéance la plus ancienne PAR MISSION : une
   * mission ne remonte jamais deux fois pour deux mois en retard.
   *
   * ⚠️ Aucun montant sélectionné : la doctrine interdit une conversion de
   * devise, et ce brief n'a besoin que du nombre de jours pour classer.
   *
   * #3671.3 (GA-26) — rend `due_on`, JAMAIS un nombre de jours déjà calculé :
   * recette prod 08/10, la carte « Migration cloud » annonçait 67 jours de
   * retard ici, son détail 31 (`overdueDaysAt`, écran Encaissements) — deux
   * recalculs du même réglage, divergés. `overdueDaysFromDueOn`
   * (`@bellum/contracts`) porte désormais la SEULE formule ; cette requête ne
   * fait plus que trier sur la colonne brute (`due_on ASC` = l'échéance la
   * plus ancienne = le retard le plus grand, un ordre équivalent et jamais
   * recalculé).
   */
  private overdueInvoicesSql(scope: FinanceScope): { sql: string; params: unknown[] } {
    // #2107.48 — même clause de périmètre que {@link missionsEndingSql}, portée
    // par la mission jointe (`invoice_readiness` ne porte ni owner ni compte).
    const scopeClause = financeScopeClause(scope, 'm', 2)
    return {
      sql: `SELECT id, label, due_on, period_month FROM (
                SELECT DISTINCT ON (r.mission_id)
                       r.mission_id AS id,
                       m.label,
                       r.due_on,
                       to_char(r.period_month, 'YYYY-MM') AS period_month
                  FROM invoice_readiness r
                  JOIN missions m ON m.id = r.mission_id
                 WHERE r.workspace_id = $1
                   AND r.due_on IS NOT NULL
                   AND r.due_on < current_date
                   AND ${unsettledInvoiceSql('r')}${scopeClause.sql}
                 ORDER BY r.mission_id, r.due_on ASC
              ) worst
             ORDER BY due_on ASC
             LIMIT 20`,
      params: scopeClause.params,
    }
  }

  /**
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildStaleNeeds} : le brief du matin ne doit pas disparaître parce
   * qu'une lecture transverse a échoué.
   */
  private async buildOverdueInvoices(
    userId: string,
    now: Date,
  ): Promise<Array<{ id: string; label: string; daysOverdue: number; periodMonth: string | null }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const { sql, params } = this.overdueInvoicesSql(scope)
      const rows = await this.accounts.manager.query<
        Array<{ id: string; label: string; due_on: string; period_month?: string | null }>
      >(sql, [workspaceId, ...params])
      // #3671.3 (GA-26) — la SEULE formule, voir {@link overdueInvoicesSql}.
      return rows.flatMap(row => {
        const daysOverdue = overdueDaysFromDueOn(row.due_on, now)
        return daysOverdue === null
          ? []
          : [{ id: row.id, label: row.label, daysOverdue, periodMonth: row.period_month ?? null }]
      })
    } catch (error) {
      this.logger.warn(`Paiements en retard illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2095.8 — LES APPELS D'OFFRES PROCHES DE LEUR ÉCHÉANCE, POUR LE BRIEF.
   *
   * Même prédicat que `rfpsDueWithGaps` (`laura-probe.service.ts`) : les trois
   * statuts encore ouverts (`intake`, `analysed`, `bid`), jamais recopié à la
   * main avec un statut oublié — la sonde Laura et ce brief doivent voir le
   * MÊME AO au même moment.
   */
  private rfpsDueSoonSql(scope: FinanceScope): { sql: string; params: unknown[] } {
    const scopeClause = this.rfpAccountScopeClause(scope, 'r', 3)
    return {
      sql: `SELECT r.id, r.title, CEIL(EXTRACT(EPOCH FROM (r.due_at - now())) / 86400)::int AS days_until_due
               FROM rfps r
              WHERE r.workspace_id = $1
                AND r.status IN ('intake', 'analysed', 'bid')
                AND r.due_at IS NOT NULL
                AND r.due_at BETWEEN now() AND now() + ($2 || ' days')::interval${scopeClause.sql}
              ORDER BY r.due_at ASC
              LIMIT 20`,
      params: scopeClause.params,
    }
  }

  /**
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildStaleNeeds} : le brief du matin ne doit pas disparaître parce
   * qu'une lecture transverse a échoué.
   */
  private async buildRfpsDueSoon(userId: string): Promise<Array<{ id: string; title: string; daysUntilDue: number }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const { sql, params } = this.rfpsDueSoonSql(scope)
      const rows = await this.accounts.manager.query<Array<{ id: string; title: string; days_until_due: number }>>(
        sql,
        [workspaceId, RFP_DUE_SOON_DAYS, ...params],
      )
      return rows.map(row => ({ id: row.id, title: row.title, daysUntilDue: row.days_until_due }))
    } catch (error) {
      this.logger.warn(`Appels d'offres à échéance illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2107.14 — LES APPELS D'OFFRES PORTANT AU MOINS UNE EXIGENCE OBLIGATOIRE
   * NON COUVERTE, POUR LE BRIEF.
   *
   * Le comptage n'est PAS refait à la main ici : `requirements` (JSONB,
   * `rfps.requirements`) est passé tel quel à `computeRfpCompliance`
   * (`@bellum/contracts`), la MÊME fonction pure que l'écran de conformité de
   * l'AO utilise déjà — deux chemins qui refont une dérivation divergent
   * (doctrine), donc un seul chemin la calcule.
   *
   * Statuts ouverts identiques à `rfpsDueSoonSql` (`intake`, `analysed`,
   * `bid`) : une exigence non couverte sur un AO déjà clos ou perdu n'est
   * plus actionnable.
   *
   * `this.accounts.manager.query` (raw SQL, pas de repository `RfpEntity`) —
   * même pattern que les autres lectures transverses de ce service : GA-07
   * est à son plafond, une entité en lecture seule ne le fait pas monter.
   */
  private async buildRfpsWithUncoveredRequirements(
    userId: string,
  ): Promise<Array<{ id: string; title: string; count: number }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      // #2107.48 — même clause de périmètre que {@link rfpsDueSoonSql}.
      const scopeClause = this.rfpAccountScopeClause(scope, 'r', 2)
      const rows = await this.accounts.manager.query<
        Array<{ id: string; title: string; requirements: RfpRequirement[] | null }>
      >(
        `SELECT r.id, r.title, r.requirements
           FROM rfps r
          WHERE r.workspace_id = $1
            AND r.status IN ('intake', 'analysed', 'bid')${scopeClause.sql}
          ORDER BY r.due_at ASC NULLS LAST
          LIMIT 50`,
        [workspaceId, ...scopeClause.params],
      )
      return rows
        .map(row => ({
          id: row.id,
          title: row.title,
          count: computeRfpCompliance(row.requirements ?? []).mandatoryUnanswered,
        }))
        .filter(rfp => rfp.count > 0)
        .slice(0, 20)
    } catch (error) {
      this.logger.warn(`Exigences d'appels d'offres illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #3256 (BEL-SC-227.19) — LES RISQUES CRITIQUES AGRÉGÉS, POUR LE BRIEF.
   *
   * PAS un second score (doctrine #3249 règle 4) : les trois `WHERE` ci-dessous
   * sont recopiés à l'IDENTIQUE de {@link overdueInvoicesSql},
   * {@link buildRenewalsNotEngaged} et {@link buildRfpsWithUncoveredRequirements}
   * — même prédicat `unsettledInvoiceSql`, même `renewalWindow`, même
   * `computeRfpCompliance` — avec seulement `account_id`/`company_name`
   * ajoutés à la sélection pour pouvoir grouper. Un compte n'entre dans ce
   * bloc que si au moins DEUX signaux (même genre ou non) le concernent : un
   * compte avec un seul signal reste visible via sa carte individuelle
   * ailleurs dans le brief, ce bloc ne la duplique pas.
   *
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildChainBlockers} : le brief du matin ne doit pas disparaître
   * parce qu'une lecture transverse a échoué.
   */
  private async buildCriticalRisks(userId: string, now: Date): Promise<CriticalRisk[]> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)

      const financialScope = financeScopeClause(scope, 'm', 2)
      const financialRows = await this.accounts.manager.query<
        Array<{ account_id: string | null; company_name: string | null }>
      >(
        `SELECT m.account_id, a.company_name
           FROM invoice_readiness r
           JOIN missions m ON m.id = r.mission_id
           JOIN accounts a ON a.id = m.account_id
          WHERE r.workspace_id = $1
            AND a.status NOT IN ('deleted', 'archived')
            AND r.due_on IS NOT NULL
            AND r.due_on < current_date
            AND ${unsettledInvoiceSql('r')}${financialScope.sql}`,
        [workspaceId, ...financialScope.params],
      )

      const scaleRows = await this.accounts.manager.query<Array<{ renewal_window_days: unknown }>>(
        `SELECT renewal_window_days FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      const scale = resolveRenewalWindowDays(scaleRows?.[0]?.renewal_window_days ?? null)
      const missionScope = financeScopeClause(scope, 'm', 2)
      const missionRawRows = await this.accounts.manager.query<
        Array<{ account_id: string | null; company_name: string | null; ends_on: string | Date | null }>
      >(
        `SELECT m.account_id, a.company_name, m.ends_on
           FROM missions m
           JOIN accounts a ON a.id = m.account_id
          WHERE m.workspace_id = $1
            AND a.status NOT IN ('deleted', 'archived')
            AND m.status = 'active'
            AND m.ends_on IS NOT NULL
            AND (m.renewal_status IS NULL OR m.renewal_status = 'non_engage')${missionScope.sql}`,
        [workspaceId, ...missionScope.params],
      )
      const missionRows = missionRawRows.filter(row => {
        const window = renewalWindow(row.ends_on ? new Date(row.ends_on).toISOString() : null, now, scale)
        return window === 'j45' || window === 'j30' || window === 'j15'
      })

      const rfpScope = this.rfpAccountScopeClause(scope, 'r', 2)
      const rfpRawRows = await this.accounts.manager.query<
        Array<{ account_id: string | null; company_name: string | null; requirements: RfpRequirement[] | null }>
      >(
        `SELECT r.account_id, a.company_name, r.requirements
           FROM rfps r
           LEFT JOIN accounts a ON a.id = r.account_id AND a.status NOT IN ('deleted', 'archived')
          WHERE r.workspace_id = $1
            AND r.status IN ('intake', 'analysed', 'bid')${rfpScope.sql}`,
        [workspaceId, ...rfpScope.params],
      )
      const rfpRows = rfpRawRows.filter(
        row => row.account_id !== null && computeRfpCompliance(row.requirements ?? []).mandatoryUnanswered > 0,
      )

      const byAccount = new Map<string, { companyName: string; kinds: CriticalRiskKind[] }>()
      const add = (accountId: string | null, companyName: string | null, kind: CriticalRiskKind) => {
        if (!accountId || !companyName) return
        const entry = byAccount.get(accountId) ?? { companyName, kinds: [] }
        entry.kinds.push(kind)
        byAccount.set(accountId, entry)
      }
      for (const row of financialRows) add(row.account_id, row.company_name, 'financial')
      for (const row of missionRows) add(row.account_id, row.company_name, 'mission')
      for (const row of rfpRows) add(row.account_id, row.company_name, 'contractual')

      return [...byAccount.entries()]
        .filter(([, entry]) => entry.kinds.length >= 2)
        .map(([accountId, entry]) => ({
          accountId,
          companyName: entry.companyName,
          kinds: entry.kinds,
          count: entry.kinds.length,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    } catch (error) {
      this.logger.warn(`Risques critiques agrégés illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2107.18 — LES COMPTES ACTIFS SANS PROPRIÉTAIRE ASSIGNÉ, POUR LE BRIEF.
   *
   * Même colonne que `ManagerService.coverageMap` (`accounts.assigned_to`,
   * « segment sans propriétaire = zone blanche ») : la propriété se lit sur
   * LE PORTEFEUILLE OFFICIEL, pas sur l'activité (même doctrine que le
   * commentaire de `coverageMap`). Ici au niveau INDIVIDUEL — un compte
   * précis, ouvrable — là où `coverageMap` agrège par secteur/territoire/
   * persona pour le manager.
   *
   * Comptes archivés exclus, même filtre que `coverageMap`.
   */
  private async buildAccountsWithoutOwner(userId: string): Promise<Array<{ id: string; companyName: string }>> {
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.accounts.manager.query<Array<{ id: string; company_name: string }>>(
        `SELECT id, company_name
           FROM accounts
          WHERE workspace_id = $1
            AND assigned_to IS NULL
            AND status NOT IN ('deleted', 'archived')
            AND commercial_status <> 'archived'
          ORDER BY created_at ASC
          LIMIT 20`,
        [workspaceId],
      )
      return rows.map(row => ({ id: row.id, companyName: row.company_name }))
    } catch (error) {
      this.logger.warn(`Comptes sans propriétaire illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * L1 (31/10/2026) — LES CINQ LECTURES DU MOTEUR DE CARTES, d'un seul appel.
   *
   * Une lecture par famille, chacune bornée (`LIMIT 20`) et chacune sous le
   * périmètre de portefeuille de l'appelant (#2107.48 : `financeScopeClause`
   * pour une mission, la clause « compte à moi ou à personne » pour un
   * contact) — un commercial d'un espace cloisonné ne reçoit JAMAIS une carte
   * d'un objet hors de son portefeuille. Un échec rend une liste VIDE, même
   * raison que {@link buildStaleNeeds} : le brief ne disparaît pas pour une
   * lecture transverse.
   */
  private async buildEngineCards(userId: string): Promise<{
    missionsStarting: Array<{ id: string; label: string; daysUntilStart: number; startsOn: string | null }>
    amendmentsPending: Array<{ missionId: string; label: string; documentName: string; days: number }>
    contactsLeft: Array<{ id: string; name: string | null; companyName: string | null; leftAt: string | null }>
    criticalDataMissing: Array<{
      field: 'mission_consultant' | 'billing_contact_email'
      objectKind: 'mission' | 'contact'
      id: string
      label: string
    }>
  }> {
    const empty = { missionsStarting: [], amendmentsPending: [], contactsLeft: [], criticalDataMissing: [] }
    let workspaceId: string
    let scope: FinanceScope
    try {
      const resolved = await this.resolveWorkspace(userId)
      workspaceId = resolved.workspaceId
      scope = await this.myScope(userId, workspaceId, resolved.role)
    } catch (error) {
      this.logger.warn(`Moteur de cartes : espace illisible — ${(error as Error).message}`)
      return empty
    }
    const read = async <T>(name: string, sql: string, params: unknown[]): Promise<T[]> => {
      try {
        return await this.accounts.manager.query<T[]>(sql, params)
      } catch (error) {
        this.logger.warn(`${name} illisible : ${(error as Error).message}`)
        return []
      }
    }
    const missionScope = financeScopeClause(scope, 'm', 3)
    const missionScope2 = financeScopeClause(scope, 'm', 2)

    const [starting, amendments, left, withoutConsultant, billingWithoutEmail] = await Promise.all([
      // #2095.45 — une mission signée qui DÉMARRE dans la fenêtre.
      read<{ id: string; label: string; days_until_start: number; starts_on: string | null }>(
        'Missions qui démarrent',
        `SELECT m.id, m.label, (m.started_on - current_date)::int AS days_until_start, m.started_on::text AS starts_on
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status IN ('onboarding', 'ready_to_start', 'active')
            AND m.started_on IS NOT NULL
            AND m.started_on BETWEEN current_date AND current_date + ($2 || ' days')::interval${missionScope.sql}
          ORDER BY m.started_on ASC
          LIMIT 20`,
        [workspaceId, MISSION_STARTING_SOON_DAYS, ...missionScope.params],
      ),
      // #2095.45 — un avenant ENVOYÉ, non signé, sur une mission qui tourne.
      // `updated_at` est le passage au statut `sent`/`pending` : l'âge de l'envoi.
      read<{ mission_id: string; label: string; name: string; days: number }>(
        'Avenants en attente de signature',
        `SELECT d.mission_id, m.label, d.name, (current_date - d.updated_at::date)::int AS days
           FROM mission_documents d
           JOIN missions m ON m.id = d.mission_id
          WHERE m.workspace_id = $1
            AND d.kind = 'amendment'
            AND d.status IN ('sent', 'pending')
            AND m.status IN ('onboarding', 'ready_to_start', 'active', 'renewal_pending', 'ending')${missionScope2.sql}
          ORDER BY d.updated_at ASC
          LIMIT 20`,
        [workspaceId, ...missionScope2.params],
      ),
      // #2095.41 — un contact passé `historique` (n'est plus en poste) dans la
      // fenêtre : par `ContactEntity`, jamais un SQL brut de plus sur
      // `contacts` (GA-405, cliquet des lectures brutes).
      this.readContactsLeft(userId, workspaceId, scope),
      // #2095.10 — `mission_consultant` : une mission qui tourne sans AUCUNE
      // affectation encore en cours.
      read<{ id: string; label: string }>(
        'Missions sans consultant',
        `SELECT m.id, m.label
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status IN ('onboarding', 'active')
            AND NOT EXISTS (SELECT 1 FROM mission_assignments ma
                             WHERE ma.mission_id = m.id
                               AND (ma.ends_on IS NULL OR ma.ends_on >= current_date))${missionScope2.sql}
          ORDER BY m.started_on ASC NULLS LAST
          LIMIT 20`,
        [workspaceId, ...missionScope2.params],
      ),
      // #2095.10 — `billing_contact_email` : l'interlocuteur de facturation
      // d'une mission qui tourne n'a pas d'e-mail. Les missions en SQL, le
      // contact par `ContactEntity` (GA-405).
      this.readBillingContactsWithoutEmail(workspaceId, missionScope2),
    ])

    return {
      missionsStarting: starting.map(row => ({
        id: row.id,
        label: row.label,
        daysUntilStart: Number(row.days_until_start),
        startsOn: row.starts_on ?? null,
      })),
      amendmentsPending: amendments.map(row => ({
        missionId: row.mission_id,
        label: row.label,
        documentName: row.name,
        days: Number(row.days),
      })),
      contactsLeft: left,
      criticalDataMissing: [
        ...withoutConsultant.map(row => ({
          field: 'mission_consultant' as const,
          objectKind: 'mission' as const,
          id: row.id,
          label: row.label,
        })),
        ...billingWithoutEmail.map(contact => ({
          field: 'billing_contact_email' as const,
          objectKind: 'contact' as const,
          id: contact.id,
          label: contact.name,
        })),
      ],
    }
  }

  /**
   * #2095.41 — les contacts passés `historique` dans les
   * {@link CONTACT_LEFT_LOOKBACK_DAYS} derniers jours, TOUJOURS historiques,
   * sous le périmètre de portefeuille (le compte du contact est le mien, ou
   * personne ne le porte). `ContactEntity` borné par `updated_at` (la
   * transition réécrit la ligne), puis la DATE réelle de la transition lue
   * sur `contact_lifecycle_transitions` — jamais l'instant de lecture.
   */
  private async readContactsLeft(
    userId: string,
    workspaceId: string,
    scope: FinanceScope,
  ): Promise<Array<{ id: string; name: string | null; companyName: string | null; leftAt: string | null }>> {
    try {
      const since = new Date(Date.now() - CONTACT_LEFT_LOOKBACK_DAYS * 86_400_000)
      const rows = await this.contacts.find({
        where: { workspace_id: workspaceId, lifecycle_state: 'historique', updated_at: MoreThan(since) },
        select: ['id', 'full_name', 'account_id'],
        take: 50,
      })
      if (rows.length === 0) return []
      const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => Boolean(id)))]
      const owners =
        accountIds.length === 0
          ? []
          : await this.accounts.find({
              where: { id: In(accountIds), workspace_id: workspaceId, status: Not(In([...UNCITED_ACCOUNT_STATUSES])) },
              select: ['id', 'company_name', 'assigned_to'],
            })
      const accountById = new Map(owners.map(account => [account.id, account]))
      const inScope = rows.filter(row => {
        if (!row.account_id) return true
        const account = accountById.get(row.account_id)
        if (!account) return false
        return scope.kind === 'workspace' || !account.assigned_to || account.assigned_to === scope.userId
      })
      if (inScope.length === 0) return []
      const transitions = await this.accounts.manager.query<Array<{ contact_id: string; occurred_at: string }>>(
        `SELECT DISTINCT ON (contact_id) contact_id, occurred_at
           FROM contact_lifecycle_transitions
          WHERE contact_id = ANY($1::uuid[])
            AND to_state = 'historique'
            AND occurred_at >= $2
          ORDER BY contact_id, occurred_at DESC`,
        [inScope.map(row => row.id), since.toISOString()],
      )
      const leftAt = new Map(transitions.map(row => [row.contact_id, new Date(row.occurred_at).toISOString()]))
      return inScope
        .filter(row => leftAt.has(row.id))
        .map(row => ({
          id: row.id,
          name: row.full_name ?? null,
          companyName: (row.account_id && accountById.get(row.account_id)?.company_name) || null,
          leftAt: leftAt.get(row.id) ?? null,
        }))
        .sort((a, b) => (b.leftAt ?? '').localeCompare(a.leftAt ?? ''))
        .slice(0, 20)
    } catch (error) {
      this.logger.warn(`Contacts partis illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2095.10 — `billing_contact_email` : les interlocuteurs de facturation des
   * missions qui tournent (portée de l'appelant), sans e-mail. Les missions en
   * SQL, le contact par `ContactEntity` (GA-405 : aucune lecture brute de plus).
   */
  private async readBillingContactsWithoutEmail(
    workspaceId: string,
    missionScope: { sql: string; params: unknown[] },
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const missions = await this.accounts.manager.query<Array<{ billing_contact_id: string }>>(
        `SELECT DISTINCT m.billing_contact_id
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status IN ('onboarding', 'active')
            AND m.billing_contact_id IS NOT NULL${missionScope.sql}
          LIMIT 50`,
        [workspaceId, ...missionScope.params],
      )
      if (missions.length === 0) return []
      const contacts = await this.contacts.find({
        where: { id: In(missions.map(row => row.billing_contact_id)), workspace_id: workspaceId },
        select: ['id', 'full_name', 'email'],
      })
      return contacts
        .filter(contact => !contact.email?.trim())
        .slice(0, 20)
        .map(contact => ({ id: contact.id, name: contact.full_name ?? '' }))
    } catch (error) {
      this.logger.warn(`Interlocuteurs de facturation illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2095.60 — L'ANGLE D'ATTAQUE DÉJÀ CALCULÉ pour chaque compte qui a bougé :
   * le recommandé d'abord, puis le mieux classé (`attack_angles`, écrit par
   * l'analyse du compte). Une lecture bornée aux comptes de la carte, jamais
   * un angle rédigé ici. Échec → aucun angle, la carte reste entière.
   */
  private async readAngles(
    userId: string,
    accountIds: readonly string[],
  ): Promise<Map<string, { id: string; title: string }>> {
    const angles = new Map<string, { id: string; title: string }>()
    if (accountIds.length === 0) return angles
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.accounts.manager.query<Array<{ id: string; account_id: string; title: string }>>(
        `SELECT DISTINCT ON (account_id) id, account_id, title
           FROM attack_angles
          WHERE workspace_id = $1
            AND account_id = ANY($2::uuid[])
            AND title IS NOT NULL AND btrim(title) <> ''
          ORDER BY account_id, is_recommended DESC NULLS LAST, rank ASC NULLS LAST, created_at DESC`,
        [workspaceId, [...accountIds]],
      )
      for (const row of rows) angles.set(row.account_id, { id: row.id, title: row.title })
    } catch (error) {
      this.logger.warn(`Angles d'attaque illisibles : ${(error as Error).message}`)
    }
    return angles
  }

  /**
   * #2158.41 (épopée #2993) — LES CONTACTS CONNUS DONT LE DERNIER E-MAIL A
   * REBONDI, POUR LE BRIEF.
   *
   * Première famille CONTACTS du brief (#2095.41) : `email_bounced_at`, posé
   * par le SEUL webhook fournisseur (`applyEmailBounce`, #2733) — jamais une
   * donnée devinée, la MÊME colonne que `ContactsService.getDeliverability`.
   * `/contacts/:id` existe déjà (annuaire canonique, #2158) : le dossier
   * s'ouvre directement, aucune fiche par rebond.
   */
  private async buildContactsBounced(userId: string): Promise<Array<{ id: string; name: string | null }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      // L1 (31/10/2026) — le périmètre de portefeuille (#2107.48) manquait ici :
      // sur un espace cloisonné, un commercial recevait le rebond d'un contact
      // d'un compte qui n'est pas le sien. Même clause que les AO : le compte
      // du contact est le mien, ou personne ne le porte.
      const scope = await this.myScope(userId, workspaceId, role)
      const scopeClause = this.rfpAccountScopeClause(scope, 'c', 2)
      const rows = await this.contacts.manager.query<Array<{ id: string; full_name: string | null }>>(
        `SELECT c.id, c.full_name
           FROM contacts c
          WHERE c.workspace_id = $1
            AND c.email_bounced_at IS NOT NULL${scopeClause.sql}
          ORDER BY c.email_bounced_at DESC
          LIMIT 20`,
        [workspaceId, ...scopeClause.params],
      )
      return rows.map(row => ({ id: row.id, name: row.full_name ?? null }))
    } catch (error) {
      this.logger.warn(`Contacts au rebond illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2095.12 (épopée #2993) — LE PRÉALABLE nommé « reste » quatre lots de
   * suite (25/09, 26/09 ×2, 27/09) : un rendez-vous externe TERMINÉ, dans la
   * fenêtre de rattrapage ({@link MEETING_FOLLOWUP_LOOKBACK_HOURS}), sans
   * AUCUNE note qui porte son `sourceEventId`.
   *
   * ⚠️ Réutilise TROIS lectures déjà posées, aucune n'est recalculée :
   *  - `AgendaService.status`/`listEventsDetailed`, les MÊMES que
   *    `buildAgendaBlock` (même agenda, fenêtre PASSÉE plutôt que future) ;
   *  - `selectEndedMeetingsAwaitingFollowup` (`briefing-actions.ts`), la
   *    moitié PASSÉE de `selectMeetingsToPrepare` ;
   *  - `notes.source_event_id` (#2103.1, migration `NoteSourceEvent`), déjà
   *    posée et déjà LUE par `NotesService.existsForSourceEvent` — jamais
   *    appelée par le brief avant ce lot : du code juste, calculé, testé, que
   *    personne n'appelait.
   *
   * `NoteEntity` est injectée en ENTITÉ, pas `NotesService` (GA-07 est à son
   * plafond, voir `briefing.module.ts`) : une lecture BORNÉE aux rendez-vous
   * déjà sélectionnés (`= ANY($2::text[])`), jamais une requête libre.
   */
  private async buildMeetingsWithoutFollowup(
    userId: string,
    now: Date,
    scope: AgendaReadScope = {},
  ): Promise<AgendaEvent[]> {
    // #3973 — agenda décoché en entier pour ce fil : rien n'est lu.
    if (excludesEvery(scope.excludedProviders, agendaProviderSchema.options)) return []
    let status
    try {
      status = await this.agendaStatus(userId)
    } catch (error) {
      this.logger.warn(`Statut agenda illisible (rendez-vous sans suite) : ${(error as Error).message}`)
      return []
    }
    if (!status.connected || !status.capabilities.read) return []

    try {
      const windowStart = new Date(now.getTime() - MEETING_FOLLOWUP_LOOKBACK_HOURS * 60 * 60 * 1000)
      // Perf 29/09/2026 — SECOND appel sortant vers l'agenda du fournisseur par
      // brief (fenêtre PASSÉE) : retenu 60 s par personne, une panne (levée
      // ici, donc attrapée plus bas) n'est jamais retenue.
      const { events } = await this.pastEventsCache.getOrLoad(scopedCacheKey(userId, scope.excludedProviders), () =>
        this.agenda.listEventsDetailed(
          userId,
          { from: windowStart.toISOString(), to: now.toISOString(), limit: 100 },
          scope,
        ),
      )
      const ended = selectEndedMeetingsAwaitingFollowup(
        events.filter(event => !event.cancelled),
        now,
      )
      if (!ended.length) return []

      const { workspaceId } = await this.resolveWorkspace(userId)
      const followedUp = await this.meetingNotes.manager.query<Array<{ source_event_id: string }>>(
        `SELECT DISTINCT source_event_id
           FROM notes
          WHERE workspace_id = $1
            AND source_event_id = ANY($2::text[])`,
        [workspaceId, ended.map(event => event.id)],
      )
      const followedUpIds = new Set(followedUp.map(row => row.source_event_id))
      return ended.filter(event => !followedUpIds.has(event.id))
    } catch (error) {
      this.logger.warn(`Rendez-vous sans suite illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /** Le mois précédent, en `YYYY-MM` — même fonction, dupliquée à l'identique
   *  dans `timesheets.service.ts` et `invoice-readiness.service.ts` : les
   *  importer ferait monter GA-07 pour quatre lignes pures. */
  private previousMonth(now: Date): string {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    return cursor.toISOString().slice(0, 7)
  }

  /**
   * #2107.9 / #2107.11 / #2107.16 — LE CRA, LA FACTURE PRÊTE, ET LA DONNÉE
   * BLOQUANTE — trois cartes NÉES DE LA MÊME LECTURE.
   *
   * Décidé sans Louis, reco appliquée (registre `.claude/notes/registre-2026-09-16-dashboard.md`,
   * #2107.9/#2107.11 : « décision à prendre par Louis, lever GA-07 avec
   * contrepartie, ou extraire `buildTimesheetLine` vers `@bellum/contracts`
   * pour que `briefing.service.ts` puisse le réutiliser sans import de
   * service »). Troisième voie retenue, moins coûteuse que les deux
   * pesées par le registre : `buildTimesheetLine` (`../delivery/timesheet-view`)
   * n'est PAS un service — l'IMPORTER ne fait pas monter GA-07 (voir le
   * commentaire d'import en tête de fichier) — et `assessInvoiceReadiness`
   * (`@bellum/contracts`) est DÉJÀ un contrat partagé. Aucune extraction,
   * aucun relèvement de cliquet : les deux dérivations existantes sont
   * réutilisées telles quelles, jamais recalculées.
   *
   * ⚠️ BORNÉ aux missions ACTIVES DE L'APPELANT (`financeScopeClause`, scope
   * `own` — sauf un rôle `finance:write`, qui lit l'espace entier, #2567 —
   * indépendamment du cloisonnement de portefeuille de
   * #2107.48 : « mes CRA », comme « mes tâches », se lit au singulier quel que
   * soit le réglage d'espace) et à `LIMIT 20` : la requête complète
   * d'`InvoiceReadinessService.list` (~90 lignes, huit jointures, dont deux
   * LATERAL) n'est PAS reproduite — ni la ventilation PAR CONSULTANT
   * (`mission_assignments`), ni les jalons déclarés, ni le nom de
   * l'interlocuteur de facturation, ni le connecteur fournisseur. Une seule
   * ligne par mission (le relevé le plus proche du niveau mission, sinon
   * n'importe lequel) suffit à une carte qui ne fait que dire « manquant »,
   * « prêt » ou « il manque X » — la fiche complète reste `/missions/:id`.
   *
   * ⚠️ Un échec ici rend un résultat VIDE pour les trois listes, même raison
   * que {@link buildStaleNeeds} : le brief du matin ne doit pas disparaître
   * parce qu'une lecture transverse a échoué.
   */
  private async buildInvoicingCards(
    userId: string,
    now: Date,
  ): Promise<{
    craMissing: Array<{ id: string; label: string }>
    invoicesReady: Array<{ id: string; label: string }>
    invoicingBlockedMissingData: Array<{
      id: string
      label: string
      blocker: 'missing_rate' | 'missing_po' | 'missing_billing_contact' | 'missing_start_date' | 'missing_cost'
    }>
    invoicesBlocked: Array<{ id: string; label: string; blocker: OtherInvoiceBlocker }>
  }> {
    const empty = { craMissing: [], invoicesReady: [], invoicingBlockedMissingData: [], invoicesBlocked: [] }
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      // #2107.9/#2107.11 — « les miennes » pour un commercial, jamais le
      // portefeuille de l'espace : voir le docblock ci-dessus.
      // #2567 (lot G2) — EXCEPTION NOMMÉE : un rôle qui TIENT la facturation
      // (`finance:write`, le back-office) relance les CRA de toute l'espace. Sur un
      // espace où personne ne porte les missions, son brief restait muet sur dix
      // CRA manquants (recette prod du 07/10). Le rôle change la PORTÉE de « à
      // relancer », jamais ce que les cartes disent.
      const wholeWorkspace = role !== undefined && hasPermission(role, 'finance:write')
      const scopeClause = financeScopeClause(
        wholeWorkspace ? { kind: 'workspace', workspaceId } : { kind: 'own', workspaceId, userId },
        'm',
        3,
      )
      const periodMonth = `${this.previousMonth(now)}-01`
      const today = now.toISOString().slice(0, 10)

      const rows = await this.accounts.manager.query<
        Array<{
          id: string
          label: string
          contract_kind: string | null
          started_on: string | null
          ends_on: string | null
          daily_rate: string | number | null
          billing_contact_id: string | null
          requires_po: boolean | null
          po_number: string | null
          billing_cadence: string | null
          loaded_daily_cost_cents: string | number | null
          po_valid_until: string | null
          ts_id: string | null
          ts_status: string | null
          ts_days: string | number | null
          ts_expected: string | number | null
          ts_explanation: string | null
          ts_anomalies: string[] | null
          na_id: string | null
          na_reason: string | null
          na_created_at: string | Date | null
        }>
      >(
        `SELECT m.id, m.label, m.contract_kind, m.started_on, m.ends_on, m.daily_rate, m.billing_contact_id,
                t.requires_po, t.po_number, t.billing_cadence, t.loaded_daily_cost_cents, t.po_valid_until,
                ts.id AS ts_id, ts.status AS ts_status, ts.days AS ts_days, ts.expected_days AS ts_expected,
                ts.gap_explanation AS ts_explanation, ts.anomalies AS ts_anomalies,
                na.id AS na_id, na.reason AS na_reason, na.created_at AS na_created_at
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
           -- Une seule ligne par mission : le relevé au niveau MISSION s'il
           -- existe (consultant_id IS NULL), sinon n'importe lequel — la
           -- ventilation par consultant reste celle de /delivery/releves.
           LEFT JOIN LATERAL (
             SELECT id, status, days, expected_days, gap_explanation, anomalies
               FROM mission_timesheets
              WHERE mission_id = m.id AND period_month = $2::date
              ORDER BY consultant_id NULLS FIRST
              LIMIT 1
           ) ts ON true
           LEFT JOIN LATERAL (
             SELECT id, reason, created_at
               FROM mission_timesheet_exceptions
              WHERE mission_id = m.id AND period_month = $2::date AND revoked_at IS NULL
              LIMIT 1
           ) na ON true
          WHERE m.workspace_id = $1
            AND m.status = 'active'
            AND (m.started_on IS NULL OR m.started_on <= ($2::date + interval '1 month' - interval '1 day'))
            AND (m.ends_on IS NULL OR m.ends_on >= $2::date)${scopeClause.sql}
          ORDER BY m.label ASC
          LIMIT 20`,
        [workspaceId, periodMonth, ...scopeClause.params],
      )

      const craMissing: Array<{ id: string; label: string }> = []
      const invoicesReady: Array<{ id: string; label: string }> = []
      const invoicingBlockedMissingData: Array<{
        id: string
        label: string
        blocker: 'missing_rate' | 'missing_po' | 'missing_billing_contact' | 'missing_start_date' | 'missing_cost'
      }> = []
      // #2095.6 — les AUTRES bloqueurs, une carte `invoice_blocked` chacun.
      const invoicesBlocked: Array<{ id: string; label: string; blocker: OtherInvoiceBlocker }> = []
      const MISSING_DATA_BLOCKERS = [
        'missing_rate',
        'missing_po',
        'missing_billing_contact',
        'missing_start_date',
        'missing_cost',
      ] as const

      for (const row of rows) {
        const craLine = buildTimesheetLine(
          {
            missionId: row.id,
            missionLabel: row.label,
            accountName: null,
            contractKind: (row.contract_kind as ContractKind) ?? 'inconnu',
            startedOn: row.started_on,
            endsOn: row.ends_on,
            consultantId: null,
            consultantName: null,
            row: row.ts_id
              ? {
                  id: row.ts_id,
                  days: Number(row.ts_days ?? 0),
                  status: row.ts_status as TimesheetStatus,
                  expectedDays: row.ts_expected === null ? null : Number(row.ts_expected),
                  gapExplanation: row.ts_explanation,
                  validatedByClientAt: null,
                  approverName: null,
                  anomalies: row.ts_anomalies ?? [],
                  remindersSent: 0,
                  lastReminderAt: null,
                  rejectedAt: null,
                  rejectionReason: null,
                  contestedDays: null,
                  correctionDeadline: null,
                  submittedByName: null,
                  internalReviewedAt: null,
                  internalReviewedByName: null,
                }
              : null,
            notApplicable:
              row.na_id && row.na_reason
                ? {
                    id: row.na_id,
                    reason: row.na_reason,
                    markedAt: row.na_created_at ? new Date(row.na_created_at).toISOString() : '',
                    markedByName: null,
                  }
                : null,
          },
          periodMonth,
          { today },
        )

        if (craLine.status === 'missing') {
          craMissing.push({ id: row.id, label: row.label })
          // #2107.16 — un CRA manquant a déjà SA carte (#2107.9) : ne pas en
          // produire une seconde pour la même mission sous « donnée bloquante ».
          continue
        }

        const readiness = assessInvoiceReadiness({
          timesheet:
            craLine.status === 'not_required'
              ? null
              : {
                  status: craLine.status,
                  days: craLine.days ?? 0,
                  anomalies: row.ts_anomalies ?? [],
                  gap: craLine.gap,
                  gapExplanation: craLine.gapExplanation,
                },
          dailyRateCents: row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100),
          requiresPo: row.requires_po ?? false,
          poNumber: row.po_number,
          invoicedAt: null,
          billingContactId: row.billing_contact_id,
          chargedCostCents: row.loaded_daily_cost_cents === null ? null : Number(row.loaded_daily_cost_cents),
          startedOn: row.started_on,
          expectsTimesheet: expectsTimesheet((row.contract_kind as ContractKind) ?? 'inconnu'),
          billingCadence: row.billing_cadence as BillingCadence | null,
          periodMonth,
          poValidUntil: row.po_valid_until,
        })

        if (readiness.state === 'ready') {
          invoicesReady.push({ id: row.id, label: row.label })
          continue
        }

        // #2107.16 — le PREMIER bloqueur « donnée manquante » de la liste
        // ordonnée par gravité (`INVOICE_BLOCKERS`) : un seul champ à la fois,
        // jamais une carte qui en énumère plusieurs.
        const missingDataBlocker = readiness.blockers.find(
          (blocker): blocker is (typeof MISSING_DATA_BLOCKERS)[number] =>
            (MISSING_DATA_BLOCKERS as readonly string[]).includes(blocker),
        )
        if (missingDataBlocker) {
          invoicingBlockedMissingData.push({ id: row.id, label: row.label, blocker: missingDataBlocker })
          continue
        }
        // #2095.6 — sinon, le PREMIER des AUTRES bloqueurs (même ordre de
        // gravité, `INVOICE_BLOCKERS`) : une carte, un bloqueur nommé.
        const otherBlocker = readiness.blockers.find((blocker): blocker is OtherInvoiceBlocker =>
          (OTHER_INVOICE_BLOCKERS as readonly string[]).includes(blocker),
        )
        if (otherBlocker) invoicesBlocked.push({ id: row.id, label: row.label, blocker: otherBlocker })
      }

      return { craMissing, invoicesReady, invoicingBlockedMissingData, invoicesBlocked }
    } catch (error) {
      this.logger.warn(`Cartes de facturation illisibles : ${(error as Error).message}`)
      return empty
    }
  }

  /**
   * #2106.9/#2107.1/#2107.2 (épopée #2801) — LA MÊME LECTURE que
   * `ProjectPipelineService.health` (`project-pipeline.service.ts`) : mêmes
   * colonnes (`id`, `stage`, `stage_entered_at`, `has_next_action` — `EXISTS`
   * sur `tasks`, jamais une seconde définition de « prochaine action » :
   * GA-54 a déjà refusé une réécriture de ce prédicat ailleurs). Le TRI
   * (`TRIAGED_STAGES`, les raisons `without_next_action`/`ageing`/`stale`)
   * reste dans `pipelineHealth` (`@bellum/contracts`), jamais recalculé ici.
   *
   * Importer `ProjectPipelineService` ferait monter GA-07 à son plafond
   * (276/276, zéro marge — #2107.9/.11) : la requête est RECOPIÉE, jamais
   * appelée, exactement comme `staleNeedsSql` recopie les prédicats de
   * `CrmRoutinesService` plutôt que de l'importer.
   *
   * `days` vient de la LECTURE, jamais recalculé en mémoire — même règle que
   * `staleNeeds.days`.
   */
  private async fetchProjectHealthRows(userId: string): Promise<
    Array<{
      id: string
      label: string
      company_name: string
      stage: string
      stage_entered_at: string | null
      has_next_action: boolean
      days: number
      // #3714.6 — `kind`/`owner_id` : sans eux, `pipelineHealth` (NO-GO
      // #2324.48, `isUnapprovedSignal`) ne peut jamais exclure un signal que
      // personne n'a adopté — divergence silencieuse avec
      // `ProjectPipelineService.health`, qui les lit déjà.
      kind: string | null
      owner_id: string | null
    }>
  > {
    const { workspaceId } = await this.resolveWorkspace(userId)
    return this.accounts.manager.query(
      `SELECT o.id, o.label, a.company_name,
              o.stage, o.kind, o.owner_id,
              o.stage_entered_at::text AS stage_entered_at,
              EXISTS (
                SELECT 1 FROM tasks tk WHERE tk.project_id = o.id AND ${taskStillOpenSql('tk')}
              ) AS has_next_action,
              FLOOR(EXTRACT(EPOCH FROM (now() - o.stage_entered_at)) / 86400)::int AS days
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id
        WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status NOT IN ('deleted', 'archived')`,
      [workspaceId],
    )
  }

  /**
   * #2106.9/#2107.1/#2107.2 (épopée #2801) — LES DEUX DIAGNOSTICS DE PIPE, POUR
   * LE BRIEF : les affaires SANS PROCHAINE ACTION, et les affaires
   * VIEILLISSANTES (fraîcheur dépassée, `ageing`/`stale`).
   *
   * Bloqué jusqu'à #2801 : sans `/projects/$id`, aucune des deux cartes n'avait
   * de dossier où ouvrir — le calcul (`pipelineHealth`) existait déjà côté
   * écran Pipe, jamais côté « Aujourd'hui ».
   *
   * UNE seule lecture (`fetchProjectHealthRows`) pour les deux raisons :
   * `pipelineHealth` les calcule déjà ensemble sur les MÊMES lignes, et les
   * séparer en deux appels ferait deux requêtes SQL identiques pour un seul
   * jeu de données.
   *
   * #2106.9 (recette 26/09, tranché sans Louis) — un projet créé À L'INSTANT
   * n'a, PAR CONSTRUCTION, encore rien dessus : le signaler dès sa création
   * serait du bruit, pas une alerte. `PROJECT_NO_NEXT_ACTION_MIN_AGE_DAYS`
   * retient la carte jusqu'au LENDEMAIN de sa création (même colonne `days`
   * que la carte elle-même — `stage_entered_at`, jamais un second calcul).
   * `pipelineHealth` lui-même reste inchangé : la colonne Pipe « Sans
   * prochaine action » n'a pas cette raison de bruit (elle affiche déjà
   * l'affaire, pas une alerte poussée) — le seuil est propre à CETTE carte.
   */
  private async buildProjectHealth(
    userId: string,
    now: Date,
  ): Promise<{
    withoutNextAction: Array<{ id: string; label: string; companyName: string }>
    stale: Array<{ id: string; label: string; companyName: string; days: number }>
  }> {
    try {
      const rows = await this.fetchProjectHealthRows(userId)
      const byId = new Map(rows.map(row => [row.id, row]))
      const { needsAttention } = pipelineHealth(rows, now)
      const withoutNextAction = needsAttention
        .filter(item => item.reasons.includes('without_next_action'))
        .map(item => byId.get(item.id))
        .filter((row): row is NonNullable<typeof row> => row !== undefined)
        .filter(row => row.days >= PROJECT_NO_NEXT_ACTION_MIN_AGE_DAYS)
        .map(row => ({ id: row.id, label: row.label, companyName: row.company_name }))
        .slice(0, 20)
      const stale = needsAttention
        .filter(item => item.reasons.includes('ageing') || item.reasons.includes('stale'))
        .map(item => byId.get(item.id))
        .filter((row): row is NonNullable<typeof row> => row !== undefined)
        .map(row => ({ id: row.id, label: row.label, companyName: row.company_name, days: row.days }))
        .slice(0, 20)
      return { withoutNextAction, stale }
    } catch (error) {
      this.logger.warn(`Affaires sans prochaine action/vieillissantes illisibles : ${(error as Error).message}`)
      return { withoutNextAction: [], stale: [] }
    }
  }

  /**
   * #2106.8 / #2107.7 — LES MISSIONS QUI ENTRENT DANS UNE FENÊTRE DE
   * RENOUVELLEMENT (J-45, J-30, J-15), POUR LE BRIEF.
   *
   * ⚠️ Cette lecture n'est PAS `DeliveryService.renewalsToAct` : l'importer
   * ferait monter le cliquet GA-07 (`module-boundaries.spec.ts`), déjà à son
   * plafond. Elle relit directement `missions`/`workspaces`, et classe avec
   * `renewalWindow` — la SEULE fonction du dépôt qui sait dire dans quelle
   * fenêtre tombe une mission (GA-26). L'échelle est celle de l'ESPACE
   * (`workspaces.renewal_window_days`), jamais 45/30/15 recopiés en dur —
   * un espace peut régler sa propre échelle.
   *
   * Seules j45/j30/j15 entrent : `imminent`/`overdue`/`far`/`unknown` sont
   * hors du périmètre des trois seuils demandés par #2107.7.
   *
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildChainBlockers} : le brief du matin ne doit pas disparaître
   * parce qu'une lecture transverse a échoué.
   */
  private async buildMissionsEndingSoon(
    userId: string,
    now: Date,
  ): Promise<
    Array<{
      id: string
      title: string
      renewal: 'j45' | 'j30' | 'j15'
      days: number
      thresholdDays: number
      endsOn: string | null
    }>
  > {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const scaleRows = await this.accounts.manager.query<Array<{ renewal_window_days: unknown }>>(
        `SELECT renewal_window_days FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      const scale = resolveRenewalWindowDays(scaleRows?.[0]?.renewal_window_days ?? null)
      // #2107.48 — même clause de périmètre que {@link missionsEndingSql}.
      const scopeClause = financeScopeClause(scope, 'm', 2)
      const rows = await this.accounts.manager.query<
        Array<{ id: string; label: string; ends_on: string | Date | null }>
      >(
        `SELECT m.id, m.label, m.ends_on
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status = 'active'
            AND m.ends_on IS NOT NULL${scopeClause.sql}
          ORDER BY m.ends_on ASC
          LIMIT 20`,
        [workspaceId, ...scopeClause.params],
      )
      const kept: Array<{
        id: string
        title: string
        renewal: 'j45' | 'j30' | 'j15'
        days: number
        thresholdDays: number
        endsOn: string | null
      }> = []
      for (const row of rows) {
        const endsOn = row.ends_on ? new Date(row.ends_on).toISOString() : null
        const window = renewalWindow(endsOn, now, scale)
        if (window !== 'j45' && window !== 'j30' && window !== 'j15') continue
        const days = daysUntilEnd(endsOn, now)
        if (days === null) continue
        kept.push({
          id: row.id,
          title: row.label,
          renewal: window,
          days,
          thresholdDays: renewalWindowBoundDays(window, scale) ?? days,
          endsOn,
        })
      }
      return kept
    } catch (error) {
      this.logger.warn(`Missions à échéance de renouvellement illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2107.10 — LES MISSIONS AU RENOUVELLEMENT NON ENGAGÉ, DANS LEUR FENÊTRE.
   *
   * Même lecture que {@link buildMissionsEndingSoon} (fenêtre J-45/J-30/J-15,
   * échelle de l'espace, `renewalWindow`) — mais filtrée sur
   * `missions.renewal_status` : `null` (personne n'a ouvert la ligne) ou
   * `'non_engage'` (ouverte, rien engagé) — jamais un statut qui affirmerait
   * une conversation en cours ou décidée (`RENEWAL_STATUSES`,
   * `packages/contracts/src/schemas/mission.ts`). Deux requêtes séparées
   * plutôt qu'une dérivation partagée : ce module lit le SCHÉMA, pas le
   * service voisin (GA-07).
   *
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildChainBlockers}.
   */
  private async buildRenewalsNotEngaged(
    userId: string,
    now: Date,
  ): Promise<Array<{ id: string; title: string; days: number }>> {
    try {
      const { workspaceId, role } = await this.resolveWorkspace(userId)
      const scope = await this.myScope(userId, workspaceId, role)
      const scaleRows = await this.accounts.manager.query<Array<{ renewal_window_days: unknown }>>(
        `SELECT renewal_window_days FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      const scale = resolveRenewalWindowDays(scaleRows?.[0]?.renewal_window_days ?? null)
      // #2107.48 — même clause de périmètre que {@link missionsEndingSql}.
      const scopeClause = financeScopeClause(scope, 'm', 2)
      const rows = await this.accounts.manager.query<
        Array<{ id: string; label: string; ends_on: string | Date | null }>
      >(
        `SELECT m.id, m.label, m.ends_on
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status = 'active'
            AND m.ends_on IS NOT NULL
            AND (m.renewal_status IS NULL OR m.renewal_status = 'non_engage')${scopeClause.sql}
          ORDER BY m.ends_on ASC
          LIMIT 20`,
        [workspaceId, ...scopeClause.params],
      )
      const kept: Array<{ id: string; title: string; days: number }> = []
      for (const row of rows) {
        const endsOn = row.ends_on ? new Date(row.ends_on).toISOString() : null
        const window = renewalWindow(endsOn, now, scale)
        if (window !== 'j45' && window !== 'j30' && window !== 'j15') continue
        const days = daysUntilEnd(endsOn, now)
        if (days === null) continue
        kept.push({ id: row.id, title: row.label, days })
      }
      return kept
    } catch (error) {
      this.logger.warn(`Renouvellements non engagés illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2106.6 — LES CONSULTANTS QUI SE LIBÈRENT SOUS {@link CONSULTANT_FREEING_SOON_DAYS} JOURS.
   *
   * Même prédicat que `consultantsFreeingSoon` (`laura-probe.service.ts:286`),
   * qui ne rend qu'un COMPTE pour la sonde d'espace : « toutes les affectations
   * en cours d'une personne finissent dans la fenêtre, et aucune n'est SANS
   * fin » — une seule affectation sans fin suffit à ne pas la compter, parce
   * qu'on ne peut alors promettre aucune date. Cette lecture-ci rend, en plus
   * du compte, l'IDENTITÉ (pour la carte) et l'échéance la plus tardive.
   *
   * ⚠️ Cette requête n'est PAS `LauraProbeService.probe` : l'importer ferait
   * monter le cliquet GA-07 (`module-boundaries.spec.ts`) pour un seul champ —
   * même choix, et même raison, que {@link buildMissionsEndingSoon} juste
   * au-dessus vis-à-vis de `DeliveryService`. Le SEUIL de jours est donc
   * DUPLIQUÉ ici plutôt qu'importé : `CONSULTANT_FREEING_SOON_DAYS` porte le
   * commentaire qui pointe vers sa source unique.
   *
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildChainBlockers} : le brief du matin ne doit pas disparaître
   * parce qu'une lecture transverse a échoué.
   */
  private async buildConsultantsFreeingSoon(
    userId: string,
    now: Date,
  ): Promise<Array<{ id: string; name: string; days: number; endsOn: string | null }>> {
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.accounts.manager.query<
        Array<{ consultant_id: string; full_name: string; ends_on: string | Date | null }>
      >(
        `SELECT a.consultant_id, c.full_name, max(a.ends_on) AS ends_on
           FROM mission_assignments a
           JOIN consultants c ON c.id = a.consultant_id AND c.archived_at IS NULL
          WHERE a.workspace_id = $1
            AND a.starts_on <= current_date
            AND (a.ends_on IS NULL OR a.ends_on >= current_date)
          GROUP BY a.consultant_id, c.full_name
         HAVING count(*) FILTER (WHERE a.ends_on IS NULL) = 0
            AND max(a.ends_on) <= (current_date + ($2 || ' days')::interval)::date
          ORDER BY max(a.ends_on) ASC
          LIMIT 20`,
        [workspaceId, CONSULTANT_FREEING_SOON_DAYS],
      )
      const kept: Array<{ id: string; name: string; days: number; endsOn: string | null }> = []
      for (const row of rows) {
        const endsOn = row.ends_on ? new Date(row.ends_on).toISOString() : null
        const days = daysUntilEnd(endsOn, now)
        if (days === null) continue
        kept.push({ id: row.consultant_id, name: row.full_name, days, endsOn })
      }
      return kept
    } catch (error) {
      this.logger.warn(`Consultants bientôt disponibles illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2107.6 — LES DISPONIBILITÉS JAMAIS RECONFIRMÉES DEPUIS PLUS DE
   * {@link AVAILABILITY_RECONFIRM_AFTER_DAYS} JOURS.
   *
   * Même prédicat que `TalentRoutinesService.availabilityToReconfirm`
   * (`routines/talent-routines.service.ts`) — une routine du vivier déjà
   * existante, jamais wirée à « Aujourd'hui » avant ce lot. Les TROIS mêmes
   * exclusions : `availability_checked_at IS NULL` ne remonte jamais (jamais
   * saisie n'est pas « saisie il y a longtemps »), une fiche archivée ne
   * remonte pas, `availability = 'inconnu'` ne remonte pas (rien à
   * reconfirmer).
   *
   * ⚠️ Cette requête n'est PAS `TalentRoutinesService` : l'importer ferait
   * monter le cliquet GA-07 (`module-boundaries.spec.ts`) pour une seule
   * lecture — même choix, même raison, que {@link buildConsultantsFreeingSoon}
   * juste au-dessus vis-à-vis de `laura-probe.service.ts`. Le SEUIL est donc
   * DUPLIQUÉ ici : {@link AVAILABILITY_RECONFIRM_AFTER_DAYS} porte le
   * commentaire qui pointe vers sa source unique.
   *
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildConsultantsFreeingSoon} : le brief du matin ne doit pas
   * disparaître parce qu'une lecture transverse a échoué.
   */
  private async buildAvailabilityToReconfirm(
    userId: string,
  ): Promise<Array<{ id: string; name: string; days: number }>> {
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.accounts.manager.query<Array<{ id: string; full_name: string; days: number }>>(
        `SELECT c.id, c.full_name,
                FLOOR(EXTRACT(EPOCH FROM (now() - c.availability_checked_at)) / 86400)::int AS days
           FROM consultants c
          WHERE c.workspace_id = $1
            AND c.archived_at IS NULL
            AND c.availability_checked_at IS NOT NULL
            AND c.availability <> 'inconnu'
            AND c.availability_checked_at < now() - ($2 || ' days')::interval
          ORDER BY c.availability_checked_at ASC
          LIMIT 20`,
        [workspaceId, AVAILABILITY_RECONFIRM_AFTER_DAYS],
      )
      return rows.map(row => ({ id: row.id, name: row.full_name, days: Number(row.days) }))
    } catch (error) {
      this.logger.warn(`Disponibilités à reconfirmer illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2107.15 — LES CONNECTEURS CONNECTÉS MAIS DÉGRADÉS, POUR LE BRIEF.
   *
   * Même prédicat que `RoutinesService.connectorHealth` (`read_only` : connecté
   * mais sans droit d'écriture) — lu ici directement sur `AgendaService` et
   * `MailboxService`, déjà injectés dans ce service pour leurs propres blocs.
   * Aucun import cross-module de plus (GA-07 est à son plafond). Le CRM en
   * reste hors, faute du service correspondant ici — voir le registre.
   *
   * ⚠️ La déconnexion pure (`!status.connected`) n'entre PAS ici : elle est
   * déjà montrée par les blocs agenda/mail eux-mêmes (`state: 'not_connected'`)
   * — la doubler serait un second rendu du même fait (même règle que
   * `mergeActionsCallingTheSameDestination`).
   */
  private async buildBrokenConnectors(
    userId: string,
  ): Promise<Array<{ tool: 'mailbox' | 'agenda' | 'crm'; state: 'read_only' | 'disconnected' }>> {
    const broken: Array<{ tool: 'mailbox' | 'agenda' | 'crm'; state: 'read_only' | 'disconnected' }> = []
    const [mailbox, agenda] = await Promise.allSettled([this.mailboxStatus(userId), this.agendaStatus(userId)])
    if (mailbox.status === 'fulfilled' && mailbox.value.connected && !mailbox.value.capabilities.draft) {
      broken.push({ tool: 'mailbox', state: 'read_only' })
    }
    if (agenda.status === 'fulfilled' && agenda.value.connected && !agenda.value.capabilities.write) {
      broken.push({ tool: 'agenda', state: 'read_only' })
    }
    // #2107.15 (L1, 31/10/2026) — le CRM, que ce service ne lisait pas : lu
    // directement sur `crm_connections.refresh_failed_at`, le SEUL fait qui
    // prouve qu'une reconnexion est nécessaire (`crm-connection.entity.ts`) —
    // aucun service CRM importé (GA-07). Le lien est PARTAGÉ par l'espace.
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.accounts.manager.query<Array<{ provider: string }>>(
        `SELECT provider FROM crm_connections
          WHERE workspace_id = $1 AND refresh_failed_at IS NOT NULL
          LIMIT 1`,
        [workspaceId],
      )
      if (rows.length > 0) broken.push({ tool: 'crm', state: 'disconnected' })
    } catch (error) {
      this.logger.warn(`Connexion CRM illisible : ${(error as Error).message}`)
    }
    return broken
  }

  /**
   * #2107.4 — LES PROFILS ENVOYÉS SANS AUCUN RETOUR, POUR LE BRIEF.
   *
   * `submissions.stage = 'submitted'` ET `first_feedback_at IS NULL` —
   * « toujours rien », une information portée par la colonne elle-même,
   * jamais un `0` déduit. `submitted_at` est le point de départ (déduire de
   * `created_at` compterait la sélection interne comme du temps client, même
   * raison que `submission.entity.ts`).
   *
   * ⚠️ CORRECTIF DE LECTURE INERTE (recette écran #2107.4, prod `1371ef9d38`,
   * 25/09/2026) : le prédicat lisait `s.substatus = 'presented'`
   * (`SUBMISSION_SUBSTATUSES`, `@bellum/contracts`) — en apparence l'ÉTAT
   * d'entrée de l'étape `submitted` (`deriveSubstatusFromStage`), mais mesuré
   * `null` sur les candidatures RÉELLEMENT soumises en production. `substatus`
   * n'est posé QUE par `SubmissionsService.create()`/`advance()`
   * (`submission.ts` : « `null` sur une ligne créée avant #2335.1 : jamais
   * deviné ») — une ligne née avant ce lot, ou touchée par un chemin qui ne
   * repasse pas par ces deux méthodes, garde `substatus IS NULL` pour
   * toujours ; rien ne la rattrape. `stage`, lui, est la colonne D'ORIGINE
   * (six valeurs, jamais nulle) : elle porte la même vérité (« le CV est
   * PARTI chez le client », `submission.ts:38`) sans dépendre d'une écriture
   * additive qui peut être absente. Le prédicat s'appuie donc sur ce qui est
   * RÉELLEMENT écrit sur CHAQUE ligne, plutôt que d'attendre un écrivain de
   * plus sur les lignes déjà en base.
   *
   * ⚠️ Lecture directe du SCHÉMA en SQL brut (`this.accounts.manager.query`,
   * même patron que {@link buildMissionsWithoutEndDate}), pas
   * `SubmissionsService`/`ConsultantsService` : GA-07 est à son plafond, et
   * une requête brute sur `submissions`/`consultants` ne demande d'ailleurs
   * AUCUNE entité de plus à enregistrer ici (`EntityManager.query` n'est pas
   * scopé à une entité).
   *
   * ⚠️ Un échec ici rend une liste VIDE, même raison que
   * {@link buildStaleNeeds}.
   */
  private async buildSubmissionsWithoutResponse(
    userId: string,
  ): Promise<Array<{ consultantId: string; consultantName: string; days: number }>> {
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.accounts.manager.query<
        Array<{ consultant_id: string; consultant_name: string; days: number }>
      >(
        // R22 /briefing — UNE ligne par consultant (son plus ancien envoi sans retour) : un profil positionné sur deux
        // besoins n'est pas deux profils en attente. Le dédoublonnage se fait AVANT la limite, pas après.
        `SELECT consultant_id, consultant_name, days
           FROM (
             SELECT DISTINCT ON (s.consultant_id)
                    s.consultant_id, c.full_name AS consultant_name, s.submitted_at,
                    FLOOR(EXTRACT(EPOCH FROM (now() - s.submitted_at)) / 86400)::int AS days
               FROM submissions s
               JOIN consultants c ON c.id = s.consultant_id
              WHERE s.workspace_id = $1
                AND s.stage = 'submitted'
                AND s.first_feedback_at IS NULL
                AND s.submitted_at IS NOT NULL
                AND s.submitted_at < now() - ($2 || ' days')::interval
              ORDER BY s.consultant_id, s.submitted_at ASC
           ) oldest
          ORDER BY submitted_at ASC
          LIMIT 20`,
        [workspaceId, SUBMISSION_NO_RESPONSE_AFTER_DAYS],
      )
      // Ceinture et bretelles : une ligne par consultant, la plus ancienne, quel que soit l'ordre reçu.
      const oldest = new Map<string, { consultantId: string; consultantName: string; days: number }>()
      for (const row of rows) {
        const days = Number(row.days)
        const known = oldest.get(row.consultant_id)
        if (!known || days > known.days) {
          oldest.set(row.consultant_id, { consultantId: row.consultant_id, consultantName: row.consultant_name, days })
        }
      }
      return [...oldest.values()].sort((a, b) => b.days - a.days)
    } catch (error) {
      this.logger.warn(`Profils sans retour illisibles : ${(error as Error).message}`)
      return []
    }
  }

  private async buildChainBlockers(userId: string): Promise<ChainBlocker[]> {
    if (!this.chains) return []
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      return await this.chains.blockers(workspaceId)
    } catch (error) {
      this.logger.warn(`Blocages de parcours illisibles : ${(error as Error).message}`)
      return []
    }
  }

  /**
   * CE QUI A BOUGÉ DEPUIS LA DERNIÈRE VISITE — les six lignes typées.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE ROUTE À PART, ET PAS UN CHAMP DE `GET /briefing/today`
   * ───────────────────────────────────────────────────────────────────────────
   * La fenêtre `since` est le repère `previous_seen_at`, et le seul moyen de
   * l'obtenir est `POST /actions/mark-seen`, qui LIT ET ÉCRIT dans le même
   * appel. L'appeler depuis `build()` déplacerait un effet de bord dans un
   * `@Get` — et surtout, le repère avancerait à chaque rafraîchissement
   * automatique du brief (toutes les 5 minutes), donc la fenêtre se refermerait
   * sous les yeux de celui qui la lit. Le client détient déjà le repère, figé
   * pour sa session ; il le PASSE.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LES CINQ LECTURES SONT INDÉPENDANTES, ET LEURS ÉCHECS AUSSI
   * ───────────────────────────────────────────────────────────────────────────
   * Chaque méthode capture SA propre erreur : une messagerie en panne ne doit
   * pas effacer un changement de poste. Chaque ligne porte SON état, et une
   * ligne qui n'a pas pu être mesurée vaut `count: null` — jamais zéro. C'est
   * la seule chose que ce bloc doit tenir : « on a regardé, rien n'a bougé » et
   * « on n'a pas pu regarder » appellent deux gestes opposés, et un « 0 » les
   * confond.
   *
   * Aucune de ces lectures ne consomme de crédit ni n'appelle un fournisseur
   * payant : quatre lisent nos propres tables, celle des réponses ne demande
   * à la messagerie que son STATUT de connexion.
   */
  async sinceLastVisit(userId: string, since: Date): Promise<SinceLastVisitDigest> {
    const sinceMs = since.getTime()
    let workspaceId: string
    try {
      ;({ workspaceId } = await this.resolveWorkspace(userId))
    } catch (error) {
      // Sans espace résolu, AUCUNE des quatre lignes n'est mesurable. Les
      // rendre à zéro annoncerait « rien n'a bougé » à quelqu'un dont on ne
      // sait même pas lire le périmètre.
      this.logger.warn(`Briefing since-last-visit: workspace unresolved — ${(error as Error).message}`)
      return {
        since: since.toISOString(),
        lines: SINCE_LAST_VISIT_LINES.map(kind => unmeasuredLine(kind, 'unavailable', 'workspace_unresolved')),
        expiredItemsCount: null,
        treatedByColleagueCount: null,
      }
    }

    // #2106.30/.31 — les deux agrégats du résumé condensé de longue absence ne
    // sont calculés qu'au-delà du seuil : ils n'ont aucun lecteur en-deçà (le
    // bandeau condensé est le seul), et deux requêtes de plus sur CHAQUE visite
    // normale n'achèteraient rien.
    const isLongAbsence = Date.now() - sinceMs >= LONG_ABSENCE_DAYS * 24 * 60 * 60 * 1000

    const [
      signals,
      replies,
      jobChanges,
      missions,
      attackAnglesAdded,
      nightRoutinesRun,
      expiredItemsCount,
      treatedByColleagueCount,
    ] = await Promise.all([
      this.signalsLine(workspaceId, sinceMs),
      this.repliesLine(userId, workspaceId, since),
      this.jobChangesLine(workspaceId, since),
      this.missionsLine(workspaceId, since),
      this.attackAnglesLine(workspaceId, since),
      this.nightRoutinesLine(userId, since),
      isLongAbsence ? this.expiredItemsCount(userId, since) : Promise.resolve(null),
      isLongAbsence ? this.treatedByColleagueCount(userId, workspaceId, since) : Promise.resolve(null),
    ])

    return {
      since: since.toISOString(),
      lines: [signals, replies, jobChanges, missions, attackAnglesAdded, nightRoutinesRun],
      expiredItemsCount,
      treatedByColleagueCount,
    }
  }

  /**
   * #2106.30 (épopée #2802) — combien d'actions du plan de CET utilisateur ont
   * une `due_date` tombée DANS la fenêtre d'absence et jamais traitée
   * (`execution_status` toujours `todo`) : « ça devait se faire pendant que tu
   * n'étais pas là, et ça ne s'est pas fait ». Colonnes déjà existantes
   * (`ActionPlanItemEntity.due_date`/`.execution_status`) — aucune nouvelle
   * table, aucune journalisation neuve requise pour un premier compte VRAI.
   *
   * ⚠️ Ne compte QUE ce qui reste `todo` au moment de la lecture : une action
   * faite en retard n'a plus rien d'un point qui « a expiré sans que personne
   * ne s'en occupe », et une action reportée (`snoozed`) porte déjà sa propre
   * trace ailleurs (Rappels de relance).
   */
  private async expiredItemsCount(userId: string, since: Date): Promise<number | null> {
    try {
      const sinceDate = since.toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      return await this.actionPlanItems
        .createQueryBuilder('item')
        .where('item.user_id = :userId', { userId })
        .andWhere("item.execution_status = 'todo'")
        .andWhere('item.due_date IS NOT NULL')
        .andWhere('item.due_date > :sinceDate', { sinceDate })
        .andWhere('item.due_date <= :today', { today })
        .getCount()
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: expired items unavailable — ${(error as Error).message}`)
      return null
    }
  }

  /**
   * #2106.31 (épopée #2802) — combien d'actions un AUTRE membre de l'espace a
   * journalisées (`user_actions`) pendant l'absence de CET utilisateur.
   *
   * ⚠️ Un COMPTE serveur sur la fenêtre ENTIÈRE, jamais un filtre posé sur les
   * lignes déjà tronquées que `ActionsService.listHistory` sert au Journal
   * (`SINCE_LAST_VISIT_MAX_ROWS` = 4 côté client) — compter dessus
   * sous-compterait sur une absence de plusieurs semaines, exactement le
   * chiffre invérifiable que la doctrine refuse. Même exclusion que
   * `listHistory` : `analysis_completed` double la ligne de lancement
   * (`analysis_started`), la compter romprait la parité entre les deux écrans.
   */
  private async treatedByColleagueCount(userId: string, workspaceId: string, since: Date): Promise<number | null> {
    try {
      return await this.userActions
        .createQueryBuilder('action')
        .where(`action.${WORKSPACE_SCOPE_COLUMN} = :workspaceId`, { workspaceId })
        .andWhere('action.user_id <> :userId', { userId })
        .andWhere('action.created_at > :since', { since })
        .andWhere("action.action_type <> 'analysis_completed'")
        .getCount()
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: treated-by-colleague unavailable — ${(error as Error).message}`)
      return null
    }
  }

  /**
   * « 3 nouveaux signaux sur 2 comptes ».
   *
   * La règle — un signal ACTIF dont la première détection tombe dans la
   * fenêtre — n'est pas écrite ici : c'est {@link signalsDetectedSince}, la
   * même que le bloc « comptes qui ont bougé » applique à 48 heures.
   *
   * ⚠️ On passe par {@link SignalHistoryService.queryForWorkspace} et non par
   * `listForWorkspace` : la seconde AVALE son erreur et rend `[]`, ce qui
   * ferait afficher « rien n'a bougé » quand la lecture a échoué — le défaut
   * exact que ce bloc existe pour ne plus commettre.
   */
  private async signalsLine(workspaceId: string, sinceMs: number): Promise<SinceLastVisitLine> {
    try {
      const rows = await this.signalHistory.queryForWorkspace(workspaceId)
      const { signals, accountIds } = signalsDetectedSince(rows, sinceMs)
      return measuredLine('account_signals', signals, accountIds.size)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: signals unavailable — ${(error as Error).message}`)
      return unmeasuredLine('account_signals', 'unavailable', 'signals_unavailable')
    }
  }

  /**
   * « 2 réponses depuis hier ».
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUI EST COMPTÉ, ET CE QUI NE SORT JAMAIS
   * ───────────────────────────────────────────────────────────────────────────
   * Un COMPTE de messages entrants, lu sur `activities.direction = 'inbound'` —
   * une métadonnée, la même direction que la capture de messagerie écrit. Le
   * CORPS d'un message ne sort ni vers un humain tiers ni vers le modèle (D65) :
   * cette requête ne SÉLECTIONNE aucun corps, aucun objet, aucun extrait. Elle
   * ne peut donc pas en laisser fuiter un.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI L'ÉTAT VIENT DE LA MESSAGERIE ET PAS DE LA TABLE
   * ───────────────────────────────────────────────────────────────────────────
   * Sans messagerie connectée, la table ne porte simplement AUCUN entrant :
   * compter dessus rendrait « 0 réponse » à quelqu'un qui en a peut-être reçu
   * dix. « 0 réponse reçue » est vrai si on a su regarder ; il est faux si la
   * messagerie n'est pas branchée — et les deux appellent des gestes opposés
   * (attendre, ou aller brancher). L'état de la ligne est donc celui de la
   * capacité, exactement comme le bloc messagerie du brief le fait déjà.
   *
   * Et puisque l'état vient de MA messagerie, le compte vient de MES échanges :
   * un décompte à l'échelle de l'espace annoncerait « on t'a répondu » sous les
   * réponses reçues par un collègue. Les activités sans auteur identifié
   * (`user_id NULL` — un échange que Bellum n'a rattaché à personne) en sortent
   * donc, et c'est le bon verdict : elles ne sont une réponse à personne.
   */
  private async repliesLine(userId: string, workspaceId: string, since: Date): Promise<SinceLastVisitLine> {
    let status
    try {
      status = await this.mailboxStatus(userId)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: mailbox status failed — ${(error as Error).message}`)
      return unmeasuredLine('replies_received', 'unavailable', 'mailbox_status_failed')
    }
    if (!status.connected) return unmeasuredLine('replies_received', 'not_connected', 'mailbox_not_connected')
    if (!status.capabilities.read)
      return unmeasuredLine('replies_received', 'missing_scope', 'mailbox_read_scope_missing')

    try {
      const count = await this.activities.count({
        where: { workspace_id: workspaceId, user_id: userId, direction: 'inbound', occurred_at: MoreThan(since) },
      })
      return measuredLine('replies_received', count)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: replies unavailable — ${(error as Error).message}`)
      return unmeasuredLine('replies_received', 'unavailable', 'replies_unavailable')
    }
  }

  /**
   * « un contact a changé d'entreprise — porte neuve ».
   *
   * La règle « son employeur courant n'est plus ce compte » n'est pas réécrite
   * ici : c'est {@link contactSourceTag}, qui rend `RISQUE`, et que quatre
   * modules appliquent déjà (fiche contact, télémétrie, séquences, score).
   * Elle est volontairement CONSERVATRICE — sans employeur courant connu, elle
   * ne conclut rien — et c'est ce qu'on veut d'une ligne qui annonce une porte.
   *
   * La fenêtre porte sur `last_enrichment_at` : c'est l'instant où l'on a APPRIS
   * le changement, la seule date que ce fait possède. La date du changement
   * lui-même n'est nulle part, et la deviner ferait apparaître « depuis ta
   * dernière visite » un départ vieux de deux ans.
   *
   * ⚠️ Un contact sans compte lisible est SAUTÉ, jamais compté : `RISQUE` se
   * décide en comparant à un nom de société, et comparer à une chaîne vide
   * rendrait « a changé d'entreprise » pour tout le monde.
   */
  private async jobChangesLine(workspaceId: string, since: Date): Promise<SinceLastVisitLine> {
    try {
      const rows = await this.contacts.find({
        where: {
          workspace_id: workspaceId,
          deleted_at: IsNull(),
          excluded_at: IsNull(),
          last_enrichment_at: MoreThan(since),
        },
        select: ['id', 'account_id', 'source', 'entity', 'raw_data'],
        take: JOB_CHANGE_SCAN_LIMIT,
      })
      if (rows.length === 0) return measuredLine('job_changes', 0)
      // La borne a coupé : on ne sait plus combien il y en a. Rendre les deux
      // cents premiers comme un total serait un chiffre faux et invérifiable.
      if (rows.length >= JOB_CHANGE_SCAN_LIMIT) {
        return unmeasuredLine('job_changes', 'partial', 'job_changes_truncated')
      }

      // #1473 — `filter(Boolean)` ne NARROWE pas le type ; le prédicat le fait,
      // et c'est lui qui garantit qu'aucun `null` n'entre dans le `where`.
      const accountIds = [...new Set(rows.map(row => row.account_id))].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
      const accounts = await this.accounts.find({
        where: accountIds.map(id => ({ id, status: Not(In([...UNCITED_ACCOUNT_STATUSES])) })),
        select: ['id', 'company_name'],
      })
      const companyById = new Map(accounts.map(account => [account.id, account.company_name]))

      let moved = 0
      for (const row of rows) {
        // Un contact à qualifier n'a pas d'employeur CONNU : il ne peut donc pas
        // avoir « changé d'employeur ». Il ne compte ni dans un sens ni dans
        // l'autre — l'absence de compte n'est pas un non-changement mesuré.
        const companyName = row.account_id ? companyById.get(row.account_id) : undefined
        if (!companyName) continue
        const apolloDetails = (row.raw_data as { apolloDetails?: ContactApolloDetails } | null)?.apolloDetails
        if (contactSourceTag(row.source ?? null, apolloDetails, companyName, row.entity ?? null) === 'RISQUE')
          moved += 1
      }
      return measuredLine('job_changes', moved)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: job changes unavailable — ${(error as Error).message}`)
      return unmeasuredLine('job_changes', 'unavailable', 'job_changes_unavailable')
    }
  }

  /**
   * « 1 mission passe sous 30 jours de fin ».
   *
   * On compte les INTERVENTIONS `renewal_at_risk` ouvertes pendant la fenêtre,
   * pas des missions : le seuil de trente jours
   * (`INTERVENTION_THRESHOLDS.renewalHorizonDays`) est appliqué UNE fois, par le
   * balayeur, à l'endroit où il vit. Le recalculer ici en donnerait une seconde
   * lecture — et `opened_at` est justement l'instant où la mission a CROISÉ le
   * seuil, c'est-à-dire exactement ce que « depuis ta dernière visite » demande.
   *
   * ⚠️ Le balayeur EXCLUT les espaces de démonstration : la ligne y est muette,
   * et c'est écrit dans `demo-coverage.ts` plutôt que découvert en réunion.
   */
  private async missionsLine(workspaceId: string, since: Date): Promise<SinceLastVisitLine> {
    try {
      const count = await this.interventions.count({
        where: { workspace_id: workspaceId, kind: RENEWAL_AT_RISK, opened_at: MoreThan(since) },
      })
      return measuredLine('missions_moving', count)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: missions unavailable — ${(error as Error).message}`)
      return unmeasuredLine('missions_moving', 'unavailable', 'missions_unavailable')
    }
  }

  /**
   * « 2 nouveaux angles d'attaque ».
   *
   * #2803 (#2389.4) — Opportunités : un angle d'attaque CRÉÉ pendant la fenêtre,
   * compté sur `created_at`, la seule date que la table porte. Aucune notion de
   * lecture/non-lecture n'existe sur `attack_angles` : compter les lignes créées
   * est donc la seule mesure disponible, la même limite que `missionsLine`
   * assume déjà pour les interventions.
   *
   * Table à nous, jamais un connecteur : le seul silence atteignable est
   * `unavailable` (la lecture a échoué), jamais `not_connected`.
   */
  private async attackAnglesLine(workspaceId: string, since: Date): Promise<SinceLastVisitLine> {
    try {
      const count = await this.attackAngles.count({ where: { workspace_id: workspaceId, created_at: MoreThan(since) } })
      return measuredLine('attack_angles_added', count)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: attack angles unavailable — ${(error as Error).message}`)
      return unmeasuredLine('attack_angles_added', 'unavailable', 'attack_angles_unavailable')
    }
  }

  /**
   * « 2 routines de nuit ont trouvé quelque chose ».
   *
   * #2803 (#2389.4) — Travaux nocturnes : on compte les exécutions `notified:
   * true` de la fenêtre, jamais toutes les exécutions. Le balayeur tourne
   * toutes les quinze minutes qu'il ait ou non quelque chose à dire
   * (`RoutineRunEntity.outcome`) ; compter CHAQUE passage annoncerait un
   * volume d'activité sans rapport avec ce qui a été porté à l'utilisateur —
   * `notified` est justement le champ qui sépare « a tourné » de « a parlé ».
   *
   * Scopé par UTILISATEUR, pas par espace : `run_key` (`RoutineRunEntity`) est
   * lui-même une clé par utilisateur, comme `repliesLine` juste au-dessus.
   *
   * Table à nous, jamais un connecteur : le seul silence atteignable est
   * `unavailable`, jamais `not_connected`.
   */
  private async nightRoutinesLine(userId: string, since: Date): Promise<SinceLastVisitLine> {
    try {
      const count = await this.routineRuns.count({
        where: { user_id: userId, notified: true, created_at: MoreThan(since) },
      })
      return measuredLine('night_routines_run', count)
    } catch (error) {
      this.logger.warn(`Briefing since-last-visit: night routines unavailable — ${(error as Error).message}`)
      return unmeasuredLine('night_routines_run', 'unavailable', 'night_routines_unavailable')
    }
  }

  /**
   * Le brief d'une salle de démonstration.
   *
   * Le CONTENU est scripté ; le TRI ne l'est pas. Les actions passent par le
   * même `buildBriefingActions` que le vrai brief, sinon la démo montrerait un
   * classement que le produit ne sait pas produire.
   */
  private async buildDemo(
    userId: string,
    now: Date,
    timeZone: string,
    readAs?: WorkspaceRole | null,
  ): Promise<DailyBriefing> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    // #1936.11 — la démo lit le rôle du visiteur comme le vrai brief : la parité
    // porte sur ce qu'on VOIT, et l'ordre des cartes en fait partie.
    const { workspaceId, role } = await this.resolveWorkspace(userId)
    const seeded = await this.accounts.find({
      where: { workspace_id: workspaceId, status: Not(In([...UNCITED_ACCOUNT_STATUSES])) },
      // #2097.21 (correctif) — `website` en plus : les cinq dossiers de la
      // salle portent de VRAIES sociétés (SNCF, Société Générale…), avec leur VRAI
      // site — `logo_url`, lui, reste `null` à dessein (doctrine
      // `demo-dataset.ts` : on ne persiste pas la marque d'un tiers). Le
      // favicon réel qu'un site sert publiquement n'est pas concerné par
      // cette règle, exactement comme sur `/accounts` en salle.
      select: ['id', 'company_name', 'website'],
      // #3287 reste — même correctif, même raison que `allActionsDemo` juste
      // au-dessus (câblage VOLONTAIREMENT dupliqué entre les deux méthodes).
      order: { created_at: 'ASC' },
      take: 3,
    })

    const briefing = demoBriefing({
      now,
      timeZone,
      // Salle démo : la persona, jamais le prénom du compte réel qui la visite (R21-FIX, 15/10).
      firstName: DEMO_OWNER.first_name,
      accounts: seeded.map(account => ({
        accountId: account.id,
        companyName: account.company_name,
        website: account.website ?? null,
      })),
    })

    // #3414 (recette 02/10) — « Chargement du brief du jour… » dépassait 20 s en salle : les quinze
    // lectures ci-dessous étaient AWAITÉES l'une après l'autre. Elles sont indépendantes (aucune ne lit
    // le résultat d'une autre) : la production les lance déjà ensemble (`build()`), la salle aussi.
    const [
      tasksBlock,
      chainBlockers,
      criticalRisks,
      staleNeeds,
      missionsEnding,
      overdueInvoices,
      rfpsDueSoon,
      missionsWithoutEndDate,
      renewalsNotEngaged,
      submissionsWithoutResponse,
      rfpsWithUncoveredRequirements,
      accountsWithoutOwner,
      contactsBounced,
      meetingsWithoutFollowup,
      projectHealth,
      engineCards,
    ] = await Promise.all([
      // Les tâches de la salle sont lues par le CHEMIN DE PRODUCTION : elles sont
      // seedées comme le reste du jeu, et les scripter ici montrerait une liste
      // que le produit ne sait pas produire.
      this.buildTasksBlock(userId, now),
      // Les blocages de parcours passent eux aussi par le CHEMIN DE PRODUCTION.
      // Ils se dérivent des objets de la salle — comptes, besoins, projets,
      // missions — qui sont de vrais objets : les scripter montrerait une liste
      // que le produit ne sait pas produire, et cacherait le jour où la
      // dérivation cesse de marcher.
      this.buildChainBlockers(userId),
      // #3256 (BEL-SC-227.19) — MÊME RAISON : `buildCriticalRisks` relit les
      // MÊMES requêtes que `buildOverdueInvoices`/`buildRenewalsNotEngaged`/
      // `buildRfpsWithUncoveredRequirements` juste en dessous, sur les VRAIS
      // objets seedés de la salle. Rend `[]` tant qu'aucun compte de la salle
      // ne cumule deux signaux au moment de la visite — un silence honnête,
      // pas une collision scriptée.
      this.buildCriticalRisks(userId, now),
      // #2107.3 — MÊME RAISON : les besoins sans shortlist de la salle sont de
      // VRAIS `project_needs` seedés (`demo-dataset.ts`), lus par la MÊME requête
      // que la production. Les scripter ici montrerait un besoin que le produit
      // ne sait pas détecter.
      this.buildStaleNeeds(userId),
      // #2095.2 — MÊME RAISON : la mission qui approche de sa fin est une VRAIE
      // ligne `missions` seedée (`ends_in_days: 28`, sous le seuil de
      // `MISSION_ENDING_SOON_DAYS`), lue par la MÊME requête que la production.
      this.buildMissionsEnding(userId),
      // #2095.7 — MÊME RAISON : le règlement partiel du mois `months_ago: 4` de
      // « Migration du socle applicatif… — lot 1 » (#2419.4, `demo-dataset.ts`)
      // est une VRAIE ligne `invoice_readiness` seedée, échue et non soldée —
      // lue par la MÊME requête que la production.
      this.buildOverdueInvoices(userId, now),
      // #2095.8 — MÊME RAISON : le dossier d'AO scripté de la salle (#2571.5,
      // `demo-seed.service.ts:seedRfp`) est une VRAIE ligne `rfps` seedée, lue
      // par la MÊME requête que la production. ⚠️ Son échéance (`due_at:
      // '2026-09-30'`) est FIXE (voir `demo-scripts.ts:demoRfpAnalysis`) : cette
      // carte n'apparaît en salle que dans la fenêtre des trois jours qui la
      // précèdent, pas toute l'année — la fraîcheur de cette date appartient au
      // dossier RFP (#2571.5), hors périmètre de ce lot.
      this.buildRfpsDueSoon(userId),
      // #2107.8 — MÊME RAISON : une mission sans date de fin de la salle est
      // une VRAIE ligne `missions` seedée (`ends_on: null`, statut actif), lue
      // par la MÊME requête que la production.
      this.buildMissionsWithoutEndDate(userId),
      // #2107.10 — MÊME RAISON : lu par la MÊME requête que la production, sur
      // les VRAIES missions de la salle. Rend `[]` si aucune ne tombe dans sa
      // fenêtre de renouvellement avec `renewal_status` non engagé au moment de
      // la visite — un silence honnête, pas une lacune scriptée.
      this.buildRenewalsNotEngaged(userId, now),
      // #2107.4 — MÊME RAISON : lu par la MÊME requête que la production, sur
      // les VRAIES soumissions de la salle. Rend `[]` si aucune n'est
      // `presented` sans retour au-delà du seuil au moment de la visite.
      this.buildSubmissionsWithoutResponse(userId),
      // #2107.14 — MÊME RAISON : lu par la MÊME requête que la production, sur
      // le VRAI dossier d'AO scripté de la salle (`requirements` seedé,
      // `demo-seed.service.ts:seedRfp`). Rend `[]` si aucune exigence
      // obligatoire n'y est encore non couverte au moment de la visite.
      this.buildRfpsWithUncoveredRequirements(userId),
      // #2107.18 — MÊME RAISON : lu par la MÊME requête que la production, sur
      // les VRAIS comptes de la salle. Rend `[]` si tous portent un
      // `assigned_to` au moment de la visite.
      this.buildAccountsWithoutOwner(userId),
      // #2095.41 — MÊME RAISON : lu par la MÊME requête que la production, sur
      // les VRAIS contacts de la salle. Rend `[]` tant qu'aucun n'a de rebond
      // seedé (`email_bounced_at`, `demo-dataset.ts`).
      this.buildContactsBounced(userId),
      // #2095.12 (épopée #2993) — MÊME RAISON : lu par la MÊME requête que la
      // production (`AgendaService.listEventsDetailed`, qui rend les évènements
      // SCRIPTÉS de la salle — `demo-agenda.ts` — en salle de démo) et sur les
      // VRAIES notes de la salle (`notes.source_event_id`). Rend `[]` tant
      // qu'aucun rendez-vous externe scripté n'est à la fois TERMINÉ et sans
      // note portant son identifiant.
      this.buildMeetingsWithoutFollowup(userId, now),
      // #2106.9/#2107.1/#2107.2 — MÊME RAISON : lu par la MÊME requête que la
      // production, sur les VRAIES affaires de la salle (`opportunities`/
      // `tasks` seedées, `demo-dataset.ts`). Le cadrage data, sans tâche ouverte
      // (#1325) et avec une affaire vieillie au-delà du seuil (`pipelineProjects`,
      // `demo-dataset.ts`), y répond.
      this.buildProjectHealth(userId, now),
      // L1 — même raison que `allActionsDemo` : le jeu semé, comme en production.
      this.buildEngineCards(userId),
    ])
    // #2107.15 — VOLONTAIREMENT PAS APPELÉ ICI. `AgendaService.status` rend
    // délibérément `capabilities.write: false` en salle de démonstration (un
    // visiteur ne branche pas son agenda réel — voir `AgendaService.status`) :
    // appeler `buildBrokenConnectors` afficherait « ton agenda a perdu son
    // droit d'écriture » sur CHAQUE visite, pour une mesure de sécurité
    // volontaire, pas une panne. Une fausse alerte permanente serait pire que
    // l'absence de la carte — la salle ne montre donc pas cette famille.

    return {
      ...briefing,
      // #2095.12 (épopée #2993) — même bassin de résolution que `build()` :
      // `unfollowedMeetings` REJOINT le bloc agenda SCRIPTÉ plutôt que de le
      // remplacer, jamais une seconde lecture des évènements À VENIR.
      agenda: { ...briefing.agenda, unfollowedMeetings: meetingsWithoutFollowup },
      // #2387.7 — lue par le chemin de production sur les VRAIES soumissions de la salle.
      awaitingClientProfiles: submissionsWithoutResponse,
      tasks: tasksBlock,
      // #2101.13 — RÉEL, pas scripté : contrairement au reste de ce bloc, le
      // temps protégé est un réglage PERSONNEL de l'utilisateur (`user_id`),
      // pas une donnée de l'espace de démonstration. `demoBriefing()` pose
      // `null` par défaut (« vide à dessein » — voir son commentaire) ; s'il
      // l'a réglé ailleurs, cet appel le restitue plutôt que de l'effacer.
      protectedTime: await this.readProtectedTime(userId),
      // #2101.17 — MÊME RAISON que `protectedTime` juste au-dessus : un
      // réglage PERSONNEL (`user_id`), jamais une donnée de la salle.
      // `demoBriefing()` pose `{}` par défaut ; s'il l'a réglé ailleurs, cet
      // appel le restitue plutôt que de l'effacer.
      agendaPreferences: await this.readAgendaPreferences(userId),
      chainBlockers,
      criticalRisks,
      // #2147.5 — CHEMIN DE PRODUCTION, comme le reste de cette méthode.
      // `analysis_runs` est classée « vide à dessein » en salle de démo
      // (`demo-coverage.ts` : « aucun run réel ne tourne en démo — en
      // fabriquer un ferait mentir la page Analyses ») : cette lecture rend
      // donc honnêtement `[]`, jamais une carte de suivi inventée.
      runningJobs: await this.buildRunningJobs(userId),
      actions: orderActionsForRole(
        // #2105.53 (correctif) — même retrait qu'en production (`build()`) :
        // la salle démontre aussi le geste « Transformer ce sujet en
        // prochaine action », sur de VRAIES tâches de son espace.
        // #2099.52 — et les gestes Reporter / Pas pertinent / Déjà traité.
        await this.excludeDisposed(
          userId,
          now,
          excludeObjectsAlreadyTasked(
            this.excludeAlreadyTransformed(
              buildBriefingActions({
                now,
                meetings: briefing.agenda.needsPreparation,
                conflicts: briefing.agenda.conflicts,
                awaitingReply: briefing.mail.awaitingReply,
                unread: briefing.mail.unread,
                positiveReplies: briefing.mail.positiveReplies,
                accountsWithFreshSignal: briefing.accountsToWatch.map(entry => ({
                  accountId: entry.accountId,
                  companyName: entry.companyName,
                  detectedAt: entry.detectedAt,
                  detectionExact: entry.detectionExact,
                  signalLabel: entry.signalLabel,
                  logoUrl: entry.logoUrl,
                  website: entry.website,
                })),
                staleNeeds,
                missionsEnding,
                overdueInvoices,
                rfpsDueSoon,
                missionsWithoutEndDate,
                renewalsNotEngaged,
                submissionsWithoutResponse,
                rfpsWithUncoveredRequirements,
                accountsWithoutOwner,
                projectsWithoutNextAction: projectHealth.withoutNextAction,
                staleProjects: projectHealth.stale,
                contactsBounced,
                meetingsWithoutFollowup,
                ...engineCards,
                ownerId: userId,
              }),
              tasksBlock.tasks,
            ),
            tasksBlock.tasks,
            now,
          ),
        ),
        // #3414 (recette 30/09) — la salle ne peut pas porter un compte
        // recruteur (le visiteur n'a qu'UN rôle) : `readAs` lui laisse LIRE le
        // même brief dans l'ordre d'un autre rôle. Démo SEULEMENT — `build()`
        // ne le transmet qu'ici — et l'ORDRE seul change, jamais le contenu.
        readAs ?? role ?? null,
      ),
    }
  }

  /**
   * Les tâches ouvertes de l'utilisateur.
   *
   * Le bloc ne dépend d'aucun fournisseur : `not_connected` ne peut pas
   * arriver, et `unavailable` veut vraiment dire « la base n'a pas répondu » —
   * pas « tu n'as rien à faire ». C'est toute la différence entre une liste
   * vide qu'on croit et une liste vide qu'on aurait dû se méfier de croire.
   */
  private async buildTasksBlock(userId: string, now: Date): Promise<BriefingTasksBlock> {
    if (!this.tasksService) {
      return {
        state: 'unavailable',
        reason: 'Les tâches ne sont pas activées.',
        // #2098.9 — jamais lues : pas de fournisseur à interroger.
        readAt: null,
        tasks: [],
        overdueCount: 0,
        todayCount: 0,
      }
    }
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const tasks = await this.tasksService.openForUser(userId, workspaceId)
      const agenda = buildTaskAgenda(tasks, now)
      return {
        state: 'ready',
        reason: null,
        // #2098.9 — la base a répondu MAINTENANT.
        readAt: now.toISOString(),
        tasks,
        overdueCount: agenda.overdueCount,
        todayCount: agenda.todayCount,
      }
    } catch (error) {
      this.logger.warn(`Briefing: tasks unavailable — ${(error as Error).message}`)
      return {
        state: 'unavailable',
        reason: 'Les tâches n’ont pas pu être lues.',
        // #2098.9 — la lecture a échoué : aucune heure à donner.
        readAt: null,
        tasks: [],
        overdueCount: 0,
        todayCount: 0,
      }
    }
  }

  /**
   * Le bloc agenda : la journée, ses conflits, et les rendez-vous externes à
   * préparer dans les 24 h.
   */
  private buildAgendaBlock(userId: string, now: Date, scope: AgendaReadScope = {}): Promise<BriefingAgendaBlock> {
    return this.agendaBlockCache.getOrLoad(
      scopedCacheKey(userId, scope.excludedProviders),
      () => this.readAgendaBlock(userId, now, scope),
      block => block.state === 'ready',
    )
  }

  private async readAgendaBlock(userId: string, now: Date, scope: AgendaReadScope): Promise<BriefingAgendaBlock> {
    // #2098.9 — `readAt` reste `null` : cette branche ne lit jamais avec succès.
    const empty = (state: BriefingBlockState, reason: string | null): BriefingAgendaBlock => ({
      state,
      reason,
      readAt: null,
      events: [],
      conflicts: [],
      needsPreparation: [],
      // #2095.12 (épopée #2993) — REJOINT par le seul appelant (`build()`/
      // `buildDemo()`, `this.buildMeetingsWithoutFollowup`) une fois ce bloc
      // rendu : cette fonction ne lit pas les notes, elle ne peut donc rien
      // dire d'autre qu'un défaut honnête ici.
      unfollowedMeetings: [],
    })

    // #3973 — décoché en entier pour ce fil : ni sondé ni lu, et la raison le DIT.
    if (excludesEvery(scope.excludedProviders, agendaProviderSchema.options)) {
      return empty('unavailable', 'agenda_excluded_for_thread')
    }

    let status
    try {
      status = await this.agendaStatus(userId)
    } catch (error) {
      this.logger.warn(`Agenda status failed: ${(error as Error).message}`)
      return empty('unavailable', 'agenda_status_failed')
    }
    if (!status.connected) return empty('not_connected', 'agenda_not_connected')
    if (!status.capabilities.read) return empty('missing_scope', 'agenda_read_scope_missing')

    try {
      // La fenêtre déborde d'un jour : un rendez-vous de demain 9 h doit être
      // préparé dans le brief d'aujourd'hui, pas découvert le matin même.
      const endOfWindow = new Date(now.getTime() + 36 * 60 * 60 * 1000)
      const { events, unavailable } = await this.agenda.listEventsDetailed(
        userId,
        { from: now.toISOString(), to: endOfWindow.toISOString(), limit: 100 },
        scope,
      )
      // Un agenda branché qui n'a pas répondu ne se dit PAS « aucun rendez-vous ».
      // Constaté en production : l'API Agenda d'un fournisseur était éteinte, le
      // second agenda du compte répondait mais était vide, et le brief annonçait
      // une journée libre à quelqu'un dont la journée était pleine.
      return {
        state: unavailable.length ? 'partial' : 'ready',
        reason: unavailable.length ? 'agenda_partial' : null,
        // #2098.9 — l'instant RÉEL de cette lecture réussie (même partielle) :
        // `now`, celui du build en cours, jamais un `generatedAt` global.
        readAt: now.toISOString(),
        events: events.filter(event => !event.cancelled),
        conflicts: detectConflicts(events),
        needsPreparation: selectMeetingsToPrepare(events, now),
        // #2095.12 — même raison que `empty()` ci-dessus.
        unfollowedMeetings: [],
      }
    } catch (error) {
      // `error` et non `warn` : le bloc agenda du brief est resté « Indisponible »
      // pendant des jours en production — l'API Calendar n'était pas activée
      // côté fournisseur — sans que rien ne remonte, parce qu'un avertissement
      // ne part pas dans Sentry. Un bloc que l'utilisateur voit vide est une
      // erreur, même quand le reste de l'écran s'affiche.
      this.logger.error(`Agenda briefing failed: ${(error as Error).message}`, {
        error,
        tags: { 'briefing.block': 'agenda' },
      })
      // « Réessaie plus tard » et « cet accès est éteint » n'appellent pas le
      // même geste : le premier se répare tout seul, le second jamais tant que
      // personne ne rouvre l'accès. Les confondre, c'est ce qui a laissé un bloc
      // vide pendant des jours.
      return empty('unavailable', failureReason(error))
    }
  }

  /**
   * Le bloc messagerie : silences, non-lus externes, réponses qui ressemblent à un accord.
   *
   * #2098.9 — `now` a un défaut (`new Date()`) pour ne rien changer aux deux
   * appelants existants (`build`, `dayClosure`) : seul `build` le passe
   * explicitement, pour que `readAt` porte le MÊME instant que le reste du
   * brief plutôt qu'un second horodatage indépendant.
   */
  private buildMailBlock(
    userId: string,
    now: Date = new Date(),
    scope: MailboxReadScope = {},
  ): Promise<BriefingMailBlock> {
    return this.mailBlockCache.getOrLoad(
      scopedCacheKey(userId, scope.excludedProviders),
      () => this.readMailBlock(userId, now, scope),
      block => block.state === 'ready',
    )
  }

  private async readMailBlock(userId: string, now: Date, scope: MailboxReadScope): Promise<BriefingMailBlock> {
    // #2098.9 — `readAt` reste `null` : cette branche ne lit jamais avec succès.
    const empty = (state: BriefingBlockState, reason: string | null): BriefingMailBlock => ({
      state,
      reason,
      readAt: null,
      awaitingReply: [],
      unread: [],
      positiveReplies: [],
    })

    // #3973 — décochée en entier pour ce fil : ni sondée ni lue, et la raison le DIT.
    if (excludesEvery(scope.excludedProviders, mailboxProviderSchema.options)) {
      return empty('unavailable', 'mailbox_excluded_for_thread')
    }

    let status
    try {
      status = await this.mailboxStatus(userId)
    } catch (error) {
      this.logger.warn(`Mailbox status failed: ${(error as Error).message}`)
      return empty('unavailable', 'mailbox_status_failed')
    }
    if (!status.connected) return empty('not_connected', 'mailbox_not_connected')
    if (!status.capabilities.read) return empty('missing_scope', 'mailbox_read_scope_missing')

    // Les trois recherches sont indépendantes : l'échec de l'une ne doit pas
    // vider les deux autres. `allSettled` plutôt que `all`, délibérément.
    const [awaiting, unread, positive] = await Promise.allSettled([
      this.mailbox.search(
        userId,
        { intent: 'no_reply', windowDays: 60, silenceDays: DEFAULT_SILENCE_DAYS, limit: 10 },
        scope,
      ),
      this.mailbox.search(
        userId,
        { intent: 'unread', windowDays: 7, silenceDays: DEFAULT_SILENCE_DAYS, limit: 10 },
        scope,
      ),
      this.mailbox.search(
        userId,
        { ...REPLIES_TO_TREAT_REQUEST, silenceDays: DEFAULT_SILENCE_DAYS }, // F2-FIX — la même question que /mailbox
        scope,
      ),
    ])

    const failed = [awaiting, unread, positive].every(result => result.status === 'rejected')
    if (failed) return empty('unavailable', 'mailbox_unavailable')

    // #3671.2 — recette prod 08/10 : un e-billet/confirmation de voyage n'est
    // pas commercial et ne doit produire AUCUNE carte (ni aucun titre à
    // filtrer après coup — le sujet réel de ce message n'a rien d'un corps).
    const commercialOnly = (threads: MailThread[]) =>
      threads.filter(thread => !looksLikeNonCommercialTravelDocument(thread.subject, null))

    return {
      state: 'ready',
      reason: null,
      readAt: now.toISOString(),
      awaitingReply: commercialOnly(awaiting.status === 'fulfilled' ? awaiting.value.threads : []),
      unread: commercialOnly(unread.status === 'fulfilled' ? unread.value.threads : []),
      positiveReplies: commercialOnly(positive.status === 'fulfilled' ? positive.value.threads : []),
    }
  }

  /**
   * Les comptes suivis dont un signal est apparu dans les 48 dernières heures.
   *
   * On lit l'historique de signaux déjà matérialisé plutôt que de relancer une
   * collecte : un brief du matin ne doit rien coûter et ne doit surtout pas
   * attendre un fournisseur externe.
   */
  private async buildAccountsToWatch(userId: string, now: Date): Promise<DailyBriefing['accountsToWatch']> {
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const rows = await this.signalHistory.listForWorkspace(workspaceId)
      const since = now.getTime() - FRESH_SIGNAL_HOURS * 60 * 60 * 1000

      // La MÊME définition de « signal actif apparu depuis » que la ligne
      // « signaux sur mes comptes » du bloc « depuis ta dernière visite ».
      // Elle était écrite ici, en dur ; deux copies auraient divergé le jour où
      // quelqu'un décide qu'un signal `resolved` compte encore (GA-26).
      // Les comptes ET la date de leur détection la plus récente, en UNE
      // dérivation : « Nouveau signal détecté » ne disait ni lequel ni de
      // quand, alors que la date était dans la table depuis le début.
      const detections = freshSignalDetections(rows, since)
      if (!detections.size) return []

      const accounts = await this.accounts.find({
        where: [...detections.keys()].map(id => ({ id, status: Not(In([...UNCITED_ACCOUNT_STATUSES])) })),
        // #2097.21 — `logo_url` en plus : la carte du brief peut enfin
        // montrer le même logo que le reste du produit, sans lecture de plus.
        // #2097.21 (correctif) — `website` en plus, pour la MÊME raison que
        // `/accounts` (`AccountTableRow.tsx`) : `logo_url` seul (le logo
        // Apollo persisté) est quasi toujours vide, et sans le site le repli
        // favicon de `CompanyAvatar` n'a rien à essayer.
        // #2107.33 — `recent_signals` en plus : seul endroit qui porte encore
        // `sales_implication`, `signal_history` n'en garde aucune trace.
        select: ['id', 'company_name', 'logo_url', 'website', 'recent_signals', 'user_id', 'workspace_id'],
      })
      // #4068.6 — l'historique daté de chaque compte, lu en parallèle ; une lecture en panne = pas de ligne.
      const histories = await Promise.all(accounts.map(account => this.historyOf(account, now)))

      return accounts.map((account, index) => {
        const detection = detections.get(account.id)
        return {
          accountId: account.id,
          companyName: account.company_name,
          logoUrl: account.logo_url ?? null,
          website: account.website ?? null,
          reasonKey: 'briefing.account.freshSignal',
          href: `/accounts/${account.id}`,
          // ⚠️ `null` quand la date est illisible — l'écran dit alors que la
          // date est inconnue. Y mettre l'instant du brief afficherait
          // « repéré aujourd'hui » sur un signal de la semaine dernière.
          detectedAt: detection?.detectedAt ?? null,
          detectionExact: detection?.exact ?? true,
          // #2107.28 — CE QUI a bougé, pas seulement QUAND. `null` quand la
          // matérialisation n'a rien écrit pour ce signal — jamais une phrase
          // de repli inventée.
          signalLabel: detection?.label ?? null,
          // #2107.33 — « la raison pour laquelle cela concerne cette ESN » :
          // la lecture commerciale que l'IA écrit déjà sur ce signal précis
          // (`sales_implication`), rapparié par IDENTITÉ, jamais devinée.
          esnReason: detection?.label ? salesImplicationForLabel(account.recent_signals, detection.label) : null,
          // Théo A today-jour — le lien vers la page d'origine du signal, lu sur le MÊME signal (rapparié par
          // identité). `null` sans URL vérifiable : la carte n'affiche rien, rien n'est inventé.
          ...sourceLinkFields(account.recent_signals, detection?.label ?? null),
          // #2107.40 — posé par le CONTRÔLEUR (`BriefingController.today()`),
          // qui seul lit `MarketMemoryService` (GA-07) : ce service n'a pas
          // cette lecture sous la main, `null` ici est le départ NEUTRE,
          // jamais un volume deviné.
          structuralPotentialPaths: null,
          // #2107.42 — même raison : posé par le CONTRÔLEUR
          // (`ContactsService.rankForAccount`), pas par ce service.
          accessPath: null,
          history: histories[index] ?? [],
        }
      })
    } catch (error) {
      // Un brief sans la colonne « comptes » reste utile ; un brief qui tombe, non.
      this.logger.warn(`Briefing accounts failed: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #4068.6 — ce que l'espace SAIT déjà de ce compte : trois faits datés et typés au plus, les plus
   * pesants d'abord (lecteur unique `AccountFactsService`). Le signal frais qui a fait entrer le compte au
   * brief n'y est pas répété (il est déjà dit au-dessus) ; ni le poids, ni l'âge, ni la provenance ne
   * sortent — la date est absolue, un fait ancien ne passe pas pour récent. Lecture en panne ou absente
   * ⇒ `[]` : la carte garde tout le reste.
   */
  private async historyOf(
    account: Pick<AccountEntity, 'id' | 'user_id' | 'workspace_id'>,
    now: Date,
  ): Promise<DailyBriefing['accountsToWatch'][number]['history']> {
    if (!this.accountFacts || !account.workspace_id) return []
    try {
      const read = await this.accountFacts.forAccount({
        workspaceId: account.workspace_id,
        userId: account.user_id,
        accountId: account.id,
        asOf: now,
      })
      return (read?.facts ?? [])
        .filter(fact => !(fact.kind === 'signal' && fact.ageDays <= FRESH_SIGNAL_HOURS / 24))
        .slice(0, 3)
        .map(({ date, kind, label, url }) => ({ date, kind, label, ...(url ? { url } : {}) }))
    } catch (error) {
      this.logger.warn(`Briefing account history failed (non-fatal): ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2147.5 (épopée #2785) — LA CARTE DE SUIVI, POUR UN JOB RÉEL.
   *
   * Le seul job async dont le brief peut aujourd'hui remplir honnêtement la
   * carte : une analyse de compte `analyzing` (`AnalysisRunsService`). Les
   * six champs que ce job ne porte pas (`jobTrackingCardSchema`) restent
   * `null` — jamais devinés.
   */
  /**
   * #2147.5 (correctif 26/09 soir) — deux types de job réels, chacun lu par sa
   * propre source (`analysis_runs`, `workflow_runs`), jamais un modèle inventé
   * pour les fondre. Une panne sur l'un n'efface pas l'autre.
   */
  private async buildRunningJobs(userId: string): Promise<JobTrackingCard[]> {
    try {
      const { workspaceId } = await this.resolveWorkspace(userId)
      const [analysisCards, lauraJobCards] = await Promise.all([
        this.buildAnalysisRunCards(userId, workspaceId),
        this.buildLauraJobCards(userId, workspaceId),
      ])
      return [...analysisCards, ...lauraJobCards].slice(0, 10)
    } catch (error) {
      this.logger.warn(`Briefing running jobs failed: ${(error as Error).message}`)
      return []
    }
  }

  private async buildAnalysisRunCards(userId: string, workspaceId: string): Promise<JobTrackingCard[]> {
    try {
      const rows = await this.accounts.manager.query<{ run_id: string; account_id: string; company_name: string }[]>(
        `SELECT DISTINCT ON (ar.account_id) ar.id AS run_id, ar.account_id, acc.company_name
           FROM analysis_runs ar
           JOIN accounts acc ON acc.id = ar.account_id
          WHERE ar.status = 'analyzing'
            AND acc.status NOT IN ('deleted', 'archived')
            AND (acc.workspace_id = $1 OR (acc.workspace_id IS NULL AND acc.user_id = $2))
          ORDER BY ar.account_id, ar.created_at DESC
          LIMIT 10`,
        [workspaceId, userId],
      )
      return rows.map(row => ({
        id: row.run_id,
        kind: 'account_analysis' as const,
        title: row.company_name,
        // Brut, pas encore traduit — `runStatusView` (web) porte déjà la clé
        // i18n `accounts:runStatus.analyzing`, jamais recopiée ici (GA-26).
        currentStepLabel: 'analyzing',
        progressSteps: null,
        reservedCredits: null,
        estimatedDurationMinutes: null,
        intermediateResults: null,
        pendingValidations: null,
        openHref: `/accounts/${row.account_id}`,
        cancelable: true,
      }))
    } catch (error) {
      this.logger.warn(`Briefing running jobs (analysis) failed: ${(error as Error).message}`)
      return []
    }
  }

  /**
   * #2147.5 (correctif 26/09 soir) — le job composite de Laura (#2276) : le
   * seul autre type de job qui porte RÉELLEMENT les cinq champs que l'analyse
   * de compte ne porte pas (progression, coût réservé, durée estimée,
   * résultats intermédiaires, validations attendues) — jamais devinés ici,
   * lus depuis la fiche (`lauraJobTrackingCardOf`).
   *
   * `planned` / `running` / `awaiting_approval` : un job EN COURS au sens de
   * ce bloc — ni `draft`/`to_confirm` (rien n'a démarré), ni un état terminal.
   */
  private async buildLauraJobCards(userId: string, workspaceId: string): Promise<JobTrackingCard[]> {
    try {
      const rows = await this.workflowRuns.find({
        where: {
          workspace_id: workspaceId,
          user_id: userId,
          definition_key: LAURA_JOB_DEFINITION_KEY,
          status: In(['planned', 'running', 'awaiting_approval']),
        },
        order: { created_at: 'DESC' },
        take: 10,
      })
      return rows.flatMap(row => {
        try {
          return [lauraJobTrackingCardOf(row)]
        } catch {
          // Une fiche illisible (forme d'avant un déploiement) ne se rend pas à moitié.
          return []
        }
      })
    } catch (error) {
      this.logger.warn(`Briefing running jobs (laura job) failed: ${(error as Error).message}`)
      return []
    }
  }
}

/**
 * #2147.5 (correctif 26/09 soir) — la carte de suivi d'UN job composite de
 * Laura, dérivée de sa fiche (`packages/contracts/src/schemas/laura-job.ts`),
 * jamais recalculée une seconde fois (GA-26). `title` = l'intention du job
 * (#2276.4) : plus court et plus lisible que la demande brute (#2276.3).
 */
function lauraJobTrackingCardOf(
  row: Pick<WorkflowRunEntity, 'id' | 'job' | 'status' | 'conversation_id' | 'account_id'>,
): JobTrackingCard {
  const brief = lauraJobBriefSchema.parse(row.job)
  const state = lauraJobStateOf(row.status)
  const progress = lauraJobProgressOf(brief)
  const currentStep =
    lauraJobAwaitsApproval(brief) ??
    brief.steps.find(step => step.status === 'running') ??
    lauraJobNextStepOf(brief) ??
    brief.steps[brief.steps.length - 1]
  const pendingValidations = brief.steps
    .filter(step => lauraJobStepNeedsApproval(step) && step.approvedBy === null)
    .map(step => step.label)
  const intermediateResults = brief.intermediateResults.map(result => result.summary)
  return {
    id: row.id,
    kind: 'laura_job',
    title: brief.intent,
    currentStepLabel: currentStep.label,
    // #3666 — les étapes du job, jamais un pourcentage.
    progressSteps: { done: progress.done, total: progress.total },
    reservedCredits: lauraJobRemainingCredits(brief),
    estimatedDurationMinutes:
      brief.estimatedDurationSeconds !== null ? Math.round(brief.estimatedDurationSeconds / 60) : null,
    intermediateResults: intermediateResults.length > 0 ? intermediateResults : null,
    pendingValidations: pendingValidations.length > 0 ? pendingValidations : null,
    openHref: chatNotificationLink({ conversationId: row.conversation_id, accountId: row.account_id }),
    cancelable: lauraJobGesturesOf(state, brief).includes('cancel'),
  }
}
