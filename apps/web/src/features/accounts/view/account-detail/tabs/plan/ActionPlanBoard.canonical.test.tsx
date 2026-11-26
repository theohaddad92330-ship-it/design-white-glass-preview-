/**
 * #2871 (#2395.1/.5/.11) — la fiche compte lit le plan au CONTRAT CANONIQUE.
 *
 * Chaque ligne du tableau porte l'`action_id` que la projection du compte
 * (`GET /accounts/:id/actions`) lui donne — le MÊME identifiant que `/actions`
 * lit pour une ligne persistée. Une étape actée porte `plan_item:<id>`, une
 * étape seulement proposée `generated_plan:<…>` : la projection a dédoublonné,
 * le tableau ne recalcule rien.
 *
 * Le rendu visible ne change pas : mêmes étapes, même ordre, mêmes gestes.
 */
import {
  canonicalActionFromGeneratedPlanStep,
  MANUAL_ACTION_WEEK_INDEX,
  projectAccountPlanActions,
  type ActionPlanItem,
  type CanonicalAction,
} from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanWeek } from '../../helpers/plan'
import { ActionPlanBoard } from './ActionPlanBoard'
import { planItem } from './planItem.fixture'

const WS = '00000000-0000-4000-8000-0000000000aa'
const VERSION = '2026-09-20T08:00:00.000Z'
const context = { workspaceId: WS, accountId: 'a1', accountName: 'Acme', analysisVersion: VERSION }

let items: ActionPlanItem[] = []
let canonical: CanonicalAction[] | undefined

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
  useAccountCanonicalActions: () => ({ data: canonical ? { actions: canonical, unavailable: [] } : undefined }),
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

const WEEKS: PlanWeek[] = [
  { week: 1, title: 'Prendre contact', items: [{ text: 'Appeler le DSI' }, { text: 'Écrire au RSSI' }] },
]

const rowOf = (text: string) => screen.getByText(text).closest('[data-action-id]')

beforeEach(() => {
  items = []
  canonical = undefined
})

describe('ActionPlanBoard — chaque ligne porte l’identité canonique de la projection du compte (#2871)', () => {
  it('une étape proposée porte son id `generated_plan`, une étape actée celui de SA ligne', () => {
    const acted = planItem({ id: 'i-acted', label: 'Écrire au RSSI', week_index: 0, step_index: 1 })
    items = [acted]
    canonical = projectAccountPlanActions({ context, weeks: WEEKS, persisted: items })

    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(rowOf('Appeler le DSI')).toHaveAttribute(
      'data-action-id',
      canonicalActionFromGeneratedPlanStep(WEEKS[0]!.items[0]!, 0, 0, context).action_id,
    )
    expect(rowOf('Écrire au RSSI')).toHaveAttribute('data-action-id', 'plan_item:i-acted')
  })

  it('une action saisie à la main porte l’id de sa ligne, comme sur /actions', () => {
    const manual = planItem({ id: 'i-manual', label: 'Relancer Jean', week_index: MANUAL_ACTION_WEEK_INDEX })
    items = [manual]
    canonical = projectAccountPlanActions({ context, weeks: WEEKS, persisted: items })

    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(rowOf('Relancer Jean')).toHaveAttribute('data-action-id', 'plan_item:i-manual')
  })

  it('tant que la projection n’est pas lue, aucune identité n’est devinée — et le rendu est le même', () => {
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.getByText('Appeler le DSI')).toBeInTheDocument()
    expect(screen.getByText('Écrire au RSSI')).toBeInTheDocument()
    expect(document.querySelector('[data-action-id]')).toBeNull()
  })
})
