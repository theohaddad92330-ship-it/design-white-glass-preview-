'use client'

import {
  IMPERSONATION_REASON_CODES,
  IMPERSONATION_REASON_DETAIL_MAX,
  IMPERSONATION_REASON_LABELS,
  type ImpersonationReasonCode,
} from '@bellum/contracts'
import { useState } from 'react'

// Start an impersonation session to reproduce a user-reported bug by viewing the
// app AS that user. On success the API returns a short-lived, READ-ONLY session
// URL (token in the fragment) which we open in a new tab.
//
// This is deliberately gated and loud: impersonation is powerful, so the control
// requires a justification and warns the operator about the read-only posture.
//
// ⚠️ #1670 — LE MOTIF EST UN CATALOGUE FERMÉ, PLUS UN CHAMP DE TEXTE.
// « Trois motifs au catalogue : support demandé · incident constaté ·
// vérification technique. Pas de texte libre — un catalogue se lit. » Le champ
// libre acceptait 3 à 500 caractères : le motif était obligatoire mais illisible
// en masse. Trois cents lignes de texte libre ne répondent à aucune question ;
// trois codes se comptent et se défendent devant un client qui demande à quoi
// sert l'accès à ses données.
//
// Aucune valeur par défaut n'est présélectionnée : choisir EST la décision, et
// un motif présélectionné serait un motif que personne n'a choisi.

export function Impersonate({ userId, label }: { userId: string; label: string }) {
  const [reasonCode, setReasonCode] = useState<ImpersonationReasonCode | ''>('')
  // LUDOVIC-D LC.10 — la précision libre FACULTATIVE (« recette du lot LUDOVIC-D ») ; le motif reste le code.
  const [reasonDetail, setReasonDetail] = useState('')
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const canSubmit = reasonCode !== '' && state !== 'working'

  async function start() {
    if (!canSubmit) return
    setState('working')
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/impersonate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason_code: reasonCode,
          ...(reasonDetail.trim() ? { reason_detail: reasonDetail.trim() } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string; message?: string }
      if (!res.ok || !data.redirectUrl) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setState('done')
      // Open the read-only impersonation session in a new tab.
      window.open(data.redirectUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="label" style={{ marginBottom: 0 }}>
        Incarner cet utilisateur (lecture seule)
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        Ouvre l&apos;app AS {label} pour reproduire un bug. Session <strong>éphémère (≤ 30 min)</strong> et{' '}
        <strong>en lecture seule</strong> : facturation, suppression, gestion d&apos;équipe et envois sont bloqués.
        Chaque incarnation est tracée (qui, quand, motif).
      </span>
      <label htmlFor="motif-incarnation" style={{ fontSize: 12, color: 'var(--muted)' }}>
        Motif (obligatoire)
      </label>
      <select
        id="motif-incarnation"
        value={reasonCode}
        onChange={e => setReasonCode(e.target.value as ImpersonationReasonCode | '')}
        style={{ minWidth: 260 }}
      >
        <option value="">Choisis un motif…</option>
        {IMPERSONATION_REASON_CODES.map(code => (
          <option key={code} value={code}>
            {IMPERSONATION_REASON_LABELS[code]}
          </option>
        ))}
      </select>
      <label htmlFor="precision-incarnation" style={{ fontSize: 12, color: 'var(--muted)' }}>
        Précision (facultatif)
      </label>
      <input
        id="precision-incarnation"
        type="text"
        value={reasonDetail}
        maxLength={IMPERSONATION_REASON_DETAIL_MAX}
        onChange={e => setReasonDetail(e.target.value)}
        placeholder="Ex. recette du lot en cours, ticket 4412…"
        style={{ minWidth: 260 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-sm" onClick={start} disabled={!canSubmit}>
          {state === 'working' ? '…' : 'Incarner cet utilisateur'}
        </button>
        {state === 'done' ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Session ouverte dans un nouvel onglet. Utilisez la bannière « Quitter » pour en sortir.
          </span>
        ) : null}
      </div>
      {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </div>
  )
}
