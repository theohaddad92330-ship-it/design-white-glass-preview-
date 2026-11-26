import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  COMPLEMENT_SNOOZE_DAYS,
  TEMPS2_ANSWER_KEYS,
  WELCOME_REDESIGN_DATE,
  onboardingStatusSchema,
  profileQuestionnaireProgress,
  requiredAnswerGaps,
  type ComplementStatus,
  type OnboardingStateResponse,
  type OnboardingStatus,
  type ProfileComplementState,
  type SaveAnswers,
  type WelcomeRedesignBannerState,
} from '@bellum/contracts'
import { failure, isFailure, isSuccess, success, type Result } from '@bellum/utils'
import { Repository } from 'typeorm'
import { classifyNetworkFailure, journeyError, type JourneyErrorState } from '../../common/journey-error'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { OnboardingStageDefinitionEntity } from '../../database/entities/onboarding-stage-definition.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'
import { UserOnboardingTransitionEntity } from '../../database/entities/user-onboarding-transition.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { ActivationService } from './activation.service'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'

/** « 3 actions majeures » (§21) : le second déclencheur du questionnaire. */
const MAJOR_ACTIONS_TO_PROPOSE = 3

type OnboardingFailureCode = 'unknown_stage' | 'incomplete' | 'persist_failed' | 'invalid_transition'

export type OnboardingFailure = {
  code: OnboardingFailureCode
  message: string
  cause?: unknown
  /** #4817 — présent pour `incomplete` : les clés de réponse exigées et absentes, en DONNÉE (l'écran les nomme et
   *  les relie ; la phrase `message` reste pour les journaux). */
  missing?: string[]
  /** #2084 — présent pour `persist_failed` : la forme COMMUNE de l'état
   *  d'erreur (ce qui s'est passé, ce qui reste, ce qui n'a pas été fait,
   *  l'action possible, et si une reprise automatique est sûre). Le
   *  contrôleur la rend telle quelle plutôt que de refaire un message. */
  journey?: JourneyErrorState
}

/**
 * #2084.4/.7/.16-.20 — construit un échec de PERSISTANCE dans la forme
 * commune. Ce qui reste (`preserved`) est un fait vrai par construction :
 * une exception pendant l'écriture veut dire que CETTE écriture n'a pas
 * abouti, donc ce qui était déjà en base n'a pas bougé — ce n'est ni deviné
 * ni optimiste.
 *
 * `retryable` vient de {@link classifyNetworkFailure} : une connexion jamais
 * établie peut être rejouée sans risque, une requête partie sans réponse
 * (`unknown`) ne doit pas être rejouée AUTOMATIQUEMENT (doctrine CLAUDE.md).
 */
function persistFailure(whatHappened: string, notDone: string, cause: unknown): OnboardingFailure {
  const journey = journeyError({
    code: 'save_failed',
    whatHappened,
    preserved: ['ce qui était déjà enregistré reste inchangé'],
    notDone,
    nextAction: 'Réessaie dans un instant.',
    retryable: classifyNetworkFailure(cause) === 'retryable',
  })
  return { code: 'persist_failed', message: journey.message, cause, journey }
}

/** Les douze états canoniques, dans l'ordre d'`onboardingStatusSchema` — la
 *  SEULE source (GA-26) : ni ce fichier ni l'entité ne renomment ou ne
 *  réordonnent cette liste. */
export const ONBOARDING_STATUSES = onboardingStatusSchema.options

/**
 * #2004 — la table des transitions LÉGALES de la machine d'état canonique.
 *
 * Chacun des douze états a une entrée (même vide, pour un état qui n'a
 * aujourd'hui aucune sortie déclarée) : un état absent de cette table est un
 * état que le code ne sait pas JUGER — ni l'atteindre, ni le quitter — ce qui
 * revient à ne pas exister (préambule §« un état qu'on ne peut pas atteindre
 * depuis un autre n'existe pas »).
 *
 * Seules QUATRE arêtes avaient jusqu'ici un appelant réel dans ce service :
 * `not_started → in_progress` et `in_progress|not_started → completed`
 * (`advanceStage` / `complete`, le parcours historique, inchangé), et
 * `completed|activated → refresh_required` (`requestRefresh`, #2004.10 —
 * voir le docblock de cette méthode pour la raison du choix initial). Les
 * huit autres arêtes câblent un parcours plus fin (identité → audit →
 * validation → enrichissement → activation) dont **aucune étape n'a de
 * déclencheur choisi** : la migration `1793583494449-OnboardingStatusStates`
 * l'a déjà écrit noir sur blanc — ce sont des décisions produit qui restent
 * à prendre. Les déclarer ICI rend chaque état ATTEIGNABLE (le test « douze
 * états, zéro orphelin » ne passerait pas sinon) sans inventer un appelant
 * qui n'existe pas encore.
 *
 * ⚠️ #2021 (recette écran 27/09/2026, DÉCISION Louis) — `refresh_required`
 * n'était atteignable QUE depuis `completed`/`activated` ; en production, un
 * compte au milieu du parcours fin (n'importe lequel des huit états
 * intermédiaires, ou `in_progress`) n'avait donc AUCUN moyen de demander le
 * mode guidé — le lien restait invisible côté web (`useReconfigureOnboarding`)
 * pour une raison qui n'était même plus produit : « un utilisateur déjà
 * PASSÉ par l'onboarding — tout statut postérieur à `not_started` — voit
 * TOUJOURS ce lien ». `refresh_required` a donc été ajouté comme arête
 * SORTANTE de chaque état non-`not_started` : un lien visible vers un geste
 * que le serveur refuserait serait pire que son absence.
 */
