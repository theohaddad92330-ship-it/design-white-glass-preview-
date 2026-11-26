import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
  type ProductScreen,
  type ReplyFeedbackVerdict,
  hasEnoughSessionsToPublish,
  resolveProductScreen,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ProductEventEntity } from '../../database/entities/product-event.entity'

/**
 * #1683/#1684/#1687/#1688/#1946 — LA LECTURE du flux COMPORTEMENTAL. Zéro écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ProductAnalyticsService` porte TROIS écritures et ZÉRO lecture (`track`,
 * `trackBehavioral`, `ingestBehavioralBatch`). Le traceur produit (#1682) définit
 * neuf événements, et le commentaire de tête de `apps/web/src/lib/product-tracker.ts`
 * le dit lui-même AU FUTUR : « la partie que cinq écrans […] LIRONT ». C'est le
 * défaut n°1 du dépôt en miroir : du code juste que personne ne LIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES QUE CE SERVICE TIENT À LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre écrans consommateurs n'ont à y penser NULLE PART — c'est le but :
 * une règle appliquée dans quatre écrans est une règle appliquée dans trois.
 *
 *  1. **Le seuil de {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions
 *     DISTINCTES** (règle 1 de `c64_analytique_produit`). Aucune moyenne, aucun
 *     taux, aucun parcours n'est calculé sous ce seuil. ⚠️ Sous le seuil on ne
 *     rend JAMAIS `0` : on rend `below_threshold` avec le compte observé et le
 *     seuil — « pas encore de quoi en tirer une mesure », jamais « personne ne
 *     s'en sert ».
 *
 *  2. **Aucun identifiant ne ressort.** Le chemin envoyé par le navigateur est
 *     `toLocation.pathname` — donc `/accounts/3f1c…` avec l'identifiant du
 *     compte dedans. {@link resolveProductScreen} le replie vers son MOTIF
 *     (`/accounts/$id`) AVANT toute agrégation. C'est la seule porte : un chemin
 *     qu'aucun motif ne reconnaît est compté à part, jamais publié tel quel.
 *
 *  3. **Aucun nom d'espace client** (règle 5). Ce n'est pas une discipline de
 *     requête : `trackBehavioral()` écrit `workspace_id` à `null`
 *     INCONDITIONNELLEMENT, donc la colonne n'existe pas dans ce flux. La
 *     conséquence qu'il faut assumer plutôt que contourner : la colonne
 *     « espaces distincts » demandée par #1683 **n'est pas dérivable de ce
 *     flux**, et ce service le DIT ({@link RapportEcrans.distinctWorkspaces})
 *     au lieu d'afficher un zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « ZÉRO » ET « PAS INSTRUMENTÉ » NE SE RESSEMBLENT PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Mesuré le 09/09/2026, et c'est le fait le plus important de ce fichier :
 * SEPT des neuf émetteurs du traceur n'ont AUCUN appelant de production.** Seuls
 * `screen_viewed` et `screen_left` sont câblés (`router.tsx`) ;
 * `trackTabOpened`, `trackActionStarted`, `trackActionCompleted`,
 * `trackActionAbandoned`, `trackFilterApplied`, `trackSearchPerformed` et
 * `trackErrorShown` ne sont appelés que par `product-tracker.test.ts`.
 *
 * Un service qui rendrait « 0 parcours interrompu » dans cet état mentirait deux
 * fois : sur la mesure, et sur la raison de son absence — quelqu'un conclurait
 * « aucune friction » là où la vérité est « rien ne la mesure ». D'où
 * {@link ProductEventFamily.instrumented} : une nature d'événement JAMAIS écrite
 * (tous horizons confondus, pas seulement sur la fenêtre) sort
 * `not_instrumented`. Zéro sur la fenêtre avec des lignes ailleurs est un VRAI
 * zéro, et se dit comme tel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL BALAYAGE, BORNÉ, ET QUI DIT CE QU'IL A COUVERT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six agrégats ont besoin de l'ORDRE des événements dans une session
 * (destination d'une sortie, séquence, aller-retour, répétition) : aucun
 * `GROUP BY` ne les rend. Le service lit donc les lignes brutes de la fenêtre,
 * **bornées à {@link MAX_EVENTS_SCANNED}**, et replie le reste en TypeScript
 * pur — le même partage que `RetentionCohortsService` et
 * `OnboardingFunnelService` : le SQL rassemble, le TypeScript décide.
 *
 * ⚠️ La borne prend les lignes les PLUS RÉCENTES. Quand elle mord, le rapport ne
 * fait pas semblant d'avoir couvert la fenêtre demandée : `coverage` porte
 * `complete: false` et l'instant du plus ancien événement retenu. « N sources
 * concaténées puis tronquées » est un défaut connu du dépôt ; une troncature
 * silencieuse en est la version analytique.
 */

/** Les vingt et une natures du flux comportemental — l'ordre n'a pas
 *  d'importance, la COMPLÉTUDE si : une nature absente d'ici serait lue par
 *  personne.
 *
 *  ⚠️ C'est littéralement vrai : cette liste est le `WHERE event_name = ANY(…)`
 *  du balayage. Les dix natures de #1946 auraient pu être écrites, stockées et
 *  jamais lues — le défaut n°1 du dépôt — si on ne l'avait pas élargie ici en
 *  même temps que l'union d'écriture. Même règle pour les deux de #2085. */
const BEHAVIORAL_EVENT_NAMES = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
  // #1946 — « mesurer la VALEUR, pas le volume de messages » (14/09/2026).
  'assistant_first_question_sent',
  'suggestion_clicked',
  'assistant_first_useful_result',
  'assistant_answer_judged',
  'assistant_redirect_followed',
  'prepared_action_stage',
  'draft_reused',
  'intervention_outcome',
  'memory_added',
  // #2085 (15/09/2026) — les frictions du parcours d'onboarding.
  'onboarding_prefill_reviewed',
  'onboarding_step_back',
  // #2985 (26/09/2026) — le Meeting OS, jusqu'ici écrit et jamais lu (#2767).
  'brief_generated',
  'brief_opened',
  'question_used',
  'notes_added',
  'summary_generated',
  'summary_approved',
  'actions_created',
  'followup_created',
  'false_association_corrected',
  // #2319.123 (29/09/2026) — même trou du même jour que les neuf ci-dessus,
  // trouvé en câblant #2108.49-.53 juste en dessous.
  'meeting_completed',
  // #2108.49-.53 (29/09/2026) — les cinq mesures du geste accepter/reporter/
  // rejeter/corriger sur une carte de priorité, câblées ce lot côté front.
  'priority_viewed',
  'priority_accepted',
  'priority_snoozed',
  'priority_rejected',
  'priority_corrected',
  // #2108.54 (30/09/2026) — une tâche cochée, câblée ce lot côté front.
  'task_completed',
  // #2319.129/.130 (30/09/2026) — une écriture CRM de compte rendu confirmée.
  'crm_writeback_confirmed',
] as const

/**
 * Le plafond de lignes d'un balayage. Choisi pour qu'une lecture d'opérateur ne
 * puisse jamais rapatrier une table entière en mémoire ; il n'est pas une
 * estimation du volume réel (le traceur est ÉTEINT par défaut,
 * `VITE_PRODUCT_TRACKER_ENABLED`), c'est une borne dure.
 */
const MAX_EVENTS_SCANNED = 50_000

/** Un rebond : une vue qui n'a rien produit ET qui a duré moins que ça. */
const BOUNCE_MAX_DURATION_MS = 10_000

/** #2108.63/#2208.85 — le même plafond que le traceur applique à une DURÉE de
 *  vue (30 min), appliqué ici à un délai DÉRIVÉ (ouverture → première action)
 *  puisque ce délai n'est jamais envoyé pré-borné par le navigateur. */
const TIME_TO_FIRST_ACTION_CAP_MS = 30 * 60_000

/** Répétition (#1687.1) : la même action, au moins trois fois, dans cette fenêtre. */
const REPETITION_WINDOW_MS = 30_000
const REPETITION_MIN_OCCURRENCES = 3

/** Aller-retour (#1687.2) : A → B → A dans cette fenêtre. */
const ROUND_TRIP_WINDOW_MS = 20_000

/** Longueur d'un parcours reconstruit (#1684.2). Trois écrans : assez pour
 *  raconter un geste, assez court pour se répéter d'une session à l'autre. */
const SEQUENCE_LENGTH = 3

const DEFAULT_WINDOW_DAYS = 7
const MAX_WINDOW_DAYS = 365

/** Combien de lignes au plus dans un classement — un tableau d'opérateur, pas un export. */
const TOP_N = 20

// ─────────────────────────────────────────────────────────────────────────────
// Les formes rendues
//
// ⚠️ Seuls les QUATRE rapports (et `WithheldMetric`, que les deux services
// historiques portent) sont exportés : leurs briques ne sont consommées que
// dans ce fichier, et le dépôt refuse d'exporter un type consommé nulle part
// ailleurs (`pnpm lint:exports:types`, knip). Le contrôleur et les écrans lisent
// la forme complète à travers les rapports.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une mesure publiée, ou la raison NOMMÉE de son absence. Le vocabulaire est
 * celui que `chatbot-funnel-stages.ts` a posé pour CE seuil — une règle, un
 * vocabulaire : deux formes différentes pour le même refus se liraient comme
 * deux refus différents.
 */
type PublishedMeasure<T> =
  | { kind: 'measured'; sessions: number; value: T }
  | { kind: 'below_threshold'; sessions: number; minSessions: number }

/** Ce qu'on n'a pas pu mesurer, et pourquoi — jamais `0`. */
export type WithheldMetric = {
  kind: 'below_threshold'
  /** Le nom de la mesure retenue, tel que l'appelant l'expose. */
  metric: string
  /** Les sujets DISTINCTS observés (sessions, membres…) — le nombre qui explique. */
  subjects: number
  minSubjects: number
}

/** Une durée médiane : un nombre, la borne haute du traceur, ou rien. */
type MedianDuration =
  | { kind: 'measured'; seconds: number }
  // Le traceur borne une vue à 30 min et rend la chaîne `'over_30_min'`. Quand
  // la médiane TOMBE sur une de ces valeurs, il n'y a pas de nombre à donner.
  | { kind: 'over_30_min' }
  | { kind: 'unmeasured' }

/** Un taux, avec son DÉNOMINATEUR — un taux sans effectif n'est pas un taux. */
type Rate = { kind: 'measured'; ratio: number; over: number } | { kind: 'unmeasured' }

