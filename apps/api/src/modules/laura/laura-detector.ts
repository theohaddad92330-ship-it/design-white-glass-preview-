import {
  ACCOUNT_HIRING_INTERVENTION_KEY,
  ACCOUNT_PAIN_INTERVENTION_KEY,
  LAURA_INTERVENTIONS,
  LONG_ABSENCE_DAYS,
  LONG_ACTION_FRESH_MINUTES,
  PORTFOLIO_TOO_WIDE_ACCOUNTS,
  RETURN_FROM_ABSENCE_DAYS,
  type AccountSuggestionFact,
  type GoldenMoment,
  type HealthInput,
} from '@bellum/contracts'
import { BRIEFING_SCREEN, BRIEFING_SIGNAL_KEYS, CHAT_SCREEN, CHAT_SIGNAL_KEYS } from './laura-chat-signals'

/**
 * QUELLES INTERVENTIONS SONT DÉCLENCHÉES — la réalité, en face du catalogue.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST SÉPARÉ DU CATALOGUE
 * ─────────────────────────────────────────────────────────────────────────
 * Le catalogue des trente (`@bellum/contracts`) est le CONTRAT : il dit ce que
 * Laura sait dire, et sa `condition` est une phrase qu'un humain peut
 * contredire en la lisant. Ce fichier est la RÉALITÉ : il dit ce qu'on sait
 * réellement détecter, et — c'est le point — ce qu'on ne sait PAS détecter,
 * avec la raison.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ CORRIGÉ ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Le fichier produisait HUIT clés sur trente. Les vingt-deux autres étaient du
 * code juste, testé, que rien ne pouvait déclencher — une entrée de catalogue
 * n'est pas une intervention. Toutes celles qui restent sont branchées sur une
 * donnée qui existe déjà en base et que d'autres écrans lisent déjà ; les cinq
 * qui restent sont NOMMÉES dans `UNDETECTED_INTERVENTIONS`, avec ce qui manque.
 * Aucune ne disparaît en silence : la garde d'architecture refuse une clé de
 * catalogue qui ne serait ni détectée ni classée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES QUATRE RÈGLES QUE CE FICHIER FAIT TENIR
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Une mesure `null` ne déclenche RIEN.** « Je n'ai pas pu mesurer » n'est
 *    pas « c'est à zéro » : déclencher sur un `null` ferait parler Laura à un
 *    espace neuf de problèmes qu'il n'a pas eu le temps d'avoir.
 * 2. **Une intervention est déclenchée par une mesure qui parle de SON sujet.**
 *    C'est la leçon de la recette live : `empty_talent_pool` annonçait « ton
 *    vivier est vide » en lisant `dataDensity`, qui compte des COMPTES. Un
 *    ratio proche n'est pas une mesure, c'est une ressemblance. Chaque
 *    détecteur écrit donc sa `basis` — sur quoi il repose vraiment — et deux
 *    d'entre eux disent explicitement qu'ils APPROXIMENT.
 * 3. **La détection est SERVEUR.** Le navigateur ne connaît aucune de ces
 *    conditions, et lui laisser proposer sa liste reviendrait à lui laisser
 *    choisir ce qui l'interrompt : un client peut envoyer n'importe quelle clé.
 * 4. **Détecter ne contourne pas l'arbitrage.** Ce fichier ne rend que des
 *    CANDIDATES ; le plafond de proactivité (1 à 5 par jour), l'unicité par
 *    écran, l'écart de vingt minutes, le retrait et le refus à trente jours
 *    restent entièrement dans `canInterrupt` / `LauraService.plan`. Brancher
 *    dix-sept détecteurs de plus ne rend pas Laura bavarde : ça lui donne de
 *    meilleures choses à dire dans le même budget.
 */

/* ------------------------------------------------------------------ */
/*  Ce que la sonde sait compter                                       */
/* ------------------------------------------------------------------ */

/**
 * Les mesures NON RATIO dont la détection a besoin, chacune nommée.
 *
 * Séparées des sept axes du score de santé, qui sont des ratios bornés servant
 * à décider d'un BUDGET. Ici ce sont des faits : « combien de consultants se
 * libèrent », « dans combien de jours l'essai se termine ». Un fait se compare
 * à un seuil ; un ratio ne se compare qu'à lui-même.
 *
 * ⚠️ La liste est un ENSEMBLE D'IDENTIFIANTS et non des chaînes libres : c'est
 * ce qui permet à la sonde de ne lire QUE ce dont l'écran courant a besoin, et
 * à une garde de comparer sans deviner.
 */
