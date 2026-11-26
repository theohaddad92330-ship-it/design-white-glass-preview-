'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Generic queue mutation button (retry / remove / clean). POSTs the DM route
// handler (server-side proxy with the internal secret → API queue mutation, which
// audit-logs it) then refreshes. i18n strings are passed in as props — the parent
// server component owns the locale.

export function ActionButton({
  endpoint,
  label,
  confirmText,
  workingText,
  tone = 'default',
}: {
  endpoint: string
  label: string
  confirmText: string
  workingText: string
  tone?: 'danger' | 'muted' | 'default'
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState('')

  async function run() {
    if (state === 'working') return
    if (!window.confirm(confirmText)) return
    setState('working')
    setError('')
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' } })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!res.ok) {
        setState('error')
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      setState('idle')
      router.refresh()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const style =
    tone === 'danger'
      ? { borderColor: 'color-mix(in srgb, var(--red) 45%, transparent)', color: 'var(--red)' }
      : tone === 'muted'
        ? { color: 'var(--muted)' }
        : undefined

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn-sm" onClick={run} disabled={state === 'working'} style={style}>
        {state === 'working' ? workingText : label}
      </button>
      {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
    </span>
  )
}