type ScreenUsage = {
  /** Le MOTIF de route, jamais un chemin concret. */
  route: string
  label: { fr: string; en: string }
  nature: ProductScreen['nature']
  views: number
  /** Sessions DISTINCTES ayant ouvert cet écran. Toujours rendu : c'est le
   *  nombre qui EXPLIQUE un retrait, il ne peut pas être retenu lui-même. */
  sessions: number
  measures:
    | { kind: 'below_threshold'; minSessions: number }
    | {
        kind: 'measured'
        viewsPerWeek: number
        medianDuration: MedianDuration
        /** Vue sans action, close en moins de 10 s. */
        bounceRate: Rate
        /** Vue suivie d'au moins une action. */
        actionRate: Rate
        /** #2108.63/#2208.85 — délai médian entre l'ouverture de l'écran et sa
         *  PREMIÈRE action, sur les seules vues qui en ont eu une. */
        medianTimeToFirstAction: MedianDuration
      }
}

/** Ce que le balayage a réellement couvert. */
type Coverage = {
  windowDays: number
  /** `false` quand la borne de lignes a mordu : la fenêtre demandée n'est pas
   *  celle qui a été lue, et le rapport le dit plutôt que de la répéter. */
  complete: boolean
  eventsScanned: number
  maxEventsScanned: number
  /** L'instant du plus ancien événement retenu — la vraie borne basse. */
  oldestEventAt: string | null
}

/** Une nature d'événement, et si elle a DÉJÀ été écrite une fois. */
type ProductEventFamily = {
  event: (typeof BEHAVIORAL_EVENT_NAMES)[number]
  /** `false` = aucun émetteur n'a jamais écrit cette nature : ses agrégats sont
   *  `not_instrumented`, pas `0`. */
  instrumented: boolean
}

export type RapportEcrans = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  /**
   * #1683 demande une colonne « espaces ». Elle n'est PAS dérivable de ce flux :
   * `trackBehavioral()` écrit `workspace_id` à `null` inconditionnellement
   * (règle 4 + règle 5 de `c64_analytique_produit`). On le dit ; on ne rend pas
   * un zéro qui se lirait « aucun espace ne l'utilise ».
   */
  distinctWorkspaces: { kind: 'not_derivable'; reason: 'behavioral_flow_carries_no_workspace' }
  screens: ScreenUsage[]
  /** Les chemins qu'aucun motif du catalogue ne reconnaît, comptés à part — une
   *  route inconnue n'est jamais rattachée à l'écran le plus ressemblant. */
  unresolvedPaths: number
  notes: string[]
}

/** #2130.71 — le seul écran que {@link ProductAnalyticsReadService.accountSections}
 *  agrège : les autres fiches à onglets (talent, mission…) émettent le même
 *  `tab_opened` pour LEURS propres sections, qui ne doivent jamais se mélanger
 *  dans un même classement. Recopiée de `AccountDetailTabsBar.tsx` — deux
 *  fichiers indépendants qui écrivent la même chaîne littérale ne sont pas le
 *  réglage dupliqué que GA-26 vise (le RÉGLAGE, le nom de l'écran, reste posé
 *  une seule fois côté émission ; ce fichier ne fait que reconnaître sa valeur). */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

type SectionFrequency = {
  /** La clé de la sous-partie ouverte (`overview`, `contacts`, `partners`…),
   *  telle que `AccountDetailTabsBar` l'émet — jamais un identifiant de compte. */
  tab: string
  opens: number
  /** Sessions DISTINCTES ayant ouvert cette section. */
  sessions: number
}

/**
 * #2130.71 — quelles sections du dossier compte sont ouvertes, et à quelle
 * fréquence. `tab_opened` (#2130.54) porte déjà `{screen, tab}` ; ce rapport
 * en est le premier LECTEUR filtré sur le dossier compte — jusqu'ici écrit,
 * jamais agrégé (constat du corps de #3000, reconfirmé sans changement les
 * 25/09, 26/09 et 27/09).
 */
export type RapportSectionsDossier = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  sections: { kind: 'not_instrumented' } | PublishedMeasure<SectionFrequency[]>
  /**
   * #2130.69 — « temps ouverture → compréhension » du dossier compte.
   * `medianTimeToFirstAction` (#2108.63/#2208.85) mesure jusqu'à la première
   * ACTION ; la « compréhension » n'a pas d'événement dédié et n'en aura pas
   * un ici (aucune donnée fictive, aucun jalon inventé) — elle se lit comme
   * le premier signe OBSERVABLE que le visiteur explore le dossier plutôt
   * que de le regarder passivement : la première section ouverte
   * (`tab_opened`), sur le même écran `/accounts/$id` que {@link sections}.
   * « Tranché sans Louis » : dériver d'un événement déjà émis plutôt que
   * d'attendre un jalon produit qui n'existe pas.
   */
  comprehension: { kind: 'not_instrumented' } | PublishedMeasure<{ medianTimeToComprehension: MedianDuration }>
  /**
   * #2130.74 — « taux de passage Synthèse → action ». Parmi les vues du
   * dossier compte dont la PREMIÈRE section ouverte est la Synthèse
   * (`overview`/`evaluation`, {@link SYNTHESIS_TABS}), la part qui a vu
   * démarrer au moins une action (`action_started`, déjà émis par
   * `primary_action_clicked`/`laura_opened_from_account`…). Même proxy que
   * {@link comprehension} : aucun jalon « a compris la synthèse » n'existe,
   * la première section ouverte en tient lieu.
   */
  synthesisToAction: { kind: 'not_instrumented' } | PublishedMeasure<{ conversionRate: Rate }>
  /**
   * #2130.72 — « nombre de corrections » sur le dossier compte. Aucun jalon
   * dédié n'existe côté flux comportemental (comme {@link comprehension} et
   * {@link synthesisToAction}) : `correction_submitted` est le geste GÉNÉRIQUE
   * `action_started` (déjà journalisé) émis par `EntityResolutionPanel.tsx`
   * quand la correction d'identité d'une entité résolue est soumise — le seul
   * geste de correction du dossier compte qui écrit RÉELLEMENT quelque chose
   * (à distinguer de `record_field_audit`, l'audit CRM par champ : celui-là
   * porte un espace et un acteur, ce flux-ci n'en porte jamais — deux
   * journaux distincts, jamais mélangés).
   */
  corrections: { kind: 'not_instrumented' } | PublishedMeasure<{ submitted: number }>
  /**
   * #2130.75 — « contacts recommandés effectivement engagés ». Parmi les
   * sessions qui ont ouvert une section du dossier compte, la part qui a
   * engagé au moins un contact du chemin recommandé (`contact_selected`,
   * émis par `PriorityPathSection.tsx`). Une mesure PAR SESSION, jamais par
   * contact : ce flux écrit `workspace_id`/`user_id` à `null` (c64) et ne
   * porte aucun identifiant de contact — la jointure comportemental × statut
   * d'un contact reste proscrite, le taux de sessions n'en a pas besoin.
   * « Tranché sans Louis » : le proxy de session plutôt qu'un identifiant.
   */
  engagedContacts: { kind: 'not_instrumented' } | PublishedMeasure<{ engagedRate: Rate }>
  notes: string[]
}

/** #2130.72 — le nom d'action que {@link ProductAnalyticsReadService.accountSections}
 *  reconnaît sur `action_started`. Recopié de `EntityResolutionPanel.tsx` pour
 *  la même raison que {@link ACCOUNT_DETAIL_SCREEN} : le fichier web reste le
 *  seul ÉCRIVAIN de ce nom, celui-ci ne fait que RECONNAÎTRE sa valeur. */
const CORRECTION_SUBMITTED_ACTION = 'correction_submitted'
const CONTACT_SELECTED_ACTION = 'contact_selected'

/** #2130.74 — les clés de section qui composent la Synthèse (`AccountDetailTabsBar.tsx`,
 *  `ACCOUNT_SECTIONS`, entrée `synthesis: ['overview', 'evaluation']`). Recopiées ici
 *  pour la même raison que {@link ACCOUNT_DETAIL_SCREEN} : le fichier web reste le
 *  seul ÉCRIVAIN de ce découpage, celui-ci ne fait que RECONNAÎTRE sa valeur. */
const SYNTHESIS_TABS: readonly string[] = ['overview', 'evaluation']

type ScreenExit = {
  route: string
  label: { fr: string; en: string }
  exits: number
  sessions: number
  detail:
    | { kind: 'below_threshold'; minSessions: number }
    | {
        kind: 'measured'
        /** Destinations, la plus fréquente d'abord. */
        destinations: Array<{ route: string; label: { fr: string; en: string }; exits: number }>
        /** Part des sorties qui ferment le produit (`leaveMode: 'fermeture'`). */
        closeRate: Rate
        /** Part des sorties par INACTIVITÉ — ni une navigation, ni un départ. */
        idleRate: Rate
      }
}

type Sequence = {
  /** Les motifs de route, dans l'ordre. */
  routes: string[]
  labels: Array<{ fr: string; en: string }>
  /** Sessions DISTINCTES où ce parcours apparaît — jamais le nombre d'occurrences :
   *  une session qui boucle dix fois ne fait pas dix parcours. */
  sessions: number
}

type InterruptedAction = {
  action: string
  /** Sessions distinctes où l'action a commencé sans jamais se terminer ni
   *  s'abandonner. */
  sessions: number
  startedSessions: number
  /** interrompues / commencées. */
  interruptionRate: Rate
}

/**
 * #2085.16 — une QUESTION du questionnaire, pas un écran. Le catalogue
 * (`resolveProductScreen`) replie `/onboarding/$id/$stage/$slug` en UN seul
 * motif — exact pour la confidentialité (un `$id` de compte ne doit jamais
 * survivre), mais ça noierait « où les gens s'arrêtent » dans une moyenne sur
 * TOUTES les questions. `slug` est un identifiant STATIQUE de question
 * (catalogue `profile-questions.ts`), jamais une donnée utilisateur : le
 * replier serait donc une perte, pas une protection.
 */
