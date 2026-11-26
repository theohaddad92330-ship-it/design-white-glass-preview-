import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildTodayItems, type TodayItem } from './todayQueue'

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('@/features/actions/components/SendTimingLine', () => ({ SendTimingLine: () => null }))
vi.mock('@/features/actions/components/CallbackDateDialog', () => ({ CallbackDateDialog: () => null }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/permissions', async () => ({
  ...(await vi.importActual<object>('@/lib/permissions')),
  useUserPermissions: () => ({ status: 'known', role: 'member', extraPermissions: [], permissions: ['records:write'] }),
}))

import { TodayTaskRow } from './TodayTaskRow'

/**
 * #2200.13 — la rangée « À valider » de /actions › Aujourd'hui disait « Préparé par Laura », la fenêtre ouverte
 * à son clic « Déclenchée par Louis Schlegel ». Les deux disent désormais LA MÊME chose : l'humain qui a déclenché
 * et l'agent qui a préparé. #2200.14/.21 — la fenêtre montre en plus la source et la prochaine étape.
 */
type Approval = Parameters<typeof buildTodayItems>[0]['approvals'][number]

const NOW = new Date(2026, 10, 2, 10)
const gestures = { isPending: () => false } as unknown as ComponentProps<typeof TodayTaskRow>['gestures']

const approvalItem = (trace: Partial<NonNullable<Approval['trace']>>): TodayItem => {
  const approval = {
    id: 'ap-1',
    run_id: 'run-1',
    required_level: 'n2_user_approval',
    state: 'pending',
    summary: 'Envoyer le récapitulatif — Claire Dubois (ACME)',
    estimated_credits: 0,
    expires_at: '2026-11-05T10:00:00.000Z',
    created_at: '2026-11-02T08:00:00.000Z',
    trace: {
      trigger: 'manual',
      triggeredByName: null,
      approvedByName: null,
      approvedAt: null,
      accountName: null,
      ...trace,
    },
    nextStepKey: 'append_note',
  } as unknown as Approval
  const [item] = buildTodayItems(
    { approvals: [approval], crm: [], erp: [], sends: [], messages: [], sequences: [], calls: [], tasks: [], plan: [] },
    NOW,
  )
  if (!item) throw new Error('no item')
  return item
}

function renderRow(item: TodayItem, open: boolean) {
  return render(
    <TodayTaskRow
      item={item}
      now={NOW}
      gestures={gestures}
      members={[]}
      hasMandate={false}
      variant="burst"
      onSkip={vi.fn()}
      open={open}
      onOpenChange={vi.fn()}
    />,
  )
}

describe('#2200.13 — rangée et fenêtre « À valider » : une seule formule d’auteur', () => {
  it('la rangée nomme l’humain qui a déclenché, la source et l’agent qui a préparé', () => {
    renderRow(approvalItem({ trigger: 'signal_detected', triggeredByName: 'Louis Schlegel' }), false)
    const row = screen.getByRole('button', { name: /Ouvrir/ })
    expect(row).toHaveTextContent('Déclenchée par Louis Schlegel · depuis un signal frais · préparée par Laura')
    expect(row).not.toHaveTextContent(/Préparé par Laura/)
  })

  it('la fenêtre dit la même chose, puis la prochaine étape (#2200.14/.21)', () => {
    renderRow(approvalItem({ trigger: 'signal_detected', triggeredByName: 'Louis Schlegel' }), true)
    const line = within(screen.getByRole('dialog')).getByTestId('queue-trace-line')
    expect(line).toHaveTextContent(
      /Déclenchée par Louis Schlegel\s*·\s*depuis un signal frais\s*·\s*préparée par Laura\s*·\s*prochaine étape : Ajouter la note d'activité/,
    )
  })

  it('sans humain, le déclencheur seul — et l’agent qui a préparé, aux deux endroits', () => {
    renderRow(approvalItem({ trigger: 'meeting_upcoming' }), true)
    // Fenêtre ouverte : la rangée sort de l'arbre accessible, on la lit par son emplacement.
    expect(document.querySelector('[data-slot="today-task-row"]')).toHaveTextContent(
      'Déclenchée par un rendez-vous · préparée par Laura',
    )
    expect(within(screen.getByRole('dialog')).getByTestId('queue-trace-line')).toHaveTextContent(
      /Déclenchée par un rendez-vous\s*·\s*préparée par Laura/,
    )
  })
})
