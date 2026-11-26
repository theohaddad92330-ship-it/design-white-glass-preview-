// `analysis.constants` — pas un `*.service.ts` : hors du champ que GA-07 compte
// (`module-boundaries.spec.ts` ne regarde que les imports dont le second segment
// contient « service »). Réemployée plutôt que redupliquée (GA-26) : c'est la
// MÊME borne que `StuckAnalysisReaper` (module `analysis`) utilise pour abandonner
// un run et faucher un compte resté bloqué.
import { JOB_TIMEOUT_MS } from '../analysis/analysis.constants'
// `dispatchFailureOutcome` — LA dérivation unique du dépôt qui répond à « la
// requête a-t-elle pu PARTIR ? » (voir son docblock, `@bellum/contracts`).
// Réemployée ici plutôt que redupliquée (GA-26) : `apiUnavailable` en a
// exactement besoin pour ne pas crier au loup sur un hoquet réseau — voir la
// section dédiée du docblock ci-dessous.
import { dispatchFailureOutcome } from '@bellum/contracts'

/**
 * #1676.1 — les mesures PURES des déclencheurs opérationnels câblés par ce lot :
 * « coût quotidien > 200 % de la médiane », « taux d'échec d'analyse > 20 % sur
 * 1 h », et les deux ajoutés ici, `apiUnavailable` et `stuckAnalysisJobsExceed`
 * (`api_indisponible` / `job_bloque`). Comme `calculerEtatSecurite`
 * (`backoffice-access-journal.service.ts`) : aucune horloge lue ici, aucune
 * requête — le service FETCH, ce fichier CALCULE, ce qui rend les quatre
 * formules testables sans base.
 *
 * ⚠️ CES QUATRE MESURES NE RECALCULENT PAS CELLES QUI EXISTENT DÉJÀ. L'alerte de
 * coût de `CostAlertService` compare à un seuil ABSOLU (`COST_ALERT_DAILY_USD`)
 * sur 24 h ; celle-ci compare à la MÉDIANE des jours précédents — une question
 * différente (« ce jour sort-il de l'ordinaire ? » plutôt que « dépasse-t-il un
 * plafond fixe ? »), explicitement demandée par #1676. Même chose pour le taux
 * d'échec : `ObservabilityAlertsService` le mesure sur 24 h avec son propre
 * seuil ; #1676 en demande un second sur 1 h, plus réactif à un incident en
 * cours.
 *
 * ⚠️ CE QUE `apiUnavailable` COUVRE, ET CE QU'IL NE COUVRE PAS ENCORE.
 * `StatusService` (module `health`, #1660) sait déjà sonder TROIS dépendances
 * (base, Redis, moteur IA) — mais l'importer ici est IMPOSSIBLE sans casser la
 * CI : GA-07 (`module-boundaries.spec.ts`) est un cliquet AU PLAFOND EXACT
 * (254/254 au 09/09/2026), et `backoffice-alerts.module.ts` est hors du
 * périmètre de ce lot (fichier partagé, réservé à l'intégrateur — voir le
 * rapport de lot). Dupliquer les TROIS sondes de `StatusService` ici aurait été
 * une SECONDE définition de « la base/Redis/le moteur IA répondent-ils ? » —
 * exactement la divergence que GA-26 interdit. Le choix retenu : sonder
 * SEULEMENT la base (`this.dataSource.query('SELECT 1')`, injectée via
 * `DatabaseModule`, `@Global()` — zéro import cross-module, zéro changement de
 * `.module.ts`), qui est *déjà*, dans le vocabulaire propre de `StatusService`,
 * « la SEULE dépendance dont la panne vaut `down` » (Redis/IA en panne n'y
 * valent que `degraded`). Étendre à Redis/IA demande soit de lever GA-07, soit
 * de câbler `backoffice-alerts.module.ts` — une décision, pas un câblage,
 * signalée dans le rapport de lot.
 *
 * ⚠️ CE QUE `stuckAnalysisJobsExceed` MESURE RÉELLEMENT. « L'ancienneté d'un
 * job BullMQ » se lit ici à travers `analysis_runs` (déjà injecté dans
 * `BackofficeAlertsService`), pas via une connexion Redis/BullMQ directe — même
 * raison que ci-dessus (GA-07 au plafond, `.module.ts` hors périmètre). Un run
 * encore `status='analyzing'` au-delà de `JOB_TIMEOUT_MS` a dépassé SON PROPRE
 * abandon dur (`AbortSignal.timeout`, voir `analysis.constants.ts`) : le
 * faucheur périodique (`StuckAnalysisReaper`, module `analysis`, toutes les
 * 60 s) est censé l'avoir déjà résolu avant que ce passage de 5 minutes ne
 * s'exécute. En voir un ICI n'est donc pas un accident de mesure : soit une
 * salve de runs dépasse ce que le faucheur absorbe en un tick, soit le faucheur
 * lui-même est en retard ou en panne — un filet de sécurité INDÉPENDANT de lui,
 * qui ne duplique aucune de ses écritures (aucun remboursement, aucun flip de
 * statut ici — uniquement une LECTURE, comptée et alertée).
 *
 * ⚠️ LOT DE SUIVI (09/09/2026, l'après-midi du même jour) — CE QUI RESTAIT
 * FAUX MALGRÉ LE CÂBLAGE. Les deux appelants existaient déjà (voir plus haut),
 * mais `apiUnavailable` traitait TOUTE erreur de la sonde comme un échec
 * confirmé, sans distinguer « la base a refusé la connexion » de « la requête
 * est partie et on n'a pas eu de réponse ». Une entreprise congestion réseau
 * de quelques secondes aurait donc déclenché une fausse alerte d'indisponibilité
 * — exactement ce que la doctrine « un timeout n'est pas un échec » interdit.
 * Corrigé en faisant recevoir à `apiUnavailable` l'erreur BRUTE plutôt qu'un
 * `{ok, detail}` déjà résumé, et en réemployant `dispatchFailureOutcome`
 * (voir son propre docblock ci-dessous).
 */

