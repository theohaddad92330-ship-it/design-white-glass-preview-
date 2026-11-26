import { describe, expect, it } from 'vitest'
import {
  canonicalActionFromGeneratedPlanStep,
  canonicalActionSchema,
  generatedPlanStepId,
  generatedPlanStepPosition,
  projectAccountPlanActions,
  type GeneratedPlanContext,
} from './action.js'
import { MANUAL_ACTION_WEEK_INDEX, type ActionPlanItem } from './action-plan-items.js'
import { generatedPlanWeeks, type GeneratedPlanPhase } from './generated-plan.js'

/**
 * #2871 — le plan GÉNÉRÉ du compte, projeté en `Action` canonique EN LECTURE
 * SEULE. Aucune ligne n'est écrite pour une étape proposée ; une étape actée
 * (persistée) gagne sur sa projection, par l'identifiant déterministe.
 */

const WS = '00000000-0000-4000-8000-0000000000aa'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const VERSION = '2026-09-20T08:00:00.000Z'

const context: GeneratedPlanContext = {
  workspaceId: WS,
  accountId: ACCOUNT,
  accountName: 'Acme',
  analysisVersion: VERSION,
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
    send_status: null,
    created_at: '2026-09-20T09:00:00.000Z',
    updated_at: '2026-09-20T09:00:00.000Z',
    ...overrides,
  }
}

const weeks: GeneratedPlanPhase[] = [
  {
    week: 1,
    title: 'Ouvrir',
    items: [
      { text: 'Écrire au DAF', outil: 'Email', responsable: 'Jean Martin', deadline: 'J+1' },
      { text: 'Appeler le DSI', outil: 'phone' },
      { text: '' },
      { text: 'Publier un article', outil: 'content' },
    ],
  },
  { week: 2, title: 'Qualifier', items: [{ text: 'Organiser un atelier', outil: 'meeting' }] },
]

describe('#2871 — une étape du plan généré, en Action canonique', () => {
  it('porte une provenance explicite : plan généré, proposée par Laura, jamais écrite', () => {
    const action = canonicalActionFromGeneratedPlanStep(weeks[0]!.items[0]!, 0, 0, context)
    expect(canonicalActionSchema.parse(action)).toEqual(action)
    expect(action.origin).toEqual({ model: 'generated_plan', id: generatedPlanStepId(ACCOUNT, VERSION, 0, 0) })
    expect(action.action_id).toBe(`generated_plan:${generatedPlanStepId(ACCOUNT, VERSION, 0, 0)}`)
    expect(action.status).toBe('suggested')
    expect(action.native_status).toBe('generated')
    expect(action.source).toBe('laura')
    expect(action.source_at).toBe(VERSION)
    expect(action.account_id).toBe(ACCOUNT)
    expect(action.account_name).toBe('Acme')
    expect(action.title).toBe('Écrire au DAF')
  })

  it("l'identifiant est déterministe : même compte, même version, même rang ⇒ même id ; sinon un autre", () => {
    expect(generatedPlanStepId(ACCOUNT, VERSION, 0, 1)).toBe(generatedPlanStepId(ACCOUNT, VERSION, 0, 1))
    expect(generatedPlanStepId(ACCOUNT, VERSION, 0, 1)).not.toBe(generatedPlanStepId(ACCOUNT, VERSION, 1, 0))
    expect(generatedPlanStepId(ACCOUNT, VERSION, 0, 1)).not.toBe(
      generatedPlanStepId(ACCOUNT, '2026-09-21T08:00:00.000Z', 0, 1),
    )
  })

  it("rien n'est deviné : ni responsable, ni échéance, ni canal hors des quatre canoniques", () => {
    const email = canonicalActionFromGeneratedPlanStep(weeks[0]!.items[0]!, 0, 0, context)
    // `responsable` du générateur mêle le porteur et le contact visé : pas attribuable.
    expect(email.owner).toBeNull()
    // `J+1` est un horizon, pas une date.
    expect(email.due_at).toBeNull()
    expect(email.channel).toBe('email')
    expect(email.type).toBe('email')
    const content = canonicalActionFromGeneratedPlanStep(weeks[0]!.items[3]!, 0, 3, context)
    expect(content.channel).toBeNull()
    expect(content.type).toBeNull()
  })

  it('retrouve le rang (phase, étape) depuis un id — et seulement pour une étape générée', () => {
    const action = canonicalActionFromGeneratedPlanStep(weeks[1]!.items[0]!, 1, 0, context)
    expect(generatedPlanStepPosition(action)).toEqual({ weekIndex: 1, stepIndex: 0 })
  })
})

