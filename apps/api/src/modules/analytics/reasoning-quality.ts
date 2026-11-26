import {
  KNOWLEDGE_RECEIPT_LAYERS,
  SHARED_BASE_MIN_WORKSPACES,
  genericJudgeReliability,
  poolSharedCells,
  sectorKeyOfNaf,
  sizeBandOfEmployees,
  type GenericJudgeReliability,
  type KnowledgeReceipt,
  type PersistedChatContext,
} from '@bellum/contracts'
import type { AlertMeasure } from './observability-alerts'

/**
 * #3223.2 (#3198) — LE TABLEAU DE PILOTAGE DU RAISONNEMENT COMMERCIAL, calculé
 * sur le TRAFIC RÉEL. Le calcul, séparé du réseau et de l'horloge.
 *
 * ## Pourquoi ce fichier existe
 *
 * L'épopée #3223 disait les douze métriques « bloquées par le pipeline
 * d'échantillonnage production » (#2443.10, devenu l'opt-in par espace #2899 : anonymiser
 * et échantillonner des CONVERSATIONS). Or une partie de ces taux n'a besoin
 * d'aucune conversation : chaque tour persiste déjà, dans
 * `chat_messages.context` (liste blanche `persistedChatContext`), son reçu de
 * connaissance (`knowledge_receipt`), sa preuve d'exécution
 * (`turn_observability`) et, depuis #3223.1, sa trace de raisonnement
 * diagnostique (`reasoning_trace`). Ce sont des FAITS DE PRODUIT — jamais un
 * corps de message, jamais une personne (c64 : on mesure le produit, par
 * fonction, jamais un espace ni un utilisateur).
 *
 * La source est donc branchée sur ce qui existe ; ce qui ne sort pas reste
 * NOMMÉ dans {@link REASONING_QUALITY_NOT_MEASURED}, avec sa raison — jamais un
 * zéro, jamais un chiffre deviné. Le jugement « générique » vient d'un juge IA
 * ÉVALUÉ (décision Louis 11/10/2026), jamais d'une heuristique.
 *
 * ## La règle d'honnêteté
 *
 * Même discipline que `observability-alerts.ts` : une mesure sans assez de tours
 * est `unmeasured` et ne porte AUCUNE valeur ; un tour dont le champ manque
 * (tour d'avant ce champ) sort du dénominateur et se COMPTE (`excluded`).
 */

/** En dessous, un taux ne veut rien dire : refusé, avec sa raison. */
export const REASONING_QUALITY_MIN_SAMPLE = 10

/** Fenêtre de lecture des alertes de qualité : « sur plusieurs jours » (#3198), pas la seule journée. */
export const REASONING_ALERT_WINDOW_DAYS = 3

/** Un tour de Laura, réduit aux seuls faits diagnostiques dont les taux ont besoin. */
export type ReasoningTurnSample = {
  receipt?: Record<string, { status: string }>
  /** #3861 (Q13) — `capability_fallback` absent = tour d'avant le champ (#3861.5), jamais « pas de repli ». */
  observability?: { budget_exhausted: boolean; degraded_answer: boolean; capability_fallback?: boolean }
  trace?: {
    tools_planned: readonly string[]
    tools_called: readonly string[]
    verifier_status: string
    /** Le statut rendu par l'outil de verdict ce tour ; absent sans lui. */
    account_verdict?: string
    /** #3223 (X17) — une correction utilisateur a été reconnue ce tour ; absent = tour d'avant le champ. */
    correction_recognized?: boolean
    /** Au moins un outil invalidé par la correction a été rappelé ; absent = non décidable. */
    correction_rerun?: boolean
    /** #2442.15 (X17) — motifs du vérificateur ; absent = non vérifié ce tour. */
    verifier_reasons?: readonly string[]
    /** #3223 (lot R17) — rerun suivi d'une correction, verdict inchangé ; absent = non décidable. */
    correction_without_result_change?: boolean
    /** #3223 (lot R17) — `GO_AFTER_PROOF` sur un grand compte ; absent sauf ce cas précis. */
    large_account_without_access?: boolean
  }
}

/**
 * Les verdicts d'adéquation de compte (`get_account_suitability_verdict`) :
 * « défavorable » = Laura conseille de ne PAS y aller maintenant (le contre-
 * conseil mesurable). `NOT_EVALUABLE` n'est ni l'un ni l'autre : il sort du
 * dénominateur (GA-18/GA-19), jamais compté comme favorable.
 */
