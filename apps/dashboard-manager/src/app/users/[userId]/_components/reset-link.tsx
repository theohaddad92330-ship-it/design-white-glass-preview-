'use client'

import { useState } from 'react'
import { formaterInstant } from '@/lib/dates'

// Generate a password-recovery link for the user. POSTs the DM route handler
// (server-side proxy with the internal secret) and shows the returned link for
// the operator to copy and send. We deliberately do NOT auto-log-in as the user
// — a copy-able recovery link is the safe operator flow.
//
// C'est le chemin qui débloque quelqu'un dont la boîte ne reçoit rien : on
// génère ici, on transmet par le canal qu'on veut, la personne définit son mot
// de passe. Aucun e-mail Bellum n'intervient.
//
// L'ÉCHÉANCE est affichée avec le lien : un opérateur qui envoie un lien
// périmé ne le sait pas, et c'est la personne bloquée qui le découvre.
//
// ⚠️ Elle est affichée avec sa DATE depuis le 25/08. Elle ne montrait que
// l'heure — « valable jusqu'à 18:05 » — ce qui était lisible tant que le lien
// durait quinze minutes, et devient faux dès qu'il en dure quarante-huit : « 18:05 »
// de quel jour ?

// ⚠️ Aucun choix ne dépasse 24 heures : c'est le plafond de la PLATEFORME
// Supabase (86 400 s), pas un réglage de projet — le tableau de bord refuse
// toute valeur supérieure. Proposer 48 heures reviendrait à offrir une durée
// que l'écrêtage corrigerait à chaque génération, c'est-à-dire une case qui ne
// fait rien.
const TTL_CHOICES = [
  { key: '1h', label: '1 heure' },
  { key: '6h', label: '6 heures' },
  { key: '12h', label: '12 heures' },
  { key: '24h', label: '24 heures' },
] as const

export function ResetLink({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [link, setLink] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [clamped, setClamped] = useState(false)
  const [ttl, setTtl] = useState<(typeof TTL_CHOICES)[number]['key']>('24h')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (state === 'working') return
    setState('working')
    setError('')
    setCopied(false)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ttl }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        link?: string
        expiresAt?: string
        clamped?: boolean
        error?: string
        message?: string
      }
      if (!res.ok || !data.link) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setLink(data.link)
      setExpiresAt(data.expiresAt ?? '')
      setClamped(data.clamped === true)
      setState('done')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-sm" onClick={generate} disabled={state === 'working'}>
          {state === 'working' ? '…' : 'Générer un lien de réinitialisation'}
        </button>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Valable
          <select value={ttl} onChange={e => setTtl(e.target.value as typeof ttl)} disabled={state === 'working'}>
            {TTL_CHOICES.map(choice => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          À transmettre par le canal de ton choix — aucun e-mail n&apos;est envoyé. La personne définit son mot de passe
          en l&apos;ouvrant. Le lien ne vaut qu&apos;une fois.
        </span>
      </div>
      {state === 'done' && link ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input readOnly value={link} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 260 }} />
            <button className="btn-sm" onClick={copy}>
              {copied ? '✓ copié' : 'Copier'}
            </button>
            {expiresAt ? (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                valable jusqu&apos;au{' '}
                {formaterInstant(expiresAt, {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            ) : null}
          </div>
          {/* La durée demandée a été rabotée par l'expiration réelle du projet
              Supabase. Le dire ICI est tout l'intérêt : sinon l'opérateur
              annonce 48 heures à quelqu'un qui aura une heure, et c'est la
              personne bloquée qui le découvre. */}
          {clamped ? (
            <span style={{ fontSize: 12, color: 'var(--red)' }}>
              Durée réduite : le projet Supabase expire les jetons plus tôt. Pour porter cette durée pour de bon, relève
              « Email OTP Expiration » côté Supabase et déclare la même valeur dans SUPABASE_OTP_EXP_SECONDS.
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </div>
  )
}
