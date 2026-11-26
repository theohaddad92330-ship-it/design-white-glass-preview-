import { type Dict, Section } from './analysis-shared'

/**
 * LA RÉPONSE BRUTE — `raw_analysis` en entier, replié. C'est le dernier
 * recours de l'opérateur : ce que l'écran ne montre pas encore est ici.
 */
export function AnalysisRawJson({ raw }: { raw: Dict }) {
  return (
    <Section title="Réponse brute (raw_analysis)">
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Afficher le JSON complet</summary>
        <pre
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 16,
            overflow: 'auto',
            fontSize: 12,
            marginTop: 10,
          }}
        >
          {JSON.stringify(raw, null, 2)}
        </pre>
      </details>
    </Section>
  )
}
