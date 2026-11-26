'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Live follow-up DURING a run. The worker flushes phase_telemetry after each
 * phase, so re-fetching the (server-rendered) detail page makes phases + their
 * API trace appear one by one in real time. Polls until the run is terminal.
 */
export function LiveRefresh({ status }: { status: string }) {
  const router = useRouter()
  const live = status !== 'completed' && status !== 'error'
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    if (!live) return
    const refresh = setInterval(() => router.refresh(), 3000)
    const tick = setInterval(() => setSecs(s => s + 3), 3000)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [live, router])

  if (!live) return null
  return (
    <div
      style={{
        marginTop: 12,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        color: 'var(--accent)',
        fontSize: 13,
      }}
    >
      ● Analyse en cours — suivi live (rafraîchissement auto · {secs}s). Les phases, APIs appelées et résultats
      apparaissent au fil de l&apos;eau.
    </div>
  )
}
