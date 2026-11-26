import { type Dict, Section, pick } from './analysis-shared'

/**
 * #4016.15c — CE QUE CHAQUE SOURCE A COÛTÉ AU PASSAGE : appels, échecs, temps
 * d'appel, temps d'attente sur notre propre limiteur et coût. Lu dans
 * `_api_metrics.provider_metrics` (écrit par l'IA), jusqu'ici sans aucun lecteur.
 *
 * Écran INTERNE du back-office : c'est ici que les sources se nomment (jamais
 * dans l'application du commercial). Une mesure absente s'affiche « — », jamais
 * « 0 » ; sans aucune mesure, aucune section.
 */
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const seconds = (ms: unknown): string => {
  const n = number(ms)
  return n === null ? '—' : `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`
}

export function AnalysisProviderMetrics({ raw }: { raw: Dict }) {
  const apiMetrics = (pick(raw, '_api_metrics', 'apiMetrics') ?? {}) as Dict
  const providers = apiMetrics['provider_metrics']
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return null
  const rows = Object.entries(providers as Record<string, unknown>)
    .filter((entry): entry is [string, Dict] => !!entry[1] && typeof entry[1] === 'object')
    .sort(([, a], [, b]) => (number(b['cost_usd']) ?? -1) - (number(a['cost_usd']) ?? -1))
  if (rows.length === 0) return null

  return (
    <Section title="Appels par source">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Appels</th>
            <th>Échecs</th>
            <th>Durée</th>
            <th>Attente</th>
            <th>Coût (USD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([provider, metric]) => (
            <tr key={provider}>
              <td className="mono">{provider}</td>
              <td>{number(metric['calls'])?.toLocaleString('fr-FR') ?? '—'}</td>
              <td>{number(metric['errors'])?.toLocaleString('fr-FR') ?? '—'}</td>
              <td>{seconds(metric['duration_ms'])}</td>
              <td>{seconds(metric['wait_ms'])}</td>
              <td>
                {number(metric['cost_usd'])?.toLocaleString('fr-FR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 3,
                }) ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