/** Non mesurable, mesurable-mais-sain, ou en défaut — jamais un booléen nu :
 *  « non mesuré » n'est jamais confondu avec « mesuré et bon ». */
type Measure =
  | { state: 'unmeasured'; reason: string; sample: number }
  | { state: 'measured'; breached: false; sample: number }
  | { state: 'measured'; breached: true; sample: number; detail: string }

/**
 * La médiane d'une série — sans dépendance externe, triée sur une COPIE (jamais
 * l'array reçu, un appelant ne s'attend pas à voir son tableau réordonné).
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const midValue = sorted[mid]
  const prevValue = sorted[mid - 1]
  if (midValue === undefined) return 0
  return sorted.length % 2 !== 0 ? midValue : ((prevValue ?? midValue) + midValue) / 2
}

/** Combien de jours de recul minimum pour qu'une médiane veuille dire quelque
 *  chose — sous ce seuil, un seul jour anormal EST la médiane. */
export const MIN_COST_HISTORY_DAYS = 3

export const COST_ALERT_RATIO = 2.0 // « > 200 % de la médiane »

/**
 * `previousDaysUsd` : le total, PAR JOUR, des jours précédant celui qu'on
 * évalue (production uniquement — filtré par l'appelant). `todayUsd` : le
 * total du jour évalué, à l'instant de la mesure (donc partiel — l'alerte
 * porte sur une tendance, pas un total figé).
 */
export function costExceedsMedian(previousDaysUsd: readonly number[], todayUsd: number): Measure {
  if (previousDaysUsd.length < MIN_COST_HISTORY_DAYS) {
    return {
      state: 'unmeasured',
      reason: `historique de coût insuffisant (${previousDaysUsd.length} jour(s), ${MIN_COST_HISTORY_DAYS} requis)`,
      sample: previousDaysUsd.length,
    }
  }
  const med = median(previousDaysUsd)
  if (med <= 0) {
    return {
      state: 'unmeasured',
      reason: 'médiane des jours précédents nulle — comparaison sans repère',
      sample: previousDaysUsd.length,
    }
  }
  const breached = todayUsd > med * COST_ALERT_RATIO
  if (!breached) return { state: 'measured', breached: false, sample: previousDaysUsd.length }
  const ratio = Math.round((todayUsd / med) * 100) / 100
  return {
    state: 'measured',
    breached: true,
    sample: previousDaysUsd.length,
    detail: `${todayUsd.toFixed(2)} $ aujourd'hui contre une médiane de ${med.toFixed(2)} $ sur les ${previousDaysUsd.length} jours précédents (×${ratio})`,
  }
}

/** Sous ce nombre de runs sur la fenêtre, un taux d'échec ne veut rien dire —
 *  un run en échec sur deux lancés serait un « 50 % » qui n'est qu'un accident. */
export const MIN_ANALYSIS_SAMPLE = 5

export const FAILURE_RATE_ALERT_PERCENT = 20 // « > 20 % sur 1 h »

/** `completed` compte, `error` compte et échoue ; tout le reste (`analyzing`,
 *  `canceled`) est EXCLU du dénominateur — un run encore en vol ou annulé par
 *  un utilisateur n'est ni un succès ni un échec du produit. */