export const DETECTION_COUNTS = [
  /** Fiches du vivier, archivées exclues. */
  'consultants',
  /** Comptes suivis dans l'espace. */
  'accounts',
  /** Comptes suivis sans la moindre tâche ouverte. */
  'accountsWithoutNextAction',
  /** Connexions à un outil de relation client. */
  'crmConnections',
  /** Besoins dans un état OUVERT (`NEED_OPEN_STATUSES`). */
  'openNeeds',
  /** Shortlists produites, tous besoins confondus. */
  'shortlists',
  /** Missions de l'espace, tous états. */
  'missions',
  /** Missions en cours (`active` / `onboarding`). */
  'activeMissions',
  /** Missions en cours dont le coût chargé est saisi — sans lui, pas de marge. */
  'activeMissionsWithCost',
  /** Relevés d'activité saisis sur ces missions. */
  'missionTimesheets',
  /** Missions terminées depuis plus de deux semaines sans retour d'expérience. */
  'endedMissionsWithoutFeedback',
  /** Alertes de renouvellement ouvertes, telles que le balayeur les a posées. */
  'openRenewalRisks',
  /** Dossiers de compétences produits (`cv_versions`). */
  'skillsDossiers',
  /** Consultants dont toutes les affectations en cours finissent sous 30 jours. */
  'consultantsFreeingSoon',
  /** Consultants sans affectation en cours depuis plus de 30 jours. */
  'consultantsOnLongBench',
  /** Sièges de l'espace. */
  'paidSeats',
  /** Sièges ayant produit une action tracée sur les trente derniers jours. */
  'activeSeats',
  /** Messages envoyés au copilote par cette personne. */
  'copilotMessages',
  /** Routines activées par cette personne. */
  'enabledRoutines',
  /** Interrupteurs de notification encore allumés pour cette personne. */
  'enabledNotificationChannels',
  /** Jours depuis l'inscription de CETTE personne (et non l'âge de l'espace). */
  'accountAgeDays',
  /** Jours avant la fin du cycle de crédits (`nextResetFor`). */
  'daysUntilCreditCycleEnds',
  /** Jours avant la fin de la période d'essai. */
  'daysUntilTrialEnds',
  /** Durée de l'absence qui précède la visite en cours, en jours. */
  'daysAwayBeforeThisVisit',
  /** Champs corrigés à la main de façon répétée sur un même objet. */
  'repeatedManualCorrections',
  /** Appels d'offres à échéance proche dont des exigences obligatoires manquent. */
  'rfpsDueWithGaps',
  /** Besoins ouverts depuis plus de cinq jours sur lesquels aucun profil n'est posé. */
  'needsOpenWithoutShortlist',
  /** Relevés encore attendus alors que deux relances au moins sont parties. */
  'timesheetsMissingAfterReminders',
  /** Factures émises, non encaissées, dont l'échéance CONNUE est dépassée de 30 jours. */
  'invoicesOverdueBeyondGrace',
  /**
   * Jours d'ici à la clôture ESPÉRÉE la plus lointaine du pipe.
   *
   * ⚠️ La seule mesure de cette liste qui n'est pas un comptage, et la seule
   * qui se compare PAR EN DESSOUS. Elle peut être négative — toutes les
   * clôtures espérées sont derrière nous — et c'est alors le cas le plus fort.
   */
  'pipelineCoverageDays',
  /** Couples (consultant, compte) qui portent au moins trois missions DÉMARRÉES. */
  'consultantsPlacedThriceAtSameAccount',
  /**
   * Minutes écoulées depuis la fin de la dernière action longue de CETTE
   * personne (une analyse de compte menée à son terme). `null` = elle n'en a
   * jamais terminé, ou la lecture a échoué — ni l'un ni l'autre n'ouvre de
   * dérogation.
   */
  'minutesSinceLongActionFinished',
  /**
   * Questions posées au copilote HIER par cette personne — la « sollicitation
   * spontanée » du §13.2, celle qui fait MONTER le plafond. Hier et non
   * aujourd'hui : le tome décrit un « comportement observé » qui décide du
   * « plafond du lendemain ».
   */
  'spontaneousQueriesYesterday',
  /**
   * Consultants DÉCLARÉS disponibles immédiatement (`availability = 'immediate'`),
   * archivés exclus.
   *
   * ⚠️ La déclaration, jamais une dérivation d'affectations : `consultants.
   * availability` est ce qu'un humain a saisi, et l'entité écrit noir sur blanc
   * qu'`inconnu` n'est JAMAIS présenté comme disponible. La dérivation par
   * affectations existe déjà à côté (`consultantsOnLongBench`) et répond à une
   * autre question — « depuis combien de temps est-il sur le banc ? ».
   */
  'consultantsAvailableNow',
  /**
   * Consultants dont la disponibilité n'est PAS renseignée (`inconnu`).
   *
   * Lu pour la MESURE et non pour le déclenchement : sans lui, « 0 disponible »
   * sur douze fiches muettes se lirait « personne n'est libre », alors que la
   * vérité est « personne ne l'a dit ». Voir `accountResourceMeasure`.
   */
  'consultantsAvailabilityUndeclared',
  /**
   * Missions dans un état EN COURS (`active` / `onboarding`) dont la date de
   * fin SAISIE est déjà passée — #1937.4.
   *
   * ⚠️ La seule mesure de cette liste qui compte une CONTRADICTION et non un
   * manque : les deux faits viennent de la même ligne, personne ne les déduit.
   * Une mission sans date de fin (`ends_on IS NULL`) en sort — « on ne sait pas
   * quand ça finit » ne contredit rien, et la compter ferait signaler une
   * incohérence à une ESN qui ne renseigne simplement pas ses échéances.
   */
  'activeMissionsPastEndDate',
  /**
   * #2409.8 — missions pas encore démarrées (`draft` / `onboarding` /
   * `ready_to_start`) dont la date de début SAISIE tombe dans les quatorze
   * jours, et dont le verdict de `computeMissionStartReadiness` n'est pas
   * `ready`. Le jugement est celui du contrat, jamais recalculé ici (GA-26).
   */
  'missionsStartingSoonNotReady',
  /**
   * #2409.9 — missions dont la date de début est arrivée depuis moins de trois
   * jours (J0 à J+2) et qui ne sont toujours pas passées en cours. Au-delà de
   * J+2, silence : confirmer une arrivée ne se réclame pas indéfiniment.
   */
  'missionsStartedUnconfirmed',
  /**
   * #3398 — fiches dont la disponibilité DÉCLARÉE (immédiate / sous 1 mois /
   * sous 3 mois) n'a pas été revalidée depuis plus de `AVAILABILITY_REVALIDATION_DAYS`.
   * Une date de revalidation absente ne compte pas : « jamais confirmé » n'est
   * pas « périmé » (même règle que `availabilityIsStale`).
   */
  'consultantsAvailabilityStale',
  /**
   * #3398 — tâches OUVERTES posées sur un compte dont l'échéance saisie est
   * passée : les relances dues. Une tâche sans compte n'en est pas une.
   */
  'accountTasksOverdue',
  /**
   * #3398.1 — part (en %, entier) du CA QUOTIDIEN des affectations en cours
   * (TJM saisi × charge) portée par le premier compte. Non mesurée — aucune
   * affectation en cours avec un TJM saisi — la mesure est ABSENTE, jamais 0.
   */
  'topAccountRevenueSharePercent',
  /**
   * #3398.2 — comptes ACTIFS (non archivés) sans `assigned_to`. Absent (jamais 0)
   * quand l'espace n'a qu'un siège : seul à bord, rien n'est « sans responsable ».
   */
  'accountsWithoutOwner',
  /** #3398.2 — comptes sur lesquels au moins deux personnes ont agi (définition de `duplicateCoverage`). */
  'accountsActedOnBySeveralPeople',
  /** #3398.1/.4 — comptes ACTIFS assignés à CETTE personne. */
  'myActiveAccounts',
  /**
   * #3398 (BD) — appels LOGUÉS À LA MAIN (`source = 'manual'`), récents, dont
   * aucun débrief n'a été saisi (`call_debrief IS NULL`) — ni fait, ni besoin,
   * ni prochaine action, ni consentement. Un appel SYNCHRONISÉ (`telephony`)
   * n'entre pas dans le compte : personne n'a eu l'intention de le débriefer,
   * contrairement à un appel qu'on prend la peine de consigner à la main.
   */
  'callsWithoutDebrief',
  /**
   * #2875/#3398 (BM) — entretiens PLANIFIÉS (`outcome = 'pending'`), dans les
   * `INTERVIEW_BRIEF_WINDOW_HOURS` heures qui viennent, dont le brief
   * d'entretien (`InterviewBriefDialog`) n'a jamais été ouvert
   * (`brief_viewed_at IS NULL`). Un entretien déjà classé (`positive` /
   * `negative` / `no_show`) ou déjà passé sort du compte : son brief n'a plus
   * d'usage.
   */
  'interviewsAwaitingBrief',
  /**
   * #2875/#3398 (forecast fondateur) — missions EN COURS dans le prévisionnel
   * (`FORECAST_RUNNING_MISSION_STATUSES`, non échues) dont le revenu est
   * DÉCLARÉ en difficulté : renouvellement `bloque`, ou statut `at_risk` — la
   * même règle que le scénario bas de `ForecastHorizonsService`
   * (`FORECAST_DECLARED_BLOCKED_*`). UN COMPTE, une requête : jamais le calcul
   * par horizon, jamais un montant pondéré ni une probabilité.
   */
  'forecastDeclaredBlockedMissions',
  /**
   * Métiers placés DÉDUITS (décision Louis 11/10/2026) — `1` quand le profil
   * d'entreprise ne DÉCLARE aucun métier ET que la déduction, déjà passée, n'a
   * trouvé aucun indice (retirés exclus) ; `0` sinon ; `null` sans profil ou
   * tant que la déduction n'a jamais tourné (on ne pose pas une question que
   * le contexte va peut-être résoudre).
   */
  'placedRolesUnknown',
] as const
export type DetectionCount = (typeof DETECTION_COUNTS)[number]

