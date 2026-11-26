'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * #2975 / #2440.82 — déclare qu'UNE destination de routage (« à évaluer »)
 * a été réévaluée, sans redéploiement. Avant ce bouton, le seul chemin
 * passait par `LLM_ROUTING_EVALS_PASSED` posé au déploiement — personne,
 * depuis cette console qui AFFICHE pourtant le statut, ne pouvait le faire.
 *
 * `declaredBy` n'est PAS un champ de ce formulaire : la route serveur
 * (`/api/admin/model-routing/evals`) le résout depuis l'identité Basic-Auth
 * de l'opérateur — « qui » vient toujours de l'authentification.
 */
export function DeclarerEvalueeButton({ destinationKey }: { destinationKey: string }) {
  const router = useRouter()
  const [etat, setEtat] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [note, setNote] = useState('')

  async function declarer() {
    if (etat === 'saving') return
    setEtat('saving')
    try {
      const res = await fetch('/api/admin/model-routing/evals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destinationKey, note: note.trim() || undefined }),
      })
      if (!res.ok) {
        setEtat('error')
        return
      }
      setEtat('done')
      router.refresh()
    } catch {
      setEtat('error')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
      <input
        placeholder="note facultative (ex. lien du rejeu)"
        value={note}
        onChange={e => setNote(e.target.value)}
        aria-label={`Note de la déclaration pour ${destinationKey}`}
        style={{ fontSize: 12, minWidth: 160 }}
      />
      <button className="btn-sm" onClick={declarer} disabled={etat === 'saving'}>
        {etat === 'saving' ? 'Déclaration…' : 'Déclarer évaluée'}
      </button>
      {etat === 'done' ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ déclarée</span> : null}
      {etat === 'error' ? <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ échec</span> : null}
    </div>
  )
}
