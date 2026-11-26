import { classifyRunOutcome } from '@bellum/contracts'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * Les quatre alertes d'observabilité qui manquaient : **latence · erreur ·
 * hallucination · no-outcome**. Le calcul, séparé du réseau et de l'horloge.
 *
 * ## Pourquoi ce fichier existe
 *
 * Les exigences d'observabilité du 24/08 (`LANGFUSE_OBSERVABILITY_REQUIREMENTS.md`,
 * dernière puce) demandent **cinq** alertes : coût, latence, erreur,
 * hallucination, no-outcome. Une seule était livrée — le coût
 * (`cost-alert.service.ts`, depuis le 03/08).
 *
 * Les trois suivantes étaient déjà **CALCULÉES**, et personne n'en était prévenu :
 *  - la latence p95 par phase vit dans `analysis-telemetry.service.ts` — lue par
 *    le seul `internal-telemetry.controller.ts`, c'est-à-dire par un opérateur
 *    qui ouvre le back-office ;
 *  - le taux d'« actions annoncées mais non abouties » et la médiane du temps de
 *    réponse vivent dans `quality-metrics.ts` — lus par le seul
 *    `internal-team-kpis.controller.ts` ;
 *  - le verdict anti-hallucination du juge (`apps/ia/app/graph/judge.py`) est
 *    persisté dans `accounts.raw_analysis.judge` et affiché dans le dossier.
 *
 * Du code juste, calculé, testé, que personne n'appelle : c'est le défaut n°1 du
 * dépôt. Ce fichier ne recalcule rien de tout cela — il pose la question qui
 * manquait : **est-ce que quelqu'un est PRÉVENU quand ça dérape ?**
 *
 * ## La règle d'honnêteté qui porte tout le fichier
 *
 * **Une alerte qui n'a rien pu mesurer ne dit pas « tout va bien ».** Un taux
 * d'erreur calculé sur zéro run vaut 0 %, passe sous n'importe quel seuil, et
 * l'alerte reste muette exactement le jour où plus rien ne tourne : un service
 * mort et un service parfait rendraient le même silence. D'où {@link AlertMeasure} :
 * `measured` porte une valeur, `unmeasured` porte une RAISON et **aucune valeur**.
 * Aucun appelant ne peut confondre les deux.
 *
 * Deuxième conséquence de la même règle : une observation qu'on ne sait pas
 * classer (durée corrompue, dossier sans verdict de juge, statut hors
 * vocabulaire) **sort du dénominateur et se COMPTE à part** (`excluded`) —
 * exactement la discipline des lignes non tarifées de `cost-alert.ts`.
 */

/** Ce qu'on n'a pas pu mesurer, et pourquoi. Jamais « 0 ».
 *  Non exporté : il ne voyage que porté par {@link AlertMeasure} (knip). */
type UnmeasuredReason =
  /** Aucune observation exploitable dans la fenêtre. */
  | 'no_observation'
  /** Trop peu d'observations pour que le chiffre veuille dire quelque chose. */
  | 'sample_too_small'

/**
 * Le résultat d'une mesure.
 *
 * `measured` porte une valeur ; `unmeasured` n'en porte AUCUNE — c'est
 * structurel, pour qu'aucun appelant ne puisse lire « 0 » là où il n'y a rien.
 * Les deux portent `excluded` : ce qui a été écarté du calcul, faute de savoir
 * le classer.
 */
export type AlertMeasure =
  | { state: 'measured'; value: number; sample: number; excluded: number }
  | { state: 'unmeasured'; reason: UnmeasuredReason; sample: number; excluded: number }

/** Un run d'analyse, réduit à ce dont les alertes ont besoin. */
export type RunSample = {
  /** Le statut tel que `analysis_runs.status` le porte. */
  status: string
  createdAt: Date
  /** `null` = le run n'a jamais rendu d'événement terminal. */
  completedAt: Date | null
  workspaceId: string | null
}

/**
 * #2441.4 — un tour de chat, réduit à ce que `responseP95` (LAU-FINAL-155) a
 * besoin de lire : le délai entre le message de l'utilisateur et la réponse
 * de Laura. Les deux AUTRES seuils du même point (`ack`, `firstStatus`) se
 * mesurent PAR TOUR et vivent déjà dans `apps/ia/app/services/chat_slo.py` —
 * celui-ci est une statistique de POPULATION, calculée ici parce que
 * {@link measureLatencyP95Ms} existe déjà et n'a besoin d'aucune réécriture.
 */
