import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, MoreThanOrEqual, Repository } from 'typeorm'
import {
  ACCOUNT_HIRING_INTERVENTION_KEY,
  ACCOUNT_PAIN_INTERVENTION_KEY,
  adoptionBudgetFor,
  afterIntervention,
  afterReaction,
  applyFrequencyDiscount,
  applyPreferenceDiscount,
  applyWorkspacePreferenceDiscount,
  canInterrupt,
  computeWorkspaceHealth,
  EMPTY_INTERRUPTION_STATE,
  findIntervention,
  GOLDEN_MOMENT_INTERVENTIONS,
  IGNORED_AFTER_HOURS,
  isHygieneReminder,
  isInterruptionSilenced,
  isRefusal,
  isStaleSinceHumanCorrection,
  LAURA_INTERVENTIONS,
  messagePriority,
  FOLLOW_UP_OVERDUE_KEY,
  MISSION_START_NOT_READY_KEY,
  routeContractFor,
  REFUSAL_REACTIONS,
  shouldAlertTeam,
  startOfDay,
  type DailyObservation,
  type GoldenMoment,
  type HealthInput,
  type InterruptionState,
  type InterventionDefinition,
  type InterventionReaction,
  type PlanFeatureKey,
  type SilenceReason,
  type AccountSuggestion,
  type MissionStartAnnouncement,
  type OverdueFollowUp,
  type ProvenanceEntityType,
  type WorkspaceHealth,
} from '@bellum/contracts'
import type { BenchCostResult } from '../consultants/bench-cost'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProvenanceService } from '../crm-core/provenance.service'
import type { BriefingReading } from '../briefing/briefing-role-order'
import { CHAT_SCREEN, orderChatCandidates } from './laura-chat-signals'

/**
 * LAURA PRODUIT — la couche proactive du copilote (PDF 10 §5).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI LA DISTINGUE DU COPILOTE
 * ─────────────────────────────────────────────────────────────────────────
 * Une seule chose, et le §5.2 la dit en une ligne : **le copilote répond à une
 * question posée, Laura parle en premier**. D44 tranche qu'elle est une
 * SURCOUCHE et non un second moteur — deux moteurs de conversation dans le même
 * produit, « c'est deux fois la dette et deux vérités possibles ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES D'HONNÊTETÉ
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Rien à dire ⇒ rien envoyé.** Jamais de « tout va bien aujourd'hui ». Un
 *    message qui ne dit rien consomme la même attention qu'un message utile, et
 *    il apprend à ne plus regarder.
 * 2. **Le score de santé ne sort pas côté application.** Il décide du BUDGET
 *    d'interventions d'adoption et alimente l'alerte commerciale (D50) ; ce qui
 *    s'affiche à l'utilisateur est la CAUSE, jamais la note.
 * 3. **Une intervention refusée ne revient pas avant trente jours.** C'est la
 *    seule façon qu'un refus veuille dire quelque chose.
 *
 * ⚠️ Le service ne DÉCLENCHE rien : il rend le plan. C'est l'écran qui affiche,
 * et l'utilisateur qui clique. Laura Produit n'écrit jamais (D48).
 */

/** §5.7 : « elle refuse une proposition, tu ne la reproposes pas avant 30 jours ». */
const REFUSAL_COOLDOWN_DAYS = 30
/**
 * #2403.37 — LE COOLDOWN PAR CLÉ, DISTINCT DU DÉLAI GLOBAL.
 *
 * `MIN_GAP_MINUTES` (vingt minutes, `interruption-budget.ts`) espace DEUX
 * interventions QUELCONQUES. Rien n'empêchait la MÊME clé de revenir vingt
 * minutes après avoir été ignorée — sur un autre écran, ou le lendemain sur
 * le même (`screensServed` se réarme chaque jour). Un « même événement, même
 * cooldown » que le refus explicite mais plus court, puisqu'aucun refus
 * explicite n'a été exprimé : vingt-quatre heures, la même échelle que
 * `IGNORED_AFTER_HOURS` — le temps qu'une intervention non lue ait
 * effectivement eu sa chance d'être vue.
 */
const KEY_COOLDOWN_HOURS = 24
/*
 * #2875 (décision Louis 11/10/2026) — les RAPPELS D'HYGIÈNE (`hygiene: true` au
 * catalogue : `calls_without_debrief`, `mission_ended_without_feedback`) sont
 * HORS du budget d'interruption : leurs traces ne comptent ni dans le plafond du
 * jour, ni dans « une par écran », ni dans les vingt minutes, ni dans le budget
 * adaptatif ; leurs réactions ne réduisent ni ne retirent rien. Leur garde-fou
 * anti-spam est `KEY_COOLDOWN_HOURS` ci-dessus, déjà appliqué à toute clé : UNE
 * fois par jour et par sujet — pas un second réglage (GA-26).
 */
/**
 * ⚠️ Mesuré en production le 10/09/2026 sur `/settings/memory` : « Confronter
 * son profil aux besoins ouverts. » proposée et refusée NEUF fois en dix jours
 * (01/09 → 10/09), alors que §5.7 promet trente. La liste était bien ÉCRITE
 * (les neuf traces existent) mais elle n'était pas LUE en entier au moment de
 * proposer : `recentTraces` plafonnait à 50 LIGNES — un compte pensé pour
 * « aujourd'hui » et « hier » (`stateFrom`, `streak`) — alors que `eligible()`
 * l'utilise AUSSI pour honorer un cooldown de TRENTE JOURS. Sur un espace actif
 * (plusieurs interventions par jour, tous écrans confondus), le refus le plus
 * ancien sort de la fenêtre des 50 lignes bien avant ses trente jours, et Laura
 * reproposait ce qu'elle venait de se faire refuser.
 *
 * La fenêtre de lecture doit donc couvrir AU MOINS `REFUSAL_COOLDOWN_DAYS` —
 * elle ne peut plus être un compte de lignes indépendant de la règle qu'elle
 * sert. `RECENT_TRACES_MAX_ROWS` reste un garde-fou de VOLUME, pas la borne
 * effective : au plafond produit (5 propositions/jour), trente jours ne
 * dépassent jamais 150 lignes.
 */