const FAVORABLE_VERDICTS: readonly string[] = ['GO_NOW', 'GO_VIA_PARTNER']
const UNFAVORABLE_VERDICTS: readonly string[] = ['GO_AFTER_PROOF', 'WATCH', 'NO_GO_NOW']
const ALTERNATIVES_TOOL = 'suggest_account_alternatives'

/** Les codes du vérificateur IA (`commercial_verifier.py`) lus ici — jamais recalculés (GA-26). */
const FALSE_SUCCESS_REASON = 'action_declaree_sans_preuve'
const WRONG_ZERO_REASON = 'inconnue_convertie_en_zero'
/** Codes OBSERVATIONNELS posés par `market_memory_citation.py` (lot E12) — jamais un motif de réparation. */
const MARKET_MEMORY_CITED_REASON = 'memoire_marche_citee'
const MARKET_MEMORY_UNCITED_REASON = 'memoire_marche_non_citee'

function verifierRaised(turn: ReasoningTurnSample, reason: string): boolean | null {
  const reasons = turn.trace?.verifier_reasons
  return reasons === undefined ? null : reasons.includes(reason)
}

/** Les couches INTERNES du reçu : tout sauf les sources publiques, la méthode et l'inférence. */
const INTERNAL_LAYERS: readonly string[] = [
  'workspace',
  'crm',
  'messaging',
  'agenda',
  'documents',
  'account_dossier',
  'dataforge',
  'market_memory',
]

/**
 * Ce qui ne sort pas — nommé avec sa raison, jamais à zéro.
 *
 * Décision Louis du 11/10/2026 (#3223) : le taux de recommandations génériques
 * se lit sur un DÉTECTEUR ÉVALUÉ ({@link genericRecommendationOf}), et les
 * comptes / secteurs les plus contestés en AGRÉGÉ sur au moins trois espaces
 * ({@link contestedRankingOf}). Reste nommé : un classement par NOM de compte —
 * un nom ne sort jamais d'un agrégat entre espaces (c92).
 */
export const REASONING_QUALITY_NOT_MEASURED: ReadonlyArray<{ metric: string; reason: string }> = [
  {
    metric: 'comptes les plus contestés, nommés',
    reason:
      'un nom de compte ne sort jamais d’un agrégat entre espaces (c92 : jamais un nom de client) — le classement se lit par taille de compte et par secteur, à partir de trois espaces (c64)',
  },
]

/**
 * #3861 (DEC-4036 Q13, Louis 19/10) — le TAUX DE REPLI IA. Seul le repli vers un modèle de capacité
 * moindre (`capability_fallback`, #3861.5) est porté par le contexte persisté du tour ; les deux
 * autres replis ne laissent qu'un journal. Nommés avec leur raison, jamais « 0 % ».
 */
export const REASONING_FALLBACK_NOT_MEASURED: ReadonlyArray<{ metric: string; reason: string }> = [
  {
    metric: 'bascule vers le modèle de secours (fournisseur indisponible)',
    reason:
      'la bascule de `llm_gateway` (#2440.69-72) est journalisée et alertée, jamais persistée par tour — aucun dénominateur lisible ici',
  },
  {
    metric: 'repli de la cohorte canary',
    reason:
      'l’appartenance d’un tour à la cohorte canary (#2443.9) n’est pas persistée dans son contexte — un taux par cohorte serait deviné',
  },
]

/** Un verdict du juge « recommandation générique » sur une réponse échantillonnée. */
export type GenericJudgementSample = { verdict: string; judgeVersion: string }

/**
 * Les tours dont la correction est décidable, comptés PAR ESPACE et par compte
 * (secteur NAF, effectif) — l'espace ne sert qu'à compter les contributeurs.
 */
export type ContestedSourceRow = {
  workspaceId: string
  nafCode: string | null
  employees: string | null
  /** Tours où une correction de l'utilisateur a été reconnue. */
  contested: number
  /** Tours où le champ de correction est posé (vrai ou faux). */
  decided: number
}

type MeasuredShare = Extract<AlertMeasure, { state: 'measured' }>

/** Une cellule du classement : un jeton fermé, jamais un nom ni un identifiant. */
type ContestedCell = { value: string; measure: MeasuredShare; contributingWorkspaces: number }

/** Au plus autant de lignes par classement : un palmarès, pas un export. */
const CONTESTED_RANKING_SIZE = 10

