'use client'

import { useEffect, useState } from 'react'
import type { EndpointTelemetry } from '@/lib/admin'

type ApiResult = {
  ok: boolean
  status: number
  ms: number
  path: string
  body?: unknown
  error?: string
}

/**
 * #1667.3 — le volume par endpoint et le p95, à côté du testeur de requêtes.
 *
 * ⚠️ Lit `apiTelemetrySnapshot` (`src/lib/admin.ts`) EN MÉMOIRE du process
 * Next.js : le tableau ne connaît que les appels admin passés PAR CETTE
 * INSTANCE depuis son dernier redéploiement, jamais une comptabilité agrégée.
 * Aucune donnée nominative : des endpoints (id réduits à `:id`) et des volumes.
 */
function TelemetrieApi() {
  const [lignes, setLignes] = useState<EndpointTelemetry[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    setErreur(null)
    try {
      const res = await fetch('/api/admin/api-telemetry', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { endpoints: EndpointTelemetry[] }
      setLignes(data.endpoints)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void charger()
  }, [])

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Volume par endpoint / Volume by endpoint</h2>
        <button className="btn-sm" onClick={() => void charger()}>
          Rafraîchir / Refresh
        </button>
      </div>
      <p className="subtitle" style={{ margin: '0 0 12px', maxWidth: '70ch' }}>
        Depuis le dernier redéploiement de cette instance, en mémoire — un ordre de grandeur lisible en direct, pas une
        comptabilité. / Since this instance's last deploy, in memory — an order of magnitude, not accounting.
      </p>
      {erreur ? (
        <div className="error">Indisponible — {erreur}</div>
      ) : lignes === null ? (
        <p className="empty">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="empty">Aucun appel admin observé par cette instance depuis son dernier redémarrage.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Méthode</th>
                <th>Endpoint</th>
                <th>Volume</th>
                <th>p95</th>
                <th>Erreurs</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(ligne => (
                <tr key={`${ligne.method} ${ligne.endpoint}`}>
                  <td>
                    <code>{ligne.method}</code>
                  </td>
                  <td>
                    <code>{ligne.endpoint}</code>
                  </td>
                  <td className="num">{ligne.count}</td>
                  <td className="num">{ligne.p95Ms} ms</td>
                  <td className="num">{ligne.errorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function ApiConsolePage() {
  const [endpoint, setEndpoint] = useState<'list' | 'detail'>('list')
  const [limit, setLimit] = useState('50')
  const [accountId, setAccountId] = useState('a1')
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function send() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint, limit, accountId }),
      })
      setResult((await res.json()) as ApiResult)
    } catch (err) {
      setResult({ ok: false, status: 0, ms: 0, path: '', error: String(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="wrap">
      <h1>API · tester des requêtes</h1>
      <p className="subtitle">
        Appelle l&apos;endpoint opérateur <code>GET /internal/telemetry</code> (proxifié côté serveur — le secret ne
        part jamais au navigateur).
      </p>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 18,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Endpoint</span>
          <select value={endpoint} onChange={e => setEndpoint(e.target.value as 'list' | 'detail')}>
            <option value="list">GET /internal/telemetry (liste)</option>
            <option value="detail">GET /internal/telemetry/:id (détail)</option>
          </select>
        </label>

        {endpoint === 'list' ? (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>limit</span>
            <input value={limit} onChange={e => setLimit(e.target.value)} style={{ width: 90 }} />
          </label>
        ) : (
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>accountId</span>
            <input value={accountId} onChange={e => setAccountId(e.target.value)} style={{ width: 220 }} />
          </label>
        )}

        <button className="btn" onClick={send} disabled={loading}>
          {loading ? 'Envoi…' : 'Envoyer'}
        </button>
      </section>

      {result ? (
        <section style={{ marginTop: 18 }}>
          <p style={{ fontSize: 14 }}>
            <span className={`badge ${result.ok ? 'completed' : 'error'}`}>
              {result.status || 'ERR'} {result.ok ? 'OK' : 'FAIL'}
            </span>{' '}
            · {result.ms} ms · <code>{result.path}</code>
          </p>
          <pre className="code">{JSON.stringify(result.error ?? result.body, null, 2)}</pre>
        </section>
      ) : null}

      <TelemetrieApi />
    </main>
  )
}
