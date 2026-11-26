/**
 * #2448.8 / #2882.11 (épopée #2882) — ce que `chat()` sait du tour qui vient
 * de finir, pour `ChatTurnCostEstimateService.record()`.
 *
 * Logique PURE, séparée du contrôleur pour rester testable sans instancier
 * les vingt-quelques dépendances de `IaProxyController` (même raison que
 * `chat-turn-trace.ts`).
 */

/** Le palier RÉELLEMENT choisi par le service IA (`tier_decision.tier`) — jamais recalculé ici, jamais deviné. */
export function extractChatTier(envelopeData: Record<string, unknown> | undefined): 'fast' | 'deep' | null {
  const context = envelopeData?.['context']
  if (!context || typeof context !== 'object') return null
  const modeExplanation = (context as Record<string, unknown>)['mode_explanation']
  if (!modeExplanation || typeof modeExplanation !== 'object') return null
  const tier = (modeExplanation as Record<string, unknown>)['tier']
  return tier === 'fast' || tier === 'deep' ? tier : null
}

/**
 * Le coût de CE tour, à partir des lignes déjà parsées du header
 * `x-bellum-costs` (`ProviderCostService.parseHeader`, jamais reparsé ici).
 *
 * `0` (vrai zéro) si aucun fournisseur n'a été appelé — il n'y avait rien à
 * tarifer. `null` (non mesuré) si des fournisseurs ont été appelés mais
 * qu'aucune de leurs lignes n'est tarifée — jamais confondu avec `0`.
 */
export function deriveChatTurnCostUsd(rows: { cost_usd: number | null }[]): number | null {
  if (rows.length === 0) return 0
  const tariffed = rows.flatMap(row => (row.cost_usd === null ? [] : [row.cost_usd]))
  if (tariffed.length === 0) return null
  return Math.round(tariffed.reduce((sum, value) => sum + value, 0) * 10_000) / 10_000
}
