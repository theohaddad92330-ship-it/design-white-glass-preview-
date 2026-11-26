'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * LUDOVIC-D LC.10 — « Terminer » une session d'incarnation EN COURS. Le geste AJOUTE une ligne
 * `stop` au journal (date de fin + l'admin qui a terminé, dérivé côté serveur) ; le jeton est
 * refusé dès la requête suivante. Confirmation explicite : l'opérateur incarné perd sa session.
 */
export function TerminerSession({ jti }: { jti: string }) {
  const router = useRouter()
  const [etat, setEtat] = useState<'idle' | 'busy' | 'error'>('idle')
  const [erreur, setErreur] = useState('')

  async function terminer() {
    if (!window.confirm('Terminer cette session d’incarnation ? L’opérateur incarné en sera sorti.')) return
    setEtat('busy')
    setErreur('')
    try {
      const res = await fetch(`/api/admin/impersonations/${encodeURIComponent(jti)}/terminate`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setEtat('error')
        setErreur(data.error ?? data.message ?? `Échec (${res.status})`)
        return
      }
      setEtat('idle')
      router.refresh()
    } catch (err) {
      setEtat('error')
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" className="btn-sm" onClick={terminer} disabled={etat === 'busy'}>
        {etat === 'busy' ? '…' : 'Terminer'}
      </button>
      {erreur ? <div style={{ fontSize: 12, color: 'var(--red)' }}>{erreur}</div> : null}
    </div>
  )
}
