import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
  accountPainFacts,
  AWAITING_TIMESHEET_STATUSES,
  CLOSED_STAGES,
  computeRfpCompliance,
  INTERVENTION_THRESHOLDS,
  MISSION_DAY_ONE_CONFIRM_WINDOW_DAYS,
  FORECAST_DECLARED_BLOCKED_MISSION_STATUS,
  FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS,
  FORECAST_RUNNING_MISSION_STATUSES,
  MISSION_PRE_START_STATUSES,
  NEED_OPEN_STATUSES,
  parseAccountAnalysis,
  PIPELINE_STAGES,
  recentSignalSchema,
  isInternshipPosting,
  rfpRequirementSchema,
  TASK_OPEN_STATUSES,
  type AccountSuggestionFact,
  type MissionStartAnnouncement,
  type OverdueFollowUp,
  type HealthInput,
} from '@bellum/contracts'
import {
  BILLING_DERIVED_COUNTS,
  FIELD_CALL_DEBRIEF_WINDOW_DAYS,
  INTERVIEW_BRIEF_WINDOW_HOURS,
  type DetectionCount,
  type DetectionCounts,
  type ProbeCount,
} from './laura-detector'
import { computeBenchCost, type BenchCostResult } from '../consultants/bench-cost'
import { AVAILABILITY_REVALIDATION_DAYS } from '../consultants/matching/pushable'
import { missionsStartingSoonNotReady } from '../delivery/mission-start-window'

/**
 * LES MESURES DU SCORE DE SANTÉ — §5.6 du PDF 10, neuf axes depuis #2977.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DES REQUÊTES ET NON DES SERVICES
 * ─────────────────────────────────────────────────────────────────────────
 * Les sept premiers axes appartiennent à sept modules différents. Les
 * rapatrier en injectant sept services ferait de Laura le contre-exemple de
 * GA-07 — et pour un usage en LECTURE, sur des comptages, qui ne demande
 * aucune règle métier : « combien de comptes suivis », « combien de sièges
 * actifs ». Ce sont des chiffres, pas des décisions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * **Un axe qu'on ne sait pas mesurer rend `null`, jamais 0.** C'est le même
 * arbitrage que partout ailleurs dans le dépôt : un zéro se lit « c'est à
 * l'agonie » alors qu'il faut lire « on n'a pas regardé ». Chaque lecture est
 * donc isolée dans son propre `try` — une table absente, une migration pas
 * encore passée, un espace neuf rendent `null` pour CET axe, et les autres
 * continuent. Un score partiel est utilisable ; un score qui tombe ne l'est
 * pas. `value` (#2977) applique la même règle à l'extrême : sans aucune
 * source, il rend TOUJOURS `null`, honnêtement, plutôt qu'un zéro inventé.
 */
/** « Se libère dans moins de 30 jours » (§5.4). */
const FREEING_SOON_DAYS = 30
/**
 * « En intercontrat depuis plus de 30 jours » (§5.4).
 *
 * Même durée que la fenêtre de renouvellement du balayeur, et pourtant une
 * constante à part : ce sont deux faits différents, et les fusionner ferait
 * bouger l'un le jour où quelqu'un règle l'autre.
 */
const LONG_BENCH_DAYS = 30
/**
 * ⚠️ TROIS SEUILS ONT DÉMÉNAGÉ — ils vivent maintenant dans le CONTRAT.
 *
 * « Ce besoin est ouvert depuis 5 jours », « relevé manquant après 2 relances »
 * et « encaissement en retard de 30 j » (§5.2 du PDF 2) étaient écrits ici, en
 * constantes privées. La file d'intervention du cockpit du commercial les
 * demande aujourd'hui pour DÉCRIRE EXACTEMENT LES MÊMES FAITS : la bulle de
 * Laura et la ligne à traiter parlent du même besoin, du même relevé, de la même
 * facture.
 *
 * Les recopier aurait produit deux réglages pour un seul fait — celui qui bouge
 * et celui qu'on oublie de bouger. Ils sont donc dans `INTERVENTION_THRESHOLDS`
 * (`packages/contracts/src/schemas/playbook.ts`), qui porte déjà la raison de
 * chacun, et cette sonde les LIT. Un réglage vit à un seul endroit (GA-26).
 *
 * Les seuils voisins qui restent ici (`FREEING_SOON_DAYS`, `LONG_BENCH_DAYS`…)
 * n'ont, eux, aucun jumeau ailleurs : les déplacer par symétrie aurait éloigné
 * un réglage de son seul lecteur.
 */
const NEED_STALE_DAYS = INTERVENTION_THRESHOLDS.needWithoutShortlistDays
const TIMESHEET_REMINDERS_BEFORE_ALERT = INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert
const PAYMENT_OVERDUE_DAYS = INTERVENTION_THRESHOLDS.paymentOverdueDays
/**
 * « Consultant placé 3 fois chez le même client » (§5.2 du PDF 2).
 *
 * Trois, et pas deux : deux missions chez un client se lisent « on a rappelé la
 * personne », trois se lisent « ce client la considère comme la sienne ». C'est
 * cette seconde lecture que l'intervention prétend voir.
 */
const PLACEMENTS_AT_SAME_ACCOUNT = 3
/**
 * Combien de signaux de recrutement du dossier accompagnent la suggestion.
 *
 * Trois, et pas tous : le panneau les rend en clair sous « Pourquoi cette
 * suggestion ? », et une liste de dix-huit signaux n'est plus une explication,
 * c'est le dossier recopié. Le contrat borne de son côté (`facts.max(10)`) ;
 * cette borne-ci est celle du SENS, pas de la taille du message.
 */
const ACCOUNT_HIRING_SIGNALS_KEPT = 3

/** La chaîne quand elle porte quelque chose, `null` sinon. Une chaîne vide en
 *  base n'est pas une source : la rendre telle quelle afficherait un tiret. */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Incident boucle API (05/10/2026) — une sonde ne tient jamais plus de 3
 * requêtes base en vol (pool `DB_POOL_MAX = 5` par réplica : il en reste pour
 * les autres routes). Chaque lecture de la sonde est séquentielle en
 * interne : borner les TÂCHES borne les requêtes.
 */
const LAURA_PROBE_MAX_CONCURRENT_QUERIES = 3

