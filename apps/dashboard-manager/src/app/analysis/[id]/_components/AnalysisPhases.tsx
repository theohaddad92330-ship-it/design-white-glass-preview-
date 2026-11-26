import { secondsOrDash, tokensOrDash, usdOrDash } from '@/lib/mesure'
import { BarChart } from '../../../_components/charts'
import { type AnalysisDetail, Section } from './analysis-shared'

/** L'audit d'exécution : où sont passés le coût, le temps et les appels d'API, phase par phase. */
export function AnalysisPhases({ detail }: { detail: AnalysisDetail }) {
  const phaseTelemetry = Array.isArray(detail.phaseTelemetry) ? detail.phaseTelemetry : []

  return (
    <>
      {phaseTelemetry.length > 0 ? (
        <Section title="Audit par phase — d'où viennent le coût, le temps et les infos">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="label" style={{ marginBottom: 10 }}>
                Durée par phase
              </div>
              <BarChart
                data={phaseTelemetry
                  .filter((p): p is typeof p & { durationMs: number } => p.durationMs != null)
                  .map(p => ({ label: p.name, value: Math.round(p.durationMs / 1000) }))}
                format={v => `${v}s`}
              />
            </div>
            <div className="card">
              <div className="label" style={{ marginBottom: 10 }}>
                Coût par phase
              </div>
              <BarChart
                data={phaseTelemetry.map(p => ({ label: p.name, value: p.costUsd }))}
                format={v => `$${v.toFixed(4)}`}
              />
            </div>
          </div>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Phase</th>
                <th className="num">Coût</th>
                <th className="num">Durée</th>
                <th className="num">Tokens in / out</th>
                <th>Sources</th>
              </tr>
            </thead>
            <tbody>
              {phaseTelemetry.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td className="num">{usdOrDash(p.costUsd)}</td>
                  <td className="num">{secondsOrDash(p.durationMs)}</td>
                  <td className="num">
                    {tokensOrDash(p.inputTokens)} / {tokensOrDash(p.outputTokens)}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {Array.isArray(p.sources) && p.sources.length > 0
                      ? `${p.sources.filter(s => s.status === 'ok').length}/${p.sources.length} OK`
                      : p.sourceHealth
                        ? Object.entries(p.sourceHealth)
                            .map(([k, v]) => `${k}:${v}`)
                            .join(' · ')
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {phaseTelemetry.some(p => Array.isArray(p.sources) && p.sources.length > 0) ? (
        <Section title="Déroulement — APIs appelées par phase">
          <div style={{ display: 'grid', gap: 14 }}>
            {phaseTelemetry
              .filter(p => Array.isArray(p.sources) && p.sources.length > 0)
              .map((p, i) => (
                <div key={i}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                  <table>
                    <tbody>
                      {(p.sources ?? []).map((s, j) => (
                        <tr key={j}>
                          <td className="mono" style={{ width: 220 }}>
                            {s.provider}
                          </td>
                          <td style={{ width: 90 }}>
                            <span
                              className="badge"
                              style={{
                                color:
                                  s.status === 'ok'
                                    ? 'var(--accent)'
                                    : s.status === 'down'
                                      ? 'var(--danger)'
                                      : 'var(--muted)',
                              }}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)' }}>{s.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </Section>
      ) : null}
    </>
  )
}
