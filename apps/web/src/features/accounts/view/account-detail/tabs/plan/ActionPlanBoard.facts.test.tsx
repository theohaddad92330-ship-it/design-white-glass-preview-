/**
 * #2123.1 / .35 — le FIL entre le tableau du plan et ce que chaque action dit
 * d'elle-même.
 *
 * Le module `planItemFactsData` peut être juste et personne ne l'appeler : c'est
 * exactement le constat de recette du 15/09 (contrat et API livrés, aucun
 * écran). Ce test prouve que le tableau MONTE la lecture sur chaque action
 * persistée, et qu'il place en tête ce qu'il faut vérifier.
 */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionPlanItem } from '@bellum/contracts'
import type { PlanWeek } from '../../helpers/plan'
import { ActionPlanBoard } from './ActionPlanBoard'
import { planItem } from './planItem.fixture'

const planItems = {
  itemFor: vi.fn(),
  items: [] as ActionPlanItem[],
  isLoading: false,
  setDone: vi.fn(),
  setDueDate: vi.fn(),
  setResult: vi.fn(),
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn(() => Promise.resolve()), addAngle: vi.fn(), isPending: false }),
}))
vi.mock('@/features/actions/hooks/useTrackAction', () => ({
  useTrackAction: () => ({ mutate: vi.fn(), isPending: false }),
}))
// #2871 — la projection canonique du compte : non lue ici, la fiche garde son rendu.
vi.mock('@/features/action-os/hooks/useAccountCanonicalActions', () => ({
  useAccountCanonicalActions: () => ({ data: undefined }),
}))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: () => planItems }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({ useCrmStatus: () => ({ data: { connected: false } }) }))
vi.mock('@/features/actions/components/ActionExecuteMenu', () => ({ ActionExecuteMenu: () => null }))
vi.mock('@/features/google/components/AddToCalendarButton', () => ({ AddToCalendarButton: () => null }))
vi.mock('@/features/microsoft/components/OutlookScheduleButton', () => ({ OutlookScheduleButton: () => null }))
vi.mock('./PlayFeedbackButtons', () => ({ PlayFeedbackButtons: () => null }))

const WEEKS: PlanWeek[] = [
  { week: 1, title: 'Prendre contact', items: [{ text: 'Appeler le DSI' }, { text: 'Retrouver le nom du DSI' }] },
]

const project = { kind: 'project' as const, id: 'p1', label: 'Refonte SI RH' }

function serverHas(rows: ActionPlanItem[]) {
  planItems.items = rows
  planItems.itemFor.mockImplementation((weekIndex: number, stepIndex: number) =>
    rows.find(row => row.week_index === weekIndex && row.step_index === stepIndex),
  )
}

beforeEach(() => {
  planItems.itemFor.mockReset()
})

const positionOf = (text: string) => (document.body.textContent ?? '').indexOf(text)

describe('ActionPlanBoard — ce que chaque action dit d’elle-même', () => {
  it('#2123.1 — monte l’objet visé, la confiance et le coût sur l’action persistée', () => {
    serverHas([
      planItem({ id: 'i0', step_index: 0, target: project, contact_id: 'c1' }),
      planItem({ id: 'i1', step_index: 1, target: project, contact_id: 'c1' }),
    ])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.getAllByText('Projet : Refonte SI RH')).toHaveLength(2)
    expect(screen.getAllByText('Confiance non renseignée')).toHaveLength(2)
    expect(screen.queryByText('Coût non renseigné')).toBeNull()
  })

  it('#2123.35 — l’action à qui il manque une donnée passe EN PREMIER, comme vérification', () => {
    serverHas([
      planItem({ id: 'i0', step_index: 0, target: project, contact_id: 'c1' }),
      planItem({ id: 'i1', step_index: 1, target: null }),
    ])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.getByText("À vérifier d'abord : l'objet visé")).toBeInTheDocument()
    expect(positionOf('Retrouver le nom du DSI')).toBeLessThan(positionOf('Appeler le DSI'))
  })

  it('#2123.35 — sans rien à vérifier, l’ordre du plan est gardé (il sait dire NON)', () => {
    serverHas([
      planItem({ id: 'i0', step_index: 0, target: project, contact_id: 'c1' }),
      planItem({ id: 'i1', step_index: 1, target: project, contact_id: 'c1' }),
    ])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(positionOf('Appeler le DSI')).toBeLessThan(positionOf('Retrouver le nom du DSI'))
  })

  it('n’invente aucun champ sur une action qui n’est pas encore persistée', () => {
    serverHas([])
    render(<ActionPlanBoard accountId="a1" weeks={WEEKS} />)

    expect(screen.queryByText('Confiance non renseignée')).toBeNull()
  })
})