export type ReasoningQualityReport = {
  windowDays: number
  /** Tours lus (avec ou sans trace). */
  turns: number
  metrics: {
    marketMemoryRate: AlertMeasure
    publicOnlyRate: AlertMeasure
    ignoredToolsRate: AlertMeasure
    budgetInterruptedRate: AlertMeasure
    finalAnswerAfterBudgetRate: AlertMeasure
    dataforgeUnavailableRate: AlertMeasure
    internalSourceUnusedRate: AlertMeasure
    counterAdviceRate: AlertMeasure
    alternativesRate: AlertMeasure
    noGoWithoutAlternativesRate: AlertMeasure
    /** #3223 (X17) — part des tours où l'utilisateur a corrigé Laura (correction reconnue). */
    userCorrectionRate: AlertMeasure
    /** #3223 (X17) — part des corrections suivies d'un rerun d'un outil invalidé. */
    rerunAfterCorrectionRate: AlertMeasure
    /** #2442.15 (X17) — « fausse réussite » : part des tours vérifiés qui déclarent une action sans preuve. */
    falseSuccessRate: AlertMeasure
    /** #2442.15 (X17) — « mauvais zéro » : part des tours vérifiés qui convertissent un inconnu en zéro. */
    wrongZeroRate: AlertMeasure
    /**
     * #3223 (lot E12) — « Market Memory appelée mais non citée » : part des tours où la mémoire marché a
     * rendu une entreprise et où la réponse n'en nomme aucune. Hors dénominateur : tout tour sans résultat.
     */
    marketMemoryUncitedRate: AlertMeasure
    /**
     * #3223 (lot R17) — « correction sans changement de résultat » : part des corrections SUIVIES d'un
     * rerun (`correction_rerun: true`) dont le verdict de compte rendu ne change pas. Hors dénominateur :
     * tout tour sans rerun décidable, ou dont l'un des deux verdicts (avant/après) est inconnu.
     */
    correctionWithoutResultChangeRate: AlertMeasure
    /**
     * #3223 (lot R17) — « GO sur grand compte sans accès » : part des verdicts `GO_AFTER_PROOF` rendus
     * pour un compte de 5000 salariés et plus. Hors dénominateur : tout tour sans verdict `GO_AFTER_PROOF`.
     */
    goLargeAccountWithoutAccessRate: AlertMeasure
    /** #3861 (Q13) — part des tours servis sur un modèle de capacité moindre (`capability_fallback`). */
    capabilityFallbackRate: AlertMeasure
  }
  /** #3861 (Q13) — les replis IA non portés par la trace, nommés avec leur raison. */
  fallbackNotMeasured: ReadonlyArray<{ metric: string; reason: string }>
  /** Une part par couche, dans l'ordre du contrat (`KNOWLEDGE_RECEIPT_LAYERS`). */
  sourceRoute: ReadonlyArray<{ layer: string; measure: AlertMeasure }>
  /**
   * #3223 (décision Louis 11/10) — le taux de réponses génériques, lu sur les verdicts du juge IA.
   * `measure: null` tant que le juge est non fiable : JAMAIS un chiffre nu.
   */
  genericRecommendation: { judge: GenericJudgeReliability; measure: AlertMeasure | null }
  /** #3223 (décision Louis 11/10) — part des tours corrigés, par secteur et par taille, ≥ 3 espaces. */
  contested: { minWorkspaces: number; bySector: ContestedCell[]; bySize: ContestedCell[] }
  notMeasured: ReadonlyArray<{ metric: string; reason: string }>
}

function share(hits: number, sample: number, excluded: number): AlertMeasure {
  if (sample === 0) return { state: 'unmeasured', reason: 'no_observation', sample: 0, excluded }
  if (sample < REASONING_QUALITY_MIN_SAMPLE)
    return { state: 'unmeasured', reason: 'sample_too_small', sample, excluded }
  return { state: 'measured', value: Math.round((hits / sample) * 10000) / 100, sample, excluded }
}

/**
 * Une part en % sur les tours que `classify` sait trancher : `true`/`false`
 * entrent au dénominateur, `null` (champ absent ou hors sujet) en sort et se
 * compte.
 */
function rate(
  turns: readonly ReasoningTurnSample[],
  classify: (t: ReasoningTurnSample) => boolean | null,
): AlertMeasure {
  let hits = 0
  let sample = 0
  let excluded = 0
  for (const turn of turns) {
    const verdict = classify(turn)
    if (verdict === null) excluded += 1
    else {
      sample += 1
      if (verdict) hits += 1
    }
  }
  return share(hits, sample, excluded)
}

function isConsulted(turn: ReasoningTurnSample, layer: string): boolean | null {
  if (!turn.receipt) return null
  return turn.receipt[layer]?.status === 'consulted'
}