/** #2875/#3398 (BM) — fenêtre d'alerte avant l'entretien, un seul endroit (GA-26). */
export const INTERVIEW_BRIEF_WINDOW_HOURS = 48

/**
 * Les mesures que le budget d'interruption demande sur TOUS les écrans.
 *
 * Elles ne dépendent pas de l'écran mais de la PERSONNE — d'où qu'elle arrive,
 * elle revient d'absence ou pas, elle vient de finir une analyse ou pas. Les
 * faire dépendre d'un détecteur d'écran ouvrirait la dérogation sur un seul
 * écran, et le trou serait silencieux : une mesure non demandée vaut `null`, et
 * un `null` ne déclenche rien.
 *
 * ⚠️ `spontaneousQueriesYesterday` en fait partie sans être un moment d'or :
 * c'est la hausse du §13.2, et elle se lit au même moment pour la même raison —
 * elle décide du plafond, pas du contenu.
 */
export const GOLDEN_MOMENT_COUNTS = [
  'daysAwayBeforeThisVisit',
  'minutesSinceLongActionFinished',
  'spontaneousQueriesYesterday',
] as const satisfies readonly DetectionCount[]

/**
 * Les deux mesures que la SONDE ne compose pas elle-même.
 *
 * Elles se déduisent de l'abonnement par `nextResetFor`, la borne exacte du cron
 * de reset — donc d'une fonction du module de crédits. Un SERVICE qui va
 * chercher le service d'un voisin est précisément ce que GA-07 fige (233 au
 * gel, et il DESCEND) ; le contrôleur, lui, est la couche où un geste
 * utilisateur traverse légitimement deux domaines. La composition vit donc là,
 * et la sonde ne rend que la fenêtre de facturation brute.
 *
 * ⚠️ Recalculer « `period_start` + 1 mois » ici aurait été plus court et faux :
 * ce serait une seconde vérité sur la date de renouvellement, et l'écran
 * Facturation en annonce déjà une.
 */
export const BILLING_DERIVED_COUNTS = ['daysUntilCreditCycleEnds', 'daysUntilTrialEnds'] as const
type BillingDerivedCount = (typeof BILLING_DERIVED_COUNTS)[number]

/** Ce que la sonde sait lire seule — tout le reste. */
export type ProbeCount = Exclude<DetectionCount, BillingDerivedCount>

/**
 * Ce que la sonde a pu lire. ABSENT et `null` veulent dire la même chose — « on
 * n'a pas mesuré » — et aucun des deux ne déclenche quoi que ce soit.
 *
 * `Partial` est délibéré : une requête d'écran ne lit que les mesures dont SES
 * interventions ont besoin. Lire les vingt-six à chaque navigation coûterait
 * vingt-six requêtes pour une bulle.
 */
export type DetectionCounts = Partial<Record<DetectionCount, number | null>>

/**
 * Ce que le DOSSIER ouvert apporte à la détection.
 *
 * Absent (`undefined` / `null`) sur tous les écrans sauf un — et c'est le
 * mécanisme qui empêche la carte de coin (`LauraCard`, montée globalement dans
 * `__root.tsx`) de voler la suggestion au panneau contextuel : les deux
 * demandent bien un plan sur `/accounts/<identifiant>`, mais seul le panneau
 * connaît le compte, donc seul lui l'envoie. La carte ne trouve aucune candidate
 * et le service rend `nothing_to_say` AVANT d'écrire la moindre trace — le
 * budget du jour reste intact.
 */
export type AccountDetectionContext = {
  accountId: string
  /** Les signaux de RECRUTEMENT encore d'actualité du dossier, tels qu'il les
   *  porte. Vide = le dossier n'en porte aucun ; on ne conclut rien d'autre. */
  hiringSignals: readonly AccountSuggestionFact[]
  /** #3939.3 — l'hypothèse de douleur qualifiée et ses signaux DATÉS
   *  (`accountPainFacts`, contrat). Vide ou absent = rien ne la fonde : Laura se tait. */
  painFacts?: readonly AccountSuggestionFact[]
}

type DetectionInput = {
  health: HealthInput
  /** Ce qui empêche de travailler, tel que la sonde l'a lu. `null` = on n'a pas
   *  pu regarder, ce qui n'est PAS « rien à signaler ». */
  blockingIssues: string[] | null
  counts: DetectionCounts
  /** L'écran d'où vient la demande — une intervention ne se pose que sur le sien. */
  screen: string
  /** Le dossier ouvert, quand la demande vient du panneau contextuel d'un compte.
   *  `null` ou absent = la demande ne porte sur aucun dossier. */
  account?: AccountDetectionContext | null
}

/* ------------------------------------------------------------------ */
/*  Seuils                                                             */
/* ------------------------------------------------------------------ */

/** Le seuil au-delà duquel « il reste des crédits » devient « ils vont expirer ». */
const CREDITS_MOSTLY_UNUSED = 0.8
/** Fenêtre de fin de cycle : au-delà, il reste le temps de les dépenser. */
const CYCLE_ENDING_DAYS = 7
/** En dessous, l'espace n'a pratiquement rien produit. */
const SPARSE = 0.2
/** « Plusieurs comptes » du §5.4 : deux, pas un — un compte sans suite est une
 *  respiration, deux est une habitude. */
const SEVERAL = 2
/** Le §5.4 dit « au moins trois besoins ouverts ». */
const NEEDS_BEFORE_MATCHING = 3
/** Le §5.4 dit « dix comptes analysés » avant de réclamer un CRM. */
const ACCOUNTS_BEFORE_CRM = 10
/** « Sept jours après l'inscription » — la fenêtre du récapitulatif. */
const WEEK_ONE = [7, 9] as const
/** « Dix jours après l'inscription », pour le copilote jamais sollicité. */
const COPILOT_GRACE_DAYS = 10
/** « Quatorze jours après l'inscription », pour les routines. */
const ROUTINE_GRACE_DAYS = 14
// `LONG_ABSENCE_DAYS` vivait ici en const privé — partagé via `@bellum/contracts`
// (#2106.29/#2802) : le résumé condensé de longue absence du brief lit
// maintenant le MÊME seuil que `no_connection_7_days` ci-dessous.
/** « Dans cinq jours ou moins », pour la fin d'essai. */
const TRIAL_ENDING_DAYS = 5
/**
 * « Pipe vide sous 60 jours » — le §5.2 dit « en dessous de 8 semaines, tu
 * passes en tension », soit deux mois. Le seuil vit ICI et pas dans la sonde :
 * la sonde rend une DISTANCE, le seuil est ce qu'on décide d'en faire.
 *
 * EXPORTÉ parce que la garde de parité démo doit prouver que la salle ne
 * déclenche PAS cette bulle : elle recopiait `60` de son côté, si bien que
 * porter le seuil à 90 l'aurait laissée verte pendant que la salle criait
 * « ton pipe se vide » devant un prospect. Un réglage vit à un seul endroit.
 */
export const PIPE_TENSION_DAYS = 60

/**
 * #3398 (BD) — fenêtre d'un appel LOGUÉ À LA MAIN sans débrief : quatorze
 * jours. Sans borne, un appel consigné il y a huit mois et jamais débriefé
 * resterait signalé pour toujours — un rappel utile se transforme alors en
 * bruit permanent. Le seuil vit ICI, lu par la sonde (`laura-probe.service.ts`),
 * jamais recopié.
 */