export type ChatTurnSample = {
  userAt: Date
  /** `null` = Laura n'a jamais répondu à ce tour dans la fenêtre observée. */
  assistantAt: Date | null
}

/** Le verdict du juge anti-hallucination pour un dossier produit. */
export type JudgeSample = {
  accountId: string
  /**
   * `raw_analysis.judge.verdict` : `'pass'` ou `'flagged'`.
   *
   * `null` = **le juge n'a pas rendu de verdict sur ce dossier** (run interrompu
   * avant le node judge, ou dossier antérieur au juge). Ce n'est pas « propre ».
   */
  verdict: string | null
}

/**
 * Épopée #2879 (#2442.14 / #2442.15) — une ligne `security_events`, réduite à
 * ce que l'alerte a besoin de compter. `kind` n'est pas porté : la lecture ne
 * retient déjà que `'authorization_denied'` (voir
 * {@link ObservabilityAlertsService.readSecurityEvents}).
 */
export type SecurityEventSample = {
  createdAt: Date
}

/**
 * Épopée #2879 (#2442.15) — une ligne `credit_ledger` de remboursement
 * (`kind = 'refund_enrichment'`, écrite par `RefreshRefundService.run`),
 * réduite à ce que l'alerte a besoin de compter. Même famille que
 * {@link SecurityEventSample} : un compte, jamais un taux.
 */
export type RefundEventSample = {
  createdAt: Date
}

/**
 * Épopée #2879 (#2442.15) — une ligne `security_events` de fuite détectée
 * (`kind = 'leak_detected'`, écrite par `guard_shared_corpus_pii_reporting_leak`
 * côté IA — voir `apps/ia/app/services/shared_corpus_pii_guard.py`), réduite à
 * ce que l'alerte a besoin de compter. Même famille que
 * {@link SecurityEventSample} : un compte, jamais un taux.
 */
export type LeakEventSample = {
  createdAt: Date
}

/** #2879 (lot X17) — une sortie de données (`security_events.kind = 'data_export'`), réduite à son espace. */
export type DataExportEventSample = { createdAt: Date; workspaceId: string | null }

/** #2879 (#2442.14) — une ligne `security_events` de soupçon (cross-tenant ou injection), réduite à un compte. */
export type ThreatEventSample = LeakEventSample

// ── les seuils : un registre, un seul endroit ────────────────────────────────

/**
 * Les seuils, leurs variables et leurs défauts — **à un seul endroit** (GA-26).
 *
 * La source d'exigences ne donne AUCUN chiffre : elle demande cinq alertes, pas
 * cinq seuils. Chaque défaut ci-dessous est donc ancré sur un fait déjà écrit
 * dans le dépôt, jamais choisi au jugé — une valeur par défaut dont on a perdu
 * la raison redevient une loterie.
 *
 * Le détail de chaque raison est dans `agent_docs/env-reference.md`.
 */
