import type { ToolDailyCapStatus } from '@bellum/contracts'
import { libelleOutil, libelleQuotaOutil } from './tool-quota-panel.logic'

/**
 * LE QUOTA QUOTIDIEN PAR OUTIL, en lecture — #2440.45 (épopée #2975, lot COUT-IA 12/10).
 *
 * Réglé par l'EXPLOITANT (`AI_TOOL_DAILY_CAP_USD`, sans clé = no-op strict), pas par
 * l'admin de l'espace : ce panneau ne fait que MESURER ce qu'UN espace a dépensé
 * aujourd'hui sur chaque outil réglé — jamais un total entre espaces (GA-43).
 */
export function ToolQuotaPanel({ quotas, panne }: { quotas: ToolDailyCapStatus[] | null; panne: string | null }) {
  if (!quotas) {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Quota quotidien par outil</div>
        <div className="error" style={{ padding: 12 }}>
          Indisponible — l&apos;API n&apos;a pas répondu. {panne}
        </div>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
      <div className="label">Quota quotidien par outil</div>
      {quotas.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Aucun quota par outil réglé (AI_TOOL_DAILY_CAP_USD) : rien n&apos;est borné à la journée.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Outil</th>
              <th>Aujourd&apos;hui (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {quotas.map(quota => (
              <tr key={quota.tool}>
                <td>{libelleOutil(quota.tool)}</td>
                <td>{libelleQuotaOutil(quota)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
