/**
 * #2448.8 / #2882.11 (épopée #2882) — ce que `ResearchModeSelector` annonce
 * AVANT de lancer un tour Vérifié/Approfondi, à partir de la mesure serveur
 * (ou de son absence) — même patron que `enrichmentDurationAnnouncement`
 * (#2120.57 / #2297.23).
 */

type ChatModeCostEstimate = { measured: true; avgCostUsd: number } | { measured: false }

export type ChatModeEstimate = {
  durationMs: number
  sampleSize: number
  cost: ChatModeCostEstimate
} | null

type ChatModeEstimateAnnouncement =
  | { key: 'composer.researchMode.estimate.unknown' }
  | { key: 'composer.researchMode.estimate.durationUnderSecond'; params: { sampleSize: number } }
  | { key: 'composer.researchMode.estimate.duration'; params: { seconds: number; sampleSize: number } }
  | {
      key: 'composer.researchMode.estimate.durationAndCost'
      params: { seconds: number; cost: string; sampleSize: number }
    }
  | {
      key: 'composer.researchMode.estimate.durationUnderSecondAndCost'
      params: { cost: string; sampleSize: number }
    }

/** `0,01` mini — une valeur réelle sous ce plancher se dit « < 0,01 $ », jamais `0,00 $` (GA-18/19). */
const MIN_DISPLAYED_COST_USD = 0.01

function formatCost(avgCostUsd: number): string {
  return avgCostUsd < MIN_DISPLAYED_COST_USD ? '< 0,01' : avgCostUsd.toFixed(2)
}

export function chatModeEstimateAnnouncement(estimate: ChatModeEstimate): ChatModeEstimateAnnouncement {
  if (!estimate) return { key: 'composer.researchMode.estimate.unknown' }

  const { durationMs, sampleSize, cost } = estimate
  const seconds = Math.round(durationMs / 1000)
  const cost$ = cost.measured ? formatCost(cost.avgCostUsd) : null

  // #2120.57 (b) même garde que l'enrichissement : une durée réelle sous 500 ms
  // arrondirait à `0 s` (GA-18/19 interdit un `0` chiffré pour une mesure réelle).
  if (seconds === 0) {
    return cost$
      ? { key: 'composer.researchMode.estimate.durationUnderSecondAndCost', params: { cost: cost$, sampleSize } }
      : { key: 'composer.researchMode.estimate.durationUnderSecond', params: { sampleSize } }
  }

  return cost$
    ? { key: 'composer.researchMode.estimate.durationAndCost', params: { seconds, cost: cost$, sampleSize } }
    : { key: 'composer.researchMode.estimate.duration', params: { seconds, sampleSize } }
}