export const OBSERVABILITY_ALERT_SETTINGS = {
  /**
   * p95 de la durée d'un run, en secondes. Défaut **600 s (10 min)**.
   *
   * Ancrage : la promesse produit est « un dossier en 5 min » (CLAUDE.md) et le
   * plafond DUR du worker est de 20 min (`RUN_ABANDONED_AFTER_MS`). Un p95
   * au-dessus de 10 minutes veut dire qu'un run sur vingt est plus près du
   * plafond que de la promesse.
   */
  latencyP95Seconds: { env: 'LATENCY_ALERT_P95_SECONDS', fallback: 600 },
  /**
   * Part des runs tranchés qui ont échoué, en %. Défaut **10 %**.
   *
   * Ancrage : la cible « Actions réellement exécutées » de `quality-metrics.ts`
   * est « > 95 % », donc moins de 5 % d'échecs tolérés. Le seuil est posé au
   * DOUBLE de cette cible : en dessous, l'alerte partirait sur du bruit, et une
   * alerte qui part pour rien apprend à ignorer les alertes.
   */
  errorRatePercent: { env: 'ERROR_ALERT_RATE_PERCENT', fallback: 10 },
  /**
   * Part des dossiers que le juge a SIGNALÉS, en %. Défaut **5 %**.
   *
   * Ancrage : la cible « hallucination » de `quality-metrics.ts` est « < 1 % ».
   * Le seuil d'alerte est posé à cinq fois la cible — la cible est ce qu'on
   * VISE, l'alerte est ce qui ne s'ignore pas.
   */
  hallucinationRatePercent: { env: 'HALLUCINATION_ALERT_RATE_PERCENT', fallback: 5 },
  /**
   * Part des runs qui n'ont JAMAIS rendu d'issue, en %. Défaut **2 %**.
   *
   * Ancrage : un redéploiement peut légitimement laisser un run ou deux sans
   * issue (le processus qui devait rendre l'événement terminal est parti), donc
   * le plancher n'est pas zéro. Au-delà de 2 %, ce n'est plus un artefact de
   * déploiement.
   */
  noOutcomeRatePercent: { env: 'NO_OUTCOME_ALERT_RATE_PERCENT', fallback: 2 },
  /**
   * #2441.4 — p95 du délai user→assistant d'un tour de chat, en secondes.
   * Défaut **10 s**.
   *
   * Ancrage : c'est le TROISIÈME seuil nommé par LAU-FINAL-155
   * (`CHAT_SLO_THRESHOLDS_MS.responseP95`, `apps/ia/app/services/chat_slo.py`) —
   * les deux autres (`ack` < 500 ms, `firstStatus` < 1,5 s) s'y mesurent déjà PAR
   * TOUR. La valeur est recopiée ici avec sa provenance nommée : aucun schéma de
   * contrat ne partage aujourd'hui un simple seuil ms entre Python et
   * TypeScript, donc une dérive entre les deux ne se détecterait qu'à la lecture
   * des deux fichiers — pas encore par un test.
   */
  chatResponseP95Seconds: { env: 'CHAT_RESPONSE_P95_ALERT_SECONDS', fallback: 10 },
  /**
   * Nombre minimal d'observations pour qu'un chiffre veuille dire quelque chose.
   * Défaut **20**.
   *
   * Ancrage : sous 20 observations, un seul échec pèse 5 % et franchirait à lui
   * seul le seuil d'hallucination — l'alerte partirait tous les jours creux.
   * Vingt est aussi le minimum sous lequel un « 95e centile » n'est rien d'autre
   * que le maximum.
   */
  minSample: { env: 'OBSERVABILITY_ALERT_MIN_SAMPLE', fallback: 20 },
  /**
   * Épopée #2879 (#2442.14 / #2442.15) — nombre d'accès refusés (401/403) sur
   * 24 h au-delà duquel l'opérateur est prévenu. Défaut **20**.
   *
   * Ancrage : le MÊME plancher que {@link minSample} ci-dessus, pas une valeur
   * choisie au jugé — sous ce nombre, une poignée de jetons expirés côté client
   * (déconnexions, sessions périmées) se confond avec un bruit de fond ; c'est
   * le seuil sous lequel ce fichier refuse déjà de faire parler un chiffre.
   * ⚠️ Contrairement aux taux ci-dessus, c'est un COMPTE, pas un pourcentage :
   * il n'y a pas de population totale de « tentatives d'accès » dont il serait
   * une part — voir {@link measureAuthorizationDeniedCount}.
   */
  authorizationDeniedCount: { env: 'AUTHORIZATION_DENIED_ALERT_COUNT', fallback: 20 },
  /**
   * Épopée #2879 (#2442.15) — nombre de remboursements nocturnes
   * (`credit_ledger.kind = 'refund_enrichment'`, `RefreshRefundService.run`)
   * sur 24 h au-delà duquel l'opérateur est prévenu. Défaut **20**.
   *
   * Ancrage : le MÊME plancher que {@link minSample} /
   * {@link authorizationDeniedCount} ci-dessus, pour la même raison — sous ce
   * nombre, un remboursement isolé (un jeton expiré, une double soumission)
   * se confond avec le bruit de fond du produit. ⚠️ Comme
   * `authorizationDeniedCount`, c'est un COMPTE, pas un pourcentage : la
   * seule source de cette écriture est `RefreshRefundSweepService`/
   * `RefreshRefundController`, qui journalisent CHAQUE remboursement — voir
   * {@link measureAbnormalRefundCount}.
   */
  abnormalRefundCount: { env: 'ABNORMAL_REFUND_ALERT_COUNT', fallback: 20 },
  /**
   * Épopée #2879 (#2442.15) — nombre de fuites d'identité détectées
   * (`security_events.kind = 'leak_detected'`, écrite par
   * `guard_shared_corpus_pii_reporting_leak` côté IA quand un e-mail, un
   * téléphone ou une URL de profil personnel apparaît dans un outil dont le
   * corpus est PARTAGÉ entre espaces — `SHARED_CORPUS_TOOLS`) sur 24 h
   * au-delà duquel l'opérateur est prévenu. Défaut **1**.
   *
   * Ancrage DIFFÉRENT de {@link authorizationDeniedCount} /
   * {@link abnormalRefundCount} : une identité de personne dans un corpus qui
   * promet structurellement de n'en porter aucune n'a pas de « bruit de fond »
   * légitime — contrairement à un jeton expiré ou un remboursement isolé, il
   * n'existe AUCUN cas normal où ce compte est non nul. Le seuil minimal
   * (jamais 0, {@link readPositiveNumber}) est donc le plus bas défendable :
   * une seule fuite avérée doit déjà prévenir l'opérateur.
   */
  leakDetectedCount: { env: 'LEAK_DETECTED_ALERT_COUNT', fallback: 1 },
  /**
   * Épopée #2879 (#2442.14) — soupçons cross-tenant sur 24 h : un résultat
   * d'outil de chat qui porte un identifiant d'espace
   * (`security_events.kind = 'cross_tenant_suspected'`). Défaut **1**, même
   * ancrage que {@link leakDetectedCount} : aucun outil n'a de raison d'en
   * rendre un, donc aucun « bruit de fond » légitime.
   */
  crossTenantSuspectedCount: { env: 'CROSS_TENANT_SUSPECTED_ALERT_COUNT', fallback: 1 },
  /**
   * Épopée #2879 (#2442.14) — soupçons d'injection sur 24 h (heuristique de
   * motifs sur un résultat d'outil, `kind = 'injection_suspected'`). Défaut
   * **5** : contrairement aux deux précédents, un texte scrappé peut citer
   * légitimement « ignore les instructions » (article, documentation) — un
   * faux positif isolé ne doit pas réveiller l'opérateur.
   */
  injectionSuspectedCount: { env: 'INJECTION_SUSPECTED_ALERT_COUNT', fallback: 5 },
  /**
   * #3223.5 (#3198) — part, en %, des tours dont le budget est épuisé qui ont
   * pourtant rendu une réponse NON signalée dégradée, sur 3 jours. Défaut
   * **25 %** : la doctrine du tour est « budget épuisé ⇒ réponse dite
   * dégradée » ; un quart de contre-exemples n'est plus du bruit.
   */
  reasoningAfterBudgetPercent: { env: 'REASONING_AFTER_BUDGET_ALERT_PERCENT', fallback: 25 },
  /**
   * #3223.5 — part, en %, des tours où DataForge était demandé ou disponible et
   * indisponible, sur 3 jours. Défaut **50 %** : « absence SYSTÉMATIQUE » veut
   * dire la majorité des tours, pas un incident isolé.
   */
  reasoningDataforgeAbsentPercent: { env: 'REASONING_DATAFORGE_ALERT_PERCENT', fallback: 50 },
  /**
   * #3223.5 — part, en %, des tours sans AUCUNE couche interne consultée, sur
   * 3 jours. Défaut **90 %** : une question hors-sujet (salutation, culture
   * générale) ne lit légitimement rien d'interne ; la quasi-totalité des tours
   * dans ce cas veut dire que la mémoire de l'espace n'est plus lue.
   */
  reasoningInternalUnusedPercent: { env: 'REASONING_INTERNAL_UNUSED_ALERT_PERCENT', fallback: 90 },
  /**
   * #3223.7 — part, en %, des verdicts NO_GO qui n'ouvrent AUCUNE suite
   * (l'outil d'alternatives n'est pas appelé), sur 3 jours. Défaut **50 %** :
   * la règle est « un verdict qui n'est pas agir maintenant ne se rend jamais
   * seul » (#3181.1) ; la moitié des NO_GO sans suite n'est plus un oubli.
   */
  reasoningNoGoNoAlternativePercent: { env: 'REASONING_NOGO_NO_ALTERNATIVE_ALERT_PERCENT', fallback: 50 },
  /**
   * Épopée #2879 (#2442.14) — tentatives d'escalade de permission sur 24 h :
   * un membre authentifié a demandé un geste que son rôle refuse
   * (`security_events.kind = 'permission_escalated'`, écrit par
   * `GlobalExceptionFilter` sur `InsufficientRoleException`). Défaut **10** :
   * un bouton resté visible peut produire un refus honnête, mais plus de dix en un
   * jour n'est plus un hasard d'interface.
   */
  permissionEscalatedCount: { env: 'PERMISSION_ESCALATED_ALERT_COUNT', fallback: 10 },
  /**
   * #2879 (#2442.14, lot X17) — export massif : plus de **20** sorties de données
   * (`@DataExit()`) d'UN MÊME espace sur 24 h (`security_events.kind =
   * 'data_export'`, écrit par `WorkspacePermissionGuard`). Le seuil se lit PAR
   * ESPACE, jamais cumulé : deux espaces à 15 ne font pas un export massif.
   * Défaut 20 : même ancrage que `OBSERVABILITY_ALERT_MIN_SAMPLE` — un commercial
   * exporte quelques fichiers par jour, plus de vingt n'est plus un usage.
   */
  massExportCount: { env: 'MASS_EXPORT_ALERT_COUNT', fallback: 20 },
  /**
   * #2442.15 (lot X17) — « fausse réussite » : part, en %, des tours vérifiés dont
   * la réponse déclare une action faite sans preuve (`action_declaree_sans_preuve`),
   * sur 3 jours. Défaut **2 %** : « Fait » ne porte jamais de preuve d'envoi (c73),
   * un tour sur cinquante n'est plus un accident de formulation.
   */
  reasoningFalseSuccessPercent: { env: 'REASONING_FALSE_SUCCESS_ALERT_PERCENT', fallback: 2 },
  /** #2442.15 (lot X17) — « mauvais zéro » : un inconnu converti en 0 (GA-18/GA-19), même défaut 2 %. */
  reasoningWrongZeroPercent: { env: 'REASONING_WRONG_ZERO_ALERT_PERCENT', fallback: 2 },
  /**
   * #3223 (lot E12) — « Market Memory appelée mais non citée » : part, en %, des tours où la mémoire marché a
   * rendu une entreprise et où la réponse n'en nomme aucune, sur 3 jours. Défaut **50 %** : une réponse sur deux
   * qui tait ce que l'outil a lu n'est plus une reformulation, c'est une lecture perdue.
   */
  reasoningMarketMemoryUncitedPercent: { env: 'REASONING_MARKET_MEMORY_UNCITED_ALERT_PERCENT', fallback: 50 },
  /**
   * #3223 (lot R17) — « correction sans changement de résultat » : part, en %, des corrections SUIVIES
   * d'un rerun dont le verdict de compte ne change pas, sur 3 jours. Défaut **50 %** : une correction sur
   * deux qui ne change rien au verdict n'est plus un rerun utile, c'est un signe que Laura rejoue le même
   * calcul sans en tirer de conséquence.
   */
  reasoningCorrectionWithoutResultChangePercent: {
    env: 'REASONING_CORRECTION_WITHOUT_RESULT_CHANGE_ALERT_PERCENT',
    fallback: 50,
  },
  /**
   * #3223 (lot R17) — « GO sur grand compte sans accès » : part, en %, des verdicts `GO_AFTER_PROOF`
   * rendus pour un compte de 5000 salariés et plus, sur 3 jours. Défaut **25 %** : un grand compte sans
   * accès connu reste un angle mort commercial plus coûteux qu'un petit compte dans la même situation.
   */
  reasoningGoLargeAccountWithoutAccessPercent: {
    env: 'REASONING_GO_LARGE_ACCOUNT_WITHOUT_ACCESS_ALERT_PERCENT',
    fallback: 25,
  },
  /**
   * #3223 (décision Louis 11/10/2026) — « hausse des réponses génériques » : part, en %, des réponses
   * échantillonnées qui recommandent quelque chose et que le juge IA ÉVALUÉ classe génériques, sur
   * 3 jours. Défaut **30 %** : au-delà d'une recommandation sur trois interchangeable, la règle #1925
   * (« au moins deux éléments propres au compte ») n'est plus tenue. Muette tant que le juge est non
   * fiable (`genericJudgeReliability`) : une alerte ne part jamais sur un chiffre qu'on n'affiche pas.
   */
  reasoningGenericPercent: { env: 'REASONING_GENERIC_ALERT_PERCENT', fallback: 30 },
} as const