export const ONBOARDING_TRANSITIONS: Readonly<Record<OnboardingStatus, readonly OnboardingStatus[]>> = {
  not_started: ['in_progress', 'identity_in_progress', 'completed'],
  in_progress: ['completed', 'refresh_required'],
  completed: ['refresh_required'],
  identity_in_progress: ['audit_in_progress', 'refresh_required'],
  audit_in_progress: ['audit_generating', 'refresh_required'],
  audit_generating: ['audit_to_review', 'audit_in_progress', 'refresh_required'],
  audit_to_review: ['audit_validated', 'audit_generating', 'refresh_required'],
  audit_validated: ['data_enrichment_optional', 'refresh_required'],
  data_enrichment_optional: ['first_value_ready', 'refresh_required'],
  first_value_ready: ['activated', 'refresh_required'],
  activated: ['refresh_required'],
  // 16/09 : status=completed avec current_stage_code=transition_summary, étapes
  // 6-7 jamais atteintes. `completed` a été AJOUTÉ ici ce jour-là : une reprise
  // qui redémarre à une sous-étape du DERNIER stage ne croise aucune frontière
  // d'étape, donc `advanceStage` — le seul appelant de `refresh_required →
  // in_progress` — n'est jamais joué, et « Générer mon audit » échouait en
  // `invalid_transition`. Un parcours qu'on peut rouvrir sans pouvoir le fermer
  // n'est pas une voie de reprise.
  refresh_required: ['in_progress', 'identity_in_progress', 'completed'],
}

/** First questionnaire stage — where a brand-new user starts. */
const FIRST_TEMPS1_STAGE = 'company_info'

/** Stage advanced to once Temps 1 is validated (recap before Temps 2). */
const STAGE_AFTER_TEMPS1 = 'transition_summary'

/** `analysis_runs.status` of a run that produced a readable dossier. */
const COMPLETED_RUN_STATUS = 'completed'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Derives the complement status from the three stamps + the trigger condition.
 * Order matters: a user who finished it, or refused it for good, never sees it
 * again — even once a snooze expires.
 */
