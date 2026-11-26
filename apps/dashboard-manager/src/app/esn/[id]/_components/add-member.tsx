'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Add a member to an ESN by userId + role. POSTs the DM route handler
// (server-side proxy with the internal secret) then refreshes the detail.

const ROLE_OPTIONS = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Propriétaire' },
]

export function AddMember({ id }: { id: string }) {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('member')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState('')

  async function add() {
    if (!userId.trim() || state === 'saving') return
    setState('saving')
    setError('')
    try {
      const res = await fetch(`/api/admin/workspaces/${encodeURIComponent(id)}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), role }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setUserId('')
      setState('idle')
      router.refresh()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 220 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ajouter un membre (userId)</span>
        <input value={userId} placeholder="uuid du user" onChange={e => setUserId(e.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Rôle</span>
        <select value={role} onChange={e => setRole(e.target.value)}>
          {ROLE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-sm" onClick={add} disabled={state === 'saving' || !userId.trim()}>
        {state === 'saving' ? 'Ajout…' : 'Ajouter'}
      </button>
      {error ? <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </div>
  )
}
