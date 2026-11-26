/**
 * LA clé TanStack de la série des photos mensuelles.
 *
 * Elle vit ici, exportée, parce que cinq écrans vont la lire et qu'une clé
 * RECOPIÉE est un cache qui se dédouble en silence : deux tuiles de la même page
 * déclencheraient deux requêtes, et une invalidation n'en toucherait qu'une.
 * C'est un défaut connu du dépôt (« clé de cache recopiée à la main »).
 *
 * `months` en fait partie : une série de 12 mois et une série de 24 ne sont pas
 * la même réponse, et les servir sous la même clé rendrait la seconde tronquée.
 */
export const metricSeriesKey = (months: number) => ['pilotage', 'metric-series', months] as const
