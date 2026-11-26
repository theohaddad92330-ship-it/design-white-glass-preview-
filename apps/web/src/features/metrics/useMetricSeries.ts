import { useQuery } from '@tanstack/react-query'
import { metricSeriesDelta, type MetricDelta, type MetricDeltaTarget } from '@bellum/contracts'
import { metricsApi } from './api'
import { metricSeriesKey } from './query-keys'

/**
 * DE COMBIEN DE MOIS ON REMONTE — les deux seules lectures du produit.
 *
 * `previousMonth` (1) et `yearAgo` (12). Une troisième période n'existe pas, et
 * c'est délibéré : « vs il y a 4 mois » n'a de sens sur aucun des cinq écrans, et
 * chaque période ouverte est une phrase de plus à traduire, à tester et à
 * expliquer.
 */
export const METRIC_DELTA_PERIODS = { previousMonth: 1, yearAgo: 12 } as const
export type MetricDeltaPeriod = keyof typeof METRIC_DELTA_PERIODS

/**
 * La série chargée UNE fois pour toute la page.
 *
 * ⚠️ La fenêtre demandée est toujours DOUZE mois, quelle que soit la période
 * comparée. Deux tuiles voisines qui demanderaient 1 et 12 mois produiraient
 * deux clés de cache, donc deux requêtes pour la même question — et un cache
 * dédoublé est le premier pas vers deux chiffres qui divergent. Douze couvre les
 * deux lectures ; la sélection du mois se fait ensuite, en mémoire.
 */
const SERIES_MONTHS = 12

export function useMetricSeries() {
  return useQuery({
    queryKey: metricSeriesKey(SERIES_MONTHS),
    queryFn: () => metricsApi.series(SERIES_MONTHS),
    // Une photo mensuelle ne bouge pas dans la journée : la relire à chaque
    // remontage serait une requête pour un chiffre identique.
    staleTime: 5 * 60_000,
  })
}

/**
 * Ce qu'un écran lit pour afficher une variation.
 *
 * `pending` est distinct de `delta.measured === false`, et c'est la distinction
 * qui compte le plus ici : pendant le chargement, on ne sait pas encore, et
 * écrire « non mesuré » à ce moment-là est le défaut « zéro de chargement » sous
 * une autre forme — l'utilisateur lit une affirmation là où il n'y a qu'une
 * requête en vol, et va chercher une panne qui n'existe pas.
 */
export function useMetricDelta(
  metric: MetricDeltaTarget,
  period: MetricDeltaPeriod = 'previousMonth',
): { pending: boolean; failed: boolean; delta: MetricDelta; monthsCovered: number } {
  const { data, isPending, isError } = useMetricSeries()
  return {
    pending: isPending,
    // Une lecture EN ÉCHEC n'est pas « pas encore de photo ». Les deux
    // s'afficheront « non mesuré », mais l'écran qui veut les distinguer le
    // peut — et la question « cassé ou non mesurable ? » est celle que le dépôt
    // a déjà payée plusieurs fois.
    failed: isError,
    delta: metricSeriesDelta(data, metric, { months: METRIC_DELTA_PERIODS[period] }),
    monthsCovered: data?.monthsCovered ?? 0,
  }
}
