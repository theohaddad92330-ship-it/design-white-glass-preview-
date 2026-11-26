import { Logger, Body, Controller, Get, Optional, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import {
  ACCOUNT_CONTEXT_SCREEN,
  ACCOUNT_HIRING_INTERVENTION_KEY,
  ACCOUNT_PAIN_INTERVENTION_KEY,
  accountResourceMeasure,
  hasMeetingInProgress,
  FOLLOW_UP_OVERDUE_KEY,
  MISSION_START_NOT_READY_KEY,
  type WorkspaceHealth,
  INTERVENTION_REACTIONS,
  type InterventionReaction,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { AgendaService } from '../agenda/agenda.service'
import { PlanFeaturesService } from '../plan-features/plan-features.service'
import { TelephonyService } from '../telephony/telephony.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { nextResetFor } from '../credits/credits.service'
import {
  BILLING_DERIVED_COUNTS,
  countsNeededForScreen,
  detectGoldenMoment,
  detectInterventions,
  GOLDEN_MOMENT_COUNTS,
  matchesScreen,
  type AccountDetectionContext,
  type DetectionCount,
  type DetectionCounts,
} from './laura-detector'
import { briefingReadingOf } from '../briefing/briefing-role-order'
import { LauraProbeService } from './laura-probe.service'
import { LauraService } from './laura.service'

/**
 * Laura Produit, côté application.
 *
 * Trois gestes, et aucun n'écrit dans le métier : demander ce qu'elle a à dire
 * sur un écran, lui répondre, la couper. C'est la conséquence directe de D48 —
 * « elle guide et pré-remplit, l'exécution passe par l'Action OS ».
 *
 * ⚠️ **Le score de santé ne sort par AUCUNE de ces routes.** Il pilote le budget
 * d'interventions et l'alerte commerciale, et le §5.6 le pose comme interne :
 * personne n'a envie d'apprendre que son espace vaut 38 sur 100. Ce que
 * l'utilisateur reçoit est une intervention, c'est-à-dire une CAUSE et un geste.
 * La lecture chiffrée vit au back-office, avec les indicateurs du §12.
 */
@Controller('laura')
@UseGuards(JwtGuard)
// Toute la donnée servie ici est celle de l'appelant : son état d'interruption,
// ses traces, son interrupteur. Aucune permission d'espace n'a de sens, et en
// exiger une empêcherait un `viewer` de couper Laura — exactement ce que D49
// interdit.
@PersonalScope()
export class LauraController {
  private readonly logger = new Logger(LauraController.name)

  constructor(
    private readonly laura: LauraService,
    private readonly probe: LauraProbeService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly agenda: AgendaService,
    private readonly planFeatures: PlanFeaturesService,
    // #2403.12 — la source « appel en cours ». `@Optional()` : le module
    // téléphonie reste retirable (règle #7) sans casser Laura, qui retombe
    // alors sur l'agenda seul (#2403.13).
    @Optional() private readonly telephony?: TelephonyService,
  ) {}

  /**
   * Ce que Laura a à dire ici, maintenant.
   *
   * `candidates` vient de l'écran : c'est lui qui sait ce qu'il affiche, et
   * demander au serveur de redécouvrir l'état de chaque écran coûterait six
   * requêtes pour une bulle. Le serveur ARBITRE — budget d'interruption, refus
   * récents, priorité — et c'est ce qui compte : le navigateur ne peut ni
   * s'accorder une intervention de plus, ni court-circuiter un retrait.
   */
  @Post('plan')
  async plan(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { screen?: unknown; busy?: unknown; accountId?: unknown },
  ) {
    const screen = typeof body.screen === 'string' && body.screen.startsWith('/') ? body.screen.slice(0, 120) : null
    // Un écran non nommé se refuse plutôt que de retomber sur un défaut : la
    // règle « une intervention par écran » n'aurait plus rien à comparer, et
    // Laura parlerait sur toutes les pages à la fois.
    if (!screen) return { speaks: false as const, reason: 'screen_already_served' as const }

    const now = new Date()
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Ce que CET écran a besoin de savoir, et rien d'autre. La liste est dérivée
    // de la table des détecteurs : la tenir à la main ici ferait qu'un détecteur
    // ajouté demain lirait `undefined`, donc `null`, donc ne se déclencherait
    // jamais — sans un seul test rouge.
    //
    // Les mesures du BUDGET (§13.2 et §13.3) s'ajoutent sur tous les écrans :
    // elles ne parlent pas de ce que Laura dit, mais de combien de fois elle a
    // le droit de le dire. Les faire dépendre d'un détecteur d'écran
    // n'ouvrirait la dérogation que là où un détecteur les demande déjà — un
    // trou silencieux, une mesure non lue valant `null`.
    const needed = [...new Set([...countsNeededForScreen(screen), ...GOLDEN_MOMENT_COUNTS])]
    const [measured, blockingIssues, probed, billing, meetingInProgress, planFeatures, callInProgress, account, demo] =
      await Promise.all([
        // perf P3 — cache 2 min par espace (neuf axes ≈ 12 requêtes, à chaque page).
        this.probe.measureCached(workspaceId),
        this.probe.blockingIssues(workspaceId),
        this.probe.counts(workspaceId, user.userId, needed),
        // Une seule lecture pour les deux échéances, et seulement si l'écran en a
        // besoin : `/billing` et `/dashboard` sont les seuls concernés.
        needed.some(name => (BILLING_DERIVED_COUNTS as readonly DetectionCount[]).includes(name))
          ? this.probe.billingWindow(workspaceId)
          : null,
        this.meetingInProgress(user.userId, now),
        // #2406.35 — les paliers ouverts sur cet espace, pour que `laura.plan()`
        // n'envoie jamais vers un écran verrouillé par le palier (voir sa doc).
        this.planFeatures.featuresForWorkspace(workspaceId, user.userId),
        // #2403.12 — l'agenda reste le REPLI : cette lecture est la source
        // PRIMAIRE (état d'appel LIVE, posé par le webhook), moins souvent
        // fausse qu'un rendez-vous programmé qui ne s'est pas tenu.
        this.callInProgress(workspaceId, user.userId, now),
        // Le DOSSIER ouvert (voir `accountContext`) — indépendant des lectures ci-dessus,
        // donc lancé avec elles (perf P3 : il partait APRÈS, en série).
        this.accountContext(workspaceId, screen, body.accountId),
        // Sentry BELLUM-API-G — espace de démo ou non : indépendant des lectures ci-dessus, il partait après
        // elles (une prise de pool de plus en série sur chaque page).
        this.workspaceContext.isDemoWorkspace(user.userId),
      ])
    const counts: DetectionCounts = { ...probed, ...billingCounts(billing) }

    // `account` — le DOSSIER ouvert, quand la demande vient du panneau contextuel
    // d'un compte, seulement si le navigateur a nommé un compte.
    //
    // ⚠️ La portée est celle de l'ESPACE (`accountHiringSignals` filtre sur
    // `workspace_id`) : un identifiant envoyé par le navigateur ne peut pas
    // faire lire le dossier d'un autre client. C'est la seule chose que ce
    // paramètre pourrait faire de mal, et elle est refusée en SQL.

    const health = this.laura.health(measured)
    // D50 — sous 25, c'est l'ÉQUIPE qu'on prévient, jamais l'utilisateur.
    //
    // Le verdict était CALCULÉ et testé depuis le 22/08, et personne ne
    // l'appelait : le signal de churn le plus actionnable du produit
    // n'atteignait aucun écran. Il part en `logger.error` — donc dans Sentry,
    // donc sur un écran que quelqu'un regarde ; un `warn` ne serait pas parti,
    // c'est la leçon de l'alerte de coûts.
    //
    // Dédoublonné par espace et par JOUR, en mémoire de process. Un doublon
    // après un redéploiement ou sur une seconde instance est sans conséquence
    // — Sentry regroupe — là où un silence en aurait une.
    if (this.laura.alertsTeam(health)) this.alertTeamOnce(workspaceId, health)

    // La détection est SERVEUR : le navigateur ne connaît aucune de ces
    // conditions, et lui laisser proposer sa liste reviendrait à lui laisser
    // choisir ce qui l'interrompt.
    const candidateKeys = detectInterventions({ health: measured, blockingIssues, counts, screen, account })
    // Le coût de l'intercontrat ne se mesure QUE si `long_bench` est déjà
    // candidate — comme `billingWindow` plus haut, pas de lecture pour une
    // bulle qui, neuf fois sur dix, ne portera même pas cette clé.
    // perf P3 — les deux lectures conditionnelles sont indépendantes : ensemble.
    const [longBenchCost, missionStart, overdueFollowUp] = await Promise.all([
      candidateKeys.includes('long_bench') ? this.probe.longestBenchConsultant(workspaceId) : null,
      // #2409.8 — les manques NOMMÉS du démarrage, lus seulement quand leur
      // intervention est déjà candidate (pas de lecture pour rien).
      candidateKeys.includes(MISSION_START_NOT_READY_KEY) ? this.probe.nearestMissionStartNotReady(workspaceId) : null,
      // #3398.4a — la relance la plus en retard, NOMMÉE, lue seulement quand
      // `follow_up_overdue` est déjà candidate (pas de lecture pour rien).
      candidateKeys.includes(FOLLOW_UP_OVERDUE_KEY) ? this.probe.mostOverdueFollowUp(workspaceId) : null,
    ])
    // Les faits qui ont produit la suggestion du dossier — composés ICI, à
    // partir de ce que la sonde a DÉJÀ lu pour la détection. Aucune requête de
    // plus : les signaux viennent de `account`, la ressource des deux mesures
    // que le détecteur a exigées.
    const hiringSuggestion =
      account && candidateKeys.includes(ACCOUNT_HIRING_INTERVENTION_KEY)
        ? {
            accountId: account.accountId,
            facts: [...account.hiringSignals],
            // « Non mesuré » n'est jamais « 0 » : `counts` rend `undefined` pour
            // une mesure non demandée et `null` pour une lecture ratée. Les deux
            // valent NON MESURÉ, et `accountResourceMeasure` le dit.
            resource: accountResourceMeasure({
              availableNow: counts.consultantsAvailableNow ?? null,
              undeclared: counts.consultantsAvailabilityUndeclared ?? null,
            }),
          }
        : null
    // #3939.3 — la douleur sourcée du dossier : ses faits, SANS vivier croisé
    // (`resource: null` — rien à mesurer, donc rien d'affiché).
    const painSuggestion =
      account?.painFacts?.length && candidateKeys.includes(ACCOUNT_PAIN_INTERVENTION_KEY)
        ? { accountId: account.accountId, facts: [...account.painFacts], resource: null }
        : null

    return this.laura.plan(user.userId, {
      workspaceId,
      screen,
      // #2403.12/#2403.13 — un appel EN COURS (webhook signé) ou, à défaut, un
      // rendez-vous CONNU (agenda synchronisé) coupe Laura, au même titre
      // qu'une saisie en cours ou une action critique.
      busy: body.busy === true || callInProgress || meetingInProgress,
      demo,
      candidateKeys,
      health,
      planFeatures,
      // §13.3 — les trois moments où l'interruption est attendue. Détecté
      // SERVEUR, comme les candidates, et pour une raison plus forte encore :
      // ici le navigateur ne demanderait pas un message de plus, il demanderait
      // à sortir du plafond.
      goldenMoment: detectGoldenMoment({ counts, blockingIssues }),
      // §13.2, la hausse. `?? null` : une mesure absente vaut NON MESURÉE, et
      // non « zéro question posée ».
      spontaneousQueriesYesterday: counts.spontaneousQueriesYesterday ?? null,
      longBenchCost,
      accountSuggestion: hiringSuggestion,
      painSuggestion,
      missionStart,
      overdueFollowUp,
      // #3398 — le rôle change l'ORDRE des signaux de /chat, jamais leur ensemble.
      chatReading: briefingReadingOf(role),
    })
  }

  /**
   * Le dossier ouvert, quand le navigateur en nomme un — sinon `null`.
   *
   * Deux refus, et chacun ferme une porte précise :
   *
   *  · un identifiant qui n'est pas un UUID ne part JAMAIS en base. La sonde
   *    l'enverrait dans un paramètre, donc sans risque d'injection, mais une
   *    valeur libre ferait une requête par frappe pour rien.
   *  · un écran qui n'est pas un dossier de compte ne lit aucun dossier, même
   *    si le corps en nomme un. Sans cette borne, un navigateur pourrait faire
   *    lire les signaux d'un compte depuis `/billing` — pas une fuite (la
   *    portée d'espace tient), mais une lecture que personne n'a demandée.
   */
  private async accountContext(
    workspaceId: string,
    screen: string,
    raw: unknown,
  ): Promise<AccountDetectionContext | null> {
    if (!matchesScreen(ACCOUNT_CONTEXT_SCREEN, screen)) return null
    if (typeof raw !== 'string' || !UUID.test(raw)) return null
    // #3939.3 — les deux lectures du dossier sont indépendantes : ensemble.
    const [hiringSignals, painFacts] = await Promise.all([
      this.probe.accountHiringSignals(workspaceId, raw),
      this.probe.accountPainFacts(workspaceId, raw),
    ])
    // `null` = on n'a pas pu lire. Ce n'est PAS « ce compte n'a aucun signal » :
    // rendre un contexte vide ferait conclure au détecteur sur une lecture
    // ratée, et un `null` ne conclut jamais. Une moitié illisible ne fait taire
    // que SA clé : l'autre lecture reste valable.
    if (hiringSignals === null && painFacts === null) return null
    return { accountId: raw, hiringSignals: hiringSignals ?? [], painFacts: painFacts ?? [] }
  }

  /**
   * #2403.13 — Laura ne s'interrompt pas PENDANT une réunion CONNUE.
   *
   * `agent_docs/doctrine.md:19` (« JAMAIS de donnée fictive ») bloquait ce
   * point tel qu'écrit dans #2995 (« aucune intervention pendant un appel/une
   * réunion EN COURS ») : ce dépôt n'a aucune source d'état LIVE (téléphonie,
   * capteur de réunion). La variante conforme lit l'agenda déjà SYNCHRONISÉ
   * (`AgendaService.listEvents`, no-op sans connecteur branché — même doctrine
   * que toute intégration optionnelle) et compare `now` au début/fin d'un
   * rendez-vous CONFIRMÉ (`hasMeetingInProgress`, `@bellum/contracts`),
   * plutôt que de détecter un « en cours » qui n'existe nulle part.
   *
   * Aucun agenda connecté, ou une lecture qui échoue : `false` — Laura ne se
   * tait jamais sur une supposition, seulement sur un rendez-vous CONNU.
   */
  private async meetingInProgress(userId: string, now: Date): Promise<boolean> {
    try {
      const events = await this.agenda.listEvents(userId, {
        from: new Date(now.getTime() - MEETING_LOOKBACK_MS).toISOString(),
        to: now.toISOString(),
        limit: 50,
      })
      return hasMeetingInProgress(events, now)
    } catch (error) {
      this.logger.warn(`Laura: agenda illisible pour "réunion en cours" — ${(error as Error).message}`)
      return false
    }
  }

  /**
   * #2403.12 — Laura ne s'interrompt pas PENDANT un appel EN COURS.
   *
   * Source primaire : `TelephonyService.isCallInProgress`, posée par le
   * webhook signé (`TelephonyWebhookController`). Sans module téléphonie, ou
   * sur une lecture en échec : `false` — Laura ne se tait jamais sur une
   * supposition, seulement sur un état CONNU et frais.
   */
  private async callInProgress(workspaceId: string, userId: string, now: Date): Promise<boolean> {
    if (!this.telephony) return false
    try {
      return await this.telephony.isCallInProgress(workspaceId, userId, now)
    } catch (error) {
      this.logger.warn(`Laura: état d'appel illisible pour "appel en cours" — ${(error as Error).message}`)
      return false
    }
  }

  /** Les espaces déjà signalés aujourd'hui — `espace:AAAA-MM-JJ`. */
  private readonly alerted = new Set<string>()

  private alertTeamOnce(workspaceId: string, health: WorkspaceHealth): void {
    const key = `${workspaceId}:${new Date().toISOString().slice(0, 10)}`
    if (this.alerted.has(key)) return
    this.alerted.add(key)
    // #4458 (Louis, tri Sentry 22/10/2026) — un signal MÉTIER, pas une panne :
    // `warn` (journaux), plus une exception Sentry. Une alerte par espace et par jour, comme avant.
    this.logger.warn('Laura — espace en risque de churn critique', {
      tags: { alert: 'workspace_health_critical' },
      contexts: {
        workspaceHealth: {
          workspaceId,
          score: health.score,
          reading: health.reading,
          // La cause PRINCIPALE, pas les sept axes : c'est ce qui dit quoi
          // faire. Les axes se relisent au back-office.
          mainCause: health.mainCause,
          measuredAxes: health.evaluated.length,
          notEvaluable: health.notEvaluable,
        },
      },
    })
  }

  /** Ce que la personne a fait de l'intervention — le signal qui pilote le retrait. */
  @Post('interventions/:traceId/reaction')
  async react(
    @CurrentUser() user: CurrentUserPayload,
    @Param('traceId', ParseUUIDPipe) traceId: string,
    @Body() body: { reaction?: unknown },
  ) {
    const reaction = INTERVENTION_REACTIONS.includes(body.reaction as InterventionReaction)
      ? (body.reaction as InterventionReaction)
      : null
    // Une réaction inconnue est refusée et NOMMÉE : l'accepter en silence
    // laisserait croire que le retrait se déclenchera, alors que rien n'aurait
    // été compté.
    if (!reaction) return { recorded: false, reason: 'unknown_reaction' }
    // #2403.38/#2403.33 — `stale`/`handledElsewhere` NOMMENT, jamais ne
    // bloquent (D48) : le geste est enregistré tout de même, l'écran décide
    // quoi en faire.
    const { stale, handledElsewhere } = await this.laura.react(user.userId, traceId, reaction)
    return { recorded: true, stale, handledElsewhere }
  }

  /**
   * Ce que Laura sait dire — le catalogue, pour l'écran de réglages.
   *
   * ⚠️ **L'interrupteur de D49 n'est PAS ici.** Il vit dans les préférences de
   * notification, avec le plafond de proactivité, parce qu'il répond à la même
   * question et se règle au même endroit. Lui donner une seconde route en
   * ferait un champ à deux chemins d'écriture — le défaut que ce dépôt corrige
   * depuis six chantiers, dont la moitié se lisait « deux écrans qui se
   * contredisent ».
   */
  @Get('catalogue')
  catalogue() {
    return { interventions: this.laura.catalogue() }
  }
}

/**
 * L'identifiant d'un dossier. Les comptes sont clés par UUID dans tout le
 * dépôt ; un identifiant d'une autre forme ne désigne rien et ne part pas en
 * base — pas pour une question d'injection (la valeur voyage en paramètre)
 * mais pour ne pas faire une requête par frappe au clavier.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Combien d'heures en arrière `meetingInProgress` regarde pour attraper un
 * rendez-vous déjà commencé. Un rendez-vous plus long que ça ne ferait plus
 * taire Laura à son issue — 4 h couvre tout rendez-vous métier réaliste de ce
 * produit (revue, atelier), sans lire toute la journée pour une seule bulle.
 */
const MEETING_LOOKBACK_MS = 4 * 60 * 60 * 1000

/**
 * Les deux échéances de facturation, à partir de la fenêtre brute.
 *
 * Ici et pas dans la sonde : `nextResetFor` vit dans le module des crédits, et
 * un SERVICE qui va chercher le service d'un voisin est ce que GA-07 fige. Le
 * contrôleur est la couche où un geste utilisateur traverse deux domaines —
 * c'est écrit dans la garde elle-même.
 *
 * `null` partout quand la fenêtre n'a pas pu être lue : « je ne sais pas quand
 * le cycle se termine » ne doit pas se lire « il se termine aujourd'hui ».
 */
function billingCounts(window: { plan: string | null; period_start: Date | null; trial_end: Date | null } | null) {
  if (!window) return {}
  const reset = nextResetFor(window)
  return {
    daysUntilCreditCycleEnds: reset ? daysFromNow(new Date(reset)) : null,
    daysUntilTrialEnds: window.trial_end ? daysFromNow(new Date(window.trial_end)) : null,
  }
}

/**
 * Combien de jours nous séparent de cette date, arrondi au jour ENTIER.
 *
 * Négatif quand la date est passée — et c'est voulu : un essai terminé hier
 * n'est pas « il reste 0 jour », et les détecteurs qui bornent à `[0, n]` s'en
 * servent pour ne rien annoncer d'une échéance déjà franchie.
 */
function daysFromNow(date: Date, now: Date = new Date()): number {
  if (Number.isNaN(date.getTime())) return Number.NaN
  return Math.floor((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}
