import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import {
  generatedPlanStepId,
  listCanonicalActionsResponseSchema,
  MANUAL_ACTION_WEEK_INDEX,
  type ActionPlanItem,
} from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountsController } from './accounts.controller'

/**
 * #2871 — `GET /accounts/:id/actions` : le plan du compte au contrat canonique.
 *
 * Ce que ce fichier tient :
 *  · la route OUVRE un compte par son id — elle porte donc l'espace ET le
 *    périmètre BU (GA-333/GA-335/GA-336) : hors périmètre, « introuvable » ;
 *  · elle n'ÉCRIT rien — elle lit les lignes persistées SANS semis (la lecture
 *    qui sème, `listForAccount`, n'est jamais appelée) ;
 *  · elle projette par les MÊMES adaptateurs que `/action-os/actions`
 *    (`packages/contracts/src/schemas/action.ts`, GA-26) : une étape actée gagne.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'commercial@esn.fr' }
const WS = '00000000-0000-4000-8000-0000000000aa'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const ANALYZED_AT = new Date('2026-09-20T08:00:00.000Z')
const SCOPE_LYON = { businessUnitIds: ['bu-lyon'], includeUnassigned: true } as const

const RAW = {
  plan: {
    actionPlan: {
      phases: [
        { title: 'Ouvrir', actions: [{ action: 'Écrire au DAF', channel: 'email' }, { action: 'Appeler le DSI' }] },
      ],
    },
  },
}

function persisted(overrides: Partial<ActionPlanItem> = {}): ActionPlanItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    account_id: ACCOUNT,
    label: 'Appeler le DSI',
    week_index: 0,
    step_index: 1,
    done: false,
    due_date: '2026-09-27',
    completed_at: null,
    execution_status: 'todo',
    snoozed_until: null,
    assigned_to: null,
    owner_name: null,
    expected_outcome: null,
    kpi: null,
    channel: null,
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
    created_at: '2026-09-20T09:00:00.000Z',
    updated_at: '2026-09-20T09:00:00.000Z',
    ...overrides,
  }
}

type BuildOptions = {
  scope?: typeof SCOPE_LYON | null
  found?: boolean
  rows?: ActionPlanItem[] | Error
  wiredPlanItems?: boolean
}

function build(options: BuildOptions = {}) {
  const account = {
    id: ACCOUNT,
    company_name: 'Acme',
    raw_analysis: RAW,
    created_at: new Date('2026-09-01T08:00:00.000Z'),
  }
  const findOneForWorkspace = jest
    .fn()
    .mockResolvedValue(
      (options.found ?? true) ? success(account) : failure({ code: 'not_found', message: 'Account not found' }),
    )
  // La date qui a PRODUIT le plan — la même que la fiche affiche (`GET :id`).
  const resolveLastAnalyzedAt = jest.fn().mockResolvedValue(ANALYZED_AT.toISOString())
  const rows = options.rows ?? []
  const planItems = {
    listPersistedForAccount: jest.fn(() => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))),
    listForAccount: jest.fn(),
  }
  const scopeFor = jest.fn().mockResolvedValue(options.scope ?? null)
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }) }
  const controller = new AccountsController(
    { findOneForWorkspace, resolveLastAnalyzedAt } as never,
    {} as never, // analysisService
    {} as never, // analysisRuns
    {} as never, // shareService
    {} as never, // timeline
    {} as never, // contactsService
    workspaceContext as never,
    {} as never, // needPlay
    undefined, // analytics
    undefined, // esnProfile
    undefined, // stockSnapshots
    undefined, // firstEuro
    undefined, // marketMemory
    undefined, // accountMissions
    undefined, // intelligence
    { scopeFor } as never,
    options.wiredPlanItems === false ? undefined : (planItems as never),
  )
  return { controller, findOneForWorkspace, planItems, scopeFor }
}

describe('#2871 — GET /accounts/:id/actions : le plan du compte au contrat canonique', () => {
  it('projette chaque étape générée, sans rien écrire (aucune lecture qui sème)', async () => {
    const { controller, planItems } = build()

    const res = await controller.listCanonicalActions(ACCOUNT, USER)

    expect(listCanonicalActionsResponseSchema.parse(res)).toEqual(res)
    expect(res.unavailable).toEqual([])
    expect(res.actions.map(a => [a.origin.model, a.title, a.status])).toEqual([
      ['generated_plan', 'Écrire au DAF', 'suggested'],
      ['generated_plan', 'Appeler le DSI', 'suggested'],
    ])
    expect(res.actions.every(a => a.workspace_id === WS && a.account_id === ACCOUNT)).toBe(true)
    expect(planItems.listPersistedForAccount).toHaveBeenCalledWith('u-1', ACCOUNT)
    expect(planItems.listForAccount).not.toHaveBeenCalled()
  })

  it('une étape ACTÉE gagne sur sa projection — une seule fois, à sa place ; la saisie manuelle suit', async () => {
    const acted = persisted({ done: true, execution_status: 'done' })
    const manual = persisted({
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Ajoutée à la main',
      week_index: MANUAL_ACTION_WEEK_INDEX,
      step_index: 0,
    })
    const { controller } = build({ rows: [acted, manual] })

    const res = await controller.listCanonicalActions(ACCOUNT, USER)

    expect(res.actions.map(a => a.action_id)).toEqual([
      `generated_plan:${generatedPlanStepId(ACCOUNT, ANALYZED_AT.toISOString(), 0, 0)}`,
      `plan_item:${acted.id}`,
      `plan_item:${manual.id}`,
    ])
  })

  it('les lignes persistées illisibles sont NOMMÉES, jamais une liste amputée présentée complète', async () => {
    const { controller } = build({ rows: new Error('db down') })

    const res = await controller.listCanonicalActions(ACCOUNT, USER)

    expect(res.unavailable).toEqual(['plan_item'])
    expect(res.actions.map(a => a.origin.model)).toEqual(['generated_plan', 'generated_plan'])
  })

  it('GA-333/GA-335 — ouvre le compte avec l’espace ET le périmètre ; hors périmètre, « introuvable »', async () => {
    const { controller, findOneForWorkspace, scopeFor, planItems } = build({ scope: SCOPE_LYON, found: false })

    await expect(controller.listCanonicalActions(ACCOUNT, USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(scopeFor).toHaveBeenCalledWith(WS, 'u-1')
    expect(findOneForWorkspace).toHaveBeenCalledWith(ACCOUNT, WS, SCOPE_LYON)
    // Rien du plan d'un compte hors périmètre n'est lu.
    expect(planItems.listPersistedForAccount).not.toHaveBeenCalled()
  })

  it('sans la porte des actions du plan, 503 — jamais un plan sans son état persisté', async () => {
    const { controller } = build({ wiredPlanItems: false })

    await expect(controller.listCanonicalActions(ACCOUNT, USER)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
