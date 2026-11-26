import type { WorkspaceHealthReport } from '@/lib/workspace-health'
import type { HealthDimensionView } from '@bellum/contracts'
import { libelleAxe, libelleLecture } from './workspace-health-panel.logic'

/**
 * GA-18 — un score ne se rend jamais seul : ici, la note ET ses axes dans le
 * même composant, jamais l'une sans les autres. `apps/dashboard-manager` n'a
 * ni `@bellum/ui` ni `react-i18next` (outil admin séparé, pas de dépendance à
 * la primitive `ScoreWithAxes` de `apps/web`) — cette version locale tient la
 * même discipline avec le style CSS déjà en place ici (`className="card"` etc.).
 */
function ScoreWithAxes({
  score,
  max,
  reading,
  missingAxes,
  dimensions,
}: {
  score: number | null
  max: number
  reading: WorkspaceHealthReport['health']['reading']
  missingAxes: number
  dimensions: HealthDimensionView[]
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 600 }}>{score === null ? '—' : `${score}/${max}`}</span>
        <span className="pill">{libelleLecture(reading, missingAxes)}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Axe</th>
            <th>Valeur</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map(dimension => (
            <tr key={dimension.axis}>
              <td>{dimension.label}</td>
              <td className={dimension.nonEvaluable ? 'muted' : undefined}>{libelleAxe(dimension)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/**
 * LA SANTÉ PRODUIT D'UN ESPACE (§5.6, #2977) — vue admin/pilotage.
 *
 * Le recette écran du 26/09 constatait que le score livré (endpoint interne,
 * `AdminWorkspaceHealthService`) n'avait AUCUN rendu écran : ce panneau est ce
 * rendu, posé sur la fiche ESN qui connaît déjà l'espace.
 *
 * ⚠️ Ce n'est PAS le score de `/revenus/clients` (#1652, 5 axes, revenu). Deux
 * scores distincts cohabitent volontairement — les fusionner ferait mentir
 * l'un des deux dénominateurs (voir `admin-workspace-health.service.ts`).
 *
 * Doctrine tenue ici : le score n'est jamais nu (ses 9 axes suivent), un axe
 * non évaluable est NOMMÉ plutôt que compté zéro, aucune probabilité.
 */
export function WorkspaceHealthPanel({
  report,
  panne,
}: {
  report: WorkspaceHealthReport | null
  panne: string | null
}) {
  if (!report) {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Santé produit (interne)</div>
        <div className="error" style={{ padding: 12 }}>
          Indisponible — l&apos;API n&apos;a pas répondu. {panne}
        </div>
      </section>
    )
  }

  const { health, coverageLabel, dimensions, interventions } = report

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div className="label">Santé produit (interne) — {coverageLabel}</div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Score §5.6 à neuf axes, jamais montré à l&apos;utilisateur — distinct de la colonne Santé de{' '}
        <span className="muted">/revenus/clients</span> (revenu, cinq axes).
      </p>

      <ScoreWithAxes
        score={health.score}
        max={100}
        reading={health.reading}
        missingAxes={health.missingAxes}
        dimensions={dimensions}
      />

      {/* Doctrine : « on n'affiche pas ce qu'on n'a pas » — une liste vide ne
          fait AUCUNE ligne, pas une ligne « aucune intervention ». */}
      {interventions.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="label">Interventions proposées (axe sous 60/100)</div>
          {interventions.map(intervention => (
            <div key={intervention.axis} style={{ fontSize: 13 }}>
              <span className="badge">{intervention.value}/100</span> {intervention.action}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