/**
 * Lit un réglage numérique strictement positif. Absent, illisible ou ≤ 0 ⇒ le
 * défaut, jamais une erreur et jamais zéro : un seuil à zéro ferait partir
 * l'alerte en permanence, ce qui revient à ne plus en avoir.
 */
export function readPositiveNumber(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim()
  if (!trimmed) return fallback
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Bris de glace (même patron que `WATCHLIST_REFRESH_DISABLED`) : les alertes
 * sont ACTIVES par défaut, `OBSERVABILITY_ALERTS_DISABLED=true` les arrête.
 * Volontairement strict sur la valeur — `yes` n'éteint rien, parce qu'un
 * garde-fou éteint par une faute de frappe ne se remarque pas.
 */
export function observabilityAlertsDisabled(): boolean {
  return killSwitchCut('observability.alerts')
}

// ── les mesures ──────────────────────────────────────────────────────────────

/**
 * Le refus de mesurer, s'il y a lieu.
 *
 * `null` = l'échantillon suffit, l'appelant peut calculer. Sinon une raison
 * NOMMÉE, et jamais une valeur.
 */
function refuse(sample: number, excluded: number, minSample: number): AlertMeasure | null {
  if (sample === 0) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded }
  if (sample < minSample) return { state: 'unmeasured', reason: 'sample_too_small', sample, excluded }
  return null
}