// Pas d'`export` : aucun autre fichier ne lit ce type (vérifié le
// 16/09/2026). Règle du dépôt, tenue par knip.
type OnboardingQuestionAbandonment = {
  slug: string
  /** Sessions DISTINCTES ayant VU cette question. */
  sessions: number
  detail:
    | { kind: 'below_threshold'; minSessions: number }
    | {
        /** Sessions dont le DERNIER geste sur cette question a été une
         *  fermeture ou une inactivité — jamais une navigation, en avant ou en
         *  arrière (#2085.17 la porte déjà séparément). */
        kind: 'measured'
        abandonedSessions: number
        abandonRate: Rate
        /** #2022.8 — parmi les sessions qui ont abandonné CETTE question, celles
         *  qui l'ont ROUVERTE ensuite. Un sous-ensemble d'`abandonedSessions`,
         *  jamais des sessions de plus. */
        resumedSessions: number
        /** #2022.8 — `resumedSessions / abandonedSessions`, et `unmeasured` dès
         *  qu'il n'y a eu AUCUN abandon : sans dénominateur il n'y a pas de
         *  taux, et « personne n'a abandonné » ne se dit pas « 0 % de reprise ». */
        resumeRate: Rate
      }
}

export type RapportParcours = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  exits: PublishedMeasure<ScreenExit[]>
  sequences: PublishedMeasure<Sequence[]>
  interrupted: { kind: 'not_instrumented' } | PublishedMeasure<InterruptedAction[]>
  /** #2085.16 — `not_instrumented` si `screen_viewed` n'a jamais été écrit du
   *  tout ; `below_threshold` tant que le questionnaire n'a pas été vu par
   *  {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions DISTINCTES (GA-267,
   *  voir {@link onboardingQuestionAbandonment}) ; au-dessus seulement, la
   *  liste — une ligne par question VUE au moins une fois, y compris celles
   *  qu'une poignée de sessions a vues (RETENUES, jamais absentes ni à zéro). */
  onboardingQuestionAbandonment: { kind: 'not_instrumented' } | PublishedMeasure<OnboardingQuestionAbandonment[]>
  notes: string[]
}

type RepetitionFriction = {
  action: string
  /** Sessions distinctes où la même action part au moins 3 fois en moins de 30 s. */
  sessions: number
}

type RoundTripFriction = {
  /** A → B → A : `from` est A, `to` est B. */
  from: string
  to: string
  fromLabel: { fr: string; en: string }
  toLabel: { fr: string; en: string }
  sessions: number
}

type ErrorSeen = {
  route: string
  label: { fr: string; en: string }
  errorCode: string
  occurrences: number
  sessions: number
}

export type RapportFriction = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  repetitions: { kind: 'not_instrumented' } | PublishedMeasure<RepetitionFriction[]>
  roundTrips: PublishedMeasure<RoundTripFriction[]>
  errors: { kind: 'not_instrumented' } | PublishedMeasure<ErrorSeen[]>
  notes: string[]
}

type EmptySearch = {
  route: string
  label: { fr: string; en: string }
  searches: number
  emptySearches: number
  sessions: number
  emptyRate: Rate
}

export type RapportDemande = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  emptySearches: { kind: 'not_instrumented' } | PublishedMeasure<EmptySearch[]>
  notes: string[]
}

/**
 * #1946 — LA CHAÎNE D'UNE ACTION PRÉPARÉE, de la préparation à l'exécution.
 *
 * Les cinq étapes de l'issue (#1946.5 préparée, .6 validée, .7 exécutée, .8
 * corrigée, et l'abandon) tiennent dans UNE nature d'événement : ce sont les
 * états d'un même geste, et cinq natures séparées ne se rejoindraient que par
 * une jointure qu'il aurait fallu inventer.
 *
 * `executionRate` est le terme « action réellement exécutée » de la comparaison
 * finale de l'issue (#1946.25) — exécutées SUR préparées, jamais un compte nu.
 */
type PreparedActionChain = {
  /** Le NOM du geste (« relance_compte »), jamais sa cible. */
  action: string
  prepared: number
  validated: number
  executed: number
  corrected: number
  abandoned: number
  /** Sessions DISTINCTES ayant préparé ce geste — le nombre qui EXPLIQUE. */
  sessions: number
  /** #1946.25 — exécutées / préparées. */
  executionRate: Rate
  /** #1946.8 — corrigées / exécutées. */
  correctionRate: Rate
}

/**
 * #1946 — le rapport de VALEUR, et la raison d'être du lot : l'issue demande de
 * pouvoir COMPARER « réponse utile ; réponse corrigée ; action réellement
 * exécutée ; résultat métier », et refuse explicitement qu'on optimise le
 * nombre de messages, le temps passé ou le nombre de notifications.
 *
 * ⚠️ LE QUATRIÈME TERME N'EST PAS DÉRIVABLE DE CE FLUX, et le rapport le dit.
 * Un résultat métier appartient à un compte, dans un espace nommé ; le flux
 * comportemental écrit `workspace_id` à `null` inconditionnellement (règle 5 de
 * `c64_analytique_produit`). Le rapprocher demanderait de refabriquer
 * l'attribution que la doctrine interdit — exactement le dérapage qu'elle
 * décrit, « argument commercial puis reproche ». On nomme l'absence
 * ({@link RapportValeur.resultatMetier}) plutôt que d'afficher un zéro qui se
 * lirait « ça ne produit rien ».
 */
export type RapportValeur = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  /** #1946.1/.3 — la première question posée, le premier résultat jugé utile, et
   *  le délai entre les deux. Le seul « temps » de ce rapport, et il mesure une
   *  VALEUR atteinte — pas du temps passé (#1946.18). */
  amorce:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        firstQuestionSessions: number
        firstUsefulResultSessions: number
        usefulRate: Rate
        medianTimeToUseful: MedianDuration
      }>
  /**
   * #1946.9/.23/.24 — ce que vaut une réponse.
   *
   * D10 — décision Louis 14/09/2026 : la mesure connaît les six verdicts du
   * retour d'une personne (`REPLY_FEEDBACK_VERDICTS`, `@bellum/contracts`), pas
   * trois. Les trois AJOUTÉS À LA FIN (GA-08) : `dejaFaitRate`,
   * `pasMaintenantRate`, `mauvaisePrioriteRate` — chacun sous le nom de son
   * verdict d'origine, aucune case forcée.
   */
  reponses:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        judged: number
        utileRate: Rate
        generiqueRate: Rate
        inexacteRate: Rate
        dejaFaitRate: Rate
        pasMaintenantRate: Rate
        mauvaisePrioriteRate: Rate
      }>
  /** #1946.16/.24 — ce qu'un brouillon commercial est devenu : repris tel quel,
   *  retouché, ou réécrit entièrement. */
  brouillons:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{ reused: number; telQuelRate: Rate; retoucheRate: Rate; reecritRate: Rate }>
  /** #2108.64/.65 — ce que deviennent les priorités affichées (cartes du cockpit
   *  /aujourd'hui) : part traitée (acceptée) et part refusée, sur les VUES.
   *  Une carte revue compte une vue de plus : un taux ne dépasse jamais ce que
   *  les vues autorisent, jamais un 0 déduit d'un silence. */
  priorites:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        viewed: number
        accepted: number
        snoozed: number
        rejected: number
        corrected: number
        treatedRate: Rate
        refusalRate: Rate
      }>
  /** #1946.5-.8/.25 — la chaîne d'une action préparée, par geste. */
  actions: { kind: 'not_instrumented' } | PublishedMeasure<PreparedActionChain[]>
  /** #1946.2/.4/.10/.11 — ce qui SUIT une proposition : suggestion cliquée,
   *  redirection suivie, intervention ignorée, mémoire ajoutée. (« Connecteur
   *  activé après recommandation », #1946.12, retiré : #4513.) */
  suites:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        suggestionClicks: number
        redirectsFollowed: number
        interventions: number
        interventionIgnoredRate: Rate
        memoriesAdded: number
      }>
  /** #1946.26 — nommé, jamais chiffré à zéro. Voir le docblock du type. */
  resultatMetier: { kind: 'not_derivable'; reason: 'behavioral_flow_carries_no_workspace' }
  notes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Le seuil, à un seul endroit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * #1681.1 — LE SEUIL, APPLIQUÉ. `null` veut dire « publiable » ; un objet veut
 * dire « retenu », et il porte le nombre qui l'explique.
 *
 * Exportée parce que les DEUX services d'analytique historiques
 * (`analytics-overview.service.ts`, `team-kpis.service.ts`) publiaient leurs
 * taux quel que soit l'effectif — le trou nommé dans `doctrine-registry.ts`
 * (`c64_analytique_produit`, règle 1). Ils appellent cette fonction plutôt que
 * de refaire la comparaison : une dérivation vit à un seul endroit.
 *
 * ⚠️ Le seuil lui-même (`MIN_DISTINCT_SESSIONS_FOR_A_METRIC`) vit dans
 * `@bellum/contracts` et n'est PAS recopié ici (GA-26).
 */
export function withheldBelowThreshold(metric: string, distinctSubjects: number): WithheldMetric | null {
  if (hasEnoughSessionsToPublish(distinctSubjects)) return null
  return {
    kind: 'below_threshold',
    metric,
    subjects: Number.isFinite(distinctSubjects) ? distinctSubjects : 0,
    minSubjects: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
  }
}

/** Le quotient, ou l'absence NOMMÉE. La seule division de ce fichier. */
function rate(numerator: number, denominator: number): Rate {
  if (denominator <= 0) return { kind: 'unmeasured' }
  return { kind: 'measured', ratio: Math.round((numerator / denominator) * 100) / 100, over: denominator }
}

