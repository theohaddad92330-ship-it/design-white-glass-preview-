import { type Dict, Section, pick } from './analysis-shared'

/**
 * CE QUE LA COLLECTE A COÛTÉ EN MATIÈRE — combien de pages, de caractères, de
 * résultats et de fiches ont réellement nourri le modèle. C'est le dénominateur
 * de tout le reste : un dossier maigre s'explique d'abord ici.
 */
export function AnalysisCost({ raw }: { raw: Dict }) {
  // Collection telemetry — how much raw material actually fed the model.
  const apiMetrics = (pick(raw, '_api_metrics', 'apiMetrics') ?? {}) as Dict
  if (Object.keys(apiMetrics).length === 0) return null

  return (
    <Section title="Collecte — matière première fournie au modèle">
      <table>
        <tbody>
          {(
            [
              ['firecrawl_pages_scraped', 'Pages scrapées (Firecrawl)'],
              ['firecrawl_total_chars', 'Caractères scrapés'],
              ['brave_results_count', 'Résultats Brave'],
              ['pappers_executives_count', 'Dirigeants Pappers'],
              ['pappers_c_level_count', 'C-level Pappers'],
              ['pappers_subsidiaries_count', 'Filiales Pappers'],
              ['pappers_branches_count', 'Établissements Pappers'],
              ['pappers_has_finances', 'Finances Pappers'],
              ['pappers_graph_fetched', 'Graphe capitalistique'],
            ] as const
          )
            .filter(([k]) => apiMetrics[k] != null)
            .map(([k, label]) => (
              <tr key={k}>
                <td className="mono" style={{ width: 240, color: 'var(--muted)' }}>
                  {label}
                </td>
                <td>
                  {typeof apiMetrics[k] === 'boolean'
                    ? apiMetrics[k]
                      ? '✓'
                      : '—'
                    : Number(apiMetrics[k]).toLocaleString('fr-FR')}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Section>
  )
}