const RECENT_TRACES_WINDOW_DAYS = REFUSAL_COOLDOWN_DAYS
const RECENT_TRACES_MAX_ROWS = 500
/**
 * #2403.22 — FRÉQUENCE : la fenêtre sur laquelle on compte les OFFRES (toute
 * réaction confondue, refusée ou non), distincte des trente jours du cooldown
 * de refus. Sept jours : assez long pour voir une clé revenir plusieurs fois
 * dans une semaine de travail normale, assez court pour qu'une clé ancienne
 * mais jamais revue depuis ne porte plus aucune pénalité.
 */
const FREQUENCY_WINDOW_DAYS = 7

type LauraPlan =
  | { speaks: false; reason: SilenceReason | 'nothing_to_say' }
  | {
      speaks: true
      intervention: InterventionDefinition
      priority: number
      traceId: string
      /** Présent quand le plafond était atteint et qu'un moment d'or (§13.3) l'a
       *  levé — pour que l'écran puisse DIRE pourquoi Laura parle quand même. */
      goldenMoment?: GoldenMoment
      /**
       * Le coût de l'intercontrat de `long_bench`, quand le catalogue seul ne
       * suffit pas à dire ce qui compte — « un consultant est en intercontrat »
       * ne dit pas ce que ça COÛTE, le chiffre qui déclenche l'action. Réservé à
       * cette clé UNIQUEMENT : les vingt-neuf autres interventions restent
       * portées par leur seule phrase de catalogue, statique et partagée — en
       * ajouter une seconde ferait deux chemins pour la même information le jour
       * où l'une diverge de l'autre.
       *
       * ⚠️ **Le RÉSULTAT, pas une phrase.** `BenchCostResult` voyage tel que
       * `computeBenchCost` le rend — un montant en CENTIMES, ou une raison
       * NOMMÉE (`tjm_missing` | `duration_unknown`). Composer une chaîne ici
       * (« Coût de l'intercontrat : 13 500 €. ») a été essayé et corrigé : une
       * phrase composée côté serveur est nécessairement dans UNE langue, et un
       * client anglophone la recevait telle quelle. L'écran, qui connaît la
       * langue de l'utilisateur, compose la phrase ; ce service ne rend que le
       * fait.
       */
      benchCost?: BenchCostResult
      /**
       * Ce qui a produit la suggestion posée sur un DOSSIER de compte — les
       * faits, leurs sources, et la ressource croisée.
       *
       * Réservé à `ACCOUNT_HIRING_INTERVENTION_KEY` (la douleur #3939.3 a SON
       * champ, `painSuggestion`), exactement comme `benchCost`
       * l'est à `long_bench` et pour la même raison : les autres interventions
       * restent portées par leur seule phrase de catalogue, et en attacher une
       * seconde source d'information ferait deux chemins pour la même chose le
       * jour où l'une diverge de l'autre.
       *
       * ⚠️ **Le RÉSULTAT, pas une phrase.** Composer « Airbus Toulouse ouvre
       * deux postes… » ici serait nécessairement du français, et un client
       * anglophone le recevrait tel quel — c'est le défaut déjà corrigé sur
       * `benchCost`. L'écran, qui connaît la langue, compose ; ce service ne
       * rend que les faits.
       *
       * ⚠️ C'est aussi ce que « Pourquoi cette suggestion ? » rend : une
       * suggestion qu'on ne peut pas décomposer est une boîte noire, et le dépôt
       * en refuse.
       */
      accountSuggestion?: AccountSuggestion
      /**
       * #2409.8 — la mission la plus proche d'un démarrage incomplet, ses
       * manques NOMMÉS (clés). Réservé à `mission_start_not_ready`, même règle
       * que `benchCost` / `accountSuggestion` : le RÉSULTAT, jamais une phrase.
       */
      missionStart?: MissionStartAnnouncement
      /**
       * #3398.4a — la relance la plus en retard, NOMMÉE. Réservé à
       * `follow_up_overdue`, même règle que `benchCost` : le RÉSULTAT, jamais une phrase.
       */
      overdueFollowUp?: OverdueFollowUp
    }

@Injectable()
export class LauraService {
  private readonly logger = new Logger(LauraService.name)

  constructor(
    @InjectRepository(LauraInterventionEntity)
    private readonly interventions: Repository<LauraInterventionEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferences: Repository<NotificationPreferenceEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly provenance: ProvenanceService,
  ) {}

  /**
   * Le score de santé d'un espace, à partir de mesures faites ailleurs.
   *
   * Le service ne va PAS les chercher lui-même : chaque axe appartient à un
   * module qui sait le mesurer, et les rapatrier ici ferait de Laura un
   * importateur de six services de plus — c'est-à-dire GA-07 au plafond pour une
   * lecture. L'appelant passe ce qu'il sait, `null` pour le reste, et le calcul
   * écarte proprement ce qui manque.
   */
  health(input: HealthInput): WorkspaceHealth {
    return computeWorkspaceHealth(input)
  }

