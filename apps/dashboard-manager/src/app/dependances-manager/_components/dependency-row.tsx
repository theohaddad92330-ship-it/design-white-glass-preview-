'use client'

import { useState } from 'react'
import type { ManagerDependencyStatus } from '@/lib/manager-dependencies'
import { couleurPresence, libellePresence, presenceApresTest } from '../dependances.logic'

type EtatTest =
  | { statut: 'idle' }
  | { statut: 'en_cours' }
  | { statut: 'fait'; ok: boolean; detail: string; checkedAt: string }

/**
 * #1676.2 — une ligne, avec son bouton « Tester ». « Sain n'est jamais
 * déclaré, il est dérivé d'un test réel » : tant que l'opérateur n'a pas
 * cliqué, la ligne ne montre qu'une PRÉSENCE (configuré / non configuré / non
 * mesuré) — jamais un verdict de santé qui n'aurait rien testé.
 */
export function DependencyRow({ dependency }: { dependency: ManagerDependencyStatus }) {
  const [etat, setEtat] = useState<EtatTest>({ statut: 'idle' })
  const presence = presenceApresTest(
    dependency.configured,
    etat.statut === 'fait' ? { ok: etat.ok, detail: etat.detail } : null,
  )

  async function tester() {
    setEtat({ statut: 'en_cours' })
    try {
      const res = await fetch(`/api/admin/manager-dependencies/${dependency.id}/test`, { method: 'POST' })
      const data = (await res.json()) as { ok: boolean; detail: string; checkedAt: string }
      setEtat({ statut: 'fait', ok: data.ok, detail: data.detail, checkedAt: data.checkedAt })
    } catch (err) {
      setEtat({
        statut: 'fait',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      })
    }
  }

  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={CELLULE}>{dependency.label}</td>
      <td style={CELLULE} className="muted">
        {dependency.role}
      </td>
      <td style={CELLULE}>
        {/* La preuve l'emporte sur la déclaration : un test qui dit « non
            configuré » corrige la colonne, au lieu de la contredire à quarante
            pixels d'écart. */}
        <span style={{ color: couleurPresence(presence) }}>{libellePresence(presence)}</span>
      </td>
      <td style={CELLULE}>
        {etat.statut === 'idle' && (
          <button type="button" className="btn" onClick={() => void tester()}>
            Tester
          </button>
        )}
        {etat.statut === 'en_cours' && <span className="muted">Test en cours…</span>}
        {etat.statut === 'fait' && (
          <div>
            <button type="button" className="btn" onClick={() => void tester()}>
              Retester
            </button>
            <div className={etat.ok ? 'muted' : 'error'} style={{ marginTop: 4, fontSize: 12 }}>
              {etat.detail}
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

const CELLULE = { padding: '8px', verticalAlign: 'top' } as const
