'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanKey } from '@/lib/admin'
import { planLabel } from './plan-labels'

// Inline plan/offer control on the users table. PATCHes the DM route handler
// (which proxies to the API with the internal secret, server-side) then refreshes
// the server-rendered table.

// Current catalog keys — MUST match the API's assignPlanSchema
// (['trial','starter','team','growth','beta']). The old ['pro','business'] were
// rejected by the API (400) so a user could never be moved to team/growth and
// their accounts_limit stayed stale. assignPlan derives accounts_limit +
// enrichment_credits from PLAN_CONFIG, so picking a plan here re-syncs the cap.
const PLAN_OPTIONS: { value: PlanKey; label: string }[] = (['trial', 'starter', 'team', 'growth', 'beta'] as const).map(
  value => ({ value, label: planLabel(value) }),
)

export function PlanSelect({
  userId,
  plan,
  portee,
  fermeesParPlan,
}: {
  userId: string
  plan: PlanKey
  /** « Plan de l'espace EXTEAM — porté par … » quand la ligne n'est pas celle du
   *  propriétaire : le sélecteur règle alors l'ESPACE (PLAN-GATE #4381). */
  portee?: string | null
  fermeesParPlan?: Readonly<Record<string, string[]>>
}) {
  const router = useRouter()
  const [value, setValue] = useState<PlanKey>(plan)
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  async function change(next: PlanKey) {
    const previous = value
    setValue(next)
    setState('saving')
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/plan`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: next }),
      })
      if (!res.ok) {
        setValue(previous)
        setState('error')
        return
      }
      setState('done')
      router.refresh()
    } catch {
      setValue(previous)
      setState('error')
    }
  }

  const fermees = fermeesParPlan?.[value] ?? []

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <select
          value={value}
          disabled={state === 'saving'}
          onChange={e => change(e.target.value as PlanKey)}
          aria-label="Changer le plan"
        >
          {PLAN_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {state === 'saving' ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>…</span> : null}
        {state === 'done' ? <span style={{ fontSize: 12, color: 'var(--green)' }}>✓</span> : null}
        {state === 'error' ? <span style={{ fontSize: 12, color: 'var(--red)' }}>✗</span> : null}
      </span>
      {portee ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{portee}</span> : null}
      {fermees.length > 0 ? (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>N’ouvre pas : {fermees.join(', ')}</span>
      ) : null}
    </span>
  )
}
