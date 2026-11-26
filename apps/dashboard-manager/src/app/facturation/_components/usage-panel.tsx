import { fetchAdminUsage, type AdminUsageReport } from '@/lib/admin'
import { EmailEnClair } from '@/app/_components/email-en-clair'

// Cost & usage sub-view of the consolidated "Facturation" screen (was the
// standalone /usage). Aggregates every account's accumulated API cost
// (api_cost_euros — USD, the `euros` name is legacy) per user and per ESN, so an
// operator sees who drives the spend. Cross-tenant (InternalSecretGuard).

// Cost is stored/summed in USD. Totals read best at 2 decimals; per-analysis
// averages are cents-scale, so show 4.
//
// ⚠️ `null` n'est PAS `0` : une moyenne sur zéro analyse tarifée n'existe pas.
// L'API rend désormais `null` là où elle rendait `0` (« le zéro est un trou,
// pas un fait »), et l'écran doit le dire — sinon la correction s'arrête à
// mi-chemin et l'opérateur relit « 0,0000 $ » comme avant.
function money(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(digits)}`
}

// Combien d'analyses n'ont AUCUN coût enregistré. Tant qu'il y en a, le total
// affiché à côté est un plancher, et le dire coûte une parenthèse.
function floorNote(unmeasured: number): string {
  if (!Number.isFinite(unmeasured) || unmeasured <= 0) return ''
  return ` (plancher — ${unmeasured} non mesurée${unmeasured > 1 ? 's' : ''})`
}

export async function UsagePanel() {
  let report: AdminUsageReport | null = null
  try {
    report = await fetchAdminUsage()
  } catch (err) {
    return (
      <div className="error">
        Impossible de joindre l&apos;endpoint admin de l&apos;API.
        <br />
        {err instanceof Error ? err.message : String(err)}
        <br />
        Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
      </div>
    )
  }

  const { totals, byUser, byWorkspace } = report

  return (
    <>
      <section className="kpi-grid">
        <div className="card">
          <div className="label">Coût total{floorNote(totals.unmeasuredAnalyses)}</div>
          <div className="value">{money(totals.totalCost)}</div>
        </div>
        <div className="card">
          <div className="label">Coût 30 derniers jours</div>
          <div className="value">{money(totals.last30dCost)}</div>
        </div>
        <div className="card">
          <div className="label">Analyses</div>
          <div className="value">{totals.totalAnalyses}</div>
        </div>
        <div className="card">
          <div className="label">Coût moyen / analyse</div>
          <div className="value">{money(totals.avgCost, 4)}</div>
        </div>
      </section>

      <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Top users par coût</h2>
      {byUser.length === 0 ? (
        <div className="empty">Aucune analyse enregistrée.</div>
      ) : (
        <table style={{ marginBottom: 28 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nom</th>
              <th className="num">Analyses</th>
              <th className="num">Coût total</th>
              <th className="num">30 j</th>
              <th className="num">Coût moyen</th>
              <th className="num">Non mesurées</th>
            </tr>
          </thead>
          <tbody>
            {byUser.map(u => (
              <tr key={u.userId}>
                <td>
                  <EmailEnClair email={u.email} />
                </td>
                <td>{u.fullName || '—'}</td>
                <td className="num">{u.totalAnalyses}</td>
                <td className="num">{money(u.totalCost)}</td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {money(u.last30dCost)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {money(u.avgCost, 4)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {u.unmeasuredAnalyses || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 16, margin: '4px 0 12px' }}>Top ESN par coût</h2>
      {byWorkspace.length === 0 ? (
        <div className="empty">Aucune analyse rattachée à une ESN.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ESN</th>
              <th className="num">Analyses</th>
              <th className="num">Coût total</th>
              <th className="num">30 j</th>
              <th className="num">Coût moyen</th>
              <th className="num">Non mesurées</th>
            </tr>
          </thead>
          <tbody>
            {byWorkspace.map(w => (
              <tr key={w.workspaceId}>
                <td>
                  <a className="link" href={`/esn/${w.workspaceId}`}>
                    {w.workspaceName || w.workspaceId}
                  </a>
                </td>
                <td className="num">{w.totalAnalyses}</td>
                <td className="num">{money(w.totalCost)}</td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {money(w.last30dCost)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {money(w.avgCost, 4)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {w.unmeasuredAnalyses || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
