import { ACCOUNT_SCORE_GO_MIN, parseAccountAnalysis, type Account } from '@bellum/contracts'
import { safeArray, safeString } from '../../helpers/safe'
import { evaluationField, readDossierReliability, readStoredVerdict } from '../useAccountOverviewData'
import { type DossierReadView, readDossierRead } from './dossierReadViewData'
import { type ScoreFactorView, normalizeScoreFactors } from './scoreFactors'

type EvaluationRecord = Record<string, unknown>

/** 5 axes × 5 points (Annexe méthodo p25). */
const SCORE_25_MAX = 25

// #2307.19 — `non_evaluable` : aucune des trois sources externes de la
// collecte (Brave/Firecrawl/Pappers) n'a répondu, donc il n'y a rien à juger
// — distinct de `low`, qui dit qu'on a jugé et que c'est mauvais.
export type ConfidenceTier = 'non_evaluable' | 'low' | 'medium' | 'high'

/**
 * Un quick win ou un risque, avec sa DATE de recalcul et sa PREUVE (Théo,
 * restitution TF1 p28 : « Quick wins et risques doivent être recalculés après
 * chaque enrichissement, avec preuve et date »).
 *
 * Jusqu'ici l'écran n'affichait qu'une phrase aplatie : deux items identiques —
 * l'un tiré d'un signal sourcé de la semaine, l'autre d'une intuition — se
 * lisaient exactement pareil. Les quatre champs de traçabilité sont tous
 * facultatifs : un dossier produit avant cette PR n'en a aucun, et l'écran doit
 * alors ne rien dire plutôt qu'inventer une date ou une preuve.
 */
export type EvidenceItem = {
  /** La phrase déjà rendue avant cette PR — inchangée. */
  text: string
  /** ISO-8601 du dernier recalcul de l'item. `null` = dossier antérieur. */
  computedAt: string | null
  /** Taxonomie partagée avec les facteurs de score. `null` = aucune preuve. */
  proofType: string | null
  /** Libellé de la preuve (contact du dossier, signal sourcé, offre de l'ESN). */
  proof: string | null
  /** Date PROPRE à la preuve (celle du signal), jamais celle du recalcul. */
  proofDate: string | null
}

export type EvaluationViewData = {
  /** #3680.5 — `null` = aucun score sur le dossier (jamais « 0 » pour une absence) ; 0 = une mesure posée. */
  score: number | null
  /** Le score commercial CANONIQUE sur 25 (Annexe méthodo p25 : 5 axes × 5),
   *  tel que l'IA le calcule et le persiste (`evaluation.score`). `null` quand
   *  le dossier n'en porte pas — on n'invente jamais une note. Le `score` /10
   *  ci-dessus reste la projection historique, lue par la liste des comptes. */
  score25: number | null
  goNoGo: string
  /** D10 (Louis 05/10) — palier posé « non arbitré » (`raw_analysis.score_unarbitrated`) : aucun verdict tranché n'en découle. */
  scoreUnarbitrated?: boolean
  justification: string
  recommendation: string
  quickWins: EvidenceItem[]
  risks: EvidenceItem[]
  // Data confidence /100 — the "confiance donnée", DISTINCT from the commercial
  // verdict (Théo p.33/p.11: afficher score commercial ET confiance donnée).
  confidence: number | null
  // Tier of that confidence (low/medium/high) — drives the greying when the data
  // is weak, so the front reads the confidence axis, not just the number.
  confidenceTier: ConfidenceTier | null
  // Commercial score on 0-100 (band-faithful with the /10 ``score`` gauge) —
  // the explicit business-fit axis emitted by the IA. Optional / backward-compat.
  commercialScore: number | null
  // Evidence: each factor of the commercial score tied to a proof (Théo P1).
  scoreFactors: ScoreFactorView[]
  // Score plafonné par le Quality Judge (hallucination / trop_faible) — Wave 1a.
  qualityCapped: boolean
  qualityCapReason: string | null
  hasEvaluation: boolean
  /** #2932 — `dossier_read.no_go.trigger` : distingue les deux visages de STOP
   *  dans le verdict NOMMÉ (METTRE EN VEILLE vs ÉCARTER POUR CET OBJECTIF). */
  hasNoGoTrigger: boolean
  /** #4016.L9.a — la lecture en sept axes, LA MÊME que lit la Vue d'ensemble (`useAccountOverviewData`) :
   *  le décompte « N axes sur 7 » et les axes non mesurés NOMMÉS viennent d'ici, jamais d'un recalcul. */
  dossierRead?: DossierReadView | null
}