  /** D50 : sous 25, c'est l'ÉQUIPE qu'on prévient, jamais l'utilisateur. */
  alertsTeam(health: WorkspaceHealth): boolean {
    return shouldAlertTeam(health)
  }

  /** Le catalogue, pour l'écran de réglages : il dit ce que Laura sait dire. */
  catalogue(): readonly InterventionDefinition[] {
    return LAURA_INTERVENTIONS
  }

  /**
   * Que dit Laura sur cet écran, maintenant ?
   *
   * `candidateKeys` est ce que l'appelant a détecté — les clés du catalogue dont
   * la condition est remplie. Le service arbitre : budget d'interruption,
   * refus récents écartés, priorité la plus haute. Quand il se tait, il rend une
   * RAISON nommée : « elle ne dit rien » n'est pas une information, et chacune
   * de ces raisons appelle un geste produit différent.
   */
  async plan(
    userId: string,
    options: {
      workspaceId: string | null
      screen: string
      busy: boolean
      candidateKeys: readonly string[]
      health: WorkspaceHealth
      /**
       * #2406.35 — les paliers ouverts sur cet espace (`PlanFeaturesService`).
       * Une intervention dont la `route` mène à un écran verrouillé par le
       * palier (`routeContractFor(route).requiredPlanFeature`) n'est jamais
       * candidate : elle enverrait la personne vers un cadenas au lieu du
       * geste annoncé. Repli VIDE = « on ne sait pas encore » (même doute que
       * `resolveRouteAccess`) : ça n'écarte rien, plutôt que d'écarter à tort
       * pendant qu'une lecture est en cours.
       */
      planFeatures?: readonly PlanFeatureKey[]
      /**
       * Le moment d'or en cours (§13.3), détecté SERVEUR. `null` = aucun.
       * Il lève le plafond, et rien d'autre.
       */
      goldenMoment?: GoldenMoment | null
      /**
       * Les questions posées au copilote HIER — la moitié de l'observation que
       * le service ne sait pas lire lui-même (elle vit dans `chat_messages`, et
       * un service qui va chercher le service d'un voisin est ce que GA-07
       * fige). `null` ou absent = NON MESURÉ, jamais « zéro question ».
       */
      spontaneousQueriesYesterday?: number | null
      /**
       * Le coût de l'intercontrat le plus parlant de l'espace — mesuré par
       * `LauraProbeService.longestBenchConsultant`, côté appelant, et seulement
       * quand `long_bench` est déjà une candidate (pas de lecture pour rien).
       * `null` = personne en intercontrat long, ou coût illisible ; absent =
       * l'appelant n'a pas demandé cette mesure. Les trois cas ne se confondent
       * jamais : ce service les relaie tels quels sur `benchCost`, voir sa doc
       * au-dessus.
       */
      longBenchCost?: BenchCostResult | null
      /**
       * Ce qui a produit la suggestion du dossier ouvert, mesuré par le
       * contrôleur — et seulement quand la clé du compte est déjà une candidate
       * (pas de lecture pour rien, même règle que `longBenchCost`).
       *
       * ⚠️ Elle n'ouvre AUCUN passe-droit. Elle arrive après `canInterrupt` dans
       * la lecture comme dans l'exécution : une suggestion parfaitement fondée
       * sur un espace en retrait, sur un écran déjà servi ou vingt minutes après
       * la précédente ne s'affiche pas. Le budget d'interruption décide, ce
       * champ décore.
       */
      accountSuggestion?: AccountSuggestion | null
      /**
       * #3939.3 — les faits de la DOULEUR sourcée du dossier, lus par le
       * contrôleur seulement quand `account_pain_with_dated_signal` est candidate.
       * Même règle que `accountSuggestion` : aucun passe-droit, le budget décide ;
       * rendus sous `accountSuggestion` quand (et seulement quand) c'est elle qui parle.
       */
      painSuggestion?: AccountSuggestion | null
      /** #2409.8 — lu par le contrôleur seulement quand `mission_start_not_ready` est candidate. */
      missionStart?: MissionStartAnnouncement | null
      /** #3398.4a — lue par le contrôleur seulement quand `follow_up_overdue` est candidate. */
      overdueFollowUp?: OverdueFollowUp | null
      /**
       * #3398 — la lecture du rôle, posée par le contrôleur. Sur /chat
       * seulement : elle RÉORDONNE les candidates (jamais ne filtre), le
       * budget d'interruption restant l'arbitre.
       */
      chatReading?: BriefingReading
      /**
       * X37 / #3398 — salle de démonstration : le budget se juge sur un
       * historique VIDE. Les visites précédentes (recettes, autres prospects)
       * ne doivent pas rendre muette la bulle qu'un prospect vient voir.
       */
      demo?: boolean
      now?: Date
    },
  ): Promise<LauraPlan> {
    const now = options.now ?? new Date()
    // perf P3 — trois lectures INDÉPENDANTES : en parallèle, pas en série.
    // #2319.118 — l'agrégat À PORTÉE ESPACE, jamais entre espaces (GA-43) :
    // une requête de plus, bornée par construction à CE `workspace_id`. Voir
    // la doc de {@link eligible}.
    const [traces, preference, workspaceRefusalCounts] = await Promise.all([
      options.demo ? Promise.resolve([]) : this.recentTraces(userId, now),
      this.preferenceFor(userId),
      this.workspaceRefusalCountByKey(options.workspaceId, now),
    ])
    // #2875 — le budget se juge sur les traces QUI LE CONSOMMENT : un rappel
    // d'hygiène n'en fait pas partie (voir `KEY_COOLDOWN_HOURS`).
    const budgetTraces = withinBudget(traces)
    const state = this.stateFrom(budgetTraces, preference, now)

    const verdict = canInterrupt({
      state,
      screen: options.screen,
      busy: options.busy,
      sentToday: this.countToday(budgetTraces, now),
      cap: preference.proactivity_cap,
      // §13.2 — le plafond suit le comportement. Le calcul vit dans le contrat ;
      // le service ne fournit que ce qu'il a OBSERVÉ.
      yesterday: this.yesterdayFrom(budgetTraces, options.spontaneousQueriesYesterday ?? null, now),
      goldenMoment: options.goldenMoment ?? null,
      now: now.getTime(),
    })
    // #2875 — un rappel d'hygiène n'est pas bloqué par le budget, mais la
    // VOLONTÉ de la personne (coupée, en retrait, occupée) le fait taire.
    const hygieneOpen = !options.busy && !isInterruptionSilenced(state, now.getTime())
    if (!verdict.allowed && !hygieneOpen) return { speaks: false, reason: verdict.reason }

    let candidates = this.eligible(
      options.candidateKeys,
      options.health,
      traces,
      now,
      options.planFeatures ?? [],
      workspaceRefusalCounts,
    )
    // Budget refusé : seuls les rappels d'hygiène restent candidats.
    if (!verdict.allowed) {
      candidates = candidates.filter(candidate => candidate.intervention.hygiene)
      if (!candidates.length) return { speaks: false, reason: verdict.reason }
    }
    if (verdict.allowed && verdict.goldenMoment) {
      // La dérogation a servi : elle ne fait passer que ce qui la CONCERNE.
      // Sans ce filtre, un jeton de connecteur expiré donnerait à Laura un
      // budget illimité pour parler d'autre chose — et le §13 tout entier
      // existe pour éviter ça. Un moment d'or sans rien à dire laisse Laura
      // silencieuse, ce qui est le comportement correct : une dérogation
      // n'oblige à rien.
      const carried = GOLDEN_MOMENT_INTERVENTIONS[verdict.goldenMoment]
      // #2875 — un rappel d'hygiène n'a pas besoin de la dérogation : il passe hors budget.
      candidates = candidates.filter(
        candidate => carried.includes(candidate.intervention.key) || candidate.intervention.hygiene,
      )
    }
    if (!candidates.length) return { speaks: false, reason: 'nothing_to_say' }
    if (options.screen === CHAT_SCREEN && options.chatReading) {
      const order = orderChatCandidates(
        candidates.map(candidate => candidate.intervention.key),
        options.chatReading,
      )
      candidates = order.map(key => candidates.find(candidate => candidate.intervention.key === key)!)
    }

    const best = candidates[0]!
    // #2403.32 — les clés ÉVINCÉES par ce même arbitrage, dans l'ordre où
    // `eligible()` les a triées. `best` en fait partie (c'est `candidates[0]`)
    // et n'a donc rien à faire dans SA propre liste d'évincés.
    const suppressedCandidates = candidates.slice(1).map(candidate => candidate.intervention.key)
    // #2403.38 — l'ENTITÉ que cette trace concerne, quand elle en a une.
    // Réservée aux deux clés du dossier (recrutement, douleur #3939.3) : les
    // seules dont l'appelant fournit un identifiant de fiche stable
    // (`accountId` de leur suggestion) — les autres restent `null`, comme
    // avant ce champ.
    // #3939.3 — chaque clé du dossier n'emporte que SES faits : le recrutement
    // les siens, la douleur les siens. Jamais l'un sous l'autre.
    const accountSuggestion =
      best.intervention.key === ACCOUNT_HIRING_INTERVENTION_KEY
        ? (options.accountSuggestion ?? null)
        : best.intervention.key === ACCOUNT_PAIN_INTERVENTION_KEY
          ? (options.painSuggestion ?? null)
          : null
    const entityRef = accountSuggestion
      ? { entity_type: 'account' as const, entity_id: accountSuggestion.accountId }
      : { entity_type: null, entity_id: null }
    const trace = await this.interventions.save(
      this.interventions.create({
        user_id: userId,
        workspace_id: options.workspaceId,
        intervention_key: best.intervention.key,
        screen: options.screen,
        format: best.intervention.format,
        priority: best.priority,
        reaction: null,
        reacted_at: null,
        suppressed_candidates: suppressedCandidates,
        ...entityRef,
      }),
    )

    // #2875 — un rappel d'hygiène ne consomme rien : l'écran reste à servir.
    const hygiene = Boolean(best.intervention.hygiene)
    if (!hygiene) await this.persistState(userId, afterIntervention(state, options.screen, now.getTime()))
    // Le coût dynamique ne s'attache qu'à `long_bench` : c'est la clé pour
    // laquelle l'appelant a mesuré un coût, et c'est la SEULE que ce service ait
    // le mandat d'enrichir (le reste du catalogue reste sa phrase statique). Le
    // RÉSULTAT relayé tel quel — voir la doc de `benchCost` au-dessus.
    const benchCost = best.intervention.key === 'long_bench' ? (options.longBenchCost ?? null) : null
    // Même règle, même raison : les faits du dossier n'accompagnent QUE
    // l'intervention du dossier. Une suggestion de compte attachée à
    // `credits_expiring` afficherait des sources qui n'ont rien produit.
    // (`accountSuggestion` est choisi plus haut, avec l'entité de la trace.)
    // #2409.8 — les manques du démarrage n'accompagnent QUE leur intervention.
    const missionStart = best.intervention.key === MISSION_START_NOT_READY_KEY ? (options.missionStart ?? null) : null
    // #3398.4a — la relance nommée n'accompagne QUE sa clé.
    const overdueFollowUp = best.intervention.key === FOLLOW_UP_OVERDUE_KEY ? (options.overdueFollowUp ?? null) : null
    return {
      speaks: true,
      intervention: best.intervention,
      priority: best.priority,
      traceId: trace.id,
      ...(verdict.allowed && verdict.goldenMoment && !hygiene ? { goldenMoment: verdict.goldenMoment } : {}),
      ...(benchCost ? { benchCost } : {}),
      ...(accountSuggestion ? { accountSuggestion } : {}),
      ...(missionStart ? { missionStart } : {}),
      ...(overdueFollowUp ? { overdueFollowUp } : {}),
    }
  }