export const FIELD_CALL_DEBRIEF_WINDOW_DAYS = 14

/* ------------------------------------------------------------------ */
/*  Lecture des mesures — un `null` ne conclut jamais                  */
/* ------------------------------------------------------------------ */

/** La mesure, ou `null` si elle n'a pas été lue. Jamais `undefined` plus loin. */
function measured(counts: DetectionCounts, name: DetectionCount): number | null {
  return counts[name] ?? null
}

/** `true` seulement si la mesure EXISTE et vaut zéro. */
function isNone(counts: DetectionCounts, name: DetectionCount): boolean {
  return measured(counts, name) === 0
}

/** `true` seulement si la mesure EXISTE et atteint le seuil. */
function atLeast(counts: DetectionCounts, name: DetectionCount, threshold: number): boolean {
  const value = measured(counts, name)
  return value !== null && value >= threshold
}

/** `true` seulement si la mesure EXISTE et reste sous le seuil (bornes incluses). */
function within(counts: DetectionCounts, name: DetectionCount, low: number, high: number): boolean {
  const value = measured(counts, name)
  return value !== null && value >= low && value <= high
}

/** `true` seulement si le ratio EXISTE et passe sous le seuil. */
function below(ratio: number | null, threshold: number): boolean {
  return ratio !== null && ratio < threshold
}

/**
 * `true` seulement si la mesure EXISTE et passe sous le seuil.
 *
 * Le pendant de `atLeast`, pour la seule mesure qui se lit par en dessous. La
 * distinction avec `isNone` compte : une couverture de pipe NÉGATIVE est le cas
 * le plus grave, pas un cas à écarter.
 */
function under(counts: DetectionCounts, name: DetectionCount, threshold: number): boolean {
  const value = measured(counts, name)
  return value !== null && value < threshold
}

/* ------------------------------------------------------------------ */
/*  Les détecteurs                                                     */
/* ------------------------------------------------------------------ */

type InterventionDetector = {
  /** La clé du catalogue. Une clé inconnue est refusée par la garde. */
  key: string
  /**
   * SUR QUOI la détection repose vraiment, en français.
   *
   * Obligatoire, et c'est ce qui rend une approximation contestable : deux
   * détecteurs disent ici qu'ils lisent une mesure VOISINE de leur sujet, et
   * quelqu'un peut le lire et le refuser. Une approximation muette, non.
   */
  basis: string
  /** Les mesures que ce détecteur exige — ce que la sonde ira chercher, et rien d'autre. */
  requires: readonly DetectionCount[]
  fires: (input: DetectionInput) => boolean
}

