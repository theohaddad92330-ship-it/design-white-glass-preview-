import type { MetricSeriesResponse } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * L'HISTORIQUE des photos mensuelles d'un espace.
 *
 * Une seule route, et c'est voulu : la variation ne se calcule pas côté serveur.
 * Ce qui revient, ce sont des POINTS DATÉS — la lecture (`metricDelta` /
 * `metricSeriesDelta`, contrats) vit à un seul endroit, partagé par l'API, le
 * semis de démonstration et les écrans. Servir des pourcentages tout faits
 * aurait mis une seconde dérivation dans le tuyau.
 */
export const metricsApi = {
  series(months: number): Promise<MetricSeriesResponse> {
    return apiFetch<MetricSeriesResponse>({ path: `/pilotage/metric-series?months=${months}` })
  },
}