function resolveComplementStatus(
  state: UserOnboardingStateEntity | null,
  eligible: boolean,
  now: Date,
): ComplementStatus {
  if (state?.complement_completed_at) return 'completed'
  if (state?.complement_dismissed_at) return 'dismissed'
  if (!eligible) return 'locked'
  const snoozedUntil = state?.complement_snoozed_until
  if (snoozedUntil && new Date(snoozedUntil).getTime() > now.getTime()) return 'snoozed'
  return 'pending'
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(UserOnboardingStateEntity)
    private readonly states: Repository<UserOnboardingStateEntity>,
    @InjectRepository(OnboardingStageDefinitionEntity)
    private readonly stages: Repository<OnboardingStageDefinitionEntity>,
    @InjectRepository(AnalysisRunEntity)
    private readonly runs: Repository<AnalysisRunEntity>,
    // #2004.12 — le journal d'audit des transitions d'état.
    @InjectRepository(UserOnboardingTransitionEntity)
    private readonly transitions: Repository<UserOnboardingTransitionEntity>,
    private readonly esnProfile: EsnProfileService,
    // Le second déclencheur du questionnaire (§21 : « 24 h OU 3 actions
    // majeures »). `@Optional()` comme l'analytics : les specs unitaires qui
    // construisent le service sans ce voisin gardent le déclencheur historique.
    @Optional() private readonly activation?: ActivationService,
    // Product analytics — best-effort, `@Optional()` so unit specs that build
    // the service without the (global) AnalyticsModule keep working.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // #2004.19 — la session d'import EN COURS, en LECTURE seule. Une entité
    // partagée (`import-session.entity.ts`), jamais le service du module
    // `import` : ça n'entre pas dans le cliquet GA-07
    // (`module-boundaries.spec.ts`). `@Optional()` comme les deux voisins
    // ci-dessus, pour les specs unitaires qui construisent le service sans lui.
    @Optional()
    @InjectRepository(ImportSessionEntity)
    private readonly importSessions?: Repository<ImportSessionEntity>,
    // #2014.3 / #2014.7 — l'espace REJOINT, si connu. Trois entités
    // partagées, en LECTURE seule, hors du cliquet GA-07 pour la même raison
    // que `importSessions` ci-dessus.
    @Optional()
    @InjectRepository(ProfileEntity)
    private readonly profiles?: Repository<ProfileEntity>,
    @Optional()
    @InjectRepository(WorkspaceInvitationEntity)
    private readonly workspaceInvitations?: Repository<WorkspaceInvitationEntity>,
    @Optional()
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces?: Repository<WorkspaceEntity>,
  ) {}

  async getState(userId: string): Promise<Result<OnboardingStateResponse, OnboardingFailure>> {
    try {
      // perf P3 (29/09/2026) — six lectures INDÉPENDANTES (`userId` seul) : elles
      // partent ensemble, plus une par une (0,4-1,9 s sur ~15 routes). `ensureState`
      // reçoit la PROMESSE des étapes : il ne l'attend que pour créer l'état.
      const stagesRead = this.stages.find({ order: { stage_order: 'ASC' } })
      const [
        stages,
        state,
        { answers, inherited },
        activeImportSessionId,
        joinedWorkspace,
        effectifObservedAt,
        firstCompletedAt,
        awaitingCompanyAdmin,
      ] = await Promise.all([
        stagesRead,
        this.ensureState(userId, stagesRead),
        this.esnProfile.getAnswersWithOrigin(userId),
        this.findActiveImportSessionId(userId),
        this.findJoinedWorkspace(userId),
        // #2035.8 — le front en dérive la fraîcheur (`readEffectifFreshness`).
        this.esnProfile.getEffectifObservedAt(userId),
        // #2021 — DÉCISION LOUIS 08/10/2026 : second lecteur de la même
        // dérivation que la bannière de refonte (#2897), voir son docblock.
        this.firstOnboardingCompletionAt(userId),
        // #4158.12 — le membre qui attend la description de l'ESN.
        this.findAwaitingCompanyAdmin(userId),
      ])
      const currentStageCode = stages.find(s => s.id === state.current_stage_id)?.code ?? null

      const response: OnboardingStateResponse = {
        id: state.user_id,
        status: state.status,
        current_stage_code: currentStageCode,
        stages: stages.map(s => ({
          id: s.id,
          code: s.code,
          title: s.title,
          stage_order: s.stage_order,
          is_required: s.is_required,
        })),
        answers,
        // Le report explicite du questionnaire (§13). `null` = pas de report,
        // donc le questionnaire reste dû — un palier commercial n'en dispense
        // plus, c'est tout l'objet de la correction.
        skipped_at: state.skipped_at ? state.skipped_at.toISOString() : null,
        // #2021 — DÉCISION LOUIS 08/10/2026 : la date de première complétion
        // RÉELLE, pour distinguer un utilisateur déjà onboardé (bandeau) d'un
        // utilisateur jamais onboardé (toujours redirigé) à `refresh_required`.
        first_completed_at: firstCompletedAt ? firstCompletedAt.toISOString() : null,
        // Ce qui vient de la fiche de l'ENTREPRISE et pas de la personne
        // (#1671-ter). Le flux s'en sert pour ne reposer que ce qui reste :
        // onze des douze questions du premier temps sont des faits sur l'ESN,
        // et l'associé qui rejoint une ESN renseignée n'a plus qu'à répondre à
        // la sienne. Liste vide pour tout utilisateur seul dans son espace.
        inherited_answer_keys: inherited,
        // #2004.19 — un import long rend la reprise au bon endroit.
        active_import_session_id: activeImportSessionId,
        // #2014.3 / #2014.7 — l'espace rejoint, et qui a invité si connu.
        joined_workspace: joinedWorkspace,
        // #2035.8 — QUAND chaque bande d'effectif a été répondue.
        effectif_observed_at: effectifObservedAt,
        // #4158.12 — non nul : questions personnelles seules + bandeau.
        awaiting_company_admin: awaitingCompanyAdmin,
      }
      return success(response)
    } catch (cause) {
      return failure(
        persistFailure(
          "Le chargement de ton parcours d'intégration a échoué.",
          "ton état d'onboarding n'a pas pu être lu.",
          cause,
        ),
      )
    }
  }

  async advanceStage(userId: string, stageCode: string): Promise<Result<OnboardingStateResponse, OnboardingFailure>> {
    const stage = await this.stages.findOne({ where: { code: stageCode } })
    if (!stage) {
      return failure({ code: 'unknown_stage', message: `Étape inconnue : ${stageCode}` })
    }
    try {
      const stages = await this.stages.find({ order: { stage_order: 'ASC' } })
      const state = await this.ensureState(userId, stages)
      state.current_stage_id = stage.id
      // Le statut ne bouge QUE sur la toute première avance (`not_started` →
      // `in_progress`) — ou depuis `refresh_required`, qui reprend le
      // questionnaire (#2004.10). Dans tout autre cas (l'utilisateur revisite
      // une étape déjà `in_progress`/`completed`…) on déplace juste le
      // pointeur d'étape, sans tenter de transition : c'est le comportement
      // d'avant ce lot, préservé à l'identique.
      const isFirstMove = state.status === 'not_started' || state.status === 'refresh_required'
      if (isFirstMove) {
        const transition = await this.transitionTo(state, 'in_progress', 'advance_stage')
        if (isFailure(transition)) return transition
      } else {
        await this.states.save(state)
      }
      // First transition out of `not_started` = the user actually began onboarding.
      if (state.status === 'in_progress' && isFirstMove) void this.analytics?.track('onboarding_started', { userId })
      return await this.getState(userId)
    } catch (cause) {
      return failure(
        persistFailure(
          "La mise à jour de l'étape a échoué.",
          "le passage à l'étape suivante n'a pas été enregistré.",
          cause,
        ),
      )
    }
  }

  /**
   * L'utilisateur reporte le questionnaire (« Plus tard »).
   *
   * C'est la SEULE sortie du questionnaire hors complétion, et elle est
   * volontaire. On la trace pour deux raisons : ne pas renvoyer quelqu'un vers
   * un écran qu'il vient de refuser, et pouvoir écrire honnêtement, sur les
   * analyses qui suivront, qu'elles sont génériques PARCE QU'IL A CHOISI de
   * remplir plus tard — ce qui ne se dit pas comme « nous ne savons rien de
   * vous ».
   *
   * Réversible : reprendre le questionnaire efface le report (cf. `saveAnswers`).
   */
  async skipQuestionnaire(userId: string): Promise<Result<OnboardingStateResponse, OnboardingFailure>> {
    try {
      const stages = await this.stages.find({ order: { stage_order: 'ASC' } })
      await this.ensureState(userId, stages)
      await this.states.update({ user_id: userId }, { skipped_at: new Date() })
      return this.getState(userId)
    } catch (cause) {
      return failure(
        persistFailure(
          "L'enregistrement du report a échoué.",
          'le report du questionnaire n’a pas été enregistré.',
          cause,
        ),
      )
    }
  }

  async saveAnswers(userId: string, answers: SaveAnswers): Promise<Result<OnboardingStateResponse, OnboardingFailure>> {
    try {
      await this.esnProfile.upsertAnswers(userId, answers)
      return await this.getState(userId)
    } catch (cause) {
      return failure(
        persistFailure(
          "L'enregistrement de tes réponses a échoué.",
          'tes nouvelles réponses n’ont pas été enregistrées.',
          cause,
        ),
      )
    }
  }

  async complete(userId: string): Promise<Result<OnboardingStateResponse, OnboardingFailure>> {
    const answers = await this.esnProfile.getAnswers(userId)
    // #4158.12 — un membre qui attend l'administrateur ne peut pas répondre aux
    // clés ENTREPRISE (l'API les ignorerait) : son onboarding se termine quand
    // ses questions PERSONNELLES sont faites.
    const awaiting = (await this.esnProfile.getAwaitingCompanyAdmin(userId)) !== null
    // #4875.2 — la MÊME règle que l'écran de relecture (`requiredAnswerGaps`, contrat), à un seul endroit.
    const missing = requiredAnswerGaps(answers, { awaitingCompanyAdmin: awaiting }).map(gap => gap.key)
    if (missing.length > 0) {
      return failure({ code: 'incomplete', message: `Réponses manquantes : ${missing.join(', ')}`, missing })
    }
    try {
      const stages = await this.stages.find({ order: { stage_order: 'ASC' } })
      const state = await this.ensureState(userId, stages)
      const nextStage = stages.find(s => s.code === STAGE_AFTER_TEMPS1)
      state.current_stage_id = nextStage?.id ?? state.current_stage_id
      // Un questionnaire terminé efface son report : le « Plus tard » n'a plus
      // d'objet, et le laisser en place ferait dire aux analyses suivantes
      // qu'elles sont génériques alors que le profil est complet.
      state.skipped_at = null
      // `not_started → completed` reste légal (compléter sans jamais appeler
      // `advanceStage` est le chemin historique, couvert par le test
      // « completes when all 10 answers are filled ») ; `in_progress →
      // completed` couvre le parcours normal. `transitionTo` absorbe aussi le
      // ré-appel idempotent (déjà `completed`).
      const transition = await this.transitionTo(state, 'completed', 'complete')
      if (isFailure(transition)) return transition
      // #2022.7 — LA COMPLÉTION, et le seul endroit d'où part la génération du
      // profil. Les sous-étapes (`saveAnswers` → `EsnProfileService.upsertAnswers`)
      // n'en déclenchent plus aucune : tant que le questionnaire n'est pas
      // terminé, le profil ACTIF reste l'ancien, et on ne paie pas un appel
      // modèle par état intermédiaire. Après le `transitionTo`, jamais avant :
      // une complétion refusée ne régénère rien.
      // #4158.12 — rien à générer à partir d'une fiche entreprise qui n'existe
      // pas encore : la génération part quand l'administrateur l'a décrite.
      if (!awaiting) await this.esnProfile.completeReedition(userId)
      void this.analytics?.track('onboarding_completed', { userId })
      return await this.getState(userId)
    } catch (cause) {
      return failure(
        persistFailure("La finalisation de l'onboarding a échoué.", "l'onboarding n'a pas été marqué terminé.", cause),
      )
    }
  }

  /**
   * #2004.10 — pose `refresh_required`, le SEUL état de la machine que
   * `1793583494449-OnboardingStatusStates` avait déjà nommé (contrainte SQL
   * comprise) sans qu'aucun code ne l'écrive jamais (`onboarding.ts:55-57`).
   * L'écran de reconfiguration qui le lit restait donc INERTE.
   *
   * Le déclencheur exact (une durée écoulée depuis la dernière génération ?
   * un changement d'offre commerciale détecté ?) est une décision produit
   * que ce lot ne tranche pas — elle est signalée, pas prise. Le choix ICI
   * est le plus CONSERVATEUR possible : un geste EXPLICITE de l'utilisateur,
   * jamais une horloge ni une dérivation.
   *
   * ⚠️ #2021 (recette écran 27/09/2026, DÉCISION Louis) — légal à l'origine
   * SEULEMENT depuis un état TERMINAL (`completed`/`activated`) : un compte
   * au milieu du parcours fin n'avait donc aucun moyen d'y accéder, alors que
   * la doctrine retenue est « tout statut postérieur à `not_started` ».
   * `ONBOARDING_TRANSITIONS` déclare maintenant `refresh_required` comme
   * arête sortante de chaque état non-`not_started` — demander une
   * actualisation avant d'avoir même commencé reste refusé
   * (`invalid_transition`), tout le reste ne l'est plus.
   */
  async requestRefresh(userId: string): Promise<Result<OnboardingStateResponse, OnboardingFailure>> {
    try {
      const stages = await this.stages.find({ order: { stage_order: 'ASC' } })
      const state = await this.ensureState(userId, stages)
      // #2572 — un « plus tard » (`skipQuestionnaire`) posé AVANT cette demande
      // est PÉRIMÉ par elle : le geste EXPLICITE le plus récent gagne, même
      // règle que `complete()` plus haut (« un questionnaire terminé efface
      // son report »). Sans cette ligne, `needsOnboarding` (web) lisait un
      // report qui ne correspondait plus à rien et renvoyait le compte hors du
      // questionnaire qu'il venait pourtant de redemander.
      //
      // #2579 — c'est cette ligne qui rend `needsOnboarding` (web) capable de
      // se passer d'une seconde vérification sur `status === 'refresh_required'` :
      // juste après cette méthode, `skipped_at` est GARANTI `null`, donc
      // `if (skippedAt) return false` ne peut plus intercepter un report
      // périmé. Un `skippedAt` non nul observé ensuite, à ce statut, ne peut
      // décrire qu'un report posé APRÈS cette demande — le geste le plus
      // récent, qui doit gagner (voir `onboarding-gate.test.ts`).
      state.skipped_at = null
      const transition = await this.transitionTo(state, 'refresh_required', 'user_requested_refresh')
      if (isFailure(transition)) return transition
      // #2572.2 — mesuré en production le 18/09 : « Reprendre la
      // reconfiguration » sur un compte DÉJÀ `refresh_required` n'ouvrait
      // toujours rien. Cause : `transitionTo` court-circuite en idempotence
      // (#2004.11, `state.status === to`) et ne PERSISTE rien dans ce cas —
      // la ligne `state.skipped_at = null` ci-dessus ne restait alors QUE sur
      // l'objet en mémoire, jamais écrite. Le commentaire #2579 ci-dessus
      // était donc faux dans ce cas précis : `skipped_at` n'était garanti
      // `null` qu'après une transition FRAÎCHE, pas après une demande relue
      // sur un compte déjà en attente. Cet appel explicite couvre le cas que
      // `transitionTo` saute — redondant mais inoffensif dans le cas frais
      // (transitionTo a déjà sauvegardé), nécessaire dans le cas idempotent.
      await this.states.save(state)
      return await this.getState(userId)
    } catch (cause) {
      return failure({ code: 'persist_failed', message: "Impossible de demander l'actualisation", cause })
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Temps 2 — le complément de profil                                  */
  /* ------------------------------------------------------------------ */

  /**
   * State of the Temps-2 complement for one user.
   *
   * The trigger is deliberately « une analyse TERMINÉE », not « une analyse
   * lancée » and not « 24 h après l'inscription » : the whole point is that the
   * rep has SEEN a dossier before being asked to refine it. Before that the
   * status is `locked` and nothing is proposed.
   *
   * Never fails the caller's screen: any read problem degrades to `locked`
   * (= propose nothing) rather than an error — a complement is never worth
   * breaking a dashboard for.
   */
  async getComplementState(userId: string, now: Date = new Date()): Promise<ProfileComplementState> {
    // Le total N'EST PAS une constante : la logique conditionnelle du §28 retire
    // des questions (commercial seul, CRM déjà branché) et en ajoute (secteur
    // public, banque, rang 2). Le serveur et l'écran appellent la MÊME fonction,
    // sinon la carte annoncerait « 3 / 30 » sur un parcours qui en compte 24.
    let total: number = TEMPS2_ANSWER_KEYS.length
    try {
      const [state, completedRuns, answers, majorActions] = await Promise.all([
        this.states.findOne({ where: { user_id: userId } }),
        this.runs.count({ where: { user_id: userId, status: COMPLETED_RUN_STATUS } }),
        this.esnProfile.getAnswers(userId),
        this.countMajorActions(userId),
      ])

      // §21 : « déclenchement après 24 h OU après 3 actions majeures ». Le
      // dossier terminé reste le déclencheur de référence — c'est celui qui
      // donne du SENS aux questions (le commercial a vu ce que Bellum en fait) ;
      // les 3 actions majeures ouvrent la porte à celui qui a beaucoup fait sans
      // encore finir d'analyse. Jamais l'inverse : on n'ouvre pas sur le seul
      // écoulement du temps, qui ne prouve aucun usage.
      const eligible = completedRuns > 0 || majorActions >= MAJOR_ACTIONS_TO_PROPOSE

      // `connectedToolNames` reste vide côté serveur (#2031.10 — remplace le
      // booléen `hasConnectedTooling`) : la question « équipement » est alors
      // comptée avec ses 14 choix, et l'écran (qui, lui, connaît les outils
      // branchés, champ par champ) ne peut que RETIRER des choix, jamais en
      // ajouter. Un compteur qui promettrait moins que le parcours réel serait
      // pire que l'inverse.
      const progress = profileQuestionnaireProgress(answers)
      total = progress.total
      const status = resolveComplementStatus(state, eligible, now)
      const snoozedUntil = state?.complement_snoozed_until ?? null

      return {
        status,
        eligible,
        visible: status === 'pending',
        answered_count: progress.answered,
        total_count: total,
        snoozed_until: status === 'snoozed' && snoozedUntil ? new Date(snoozedUntil).toISOString() : null,
      }
    } catch {
      return {
        status: 'locked',
        eligible: false,
        visible: false,
        answered_count: 0,
        total_count: total,
        snoozed_until: null,
      }
    }
  }

  /**
   * Combien d'étapes d'activation le commercial a réellement franchies (profil
   * complété, analyse lancée, dossier consulté, contact enrichi, message
   * préparé). Sans le voisin `ActivationService` (specs unitaires, module
   * allégé) : 0, donc le déclencheur historique s'applique tel quel.
   */
  private async countMajorActions(userId: string): Promise<number> {
    if (!this.activation) return 0
    const result = await this.activation.getActivation(userId)
    return isSuccess(result) ? result.output.completed_count : 0
  }

  /**
   * #2004.19 — la session d'import la plus RÉCENTE de cet utilisateur, tant
   * qu'elle n'est pas TERMINALE (`applied`/`rolled_back`) — l'assistant
   * d'import (BEL-INT-602) a encore du travail dessus, donc la reprise doit y
   * renvoyer plutôt que de deviner un autre écran.
   *
   * Personnel comme les huit jalons d'activation (`created_by`, jamais
   * l'espace) : un import lancé par un collègue ne me fait pas reprendre là où
   * LUI s'est arrêté. Sans le voisin (specs unitaires, module allégé) : `null`
   * — on ne sait pas, ce n'est pas « aucun import ».
   */
  private async findActiveImportSessionId(userId: string): Promise<string | null> {
    if (!this.importSessions) return null
    const sessions = await this.importSessions.find({
      where: { created_by: userId },
      order: { created_at: 'DESC' },
    })
    const TERMINAL: ReadonlySet<string> = new Set(['applied', 'rolled_back'])
    return sessions.find(session => !TERMINAL.has(session.state))?.id ?? null
  }

  /**
   * #2014.3 / #2014.7 — l'accueil de l'invité (ou du transféré : MÊME
   * événement, décision Louis 17/09) nomme l'espace REJOINT et qui a invité,
   * SI CONNU. `acceptInvitation` (`workspace-team.service.ts:303-357`)
   * n'écrit rien que l'onboarding lise ; la seule trace durable est
   * l'invitation elle-même, `accepted`, dont l'email correspond à CETTE
   * personne — normalisé comme au moment de l'acceptation (`.trim().toLowerCase()`,
   * même ligne 318 du service qui l'a acceptée).
   *
   * « Si connu » n'est pas de la prudence gratuite : le nom de l'inviteur peut
   * manquer (profil jamais rempli) sans que ça invalide le nom de l'espace —
   * les deux se résolvent indépendamment, jamais l'un ne devine l'autre.
   */
  private async findJoinedWorkspace(
    userId: string,
  ): Promise<{ workspace_name: string; invited_by_name: string | null } | null> {
    if (!this.profiles || !this.workspaceInvitations || !this.workspaces) return null
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    if (!profile?.email) return null
    const email = profile.email.trim().toLowerCase()
    const invitations = await this.workspaceInvitations.find({ where: { email, status: 'accepted' } })
    const invitation = [...invitations].sort(
      (a, b) => (b.accepted_at?.getTime() ?? 0) - (a.accepted_at?.getTime() ?? 0),
    )[0]
    if (!invitation) return null
    const workspace = await this.workspaces.findOne({ where: { id: invitation.workspace_id } })
    if (!workspace) return null
    const inviter = await this.profiles.findOne({ where: { user_id: invitation.invited_by } })
    const invitedByName = inviter ? [inviter.first_name, inviter.last_name].filter(Boolean).join(' ').trim() : ''
    return { workspace_name: workspace.name, invited_by_name: invitedByName || null }
  }

  /**
   * #4158.12 — le membre qui attend la description de l'ESN, avec le prénom et
   * le nom EN CLAIR de l'administrateur (propriétaire de l'espace) si sa fiche
   * les porte. `null` : rien n'est attendu (canonique présente, administrateur,
   * ou seul dans son espace).
   */
  private async findAwaitingCompanyAdmin(userId: string): Promise<{ admin_name: string | null } | null> {
    const awaiting = await this.esnProfile.getAwaitingCompanyAdmin(userId)
    if (!awaiting) return null
    const admin = this.profiles ? await this.profiles.findOne({ where: { user_id: awaiting.adminUserId } }) : null
    const name = admin ? [admin.first_name, admin.last_name].filter(Boolean).join(' ').trim() : ''
    return { admin_name: name || null }
  }

  /** « Plus tard » — silences the complement for {@link COMPLEMENT_SNOOZE_DAYS}. */
  async snoozeComplement(
    userId: string,
    now: Date = new Date(),
  ): Promise<Result<ProfileComplementState, OnboardingFailure>> {
    return this.stampComplement(userId, state => {
      state.complement_snoozed_until = new Date(now.getTime() + COMPLEMENT_SNOOZE_DAYS * MS_PER_DAY)
    })
  }

  /** « Ne plus me le proposer » — the card never comes back. The answers already
   *  given stay: refusing the reminder is not erasing a profile. */
  async dismissComplement(userId: string): Promise<Result<ProfileComplementState, OnboardingFailure>> {
    return this.stampComplement(userId, state => {
      state.complement_dismissed_at = new Date()
    })
  }

  /**
   * The rep walked through the complement. Marked done WHATEVER the number of
   * answers: every Temps-2 question is skippable by design, so requiring a full
   * house would turn a non-blocking flow into a blocking one through the back
   * door. `answered_count` keeps telling the truth about what was filled.
   */
  async completeComplement(userId: string): Promise<Result<ProfileComplementState, OnboardingFailure>> {
    const result = await this.stampComplement(userId, state => {
      state.complement_completed_at = new Date()
      state.complement_snoozed_until = null
    })
    if (isSuccess(result)) void this.analytics?.track('onboarding_complement_completed', { userId })
    return result
  }

  /* ---------------------------------------------------------------------- */
  /*  #2897 (#2091.36/.37) — la bannière « BellumAI a été repensé »          */
  /* ---------------------------------------------------------------------- */

  /**
   * La date RÉELLE de première complétion de l'onboarding — la transition
   * `to_status: 'completed'` la plus ANCIENNE du journal
   * (`user_onboarding_transitions`, #2004.12). La plus ancienne, jamais la
   * plus récente : un compte qui a rouvert le questionnaire après un
   * `refresh_required` a quand même VU l'écran Welcome dans sa forme d'ALORS
   * la première fois — c'est cette première fois qui dit s'il a connu
   * l'ancien écran ou le refondu. `null` = onboarding jamais terminé, la
   * bannière n'a alors aucun sens (pas encore de « avant/après »).
   *
   * #2021 (08/10/2026) — second appelant : `getState` expose cette même date
   * (`first_completed_at`) pour que `needsOnboarding` (web) distingue, à
   * `refresh_required`, un utilisateur déjà onboardé (bandeau, pas de
   * redirection) d'un utilisateur qui n'a jamais terminé le questionnaire
   * (toujours redirigé). Une dérivation, deux lecteurs — jamais une seconde
   * dérivation (GA-26).
   */
  private async firstOnboardingCompletionAt(userId: string): Promise<Date | null> {
    const transition = await this.transitions.findOne({
      where: { user_id: userId, to_status: 'completed' },
      order: { created_at: 'ASC' },
    })
    return transition?.created_at ?? null
  }

  /**
   * Visible SSI : l'onboarding est bel et bien terminé, sa première
   * complétion est ANTÉRIEURE à `WELCOME_REDESIGN_DATE` (la date que le
   * changelog produit annonce pour l'écran Welcome refondu — voir
   * `welcome-redesign.ts`), et l'utilisateur ne l'a pas déjà fermée. Les
   * trois raisons de `visible: false` ne sont PAS distinguées côté écran
   * (GA-18/19 : une bannière qui ne s'applique pas ne fait aucune ligne) —
   * ce service seul les tranche.
   *
   * Ne lève jamais : un problème de lecture dégrade à « invisible », jamais
   * une bannière qui casse le premier écran d'un utilisateur existant.
   */
  async getRedesignBannerState(userId: string): Promise<WelcomeRedesignBannerState> {
    try {
      const state = await this.states.findOne({ where: { user_id: userId } })
      if (state?.redesign_banner_dismissed_at) return { visible: false }
      const completedAt = await this.firstOnboardingCompletionAt(userId)
      const visible = completedAt !== null && completedAt.getTime() < new Date(WELCOME_REDESIGN_DATE).getTime()
      return { visible }
    } catch {
      return { visible: false }
    }
  }

  /** Fermée — définitif, comme `dismissComplement` : pas de report, elle ne
   *  revient pas. Les réponses de l'onboarding, elles, ne sont JAMAIS
   *  touchées ici : `redesign_banner_dismissed_at` est un état d'ÉCRAN, pas
   *  une donnée de profil — une correction humaine des réponses gagne
   *  toujours, et cette route n'en écrit aucune (doctrine CLAUDE.md). */
  async dismissRedesignBanner(userId: string): Promise<Result<WelcomeRedesignBannerState, OnboardingFailure>> {
    try {
      const stages = await this.stages.find({ order: { stage_order: 'ASC' } })
      const state = await this.ensureState(userId, stages)
      state.redesign_banner_dismissed_at = new Date()
      await this.states.save(state)
      return success(await this.getRedesignBannerState(userId))
    } catch (cause) {
      return failure(
        persistFailure('La fermeture de la bannière a échoué.', 'ce changement n’a pas été enregistré.', cause),
      )
    }
  }

  /** Applies a lifecycle stamp on the user's state row and re-reads the state. */
  private async stampComplement(
    userId: string,
    stamp: (state: UserOnboardingStateEntity) => void,
  ): Promise<Result<ProfileComplementState, OnboardingFailure>> {
    try {
      const stages = await this.stages.find({ order: { stage_order: 'ASC' } })
      const state = await this.ensureState(userId, stages)
      stamp(state)
      await this.states.save(state)
      return success(await this.getComplementState(userId))
    } catch (cause) {
      return failure(
        persistFailure(
          'La mise à jour du complément de profil a échoué.',
          'ce changement n’a pas été enregistré.',
          cause,
        ),
      )
    }
  }

  /**
   * #2004.11 / #2004.12 — le SEUL endroit qui change `status`. Deux garanties :
   *
   *  - IDEMPOTENT (#2004.11) : redemander le même état ne fait rien de plus
   *    — pas de nouvelle sauvegarde, pas de nouvelle ligne de journal. Deux
   *    `PUT` identiques n'ont donc qu'un seul effet, par construction plutôt
   *    que par déduplication après coup.
   *  - AUDITÉ (#2004.12) : toute transition RÉELLE (un changement effectif)
   *    écrit une ligne dans `user_onboarding_transitions` — `reason` porte le
   *    GESTE qui l'a causée, jamais une dérivation devinée (#2004.20 : le
   *    statut ne se lit ni dans les réponses, ni dans les crédits, ni dans
   *    l'ancien `ProfileContext`).
   *
   * Une transition absente de {@link ONBOARDING_TRANSITIONS} est refusée
   * (`invalid_transition`) — jamais silencieusement acceptée.
   */
  private async transitionTo(
    state: UserOnboardingStateEntity,
    to: OnboardingStatus,
    reason: string,
  ): Promise<Result<UserOnboardingStateEntity, OnboardingFailure>> {
    if (state.status === to) return success(state)
    const legal = ONBOARDING_TRANSITIONS[state.status]?.includes(to) ?? false
    if (!legal) {
      return failure({
        code: 'invalid_transition',
        message: `Transition refusée : ${state.status} → ${to}`,
      })
    }
    const from = state.status
    state.status = to
    const saved = await this.states.save(state)
    await this.transitions.save(
      this.transitions.create({ user_id: state.user_id, from_status: from, to_status: to, reason }),
    )
    return success(saved)
  }

  /** Reads (or seeds, if the signup trigger was bypassed) the user's state row. */
  private async ensureState(
    userId: string,
    stages: OnboardingStageDefinitionEntity[] | Promise<OnboardingStageDefinitionEntity[]>,
  ): Promise<UserOnboardingStateEntity> {
    const existing = await this.states.findOne({ where: { user_id: userId } })
    if (existing) return existing
    const known = await stages
    const firstStage = known.find(s => s.code === FIRST_TEMPS1_STAGE) ?? known[0] ?? null
    const seeded = this.states.create({
      user_id: userId,
      current_stage_id: firstStage?.id ?? null,
      status: 'not_started',
    })
    return await this.states.save(seeded)
  }
}