export const INTERVENTION_DETECTORS: readonly InterventionDetector[] = [
  /* — Onboarding — */
  {
    key: 'no_connector',
    basis:
      "axe `connectors` du score : `null` veut dire « aucun connecteur branché » — c'est le seul endroit du produit où un `null` est une information et pas une absence, la sonde ne pouvant pas faire de ratio sur zéro.",
    requires: [],
    fires: input => input.health.connectors === null,
  },
  {
    key: 'empty_talent_pool',
    basis:
      'comptage des fiches du vivier, archivées exclues. Jamais un ratio voisin : c’est le défaut trouvé en recette live.',
    requires: ['consultants'],
    fires: input => isNone(input.counts, 'consultants'),
  },
  {
    key: 'placed_roles_unknown',
    basis:
      'profil d’entreprise sans `placed_roles` déclaré ET `inferred_placed_roles` vide une fois la déduction passée (retirés exclus) — « tout le contexte, et sinon on pose la question » (Louis 11/10/2026). Jamais avant que la déduction ait tourné.',
    requires: ['placedRolesUnknown'],
    fires: input => atLeast(input.counts, 'placedRolesUnknown', 1),
  },
  {
    key: 'week_one_recap',
    basis:
      "âge du compte de la PERSONNE (`profiles.created_at`) entre sept et neuf jours, et au moins une action tracée sur la période — l'axe `activation` est non nul.",
    requires: ['accountAgeDays'],
    fires: input =>
      within(input.counts, 'accountAgeDays', WEEK_ONE[0], WEEK_ONE[1]) &&
      input.health.activation !== null &&
      input.health.activation > 0,
  },

  /* — Adoption — */
  {
    key: 'needs_without_matching',
    basis:
      'besoins dans un état ouvert (`NEED_OPEN_STATUSES`, la définition partagée) et aucune shortlist produite dans l’espace.',
    requires: ['openNeeds', 'shortlists'],
    fires: input => atLeast(input.counts, 'openNeeds', NEEDS_BEFORE_MATCHING) && isNone(input.counts, 'shortlists'),
  },
  {
    key: 'crm_not_connected',
    basis: 'comptage des comptes suivis et des connexions à un outil de relation client.',
    requires: ['accounts', 'crmConnections'],
    fires: input => atLeast(input.counts, 'accounts', ACCOUNTS_BEFORE_CRM) && isNone(input.counts, 'crmConnections'),
  },
  {
    key: 'no_routine_enabled',
    basis: 'aucune routine activée par cette personne, et son compte a plus de quatorze jours.',
    requires: ['enabledRoutines', 'accountAgeDays'],
    fires: input =>
      isNone(input.counts, 'enabledRoutines') && atLeast(input.counts, 'accountAgeDays', ROUTINE_GRACE_DAYS),
  },
  {
    key: 'copilot_never_used',
    basis: 'aucun message adressé au copilote par cette personne, et son compte a plus de dix jours.',
    requires: ['copilotMessages', 'accountAgeDays'],
    fires: input =>
      isNone(input.counts, 'copilotMessages') && atLeast(input.counts, 'accountAgeDays', COPILOT_GRACE_DAYS),
  },
  {
    key: 'missions_without_timesheet',
    basis: 'des missions existent et AUCUN relevé d’activité n’a été saisi sur elles.',
    requires: ['missions', 'missionTimesheets'],
    fires: input => atLeast(input.counts, 'missions', 1) && isNone(input.counts, 'missionTimesheets'),
  },
  {
    key: 'no_skills_dossier',
    basis: 'des consultants existent et aucune version de dossier de compétences (`cv_versions`) n’a été produite.',
    requires: ['consultants', 'skillsDossiers'],
    fires: input => atLeast(input.counts, 'consultants', 1) && isNone(input.counts, 'skillsDossiers'),
  },
  {
    key: 'plan_feature_never_opened',
    basis:
      "⚠️ APPROXIMATION NOMMÉE : axe `depth` du score, qui mesure combien de FAMILLES d'objets existent, pas ce qui a été ouvert. Le dépôt n'a aucune télémétrie d'ouverture d'écran, et en inventer une produirait un chiffre invérifiable. Ce qu'on affirme donc : l'espace n'a presque rien produit — pas « cette fonctionnalité n'a jamais été ouverte ».",
    requires: [],
    fires: input => below(input.health.depth, SPARSE),
  },

  /* — Risque de churn — */
  {
    key: 'connector_error_48h',
    basis: 'la liste des blocages lue par la sonde. `null` ne déclenche pas : on n’a pas pu regarder.',
    requires: [],
    fires: input => input.blockingIssues !== null && input.blockingIssues.length > 0,
  },
  {
    key: 'no_connection_7_days',
    basis:
      "écart entre la visite en cours et la précédente (`user_last_seen`). Se referme tout seul : dès la visite suivante, l'écart retombe sous un jour.",
    requires: ['daysAwayBeforeThisVisit'],
    fires: input => atLeast(input.counts, 'daysAwayBeforeThisVisit', LONG_ABSENCE_DAYS),
  },
  {
    key: 'credits_expiring',
    basis:
      'les DEUX moitiés de la condition : moins de 80 % de l’enveloppe consommée ET le cycle se termine sous sept jours (`nextResetFor`, la borne du cron de reset).',
    requires: ['daysUntilCreditCycleEnds'],
    fires: input =>
      below(input.health.consumption, CREDITS_MOSTLY_UNUSED) &&
      within(input.counts, 'daysUntilCreditCycleEnds', 0, CYCLE_ENDING_DAYS),
  },
  {
    key: 'notifications_all_off',
    basis: 'plus aucun interrupteur de notification allumé pour cette personne.',
    requires: ['enabledNotificationChannels'],
    fires: input => isNone(input.counts, 'enabledNotificationChannels'),
  },
  {
    key: 'high_correction_rate',
    basis:
      'le journal des champs (`record_field_audit`) : un même champ d’un même objet corrigé à la main plusieurs fois.',
    requires: ['repeatedManualCorrections'],
    fires: input => atLeast(input.counts, 'repeatedManualCorrections', 1),
  },
  {
    key: 'single_active_seat',
    basis:
      'plusieurs sièges dans l’espace et EXACTEMENT un qui a produit une action tracée sur trente jours — et non un ratio d’adoption, qui se déclenchait aussi à trois actifs sur huit.',
    requires: ['paidSeats', 'activeSeats'],
    fires: input => atLeast(input.counts, 'paidSeats', 2) && measured(input.counts, 'activeSeats') === 1,
  },
  {
    key: 'no_action_14_days',
    basis:
      "axe `activation` du score, qui compte les actions tracées de l'espace sur quatorze jours : `0` veut dire zéro action, exactement la condition du catalogue.",
    requires: [],
    fires: input => input.health.activation === 0,
  },
  {
    key: 'trial_ending',
    basis: 'date de fin d’essai de l’abonnement porté par le propriétaire de l’espace.',
    requires: ['daysUntilTrialEnds'],
    fires: input => within(input.counts, 'daysUntilTrialEnds', 0, TRIAL_ENDING_DAYS),
  },

  /* — Valeur métier — */
  {
    key: 'mission_ending_no_plan',
    basis:
      "les alertes `renewal_at_risk` OUVERTES posées par le balayeur d'interventions. Laura ne refait pas la détection : la refaire produirait deux horizons et deux vérités sur le même fait.",
    requires: ['openRenewalRisks'],
    fires: input => atLeast(input.counts, 'openRenewalRisks', 1),
  },
  {
    key: 'consultant_free_soon',
    basis:
      'affectations : toutes celles en cours finissent sous 30 jours et aucune n’est sans fin — la même lecture que `deriveStaffing`. Et au moins un besoin reste ouvert, pour que le geste mène quelque part.',
    requires: ['consultantsFreeingSoon', 'openNeeds'],
    fires: input => atLeast(input.counts, 'consultantsFreeingSoon', 1) && atLeast(input.counts, 'openNeeds', 1),
  },
  {
    key: 'availability_stale',
    basis:
      'disponibilités déclarées positives dont `availability_checked_at` dépasse le seuil de revalidation du matching (60 jours) — le même seuil que `availabilityIsStale`, jamais un second.',
    requires: ['consultantsAvailabilityStale'],
    fires: input => atLeast(input.counts, 'consultantsAvailabilityStale', 1),
  },
  {
    key: 'client_dependency',
    basis:
      'affectations en cours dont le TJM est SAISI : somme (TJM × charge) du premier compte ÷ somme totale — au-delà de 33 % (un tiers), le seuil écrit au dictionnaire des indicateurs (`client_concentration_top_account`).',
    requires: ['topAccountRevenueSharePercent'],
    fires: input => atLeast(input.counts, 'topAccountRevenueSharePercent', 34),
  },
  {
    key: 'accounts_without_owner',
    basis:
      'comptes non archivés dont `assigned_to` est vide, dans un espace de deux sièges ou plus — la file « à attribuer » du cockpit manager (`unassignedAccounts`), jamais une seconde définition.',
    requires: ['accountsWithoutOwner'],
    fires: input => atLeast(input.counts, 'accountsWithoutOwner', 1),
  },
  {
    key: 'account_collisions',
    basis:
      'comptes sur lesquels au moins deux personnes distinctes ont agi (`user_actions`) — la définition de `duplicateCoverage` du cockpit manager.',
    requires: ['accountsActedOnBySeveralPeople'],
    fires: input => atLeast(input.counts, 'accountsActedOnBySeveralPeople', 1),
  },
  {
    key: 'portfolio_too_wide',
    basis:
      'comptes actifs assignés à la personne, au-delà de `PORTFOLIO_TOO_WIDE_ACCOUNTS` — le portefeuille PERSONNEL, jamais celui de l’espace.',
    requires: ['myActiveAccounts'],
    fires: input => atLeast(input.counts, 'myActiveAccounts', PORTFOLIO_TOO_WIDE_ACCOUNTS + 1),
  },
  {
    key: 'consultant_to_requalify',
    basis:
      'fiches non archivées dont la disponibilité est `inconnu` — la mesure `consultantsAvailabilityUndeclared` déjà lue par la bulle du dossier, jamais une seconde.',
    requires: ['consultantsAvailabilityUndeclared'],
    fires: input => atLeast(input.counts, 'consultantsAvailabilityUndeclared', 1),
  },
  {
    key: 'follow_up_overdue',
    basis:
      'tâches ouvertes (`TASK_OPEN_STATUSES`) rattachées à un compte dont `due_on` est passée — une échéance SAISIE, rien de deviné.',
    requires: ['accountTasksOverdue'],
    fires: input => atLeast(input.counts, 'accountTasksOverdue', 1),
  },
  {
    key: 'calls_without_debrief',
    basis:
      "appels loggés À LA MAIN (`activities.source = 'manual'`) dans les quatorze derniers jours (`FIELD_CALL_DEBRIEF_WINDOW_DAYS`) dont `call_debrief` est resté `null` — ni fait, ni besoin, ni prochaine action, ni consentement saisis. Un appel SYNCHRONISÉ (`source = 'telephony'`) n'est jamais compté : personne n'a eu l'intention de le débriefer.",
    requires: ['callsWithoutDebrief'],
    fires: input => atLeast(input.counts, 'callsWithoutDebrief', 1),
  },
  {
    key: 'interview_brief_not_consulted',
    basis:
      "entretiens PLANIFIÉS (`outcome = 'pending'`) dans les `INTERVIEW_BRIEF_WINDOW_HOURS` heures qui viennent, dont le brief d'entretien n'a jamais été ouvert (`interviews.brief_viewed_at IS NULL`) — la même trace de consultation que `InterviewBriefDialog` pose, jamais une seconde définition. Un entretien déjà classé ou déjà passé sort du compte : son brief n'a plus d'usage.",
    requires: ['interviewsAwaitingBrief'],
    fires: input => atLeast(input.counts, 'interviewsAwaitingBrief', 1),
  },
  {
    key: 'forecast_revenue_declared_blocked',
    basis:
      'missions en cours dans le prévisionnel (`FORECAST_RUNNING_MISSION_STATUSES`, hors suspendues, non échues) dont le renouvellement est déclaré `bloque` ou le statut `at_risk` — la règle que le scénario bas du prévisionnel (`ForecastHorizonsService`) retire déjà, lue ici en UN compte. Aucun montant, aucune probabilité : le fait déclaré, pas une chance de clôture.',
    requires: ['forecastDeclaredBlockedMissions'],
    fires: input => atLeast(input.counts, 'forecastDeclaredBlockedMissions', 1),
  },
  {
    key: 'accounts_without_next_action',
    basis: 'comptes suivis sans la moindre tâche ouverte — et non le taux de comptes classés, qui mesure autre chose.',
    requires: ['accountsWithoutNextAction'],
    fires: input => atLeast(input.counts, 'accountsWithoutNextAction', SEVERAL),
  },
  {
    key: 'margin_not_measured',
    basis:
      'des missions sont en cours et AUCUNE ne porte de coût chargé, ni sur la mission ni dans ses conditions commerciales.',
    requires: ['activeMissions', 'activeMissionsWithCost'],
    fires: input => atLeast(input.counts, 'activeMissions', 1) && isNone(input.counts, 'activeMissionsWithCost'),
  },
  {
    key: 'mission_ended_without_feedback',
    basis: 'missions terminées depuis plus de deux semaines sans retour d’expérience enregistré.',
    requires: ['endedMissionsWithoutFeedback'],
    fires: input => atLeast(input.counts, 'endedMissionsWithoutFeedback', 1),
  },
  {
    key: 'rfp_deadline_gaps',
    basis:
      "appels d'offres à échéance sous trois jours dont `computeRfpCompliance` — la fonction pure déjà utilisée pour le rapport de conformité — compte au moins une exigence obligatoire sans réponse validée.",
    requires: ['rfpsDueWithGaps'],
    fires: input => atLeast(input.counts, 'rfpsDueWithGaps', 1),
  },
  {
    key: 'long_bench',
    basis:
      'affectations : aucune en cours, aucune sans fin, et la dernière s’est terminée il y a plus de 30 jours. Un consultant sans la moindre affectation enregistrée n’est PAS compté — on ne sait rien de lui.',
    requires: ['consultantsOnLongBench'],
    fires: input => atLeast(input.counts, 'consultantsOnLongBench', 1),
  },

  /* — Ce que le back-office rend possible (PDF 2 §5.2) — */
  {
    key: 'need_open_without_shortlist',
    basis:
      'besoins dans un état ouvert (`NEED_OPEN_STATUSES`) dont l’âge d’étape (`status_changed_at`) dépasse cinq jours et sur lesquels AUCUN positionnement n’est rattaché — la même sous-requête que le pied de carte du kanban (`submissions.need_id`), et non la table `shortlists` que lit son voisin. Deux définitions sur le même écran feraient dire « rien n’a été proposé » au-dessus d’une carte qui affiche « 3 profils positionnés ». Un besoin qui n’a jamais franchi de transition n’a pas d’âge d’étape : il n’est pas compté, exactement comme le pied de carte rend « non mesuré ».',
    requires: ['needsOpenWithoutShortlist'],
    fires: input => atLeast(input.counts, 'needsOpenWithoutShortlist', 1),
  },
  {
    key: 'timesheet_missing_after_reminders',
    basis:
      'la colonne `mission_timesheets.reminders_sent`, celle que `TimesheetsService.recordReminder` incrémente quand une relance PART — jamais un âge de mois converti en « il a dû être relancé ». Comptés : les relevés encore dans un état d’attente (`AWAITING_TIMESHEET_STATUSES`) dont le compteur atteint deux. ⚠️ Un mois de mission qui n’a jamais été OUVERT (`openExpected`) n’a pas de ligne, donc pas de compteur, donc n’est pas compté : on ne peut pas dire « après deux relances » de quelqu’un que rien n’a relancé.',
    requires: ['timesheetsMissingAfterReminders'],
    fires: input => atLeast(input.counts, 'timesheetsMissingAfterReminders', 1),
  },
  {
    key: 'payment_overdue_30_days',
    basis:
      '`invoice_readiness` : une facture réellement émise (`invoiced_at`), rien d’encaissé (`paid_at IS NULL`), et une échéance CONNUE dépassée de plus de trente jours. Une échéance absente n’est pas « aujourd’hui » — l’entité le dit noir sur blanc, « un retard se calcule depuis une date réelle ou ne se calcule pas » — donc ces lignes-là sortent du compte au lieu d’en gonfler le total. Les factures CONTESTÉES et non encore réglées en sortent aussi : le litige n’est pas un retard, et c’est l’arbitrage même qui a fait exister `disputed_at`.',
    requires: ['invoicesOverdueBeyondGrace'],
    fires: input => atLeast(input.counts, 'invoicesOverdueBeyondGrace', 1),
  },
  {
    key: 'pipeline_runs_dry',
    basis:
      'la clôture ESPÉRÉE la plus lointaine (`opportunities.expected_close_on`) des affaires encore en jeu, dans les cinq étapes du pipe et hors des sorties — une date SAISIE par le commercial, jamais déduite d’un cycle moyen. ⚠️ Un espace dont aucune affaire ouverte ne porte de date rend `null`, et se tait : une date non renseignée n’est pas un pipe qui se vide. C’est aussi ce que la mesure NE dit PAS — elle ne convertit rien en semaines de charge, faute d’un rythme de consommation que le dépôt ne modélise nulle part.',
    requires: ['pipelineCoverageDays'],
    fires: input => under(input.counts, 'pipelineCoverageDays', PIPE_TENSION_DAYS),
  },
  {
    key: 'consultant_repeat_placement',
    basis:
      'les couples (consultant, compte) qui portent au moins trois missions DÉMARRÉES — la définition d’un placement écrite dans `PropagationService.placementsOf` : une affectation sur une mission qui commence le mois prochain n’en est pas un. C’est un couple et non un total : quelqu’un placé une fois chez trois clients n’ouvre aucune porte. Les fiches archivées sortent du compte, parce qu’une personne partie de l’ESN ne se represente pas — c’est l’écart assumé avec le compteur « placé N fois » du vivier, qui ne montre de toute façon que des fiches vivantes.',
    requires: ['consultantsPlacedThriceAtSameAccount'],
    fires: input => atLeast(input.counts, 'consultantsPlacedThriceAtSameAccount', 1),
  },

  /* — Le DOSSIER de compte ouvert (maquette SOL6 n°6) — */
  {
    key: ACCOUNT_HIRING_INTERVENTION_KEY,
    basis:
      "les DEUX moitiés du croisement, et aucune ne se déduit de l'autre. Côté COMPTE : les signaux de `accounts.recent_signals` dont le `type` est `recrutement` et dont la fraîcheur n'est pas `archive` — c'est la même colonne que l'onglet Signaux affiche, jamais une relecture du dossier brut. Côté VIVIER : `consultants.availability = 'immediate'`, la disponibilité DÉCLARÉE, jamais dérivée d'affectations — l'entité écrit noir sur blanc qu'`inconnu` n'est jamais présenté comme disponible. ⚠️ `consultantsAvailabilityUndeclared` est demandée pour la MESURE affichée et non pour le déclenchement : sans elle, « 0 disponible » sur douze fiches muettes se lirait « personne n'est libre » au lieu de « personne ne l'a dit ». ⚠️ La durée d'ouverture des postes n'est PAS promise : `RecentSignal.date` est une chaîne libre que le dossier remplit parfois d'une année seule, et convertir ça en « depuis 42 jours » serait le chiffre inventé que le dépôt refuse. La date voyage BRUTE, comme provenance.",
    requires: ['consultantsAvailableNow', 'consultantsAvailabilityUndeclared'],
    fires: input =>
      (input.account?.hiringSignals.length ?? 0) > 0 && atLeast(input.counts, 'consultantsAvailableNow', 1),
  },
  {
    // #3939.3 (décision Louis 13/10) — la douleur sourcée du dossier ouvert.
    key: ACCOUNT_PAIN_INTERVENTION_KEY,
    basis:
      "`accountPainFacts` (contrat, `laura-account-pain.ts`) sur `accounts.raw_analysis` du dossier ouvert : une hypothèse de `qualified_hypotheses` dont au moins un `based_on_signal_ids` désigne un signal de `recent_signals` DATÉ (jour ou mois — une année seule n'est pas une date) et non `archive` ; à défaut, une douleur de `pains` rapprochée d'un tel signal par le MÊME `domain_code` (la lecture de la question de douleur du chat, #3939). ⚠️ Aucune mesure de compteur : le dossier est la donnée. ⚠️ Aucune probabilité, aucune source nommée — le fait et sa date ; sans fondement daté, aucune intervention (jamais une carte vide). Le budget d'interruption décide, comme pour la clé de recrutement.",
    requires: [],
    fires: input => (input.account?.painFacts?.length ?? 0) > 0,
  },

  /* — L'INCOHÉRENCE (#1937.4) — */
  {
    key: 'mission_active_past_end_date',
    basis:
      "les DEUX colonnes de la MÊME ligne de `missions` : `status` dans les états en cours (`active` / `onboarding`, la définition que `activeMissions` utilise déjà) et `ends_on` strictement antérieure à aujourd'hui. Rien n'est déduit, rien n'est approché : ce sont deux faits saisis par l'ESN, et c'est leur contradiction qui est signalée — jamais une probabilité que la mission soit finie. ⚠️ `ends_on IS NULL` SORT du compte : une mission sans échéance connue ne se contredit pas, et la compter ferait annoncer une incohérence à une ESN qui ne renseigne pas ses dates de fin — « non mesuré » n'est pas « en retard ». ⚠️ Le seuil est UN : une seule ligne contradictoire suffit, parce que c'est la ligne qui est fausse, pas une tendance.",
    requires: ['activeMissionsPastEndDate'],
    fires: input => atLeast(input.counts, 'activeMissionsPastEndDate', 1),
  },

  /* — Le DÉMARRAGE d'une mission (#2409.8 / #2409.9) — tranché sans Louis
   *   (décision §12) : ce détecteur existant, pas un second mécanisme. — */
  {
    key: 'mission_start_not_ready',
    basis:
      "les missions pas encore démarrées (`draft` / `onboarding` / `ready_to_start`) dont `started_on` SAISIE tombe entre aujourd'hui et J+14, jugées par `computeMissionStartReadiness` (le MÊME contrat que la porte de démarrage et le panneau « Prête à démarrer ? ») : verdict différent de `ready`. ⚠️ Une mission sans date de début n'est pas comptée — « non daté » n'est pas « imminent ». ⚠️ Laura annonce, elle ne coche rien et ne relance personne.",
    requires: ['missionsStartingSoonNotReady'],
    fires: input => atLeast(input.counts, 'missionsStartingSoonNotReady', 1),
  },
  {
    key: 'mission_day_one_unconfirmed',
    basis:
      "les missions dont `started_on` est comprise entre J-2 et aujourd'hui et dont le statut est encore avant démarrage (`draft` / `onboarding` / `ready_to_start`). ⚠️ SANS HARCÈLEMENT : la fenêtre s'arrête à J+2, et le budget d'interruption borne la répétition ; aucun message ne part vers le consultant ni le client — le commercial confirme en passant la mission « en cours ».",
    requires: ['missionsStartedUnconfirmed'],
    fires: input => atLeast(input.counts, 'missionsStartedUnconfirmed', 1),
  },
]