  /**
   * Ce que la personne a fait de l'intervention.
   *
   * C'est ce geste qui pilote les deux mécaniques de retrait — et un geste
   * UTILE remet tout à zéro, parce que c'est le seul signal qui dit « continue ».
   *
   * #2403.38 — `stale: true` quand la personne AGIT OU REFUSE sur une trace
   * qui porte une ENTITÉ (les deux clés du dossier de compte) et
   * qu'un humain a CORRIGÉ cette fiche depuis que la trace a été posée :
   * « une correction humaine gagne toujours, quelle que soit sa date »
   * (`CLAUDE.md` § Doctrine). Le geste est ENREGISTRÉ tout de même (D48 :
   * Laura Produit n'écrit jamais, ne bloque jamais un geste à sa place) ;
   * `stale` ne fait que le NOMMER pour l'écran. `false` sur les ~29 autres
   * clés (aucune entité) et sur toute autre réaction : chemin
   * BYTE-IDENTIQUE à avant ce champ.
   *
   * #2403.33 — un REFUS (`'refused'`) sur une entité PÉRIMÉE est enregistré
   * sous `'refused_stale_data'` plutôt que `'refused'` ordinaire : ce n'est
   * pas « pas maintenant », c'est « c'était faux ». Sinon, un REFUS sur une
   * entité qui a déjà reçu une action DEPUIS la pose de la trace (`user_actions`
   * — le journal d'actions, CRM branché compris) est enregistré sous
   * `'refused_handled_elsewhere'` : ce n'est toujours pas « pas maintenant »,
   * c'est « déjà traité, ailleurs ». Les deux sont désormais RÉELLEMENT
   * signalées (voir la doc de {@link INTERVENTION_REACTIONS}) ; l'écran
   * continue d'envoyer `'refused'` — c'est ce service, seul, qui choisit la
   * forme à écrire, « c'était faux » vérifié EN PREMIER (les deux peuvent
   * être vraies à la fois, et c'est la raison la plus utile des deux).
   */
  async react(
    userId: string,
    traceId: string,
    reaction: InterventionReaction,
    now = new Date(),
  ): Promise<{ stale: boolean; handledElsewhere: boolean }> {
    const trace = await this.interventions.findOne({ where: { id: traceId, user_id: userId } })
    // Une trace inconnue n'est pas une erreur à faire remonter : elle vient d'un
    // onglet resté ouvert, ou d'un espace remis à neuf.
    if (!trace) return { stale: false, handledElsewhere: false }
    // Une réaction ne se réécrit pas. Rejouer un clic ne doit pas faire
    // descendre deux fois le plafond de quelqu'un.
    if (trace.reaction) return { stale: false, handledElsewhere: false }

    const stale = await this.isActingOnStaleEntity(trace, reaction)
    // #2403.33 — n'interroge `user_actions` que si la donnée n'est pas déjà
    // périmée : un refus ne porte qu'UNE forme écrite, pas de lecture pour
    // rien une fois la raison la plus utile déjà trouvée.
    const handledElsewhere = !stale && (await this.wasHandledElsewhere(trace, reaction))
    // #2403.33 — la forme ÉCRITE, jamais celle reçue de l'écran : un refus
    // sur une entité périmée devient `refused_stale_data`, un refus sur une
    // entité déjà traitée ailleurs devient `refused_handled_elsewhere`, tout
    // le reste part tel quel.
    const recordedReaction: InterventionReaction =
      stale && reaction === 'refused'
        ? 'refused_stale_data'
        : handledElsewhere && reaction === 'refused'
          ? 'refused_handled_elsewhere'
          : reaction

    trace.reaction = recordedReaction
    trace.reacted_at = now
    await this.interventions.save(trace)

    // #2875 — la réaction à un rappel d'hygiène ne touche pas au budget partagé.
    if (isHygieneReminder(trace.intervention_key)) return { stale, handledElsewhere }
    const preference = await this.preferenceFor(userId)
    const traces = withinBudget(await this.recentTraces(userId, now))
    await this.persistState(
      userId,
      afterReaction(this.stateFrom(traces, preference, now), recordedReaction, now.getTime()),
    )
    return { stale, handledElsewhere }
  }