/**
 * #2786/#2285.9 — « par où ouvrir ce compte » (`strategy`/`entryPoints`) a
 * QUITTÉ cette vue. Elle reparsait `raw_analysis.comment_ouvrir_compte`
 * elle-même — la MÊME normalisation que refaisait, séparément, l'onglet
 * Analyser (`useAccountOverviewData`). `OpenAccountCard` lit désormais ce
 * fait au contexte canonique (`accountOpeningStrategyView`,
 * `useAccountIntelligenceContext`), qui l'arbitre une seule fois pour les
 * deux onglets — voir `sections/accountOpeningStrategy.ts`.
 */
export function buildEvaluationViewData(account: Account): EvaluationViewData {
  const raw = (account.raw_analysis || {}) as EvaluationRecord
  const plan = readRecord(raw['plan'])
  const evalData = mergeRecords(
    readRecord(raw['evaluation']),
    readRecord(plan?.['evaluation']),
    readRecord(raw['evaluation_compte']),
  )
  const parsed = parseAccountAnalysis(raw)
  const score = readScore(account, evalData)
  const score25 = readScore25(evalData)
  // Même lecture que `dossierReadViewData.normalizeNoGo` : `evaluation.dossier_read.no_go.trigger`.
  const noGoRecord = readRecord(readRecord(evalData?.['dossier_read'])?.['no_go'])
  const hasNoGoTrigger = Boolean(safeString(noGoRecord?.['trigger']))
  const data = {
    score,
    score25,
    // #4016.L9.a — le verdict STOCKÉ que lit la Vue d'ensemble (grille de l'espace, puis `verdict`,
    // puis miroirs legacy) ; `readDecision` ne reste que le repli d'un dossier sans verdict.
    goNoGo: readStoredVerdict(parsed)?.toUpperCase() ?? readDecision(evalData, score),
    scoreUnarbitrated: raw['score_unarbitrated'] === true,
    justification: readJustification(account, evalData),
    recommendation: safeString(evalData?.['recommandation'] ?? evalData?.['recommendation']),
    quickWins: normalizeCombinedLists(evalData?.['quick_wins'], plan?.['quick_wins'], raw['quick_wins']),
    risks: normalizeCombinedLists(evalData?.['risks'], plan?.['risks'], raw['risks']),
  }

  // 14/10/2026 — UNE seule lecture de la fiabilité, celle de la Vue d'ensemble
  // (confidence.score → plan.data_confidence → data_confidence), GA-26 : le Score
  // disait « jamais calculée » là où la Vue d'ensemble affichait 58/100.
  const reliability = readDossierReliability(raw, parsed)
  const legacyScore = readRecord(raw['confidence'])?.['score'] ?? raw['confidence_score']
  const confidence = reliability.value ?? (typeof legacyScore === 'number' ? Math.round(legacyScore) : null)
  const confidenceTier = reliability.tier

  // Two explicit axes (Théo P1) live on the phase-4 plan payload (camelCase),
  // fall back to the snake mirror / top level; never fabricated.
  const commercialRaw = plan?.['commercialScore'] ?? plan?.['commercial_score'] ?? raw['commercial_score']
  const commercialScore = typeof commercialRaw === 'number' ? Math.round(commercialRaw) : null
  const scoreFactors = normalizeScoreFactors(plan?.['scoreFactors'] ?? plan?.['score_factors'] ?? raw['score_factors'])

  const fullData = {
    ...data,
    confidence,
    confidenceTier,
    commercialScore,
    scoreFactors,
    qualityCapped: Boolean(evalData?.['qualityCapped'] ?? evalData?.['quality_capped']),
    qualityCapReason: safeString(evalData?.['qualityCapReason'] ?? evalData?.['quality_cap_reason']) || null,
    hasNoGoTrigger,
    dossierRead: readDossierRead(evaluationField(parsed, 'dossier_read')),
  }

  return { ...fullData, hasEvaluation: hasEvaluationData(fullData) }
}

function readScore(account: Account, evalData: EvaluationRecord | null): number | null {
  // #3680.5 — une absence n'est pas « 0 » : chaque source ne compte que si elle porte un NOMBRE.
  const finite = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const accountScore = finite(account.priority_score)
  const evalScore = finite(evalData?.['score_global'] ?? evalData?.['global_score'] ?? evalData?.['globalScore'])
  // Comme avant : le score du dossier d'abord, celui de l'évaluation s'il est nul ; un zéro posé reste un zéro.
  const chosen = accountScore !== null && accountScore !== 0 ? accountScore : (evalScore ?? accountScore)
  return chosen === null ? null : normalizeScore(chosen)
}