/** Arrondi à deux décimales : un taux de 4.999999999 n'est pas lisible. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * p95 de la durée réelle des runs qui ont VRAIMENT rendu un dossier
 * (`completed_at − created_at`, statut `completed`).
 *
 * Tout run de la fenêtre qui n'apporte pas une durée exploitable — encore en
 * cours, échoué, sans `completed_at`, ou de durée négative / non finie — est
 * écarté et COMPTÉ : le compter comme 0 ms tirerait le p95 vers le bas et
 * rassurerait à tort, et ne pas le compter du tout ferait croire que la mesure
 * couvre toute la fenêtre.
 */
export function measureLatencyP95Ms(runs: readonly RunSample[], minSample: number): AlertMeasure {
  const durations: number[] = []
  let excluded = 0
  for (const run of runs) {
    if (run.status !== 'completed' || run.completedAt == null) {
      excluded += 1
      continue
    }
    const ms = run.completedAt.getTime() - run.createdAt.getTime()
    if (!Number.isFinite(ms) || ms < 0) {
      excluded += 1
      continue
    }
    durations.push(ms)
  }
  const verdict = refuse(durations.length, excluded, minSample)
  if (verdict) return verdict

  const sorted = [...durations].sort((a, b) => a - b)
  // Le p95 « nearest-rank » : le premier élément au-delà de 95 % de la liste.
  // Sur 20 valeurs il désigne la 19e — c'est-à-dire qu'une seule lenteur ne
  // suffit pas, mais deux ne se cachent plus.
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return { state: 'measured', value: sorted[index]!, sample: sorted.length, excluded }
}