/**
 * Le taux de recommandations génériques. Juge non fiable (accord sous le seuil
 * écrit, ou pas encore mesuré) : AUCUNE valeur, la raison est dans `judge`.
 * Hors dénominateur : les réponses sans recommandation, et les verdicts d'un
 * autre juge que le juge calibré.
 */
function genericRecommendationOf(
  judgements: readonly GenericJudgementSample[],
  judge: GenericJudgeReliability,
): ReasoningQualityReport['genericRecommendation'] {
  if (judge.state !== 'reliable') return { judge, measure: null }
  let hits = 0
  let sample = 0
  for (const j of judgements) {
    if (j.judgeVersion !== judge.judgeVersion || (j.verdict !== 'generique' && j.verdict !== 'specifique')) continue
    sample += 1
    if (j.verdict === 'generique') hits += 1
  }
  return { judge, measure: share(hits, sample, judgements.length - sample) }
}

/**
 * Le classement des tours CORRIGÉS, mutualisé par `poolSharedCells` : une
 * cellule portée par moins de trois espaces ne sort pas (c64, c92), une cellule
 * sous {@link REASONING_QUALITY_MIN_SAMPLE} tours non plus. Aucun identifiant
 * d'espace en sortie ; un secteur ou un effectif illisible ne fait pas de cellule.
 */
function contestedRankingOf(rows: readonly ContestedSourceRow[]): ReasoningQualityReport['contested'] {
  const rank = (key: (row: ContestedSourceRow) => string | null): ContestedCell[] =>
    poolSharedCells(
      rows.flatMap(row => {
        const value = key(row)
        return value && row.decided > 0
          ? [
              {
                workspaceId: row.workspaceId,
                cell: { value },
                counts: { contested: row.contested, decided: row.decided },
              },
            ]
          : []
      }),
    )
      .flatMap(({ cell, counts, contributingWorkspaces }) => {
        const measure = share(counts.contested, counts.decided, 0)
        return measure.state === 'measured' ? [{ value: cell.value, measure, contributingWorkspaces }] : []
      })
      .sort((a, b) => b.measure.value - a.measure.value || a.value.localeCompare(b.value))
      .slice(0, CONTESTED_RANKING_SIZE)
  return {
    minWorkspaces: SHARED_BASE_MIN_WORKSPACES,
    bySector: rank(row => sectorKeyOfNaf(row.nafCode)),
    bySize: rank(row => sizeBandOfEmployees(row.employees)),
  }
}