/* ------------------------------------------------------------------ */
/*  Ce qu'on ne détecte pas, et pourquoi                               */
/* ------------------------------------------------------------------ */

/**
 * Les trois façons de ne PAS avoir de détecteur.
 *
 * Il en faut trois et pas une : « pas encore fait » appelle un chantier,
 * « pas détectable » appelle une collecte de donnée qui n'existe pas, et
 * « ne doit pas l'être » appelle une relecture de doctrine. Les confondre
 * ferait disparaître les deux premières dans la troisième, qui ne se rouvre
 * jamais.
 */
type UndetectedStatus =
  /** La donnée est là, le détecteur reste à écrire. `missing` dit quoi. */
  | 'detectable_not_yet'
  /** Le produit ne collecte pas ce que la condition suppose. */
  | 'not_detectable'
  /** La doctrine l'interdit. `missing` porte alors l'arbitrage, pas une donnée. */
  | 'must_not_detect'

type UndetectedIntervention = {
  status: UndetectedStatus
  /** Ce qui manque, ou l'arbitrage qui l'interdit. Jamais vide. */
  missing: string
}

/**
 * Les clés du catalogue SANS détecteur, chacune avec sa raison.
 *
 * Ce n'est pas de la documentation : la garde d'architecture exige que
 * l'ensemble `détectées ∪ classées` couvre EXACTEMENT le catalogue. Une clé
 * ajoutée au catalogue sans détecteur ni entrée ici fait rougir la CI — c'est
 * la seule façon qu'une trente-et-unième intervention ne redevienne pas du
 * code que rien n'appelle.
 *
 * Les cinq restantes sont toutes de la famille ONBOARDING, et c'est un fait à
 * lire : elles supposent une CHRONOLOGIE par personne (premier accès, première
 * analyse, première action validée) que le dépôt n'enregistre nulle part.
 */
