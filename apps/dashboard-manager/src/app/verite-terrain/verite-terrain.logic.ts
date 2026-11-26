import type {
  MarketMemoryGroundTruthLabel,
  MarketMemoryGroundTruthMetricName,
  MarketMemoryGroundTruthMetricResult,
} from '@/lib/market-memory-ground-truth'

/**
 * #1622 — LA MISE EN FORME, séparée de l'écran pour être testée sans DOM.
 *
 * ⚠️ Aucune fonction ici ne DIVISE `qualifying` par `total` : ce fichier
 * reçoit une métrique DÉJÀ RÉSOLUE par l'API (`insufficient_data` ou
 * `measured`) et se contente de choisir un libellé — GA-285
 * (`market-memory-ground-truth-metric-floor.spec.ts`) refuse justement à un
 * fichier du dashboard-manager de refaire ce calcul.
 */

export const LABEL_CAPTIONS: Record<MarketMemoryGroundTruthLabel, string> = {
  useful_and_correct: 'Utile et correct',
  plausible: 'Plausible',
  misleading: 'Trompeur',
  wrong_entity: 'Mauvaise entité',
  irrelevant: 'Sans intérêt',
  unknown: 'Je ne sais pas',
}

export const METRIC_CAPTIONS: Record<MarketMemoryGroundTruthMetricName, string> = {
  precision_at_3: 'Précision @3',
  precision_at_10: 'Précision @10',
  false_positive_rate: 'Taux de faux positifs',
  coverage: 'Couverture',
  entity_resolution_failure: 'Échec de résolution d’entité',
  human_usefulness: 'Utilité humaine',
}

/**
 * Le pourcentage à un chiffre après la virgule — jamais arrondi à l'entier :
 * sur un petit corpus jugé à la main, un jugement de plus ou de moins pèse
 * suffisamment pour que la décimale ait un sens.
 */
export function formatMetricValue(result: MarketMemoryGroundTruthMetricResult): string | null {
  if (result.status === 'insufficient_data') return null
  return `${(result.value * 100).toFixed(1)} %`
}

/**
 * Ce qui accompagne la tuile — TOUJOURS un dénominateur, jamais un silence :
 * mesuré, il dit sur combien de jugements ; non mesuré, il dit combien
 * manquent, jamais « aucune donnée » qui laisserait croire à une panne.
 */
export function formatMetricFooter(result: MarketMemoryGroundTruthMetricResult): string {
  if (result.status === 'measured')
    return `sur ${result.judgmentsCount} jugement${result.judgmentsCount > 1 ? 's' : ''}`
  return `non mesuré — ${result.judgmentsCount}/${result.required} jugements requis`
}
