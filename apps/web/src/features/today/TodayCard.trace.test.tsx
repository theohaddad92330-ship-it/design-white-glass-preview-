import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MyPlanAction } from '@bellum/contracts'
import { buildTodayItems, type TodayItem } from './todayQueue'

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<HTMLAnchorElement, { children: React.ReactNode; to: string; params?: Record<string, string> }>(
      ({ children, to, params, ...rest }, ref) => (
        <a {...rest} ref={ref} href={params ? to.replace('$id', params.id ?? '') : to}>
          {children}
        </a>
      ),
    ),
  }
})
vi.mock('@/features/actions/components/SendTimingLine', () => ({ SendTimingLine: () => null }))
vi.mock('@/features/actions/components/CallbackDateDialog', () => ({ CallbackDateDialog: () => null }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/permissions', async () => ({
  ...(await vi.importActual<object>('@/lib/permissions')),
  useUserPermissions: () => ({ status: 'known', role: 'member', extraPermissions: [], permissions: ['records:write'] }),
}))

import { TodayCard } from './TodayCard'

/**
 * #2200.14 / #2200.21 — la carte « À valider » montre la SOURCE (qui a déclenché) et la PROCHAINE ÉTAPE, par le
 * composant partagé `ApprovalTraceLine` (GA-26) — plus par une copie dans la carte.
 */
const NOW = new Date(2026, 9, 24, 10)
const markSent = vi.fn().mockResolvedValue(true)
const gestures = {
  isPending: () => false,
  markSent,
} as unknown as ComponentProps<typeof TodayCard>['gestures']

const planItem = (over: Partial<MyPlanAction> = {}): TodayItem => {
  const [item] = buildTodayItems(
    {
      approvals: [],
      crm: [],
      erp: [],
      sends: [],
      messages: [],
      sequences: [],
      calls: [],
      tasks: [],
      plan: [
        {
          id: 'p1',
          account_id: 'a1',
          company_name: 'ALSEDIS',
          label: 'Envoyer un email J1 à Muriel',
          due_date: '2026-10-24',
          channel: 'email',
          reason: null,
          contact_id: 'c1',
          contact_name: 'Muriel',
          contact_role: 'DG',
          signal: null,
          ...over,
        } as MyPlanAction,
      ],
    },
    NOW,
  )
  if (!item) throw new Error('no item')
  return item
}

const renderCard = (item: TodayItem) =>
  render(
    <TodayCard
      item={item}
      now={NOW}
      gestures={gestures}
      members={[]}
      hasMandate={false}
      variant="burst"
      onSkip={vi.fn()}
    />,
  )

describe('#2200.14 / #2200.21 — la trace sur la carte « À valider »', () => {
  const withTrace = (why: TodayItem['why']): TodayItem => ({ ...planItem(), why })

  it('nomme qui a déclenché et la prochaine étape, via la ligne de trace partagée', () => {
    renderCard(
      withTrace({ kind: 'trace', trigger: 'manual', triggeredByName: 'Louis Schlegel', nextStepKey: 'append_note' }),
    )
    const line = screen.getByTestId('queue-trace-line')
    expect(line.textContent).toContain('Déclenchée par Louis Schlegel')
    expect(line.textContent).toContain('prochaine étape')
  })

  it('NON : une étape sans libellé humain ne s’écrit pas (jamais une clé technique brute)', () => {
    renderCard(
      withTrace({ kind: 'trace', trigger: 'manual', triggeredByName: 'Louis Schlegel', nextStepKey: 'zz_inconnue' }),
    )
    expect(screen.getByTestId('queue-trace-line').textContent).not.toContain('prochaine étape')
  })
})