  /**
   * #2403.33 — CET objet (compte ou contact) a-t-il déjà reçu une action
   * DEPUIS que cette trace a été posée ?
   *
   * `user_actions` est le journal générique déjà écrit par le CRM branché
   * (`export`, `crm_task_created`…) COMME par Bellum (`plan_action_completed`,
   * `commercial_status_changed`…) — une ligne n'importe laquelle, sur le MÊME
   * objet, postérieure à la trace, dit que quelqu'un a déjà agi ailleurs que
   * dans cette bulle. `false` par défaut : aucune entité sur la trace, un
   * type d'entité que `user_actions` ne borne pas (seuls `account_id` et
   * `contact_id` existent sur cette table), ou aucune ligne trouvée.
   */
  private async wasHandledElsewhere(trace: LauraInterventionEntity, reaction: InterventionReaction): Promise<boolean> {
    if (reaction !== 'refused' || !trace.entity_type || !trace.entity_id || !trace.workspace_id) return false
    if (trace.entity_type !== 'account' && trace.entity_type !== 'contact') return false
    const column = trace.entity_type === 'account' ? 'account_id' : 'contact_id'
    const count = await this.userActions.count({
      where: {
        workspace_id: trace.workspace_id,
        [column]: trace.entity_id,
        created_at: MoreThan(trace.created_at),
      },
    })
    return count > 0
  }