describe('#2871 — la projection du plan du compte (généré + persisté)', () => {
  it('sans ligne persistée : chaque étape exprimée, dans l’ordre du plan, rang du PLAN conservé', () => {
    const actions = projectAccountPlanActions({ context, weeks, persisted: [] })
    expect(actions.map(a => a.title)).toEqual([
      'Écrire au DAF',
      'Appeler le DSI',
      'Publier un article',
      'Organiser un atelier',
    ])
    // L'étape vide n'est pas une action, mais elle ne renumérote pas les suivantes.
    expect(actions.map(generatedPlanStepPosition)).toEqual([
      { weekIndex: 0, stepIndex: 0 },
      { weekIndex: 0, stepIndex: 1 },
      { weekIndex: 0, stepIndex: 3 },
      { weekIndex: 1, stepIndex: 0 },
    ])
    expect(actions.every(a => a.status === 'suggested')).toBe(true)
  })

  it("une étape ACTÉE gagne sur sa projection : même place, une seule fois, l'état persisté", () => {
    const acted = persisted({ week_index: 0, step_index: 1, done: true, execution_status: 'done' })
    const actions = projectAccountPlanActions({ context, weeks, persisted: [acted] })
    expect(actions.map(a => a.action_id)).toEqual([
      `generated_plan:${generatedPlanStepId(ACCOUNT, VERSION, 0, 0)}`,
      `plan_item:${acted.id}`,
      `generated_plan:${generatedPlanStepId(ACCOUNT, VERSION, 0, 3)}`,
      `generated_plan:${generatedPlanStepId(ACCOUNT, VERSION, 1, 0)}`,
    ])
    // Une action faite reste sur la fiche : la projection du COMPTE ne filtre pas les ouvertes.
    expect(actions[1]!.status).toBe('completed')
    expect(actions[1]!.account_name).toBe('Acme')
    expect(new Set(actions.map(a => a.action_id)).size).toBe(actions.length)
  })

  it('les lignes persistées hors du plan courant ne disparaissent pas ; les saisies à la main viennent en dernier', () => {
    const manual = persisted({
      id: '33333333-3333-4333-8333-333333333333',
      label: 'Action ajoutée',
      week_index: MANUAL_ACTION_WEEK_INDEX,
      step_index: 0,
    })
    const stale = persisted({ id: '44444444-4444-4444-8444-444444444444', label: 'Ancienne', week_index: 5 })
    const actions = projectAccountPlanActions({ context, weeks, persisted: [manual, stale] })
    expect(actions.slice(-2).map(a => a.action_id)).toEqual([`plan_item:${stale.id}`, `plan_item:${manual.id}`])
    expect(actions).toHaveLength(6)
  })

  it('se lit depuis le blob d’analyse par le lecteur PARTAGÉ (celui de la fiche)', () => {
    const raw = { plan: { actionPlan: { phases: [{ title: 'Ouvrir', actions: [{ action: 'Écrire au DAF' }] }] } } }
    const actions = projectAccountPlanActions({ context, weeks: generatedPlanWeeks(raw), persisted: [] })
    expect(actions.map(a => a.title)).toEqual(['Écrire au DAF'])
  })
})