function publish<T>(sessions: number, build: () => T): PublishedMeasure<T> {
  if (!hasEnoughSessionsToPublish(sessions)) {
    return { kind: 'below_threshold', sessions, minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC }
  }
  return { kind: 'measured', sessions, value: build() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Le repli des lignes brutes
// ─────────────────────────────────────────────────────────────────────────────

/** Une ligne du flux comportemental, telle qu'elle sort de la base. */
export type BehavioralRow = {
  eventName: string
  sessionId: string
  occurredAt: Date
  properties: Record<string, unknown>
}

function readString(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(properties: Record<string, unknown>, key: string): number | null {
  const value = properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** `durationMs` est un nombre OU la chaîne `'over_30_min'` — jamais autre chose. */
function readDuration(properties: Record<string, unknown>, key: string): number | 'over_30_min' | null {
  const value = properties[key]
  if (value === 'over_30_min') return 'over_30_min'
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Le motif d'écran d'une ligne, ou `null`. C'est LA porte du repliement : rien
 * d'autre dans ce fichier ne lit `route` ou `screen` brut.
 */
function screenOf(row: BehavioralRow): ProductScreen | null {
  const raw = readString(row.properties, 'route') ?? readString(row.properties, 'screen')
  return raw === null ? null : resolveProductScreen(raw)
}

/** Les sessions, chacune dans l'ORDRE de ses événements. */
export function groupBySession(rows: readonly BehavioralRow[]): Map<string, BehavioralRow[]> {
  const sessions = new Map<string, BehavioralRow[]>()
  for (const row of rows) {
    const bucket = sessions.get(row.sessionId)
    if (bucket) bucket.push(row)
    else sessions.set(row.sessionId, [row])
  }
  for (const bucket of sessions.values()) {
    bucket.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  }
  return sessions
}

/**
 * La médiane d'une liste de durées dont certaines sont CENSURÉES à 30 minutes.
 * Les censurées sont les plus grandes par construction : elles vont en fin de
 * tri, et si l'élément médian est censuré, il n'y a pas de nombre à rendre.
 */
function medianDuration(durations: readonly (number | 'over_30_min')[]): MedianDuration {
  if (durations.length === 0) return { kind: 'unmeasured' }
  const numeric = durations.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b)
  const censored = durations.length - numeric.length
  const middle = Math.floor((durations.length - 1) / 2)
  if (middle >= numeric.length) return { kind: 'over_30_min' }
  // Effectif pair : la moyenne des deux du milieu — sauf si le second est
  // censuré, auquel cas on ne fabrique pas un nombre à partir d'une borne.
  const upperIndex = Math.floor(durations.length / 2)
  const lower = numeric[middle]
  if (lower === undefined) return { kind: 'unmeasured' }
  if (upperIndex >= numeric.length) return censored > 0 ? { kind: 'over_30_min' } : { kind: 'unmeasured' }
  const upper = numeric[upperIndex] ?? lower
  return { kind: 'measured', seconds: Math.round(((lower + upper) / 2 / 1000) * 10) / 10 }
}

/** Une vue d'écran reconstruite : son ouverture, sa fermeture, ce qu'elle a produit. */
type ReconstructedView = {
  route: string
  sessionId: string
  openedAt: number
  duration: number | 'over_30_min' | null
  leaveMode: string | null
  actions: number
  /** #2108.63/#2208.85 — l'instant de la PREMIÈRE `action_started` de cette
   *  vue, `null` tant qu'aucune n'a eu lieu. Sert à dériver le délai
   *  ouverture → première action SANS émettre de nouvel événement : les deux
   *  instants sont déjà journalisés. */
  firstActionAt: number | null
  /** #2130.69 — l'instant du PREMIER `tab_opened` de cette vue, `null` tant
   *  qu'aucune section n'a été ouverte. Même dérivation sans nouvel
   *  événement que {@link firstActionAt} : sert à mesurer « ouverture →
   *  compréhension » sur le dossier compte (voir
   *  {@link ProductAnalyticsReadService.accountSections}). */
  firstTabOpenedAt: number | null
  /** #2130.74 — la clé (`tab`) du PREMIER `tab_opened` de cette vue, posée au
   *  même instant que {@link firstTabOpenedAt} plutôt que recalculée à part.
   *  Sert à mesurer « Synthèse → action » (voir
   *  {@link ProductAnalyticsReadService.accountSections}) : seule cette
   *  mesure a besoin de savoir QUELLE section a été ouverte en premier, pas
   *  seulement quand. */
  firstTabKey: string | null
  /** L'écran ouvert JUSTE APRÈS, dans la même session. */
  nextRoute: string | null
}

/**
 * Le repli central : une session ordonnée devient une suite de VUES, chacune
 * sachant ce qui s'est passé pendant elle et ce qui l'a suivie.
 *
 * ⚠️ `action_completed` et `action_abandoned` ne portent PAS l'écran (le contrat
 * #1682 leur donne `{action, durationMs}` et `{action, atStep}`). Une action ne
 * peut donc être rattachée qu'à la vue COURANTE au moment où elle commence —
 * pas à celle où elle se termine. C'est une limite du contrat d'émission, pas un
 * raccourci : la corriger demanderait de changer `product-tracker.ts`, qui est
 * livré.
 */
export function reconstructViews(session: readonly BehavioralRow[]): ReconstructedView[] {
  const views: ReconstructedView[] = []
  let current: ReconstructedView | null = null

  for (const row of session) {
    if (row.eventName === 'screen_viewed') {
      const screen = screenOf(row)
      if (current) current.nextRoute = screen?.route ?? null
      if (!screen) {
        current = null
        continue
      }
      current = {
        route: screen.route,
        sessionId: row.sessionId,
        openedAt: row.occurredAt.getTime(),
        duration: null,
        leaveMode: null,
        actions: 0,
        firstActionAt: null,
        firstTabOpenedAt: null,
        firstTabKey: null,
        nextRoute: null,
      }
      views.push(current)
      continue
    }
    if (row.eventName === 'screen_left') {
      const screen = screenOf(row)
      // On ferme la vue courante seulement si c'est bien la sienne : un
      // `screen_left` orphelin (session tronquée par la borne de balayage) ne
      // doit pas clore la vue d'un autre écran.
      if (current && screen && current.route === screen.route) {
        current.duration = readDuration(row.properties, 'durationMs')
        current.leaveMode = readString(row.properties, 'leaveMode')
      }
      continue
    }
    if (row.eventName === 'action_started' && current) {
      current.actions += 1
      if (current.firstActionAt === null) current.firstActionAt = row.occurredAt.getTime()
    }
    if (row.eventName === 'tab_opened' && current && current.firstTabOpenedAt === null) {
      current.firstTabOpenedAt = row.occurredAt.getTime()
      current.firstTabKey = readString(row.properties, 'tab')
    }
  }
  return views
}

// ─────────────────────────────────────────────────────────────────────────────
// Le service
// ─────────────────────────────────────────────────────────────────────────────

type Scan = { rows: BehavioralRow[]; coverage: Coverage; families: ProductEventFamily[] }

@Injectable()
export class ProductAnalyticsReadService {
  constructor(
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
  ) {}

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.events.manager.query(sql, params) as Promise<T[]>
  }

  // ── #1683 — l'usage par écran ────────────────────────────────────────────

  async screens(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<RapportEcrans> {
    const scan = await this.scan(windowDaysInput)
    const sessions = groupBySession(scan.rows)

    type Bucket = {
      screen: ProductScreen
      views: number
      sessions: Set<string>
      durations: (number | 'over_30_min')[]
      closedViews: number
      bounces: number
      withAction: number
      /** #2108.63/#2208.85 — un délai par vue qui a eu au moins une action. */
      timeToFirstAction: (number | 'over_30_min')[]
    }
    const buckets = new Map<string, Bucket>()
    let unresolvedPaths = 0

    for (const row of scan.rows) {
      if (row.eventName !== 'screen_viewed') continue
      if (screenOf(row) === null) unresolvedPaths += 1
    }

    for (const session of sessions.values()) {
      for (const view of reconstructViews(session)) {
        const screen = resolveProductScreen(view.route)
        if (!screen) continue
        let bucket = buckets.get(screen.route)
        if (!bucket) {
          bucket = {
            screen,
            views: 0,
            sessions: new Set(),
            durations: [],
            closedViews: 0,
            bounces: 0,
            withAction: 0,
            timeToFirstAction: [],
          }
          buckets.set(screen.route, bucket)
        }
        bucket.views += 1
        bucket.sessions.add(view.sessionId)
        if (view.actions > 0) bucket.withAction += 1
        if (view.firstActionAt !== null) {
          const elapsed = view.firstActionAt - view.openedAt
          bucket.timeToFirstAction.push(elapsed >= TIME_TO_FIRST_ACTION_CAP_MS ? 'over_30_min' : elapsed)
        }
        if (view.duration === null) continue
        // Une vue jamais fermée est INCONNUE, pas un rebond : elle sort du
        // dénominateur plutôt que d'y entrer comme un succès ou un échec.
        bucket.durations.push(view.duration)
        bucket.closedViews += 1
        if (view.duration !== 'over_30_min' && view.duration < BOUNCE_MAX_DURATION_MS && view.actions === 0) {
          bucket.bounces += 1
        }
      }
    }

    const weeks = Math.max(scan.coverage.windowDays / 7, 1 / 7)
    const screens: ScreenUsage[] = [...buckets.values()]
      .map(bucket => ({
        route: bucket.screen.route,
        label: bucket.screen.label,
        nature: bucket.screen.nature,
        views: bucket.views,
        sessions: bucket.sessions.size,
        measures: hasEnoughSessionsToPublish(bucket.sessions.size)
          ? ({
              kind: 'measured',
              viewsPerWeek: Math.round((bucket.views / weeks) * 10) / 10,
              medianDuration: medianDuration(bucket.durations),
              bounceRate: rate(bucket.bounces, bucket.closedViews),
              actionRate: rate(bucket.withAction, bucket.views),
              medianTimeToFirstAction: medianDuration(bucket.timeToFirstAction),
            } as const)
          : ({ kind: 'below_threshold', minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC } as const),
      }))
      .sort((a, b) => b.views - a.views || a.route.localeCompare(b.route))

    return {
      generatedAt: new Date().toISOString(),
      coverage: scan.coverage,
      families: scan.families,
      distinctWorkspaces: { kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' },
      screens,
      unresolvedPaths,
      notes: [
        'Le flux comportemental ne porte AUCUN espace ni aucun utilisateur : `trackBehavioral()` écrit workspace_id et user_id à null inconditionnellement (doctrine c64_analytique_produit, règles 4 et 5). La colonne « espaces » demandée par #1683 n’est donc pas dérivable — elle est dite non dérivable, jamais rendue à 0.',
        `Aucune mesure n’est publiée sous ${MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions distinctes : la ligne existe, ses taux disent « below_threshold » avec le compte observé. « Pas encore de quoi en tirer une mesure » n’est pas « personne ne s’en sert ».`,
        'Un chemin réel est replié vers son MOTIF (/accounts/$id) avant tout comptage : aucun identifiant de compte n’entre dans cette lecture. Les chemins qu’aucun motif ne reconnaît sont comptés à part (unresolvedPaths), jamais rattachés à l’écran le plus ressemblant.',
        'Une vue jamais fermée (session tronquée, onglet toujours ouvert) sort du dénominateur du taux de rebond : elle n’est ni un rebond, ni le contraire.',
      ],
    }
  }

  // ── #2130.71 — les sections du dossier compte, par fréquence ─────────────

  /**
   * #2130.71 — `tab_opened` distingue déjà QUELLE section a été ouverte
   * (`AccountDetailTabsBar.tsx`, #2130.54) ; personne ne l'agrégeait avant ce
   * lot. Filtré sur le SEUL écran `/accounts/$id` : les autres fiches à
   * onglets (talent, mission…) émettent la même nature pour LEURS propres
   * sections, qui fausseraient ce classement si elles s'y mélangeaient.
   */
  async accountSections(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<RapportSectionsDossier> {
    const scan = await this.scan(windowDaysInput)

    const buckets = new Map<string, { opens: number; sessions: Set<string> }>()
    const openSessions = new Set<string>()
    // #2130.72 — nombre de corrections soumises sur le dossier compte.
    const correctionSessions = new Set<string>()
    let correctionsSubmitted = 0
    // #2130.75 — sessions qui ont engagé un contact recommandé.
    const contactSelectedSessions = new Set<string>()

    for (const row of scan.rows) {
      if (row.eventName === 'action_started') {
        if (
          readString(row.properties, 'screen') === ACCOUNT_DETAIL_SCREEN &&
          readString(row.properties, 'action') === CONTACT_SELECTED_ACTION
        ) {
          contactSelectedSessions.add(row.sessionId)
        }
        if (
          readString(row.properties, 'screen') === ACCOUNT_DETAIL_SCREEN &&
          readString(row.properties, 'action') === CORRECTION_SUBMITTED_ACTION
        ) {
          correctionSessions.add(row.sessionId)
          correctionsSubmitted += 1
        }
        continue
      }
      if (row.eventName !== 'tab_opened') continue
      if (readString(row.properties, 'screen') !== ACCOUNT_DETAIL_SCREEN) continue
      const tab = readString(row.properties, 'tab')
      if (!tab) continue
      openSessions.add(row.sessionId)
      let bucket = buckets.get(tab)
      if (!bucket) {
        bucket = { opens: 0, sessions: new Set() }
        buckets.set(tab, bucket)
      }
      bucket.opens += 1
      bucket.sessions.add(row.sessionId)
    }

    // #2130.69 — même balayage ORDONNÉ que `screens()`/`journeys()`, borné aux
    // vues du dossier compte : le délai jusqu'à la première section ouverte.
    const comprehensionDurations: (number | 'over_30_min')[] = []
    const comprehensionSessions = new Set<string>()
    // #2130.74 — parmi les vues dont la Synthèse est la PREMIÈRE section
    // ouverte, celles qui ont vu démarrer au moins une action.
    let synthesisViews = 0
    let synthesisViewsWithAction = 0
    const synthesisSessions = new Set<string>()
    for (const session of groupBySession(scan.rows).values()) {
      for (const view of reconstructViews(session)) {
        if (view.route !== ACCOUNT_DETAIL_SCREEN || view.firstTabOpenedAt === null) continue
        comprehensionSessions.add(view.sessionId)
        const elapsed = view.firstTabOpenedAt - view.openedAt
        comprehensionDurations.push(elapsed >= TIME_TO_FIRST_ACTION_CAP_MS ? 'over_30_min' : elapsed)

        if (view.firstTabKey !== null && SYNTHESIS_TABS.includes(view.firstTabKey)) {
          synthesisSessions.add(view.sessionId)
          synthesisViews += 1
          // « → action » : APRÈS la Synthèse, jamais une action qui aurait
          // précédé la toute première section ouverte de la vue.
          if (view.firstActionAt !== null && view.firstActionAt >= view.firstTabOpenedAt) {
            synthesisViewsWithAction += 1
          }
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      coverage: scan.coverage,
      families: scan.families,
      sections: isInstrumented(scan.families, 'tab_opened')
        ? publish(openSessions.size, () =>
            [...buckets.entries()]
              .map(([tab, bucket]) => ({ tab, opens: bucket.opens, sessions: bucket.sessions.size }))
              .sort((a, b) => b.opens - a.opens || a.tab.localeCompare(b.tab)),
          )
        : { kind: 'not_instrumented' },
      comprehension: isInstrumented(scan.families, 'tab_opened')
        ? publish(comprehensionSessions.size, () => ({
            medianTimeToComprehension: medianDuration(comprehensionDurations),
          }))
        : { kind: 'not_instrumented' },
      synthesisToAction:
        isInstrumented(scan.families, 'tab_opened') && isInstrumented(scan.families, 'action_started')
          ? publish(synthesisSessions.size, () => ({
              conversionRate: rate(synthesisViewsWithAction, synthesisViews),
            }))
          : { kind: 'not_instrumented' },
      corrections: isInstrumented(scan.families, 'action_started')
        ? publish(correctionSessions.size, () => ({ submitted: correctionsSubmitted }))
        : { kind: 'not_instrumented' },
      engagedContacts:
        isInstrumented(scan.families, 'tab_opened') && isInstrumented(scan.families, 'action_started')
          ? publish(openSessions.size, () => ({
              engagedRate: rate(
                [...openSessions].filter(id => contactSelectedSessions.has(id)).length,
                openSessions.size,
              ),
            }))
          : { kind: 'not_instrumented' },
      notes: [
        'Filtré sur le dossier compte (`/accounts/$id`) : les autres fiches à onglets (talent, mission…) émettent le même `tab_opened` pour leurs propres sections, qui n’entrent jamais dans ce classement.',
        'Le plancher de sessions distinctes porte sur l’ensemble des ouvertures de section (toutes sections confondues) : sous le seuil, aucune ligne ne publie — jamais un classement partiel.',
        '#2130.69 — « compréhension » n’a pas d’événement dédié : elle se lit comme le délai jusqu’à la PREMIÈRE section ouverte (`tab_opened`), le premier signe observable d’exploration plutôt qu’un jalon inventé. Plancher de sessions distinctes séparé de celui de `sections` (une vue peut fermer sans jamais ouvrir de section).',
        '#2130.74 — « Synthèse → action » se lit sur les vues dont la PREMIÈRE section ouverte est la Synthèse (`overview`/`evaluation`) : le dénominateur exclut les vues entrées directement par une autre section (Contacts, Partenaires…), qui ne mesurent pas ce même parcours.',
        '#2130.72 — « corrections » compte le geste `correction_submitted` (`EntityResolutionPanel.tsx`), distinct de `record_field_audit` (l’audit CRM par champ, qui porte un espace et un acteur) : ce flux-ci n’en porte jamais, comme le reste de ce rapport.',
        '#2130.75 — « contacts engagés » se lit par SESSION (part des sessions du dossier qui ont engagé au moins un contact recommandé) : ce flux ne porte ni identifiant de contact ni d’utilisateur (c64), aucune jointure par contact n’est possible ni cherchée.',
      ],
    }
  }

  // ── #1684 — sorties, parcours, parcours interrompus ──────────────────────

  async journeys(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<RapportParcours> {
    const scan = await this.scan(windowDaysInput)
    const sessions = groupBySession(scan.rows)

    type ExitBucket = {
      screen: ProductScreen
      exits: number
      sessions: Set<string>
      destinations: Map<string, number>
      closes: number
      idles: number
    }
    const exits = new Map<string, ExitBucket>()
    const sequenceSessions = new Map<string, Set<string>>()
    const sequenceRoutes = new Map<string, string[]>()

    for (const [sessionId, session] of sessions) {
      const views = reconstructViews(session)
      for (const view of views) {
        if (view.leaveMode === null) continue
        const screen = resolveProductScreen(view.route)
        if (!screen) continue
        let bucket = exits.get(screen.route)
        if (!bucket) {
          bucket = { screen, exits: 0, sessions: new Set(), destinations: new Map(), closes: 0, idles: 0 }
          exits.set(screen.route, bucket)
        }
        bucket.exits += 1
        bucket.sessions.add(sessionId)
        if (view.leaveMode === 'fermeture') bucket.closes += 1
        else if (view.leaveMode === 'inactivite') bucket.idles += 1
        else if (view.nextRoute)
          bucket.destinations.set(view.nextRoute, (bucket.destinations.get(view.nextRoute) ?? 0) + 1)
      }

      // Les parcours : la suite des écrans ouverts, sans les répétitions
      // immédiates (revenir sur le même écran n'est pas un pas de parcours).
      const path: string[] = []
      for (const view of views) {
        if (path[path.length - 1] !== view.route) path.push(view.route)
      }
      for (let index = 0; index + SEQUENCE_LENGTH <= path.length; index += 1) {
        const window = path.slice(index, index + SEQUENCE_LENGTH)
        const key = window.join(' → ')
        sequenceRoutes.set(key, window)
        const seen = sequenceSessions.get(key)
        if (seen) seen.add(sessionId)
        else sequenceSessions.set(key, new Set([sessionId]))
      }
    }

    const exitSessions = new Set<string>()
    for (const bucket of exits.values()) for (const id of bucket.sessions) exitSessions.add(id)

    const sequenceSessionIds = new Set<string>()
    for (const seen of sequenceSessions.values()) for (const id of seen) sequenceSessionIds.add(id)

    return {
      generatedAt: new Date().toISOString(),
      coverage: scan.coverage,
      families: scan.families,
      exits: publish(exitSessions.size, () =>
        [...exits.values()]
          .map(bucket => this.toScreenExit(bucket))
          .sort((a, b) => b.exits - a.exits || a.route.localeCompare(b.route))
          .slice(0, TOP_N),
      ),
      sequences: publish(sequenceSessionIds.size, () =>
        [...sequenceSessions.entries()]
          // #1684.4 — un parcours ne s'affiche qu'à partir du seuil de sessions
          // DISTINCTES. Sous ce seuil, il n'est pas « rare » : il désigne
          // quelqu'un.
          .filter(([, seen]) => hasEnoughSessionsToPublish(seen.size))
          .map(([key, seen]) => {
            const routes = sequenceRoutes.get(key) ?? []
            return {
              routes,
              labels: routes.map(route => resolveProductScreen(route)?.label ?? { fr: route, en: route }),
              sessions: seen.size,
            }
          })
          .sort((a, b) => b.sessions - a.sessions || a.routes.join().localeCompare(b.routes.join()))
          .slice(0, TOP_N),
      ),
      interrupted: this.interruptedActions(sessions, scan.families),
      onboardingQuestionAbandonment: onboardingQuestionAbandonment(sessions, scan.families),
      notes: [
        'Une destination de sortie est l’écran ouvert JUSTE APRÈS, dans la même session. Une sortie par fermeture ou par inactivité n’a pas de destination : elle est comptée dans sa propre part, jamais rangée sous une destination inventée.',
        `Un parcours ne s’affiche qu’à partir de ${MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions DISTINCTES — jamais d’occurrences : une session qui boucle dix fois ne fait pas dix parcours.`,
        'Un parcours interrompu est une action commencée sans action_completed ni action_abandoned ensuite, DANS LA MÊME SESSION. Le rattachement se fait par le nom de l’action seul : le contrat d’émission #1682 ne met pas l’écran sur action_completed ni sur action_abandoned.',
        '#2085.16 — l’abandon par question lit le CHEMIN RÉEL des sous-étapes d’onboarding, jamais le motif replié (`/onboarding/$id/$stage/$slug`) : une question n’est pas un écran, et le slug est un identifiant STATIQUE de question, jamais une donnée utilisateur. Chaque question reste soumise au même plancher de sessions distinctes que le reste de ce rapport (GA-267) — une ligne EXISTE toujours pour une question vue, `below_threshold` la nomme plutôt que de la taire.',
        '#2022.8 — la REPRISE d’une question se compte sur les seules sessions qui l’avaient abandonnée : `resumeRate` a pour dénominateur `abandonedSessions`, jamais le nombre de vues, et il vaut « non mesuré » quand personne n’a abandonné — jamais 0 %. ⚠️ Elle se mesure DANS UNE SESSION : l’identifiant est un hash de session tourné à 24 h, donc « parti lundi, revenu mercredi » n’est pas mesurable ici, par construction.',
      ],
    }
  }

  private toScreenExit(bucket: {
    screen: ProductScreen
    exits: number
    sessions: Set<string>
    destinations: Map<string, number>
    closes: number
    idles: number
  }): ScreenExit {
    return {
      route: bucket.screen.route,
      label: bucket.screen.label,
      exits: bucket.exits,
      sessions: bucket.sessions.size,
      detail: hasEnoughSessionsToPublish(bucket.sessions.size)
        ? {
            kind: 'measured',
            destinations: [...bucket.destinations.entries()]
              .map(([route, exits]) => ({
                route,
                label: resolveProductScreen(route)?.label ?? { fr: route, en: route },
                exits,
              }))
              .sort((a, b) => b.exits - a.exits || a.route.localeCompare(b.route))
              .slice(0, TOP_N),
            closeRate: rate(bucket.closes, bucket.exits),
            idleRate: rate(bucket.idles, bucket.exits),
          }
        : { kind: 'below_threshold', minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC },
    }
  }

  /** #1684.3 — commencé, jamais fini, jamais abandonné. */
  private interruptedActions(
    sessions: ReadonlyMap<string, BehavioralRow[]>,
    families: readonly ProductEventFamily[],
  ): { kind: 'not_instrumented' } | PublishedMeasure<InterruptedAction[]> {
    if (!isInstrumented(families, 'action_started')) return { kind: 'not_instrumented' }

    const started = new Map<string, Set<string>>()
    const interrupted = new Map<string, Set<string>>()
    const seenSessions = new Set<string>()

    for (const [sessionId, session] of sessions) {
      /** Les actions EN COURS de cette session, par nom. */
      const open = new Set<string>()
      for (const row of session) {
        const action = readString(row.properties, 'action')
        if (action === null) continue
        if (row.eventName === 'action_started') {
          open.add(action)
          addTo(started, action, sessionId)
          seenSessions.add(sessionId)
          continue
        }
        if (row.eventName === 'action_completed' || row.eventName === 'action_abandoned') open.delete(action)
      }
      for (const action of open) addTo(interrupted, action, sessionId)
    }

    return publish(seenSessions.size, () =>
      [...started.entries()]
        .map(([action, startedIn]) => {
          const interruptedIn = interrupted.get(action)?.size ?? 0
          return {
            action,
            sessions: interruptedIn,
            startedSessions: startedIn.size,
            interruptionRate: rate(interruptedIn, startedIn.size),
          }
        })
        .filter(row => row.sessions > 0)
        .sort((a, b) => b.sessions - a.sessions || a.action.localeCompare(b.action))
        .slice(0, TOP_N),
    )
  }

  // ── #1687 — la friction ──────────────────────────────────────────────────

  async friction(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<RapportFriction> {
    const scan = await this.scan(windowDaysInput)
    const sessions = groupBySession(scan.rows)

    const repetitions = new Map<string, Set<string>>()
    const roundTrips = new Map<string, { from: string; to: string; sessions: Set<string> }>()
    const errors = new Map<string, { route: string; errorCode: string; occurrences: number; sessions: Set<string> }>()
    const actionSessions = new Set<string>()
    const viewSessions = new Set<string>()
    const errorSessions = new Set<string>()

    for (const [sessionId, session] of sessions) {
      /** Les instants de départ de chaque action, dans l'ordre. */
      const starts = new Map<string, number[]>()
      /** Les ouvertures d'écran, dans l'ordre : (motif, instant). */
      const opens: Array<{ route: string; at: number }> = []

      for (const row of session) {
        const at = row.occurredAt.getTime()
        if (row.eventName === 'action_started') {
          const action = readString(row.properties, 'action')
          if (action === null) continue
          actionSessions.add(sessionId)
          const list = starts.get(action)
          if (list) list.push(at)
          else starts.set(action, [at])
          continue
        }
        if (row.eventName === 'screen_viewed') {
          const screen = screenOf(row)
          if (!screen) continue
          viewSessions.add(sessionId)
          opens.push({ route: screen.route, at })
          continue
        }
        if (row.eventName === 'error_shown') {
          const screen = screenOf(row)
          const errorCode = readString(row.properties, 'errorCode')
          if (!screen || errorCode === null) continue
          errorSessions.add(sessionId)
          const key = `${screen.route}::${errorCode}`
          const bucket = errors.get(key)
          if (bucket) {
            bucket.occurrences += 1
            bucket.sessions.add(sessionId)
          } else {
            errors.set(key, { route: screen.route, errorCode, occurrences: 1, sessions: new Set([sessionId]) })
          }
        }
      }

      // #1687.1 — la même action au moins 3 fois en moins de 30 s. Fenêtre
      // GLISSANTE : trois départs consécutifs suffisent, il n'y a pas à
      // découper le temps en tranches (deux tranches couperaient la répétition
      // en deux et la rendraient invisible).
      for (const [action, times] of starts) {
        for (let index = 0; index + REPETITION_MIN_OCCURRENCES - 1 < times.length; index += 1) {
          const first = times[index]
          const last = times[index + REPETITION_MIN_OCCURRENCES - 1]
          if (first === undefined || last === undefined) continue
          if (last - first < REPETITION_WINDOW_MS) {
            addTo(repetitions, action, sessionId)
            break
          }
        }
      }

      // #1687.2 — A → B → A en moins de 20 s.
      for (let index = 0; index + 2 < opens.length; index += 1) {
        const first = opens[index]
        const middle = opens[index + 1]
        const back = opens[index + 2]
        if (!first || !middle || !back) continue
        if (first.route !== back.route || first.route === middle.route) continue
        if (back.at - first.at >= ROUND_TRIP_WINDOW_MS) continue
        const key = `${first.route}::${middle.route}`
        const bucket = roundTrips.get(key)
        if (bucket) bucket.sessions.add(sessionId)
        else roundTrips.set(key, { from: first.route, to: middle.route, sessions: new Set([sessionId]) })
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      coverage: scan.coverage,
      families: scan.families,
      repetitions: isInstrumented(scan.families, 'action_started')
        ? publish(actionSessions.size, () =>
            [...repetitions.entries()]
              .map(([action, seen]) => ({ action, sessions: seen.size }))
              .sort((a, b) => b.sessions - a.sessions || a.action.localeCompare(b.action))
              .slice(0, TOP_N),
          )
        : { kind: 'not_instrumented' },
      roundTrips: publish(viewSessions.size, () =>
        [...roundTrips.values()]
          .map(bucket => ({
            from: bucket.from,
            to: bucket.to,
            fromLabel: resolveProductScreen(bucket.from)?.label ?? { fr: bucket.from, en: bucket.from },
            toLabel: resolveProductScreen(bucket.to)?.label ?? { fr: bucket.to, en: bucket.to },
            sessions: bucket.sessions.size,
          }))
          .sort((a, b) => b.sessions - a.sessions || a.from.localeCompare(b.from))
          .slice(0, TOP_N),
      ),
      errors: isInstrumented(scan.families, 'error_shown')
        ? publish(errorSessions.size, () =>
            [...errors.values()]
              .map(bucket => ({
                route: bucket.route,
                label: resolveProductScreen(bucket.route)?.label ?? { fr: bucket.route, en: bucket.route },
                errorCode: bucket.errorCode,
                occurrences: bucket.occurrences,
                sessions: bucket.sessions.size,
              }))
              .sort((a, b) => b.occurrences - a.occurrences || a.route.localeCompare(b.route))
              .slice(0, TOP_N),
          )
        : { kind: 'not_instrumented' },
      notes: [
        `Répétition = la même action au moins ${REPETITION_MIN_OCCURRENCES} fois en moins de ${REPETITION_WINDOW_MS / 1000} s dans une session, sur une fenêtre GLISSANTE.`,
        `Aller-retour = A → B → A en moins de ${ROUND_TRIP_WINDOW_MS / 1000} s.`,
        'Aucune coordonnée de clic n’entre ici, et il n’y en a pas à exclure : le traceur n’en émet structurellement aucune (#1682, union fermée gardée par GA-264). Ce tableau n’est donc pas un « rage-click » au sens du marché.',
        'Les erreurs sont rendues PAR CODE : l’exclusion des erreurs de CAPACITÉ (503 scope_missing — « ce n’est pas branché », pas une friction) reste à décider avec la liste des codes concernés (#1687.4). Ce service ne devine pas cette liste.',
      ],
    }
  }

  // ── #1688 — la demande, côté recherches vides ────────────────────────────

  async demand(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<RapportDemande> {
    const scan = await this.scan(windowDaysInput)

    const buckets = new Map<string, { screen: ProductScreen; searches: number; empty: number; sessions: Set<string> }>()
    const searchSessions = new Set<string>()

    for (const row of scan.rows) {
      if (row.eventName !== 'search_performed') continue
      const screen = screenOf(row)
      const resultCount = readNumber(row.properties, 'resultCount')
      if (!screen || resultCount === null) continue
      searchSessions.add(row.sessionId)
      let bucket = buckets.get(screen.route)
      if (!bucket) {
        bucket = { screen, searches: 0, empty: 0, sessions: new Set() }
        buckets.set(screen.route, bucket)
      }
      bucket.searches += 1
      bucket.sessions.add(row.sessionId)
      if (resultCount === 0) bucket.empty += 1
    }

    return {
      generatedAt: new Date().toISOString(),
      coverage: scan.coverage,
      families: scan.families,
      emptySearches: isInstrumented(scan.families, 'search_performed')
        ? publish(searchSessions.size, () =>
            [...buckets.values()]
              .map(bucket => ({
                route: bucket.screen.route,
                label: bucket.screen.label,
                searches: bucket.searches,
                emptySearches: bucket.empty,
                sessions: bucket.sessions.size,
                emptyRate: rate(bucket.empty, bucket.searches),
              }))
              .filter(row => row.emptySearches > 0)
              .sort((a, b) => b.emptySearches - a.emptySearches || a.route.localeCompare(b.route))
              .slice(0, TOP_N),
          )
        : { kind: 'not_instrumented' },
      notes: [
        'On compte le NOMBRE de recherches sans résultat, jamais le texte cherché — et ce n’est pas une discipline de requête : `search_performed` n’a structurellement aucun paramètre de texte (#1682, `trackSearchPerformed(screen, resultCount)`).',
      ],
    }
  }

  // ── #1946 — la valeur : ce qu'un geste a PRODUIT ─────────────────────────

  /**
   * #1946 — les six blocs, un seul balayage. Chaque bloc porte SON plancher de
   * sessions distinctes : un espace qui n'a que trois sessions ayant jugé une
   * réponse ne publie pas son taux d'utilité, même si le reste du rapport
   * publie (règle 1, `hasEnoughSessionsToPublish`, seuil dans `@bellum/contracts`).
   */
  async valeur(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<RapportValeur> {
    const scan = await this.scan(windowDaysInput)

    const sessionsOf = new Map<string, Set<string>>()
    const counts = new Map<string, number>()
    const bump = (key: string): void => {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const usefulDelays: (number | 'over_30_min')[] = []
    const chains = new Map<
      string,
      {
        prepared: number
        validated: number
        executed: number
        corrected: number
        abandoned: number
        sessions: Set<string>
      }
    >()

    for (const row of scan.rows) {
      addTo(sessionsOf, row.eventName, row.sessionId)
      switch (row.eventName) {
        case 'assistant_answer_judged': {
          const verdict = readString(row.properties, 'verdict')
          bump('judged')
          if (verdict !== null) bump(`verdict:${verdict}`)
          break
        }
        case 'assistant_first_useful_result': {
          const delay = readDuration(row.properties, 'durationMs')
          if (delay !== null) usefulDelays.push(delay)
          break
        }
        case 'draft_reused': {
          const extent = readString(row.properties, 'extent')
          bump('reused')
          if (extent !== null) bump(`extent:${extent}`)
          break
        }
        case 'prepared_action_stage': {
          const action = readString(row.properties, 'action')
          const stage = readString(row.properties, 'stage')
          if (action === null || stage === null) break
          let chain = chains.get(action)
          if (!chain) {
            chain = { prepared: 0, validated: 0, executed: 0, corrected: 0, abandoned: 0, sessions: new Set() }
            chains.set(action, chain)
          }
          if (stage === 'preparee') {
            chain.prepared += 1
            chain.sessions.add(row.sessionId)
          }
          if (stage === 'validee') chain.validated += 1
          if (stage === 'executee') chain.executed += 1
          if (stage === 'corrigee') chain.corrected += 1
          if (stage === 'abandonnee') chain.abandoned += 1
          break
        }
        case 'intervention_outcome': {
          const outcome = readString(row.properties, 'outcome')
          bump('interventions')
          if (outcome === 'ignoree') bump('interventions_ignored')
          break
        }
        case 'priority_viewed':
        case 'priority_accepted':
        case 'priority_snoozed':
        case 'priority_rejected':
        case 'priority_corrected':
          bump(row.eventName)
          break
        case 'suggestion_clicked':
          bump('suggestion_clicks')
          break
        case 'assistant_redirect_followed':
          bump('redirects')
          break
        case 'memory_added':
          bump('memories')
          break
        default:
          break
      }
    }

    const distinct = (event: string): number => sessionsOf.get(event)?.size ?? 0
    const count = (key: string): number => counts.get(key) ?? 0
    // #2130.73 — un verdict INEXISTANT (hors `ReplyFeedbackVerdict`, le type
    // que `ReplyFeedback.tsx` — le seul appelant — écrit réellement) devient
    // une erreur de TYPAGE ici, jamais un `false` muet comme les littéraux
    // `'generique'`/`'inexacte'` qui ne correspondaient à AUCUN écrivain.
    const countVerdict = (verdict: ReplyFeedbackVerdict): number => count(`verdict:${verdict}`)
    const judged = count('judged')
    const reused = count('reused')
    const interventions = count('interventions')

    // Les suites sont QUATRE natures : « rien ne le mesure » ne se dit que si
    // aucune des quatre n'a jamais été écrite, et le plancher porte sur les
    // sessions distinctes de l'ensemble — pas sur celles de la plus rare.
    const suiteEvents = ['suggestion_clicked', 'assistant_redirect_followed', 'intervention_outcome', 'memory_added']
    const suiteSessions = new Set<string>()
    for (const event of suiteEvents) for (const id of sessionsOf.get(event) ?? []) suiteSessions.add(id)

    return {
      generatedAt: new Date().toISOString(),
      coverage: scan.coverage,
      families: scan.families,
      amorce: isInstrumented(scan.families, 'assistant_first_question_sent')
        ? publish(distinct('assistant_first_question_sent'), () => ({
            firstQuestionSessions: distinct('assistant_first_question_sent'),
            firstUsefulResultSessions: distinct('assistant_first_useful_result'),
            usefulRate: rate(distinct('assistant_first_useful_result'), distinct('assistant_first_question_sent')),
            medianTimeToUseful: medianDuration(usefulDelays),
          }))
        : { kind: 'not_instrumented' },
      reponses: isInstrumented(scan.families, 'assistant_answer_judged')
        ? publish(distinct('assistant_answer_judged'), () => ({
            judged,
            utileRate: rate(countVerdict('utile'), judged),
            // #2130.73 — c'étaient `'generique'`/`'inexacte'`, deux valeurs
            // qu'aucun écrivain ne pose (`ReplyFeedback.tsx` écrit
            // `pas_pertinent`/`donnee_fausse` — voir `REPLY_FEEDBACK_VERDICTS`,
            // `@bellum/contracts`) : le prédicat comparait à un vocabulaire
            // mort et rendait 0 % en silence, sans jamais lever d'erreur.
            generiqueRate: rate(countVerdict('pas_pertinent'), judged),
            inexacteRate: rate(countVerdict('donnee_fausse'), judged),
            // D10 — décision Louis 14/09/2026 : les trois verdicts ajoutés à la
            // fin, dans leur propre case — jamais rangés de force, jamais ignorés.
            dejaFaitRate: rate(countVerdict('deja_fait'), judged),
            pasMaintenantRate: rate(countVerdict('pas_maintenant'), judged),
            mauvaisePrioriteRate: rate(countVerdict('mauvaise_priorite'), judged),
          }))
        : { kind: 'not_instrumented' },
      brouillons: isInstrumented(scan.families, 'draft_reused')
        ? publish(distinct('draft_reused'), () => ({
            reused,
            telQuelRate: rate(count('extent:tel_quel'), reused),
            retoucheRate: rate(count('extent:retouche'), reused),
            reecritRate: rate(count('extent:reecrit'), reused),
          }))
        : { kind: 'not_instrumented' },
      priorites: isInstrumented(scan.families, 'priority_viewed')
        ? publish(distinct('priority_viewed'), () => ({
            viewed: count('priority_viewed'),
            accepted: count('priority_accepted'),
            snoozed: count('priority_snoozed'),
            rejected: count('priority_rejected'),
            corrected: count('priority_corrected'),
            treatedRate: rate(count('priority_accepted'), count('priority_viewed')),
            refusalRate: rate(count('priority_rejected'), count('priority_viewed')),
          }))
        : { kind: 'not_instrumented' },
      actions: isInstrumented(scan.families, 'prepared_action_stage')
        ? publish(distinct('prepared_action_stage'), () =>
            [...chains.entries()]
              .map(([action, chain]) => ({
                action,
                prepared: chain.prepared,
                validated: chain.validated,
                executed: chain.executed,
                corrected: chain.corrected,
                abandoned: chain.abandoned,
                sessions: chain.sessions.size,
                executionRate: rate(chain.executed, chain.prepared),
                correctionRate: rate(chain.corrected, chain.executed),
              }))
              .sort((a, b) => b.prepared - a.prepared || a.action.localeCompare(b.action))
              .slice(0, TOP_N),
          )
        : { kind: 'not_instrumented' },
      suites: suiteEvents.some(event => isInstrumented(scan.families, event))
        ? publish(suiteSessions.size, () => ({
            suggestionClicks: count('suggestion_clicks'),
            redirectsFollowed: count('redirects'),
            interventions,
            interventionIgnoredRate: rate(count('interventions_ignored'), interventions),
            memoriesAdded: count('memories'),
          }))
        : { kind: 'not_instrumented' },
      resultatMetier: { kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' },
      notes: [
        'Aucun bloc ne compte des MESSAGES : le traceur n’émet qu’un seul événement pour la première question d’une session et rien pour les suivantes (#1946.17). Le volume de messages n’est pas retenu ici, il est INDISPONIBLE.',
        'Le seul délai du rapport mesure le temps jusqu’au premier résultat jugé UTILE (#1946.3) — pas le temps passé dans le produit (#1946.18), qui n’est pas une valeur.',
        'Le « résultat métier » (#1946.26) n’est pas dérivable de ce flux : il appartient à un compte dans un espace nommé, et ce flux n’écrit aucun espace (règle 5 de c64_analytique_produit). L’absence est nommée, jamais chiffrée à zéro.',
        'Un verdict, une étape, un degré de réécriture — jamais le texte jugé, réécrit ou envoyé : la liste blanche de `sanitizeBehavioralProperties` n’a aucune clé où en glisser un (GA-264).',
      ],
    }
  }

  // ── Le balayage ──────────────────────────────────────────────────────────

  /**
   * `-- q:behavioral` — les lignes du flux comportemental sur la fenêtre, les
   * plus RÉCENTES d'abord, bornées. Le tri final se fait en mémoire, par session
   * puis par instant.
   *
   * ⚠️ `session_id IS NOT NULL` n'est pas une précaution de style : c'est ce qui
   * sépare les deux flux qui cohabitent dans `product_events`. Une ligne d'AUDIT
   * porte un `user_id` et pas de session ; une ligne comportementale l'inverse.
   */
  private async scan(windowDaysInput: number): Promise<Scan> {
    const windowDays = clampWindow(windowDaysInput)
    const [rows, families] = await Promise.all([
      this.query<{ eventName: string; sessionId: string; occurredAt: Date | string; properties: unknown }>(
        `-- q:behavioral
         SELECT event_name AS "eventName", session_id AS "sessionId",
                occurred_at AS "occurredAt", properties AS "properties"
         FROM product_events
         WHERE event_name = ANY($1::text[])
           AND session_id IS NOT NULL
           AND occurred_at >= now() - make_interval(days => $2)
         ORDER BY occurred_at DESC
         LIMIT ${MAX_EVENTS_SCANNED}`,
        [[...BEHAVIORAL_EVENT_NAMES], windowDays],
      ),
      this.instrumentedFamilies(),
    ])

    const parsed: BehavioralRow[] = rows.map(row => ({
      eventName: row.eventName,
      sessionId: row.sessionId,
      occurredAt: new Date(row.occurredAt),
      properties:
        row.properties && typeof row.properties === 'object' ? (row.properties as Record<string, unknown>) : {},
    }))

    let oldest: number | null = null
    for (const row of parsed) {
      const at = row.occurredAt.getTime()
      if (!Number.isNaN(at) && (oldest === null || at < oldest)) oldest = at
    }

    return {
      rows: parsed,
      coverage: {
        windowDays,
        complete: parsed.length < MAX_EVENTS_SCANNED,
        eventsScanned: parsed.length,
        maxEventsScanned: MAX_EVENTS_SCANNED,
        oldestEventAt: oldest === null ? null : new Date(oldest).toISOString(),
      },
      families,
    }
  }

  /**
   * `-- q:families` — quelles natures d'événement ont DÉJÀ été écrites, tous
   * horizons confondus. Sans cette question, un « 0 » ne se distingue pas d'un
   * « rien ne le mesure » — et sept des neuf émetteurs du traceur n'ont
   * aujourd'hui aucun appelant de production.
   */
  private async instrumentedFamilies(): Promise<ProductEventFamily[]> {
    const rows = await this.query<{ eventName: string }>(
      `-- q:families
       SELECT DISTINCT event_name AS "eventName"
       FROM product_events
       WHERE event_name = ANY($1::text[])
         AND session_id IS NOT NULL`,
      [[...BEHAVIORAL_EVENT_NAMES]],
    )
    const seen = new Set(rows.map(row => row.eventName))
    return BEHAVIORAL_EVENT_NAMES.map(event => ({ event, instrumented: seen.has(event) }))
  }
}

function isInstrumented(families: readonly ProductEventFamily[], event: string): boolean {
  return families.some(family => family.event === event && family.instrumented)
}

function addTo(index: Map<string, Set<string>>, key: string, value: string): void {
  const bucket = index.get(key)
  if (bucket) bucket.add(value)
  else index.set(key, new Set([value]))
}

/** Trois segments après `/onboarding/` (id, étape, slug) — le motif RÉEL,
 *  jamais le motif replié du catalogue. Capture le SLUG (dernier segment) : un
 *  identifiant statique de question, pas une donnée utilisateur. */
const ONBOARDING_SUBSTEP_ROUTE = /^\/onboarding\/[^/]+\/[^/]+\/([^/]+)$/

/**
 * #2085.16 — l'abandon PAR QUESTION du questionnaire d'onboarding. Lit les
 * chemins RÉELS (jamais repliés par `resolveProductScreen`, voir le
 * commentaire de {@link ONBOARDING_SUBSTEP_ROUTE}) : une question abandonnée
 * n'est pas un écran abandonné, et confondre les deux noierait la friction
 * réelle dans la moyenne de tout le questionnaire.
 *
 * Une session « abandonne » une question quand la DERNIÈRE fermeture de vue
 * qu'elle y ouvre est une fermeture ou une inactivité — jamais une navigation
 * (`leaveMode: 'nav'`), en avant comme en arrière (`#2085.17`,
 * `onboarding_step_back`, la porte déjà séparément).
 *
 * #2022.8 — et elle la REPREND quand elle la rouvre APRÈS l'avoir abandonnée.
 * Le point demandait « taux de reprise ET abandons par question » : l'abandon
 * était là depuis #2085.16, la reprise manquait. Aucun événement neuf n'a été
 * ajouté pour elle — le corpus disait déjà tout, il n'était pas lu jusqu'au
 * bout ; élargir l'union fermée du traceur aurait été une décision de Louis,
 * pas une lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN CONFLIT DE RÈGLES, TRANCHÉ LE 16/09/2026 — NE PAS LE RE-TRANCHER À L'ENVERS
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux intentions justes s'opposaient ici, et la première version publiait son
 * enveloppe sans condition (`{ kind: 'measured', rows }`) :
 *  • GA-267 / règle 1 de `c64_analytique_produit` — « aucune métrique sous
 *    {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions distinctes », parce que
 *    sous ce seuil une moyenne DÉSIGNE quelqu'un ;
 *  • « ne pas TAIRE une question qui a été vue » — une question vue par une
 *    session doit se distinguer d'une question jamais ouverte.
 *
 * GA-267 gagne : c'est de la doctrine écrite, la relecture juridique RGPD de
 * `c64_analytique_produit` est ENCORE due, et la direction conservatrice
 * n'expose jamais PLUS que l'autre. La conséquence est ASSUMÉE et elle
 * s'écrit : **sous le plancher, le détail par question ne sort plus du tout —
 * l'enveloppe dit `below_threshold`, elle ne dit pas « zéro »**. L'intention
 * « ne pas taire une question vue » ne disparaît pas, elle remonte d'un cran :
 * AU-DESSUS du plancher, une question vue par une poignée de sessions reste
 * dans la liste, avec son détail retenu.
 *
 * ⚠️ Le dénominateur de l'enveloppe est le nombre de sessions DISTINCTES ayant
 * vu au moins UNE question d'onboarding — jamais le nombre total de sessions du
 * flux : compter tout le produit gonflerait le dénominateur et ferait passer le
 * plancher alors que la question n'a été vue par personne.
 */
export function onboardingQuestionAbandonment(
  sessions: ReadonlyMap<string, BehavioralRow[]>,
  families: readonly ProductEventFamily[],
): { kind: 'not_instrumented' } | PublishedMeasure<OnboardingQuestionAbandonment[]> {
  if (!isInstrumented(families, 'screen_viewed')) return { kind: 'not_instrumented' }

  const viewedBy = new Map<string, Set<string>>()
  const abandonedBy = new Map<string, Set<string>>()
  /**
   * #2022.8 — LA REPRISE : les sessions qui, APRÈS avoir abandonné une
   * question, l'ont rouverte. Un sous-ensemble strict d'`abandonedBy`.
   *
   * ⚠️ La reprise se mesure DANS UNE SESSION, et ce n'est pas un raccourci :
   * l'identifiant est un hash de SESSION tourné à 24 h, sans identité
   * (`c64_analytique_produit`, règle 4). « Il a abandonné lundi et il est
   * revenu mercredi » n'est donc PAS mesurable ici, par construction, et rien
   * ne doit le faire croire — c'est pour ça que ce commentaire existe plutôt
   * qu'un nom de champ qui promettrait plus.
   */
  const resumedBy = new Map<string, Set<string>>()
  /** Les sessions qui ont vu AU MOINS UNE question — le dénominateur du
   *  plancher, voir le ⚠️ ci-dessus. */
  const sessionsOnTheQuestionnaire = new Set<string>()

  for (const [sessionId, session] of sessions) {
    let openSlug: string | null = null
    // #2022.8 — les questions que CETTE session a déjà abandonnées. Rouvrir
    // l'une d'elles est une reprise ; ouvrir n'importe quelle autre question ne
    // l'est pas (revenir sur le questionnaire ≠ revenir sur CE qui a bloqué).
    const abandonedHere = new Set<string>()
    for (const row of session) {
      if (row.eventName === 'screen_viewed') {
        const raw = readString(row.properties, 'route')
        const slug = raw ? ONBOARDING_SUBSTEP_ROUTE.exec(raw)?.[1] : null
        openSlug = slug ?? null
        if (slug) {
          addTo(viewedBy, slug, sessionId)
          sessionsOnTheQuestionnaire.add(sessionId)
          // #2022.8 — la reprise se compte à la RÉOUVERTURE, pas à la sortie :
          // c'est le geste qui prouve qu'on est revenu.
          if (abandonedHere.has(slug)) addTo(resumedBy, slug, sessionId)
        }
        continue
      }
      if (row.eventName === 'screen_left') {
        const raw = readString(row.properties, 'route')
        const slug = raw ? ONBOARDING_SUBSTEP_ROUTE.exec(raw)?.[1] : null
        const leaveMode = readString(row.properties, 'leaveMode')
        if (slug && slug === openSlug && (leaveMode === 'fermeture' || leaveMode === 'inactivite')) {
          addTo(abandonedBy, slug, sessionId)
          abandonedHere.add(slug)
        }
        openSlug = null
      }
    }
  }

  return publish(sessionsOnTheQuestionnaire.size, () =>
    [...viewedBy.entries()]
      .map(([slug, viewed]) => {
        const abandoned = abandonedBy.get(slug)?.size ?? 0
        const resumed = resumedBy.get(slug)?.size ?? 0
        return {
          slug,
          sessions: viewed.size,
          detail: hasEnoughSessionsToPublish(viewed.size)
            ? ({
                kind: 'measured',
                abandonedSessions: abandoned,
                abandonRate: rate(abandoned, viewed.size),
                // #2022.8 — le dénominateur de la REPRISE est le nombre
                // d'abandons, jamais le nombre de vues : « combien sont
                // revenus » ne se pose que sur ceux qui étaient partis. Sans
                // abandon, `rate` rend `unmeasured` — jamais un 0 % de reprise
                // qui se lirait « personne n'est revenu ».
                resumedSessions: resumed,
                resumeRate: rate(resumed, abandoned),
              } as const)
            : ({ kind: 'below_threshold', minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC } as const),
        }
      })
      .sort((a, b) => b.sessions - a.sessions || a.slug.localeCompare(b.slug)),
  )
}

function clampWindow(value: number): number {
  const days = Math.floor(Number(value))
  if (!Number.isFinite(days)) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, days))
}
