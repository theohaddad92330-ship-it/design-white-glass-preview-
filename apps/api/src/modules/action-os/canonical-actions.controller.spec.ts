import type { Intervention, MyPlanAction, OutreachCallTask, Task } from '@bellum/contracts'
import { listCanonicalActionsResponseSchema } from '@bellum/contracts'
import type { ActionPlanItemsService } from '../actions/action-plan-items.service'
import type { OutreachMessageService } from '../outreach/outreach-message.service'
import type { PlaybooksService } from '../playbooks/playbooks.service'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CanonicalActionsController } from './canonical-actions.controller'

const ME = '11111111-1111-4111-8111-111111111111'
const COLLEAGUE = '99999999-9999-4999-8999-999999999999'
const WS = '00000000-0000-4000-8000-0000000000aa'

const planItem = {
  id: '22222222-2222-4222-8222-222222222222',
  account_id: '33333333-3333-4333-8333-333333333333',
  label: 'Rappeler le DSI',
  week_index: 0,
  step_index: 0,
  done: false,
  due_date: '2026-09-25',
  completed_at: null,
  execution_status: 'todo',
  snoozed_until: null,
  assigned_to: null,
  owner_name: null,
  expected_outcome: null,
  kpi: null,
  result: null,
  target: null,
  reason: null,
  contact_id: null,
  depends_on_item_id: null,
  provenance: null,
  confidence: null,
  cost_credits: null,
  outcome: null,
  completion_mode: null,
  source_recommendation: null,
  method_rule: null,
  external_execution_id: null,
  stop_condition: null,
  send_status: null,
  channel: null,
  created_at: '2026-09-20T08:00:00.000Z',
  updated_at: '2026-09-20T08:00:00.000Z',
  company_name: 'Acme',
} satisfies MyPlanAction

const task = {
  id: '44444444-4444-4444-8444-444444444444',
  title: 'Envoyer la proposition',
  details: null,
  status: 'todo',
  priority: 'normal',
  dueOn: '2026-09-24',
  source: 'manual',
  type: 'personal',
  relatedActionRunId: null,
  sourceLabelKey: null,
  ownerId: ME,
  ownerName: 'Moi',
  createdById: ME,
  createdByName: 'Moi',
  expectedResult: null,
  accountId: null,
  accountName: null,
  contactId: null,
  contactName: null,
  projectId: null,
  projectLabel: null,
  completedAt: null,
  completedById: null,
  completedByName: null,
  resultNote: null,
  channel: null,
  objective: null,
  createdAt: '2026-09-19T08:00:00.000Z',
  updatedAt: '2026-09-19T08:00:00.000Z',
} satisfies Task

function call(overrides: Partial<OutreachCallTask>): OutreachCallTask {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    contact_id: '66666666-6666-4666-8666-666666666666',
    contact_name: 'Jean Martin',
    reason: 'A ouvert la proposition',
    objective: 'Obtenir la date de décision',
    pitch: null,
    expected_outcome: null,
    status: 'proposed',
    source: 'laura',
    scheduled_at: null,
    created_at: '2026-09-21T08:00:00.000Z',
    user_id: ME,
    ...overrides,
  }
}

