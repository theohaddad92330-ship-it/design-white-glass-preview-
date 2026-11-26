'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Grant / adjust a user's credits. POSTs the DM route handler (server-side proxy
// with the internal secret) then refreshes the detail. `accounts` moves the
// analysis-slot allowance, `enrichment` the enrichment balance; both accept
// negative values to claw credits back. A reason is mandatory (it lands in the
// credit ledger).

export function GrantCredits({ userId }: { userId: string }) {
  const router = useRouter()
  const [accounts, setAccounts] = useState('')
  const [enrichment, setEnrichment] = useState('')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const accountsN = Math.trunc(Number(accounts) || 0)
  const enrichmentN = Math.trunc(Number(enrichment) || 0)
  const canSubmit = reason.trim().length > 0 && (accountsN !== 0 || enrichmentN !== 0)

  async function submit() {
    if (!canSubmit || state === 'saving') return
    setState('saving')
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/credits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accounts: accountsN, enrichment: enrichmentN, reason: reason.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setAccounts('')
      setEnrichment('')
      setReason('')
      setState('done')
      router.refresh()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Analyses (Δ)</span>
          <input
            type="number"
            value={accounts}
            placeholder="ex. +5"
            onChange={e => setAccounts(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Enrichissements (Δ)</span>
          <input
            type="number"
            value={enrichment}
            placeholder="ex. +25"
            onChange={e => setEnrichment(e.target.value)}
            style={{ width: 130 }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 220 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Motif (obligatoire)</span>
          <input value={reason} placeholder="geste commercial, correction…" onChange={e => setReason(e.target.value)} />
        </label>
        <button className="btn-sm" onClick={submit} disabled={!canSubmit || state === 'saving'}>
          {state === 'saving' ? 'Application…' : 'Créditer'}
        </button>
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        Valeurs négatives autorisées pour retirer des crédits. Chaque mouvement est tracé dans le ledger.
      </span>
      {state === 'done' ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Crédits mis à jour</span> : null}
      {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </div>
  )
}