/**
 * #2441.4 — p95 du délai user→assistant sur les tours de chat qui ont
 * VRAIMENT reçu une réponse.
 *
 * Réutilise {@link measureLatencyP95Ms} tel quel : un tour de chat réduit à
 * `userAt`/`assistantAt` est un `RunSample` dont le statut se déduit de la
 * seule question qui compte ici — a-t-il une réponse ? Un tour sans réponse
 * dans la fenêtre observée sort du calcul, COMPTÉ (`excluded`), jamais traité
 * comme une durée nulle.
 */
export function measureChatResponseP95Ms(turns: readonly ChatTurnSample[], minSample: number): AlertMeasure {
  return measureLatencyP95Ms(
    turns.map(turn => ({
      status: turn.assistantAt ? 'completed' : 'pending',
      createdAt: turn.userAt,
      completedAt: turn.assistantAt,
      workspaceId: null,
    })),
    minSample,
  )
}

/**
 * Part des runs TRANCHÉS qui ont échoué, en %.
 *
 * ⚠️ Une annulation n'est pas une erreur : c'est une décision d'utilisateur (ou
 * un redéploiement). Elle sort du dénominateur et se compte à part — la garder
 * ferait baisser le taux d'erreur chaque fois qu'on redéploie.
 */
export function measureErrorRatePercent(runs: readonly RunSample[], minSample: number): AlertMeasure {
  let decided = 0
  let failed = 0
  let excluded = 0
  for (const run of runs) {
    if (run.status === 'completed') decided += 1
    else if (run.status === 'error') {
      decided += 1
      failed += 1
    } else excluded += 1
  }
  const verdict = refuse(decided, excluded, minSample)
  if (verdict) return verdict
  return { state: 'measured', value: round((failed / decided) * 100), sample: decided, excluded }
}