export function buildReasoningQualityReport(
  turns: readonly ReasoningTurnSample[],
  windowDays: number,
  extra: {
    judgements?: readonly GenericJudgementSample[]
    contested?: readonly ContestedSourceRow[]
    /** Injectable pour les tests ; par défaut, la calibration livrée (`@bellum/contracts`). */
    reliability?: GenericJudgeReliability
  } = {},
): ReasoningQualityReport {
  return {
    windowDays,
    turns: turns.length,
    metrics: {
      marketMemoryRate: rate(turns, t => isConsulted(t, 'market_memory')),
      publicOnlyRate: rate(turns, t => {
        if (!t.receipt) return null
        return (
          isConsulted(t, 'current_public_sources') === true && !INTERNAL_LAYERS.some(l => isConsulted(t, l) === true)
        )
      }),
      // Hors sujet (aucun outil prévu par la route) : sort du dénominateur.
      ignoredToolsRate: rate(turns, t => {
        if (!t.trace || t.trace.tools_planned.length === 0) return null
        return !t.trace.tools_called.some(tool => t.trace?.tools_planned.includes(tool))
      }),
      budgetInterruptedRate: rate(turns, t => (t.observability ? t.observability.budget_exhausted : null)),
      // Seuls les tours dont le budget est épuisé peuvent « répondre après » ;
      // ceux qui l'ont fait SANS passer en réponse dégradée sont les cas à voir.
      finalAnswerAfterBudgetRate: rate(turns, t => {
        if (!t.observability?.budget_exhausted) return null
        return !t.observability.degraded_answer
      }),
      // « Non demandé » n'est pas une absence : seuls comptent les tours où la
      // couche était consultée ou devait l'être.
      dataforgeUnavailableRate: rate(turns, t => {
        const status = t.receipt?.['dataforge']?.status
        if (status === 'consulted') return false
        if (status === 'unavailable') return true
        return null
      }),
      // Aucune couche INTERNE consultée : Laura a répondu sans rien lire de
      // ce que l'espace sait. Un tour sans reçu sort du dénominateur.
      internalSourceUnusedRate: rate(turns, t =>
        t.receipt ? !INTERNAL_LAYERS.some(l => isConsulted(t, l) === true) : null,
      ),
      // Part des verdicts rendus qui déconseillent d'y aller maintenant.
      counterAdviceRate: rate(turns, t => {
        const verdict = t.trace?.account_verdict
        if (!verdict || ![...FAVORABLE_VERDICTS, ...UNFAVORABLE_VERDICTS].includes(verdict)) return null
        return UNFAVORABLE_VERDICTS.includes(verdict)
      }),
      // Un verdict défavorable DOIT ouvrir une suite : part de ceux où
      // l'outil d'alternatives a été appelé.
      alternativesRate: rate(turns, t => {
        const verdict = t.trace?.account_verdict
        if (!verdict || !UNFAVORABLE_VERDICTS.includes(verdict)) return null
        return t.trace?.tools_called.includes(ALTERNATIVES_TOOL) ?? null
      }),
      noGoWithoutAlternativesRate: rate(turns, t => {
        if (t.trace?.account_verdict !== 'NO_GO_NOW') return null
        return !t.trace.tools_called.includes(ALTERNATIVES_TOOL)
      }),
      // Champ absent (tour d'avant) : hors dénominateur, jamais « pas de correction ».
      userCorrectionRate: rate(turns, t => t.trace?.correction_recognized ?? null),
      // Seules les corrections dont le rerun est décidable (invalidation nommée).
      rerunAfterCorrectionRate: rate(turns, t => {
        if (t.trace?.correction_recognized !== true) return null
        return t.trace.correction_rerun ?? null
      }),
      // Seuls les tours VÉRIFIÉS entrent au dénominateur (`verifier_reasons` présent,
      // même vide) : un tour non vérifié n'est pas « sans fausse réussite ».
      falseSuccessRate: rate(turns, t => verifierRaised(t, FALSE_SUCCESS_REASON)),
      wrongZeroRate: rate(turns, t => verifierRaised(t, WRONG_ZERO_REASON)),
      marketMemoryUncitedRate: rate(turns, t => {
        const reasons = t.trace?.verifier_reasons
        if (reasons?.includes(MARKET_MEMORY_UNCITED_REASON)) return true
        return reasons?.includes(MARKET_MEMORY_CITED_REASON) ? false : null
      }),
      // Seules les corrections dont le rerun est DÉCIDABLE (#3223, lot R17) : la trace
      // ne pose `correction_without_result_change` que quand les deux verdicts sont connus.
      correctionWithoutResultChangeRate: rate(turns, t => t.trace?.correction_without_result_change ?? null),
      // `large_account_without_access` n'est posé QUE sur un `GO_AFTER_PROOF` ; son
      // absence sur un AUTRE verdict n'est pas un « non » (hors dénominateur).
      goLargeAccountWithoutAccessRate: rate(turns, t => {
        if (t.trace?.account_verdict !== 'GO_AFTER_PROOF') return null
        return t.trace?.large_account_without_access ?? false
      }),
      // #3861 (Q13) — champ absent (tour d'avant #3861.5) : hors dénominateur, jamais « pas de repli ».
      capabilityFallbackRate: rate(turns, t => t.observability?.capability_fallback ?? null),
    },
    fallbackNotMeasured: REASONING_FALLBACK_NOT_MEASURED,
    sourceRoute: KNOWLEDGE_RECEIPT_LAYERS.map(layer => ({ layer, measure: rate(turns, t => isConsulted(t, layer)) })),
    genericRecommendation: genericRecommendationOf(
      extra.judgements ?? [],
      extra.reliability ?? genericJudgeReliability(),
    ),
    contested: contestedRankingOf(extra.contested ?? []),
    notMeasured: REASONING_QUALITY_NOT_MEASURED,
  }
}

/**
 * Un contexte persisté → l'échantillon d'un tour, ou `null` s'il est illisible.
 * Prend la valeur DÉJÀ passée par la liste blanche (`persistedChatContext`) :
 * aucun champ hors liste n'entre, aucun corps de message non plus.
 */
export function reasoningTurnFromContext(context: PersistedChatContext | null): ReasoningTurnSample | null {
  if (!context) return null
  const receipt: KnowledgeReceipt | undefined = context.knowledge_receipt
  return {
    receipt: receipt ? (receipt as Record<string, { status: string }>) : undefined,
    observability: context.turn_observability
      ? {
          budget_exhausted: context.turn_observability.budget_exhausted,
          degraded_answer: context.turn_observability.degraded_answer,
          ...(context.turn_observability.capability_fallback === undefined
            ? {}
            : { capability_fallback: context.turn_observability.capability_fallback }),
        }
      : undefined,
    trace: context.reasoning_trace,
  }
}
