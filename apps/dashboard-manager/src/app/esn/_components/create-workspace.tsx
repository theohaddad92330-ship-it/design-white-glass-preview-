'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Create a new ESN (workspace) owned by a given user. POSTs the DM route handler
// (which proxies to the API with the internal secret, server-side) then refreshes
// the server-rendered list.

export function CreateWorkspace() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [ownerUserId, setOwnerUserId] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState('')

  async function create() {
    if (!name.trim() || !ownerUserId.trim() || state === 'saving') return
    setState('saving')
    setError('')
    try {
      const res = await fetch('/api/admin/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), ownerUserId: ownerUserId.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setName('')
      setOwnerUserId('')
      setState('idle')
      router.refresh()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section
      className="card"
      style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}
    >
      <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Nom de l’ESN</span>
        <input value={name} placeholder="Ex : Skaizen" onChange={e => setName(e.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Propriétaire (userId)</span>
        <input
          value={ownerUserId}
          placeholder="uuid du user propriétaire"
          onChange={e => setOwnerUserId(e.target.value)}
        />
      </label>
      <button className="btn" onClick={create} disabled={state === 'saving' || !name.trim() || !ownerUserId.trim()}>
        {state === 'saving' ? 'Création…' : 'Créer l’ESN'}
      </button>
      {error ? <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </section>
  )
}