/**
 * Part des runs qui n'ont JAMAIS rendu d'issue, en %.
 *
 * Le dénominateur ne retient que les runs qui avaient le TEMPS de finir : un run
 * lancé il y a deux minutes travaille encore, le compter dans un sens ou dans
 * l'autre serait une invention. La frontière est `classifyRunOutcome`, la même
 * dérivation que le « Sans suite » de l'historique.
 */
export function measureNoOutcomeRatePercent(runs: readonly RunSample[], now: Date, minSample: number): AlertMeasure {
  let observable = 0
  let noOutcome = 0
  let excluded = 0
  for (const run of runs) {
    switch (classifyRunOutcome({ status: run.status, createdAt: run.createdAt }, now)) {
      case 'completed':
      case 'failed':
      case 'canceled':
        observable += 1
        break
      case 'no_outcome':
        observable += 1
        noOutcome += 1
        break
      // `running` (le run travaille) et `unknown` (statut illisible) ne sont ni
      // une issue ni une absence d'issue : les ranger d'un côté fausserait le
      // taux dans un sens, de l'autre dans l'autre.
      default:
        excluded += 1
    }
  }
  const verdict = refuse(observable, excluded, minSample)
  if (verdict) return verdict
  return { state: 'measured', value: round((noOutcome / observable) * 100), sample: observable, excluded }
}

/** Le seul verdict qui compte comme un signalement du juge. */
const JUDGE_FLAGGED = 'flagged'
const JUDGE_PASSED = 'pass'

/**
 * Part des dossiers que le juge anti-hallucination a SIGNALÉS, en %.
 *
 * Un dossier sans verdict (`null`) — run interrompu avant le node judge, ou
 * dossier antérieur au juge — sort du dénominateur et se compte. L'absorber en
 * « pass » ferait baisser le taux exactement quand les runs échouent : l'alerte
 * s'éteindrait au pire moment.
 */
export function measureHallucinationRatePercent(judges: readonly JudgeSample[], minSample: number): AlertMeasure {
  let judged = 0
  let flagged = 0
  let excluded = 0
  for (const entry of judges) {
    if (entry.verdict === JUDGE_FLAGGED) {
      judged += 1
      flagged += 1
    } else if (entry.verdict === JUDGE_PASSED) judged += 1
    else excluded += 1
  }
  const verdict = refuse(judged, excluded, minSample)
  if (verdict) return verdict
  return { state: 'measured', value: round((flagged / judged) * 100), sample: judged, excluded }
}

/**
 * Épopée #2879 (#2442.14 / #2442.15) — nombre d'accès refusés (401/403) sur la
 * fenêtre observée.
 *
 * ⚠️ Ce n'est PAS un taux : contrairement aux mesures ci-dessus, il n'existe
 * aucune population totale de « tentatives d'accès » dont ce chiffre serait
 * une part — l'API n'observe QUE les refus. Un compte à zéro est donc un ZÉRO
 * VRAI (aucun accès refusé n'a eu lieu), jamais une absence de mesure : la
 * question de la doctrine (« si cette valeur est absente, 0 est-il vrai ? »)
 * répond ici « oui », parce que l'écriture qui produit `events` est la SEULE
 * source et qu'elle journalise CHAQUE refus.
 *
 * `events: null` est la vraie question inverse : la LECTURE a échoué (base
 * injoignable), et là un zéro serait un mensonge — donc `unmeasured`, comme
 * partout ailleurs dans ce fichier.
 */