export function analysisFailureRateExceeds(statuses: readonly string[]): Measure {
  let decided = 0
  let failed = 0
  for (const status of statuses) {
    if (status === 'completed') decided += 1
    else if (status === 'error') {
      decided += 1
      failed += 1
    }
  }
  if (decided < MIN_ANALYSIS_SAMPLE) {
    return {
      state: 'unmeasured',
      reason: `échantillon insuffisant sur 1 h (${decided} run(s) conclu(s), ${MIN_ANALYSIS_SAMPLE} requis)`,
      sample: decided,
    }
  }
  const ratePercent = Math.round((failed / decided) * 1000) / 10
  if (ratePercent <= FAILURE_RATE_ALERT_PERCENT) return { state: 'measured', breached: false, sample: decided }
  return {
    state: 'measured',
    breached: true,
    sample: decided,
    detail: `${ratePercent} % d'échec sur la dernière heure (${failed}/${decided} runs conclus, seuil ${FAILURE_RATE_ALERT_PERCENT} %)`,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `api_indisponible` — le résultat d'une sonde RÉELLE (`SELECT 1`), jamais une
 * santé déclarée. « Sain n'est jamais déclaré, il est dérivé d'un test réel » :
 * `probe.ok` vient d'un appel qui a VRAIMENT été tenté par l'appelant (voir le
 * docblock de tête pour le périmètre exact de ce que cette sonde couvre).
 *
 * ⚠️ « UN TIMEOUT N'EST PAS UN ÉCHEC » — POURQUOI CETTE FONCTION REÇOIT
 * L'ERREUR BRUTE, PAS UN BOOLÉEN DÉJÀ RÉSUMÉ.
 * La doctrine du dépôt : la seule question qui tranche est « la requête
 * a-t-elle pu PARTIR ? ». Une connexion jamais établie (`ECONNREFUSED`,
 * `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT` — qui porte le mot « timeout » sans
 * en être un) est un échec CONFIRMÉ : la base est injoignable, `breached:
 * true`. Une requête PARTIE sans réponse (`ECONNRESET`, un pur `ETIMEDOUT`
 * de milieu de connexion) ne prouve RIEN — la classer en défaut crierait au
 * loup à chaque hoquet réseau, et la classer saine annoncerait une santé
 * qu'on n'a pas observée. Elle rend donc `unmeasured` : ni l'un ni l'autre,
 * nommé comme tel. `dispatchFailureOutcome` (`@bellum/contracts`) est la
 * SEULE dérivation du dépôt qui répond à cette question (GA-26) — la
 * réécrire ici aurait fait diverger les deux réponses au premier cas
 * ambigu, exactement le risque que la doctrine signale pour
 * `UND_ERR_CONNECT_TIMEOUT`.
 *
 * Pas de seuil d'échantillon (contrairement aux deux mesures ci-dessus) :
 * une sonde binaire n'a pas de notion de « trop peu de mesures », et
 * `probeDatabase()` (service) ne lève jamais — elle CAPTURE l'erreur et la
 * transmet telle quelle, laissant CE fichier pur faire toute la
 * classification (donc testable sans DB).
 */
export function apiUnavailable(probe: { ok: true } | { ok: false; error: unknown }): Measure {
  if (probe.ok) return { state: 'measured', breached: false, sample: 1 }

  const outcome = dispatchFailureOutcome(probe.error)
  const detail = errorMessage(probe.error)

  if (outcome === 'unknown') {
    // `sample: 1` — UNE sonde a bien été tentée (contrairement à
    // `costExceedsMedian`, où `sample` compte des jours EXPLOITABLES, ici il
    // compte des TENTATIVES : la sonde a eu lieu, son verdict est ce qui
    // manque).
    return {
      state: 'unmeasured',
      reason: `sonde de base de données inconclusive — requête partie sans réponse, pas de verdict fiable (${detail})`,
      sample: 1,
    }
  }

  return { state: 'measured', breached: true, sample: 1, detail: `Base de données injoignable : ${detail}` }
}

/** `job_bloque` — voir le docblock de tête pour ce que « ancienneté d'un job »
 *  désigne ici. Aucun seuil de « trop peu de mesures » : contrairement au taux
 *  d'échec (qui a besoin d'un VOLUME pour vouloir dire quelque chose), UN SEUL
 *  run bloqué au-delà du délai dur du worker est déjà une anomalie — ce n'est
 *  pas un taux, c'est un fait qui ne devrait structurellement jamais arriver. */
export function stuckAnalysisJobsExceed(probe: { staleCount: number; oldestAgeMinutes: number | null }): Measure {
  if (probe.staleCount <= 0) return { state: 'measured', breached: false, sample: 0 }
  const ancienneteDetail =
    probe.oldestAgeMinutes === null ? '' : ` — la plus ancienne date de ${probe.oldestAgeMinutes} min`
  return {
    state: 'measured',
    breached: true,
    sample: probe.staleCount,
    detail: `${probe.staleCount} analyse(s) encore « en cours » au-delà du délai dur du worker (${Math.round(JOB_TIMEOUT_MS / 60_000)} min)${ancienneteDetail}.`,
  }
}
