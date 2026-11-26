'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TelemetryRow } from '@/lib/telemetry'
import { dateEtHeure } from '@/lib/dates'

// One company = one row (its latest run) + a collapsible history of older runs.
export type AnalysisGroup = { head: TelemetryRow; history: TelemetryRow[] }

function usd(n: number): string {
  return `$${n.toFixed(n !== 0 && n < 1 ? 4 : 2)}`
}
function duration(ms: number | null): string {
  // `null` = durée inconnue (aucun run terminé mesurable). On affiche « — »
  // plutôt qu'un nombre : le plafond de 1h qu'affichait l'ancienne estimation
  // était un plafond rendu COMME une mesure.
  if (ms == null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
// ⚠️ COMPOSANT CLIENT. Sans fuseau explicite, cette ligne rendait `14:32` au
// serveur et `16:32` au navigateur : c'est l'écart d'hydratation #418/#423/#425
// mesuré en production le 07/09/2026 sur la page d'arrivée.
const when = (iso: string): string => dateEtHeure(iso)

function RelaunchButton({ company }: { company: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function relaunch() {
    if (!company || state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company, fresh: true }),
      })
      const data = (await res.json()) as { ok?: boolean }
      if (data.ok) {
        setState('done')
        // Pull the freshly-created `analyzing` row into the list.
        router.refresh()
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  const label = state === 'loading' ? '…' : state === 'done' ? '✓ lancé' : state === 'error' ? '✗ erreur' : '↻ relancer'
  return (
    <button
      className="btn-sm"
      onClick={relaunch}
      disabled={state === 'loading'}
      title={`Relancer une analyse de ${company}`}
    >
      {label}
    </button>
  )
}

function DataCells({ a }: { a: TelemetryRow }) {
  return (
    <>
      <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
        {a.siren || '—'}
      </td>
      <td>
        <span className={`badge ${a.status}`}>{a.status}</span>
      </td>
      <td className="num">{a.priorityScore != null ? `${a.priorityScore}/10` : '—'}</td>
      <td className="num">{a.costUsd != null ? usd(a.costUsd) : '—'}</td>
      <td className="num">{duration(a.durationMs)}</td>
      <td>{when(a.updatedAt)}</td>
    </>
  )
}

export function MonitoringTable({ groups }: { groups: AnalysisGroup[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  return (
    <table style={{ marginTop: 16 }}>
      <thead>
        <tr>
          <th>Entreprise</th>
          <th className="mono">SIREN</th>
          <th>Statut</th>
          <th className="num">Priorité</th>
          <th className="num">Coût</th>
          <th className="num">Durée</th>
          <th>Mis à jour</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {groups.map(g => {
          const key = g.head.accountId
          const expanded = open[key]
          return (
            <Fragment key={key}>
              <tr>
                <td>
                  <a className="link" href={`/analysis/${g.head.accountId}`}>
                    {g.head.companyName || '—'}
                  </a>
                  {g.history.length > 0 ? (
                    <button
                      className="link-muted"
                      onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))}
                      style={{ marginLeft: 8 }}
                    >
                      {expanded ? '▾' : '▸'} {g.history.length} ancien{g.history.length > 1 ? 's' : ''}
                    </button>
                  ) : null}
                </td>
                <DataCells a={g.head} />
                <td>
                  <RelaunchButton company={g.head.companyName} />
                </td>
              </tr>
              {expanded
                ? g.history.map(h => (
                    <tr key={h.accountId} style={{ opacity: 0.6 }}>
                      <td style={{ paddingLeft: 26 }}>
                        <a className="link" href={`/analysis/${h.accountId}`} style={{ fontSize: 13 }}>
                          ↳ run précédent
                        </a>
                      </td>
                      <DataCells a={h} />
                      <td />
                    </tr>
                  ))
                : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