  /** #2403.38/#2403.33 — voir la doc de {@link react}. */
  private async isActingOnStaleEntity(
    trace: LauraInterventionEntity,
    reaction: InterventionReaction,
  ): Promise<boolean> {
    if (
      (reaction !== 'acted' && reaction !== 'refused') ||
      !trace.entity_type ||
      !trace.entity_id ||
      !trace.workspace_id
    ) {
      return false
    }
    const lastCorrection = await this.provenance.lastHumanCorrectionAt(
      trace.workspace_id,
      trace.entity_type as ProvenanceEntityType,
      trace.entity_id,
    )
    return isStaleSinceHumanCorrection(trace.created_at, lastCorrection)
  }

  async isEnabled(userId: string): Promise<boolean> {
    return (await this.preferenceFor(userId)).laura_enabled
  }

  /* ------------------------------------------------------------------ */
  /*  Calcul — pur à partir de ce qui a été lu                           */
  /* ------------------------------------------------------------------ */

  private eligible(
    keys: readonly string[],
    health: WorkspaceHealth,
    traces: readonly LauraInterventionEntity[],
    now: Date,
    planFeatures: readonly PlanFeatureKey[],
    // #2319.118 — l'agrégat À PORTÉE ESPACE (voir `workspaceRefusalCountByKey`).
    // Carte vide par défaut : les appelants qui n'ont pas encore de
    // `workspaceId` lisible (aucun aujourd'hui, gardé pour les tests
    // existants qui construisent `eligible` sans ce paramètre) gardent un
    // comportement STRICTEMENT inchangé.
    workspaceRefusalCounts: ReadonlyMap<string, number> = new Map(),
  ): { intervention: InterventionDefinition; priority: number }[] {
    const refusedSince = now.getTime() - REFUSAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    const adoptionBudget = adoptionBudgetFor(health.reading)
    // #2403.34 — la priorité qu'avait CE refus, la plus récente par clé (les
    // traces arrivent triées `DESC`, donc la première rencontrée par clé est
    // la plus récente). Un `Set` suffisait tant que le refus était absolu ;
    // la dérogation « changement matériel » a besoin de savoir CONTRE QUOI
    // comparer la priorité recalculée aujourd'hui.
    const mostRecentRefusalPriority = new Map<string, number>()
    // #2403.24 — PRÉFÉRENCE : le COMPTE de refus réels par clé, dans la même
    // fenêtre déjà lue pour le cooldown (`RECENT_TRACES_WINDOW_DAYS`, aucune
    // requête supplémentaire). Sert `applyPreferenceDiscount` plus bas — une
    // clé jamais refusée reste à 0, comportement inchangé.
    const refusalCountByKey = new Map<string, number>()
    for (const trace of traces) {
      // #2403.33 — `refused_stale_data` compte comme un refus, exactement comme
      // `refused` ordinaire (voir {@link isRefusal}) : le cooldown et PRÉFÉRENCE
      // ne doivent pas oublier cette seconde forme.
      if (!isRefusal(trace.reaction) || trace.created_at.getTime() <= refusedSince) continue
      refusalCountByKey.set(trace.intervention_key, (refusalCountByKey.get(trace.intervention_key) ?? 0) + 1)
      if (!mostRecentRefusalPriority.has(trace.intervention_key)) {
        // Une priorité illisible sur la trace refusée ne peut pas PROUVER une
        // aggravation : elle ne lève rien, exactement comme n'importe quelle
        // mesure absente ailleurs dans ce fichier (non mesuré ≠ zéro, non
        // mesuré ≠ dérogation accordée).
        mostRecentRefusalPriority.set(
          trace.intervention_key,
          Number.isFinite(trace.priority) ? trace.priority : Number.POSITIVE_INFINITY,
        )
      }
    }
    // #2403.37 — cooldown PAR CLÉ, toute réaction confondue (voir sa doc plus
    // haut). Un refus récent tombe déjà dedans ; c'est le cas SANS refus —
    // ignorée, fermée sans lecture, ou même pas encore réagie — que rien ne
    // couvrait.
    const keyCooldownSince = now.getTime() - KEY_COOLDOWN_HOURS * 60 * 60 * 1000
    const recentlyOffered = new Set(
      traces.filter(trace => trace.created_at.getTime() > keyCooldownSince).map(trace => trace.intervention_key),
    )
    // #2403.22 — FRÉQUENCE : le COMPTE RÉEL d'OFFRES (toute réaction
    // confondue) par clé, dans la fenêtre de sept jours — aucune requête
    // supplémentaire, `traces` est déjà lu. Sert `applyFrequencyDiscount`
    // plus bas ; une clé jamais offerte dans la fenêtre reste à 0,
    // comportement inchangé.
    const frequencyWindowSince = now.getTime() - FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const offeredCountByKey = new Map<string, number>()
    for (const trace of traces) {
      if (trace.created_at.getTime() <= frequencyWindowSince) continue
      offeredCountByKey.set(trace.intervention_key, (offeredCountByKey.get(trace.intervention_key) ?? 0) + 1)
    }

    return (
      keys
        .map(key => findIntervention(key))
        .filter((intervention): intervention is InterventionDefinition => intervention !== null)
        // Le §5.6 : un espace SAIN ne reçoit aucune intervention d'adoption. Ce
        // qui relève du risque ou de la valeur métier passe toujours — un
        // connecteur en panne est un fait, pas une invitation à explorer.
        .filter(intervention => intervention.family !== 'adoption' || adoptionBudget > 0)
        // #2406.35 — un palier vide veut dire « on ne sait pas encore » (voir la
        // doc du paramètre), donc il n'écarte rien ; un palier CONNU qui n'ouvre
        // pas la route de l'intervention l'écarte, plutôt que d'envoyer la
        // personne vers un écran verrouillé.
        .filter(intervention => {
          if (planFeatures.length === 0 || !intervention.route) return true
          const required = routeContractFor(intervention.route)?.requiredPlanFeature
          return !required || planFeatures.includes(required)
        })
        .filter(intervention => !recentlyOffered.has(intervention.key))
        .map(intervention => ({
          intervention,
          // #2403.24 — PRÉFÉRENCE (personnelle), puis #2319.118 — PRÉFÉRENCE
          // ESPACE, puis #2403.22 — FRÉQUENCE : `messagePriority` reste
          // inchangée (le produit des trois facteurs du catalogue) ; les trois
          // post-traitements réduisent ensuite le classement, chacun sur son
          // propre compte RÉEL (refus personnels, refus d'espace, puis
          // offres) — jamais l'un à la place de l'autre, jamais sur les clés
          // jamais concernées. L'ordre reflète la force du signal : un refus
          // personnel prime sur un refus d'équipe, qui prime sur la simple
          // répétition.
          priority: applyFrequencyDiscount(
            applyWorkspacePreferenceDiscount(
              applyPreferenceDiscount(
                messagePriority({
                  businessImpact: intervention.impact,
                  urgency: intervention.urgency,
                  actionability: intervention.actionability,
                }),
                refusalCountByKey.get(intervention.key) ?? 0,
              ),
              workspaceRefusalCounts.get(intervention.key) ?? 0,
            ),
            offeredCountByKey.get(intervention.key) ?? 0,
          ),
        }))
        .filter(candidate => candidate.priority > 0)
        .filter(candidate => {
          const refusedAtPriority = mostRecentRefusalPriority.get(candidate.intervention.key)
          // §5.7 : un refus explicite tient trente jours — SAUF « changement
          // matériel ». Rien dans le catalogue ne dit ce qui a changé dans les
          // FAITS ; ce qu'on SAIT recalculer, c'est si la situation s'est
          // matériellement AGGRAVÉE : la priorité (impact × urgence ×
          // capacité d'agir, revue à chaque appel) dépasse strictement celle
          // qu'elle avait au moment du refus. Un mérite égal ou moindre ne
          // lève rien — sinon toute fluctuation de mesure rouvrirait le refus.
          return refusedAtPriority === undefined || candidate.priority > refusedAtPriority
        })
        .sort((a, b) => b.priority - a.priority || a.intervention.key.localeCompare(b.intervention.key))
    )
  }

