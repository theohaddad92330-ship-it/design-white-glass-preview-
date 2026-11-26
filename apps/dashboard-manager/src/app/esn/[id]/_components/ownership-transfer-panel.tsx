'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OwnershipTransferPreview } from '@/lib/admin'
import { phraseApercu } from './ownership-transfer-panel.logic'

// #4158.33 — transférer la propriété d'une ESN (back-office seulement). L'opérateur
// choisit le nouveau propriétaire PARMI LES ADMINS, lit le récapitulatif, puis valide.
// Le choix invalide l'aperçu : on ne confirme jamais un récapitulatif d'une autre personne.

type Candidat = { userId: string; label: string }

export function OwnershipTransferPanel({ id, candidats }: { id: string; candidats: Candidat[] }) {
  const router = useRouter()
  const [choix, setChoix] = useState('')
  const [apercu, setApercu] = useState<OwnershipTransferPreview | null>(null)
  const [etat, setEtat] = useState<'repos' | 'apercu' | 'transfert'>('repos')
  const [erreur, setErreur] = useState('')

  async function previsualiser() {
    if (!choix || etat !== 'repos') return
    setEtat('apercu')
    setErreur('')
    setApercu(null)
    try {
      const res = await fetch(
        `/api/admin/workspaces/${encodeURIComponent(id)}/ownership-transfer/preview?newOwnerUserId=${encodeURIComponent(choix)}`,
      )
      const data = (await res.json().catch(() => ({}))) as OwnershipTransferPreview & { error?: string }
      if (!res.ok) setErreur(data.error ?? `HTTP ${res.status}`)
      else setApercu(data)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
    setEtat('repos')
  }

  async function confirmer() {
    if (!choix || etat !== 'repos') return
    setEtat('transfert')
    setErreur('')
    try {
      const res = await fetch(`/api/admin/workspaces/${encodeURIComponent(id)}/ownership-transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newOwnerUserId: choix }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setErreur(data.error ?? data.message ?? `HTTP ${res.status}`)
        setEtat('repos')
        return
      }
      setApercu(null)
      setChoix('')
      setEtat('repos')
      router.refresh()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      setEtat('repos')
    }
  }

  const phrase = apercu ? phraseApercu(apercu) : null

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
      <div className="label">Transférer la propriété</div>
      {candidats.length === 0 ? (
        <div className="empty" style={{ padding: 12 }}>
          Aucun administrateur dans cet espace : le nouveau propriétaire se choisit parmi les admins.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 220 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Nouveau propriétaire (parmi les admins)</span>
            <select
              value={choix}
              onChange={e => {
                setChoix(e.target.value)
                setApercu(null)
                setErreur('')
              }}
            >
              <option value="">Choisir…</option>
              {candidats.map(c => (
                <option key={c.userId} value={c.userId}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-sm" onClick={previsualiser} disabled={!choix || etat !== 'repos'}>
            {etat === 'apercu' ? 'Lecture…' : 'Prévisualiser'}
          </button>
        </div>
      )}
      {phrase ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, color: phrase.autorise ? 'var(--fg)' : 'var(--red)' }}>{phrase.texte}</div>
          {phrase.autorise ? (
            <div>
              <button className="btn-sm" onClick={confirmer} disabled={etat !== 'repos'}>
                {etat === 'transfert' ? 'Transfert…' : 'Confirmer le transfert'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {erreur ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{erreur}</span> : null}
    </section>
  )
}
