import { resolveMarketMemoryGroundTruthMetric, type MarketMemoryGroundTruthMetrics } from '@bellum/contracts'
import type { MarketMemoryGroundTruthJudgmentEntity } from '../../database/entities/market-memory-ground-truth-judgment.entity'

/**
 * #1622 — LES SIX MÉTRIQUES, calculées sur les jugements COURANTS (un par cas,
 * le plus récent — voir `currentJudgmentRows` dans le service).
 *
 * ⚠️ GA-285 (`architecture/market-memory-ground-truth-metric-floor.spec.ts`)
 * vérifie que ce fichier est le SEUL, avec `resolveMarketMemoryGroundTruthMetric`
 * lui-même, à diviser un compte de jugements « qualifiants » par un total pour
 * une métrique de vérité terrain. N'ajoute jamais un `qualifying / total` à la
 * main ailleurs — passe TOUJOURS par `resolveMarketMemoryGroundTruthMetric`,
 * qui seul sait dire « non mesuré » sous le seuil.
 *
 * ⚠️ Chaque compte ci-dessous est un COMPTAGE DIRECT (un `.filter(...).length`)
 * sur les jugements réels, jamais une soustraction (`total - autreChose`) : les
 * comptes s'additionnent jusqu'au dénominateur, ils ne se déduisent jamais —
 * sans quoi `plausible` et `unknown` disparaîtraient silencieusement d'un
 * calcul qui se croit exhaustif.
 */

function countByLabel(rows: readonly MarketMemoryGroundTruthJudgmentEntity[], label: string): number {
  return rows.filter(row => row.label === label).length
}

function rowsWithRankAtMost(rows: readonly MarketMemoryGroundTruthJudgmentEntity[], maxRank: number) {
  return rows.filter(row => row.hadReading && row.readingRank !== null && row.readingRank <= maxRank)
}

export function computeMarketMemoryGroundTruthMetrics(
  rows: readonly MarketMemoryGroundTruthJudgmentEntity[],
): MarketMemoryGroundTruthMetrics {
  const total = rows.length

  const top3 = rowsWithRankAtMost(rows, 3)
  const top10 = rowsWithRankAtMost(rows, 10)

  return {
    // Des trois premiers rangs que la mémoire propose, combien sont jugés
    // « utile et correct » ? Dénominateur : les jugements qui PORTENT un rang
    // ≤ 3 — pas le total du corpus, qui inclurait des cas sans lecture rangée.
    precision_at_3: resolveMarketMemoryGroundTruthMetric({
      qualifying: countByLabel(top3, 'useful_and_correct'),
      total: top3.length,
    }),
    precision_at_10: resolveMarketMemoryGroundTruthMetric({
      qualifying: countByLabel(top10, 'useful_and_correct'),
      total: top10.length,
    }),
    // Une lecture positivement fausse : soit induisant en erreur, soit
    // rapprochée de la mauvaise entreprise. Les deux labels comptent un
    // « faux positif » de nature différente, additionnés au numérateur.
    false_positive_rate: resolveMarketMemoryGroundTruthMetric({
      qualifying: countByLabel(rows, 'misleading') + countByLabel(rows, 'wrong_entity'),
      total,
    }),
    // La mémoire avait-elle QUELQUE CHOSE à dire sur ce couple précis, jugé
    // par un humain ? Mesure NOTRE corpus sur le panel de vérité terrain —
    // jamais « le marché fait X %» (doctrine c65).
    coverage: resolveMarketMemoryGroundTruthMetric({
      qualifying: rows.filter(row => row.hadReading).length,
      total,
    }),
    entity_resolution_failure: resolveMarketMemoryGroundTruthMetric({
      qualifying: countByLabel(rows, 'wrong_entity'),
      total,
    }),
    human_usefulness: resolveMarketMemoryGroundTruthMetric({
      qualifying: countByLabel(rows, 'useful_and_correct'),
      total,
    }),
  }
}