  private stateFrom(
    traces: readonly LauraInterventionEntity[],
    preference: NotificationPreferenceEntity,
    now: Date,
  ): InterruptionState {
    const today = traces.filter(trace => trace.created_at >= startOfToday(now))
    const state: InterruptionState = {
      ...EMPTY_INTERRUPTION_STATE,
      screensServed: [...new Set(today.map(trace => trace.screen))],
      lastInterventionAt: traces[0]?.created_at.getTime() ?? null,
      consecutiveIgnored: this.streak(traces, 'ignored', now),
      consecutiveClosedUnread: this.streak(traces, 'closed_unread', now),
      retreatUntil: preference.laura_retreat_until?.getTime() ?? null,
      throttleUntil: preference.laura_throttle_until?.getTime() ?? null,
      disabled: !preference.laura_enabled,
    }
    // Les écrans se réarment chaque jour ; le retrait et le plafond réduit sont
    // datés et n'ont rien à réinitialiser. On passe quand même par la fonction
    // pure pour que la règle vive à un seul endroit.
    return today.length ? state : startOfDay(state)
  }

  /**
   * Combien de réactions de ce type se suivent, en partant de la plus récente.
   *
   * Une intervention SANS réaction et vieille de plus de 24 h compte comme
   * ignorée — c'est la définition du §5.3. Une intervention de ce matin est
   * neutre : elle n'a pas encore eu le temps d'être ignorée, et l'arrivée d'une
   * réaction plus tard reste possible.
   */
  private streak(traces: readonly LauraInterventionEntity[], reaction: InterventionReaction, now: Date): number {
    const cutoff = now.getTime() - IGNORED_AFTER_HOURS * 60 * 60 * 1000
    let count = 0
    for (const trace of traces) {
      const effective: InterventionReaction | null =
        (trace.reaction as InterventionReaction | null) ?? (trace.created_at.getTime() < cutoff ? 'ignored' : null)
      if (effective === null) continue
      if (effective !== reaction) break
      count += 1
    }
    return count
  }