export const UNDETECTED_INTERVENTIONS: Readonly<Record<string, UndetectedIntervention>> = {
  first_login: {
    status: 'detectable_not_yet',
    missing:
      'un marqueur de PREMIER accès. `user_last_seen` n’a pas de date de création, et `previous_seen_at IS NULL` désigne aussi quelqu’un qui n’est jamais reparti — on annoncerait « bienvenue » au cinquième jour d’usage continu.',
  },
  esn_profile_incomplete: {
    status: 'detectable_not_yet',
    missing:
      'une définition de « complet » qui vive à UN seul endroit. Le profil ESN porte une soixantaine de champs tous facultatifs ; décider ici lesquels comptent en ferait une seconde vérité face à l’écran qui les demande.',
  },
  first_account_ready: {
    status: 'not_detectable',
    missing:
      'l’OUVERTURE de l’onglet Plan. Le dépôt ne collecte aucune télémétrie d’ouverture d’écran — et en inventer une pour cette bulle serait une collecte de comportement décidée pour un message.',
  },
  no_action_validated: {
    status: 'detectable_not_yet',
    missing:
      'la date de la PREMIÈRE analyse comme jalon. La date de création du premier compte en est une approximation possible, mais un compte importé sans analyse la rendrait fausse — donc le jalon se pose explicitement, il ne se devine pas.',
  },
  first_action_validated: {
    status: 'not_detectable',
    missing:
      'le marqueur « c’était la première ». Rien n’enregistre le premier passage ; déclencher sur une action validée quelconque ferait une félicitation à chaque action, exactement le message qui apprend à ne plus regarder.',
  },
}