function readDecision(evalData: EvaluationRecord | null, score: number | null) {
  // `verdict` est le verdict CANONIQUE de la grille /25 (GO / PRUDENT / STOP /
  // EXPLORER). `goNoGo` est son miroir legacy, qui écrase EXPLORER en
  // « CONDITIONNEL » : le lire en premier faisait disparaître le verdict que
  // l'analyse avait réellement rendu. Canonique d'abord, legacy en repli.
  const canonical = safeString(evalData?.['verdict'])
  if (canonical && canonical !== '—') return canonical.toUpperCase()
  const value = safeString(evalData?.['go_no_go'] ?? evalData?.['goNoGo'])
  if (value && value !== '—') return value.toUpperCase()
  if (score === null || score === 0) return 'À QUALIFIER'
  // Repli à DEUX verdicts — c'est un choix de cet écran, et il le garde. Mais la
  // COUPURE vient du contrat (GA-56) : elle est la même que celle du badge, du
  // filtre serveur et de l'export PDF.
  return score >= ACCOUNT_SCORE_GO_MIN ? 'GO' : 'NO-GO'
}

/** Le /25 canonique (`evaluation.score`), borné à sa plage. `null` = absent du
 *  dossier : l'écran retombe alors sur la projection /10, sans rien inventer. */
function readScore25(evalData: EvaluationRecord | null): number | null {
  const raw = evalData?.['score']
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null
  return Math.max(0, Math.min(SCORE_25_MAX, Math.round(raw)))
}

function readJustification(account: Account, evalData: EvaluationRecord | null) {
  const priority =
    typeof account.priority_justification === 'string'
      ? account.priority_justification
      : safeString((account.priority_justification as { overall?: string } | null)?.overall)
  return safeString(evalData?.['justification']) || priority
}

function normalizeStringList(value: unknown): EvidenceItem[] {
  return safeArray(value)
    .map(item => {
      const record = readRecord(item)
      // Un item peut être une chaîne libre (ancien dossier) : il reste lisible,
      // simplement sans date ni preuve — jamais avec une date inventée.
      if (!record) return { text: safeString(item), ...NO_EVIDENCE }
      return {
        text: stringifyRecordItem(record),
        computedAt: safeString(record['computed_at'] ?? record['computedAt']) || null,
        proofType: safeString(record['proof_type'] ?? record['proofType']) || null,
        proof: safeString(record['proof']) || null,
        proofDate: safeString(record['proof_date'] ?? record['proofDate']) || null,
      }
    })
    .filter(item => Boolean(item.text))
}

const NO_EVIDENCE = { computedAt: null, proofType: null, proof: null, proofDate: null } as const

/** Fusionne les emplacements historiques d'une même liste (plan / evaluation /
 *  racine) en dédoublonnant par TEXTE — la première occurrence gagne, donc la
 *  plus proche du plan, celle qui porte la date et la preuve. */
function normalizeCombinedLists(...values: unknown[]): EvidenceItem[] {
  const seen = new Set<string>()
  const out: EvidenceItem[] = []
  for (const item of values.flatMap(normalizeStringList)) {
    if (seen.has(item.text)) continue
    seen.add(item.text)
    out.push(item)
  }
  return out
}

function stringifyRecordItem(record: EvaluationRecord) {
  const title = safeString(
    record['action'] ?? record['risk'] ?? record['title'] ?? record['label'] ?? record['message'],
  )
  const details = record['risk'] ? riskDetails(record) : quickWinDetails(record)

  return details.length > 0 ? `${title} — ${details.join(' · ')}` : title
}

function quickWinDetails(record: EvaluationRecord) {
  return [
    safeString(record['contact']),
    safeString(record['channel']),
    safeString(record['time_required'] ?? record['timeline']),
    safeString(record['expected_impact']),
  ].filter(Boolean)
}

function riskDetails(record: EvaluationRecord) {
  return [safeString(record['probability']), safeString(record['impact']), safeString(record['mitigation'])].filter(
    Boolean,
  )
}

function hasEvaluationData(data: Omit<EvaluationViewData, 'hasEvaluation'>) {
  return Boolean(
    (data.score !== null && data.score > 0) ||
    data.justification ||
    data.recommendation ||
    data.quickWins.length > 0 ||
    data.risks.length > 0,
  )
}

function readRecord(value: unknown): EvaluationRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as EvaluationRecord) : null
}

function mergeRecords(...records: Array<EvaluationRecord | null>) {
  const merged = Object.assign({}, ...records.filter(Boolean))
  return Object.keys(merged).length > 0 ? merged : null
}

function normalizeScore(value: number) {
  const score = value > 10 ? value / 10 : value
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10))
}
