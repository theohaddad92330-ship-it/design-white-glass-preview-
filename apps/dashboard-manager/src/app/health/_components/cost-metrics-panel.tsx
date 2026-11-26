import type { CostMetricsReport } from '@/lib/telemetry'
import { dateEtHeure } from '@/lib/dates'

// Backoffice — LOT 10 : ce que chaque prompt IA a coûté depuis le démarrage
// du process, hors pipeline d'analyse (Copilote, discover, battlecard,
// weekly, compare, icebreaker, message, summary, scorer, activity).
//
// Le trou que ça bouche : `GET /metrics/cost` existait côté moteur IA
// (`apps/ia/app/main.py`), répondait à la question juste, et n'avait AUCUN
// appelant dans les trois applications — la famille n°1 de ce dépôt
// (« du code juste, calculé, testé, que personne n'appelle ») appliquée à son
// propre instrument de mesure.
//
// Deux règles de justesse gouvernent ce panneau, les mêmes que le panneau des
// interrupteurs d'arrêt juste en dessous :
//
//  1. Le silence n'est pas un zéro. Le moteur IA est un autre process : quand
//     il ne répond pas, `reachable` vaut `false` et le total est ABSENT — pas
//     `0`. Un moteur muet ne prouve pas que la facture est nulle.
//  2. Ce n'est PAS une comptabilité. Les compteurs vivent en mémoire du
//     process FastAPI : ils repartent de zéro à chaque redéploiement et ne
//     sont pas agrégés entre replicas. L'écran le dit, pour qu'un ordre de
//     grandeur ne se lise jamais comme un total exact.
//
// Parité démo (craft rule n°9) : surface OPÉRATEUR (back-office), pas un écran
// client — hors du périmètre de `demo-dataset.ts` / `demo-coverage.ts`, au
// même titre que `KillSwitchPanel` et `SourceHealthPanel` juste à côté, qui ne
// sont pas plus seedés. Classé, pas ignoré.

function usd(value: number): string {
  return `$${value.toFixed(4)}`
}

export function CostMetricsPanel({ report }: { report: CostMetricsReport }) {
  const { reachable, prompts, totalCostUsd, truncations, measuredAt } = report
  const truncationRows = Object.entries(truncations).filter(([, t]) => t.events > 0)
  const unpricedTotal = prompts.reduce((sum, p) => sum + p.unpricedCalls, 0)

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>
        Coût par prompt (hors analyse){'  '}
        <span className={`badge ${reachable ? 'completed' : 'error'}`}>
          {reachable && totalCostUsd !== null ? usd(totalCostUsd) : 'inconnu'}
        </span>
      </h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Ce que Copilote, discover, battlecard, weekly, compare, icebreaker, message, summary, scorer et activity ont
        coûté en appels Claude — le pipeline d&apos;analyse a déjà ses propres métriques persistées, celles-ci
        n&apos;existaient nulle part avant ce panneau.
      </p>

      {!reachable && (
        <div className="error" style={{ marginBottom: 12 }}>
          Le moteur d&apos;analyse n&apos;a pas répondu : le coût est <strong>inconnu, pas nul</strong>. Un moteur muet
          ne prouve pas que la facture est nulle.
        </div>
      )}

      {reachable && unpricedTotal > 0 && (
        <div className="error" style={{ marginBottom: 12 }}>
          {unpricedTotal} appel(s) sans tarif connu — leur coût n&apos;entre PAS dans le total ci-dessus, qui le
          sous-compte d&apos;autant.
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Prompt</th>
              <th className="num">Appels</th>
              <th className="num">Tokens entrée</th>
              <th className="num">Tokens sortie</th>
              <th className="num">Cache lu</th>
              <th className="num">Cache écrit</th>
              <th className="num">Coût</th>
              <th>Modèle</th>
              <th className="num">Non tarifés</th>
            </tr>
          </thead>
          <tbody>
            {prompts.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ color: 'var(--muted)' }}>
                  {reachable ? 'Aucun appel enregistré depuis le démarrage du process.' : '—'}
                </td>
              </tr>
            ) : (
              prompts.map(p => (
                <tr key={p.prompt}>
                  <td className="mono">{p.prompt}</td>
                  <td className="num">{p.calls}</td>
                  <td className="num">{p.inputTokens.toLocaleString('fr-FR')}</td>
                  <td className="num">{p.outputTokens.toLocaleString('fr-FR')}</td>
                  <td className="num" style={{ color: 'var(--muted)' }}>
                    {p.cacheReadTokens.toLocaleString('fr-FR')}
                  </td>
                  <td className="num" style={{ color: 'var(--muted)' }}>
                    {p.cacheCreationTokens.toLocaleString('fr-FR')}
                  </td>
                  <td className="num">{usd(p.costUsd)}</td>
                  <td style={{ color: 'var(--muted)' }}>{p.model}</td>
                  <td className="num" style={{ color: p.unpricedCalls > 0 ? 'var(--red)' : undefined }}>
                    {p.unpricedCalls}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {truncationRows.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Générations tronquées</h3>
          <p className="subtitle" style={{ marginBottom: 8 }}>
            Le plafond de tokens de sortie a été atteint — un coût payé sans livrable utilisable.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Prompt</th>
                  <th className="num">Événements</th>
                  <th className="num">Tokens jetés</th>
                  <th className="num">Coût jeté</th>
                </tr>
              </thead>
              <tbody>
                {truncationRows.map(([name, t]) => (
                  <tr key={name}>
                    <td className="mono">{name}</td>
                    <td className="num">{t.events}</td>
                    <td className="num">{t.wastedOutputTokens.toLocaleString('fr-FR')}</td>
                    <td className="num" style={{ color: 'var(--red)' }}>
                      {usd(t.wastedCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
        Mesuré le {dateEtHeure(measuredAt)}. Compteurs EN MÉMOIRE du process IA — remis à zéro à chaque redéploiement,
        non agrégés entre replicas : un ordre de grandeur lisible en direct, pas une comptabilité.
      </p>
    </section>
  )
}