/* ------------------------------------------------------------------ */
/*  Détection                                                          */
/* ------------------------------------------------------------------ */

/** L'écran où le catalogue pose cette intervention, ou `null` si la clé est inconnue. */
function screenOf(key: string): string | null {
  return LAURA_INTERVENTIONS.find(intervention => intervention.key === key)?.screen ?? null
}

/**
 * L'écran du catalogue couvre-t-il celui d'où vient la demande ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PLUS UNE ÉGALITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Trente-cinq interventions se posaient sur un chemin LITTÉRAL, et l'égalité
 * suffisait. Un DOSSIER de compte, lui, vit sur `/accounts/<identifiant>` :
 * aucune valeur littérale ne peut le désigner, et poser `screen: '/accounts'`
 * aurait fait apparaître l'intervention sur la LISTE, où le compte dont elle
 * parle n'est même pas ouvert.
 *
 * ⚠️ **Le motif ne sert QU'À la détection.** L'unicité par écran
 * (`screensServed`, §5.3) et le décompte du jour continuent de travailler sur le
 * chemin RÉEL : deux dossiers différents restent deux écrans différents, et
 * c'est le plafond journalier — pas ce motif — qui borne le total. Normaliser
 * ici aurait fait qu'ouvrir cinq dossiers ne donne qu'une seule bulle par jour,
 * ce que personne n'a décidé.
 *
 * ⚠️ **Le nombre de segments doit être ÉGAL.** Sans cette borne, `/accounts/:id`
 * couvrirait `/accounts/abc/contacts` — un sous-écran que le catalogue n'a
 * jamais nommé.
 */
export function matchesScreen(catalogueScreen: string, actual: string): boolean {
  if (catalogueScreen === actual) return true
  // Rien à faire pour les trente-cinq chemins littéraux : sortir tout de suite
  // garde le coût de la détection identique à ce qu'il était.
  if (!catalogueScreen.includes('/:')) return false
  const pattern = catalogueScreen.split('/')
  const segments = actual.split('/')
  if (pattern.length !== segments.length) return false
  return pattern.every((part, index) =>
    // Un segment VIDE ne remplit pas un paramètre : `/accounts/` ne désigne
    // aucun dossier, et l'accepter ferait parler Laura sur une URL tronquée.
    part.startsWith(':') ? (segments[index] ?? '').length > 0 : part === segments[index],
  )
}

/**
 * Les détecteurs qui vivent sur cet écran.
 *
 * Le filtrage par écran passe AVANT l'évaluation — et c'est ce qui rend la
 * détection tenable : sans lui, une navigation coûterait les vingt-six mesures
 * pour n'en garder qu'une.
 */
function detectorsOn(screen: string): InterventionDetector[] {
  return INTERVENTION_DETECTORS.filter(detector => {
    const catalogueScreen = screenOf(detector.key)
    // #3398 — les signaux métier se disent AUSSI sur /chat (`laura-chat-signals.ts`).
    if (screen === CHAT_SCREEN && CHAT_SIGNAL_KEYS.includes(detector.key)) return true
    // #3398 — la relance due se dit aussi sur le brief (`BRIEFING_SIGNAL_KEYS`).
    if (screen === BRIEFING_SCREEN && BRIEFING_SIGNAL_KEYS.includes(detector.key)) return true
    return catalogueScreen !== null && matchesScreen(catalogueScreen, screen)
  })
}

/**
 * Ce que la sonde doit lire pour CET écran, et rien de plus.
 *
 * Dérivé de la même table que la détection : deux listes tenues à la main
 * divergeraient, et la divergence serait SILENCIEUSE — une mesure non lue vaut
 * `null`, et un `null` ne déclenche rien. C'est exactement le défaut « cassé et
 * non mesurable se ressemblent ».
 */
export function countsNeededForScreen(screen: string): DetectionCount[] {
  const needed = new Set<DetectionCount>()
  for (const detector of detectorsOn(screen)) for (const name of detector.requires) needed.add(name)
  return [...needed]
}

/**
 * Les clés dont la condition est remplie, sur CET écran.
 *
 * Rend des CANDIDATES, jamais une décision : c'est `LauraService.plan` qui
 * arbitre le plafond, l'unicité par écran et les refus récents.
 */
export function detectInterventions(input: DetectionInput): string[] {
  return detectorsOn(input.screen)
    .filter(detector => detector.fires(input))
    .map(detector => detector.key)
}

/** Les clés que ce fichier sait produire — pour la garde, et pour le tracker. */
export const DETECTABLE_KEYS: readonly string[] = INTERVENTION_DETECTORS.map(detector => detector.key)

/* ------------------------------------------------------------------ */
/*  §13.3 — les trois moments d'or                                     */
/* ------------------------------------------------------------------ */

/**
 * Sommes-nous dans un moment où l'interruption est ATTENDUE ?
 *
 * La détection est SERVEUR, pour la même raison que celle des interventions —
 * en plus forte : ici le navigateur ne demanderait pas un message de plus, il
 * demanderait à SORTIR du plafond. Un client peut envoyer n'importe quoi ; un
 * client qui pourrait s'accorder une dérogation n'aurait plus de plafond.
 *
 * **Un seul moment est rendu**, et l'ordre est celui du coût du SILENCE :
 *
 *  1. `real_blocker` — il est en train d'échouer sans le savoir, et ça lui coûte
 *     de l'argent maintenant. C'est le pendant, côté Laura, de l'exemption
 *     `origin: 'failure'` du compteur de proactivité.
 *  2. `long_action_finished` — il attend un résultat, et l'attente court.
 *  3. `return_from_absence` — le rattrapage peut attendre l'écran suivant.
 *
 * Chaque mesure suit la règle du fichier : un `null` ne conclut rien. « Je n'ai
 * pas pu lire depuis quand il est absent » n'est ni « il revient de trois
 * semaines », ni « il était là hier ».
 */
export function detectGoldenMoment(input: {
  counts: DetectionCounts
  /** `null` = on n'a pas pu regarder, ce qui n'est PAS « rien ne bloque ». */
  blockingIssues: string[] | null
}): GoldenMoment | null {
  if (input.blockingIssues !== null && input.blockingIssues.length > 0) return 'real_blocker'

  const sinceLongAction = measured(input.counts, 'minutesSinceLongActionFinished')
  // Bornée par le BAS aussi : une valeur négative viendrait d'une horloge de
  // travers, et « terminé dans le futur » ne justifie rien.
  if (sinceLongAction !== null && sinceLongAction >= 0 && sinceLongAction <= LONG_ACTION_FRESH_MINUTES) {
    return 'long_action_finished'
  }

  // « > 5 jours », strictement — le §13.3 l'écrit ainsi.
  const away = measured(input.counts, 'daysAwayBeforeThisVisit')
  if (away !== null && away > RETURN_FROM_ABSENCE_DAYS) return 'return_from_absence'

  return null
}
