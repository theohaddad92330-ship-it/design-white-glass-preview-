'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Rename an ESN. PATCHes the DM route handler (server-side proxy with the
// internal secret) then refreshes the server-rendered detail.

export function RenameWorkspace({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const dirty = value.trim() !== name && value.trim() !== ''

  async function save() {
    if (!dirty || state === 'saving') return
    setState('saving')
    try {
      const res = await fetch(`/api/admin/workspaces/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: value.trim() }),
      })
      if (!res.ok) {
        setState('error')
        return
      }
      setState('done')
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        value={value}
        onChange={e => {
          setValue(e.target.value)
          setState('idle')
        }}
        style={{ minWidth: 240 }}
        aria-label="Nom de l’ESN"
      />
      <button className="btn-sm" onClick={save} disabled={!dirty || state === 'saving'}>
        {state === 'saving' ? 'Enregistrement…' : 'Renommer'}
      </button>
      {state === 'done' ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ renommé</span> : null}
      {state === 'error' ? <span style={{ fontSize: 12, color: 'var(--red)' }}>✗ échec</span> : null}
    </div>
  )
}