function build(over: { tasksFail?: boolean; callsFail?: boolean; interventionsFail?: boolean } = {}) {
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'sales' }) }
  const planItems = { listOpenForUser: jest.fn().mockResolvedValue([planItem]) }
  const tasks = {
    openForUser: over.tasksFail ? jest.fn().mockRejectedValue(new Error('boom')) : jest.fn().mockResolvedValue([task]),
  }
  const outreach = {
    listCallTasks: over.callsFail
      ? jest.fn().mockRejectedValue(new Error('boom'))
      : jest.fn().mockResolvedValue([
          call({}),
          // L'appel d'un collègue : visible sur /outreach, pas dans MES actions.
          call({ id: '77777777-7777-4777-8777-777777777777', user_id: COLLEAGUE }),
          // Un appel clos : pas une action ouverte.
          call({ id: '88888888-8888-4888-8888-888888888888', status: 'completed' }),
        ]),
  }
  // Vide par défaut : les tests de la fusion (order, workspace_id) restent
  // inchangés tant qu'un test n'en demande pas explicitement.
  const playbooks = {
    listInterventions: over.interventionsFail
      ? jest.fn().mockRejectedValue(new Error('boom'))
      : jest.fn().mockResolvedValue([]),
  }
  const controller = new CanonicalActionsController(
    workspace as unknown as WorkspaceContextService,
    planItems as unknown as ActionPlanItemsService,
    tasks as unknown as TasksService,
    outreach as unknown as OutreachMessageService,
    playbooks as unknown as PlaybooksService,
  )
  return { controller, workspace, planItems, tasks, outreach, playbooks }
}

const intervention = {
  id: '99999999-9999-4999-8999-999999999999',
  kind: 'renewal_at_risk',
  subjectType: 'mission',
  subjectId: '11111111-2222-4333-8444-555555555555',
  subjectLabel: 'Mission Acme',
  ownerId: null,
  ownerName: null,
  detail: 'Mission Acme se termine dans 12 jours, aucun renouvellement ouvert.',
  state: 'open',
  openedAt: '2026-09-10T08:00:00.000Z',
  resolvedAt: null,
} satisfies Intervention

describe('CanonicalActionsController — GET /action-os/actions (#2395)', () => {
  it('lit les quatre maisons dans l’espace RÉSOLU côté serveur, jamais un espace fourni', async () => {
    const { controller, workspace, planItems, tasks, outreach, playbooks } = build()
    await controller.list({ userId: ME } as never)
    expect(workspace.resolveActiveWorkspace).toHaveBeenCalledWith(ME)
    expect(planItems.listOpenForUser).toHaveBeenCalledWith(ME, WS)
    expect(tasks.openForUser).toHaveBeenCalledWith(ME, WS)
    expect(outreach.listCallTasks).toHaveBeenCalledWith({ userId: ME, workspaceId: WS, role: 'sales' })
    // `listInterventions` résout SON espace lui-même (même service que #2387) :
    // rien d'autre à lui passer.
    expect(playbooks.listInterventions).toHaveBeenCalledWith(ME)
  })

  it('rend UNE liste au contrat canonique : mes actions ouvertes, sans doublon ni appel d’un collègue', async () => {
    const { controller } = build()
    const res = await controller.list({ userId: ME } as never)
    expect(listCanonicalActionsResponseSchema.parse(res)).toEqual(res)
    expect(res.actions.map(a => a.action_id)).toEqual([
      `task:${task.id}`,
      `plan_item:${planItem.id}`,
      'call_task:55555555-5555-4555-8555-555555555555',
    ])
    expect(res.actions.every(a => a.workspace_id === WS)).toBe(true)
    expect(res.unavailable).toEqual([])
  })

  it('#2395.10 — une intervention ouverte rejoint la même liste, au même contrat', async () => {
    const { controller, playbooks } = build()
    playbooks.listInterventions.mockResolvedValue([intervention])
    const res = await controller.list({ userId: ME } as never)
    expect(listCanonicalActionsResponseSchema.parse(res)).toEqual(res)
    const found = res.actions.find(a => a.origin.model === 'intervention')
    expect(found).toMatchObject({
      action_id: 'intervention:99999999-9999-4999-8999-999999999999',
      workspace_id: WS,
      mission_id: '11111111-2222-4333-8444-555555555555',
      status: 'suggested',
    })
  })

  it('une maison illisible est NOMMÉE, jamais rendue comme « rien à faire »', async () => {
    const { controller } = build({ tasksFail: true, callsFail: true, interventionsFail: true })
    const res = await controller.list({ userId: ME } as never)
    expect(res.unavailable).toEqual(['task', 'call_task', 'intervention'])
    expect(res.actions.map(a => a.origin.model)).toEqual(['plan_item'])
  })
})
