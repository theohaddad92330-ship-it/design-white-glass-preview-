import type { AdminModelRoutingEntry, AdminModelRoutingReport } from '@/lib/admin'
import { DeclarerEvalueeButton } from './declarer-evaluee-button'
import {
  destinationKeyFor,
  libelleEvaluations,
  libelleModele,
  libelleSource,
  nombreAEvaluer,
} from './model-routing-panel.logic'

/**
 * #2445.2 (épopée #2766) — POLITIQUE DE ROUTAGE MODÈLE, par capacité.
 *
 * Le réglage lui-même vit sur l'IA (`LLM_ROUTE_<TASK>`/`LLM_GATEWAY_ROUTING`,
 * `apps/ia/app/services/llm_gateway.py`, GA-26) — cet écran ne fait que le
 * RENDRE, lecture seule, jamais un formulaire qui l'écrirait depuis ici.
 *
 * Le fournisseur et le modèle sont montrés à l'OPÉRATEUR interne, jamais au
 * produit : la doctrine « nos fournisseurs ne se nomment jamais » vise
 * l'écran du client, pas la console d'un ingénieur qui règle un coût.
 *
 * #2975 / #2440.82 — la colonne « Évaluations » PORTE maintenant le geste :
 * une destination « à évaluer » peut être déclarée réévaluée depuis ici
 * ({@link DeclarerEvalueeButton}), sans redéploiement — avant ce lot, le seul
 * chemin passait par `LLM_ROUTING_EVALS_PASSED` posé au déploiement.
 */
export function ModelRoutingPanel({ report }: { report: AdminModelRoutingReport }) {
  const aEvaluer = nombreAEvaluer(report.routes)
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Politique de routage modèle</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        La destination résolue MAINTENANT pour chaque capacité — un réglage posé sur la tâche elle-même, hérité d’une
        autre, ou le défaut Anthropic. Une destination autre que la référence reste « à évaluer » tant que ses
        évaluations ne sont pas rejouées puis déclarées (<span className="mono">LLM_ROUTING_EVALS_PASSED</span>).
      </p>
      {aEvaluer > 0 && (
        <p className="subtitle" role="status" style={{ marginBottom: 12 }}>
          {aEvaluer} capacité{aEvaluer > 1 ? 's' : ''} à évaluer avant d’être tenue pour fiable.
        </p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Capacité</th>
              <th>Fournisseur</th>
              <th>Modèle</th>
              <th>Source</th>
              <th>Évaluations</th>
            </tr>
          </thead>
          <tbody>
            {report.routes.map(route => (
              <tr key={route.task}>
                <td className="mono">{route.task}</td>
                <td className="mono">{route.provider}</td>
                <td className="mono">{libelleModele(route.model)}</td>
                <td>
                  <span className={`badge ${route.overridden ? 'completed' : ''}`}>{libelleSource(route)}</span>
                </td>
                <td>
                  <span className={`badge ${route.evalStatus === 'to_evaluate' ? 'error' : ''}`}>
                    {libelleEvaluations(route)}
                  </span>
                  {route.evalReplayCommand && <div className="mono subtitle">{route.evalReplayCommand}</div>}
                  {route.evalStatus === 'to_evaluate' && <EvalRow route={route} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EvalRow({ route }: { route: AdminModelRoutingEntry }) {
  return <DeclarerEvalueeButton destinationKey={destinationKeyFor(route)} />
}