export function measureAuthorizationDeniedCount(events: readonly SecurityEventSample[] | null): AlertMeasure {
  if (events === null) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded: 0 }
  return { state: 'measured', value: events.length, sample: events.length, excluded: 0 }
}

/**
 * Épopée #2879 (#2442.15) — nombre de remboursements nocturnes sur la fenêtre
 * observée.
 *
 * ⚠️ Même règle que {@link measureAuthorizationDeniedCount} : ce n'est PAS un
 * taux — il n'existe aucune population de « débits candidats au
 * remboursement » dont ce serait une part, seulement des remboursements
 * réellement écrits. Un compte à zéro est donc un ZÉRO VRAI (aucun débit indu
 * cette nuit), jamais une absence de mesure.
 *
 * `events: null` est la lecture qui a échoué (base injoignable) — là un zéro
 * serait un mensonge, donc `unmeasured`.
 */
export function measureAbnormalRefundCount(events: readonly RefundEventSample[] | null): AlertMeasure {
  if (events === null) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded: 0 }
  return { state: 'measured', value: events.length, sample: events.length, excluded: 0 }
}

/**
 * Épopée #2879 (#2442.15) — nombre de fuites d'identité détectées sur la
 * fenêtre observée.
 *
 * ⚠️ Même règle que {@link measureAuthorizationDeniedCount} : ce n'est PAS un
 * taux — il n'existe aucune population de « lectures du corpus partagé » dont
 * ce serait une part, seulement des fuites réellement détectées et écrites.
 * Un compte à zéro est donc un ZÉRO VRAI (aucune identité de personne n'a
 * fuité dans le corpus partagé cette fenêtre), jamais une absence de mesure.
 *
 * `events: null` est la lecture qui a échoué (base injoignable) — là un zéro
 * serait un mensonge, donc `unmeasured`.
 */
export function measureLeakDetectedCount(events: readonly LeakEventSample[] | null): AlertMeasure {
  if (events === null) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded: 0 }
  return { state: 'measured', value: events.length, sample: events.length, excluded: 0 }
}

/**
 * Épopée #2879 (#2442.14) — nombre de soupçons (cross-tenant ou injection)
 * sur la fenêtre. Un COMPTE, jamais un taux : zéro constaté est un zéro vrai,
 * `null` (lecture impossible) est `unmeasured`.
 */
export function measureThreatSuspicionCount(events: readonly ThreatEventSample[] | null): AlertMeasure {
  if (events === null) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded: 0 }
  return { state: 'measured', value: events.length, sample: events.length, excluded: 0 }
}

/**
 * #2879 (lot X17, #2442.14) — le plus grand nombre de sorties de données d'UN
 * même espace sur la fenêtre. Un COMPTE : zéro constaté est un zéro vrai, `null`
 * (lecture impossible) est `unmeasured`. Le maximum, jamais la somme — le seuil
 * dit « cet espace exporte en masse », pas « il y a beaucoup d'exports ».
 */
export function measureMassExportCount(events: readonly DataExportEventSample[] | null): AlertMeasure {
  if (events === null) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded: 0 }
  const perWorkspace = new Map<string, number>()
  for (const event of events) {
    const key = event.workspaceId ?? ''
    perWorkspace.set(key, (perWorkspace.get(key) ?? 0) + 1)
  }
  const max = Math.max(0, ...perWorkspace.values())
  return { state: 'measured', value: max, sample: events.length, excluded: 0 }
}

/**
 * L'alerte part-elle ?
 *
 * Deux refus explicites : une mesure impossible ne déclenche rien (et surtout
 * pas un « tout va bien »), et un seuil aberrant ne déclenche rien non plus —
 * même règle que `cost-alert.ts`, une alerte qui part sur un réglage mal saisi
 * apprend à ignorer les alertes.
 */
export function breaches(measure: AlertMeasure, threshold: number): boolean {
  if (measure.state !== 'measured') return false
  if (!Number.isFinite(threshold) || threshold <= 0) return false
  return measure.value > threshold
}