/** `Promise.all` borné : au plus `limit` tâches en vol, résultats rangés à
 *  l'index de leur tâche — l'ordre ne dépend jamais de qui finit d'abord. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()))
  return results
}

const MEASURE_CACHE_TTL_MS = 2 * 60 * 1000
const MEASURE_CACHE_MAX = 2000

@Injectable()
export class LauraProbeService {
  private readonly logger = new Logger(LauraProbeService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Les neuf ratios (#2977), entre 0 et 1 — ou `null`.
   *
   * Les seuils qui transforment un comptage en ratio sont des ORDRES DE
   * GRANDEUR assumés et écrits ici, pas des vérités : « dix comptes suivis, ça
   * commence à ressembler à un portefeuille ». Ils décident d'un budget
   * d'interventions et de rien d'autre — jamais d'un chiffre montré, jamais
   * d'une décision commerciale automatique.
   */
  /**
   * perf P3 (29/09/2026) — `measure` avec un cache de 2 min PAR ESPACE, pour
   * `POST /laura/plan` seul (appelé à chaque page : ≈ 12 requêtes SQL par
   * appel contre un pool de 10). Les axes sont des ratios sur 14 jours, un
   * verdict ne bouge pas en deux minutes. On mémorise la PROMESSE : deux appels
   * simultanés partagent une seule mesure ; un rejet n'est jamais gardé.
   * Le back-office et le pont copilote continuent d'appeler `measure` (frais).
   */
  private readonly measureCache = new Map<string, { at: number; value: Promise<HealthInput> }>()

  measureCached(workspaceId: string): Promise<HealthInput> {
    const hit = this.measureCache.get(workspaceId)
    if (hit && Date.now() - hit.at < MEASURE_CACHE_TTL_MS) return hit.value
    if (this.measureCache.size >= MEASURE_CACHE_MAX) this.measureCache.clear()
    const value = this.measure(workspaceId)
    this.measureCache.set(workspaceId, { at: Date.now(), value })
    value.catch(() => this.measureCache.delete(workspaceId))
    return value
  }

  async measure(workspaceId: string): Promise<HealthInput> {
    // Incident boucle API (05/10/2026) — au plus 3 lectures en vol, plus
    // jamais les neuf d'un coup sur un pool de 5 ; ordre des axes inchangé.
    const [activation, connectors, dataDensity, teamAdoption, depth, consumption, quality, actionability, value] =
      await mapWithConcurrency(
        [
          () =>
            this.ratio(
              `SELECT count(*)::int AS n FROM user_actions ua
           JOIN workspace_members wm ON wm.user_id = ua.user_id
          WHERE wm.workspace_id = $1 AND ua.created_at > now() - interval '14 days'`,
              workspaceId,
              20,
            ),
          () => this.connectorHealth(workspaceId),
          () => this.ratio(`SELECT count(*)::int AS n FROM accounts WHERE workspace_id = $1`, workspaceId, 10),
          () => this.seatAdoption(workspaceId),
          () => this.depth(workspaceId),
          () => this.creditUse(workspaceId),
          () => this.decidedAccounts(workspaceId),
          () => this.actionability(workspaceId),
          () => this.value(),
        ],
        LAURA_PROBE_MAX_CONCURRENT_QUERIES,
        read => read(),
      )
    return { activation, connectors, dataDensity, teamAdoption, depth, consumption, quality, actionability, value }
  }

  /**
   * Les mesures dont la DÉTECTION a besoin, et qui ne sont pas des ratios.
   *
   * ⚠️ Séparées des sept axes, et c'est le correctif d'un défaut trouvé en
   * recette live : `empty_talent_pool` annonce « ton vivier est vide » et se
   * déclenchait sur `dataDensity`, qui compte des COMPTES. Un espace avec dix-
   * neuf comptes et zéro consultant restait donc muet — et un espace avec zéro
   * compte et cinquante consultants aurait annoncé un vivier vide qui ne l'est
   * pas. Une intervention doit être déclenchée par une mesure qui parle de SON
   * sujet ; un ratio proche n'est pas une mesure, c'est une ressemblance.
   *
   * ⚠️ **Seules les mesures DEMANDÉES sont lues.** `needed` vient de
   * `countsNeededForScreen`, qui le dérive de la table des détecteurs : une
   * navigation sur `/billing` lit UNE mesure, pas vingt-six. Lire tout à chaque
   * écran ferait payer vingt-six requêtes pour une bulle qui, neuf fois sur
   * dix, ne s'affiche pas.
   *
   * `null` = on n'a pas pu mesurer, ce qui ne déclenche rien. Chaque lecture est
   * isolée dans son `try` : une table absente en éteint UNE.
   */
  async counts(workspaceId: string, userId: string, needed: readonly DetectionCount[]): Promise<DetectionCounts> {
    const derived = new Set<string>(BILLING_DERIVED_COUNTS)
    const wanted = [...new Set(needed)].filter((name): name is ProbeCount => !derived.has(name))
    const out: DetectionCounts = {}
    const readers = this.readers(workspaceId, userId)

    // Incident boucle API (05/10/2026) — ~30 mesures lancées d'un coup sur un
    // pool de 5 : au plus 3 en vol, chaque valeur rangée sous SA clé, dans
    // l'ordre demandé.
    const values = await mapWithConcurrency(wanted, LAURA_PROBE_MAX_CONCURRENT_QUERIES, name =>
      this.guarded(name, readers[name]),
    )
    wanted.forEach((name, index) => {
      out[name] = values[index] ?? null
    })
    return out
  }

  /**
   * Une mesure par clé — la table qui fait que `counts` n'a aucun `switch`.
   *
   * Elle est exhaustive par le TYPE : ajouter une clé à `DETECTION_COUNTS` sans
   * l'écrire ici ne compile pas. C'est ce qui empêche une mesure demandée par un
   * détecteur de rendre `undefined` en silence — un `undefined` vaut `null`,
   * et un `null` ne déclenche rien : le détecteur serait mort sans un seul test
   * rouge.
   */
  private readers(workspaceId: string, userId: string): Record<ProbeCount, () => Promise<number | null>> {
    const scoped =
      (sql: string, params: unknown[] = []) =>
      () =>
        this.scalar(sql, [workspaceId, ...params])
    const personal =
      (sql: string, params: unknown[] = []) =>
      () =>
        this.scalar(sql, [userId, ...params])

    return {
      consultants: scoped(`SELECT count(*)::int AS n FROM consultants WHERE workspace_id = $1 AND archived_at IS NULL`),

      accounts: scoped(`SELECT count(*)::int AS n FROM accounts WHERE workspace_id = $1`),

      // « Aucune prochaine action » se lit dans les TÂCHES, pas dans le taux de
      // comptes classés : un compte peut être qualifié depuis six mois et
      // n'avoir aucune suite prévue, ce qui est exactement le cas à signaler.
      //
      // ⚠️ « Encore à faire » se demandait ici à `completed_at IS NULL` — un
      // PROXY, qui donnait la bonne réponse par accident (annuler horodate la
      // clôture) et l'aurait perdue à la première tâche écrite hors du service.
      // `TASK_OPEN_STATUSES` est la définition, la même qu'à l'agenda et au
      // cockpit de qualité. Garde GA-54.
      //
      // Elle voyage en PARAMÈTRE et non en interpolation, comme
      // `NEED_OPEN_STATUSES` juste en dessous : le SQL de la sonde reste
      // statique, donc analysable — c'est ce qu'exige la garde des alias.
      accountsWithoutNextAction: scoped(
        `SELECT count(*)::int AS n
           FROM accounts a
          WHERE a.workspace_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM tasks t WHERE t.account_id = a.id AND t.status = ANY($2)
            )`,
        [[...TASK_OPEN_STATUSES]],
      ),

      crmConnections: scoped(`SELECT count(*)::int AS n FROM crm_connections WHERE workspace_id = $1`),

      // `NEED_OPEN_STATUSES` est la définition partagée de « ouvert » — la
      // recopier ici en ferait une seconde vérité, et `on_hold` disparaîtrait
      // du décompte à la première divergence.
      openNeeds: scoped(`SELECT count(*)::int AS n FROM project_needs WHERE workspace_id = $1 AND status = ANY($2)`, [
        [...NEED_OPEN_STATUSES],
      ]),

      shortlists: scoped(`SELECT count(*)::int AS n FROM shortlists WHERE workspace_id = $1`),

      missions: scoped(`SELECT count(*)::int AS n FROM missions WHERE workspace_id = $1`),

      activeMissions: scoped(
        `SELECT count(*)::int AS n FROM missions WHERE workspace_id = $1 AND status IN ('active', 'onboarding')`,
      ),

      // Le coût chargé vit à UN seul endroit : les conditions commerciales de
      // la mission (décision D43 du 28/08/2026).
      //
      // Cette sonde lisait AUSSI `missions.daily_cost`, en supposant que le
      // coût vivait « à deux endroits selon la nature du contrat ». La mesure a
      // dit l'inverse : aucun écran, aucun semis et aucun appelant interne
      // n'écrit cette colonne — elle ne pouvait donc que compter zéro mission
      // de plus, tout en laissant croire que la sonde couvrait un second cas.
      activeMissionsWithCost: scoped(
        `SELECT count(*)::int AS n
           FROM missions m
           JOIN mission_commercial_terms t ON t.mission_id = m.id
          WHERE m.workspace_id = $1
            AND m.status IN ('active', 'onboarding')
            AND t.loaded_daily_cost_cents IS NOT NULL`,
      ),

      // `mission_timesheets` n'a pas de `workspace_id` : le relevé appartient à
      // sa mission, et c'est elle qui porte l'espace.
      missionTimesheets: scoped(
        `SELECT count(*)::int AS n
           FROM mission_timesheets ts
           JOIN missions m ON m.id = ts.mission_id
          WHERE m.workspace_id = $1`,
      ),

      // #2424.2 — `completed` rejoint `ended`/`terminated` : même statut FINI
      // (`MISSION_STATUS_PHASE`), qui ne comptait pas ici alors que le calcul
      // d'écran (`pendingFrom`, capitalisation.service.ts) le compte depuis
      // #2424.2 aussi.
      endedMissionsWithoutFeedback: scoped(
        `SELECT count(*)::int AS n
           FROM missions m
          WHERE m.workspace_id = $1
            AND m.status IN ('ended', 'terminated', 'completed')
            AND m.ends_on IS NOT NULL
            AND m.ends_on < (current_date - interval '14 days')::date
            AND NOT EXISTS (SELECT 1 FROM rex_entries r WHERE r.mission_id = m.id)`,
      ),

      // Laura LIT l'alerte du balayeur, elle ne la recalcule pas. Deux
      // détections du même fait produiraient deux horizons — 30 jours ici,
      // 45 dans le catalogue d'origine — et deux vérités sur le même écran.
      openRenewalRisks: scoped(
        `SELECT count(*)::int AS n
           FROM interventions
          WHERE workspace_id = $1 AND kind = 'renewal_at_risk' AND state = 'open'`,
      ),

      skillsDossiers: scoped(`SELECT count(*)::int AS n FROM cv_versions WHERE workspace_id = $1`),

      // Miroir SQL de la branche « toutes les affectations en cours ont une fin
      // proche » de `deriveStaffing` : actif = commencé et pas terminé ; une
      // seule affectation SANS FIN suffit à ne pas compter la personne, parce
      // qu'on ne peut alors promettre aucune date.
      consultantsFreeingSoon: scoped(
        `SELECT count(*)::int AS n FROM (
           SELECT a.consultant_id
             FROM mission_assignments a
             JOIN consultants c ON c.id = a.consultant_id AND c.archived_at IS NULL
            WHERE a.workspace_id = $1
              AND a.starts_on <= current_date
              AND (a.ends_on IS NULL OR a.ends_on >= current_date)
            GROUP BY a.consultant_id
           HAVING count(*) FILTER (WHERE a.ends_on IS NULL) = 0
              AND max(a.ends_on) <= (current_date + ($2 || ' days')::interval)::date
         ) s`,
        [FREEING_SOON_DAYS],
      ),

      // Un consultant SANS la moindre affectation n'est pas en intercontrat :
      // il est inconnu, et `deriveStaffing` rend `unknown` pour cette raison.
      // Le compter ferait annoncer un intercontrat de trente jours à une ESN qui
      // ne renseigne simplement pas ses missions.
      consultantsOnLongBench: scoped(
        `SELECT count(*)::int AS n FROM (
           SELECT a.consultant_id
             FROM mission_assignments a
             JOIN consultants c ON c.id = a.consultant_id AND c.archived_at IS NULL
            WHERE a.workspace_id = $1
            GROUP BY a.consultant_id
           HAVING count(*) FILTER (
                    WHERE a.starts_on <= current_date AND (a.ends_on IS NULL OR a.ends_on >= current_date)
                  ) = 0
              AND count(*) FILTER (WHERE a.ends_on IS NULL) = 0
              AND max(a.ends_on) < (current_date - ($2 || ' days')::interval)::date
         ) s`,
        [LONG_BENCH_DAYS],
      ),

      paidSeats: scoped(`SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = $1`),

      activeSeats: scoped(
        `SELECT count(*)::int AS n
           FROM workspace_members wm
          WHERE wm.workspace_id = $1
            AND EXISTS (
              SELECT 1 FROM user_actions ua
               WHERE ua.user_id = wm.user_id AND ua.created_at > now() - interval '30 days'
            )`,
      ),

      // Les messages de la PERSONNE : un message d'assistant existe aussi dans
      // une conversation qu'elle n'a jamais ouverte (résumé, routine).
      copilotMessages: personal(`SELECT count(*)::int AS n FROM chat_messages WHERE user_id = $1 AND role = 'user'`),

      enabledRoutines: personal(
        `SELECT count(*)::int AS n FROM routine_subscriptions WHERE user_id = $1 AND enabled = true`,
      ),

      // Les sept interrupteurs qui portent un signal de TRAVAIL. Les deux du
      // changelog n'en sont pas : les couper ne coupe rien de ce que Laura
      // signale, et les compter ferait dire « tout est coupé » à quelqu'un qui
      // a seulement refusé la lettre d'information.
      enabledNotificationChannels: personal(
        `SELECT (buy_signals::int + relance_reminders::int + weekly_summary::int + weekly_digest::int
                 + credit_low::int + action_overdue::int + watchlist_daily_digest::int)::int AS n
           FROM notification_preferences WHERE user_id = $1`,
      ),

      // L'âge du COMPTE de la personne, pas celui de l'espace : un second
      // membre invité six mois après la création verrait sinon les messages de
      // sa deuxième semaine dès son premier jour.
      accountAgeDays: personal(`SELECT (current_date - created_at::date)::int AS n FROM profiles WHERE user_id = $1`),

      // L'écart entre la visite en cours et la précédente. `previous_seen_at`
      // est un SNAPSHOT de la visite d'avant, pas un battement de cœur : il ne
      // bouge qu'après une vraie absence, donc l'écart retombe sous un jour dès
      // la visite suivante et l'intervention ne se répète pas.
      daysAwayBeforeThisVisit: personal(
        `SELECT (last_seen_at::date - previous_seen_at::date)::int AS n
           FROM user_last_seen WHERE user_id = $1 AND previous_seen_at IS NOT NULL`,
      ),

      repeatedManualCorrections: scoped(
        `SELECT count(*)::int AS n FROM (
           SELECT 1
             FROM record_field_audit
            WHERE workspace_id = $1
              AND source = 'human'
              AND created_at > now() - interval '90 days'
            GROUP BY entity_type, entity_id, field
           HAVING count(*) >= 3
         ) s`,
      ),

      // « Aucun profil positionné » se lit dans `submissions`, pas dans
      // `shortlists` : c'est ce que la carte du kanban affiche
      // (`OpenNeedsService.list` fait la même sous-requête), et la bulle se pose
      // sur cet écran-là. Lire l'autre table ferait dire « rien n'a été
      // proposé » au-dessus d'une carte qui compte trois profils.
      //
      // `status_changed_at IS NOT NULL` n'est pas une précaution : un besoin qui
      // n'a jamais franchi de transition n'a PAS d'âge d'étape, et le pied de
      // carte rend « non mesuré » plutôt que « 0 j ». Le compter ici lui
      // inventerait un âge — et un âge inventé est toujours rassurant.
      needsOpenWithoutShortlist: scoped(
        `SELECT count(*)::int AS n
           FROM project_needs need
          WHERE need.workspace_id = $1
            AND need.status = ANY($2)
            AND need.status_changed_at IS NOT NULL
            AND need.status_changed_at < now() - ($3 || ' days')::interval
            AND NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id)`,
        [[...NEED_OPEN_STATUSES], NEED_STALE_DAYS],
      ),

      // Le compteur de relances est la SEULE chose qui autorise à dire « après
      // deux relances ». Le déduire de l'âge du mois — « il a dû être relancé
      // deux fois » — aurait annoncé des relances qu'aucun humain n'a envoyées,
      // sur des mois où le canal n'était même pas branché.
      //
      // `AWAITING_TIMESHEET_STATUSES` est la définition partagée de « rien n'est
      // encore arrivé » : un relevé validé, en litige ou rejeté-puis-redéposé
      // n'est pas manquant, et le compter ferait relancer quelqu'un qui a rendu.
      timesheetsMissingAfterReminders: scoped(
        `SELECT count(*)::int AS n
           FROM mission_timesheets ts
           JOIN missions m ON m.id = ts.mission_id
          WHERE m.workspace_id = $1
            AND ts.status = ANY($2)
            AND ts.reminders_sent >= $3`,
        [[...AWAITING_TIMESHEET_STATUSES], TIMESHEET_REMINDERS_BEFORE_ALERT],
      ),

      // Quatre conditions, et chacune refuse une bêtise précise :
      //
      //  - `invoiced_at IS NOT NULL` : un mois que personne n'a facturé n'est
      //    pas en retard de paiement. Annuler un « facturé » remet cette colonne
      //    à `null`, donc la ligne sort d'elle-même du compte.
      //  - la facture n'est pas SOLDÉE. ⚠️ #2419.4 — cette ligne disait
      //    « `paid_at IS NULL` : c'est l'encaissement qui clôt, pas le
      //    montant », et c'était faux : un règlement de 5 000 € sur 10 000 €
      //    pose `paid_at` sans éteindre la dette, et rendait Laura MUETTE sur
      //    l'impayé. Le prédicat de référence est `unsettledInvoiceSql`,
      //    miroir exact de `isSettled` — un montant encaissé inconnu y compte
      //    pour soldé, parce qu'on n'accuse pas un client sur un silence.
      //
      //    ⚠️ Il est écrit EN TOUTES LETTRES ici, et non interpolé : les
      //    requêtes de cette sonde doivent rester littérales pour que
      //    `laura-probe-alias-resolution.spec.ts` puisse résoudre leurs alias
      //    sur le schéma réel — un SQL assemblé à l'exécution n'est pas
      //    vérifiable. Il ne peut pas diverger pour autant :
      //    `invoice-settlement.spec.ts` compare ce texte, à l'espace près, à
      //    ce que rend `unsettledInvoiceSql('r')`.
      //  - `due_on IS NOT NULL` : sans échéance, il n'y a pas de retard à
      //    calculer. C'est écrit sur la colonne elle-même — « `null` = inconnue,
      //    jamais aujourd'hui » — et le contraire ferait compter en retard tout
      //    ce dont on ignore la date.
      //  - le LITIGE en cours sort : une facture contestée n'est pas une facture
      //    oubliée, et c'est précisément la distinction pour laquelle
      //    `disputed_at` a été créée. Un litige LEVÉ, lui, revient au compte.
      invoicesOverdueBeyondGrace: scoped(
        `SELECT count(*)::int AS n
           FROM invoice_readiness r
          WHERE r.workspace_id = $1
            AND r.invoiced_at IS NOT NULL
            AND (r.paid_at IS NULL
           OR (r.paid_amount_cents IS NOT NULL
               AND r.invoiced_amount_cents IS NOT NULL
               AND r.paid_amount_cents < r.invoiced_amount_cents))
            AND r.due_on IS NOT NULL
            AND r.due_on < (current_date - ($2 || ' days')::interval)::date
            AND (r.disputed_at IS NULL OR r.dispute_resolved_at IS NOT NULL)`,
        [PAYMENT_OVERDUE_DAYS],
      ),

      // JUSQU'OÙ le pipe porte, en jours — et non « combien d'affaires ».
      //
      // `max` rend `NULL` quand aucune affaire en jeu ne porte de clôture
      // espérée, et c'est la moitié importante : la mesure vaut alors `null`,
      // le détecteur se tait, et une ESN qui ne renseigne pas ce champ ne
      // s'entend pas annoncer une tension qu'on n'a pas mesurée.
      //
      // La portée est celle de TOUTES les lectures du pipe : la colonne
      // `opportunities.workspace_id` peut être transitoirement nulle, et le
      // rattachement de vérité est celui du COMPTE. Un seed de démonstration
      // s'était déjà fait avoir en ne filtrant que sur la première.
      //
      // Les cinq étapes du pipe MOINS les sorties : `won` appartient aux deux
      // listes, et une affaire signée ne couvre plus rien à venir. Les deux
      // ensembles sont les définitions partagées — les recopier ici ferait
      // diverger le pipe de Laura et le pipe de l'écran.
      pipelineCoverageDays: scoped(
        `SELECT (max(o.expected_close_on) - current_date)::int AS n
           FROM opportunities o
           JOIN accounts a ON a.id = o.account_id
          WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
            AND a.status <> 'deleted'
            AND o.outcome IS NULL
            AND o.stage = ANY($2)
            AND o.stage <> ALL($3)
            AND o.expected_close_on IS NOT NULL`,
        [[...PIPELINE_STAGES], [...CLOSED_STAGES]],
      ),

      // ⚠️ UN PLACEMENT N'EST PAS UN POSITIONNEMENT, et le filtre sur
      // `started_on` est ce qui tient la différence — c'est mot pour mot la
      // définition de `PropagationService.placementsOf`, qui alimente le
      // « placé N fois » du vivier. Une affectation posée sur une mission qui
      // commence le mois prochain n'est pas encore un placement.
      //
      // Le regroupement porte sur le COUPLE (consultant, compte) : le total par
      // consultant répond à une autre question — « présente-t-on beaucoup cette
      // personne ? » — et une personne placée une fois chez trois clients
      // n'ouvre aucune porte chez aucun d'eux.
      consultantsPlacedThriceAtSameAccount: scoped(
        `SELECT count(*)::int AS n FROM (
           SELECT ma.consultant_id, m.account_id
             FROM mission_assignments ma
             JOIN missions m ON m.id = ma.mission_id
             JOIN consultants c ON c.id = ma.consultant_id AND c.archived_at IS NULL
            WHERE m.workspace_id = $1
              AND m.started_on IS NOT NULL
              AND m.started_on <= current_date
            GROUP BY ma.consultant_id, m.account_id
           HAVING count(DISTINCT ma.mission_id) >= $2
         ) s`,
        [PLACEMENTS_AT_SAME_ACCOUNT],
      ),

      // §13.3 — « fin d'une action longue attendue ». La seule action longue
      // que le dépôt DATE de bout en bout est l'analyse de compte :
      // `analysis_runs` porte `completed_at`, posé par le worker sur
      // l'événement terminal. Un run encore en cours n'a pas de date, donc pas
      // de ligne, donc `null` — et `null` n'ouvre aucune dérogation.
      //
      // ⚠️ Par PERSONNE (`user_id`) et non par espace : le résultat est attendu
      // par celui qui a lancé le run, pas par ses collègues, et faire sauter le
      // plafond de toute l'équipe sur l'analyse de l'un d'eux serait exactement
      // le bruit que le §13 existe pour éviter.
      minutesSinceLongActionFinished: personal(
        `SELECT (EXTRACT(EPOCH FROM (now() - max(completed_at))) / 60)::int AS n
           FROM analysis_runs
          WHERE user_id = $1 AND status = 'completed' AND completed_at IS NOT NULL`,
      ),

      // §13.2, la HAUSSE — « interroge Laura spontanément > 5 fois/jour ».
      // HIER, borné à la journée civile : le tome décrit un comportement
      // OBSERVÉ qui décide du plafond du LENDEMAIN. Compter aujourd'hui ferait
      // monter le plafond au fil de la matinée, c'est-à-dire un plafond qui
      // bouge pendant qu'on s'en sert.
      //
      // `role = 'user'` est ce qui rend la sollicitation SPONTANÉE : les
      // réponses du copilote ne sont pas des questions.
      //
      // ⚠️ La journée est celle de la BASE (`date_trunc`), là où le décompte
      // des interventions d'hier est celui du PROCESS (`Date#setHours`, comme
      // `countToday` avant lui). Les deux coïncident tant que les deux tournent
      // en UTC, ce qui est le cas ; l'écart possible est une question posée
      // dans la demi-heure autour de minuit, comptée un jour à côté. Nommé ici
      // pour que ce ne soit pas une divergence SILENCIEUSE le jour où l'un des
      // deux change de fuseau.
      spontaneousQueriesYesterday: personal(
        `SELECT count(*)::int AS n
           FROM chat_messages
          WHERE user_id = $1
            AND role = 'user'
            AND created_at >= date_trunc('day', now()) - interval '1 day'
            AND created_at <  date_trunc('day', now())`,
      ),

      // La disponibilité DÉCLARÉE, jamais dérivée d'affectations : c'est ce
      // qu'un humain a saisi sur la fiche, et `consultants.availability` porte
      // `inconnu` par défaut — l'entité écrit noir sur blanc qu'un `inconnu`
      // n'est JAMAIS présenté comme disponible. La dérivation par affectations
      // existe déjà juste au-dessus (`consultantsOnLongBench`) et répond à une
      // autre question : « depuis combien de temps est-il sur le banc ? ».
      consultantsAvailableNow: scoped(
        `SELECT count(*)::int AS n
           FROM consultants
          WHERE workspace_id = $1 AND archived_at IS NULL AND availability = 'immediate'`,
      ),

      // Le pendant du précédent, et il n'est pas décoratif : « 0 disponible »
      // sur douze fiches dont personne n'a renseigné la disponibilité se lit
      // « personne n'est libre », alors que la vérité est « personne ne l'a
      // dit ». Les deux voyagent ensemble jusqu'à `accountResourceMeasure`.
      // #3398 — disponibilité déclarée POSITIVE, jamais revalidée depuis plus
      // de `AVAILABILITY_REVALIDATION_DAYS` (le seuil du matching, en paramètre :
      // un seul endroit). `availability_checked_at IS NULL` n'est pas périmé.
      consultantsAvailabilityStale: scoped(
        `SELECT count(*)::int AS n
           FROM consultants
          WHERE workspace_id = $1 AND archived_at IS NULL
            AND availability IN ('immediate', 'sous_1_mois', 'sous_3_mois')
            AND availability_checked_at IS NOT NULL
            AND availability_checked_at < now() - ($2 || ' days')::interval`,
        [String(AVAILABILITY_REVALIDATION_DAYS)],
      ),

      // #3398.1 — dépendance à un client : part du CA quotidien des affectations
      // EN COURS (TJM saisi × charge) portée par le premier compte. `NULL` sans
      // aucune affectation chiffrée : non mesuré, jamais « 0 % ».
      topAccountRevenueSharePercent: scoped(
        `SELECT round(100 * sum(a.daily_rate_cents::numeric * a.load_percent)
                   / nullif(sum(sum(a.daily_rate_cents::numeric * a.load_percent)) OVER (), 0))::int AS n
           FROM mission_assignments a
           JOIN missions m ON m.id = a.mission_id
          WHERE a.workspace_id = $1 AND a.daily_rate_cents IS NOT NULL
            AND a.status = 'confirmed' AND a.starts_on <= current_date
            AND (a.ends_on IS NULL OR a.ends_on >= current_date)
          GROUP BY m.account_id
          ORDER BY 1 DESC NULLS LAST
          LIMIT 1`,
      ),

      // #3398.2 — comptes actifs sans responsable. `NULL` (non mesuré) quand
      // l'espace n'a qu'un siège : seul à bord, « sans responsable » ne veut rien
      // dire, et un 0 inventé se lirait « tout est attribué ».
      accountsWithoutOwner: scoped(
        `SELECT CASE WHEN (SELECT count(*) FROM workspace_members WHERE workspace_id = $1) >= 2
                     THEN count(*)::int END AS n
           FROM accounts
          WHERE workspace_id = $1 AND assigned_to IS NULL AND commercial_status <> 'archived'`,
      ),

      // #3398.2 — collisions : MÊME définition que `ManagerService.duplicateCoverage`
      // (au moins deux personnes distinctes ont agi sur le compte). Un seul siège
      // ne peut pas entrer en collision avec lui-même : le HAVING suffit, 0 est vrai.
      accountsActedOnBySeveralPeople: scoped(
        `SELECT count(*)::int AS n
           FROM (
             SELECT ua.account_id
               FROM user_actions ua
               JOIN accounts a ON a.id = ua.account_id AND a.commercial_status <> 'archived'
              WHERE ua.workspace_id = $1 AND ua.account_id IS NOT NULL
              GROUP BY ua.account_id
             HAVING COUNT(DISTINCT ua.user_id) >= 2
           ) s`,
      ),

      // #3398.1/.4 — le portefeuille PERSONNEL actif.
      myActiveAccounts: scoped(
        `SELECT count(*)::int AS n
           FROM accounts
          WHERE workspace_id = $1 AND assigned_to = $2 AND commercial_status <> 'archived'`,
        [userId],
      ),

      // #3398 — les relances dues : tâche OUVERTE sur un compte, échéance passée.
      accountTasksOverdue: scoped(
        `SELECT count(*)::int AS n
           FROM tasks
          WHERE workspace_id = $1 AND account_id IS NOT NULL
            AND status = ANY($2) AND due_on < current_date`,
        [[...TASK_OPEN_STATUSES]],
      ),

      // #3398 (BD) — information terrain non enregistrée : un appel loggé À LA
      // MAIN (`source = 'manual'`, l'intention de le consigner), récent, dont
      // le débrief structuré (`call_debrief`) est resté `null`. Un appel
      // SYNCHRONISÉ (`source = 'telephony'`) en sort : personne n'a choisi de
      // le débriefer, son silence n'est donc pas un oubli.
      callsWithoutDebrief: scoped(
        `SELECT count(*)::int AS n
           FROM activities
          WHERE workspace_id = $1 AND kind = 'call' AND source = 'manual'
            AND call_debrief IS NULL
            AND occurred_at >= now() - ($2 || ' days')::interval`,
        [String(FIELD_CALL_DEBRIEF_WINDOW_DAYS)],
      ),

      // #2875/#3398 (BM) — entretien à préparer : un entretien PLANIFIÉ, dans
      // la fenêtre qui vient, dont le brief n'a jamais été ouvert. Un
      // entretien déjà classé (positif/négatif/no-show) ou déjà passé n'a
      // plus besoin d'être préparé.
      interviewsAwaitingBrief: scoped(
        `SELECT count(*)::int AS n
           FROM interviews
          WHERE workspace_id = $1 AND outcome = 'pending'
            AND brief_viewed_at IS NULL
            AND scheduled_at BETWEEN now() AND now() + ($2 || ' hours')::interval`,
        [String(INTERVIEW_BRIEF_WINDOW_HOURS)],
      ),

      // #2875/#3398 (forecast fondateur) — UNE requête agrégée au lieu des sept
      // lectures paginées de `ForecastHorizonsService.compute` : le fait
      // DÉCLARÉ que son scénario bas retire (renouvellement bloqué / mission à
      // risque), sur les mêmes statuts « en cours » (`FORECAST_*` du contrat).
      forecastDeclaredBlockedMissions: scoped(
        `SELECT count(*)::int AS n
           FROM missions
          WHERE workspace_id = $1
            AND status = ANY($2)
            AND (ends_on IS NULL OR ends_on >= current_date)
            AND (renewal_status = $3 OR status = $4)`,
        [
          [...FORECAST_RUNNING_MISSION_STATUSES],
          FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS,
          FORECAST_DECLARED_BLOCKED_MISSION_STATUS,
        ],
      ),

      // Métiers placés DÉDUITS (Louis 11/10/2026) — « sinon on pose la
      // question ». Le profil d'ENTREPRISE de l'espace : `0` dès qu'un métier est
      // déclaré ou déduit (retirés exclus), `1` quand la déduction a tourné sans
      // rien trouver, `NULL` avant qu'elle ait tourné ou sans profil.
      // « Un déduit non retiré » s'écrit par opérateurs jsonb (rôles ⊄ retirés),
      // jamais en dépliant le tableau comme une table : les gardes de la sonde
      // exigent que toute source lue soit une entité (intégration G 11/10).
      placedRolesUnknown: scoped(
        `SELECT CASE
                  WHEN cardinality(p.placed_roles) > 0 THEN 0
                  WHEN p.inferred_placed_roles_at IS NULL THEN NULL
                  WHEN jsonb_array_length(jsonb_path_query_array(p.inferred_placed_roles, '$[*].role')) > 0
                   AND NOT (
                     jsonb_path_query_array(p.inferred_placed_roles, '$[*].role') <@ to_jsonb(p.dismissed_inferred_roles)
                   ) THEN 0
                  ELSE 1
                END AS n
           FROM esn_profiles p
          WHERE p.workspace_id = $1 AND p.is_workspace_canonical = true AND p.is_current = true
          LIMIT 1`,
      ),

      consultantsAvailabilityUndeclared: scoped(
        `SELECT count(*)::int AS n
           FROM consultants
          WHERE workspace_id = $1 AND archived_at IS NULL AND availability = 'inconnu'`,
      ),

      // #1937.4 — la seule lecture de cette sonde qui compte une CONTRADICTION
      // et non un manque : la mission se déclare EN COURS et porte en même
      // temps une date de fin passée. Les deux faits sont sur la MÊME ligne,
      // donc aucune jointure ne peut les faire diverger.
      //
      // ⚠️ `ends_on IS NOT NULL` n'est pas une précaution de style : sans lui,
      // `ends_on < current_date` serait `NULL` donc faux — le compte serait
      // juste par accident, et la première relecture qui inverserait la
      // comparaison l'aurait cassé sans un test rouge. Écrit, il DIT que les
      // missions sans échéance sortent du compte, ce qui est la règle.
      //
      // ⚠️ Les mêmes états que `activeMissions` juste au-dessus, et pour la
      // raison de GA-26 : deux définitions de « en cours » dans la même sonde
      // feraient dire à Laura qu'une mission est incohérente sur un écran qui
      // ne la compte même pas comme active.
      activeMissionsPastEndDate: scoped(
        `SELECT count(*)::int AS n
           FROM missions
          WHERE workspace_id = $1
            AND status IN ('active', 'onboarding')
            AND ends_on IS NOT NULL
            AND ends_on < current_date`,
      ),

      rfpsDueWithGaps: () => this.rfpsDueWithGaps(workspaceId),

      // #2409.8 — Laura nomme d'elle-même ce qui manque avant un démarrage.
      // Tranché sans Louis (décision §12) : ce détecteur existant, pas un second
      // mécanisme ; le jugement est `computeMissionStartReadiness`, lu par
      // `missionsStartingSoonNotReady` (le même que la porte de démarrage).
      missionsStartingSoonNotReady: async () =>
        (await missionsStartingSoonNotReady(this.dataSource.manager, workspaceId)).length,

      // #2409.9 — l'arrivée du jour 1 non confirmée, de J0 à J+2 seulement :
      // au-delà, Laura se tait (confirmer ne se réclame pas indéfiniment). Les
      // statuts « avant démarrage » viennent du contrat (GA-26).
      missionsStartedUnconfirmed: scoped(
        `SELECT count(*)::int AS n
           FROM missions
          WHERE workspace_id = $1
            AND status = ANY($2)
            AND started_on IS NOT NULL
            AND started_on BETWEEN current_date - $3::int AND current_date`,
        [[...MISSION_PRE_START_STATUSES], MISSION_DAY_ONE_CONFIRM_WINDOW_DAYS],
      ),
    }
  }

  /**
   * Ce que le DOSSIER ouvert apporte à la détection — ses signaux de recrutement
   * encore d'actualité.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * TROIS CHOSES QU'ELLE NE FAIT PAS
   * ─────────────────────────────────────────────────────────────────────────────
   * 1. **Elle ne relit pas `raw_analysis`.** `accounts.recent_signals` est la
   *    colonne que l'onglet Signaux affiche déjà ; en lire une autre ferait dire
   *    à Laura autre chose que ce que le commercial a sous les yeux.
   * 2. **Elle ne CALCULE aucune ancienneté.** `RecentSignal.date` est une chaîne
   *    libre que le dossier remplit parfois d'une année seule. La convertir en
   *    « ouvert depuis 42 jours » serait un chiffre que personne ne peut
   *    vérifier — elle voyage BRUTE, comme provenance.
   * 3. **Elle ne devine pas une source.** `source` absent reste `null` : une
   *    source inventée est pire qu'une source absente, parce qu'elle se cite.
   *
   * `null` = on n'a pas pu lire, ce qui n'est PAS « ce compte n'a aucun signal ».
   * Les deux ne se confondent jamais : un `null` ne déclenche rien.
   *
   * ⚠️ La portée est celle de l'ESPACE, et c'est ce qui empêche un identifiant
   * envoyé par le navigateur de faire lire le dossier d'un autre client.
   */
  async accountHiringSignals(workspaceId: string, accountId: string): Promise<AccountSuggestionFact[] | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT recent_signals FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [accountId, workspaceId],
      )) as { recent_signals: unknown }[]
      if (!rows.length) return null
      const parsed = recentSignalSchema.array().safeParse(rows[0]?.recent_signals ?? [])
      // Une colonne illisible n'est pas un compte sans signal : on ne sait pas.
      if (!parsed.success) return null
      return (
        parsed.data
          .filter(signal => signal.type === 'recrutement')
          // #4759 (revient sur le filtre `archive` de #4769) : une offre ancienne est un besoin PASSÉ, utilisable. Son
          // âge se DIT par sa date réelle (`observedOn`, brute) ; sans date, une archive ne se cite pas.
          .filter(signal => signal.freshness !== 'archive' || nonEmpty(signal.date) !== null)
          // #4044 — une offre de stage n'est jamais un signal de recrutement pour Laura.
          .filter(signal => !isInternshipPosting(signal.signal))
          .filter(signal => typeof signal.signal === 'string' && signal.signal.trim().length > 0)
          .slice(0, ACCOUNT_HIRING_SIGNALS_KEPT)
          .map(signal => ({
            kind: 'hiring_signal' as const,
            statement: (signal.signal as string).slice(0, 400),
            // Le nom LISIBLE de la source, jamais le jeton de traçabilité
            // (`source_ref`, « [PR3] ») : il ne nomme ni média, ni registre.
            source: nonEmpty(signal.source),
            observedOn: nonEmpty(signal.date),
            // Un signal ne DÉNOMBRE rien par lui-même : compter « deux postes »
            // demanderait de lire une phrase, ce qui inventerait un chiffre.
            count: null,
          }))
      )
    } catch (error) {
      this.logger.warn(`Signaux de recrutement du compte illisibles: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * #3939.3 — l'hypothèse de douleur qualifiée du dossier ouvert, et les signaux
   * DATÉS qui la fondent (`accountPainFacts`, contrat). Lit `raw_analysis` — la
   * MÊME donnée que l'encadré « Hypothèses qualifiées » de la Veille, qui lie
   * hypothèse et signal par `based_on_signal_ids` (les `id` vivent dans
   * l'analyse, pas dans `accounts.recent_signals`). Seules les trois clés utiles
   * sortent de la base, jamais le dossier entier.
   *
   * `null` = lecture impossible (aucune conclusion) ; `[]` = rien ne fonde une
   * douleur datée (Laura se tait). Portée de l'ESPACE, comme le recrutement.
   */
  async accountPainFacts(
    workspaceId: string,
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountSuggestionFact[] | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT COALESCE(raw_analysis->'qualified_hypotheses', raw_analysis->'qualifiedHypotheses') AS hypotheses,
                raw_analysis->'pains' AS pains,
                COALESCE(raw_analysis->'recent_signals', raw_analysis->'recentSignals') AS signals
           FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [accountId, workspaceId],
      )) as { hypotheses: unknown; pains: unknown; signals: unknown }[]
      const row = rows[0]
      if (!row) return null
      const reading = {
        qualified_hypotheses: row.hypotheses ?? undefined,
        pains: row.pains ?? undefined,
        recent_signals: row.signals ?? undefined,
      }
      return accountPainFacts(parseAccountAnalysis(reading), now)
    } catch (error) {
      this.logger.warn(`Douleurs du compte illisibles: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Combien d'appels d'offres arrivent à échéance avec des exigences
   * obligatoires sans réponse validée.
   *
   * Le décompte passe par `computeRfpCompliance`, la fonction PURE déjà
   * utilisée par le rapport de conformité. Le refaire en SQL produirait un
   * second verdict, et deux verdicts sur « est-ce prêt à partir ? » est
   * exactement ce qu'on ne veut pas.
   *
   * Une ligne dont les exigences sont illisibles est ÉCARTÉE, pas comptée comme
   * complète : on ne sait pas, et « on ne sait pas » n'est pas « tout va bien ».
   */
  private async rfpsDueWithGaps(workspaceId: string): Promise<number | null> {
    const rows = (await this.dataSource.query(
      `SELECT requirements
         FROM rfps
        WHERE workspace_id = $1
          AND status IN ('intake', 'analysed', 'bid')
          AND due_at IS NOT NULL
          AND due_at BETWEEN now() AND now() + interval '3 days'
        LIMIT 50`,
      [workspaceId],
    )) as { requirements: unknown }[]

    let withGaps = 0
    for (const row of rows) {
      const parsed = rfpRequirementSchema.array().safeParse(row.requirements ?? [])
      if (!parsed.success) continue
      if (computeRfpCompliance(parsed.data).mandatoryUnanswered > 0) withGaps += 1
    }
    return withGaps
  }

  /**
   * La fenêtre de facturation de l'espace, BRUTE.
   *
   * La sonde s'arrête là, et c'est un choix d'architecture : transformer
   * `period_start` en « jours avant renouvellement » demande `nextResetFor`,
   * qui vit dans le module des crédits. Un service qui va chercher le service
   * d'un voisin est ce que GA-07 fige ; la composition se fait donc dans le
   * contrôleur, la couche où un geste utilisateur traverse deux domaines.
   *
   * L'abonnement est porté par le PROPRIÉTAIRE de l'espace — même jointure que
   * `creditUse`, `manager.service` et `interventions.sweeper`. La requête
   * interrogeait autrefois `subscriptions.workspace_id`, une colonne qui
   * n'existe pas.
   */
  async billingWindow(
    workspaceId: string,
  ): Promise<{ plan: string | null; period_start: Date | null; trial_end: Date | null } | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT s.plan, s.period_start, s.trial_end
           FROM workspaces w
           JOIN subscriptions s ON s.user_id = w.owner_user_id
          WHERE w.id = $1
          LIMIT 1`,
        [workspaceId],
      )) as { plan: string | null; period_start: Date | null; trial_end: Date | null }[]
      return rows[0] ?? null
    } catch (error) {
      this.logger.warn(`Laura billing window unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /** Une mesure, isolée : elle rend `null` et NOMME la clé qui n'a pas pu être lue. */
  private async guarded(name: DetectionCount, read: () => Promise<number | null>): Promise<number | null> {
    try {
      return await read()
    } catch (error) {
      // Nommer la mesure est ce qui a manqué à `creditUse` pendant trois
      // semaines : un `null` anonyme se confond avec une donnée absente.
      this.logger.warn(`Laura detection measure "${name}" unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /** Le premier `n` de la requête, ou `null` si la ligne n'existe pas. */
  private async scalar(sql: string, params: readonly unknown[]): Promise<number | null> {
    const rows = (await this.dataSource.query(sql, [...params])) as { n: number | string | null }[]
    if (!rows.length || rows[0]?.n === null || rows[0]?.n === undefined) return null
    const value = Number(rows[0]?.n)
    return Number.isFinite(value) ? value : null
  }

  /**
   * Ce qui EMPÊCHE de travailler, en clair — l'outil `get_blocking_issues`.
   *
   * Un connecteur en panne n'est pas un axe de score, c'est une phrase que
   * quelqu'un doit lire. La liste est vide quand tout va bien, et l'absence de
   * liste (`null`) veut dire qu'on n'a pas pu regarder — les deux ne se
   * confondent pas, comme partout ailleurs dans le dépôt.
   */
  async blockingIssues(workspaceId: string): Promise<string[] | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT provider FROM crm_connections WHERE workspace_id = $1 AND refresh_failed_at IS NOT NULL`,
        [workspaceId],
      )) as { provider: string }[]
      // Le nom de l'éditeur ne sort pas côté application (arbitrage du 02/08) :
      // on nomme la CAPACITÉ. Seul l'écran Intégrations dit qui est qui.
      return rows.length ? ['La connexion à ton CRM a expiré — elle est à rétablir depuis les réglages.'] : []
    } catch (error) {
      this.logger.warn(`Blocking issues unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /* ------------------------------------------------------------------ */

  /** Un comptage rapporté à un seuil, borné à 1. `null` si la lecture échoue. */
  private async ratio(sql: string, workspaceId: string, target: number): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(sql, [workspaceId])) as { n: number }[]
      const count = Number(rows[0]?.n ?? 0)
      if (!Number.isFinite(count)) return null
      return Math.min(1, count / target)
    } catch (error) {
      this.logger.warn(`Health axis unreadable: ${(error as Error).message}`)
      return null
    }
  }

  private async connectorHealth(workspaceId: string): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE refresh_failed_at IS NULL)::int AS healthy
           FROM crm_connections WHERE workspace_id = $1`,
        [workspaceId],
      )) as { total: number; healthy: number }[]
      const total = Number(rows[0]?.total ?? 0)
      // AUCUN connecteur n'est pas « 0 % de connecteurs sains » : c'est un
      // espace qui n'en a pas branché. L'axe n'est pas évaluable, et il sort du
      // dénominateur au lieu de plomber le score.
      if (total === 0) return null
      return Number(rows[0]?.healthy ?? 0) / total
    } catch (error) {
      this.logger.warn(`Connector health unreadable: ${(error as Error).message}`)
      return null
    }
  }

  private async seatAdoption(workspaceId: string): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT count(*)::int AS seats,
                count(*) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM user_actions ua
                     WHERE ua.user_id = wm.user_id AND ua.created_at > now() - interval '30 days'
                  )
                )::int AS active
           FROM workspace_members wm WHERE wm.workspace_id = $1`,
        [workspaceId],
      )) as { seats: number; active: number }[]
      const seats = Number(rows[0]?.seats ?? 0)
      if (seats === 0) return null
      return Number(rows[0]?.active ?? 0) / seats
    } catch (error) {
      this.logger.warn(`Seat adoption unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * La PROFONDEUR — combien de familles de fonctionnalités ont produit quelque
   * chose.
   *
   * Ce n'est pas de l'usage au sens strict : le dépôt n'a aucune télémétrie par
   * fonctionnalité, et en inventer une produirait un chiffre que personne ne
   * peut vérifier. Ce qu'on mesure est l'EXISTENCE d'objets — un compte, un
   * consultant, une mission, un besoin, une routine. C'est exactement la
   * définition que le §5.6 donne de cet axe (« familles utilisées /
   * disponibles »), et c'est vérifiable en ouvrant l'écran.
   */
  private async depth(workspaceId: string): Promise<number | null> {
    const families: [string, string][] = [
      ['accounts', 'SELECT 1 FROM accounts WHERE workspace_id = $1 LIMIT 1'],
      ['consultants', 'SELECT 1 FROM consultants WHERE workspace_id = $1 LIMIT 1'],
      ['missions', 'SELECT 1 FROM missions WHERE workspace_id = $1 LIMIT 1'],
      ['needs', 'SELECT 1 FROM project_needs WHERE workspace_id = $1 LIMIT 1'],
      ['integrations', 'SELECT 1 FROM crm_connections WHERE workspace_id = $1 LIMIT 1'],
    ]
    let used = 0
    let readable = 0
    for (const [, sql] of families) {
      try {
        const rows = (await this.dataSource.query(sql, [workspaceId])) as unknown[]
        readable += 1
        if (rows.length > 0) used += 1
      } catch {
        // Une table absente ne compte NI au numérateur, NI au dénominateur :
        // la compter comme « non utilisée » ferait baisser le score d'un espace
        // dont on n'a simplement pas pu lire une famille.
      }
    }
    return readable === 0 ? null : used / readable
  }

  /**
   * La QUALITÉ — la part des comptes sur lesquels quelqu'un a décidé quelque
   * chose.
   *
   * Le §5.6 parle de « taux de champs critiques renseignés ». Sur un compte, le
   * champ critique n'est pas une adresse : c'est `commercial_status` — a-t-on
   * décidé s'il fallait le travailler ? Un espace plein de comptes analysés dont
   * aucun n'est classé est exactement le cas que ce score doit voir.
   *
   * Un espace SANS compte rend `null` et non 0 : il n'a rien à renseigner.
   */
  private async decidedAccounts(workspaceId: string): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE commercial_status IS NOT NULL)::int AS decided
           FROM accounts WHERE workspace_id = $1`,
        [workspaceId],
      )) as { total: number; decided: number }[]
      const total = Number(rows[0]?.total ?? 0)
      if (total === 0) return null
      return Number(rows[0]?.decided ?? 0) / total
    } catch (error) {
      this.logger.warn(`Account decision rate unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * ACTIONABILITY (#2406/#2977) — la part des comptes qui ont une SUITE
   * prévue : une tâche encore ouverte (`TASK_OPEN_STATUSES`, même définition
   * que `accountsWithoutNextAction` dans `readers()` ci-dessus — un compte
   * qualifié depuis six mois sans rien de prévu est exactement ce que cet
   * axe doit voir, pas un proxy sur un autre axe).
   *
   * Le §2406 nomme aussi « besoins sans shortlist » et « missions sans plan » :
   * ils restent HORS de ce premier calcul (reste du chantier #2977), la mesure
   * ci-dessous ne porte que « comptes sans suite ». Un espace SANS compte rend
   * `null`, pas 0 : il n'a rien à faire suivre.
   */
  private async actionability(workspaceId: string): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (
                  WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.account_id = a.id AND t.status = ANY($2))
                )::int AS followed
           FROM accounts a WHERE a.workspace_id = $1`,
        [workspaceId, [...TASK_OPEN_STATUSES]],
      )) as { total: number; followed: number }[]
      const total = Number(rows[0]?.total ?? 0)
      if (total === 0) return null
      return Number(rows[0]?.followed ?? 0) / total
    } catch (error) {
      this.logger.warn(`Actionability unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * VALEUR (#2406/#2977) — décisions produites, risques évités, dossiers
   * avancés, temps estimé avec méthode transparente. Aucune des quatre n'a de
   * source mesurable dans ce dépôt aujourd'hui : aucune table n'horodate une
   * décision, un risque évité, ou un temps estimé avec sa méthode. Rendre `0`
   * ferait passer TOUS les espaces pour des espaces sans valeur — `null`,
   * honnêtement, sort l'axe du dénominateur plutôt que de mentir sur zéro.
   * Reste du chantier #2977 : brancher une source réelle.
   */
  private async value(): Promise<number | null> {
    return null
  }

  private async creditUse(workspaceId: string): Promise<number | null> {
    try {
      const rows = (await this.dataSource.query(
        // `subscriptions` est clé par UTILISATEUR et non par espace : c'est le
        // PROPRIÉTAIRE de l'espace qui porte l'abonnement, un contrat et un
        // pool de crédits par espace (décision du socle multi-entité). La
        // requête interrogeait `workspace_id`, une colonne qui n'existe pas —
        // elle levait donc à CHAQUE appel, l'axe « consommation de crédits » du
        // score de santé n'a jamais été mesurable, et la production journalisait
        // l'erreur en boucle. Même jointure que `manager.service` et
        // `interventions.sweeper`, qui l'avaient juste.
        `SELECT s.accounts_used::int AS used, s.accounts_limit::int AS allowed
           FROM workspaces w
           JOIN subscriptions s ON s.user_id = w.owner_user_id
          WHERE w.id = $1
          LIMIT 1`,
        [workspaceId],
      )) as { used: number; allowed: number }[]
      const allowed = Number(rows[0]?.allowed ?? 0)
      if (!rows.length || allowed <= 0) return null
      return Math.min(1, Number(rows[0]?.used ?? 0) / allowed)
    } catch (error) {
      this.logger.warn(`Credit use unreadable: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Le détail qui manque au message de `long_bench` : le catalogue dit qu'un
   * consultant EST en intercontrat depuis plus de trente jours, jamais ce que
   * ça COÛTE — le chiffre qui déclenche l'action.
   *
   * Même population, au caractère près, que `consultantsOnLongBench` :
   * `readers().consultantsOnLongBench` DÉCIDE si `long_bench` se déclenche,
   * cette méthode CHIFFRE le cas le plus parlant. Le consultant le PLUS
   * LONGTEMPS sur le banc (`max(ends_on)` le plus ancien) est choisi plutôt
   * qu'une somme sur toute la population : un total mélangerait des
   * consultants MESURABLES et NON MESURABLES dans un seul chiffre, ce qui
   * ferait dire « coût cumulé » d'un montant partiel — le zéro qui ment, en
   * version somme.
   *
   * `null` = personne en intercontrat long (rien à chiffrer), ou la lecture a
   * échoué — les deux se distinguent déjà en amont, côté appelant, par
   * `consultantsOnLongBench` : cette méthode n'est interrogée que lorsque
   * `long_bench` est déjà une candidate.
   */
  async nearestMissionStartNotReady(workspaceId: string): Promise<MissionStartAnnouncement | null> {
    // #2409.8 — la mission la plus proche d'un démarrage incomplet, ses manques
    // NOMMÉS (clés du contrat). Interrogée seulement quand
    // `mission_start_not_ready` est déjà candidate ; `null` = rien à nommer, ou
    // lecture ratée — jamais un manque inventé.
    try {
      const [nearest] = await missionsStartingSoonNotReady(this.dataSource.manager, workspaceId)
      if (!nearest) return null
      return {
        missionId: nearest.missionId,
        label: nearest.label,
        startsOn: nearest.startedOn,
        verdict: nearest.readiness.verdict,
        missing: nearest.readiness.missing,
        reserves: nearest.readiness.reserves,
      }
    } catch (error) {
      this.logger.warn(`Démarrage de mission illisible: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * #3398.4a (recette salle démo 03/10) — la relance ouverte la plus en retard,
   * NOMMÉE : titre saisi, compte, jours de retard, nombre des autres. Même
   * définition que la mesure `accountTasksOverdue` (tâche OUVERTE sur un compte,
   * échéance passée) — une seule règle de « en retard ». `null` = rien à nommer
   * ou lecture ratée, jamais un titre deviné.
   */
  async mostOverdueFollowUp(workspaceId: string): Promise<OverdueFollowUp | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT t.title,
                a.company_name AS account_name,
                (current_date - t.due_on)::int AS days,
                (count(*) OVER ())::int AS total
           FROM tasks t
           LEFT JOIN accounts a ON a.id = t.account_id AND a.workspace_id = t.workspace_id
          WHERE t.workspace_id = $1 AND t.account_id IS NOT NULL
            AND t.status = ANY($2) AND t.due_on < current_date
          ORDER BY t.due_on ASC, t.created_at ASC
          LIMIT 1`,
        [workspaceId, [...TASK_OPEN_STATUSES]],
      )) as { title: string | null; account_name: string | null; days: number | null; total: number | null }[]
      const row = rows[0]
      const title = row?.title?.trim()
      if (!row || !title || typeof row.days !== 'number') return null
      return {
        title,
        accountName: row.account_name?.trim() || null,
        daysOverdue: row.days,
        others: Math.max(0, (row.total ?? 1) - 1),
      }
    } catch (error) {
      this.logger.warn(`Relance en retard illisible: ${(error as Error).message}`)
      return null
    }
  }

  async longestBenchConsultant(workspaceId: string): Promise<BenchCostResult | null> {
    try {
      const rows = (await this.dataSource.query(
        `SELECT c.tjm,
                (current_date - max(a.ends_on))::int AS days
           FROM mission_assignments a
           JOIN consultants c ON c.id = a.consultant_id AND c.archived_at IS NULL
          WHERE a.workspace_id = $1
          GROUP BY a.consultant_id, c.tjm
         HAVING count(*) FILTER (
                  WHERE a.starts_on <= current_date AND (a.ends_on IS NULL OR a.ends_on >= current_date)
                ) = 0
            AND count(*) FILTER (WHERE a.ends_on IS NULL) = 0
            AND max(a.ends_on) < (current_date - ($2 || ' days')::interval)::date
          ORDER BY max(a.ends_on) ASC
          LIMIT 1`,
        [workspaceId, LONG_BENCH_DAYS],
      )) as { tjm: number | null; days: number | null }[]
      const row = rows[0]
      if (!row) return null
      return computeBenchCost({ tjm: row.tjm, benchDays: row.days })
    } catch (error) {
      this.logger.warn(`Coût d'intercontrat illisible: ${(error as Error).message}`)
      return null
    }
  }
}
