/**
 * #3938.1 — « voir son avancement, surtout quand les actions ont été faites hors plan »
 * (SKAIZen 22/09). Le compteur N/M les additionnait déjà, mais rien ne le DISAIT : la recette
 * démo a lu « 5/15 » sans pouvoir y reconnaître les tâches saisies à la main. L'en-tête
 * nomme maintenant la part ajoutée à la main — et seulement quand il y en a (GA-18/19).
 */
import { MANUAL_ACTION_WEEK_INDEX, type ActionPlanItem } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  items = []
})

describe('ActionPlanBoard — l’en-tête nomme la part saisie à la main (#3938.1)', () => {
  it('2 actions à la main dont 1 faite : « 1/3 » et la part à la main est dite', () => {
    items = [
      planItem({ id: 'm1', label: 'Relancer Jean', week_index: MANUAL_ACTION_WEEK_INDEX, done: true }),
      planItem({ id: 'm2', label: 'Appeler Léa', week_index: MANUAL_ACTION_WEEK_INDEX }),
    ]
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByTestId('plan-manual-progress')).toHaveTextContent(/2.*main.*1/i)
  })

  it('aucune action à la main : rien n’est dit (pas de « 0 »)', () => {
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)
    expect(screen.queryByTestId('plan-manual-progress')).toBeNull()
  })
})