  private countToday(traces: readonly LauraInterventionEntity[], now: Date): number {
    return traces.filter(trace => trace.created_at >= startOfToday(now)).length
  }

  /**
   * Ce qu'on a observé HIER — la matière du budget adaptatif (§13.2).
   *
   * Bornée à la journée civile précédente, et lue dans les traces qu'on relit
   * déjà : aucune requête de plus. `RECENT_TRACES` en couvre dix jours à cinq
   * interventions quotidiennes, donc hier y est toujours entier.
   *
   * ⚠️ `sent: 0` est une mesure VRAIE — on a lu les traces, il n'y en avait
   * aucune — et c'est pour ça que la journée n'est jamais `null` ici. Ce qui
   * peut manquer, ce sont les SOLLICITATIONS : elles viennent d'une lecture
   * séparée, qui peut échouer, et « je n'ai pas su lire ses messages » ne se
   * confond pas avec « elle n'a rien demandé ». C'est la seule des trois
   * valeurs qui reste nullable jusqu'au calcul.
   *
   * `accepted` compte les gestes UTILES (`acted`) et rien d'autre : un refus
   * porte sur une proposition, une fermeture porte sur Laura, et le §5.3 les
   * traite déjà chacun de son côté.
   */
  private yesterdayFrom(
    traces: readonly LauraInterventionEntity[],
    spontaneousQueries: number | null,
    now: Date,
  ): DailyObservation {
    const start = startOfToday(now)
    const openedYesterday = new Date(start)
    openedYesterday.setDate(openedYesterday.getDate() - 1)
    const yesterday = traces.filter(trace => trace.created_at >= openedYesterday && trace.created_at < start)
    return {
      sent: yesterday.length,
      accepted: yesterday.filter(trace => trace.reaction === 'acted').length,
      spontaneousQueries:
        spontaneousQueries !== null && Number.isFinite(spontaneousQueries) ? Math.max(0, spontaneousQueries) : null,
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Lecture et écriture                                                */
  /* ------------------------------------------------------------------ */

  /**
   * #2319.118 — le COMPTE de refus réels par clé, agrégé sur TOUT L'ESPACE
   * (tous les membres, pas seulement l'appelant), dans la même fenêtre que
   * PRÉFÉRENCE personnelle. Sert {@link applyWorkspacePreferenceDiscount}.
   *
   * GA-43 tient l'isolation PAR LA REQUÊTE elle-même : `WHERE workspace_id =
   * :workspaceId` borne l'agrégat à UN SEUL espace, jamais deux espaces
   * mélangés — deux ESN sont des concurrents. `workspaceId === null` (le
   * roll-out multi-utilisateur en cours, voir `UserActionEntity`) rend une
   * carte VIDE plutôt que d'agréger sur `IS NULL`, ce qui mélangerait
   * plusieurs espaces dont la colonne n'est pas encore renseignée.
   */
  private async workspaceRefusalCountByKey(workspaceId: string | null, now: Date): Promise<Map<string, number>> {
    if (!workspaceId) return new Map()
    const since = new Date(now.getTime() - RECENT_TRACES_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const rows = await this.interventions
      .createQueryBuilder('trace')
      .select('trace.intervention_key', 'key')
      .addSelect('COUNT(*)', 'count')
      .where('trace.workspace_id = :workspaceId', { workspaceId })
      .andWhere('trace.created_at >= :since', { since })
      .andWhere('trace.archived_at IS NULL')
      .andWhere('trace.reaction IN (:...refusals)', { refusals: REFUSAL_REACTIONS })
      .groupBy('trace.intervention_key')
      .getRawMany<{ key: string; count: string }>()
    return new Map(rows.map(row => [row.key, Number(row.count)]))
  }

  private recentTraces(userId: string, now: Date): Promise<LauraInterventionEntity[]> {
    const since = new Date(now.getTime() - RECENT_TRACES_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    return this.interventions.find({
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026) :
      // une trace OUBLIÉE depuis Réglages › Mémoire ne fait plus taire Laura.
      // Elle était DÉTRUITE avant ce lot : l'exclure garde le comportement, la
      // laisser le changerait en silence.
      where: { user_id: userId, created_at: MoreThanOrEqual(since), archived_at: IsNull() },
      order: { created_at: 'DESC' },
      take: RECENT_TRACES_MAX_ROWS,
    })
  }

  private async preferenceFor(userId: string): Promise<NotificationPreferenceEntity> {
    const existing = await this.preferences.findOne({ where: { user_id: userId } })
    if (existing) return existing
    return this.preferences.save(this.preferences.create({ user_id: userId }))
  }

  private async persistState(userId: string, state: InterruptionState): Promise<void> {
    try {
      const preference = await this.preferenceFor(userId)
      preference.laura_retreat_until = state.retreatUntil ? new Date(state.retreatUntil) : null
      preference.laura_throttle_until = state.throttleUntil ? new Date(state.throttleUntil) : null
      await this.preferences.save(preference)
    } catch (error) {
      // Même repli que le plafond de proactivité : un état illisible laisse
      // PASSER. Mieux vaut une intervention de trop qu'un produit muet parce
      // qu'une écriture a raté.
      this.logger.warn(`Laura interruption state not persisted: ${(error as Error).message}`)
    }
  }
}

/** #2875 — les traces qui CONSOMMENT le budget d'interruption : tout sauf les rappels d'hygiène. */
function withinBudget(traces: readonly LauraInterventionEntity[]): LauraInterventionEntity[] {
  return traces.filter(trace => !isHygieneReminder(trace.intervention_key))
}

function startOfToday(now: Date): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}
