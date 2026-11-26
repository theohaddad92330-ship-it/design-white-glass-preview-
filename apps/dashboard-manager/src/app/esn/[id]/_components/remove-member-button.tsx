'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Remove a member from an ESN. DELETEs the DM route handler (server-side proxy
// with the internal secret) then refreshes the detail. The owner can't be
// removed — the button is not rendered for them by the page.

export function RemoveMemberButton({ id, userId, label }: { id: string; userId: string; label: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'removing' | 'error'>('idle')

  async function remove() {
    if (state === 'removing') return
    if (!window.confirm(`Retirer ${label} de cette ESN ?`)) return
    setState('removing')
    try {
      const res = await fetch(`/api/admin/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setState('error')
        return
      }
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <button className="btn-sm" onClick={remove} disabled={state === 'removing'} title={`Retirer ${label}`}>
      {state === 'removing' ? '…' : state === 'error' ? '✗ erreur' : 'Retirer'}
    </button>
  )
}
