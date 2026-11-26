/**
 * #4158.48 — la ligne d'action d'un collègue (`can_edit === false`) se LIT :
 * case à cocher gelée, avec sa raison. Une ligne modifiable reste active.
 */
import { MANUAL_ACTION_WEEK_INDEX, type ActionPlanItem } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { PlanWeek } from '../../helpers/plan'
import { ActionPlanBoard } from './ActionPlanBoard'
import { planItem } from './planItem.fixture'

let items: ActionPlanItem[] = []

const planItems = {
  get items() {
    return items
  },
  isLoading: false,
  itemFor: (weekIndex: number, stepIndex: number) =>
    items.find(item => item.week_index === weekIndex && item.step_index === stepIndex),
  setDone: vi.fn(),
  setDueDate: vi.fn(),
  setStatus: vi.fn(),
  setResult: vi.fn(),
  snooze: vi.fn(),
  assign: vi.fn(),
  create: vi.fn(),
}

vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: () => planItems }))
vi.mock('@/features/action-os/hooks/useAccountCanonicalActions', () => ({
  useAccountCanonicalActions: () => ({ data: undefined }),
}))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn(), addAngle: vi.fn(), isPending: false }),
}))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({ useTrackAction: () => ({ mutate: vi.fn() }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({ useCrmStatus: () => ({ data: { connected: false } }) }))
vi.mock('@/features/actions/components/ActionExecuteMenu', () => ({ ActionExecuteMenu: () => null }))
vi.mock('@/features/google/components/AddToCalendarButton', () => ({ AddToCalendarButton: () => null }))
vi.mock('@/features/microsoft/components/OutlookScheduleButton', () => ({ OutlookScheduleButton: () => null }))
vi.mock('./PlayFeedbackButtons', () => ({ PlayFeedbackButtons: () => null }))
vi.mock('./PlanItemFacts', () => ({ PlanItemFacts: () => null }))

const WEEKS: PlanWeek[] = [{ week: 1, title: 'Prendre contact', items: [{ text: 'Appeler le DSI' }] }]

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  items = []
})

describe('ActionPlanBoard — ligne d’un collègue en lecture (#4158.48)', () => {
  it('gèle la case d’une ligne que je ne peux pas modifier, laisse active celle que je peux', () => {
    items = [
      planItem({ id: 'm1', label: 'Relancer Jean', week_index: MANUAL_ACTION_WEEK_INDEX, can_edit: false }),
      planItem({ id: 'm2', label: 'Appeler Léa', week_index: MANUAL_ACTION_WEEK_INDEX, can_edit: true }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)
    const boxes = screen.getAllByRole('checkbox', { name: i18n.t('accounts:planAction.markDone') })
    const disabled = boxes.filter(box => box.hasAttribute('disabled') || box.getAttribute('data-disabled') !== null)
    expect(disabled).toHaveLength(1)
  })
})
