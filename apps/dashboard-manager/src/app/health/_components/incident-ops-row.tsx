'use client'

import { useState } from 'react'
import type { IncidentImpact, IncidentLogEntry } from '@/lib/incident-ops'
import { incidentLogRequestBody } from './incident-ops-row.logic'

/**
 * #2445.12 (épopée #2766, lot SRC5 28/09 soir) — L'IMPACT, LES ACTIONS ET LA
 * COMMUNICATION d'un incident, repliés sous sa ligne de chronologie.
 *
 * `connector_capability_incidents` (la ligne serveur) date QUAND une capacité
 * a cessé de répondre — cette carte tient les trois questions qui restaient
 * sans réponse : combien d'espaces sont touchés (COMPTÉS, jamais nommés —
 * doctrine), qu'a-t-on FAIT, qu'a-t-on DIT à un client. Repliée par défaut :
 * un opérateur qui ne clique jamais « Détails » ne paie aucun appel réseau.
 */

export function IncidentOpsRow({ incidentId }: { incidentId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [impact, setImpact] = useState<IncidentImpact | null>(null)
  const [logs, setLogs] = useState<IncidentLogEntry[] | null>(null)
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'action' | 'communication'>('action')
  const [workspaceId, setWorkspaceId] = useState('')
  const [busy, setBusy] = useState(false)

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [impactRes, logsRes] = await Promise.all([
        fetch(`/api/admin/incidents/${incidentId}/impact`, { cache: 'no-store' }),
        // #2445.12 — route Next.js `journal`, jamais `logs` (voir le
        // commentaire de `fetchIncidentLogs`, `@/lib/incident-ops`).
        fetch(`/api/admin/incidents/${incidentId}/journal`, { cache: 'no-store' }),
      ])
      if (!impactRes.ok || !logsRes.ok) throw new Error(`HTTP ${impactRes.status}/${logsRes.status}`)
      setImpact((await impactRes.json()) as IncidentImpact)
      setLogs((await logsRes.json()) as IncidentLogEntry[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function ouvrir() {
    const next = !open
    setOpen(next)
    if (next && impact === null) await charger()
  }

  async function journaliser() {
    if (!note.trim()) return
    setBusy(true)
    setError('')
    try {
      const path = kind === 'action' ? 'actions' : 'communications'
      const res = await fetch(`/api/admin/incidents/${incidentId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(incidentLogRequestBody(kind, note, workspaceId)),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setNote('')
      setWorkspaceId('')
      await charger()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        {open ? 'Masquer' : 'Détails'}
      </button>
      {open ? (
        <div style={{ marginTop: 6, padding: 10, border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
          {loading ? <p className="muted">Chargement…</p> : null}
          {error ? <p style={{ color: 'var(--red)' }}>{error}</p> : null}
          {impact ? (
            <p>
              {impact.ok
                ? `Espaces touchés : ${impact.workspacesTouched}`
                : 'Impact non calculable — cette transition n’ouvre pas un incident.'}
            </p>
          ) : null}
          {logs ? (
            <ul style={{ margin: '6px 0', paddingLeft: 16 }}>
              {logs.length === 0 ? <li className="muted">Aucune action ni communication journalisée.</li> : null}
              {logs.map(entry => (
                <li key={entry.id}>
                  <strong>{entry.kind === 'action' ? 'Action' : 'Communication'}</strong> — {entry.note}
                </li>
              ))}
            </ul>
          ) : null}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <select
              value={kind}
              onChange={e => setKind(e.target.value === 'communication' ? 'communication' : 'action')}
            >
              <option value="action">Action prise</option>
              <option value="communication">Communication client</option>
            </select>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ce qui a été fait ou dit…"
              style={{ flex: 1 }}
            />
            {kind === 'communication' ? (
              <input
                value={workspaceId}
                onChange={e => setWorkspaceId(e.target.value)}
                placeholder="Espace visé (optionnel — vide = communication générale)"
                style={{ flex: 1 }}
                aria-label="Espace visé"
              />
            ) : null}
            <button type="button" onClick={journaliser} disabled={busy || !note.trim()}>
              Journaliser
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
