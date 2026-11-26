// Client pour le tableau de pilotage du raisonnement commercial de Laura
// (GET /internal/analytics/reasoning-quality, gardé par InternalSecretGuard).
// Server-side only — le secret interne ne doit jamais atteindre le navigateur.
//
// #3223.4 (#3198) — même patron que `unrouted-intents.client.ts` : fetch côté
// serveur, `x-internal-secret`, jamais de cache. Les formes ci-dessous sont un
// MIROIR de `ReasoningQualityReport` (`apps/api/src/modules/analytics/
// reasoning-quality.ts`) — les deux applications se déploient séparément.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** Une mesure : `unmeasured` ne porte AUCUNE valeur — jamais « 0 ». */
export type MesureRaisonnement =
  | { state: 'measured'; value: number; sample: number; excluded: number }
  | { state: 'unmeasured'; reason: 'no_observation' | 'sample_too_small'; sample: number; excluded: number }

/** MIROIR de `GenericJudgeReliability` (`@bellum/contracts`). */
export type FiabiliteJuge =
  | {
      state: 'reliable'
      judgeVersion: string
      agreementPercent: number
      agreed: number
      judged: number
      thresholdPercent: number
      measuredAt: string
    }
  | {
      state: 'unreliable'
      reason: 'not_measured' | 'incomplete' | 'too_few_cases' | 'below_threshold'
      judgeVersion: string
      agreementPercent?: number
      agreed?: number
      judged?: number
      thresholdPercent: number
    }

/** Une ligne du classement : un jeton fermé (secteur NAF, taille INSEE), jamais un nom. */
type CelluleContestee = {
  value: string
  measure: Extract<MesureRaisonnement, { state: 'measured' }>
  contributingWorkspaces: number
}

export type RapportRaisonnement = {
  windowDays: number
  turns: number
  metrics: {
    marketMemoryRate: MesureRaisonnement
    publicOnlyRate: MesureRaisonnement
    ignoredToolsRate: MesureRaisonnement
    budgetInterruptedRate: MesureRaisonnement
    finalAnswerAfterBudgetRate: MesureRaisonnement
    dataforgeUnavailableRate: MesureRaisonnement
    internalSourceUnusedRate: MesureRaisonnement
    counterAdviceRate: MesureRaisonnement
    alternativesRate: MesureRaisonnement
    noGoWithoutAlternativesRate: MesureRaisonnement
    userCorrectionRate: MesureRaisonnement
    rerunAfterCorrectionRate: MesureRaisonnement
    falseSuccessRate: MesureRaisonnement
    wrongZeroRate: MesureRaisonnement
    marketMemoryUncitedRate: MesureRaisonnement
    /** #3223 (lot R17) — part des corrections suivies d'un rerun dont le verdict ne change pas. */
    correctionWithoutResultChangeRate: MesureRaisonnement
    /** #3223 (lot R17) — part des verdicts GO_AFTER_PROOF rendus pour un grand compte. */
    goLargeAccountWithoutAccessRate: MesureRaisonnement
    /** #3861 (Q13) — part des tours servis sur un modèle de capacité moindre. Absent = API d'avant ce champ. */
    capabilityFallbackRate?: MesureRaisonnement
  }
  sourceRoute: Array<{ layer: string; measure: MesureRaisonnement }>
  /** #3223 (décision Louis 11/10) — `measure: null` tant que le juge est non fiable : jamais un chiffre nu. */
  genericRecommendation: { judge: FiabiliteJuge; measure: MesureRaisonnement | null }
  /** #3223 (décision Louis 11/10) — tours corrigés, par secteur et par taille, portés par ≥ 3 espaces. */
  contested: { minWorkspaces: number; bySector: CelluleContestee[]; bySize: CelluleContestee[] }
  notMeasured: Array<{ metric: string; reason: string }>
  /** #3861 (Q13) — les replis IA non portés par la trace, nommés avec leur raison. Absent = API d'avant ce champ. */
  fallbackNotMeasured?: Array<{ metric: string; reason: string }>
}

export async function fetchReasoningQuality(days?: number): Promise<RapportRaisonnement> {
  const url = new URL('/internal/analytics/reasoning-quality', REAL_BASE)
  if (days !== undefined) url.searchParams.set('days', String(days))
  const res = await fetch(url, { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`reasoning-quality endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RapportRaisonnement
}
