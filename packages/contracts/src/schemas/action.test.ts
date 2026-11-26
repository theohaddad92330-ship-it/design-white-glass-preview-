import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ACTION_EXPECTED_OUTCOMES,
  CANONICAL_ACTION_SOURCES,
  CANONICAL_ACTION_STATUSES,
  CANONICAL_ACTION_TYPES,
  canonicalActionFromCallTask,
  canonicalActionFromIntervention,
  canonicalActionFromPlanItem,
  canonicalActionFromTask,
  canonicalActionSchema,
  isCanonicalActionOpen,
  mergeCanonicalActions,
  type CanonicalAction,
} from './action.js'
import type { MyPlanAction } from './action-plan-items.js'
import type { OutreachCallTask } from './outreach-canonical.js'
import type { Intervention } from './playbook.js'
import type { Task } from './task.js'

const WS = '00000000-0000-4000-8000-0000000000aa'

function planItem(overrides: Partial<MyPlanAction> = {}): MyPlanAction {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    account_id: '22222222-2222-4222-8222-222222222222',
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
    created_at: '2026-09-20T08:00:00.000Z',
    updated_at: '2026-09-20T08:00:00.000Z',
    company_name: 'Acme',
    ...overrides,
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Envoyer la proposition',
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn: '2026-09-24',
    ownerId: '44444444-4444-4444-8444-444444444444',
    ownerName: 'Marie',
    createdById: null,
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
    ...overrides,
  }
}

function callTask(overrides: Partial<OutreachCallTask> = {}): OutreachCallTask {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    contact_id: '66666666-6666-4666-8666-666666666666',
    contact_name: 'Jean Martin',
    reason: 'A ouvert la proposition trois fois',
    objective: 'Obtenir la date de décision sur le besoin IAM',
    pitch: null,
    expected_outcome: null,
    status: 'proposed',
    source: 'laura',
    scheduled_at: null,
    created_at: '2026-09-21T08:00:00.000Z',
    ...overrides,
  }
}

describe('#2395 — les vocabulaires du schéma canonique', () => {
  it('#2395.3 — douze statuts, jamais seulement todo/done', () => {
    expect(CANONICAL_ACTION_STATUSES).toEqual([
      'suggested',
      'accepted',
      'scheduled',
      'in_progress',
      'waiting_external',
      'waiting_internal',
      'blocked',
      'completed',
      'failed',
      'cancelled',
      'dismissed',
      'obsolete',
    ])
    expect(CANONICAL_ACTION_STATUSES).not.toContain('todo')
    expect(CANONICAL_ACTION_STATUSES).not.toContain('done')
  })

  it('#2395.4 — dix-sept types, de call à custom', () => {
    expect(CANONICAL_ACTION_TYPES).toHaveLength(17)
    expect(CANONICAL_ACTION_TYPES[0]).toBe('call')
    expect(CANONICAL_ACTION_TYPES[16]).toBe('custom')
  })

  it('#2395.7 — sept sources nommées', () => {
    expect(CANONICAL_ACTION_SOURCES).toEqual(['user', 'laura', 'rule', 'connector', 'import', 'manager', 'event'])
  })

  it('#2395.9 — huit résultats attendus, contraints', () => {
    expect(CANONICAL_ACTION_EXPECTED_OUTCOMES).toEqual([
      'information',
      'validation',
      'meeting',
      'document',
      'payment',
      'feedback',
      'decision',
      'other',
    ])
    const parsed = canonicalActionSchema.safeParse({
      ...canonicalActionFromTask(task(), WS),
      expected_outcome: 'coffee',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('#2395.1 — adaptateur action_plan_items (plan de Laura, écran Actions, relances)', () => {
  it('projette une ligne ouverte sans rien inventer', () => {
    const action = canonicalActionFromPlanItem(planItem(), WS)
    expect(canonicalActionSchema.parse(action)).toEqual(action)
    expect(action).toMatchObject({
      action_id: 'plan_item:11111111-1111-4111-8111-111111111111',
      origin: { model: 'plan_item', id: '11111111-1111-4111-8111-111111111111' },
      workspace_id: WS,
      object_type: 'account',
      object_id: '22222222-2222-4222-8222-222222222222',
      account_id: '22222222-2222-4222-8222-222222222222',
      account_name: 'Acme',
      title: 'Rappeler le DSI',
      status: 'accepted',
      native_status: 'todo',
      due_at: '2026-09-25',
    })
    // Non mesuré ≠ valeur : rien ne renseigne ces champs sur cette ligne.
    expect(action.type).toBeNull()
    expect(action.source).toBeNull()
    expect(action.confidence).toBeNull()
    expect(action.cost_credits).toBeNull()
    expect(action.objective).toBeNull()
    expect(action.expected_outcome).toBeNull()
    expect(action).not.toHaveProperty('collaborators')
  })

  it('porte l’objet visé, la provenance, la dépendance et le résultat attendu libre', () => {
    const action = canonicalActionFromPlanItem(
      planItem({
        target: { kind: 'meeting', id: 'evt-1', label: 'Comité IAM' },
        contact_id: '77777777-7777-4777-8777-777777777777',
        provenance: { source: 'model', at: '2026-09-20T07:00:00.000Z' },
        confidence: 'medium',
        cost_credits: 0,
        depends_on_item_id: '88888888-8888-4888-8888-888888888888',
        expected_outcome: 'Une date de décision',
        reason: 'Le besoin IAM est ouvert',
        assigned_to: '44444444-4444-4444-8444-444444444444',
        owner_name: 'Marie',
      }),
      WS,
    )
    expect(action).toMatchObject({
      object_type: 'meeting',
      object_id: 'evt-1',
      object_label: 'Comité IAM',
      type: 'meeting',
      contact_id: '77777777-7777-4777-8777-777777777777',
      source: 'laura',
      source_at: '2026-09-20T07:00:00.000Z',
      confidence: 'medium',
      // 0 crédit EST une mesure (gratuit), pas une absence.
      cost_credits: 0,
      dependencies: ['plan_item:88888888-8888-4888-8888-888888888888'],
      description: 'Le besoin IAM est ouvert',
      // Un texte libre ne se range pas dans l'enum en le devinant.
      expected_outcome: null,
      expected_outcome_note: 'Une date de décision',
      owner: { id: '44444444-4444-4444-8444-444444444444', name: 'Marie' },
    })
  })

  it('#2395.4 — le canal déjà connu détermine le type sans le deviner (téléphone → appel, e-mail → email, réunion → réunion)', () => {
    expect(canonicalActionFromPlanItem(planItem({ channel: 'phone' }), WS).type).toBe('call')
    expect(canonicalActionFromPlanItem(planItem({ channel: 'email' }), WS).type).toBe('email')
    expect(canonicalActionFromPlanItem(planItem({ channel: 'meeting' }), WS).type).toBe('meeting')
    // LinkedIn n'a pas de correspondance sans ambiguïté dans les dix-sept types.
    expect(canonicalActionFromPlanItem(planItem({ channel: 'linkedin' }), WS).type).toBeNull()
    // Non renseigné (ligne antérieure, ou item manuel sans canal saisi) → non typé.
    expect(canonicalActionFromPlanItem(planItem({ channel: null }), WS).type).toBeNull()
  })

  it('#2395.4 — la cible « meeting » gagne sur le canal quand les deux sont posés', () => {
    const action = canonicalActionFromPlanItem(
      planItem({ channel: 'email', target: { kind: 'meeting', id: 'evt-1', label: 'Comité' } }),
      WS,
    )
    expect(action.type).toBe('meeting')
    expect(action.channel).toBe('meeting')
  })

  it('#2395.4 — le canal se lit aussi sur l’action canonique elle-même', () => {
    expect(canonicalActionFromPlanItem(planItem({ channel: 'linkedin' }), WS).channel).toBe('linkedin')
  })

  it('#2395.9 — un canal réunion détermine l’attendu « meeting », sans perdre le texte libre en note', () => {
    const action = canonicalActionFromPlanItem(
      planItem({ channel: 'meeting', expected_outcome: 'Comité de pilotage obtenu' }),
      WS,
    )
    expect(action.expected_outcome).toBe('meeting')
    expect(action.expected_outcome_note).toBe('Comité de pilotage obtenu')
  })

  it('#2395.9 — un canal téléphone ou e-mail ne détermine pas l’attendu : ambigu, jamais deviné', () => {
    const action = canonicalActionFromPlanItem(planItem({ channel: 'phone', expected_outcome: null }), WS)
    expect(action.expected_outcome).toBeNull()
    expect(action.expected_outcome_note).toBeNull()
  })

  it('une cible « besoin » renseigne need_id', () => {
    const action = canonicalActionFromPlanItem(planItem({ target: { kind: 'need', id: 'need-9', label: 'IAM' } }), WS)
    expect(action.need_id).toBe('need-9')
  })

  it('traduit chaque statut d’exécution', () => {
    expect(canonicalActionFromPlanItem(planItem({ execution_status: 'snoozed' }), WS).status).toBe('scheduled')
    expect(canonicalActionFromPlanItem(planItem({ execution_status: 'prepared' }), WS).status).toBe('in_progress')
    expect(canonicalActionFromPlanItem(planItem({ execution_status: 'done', done: true }), WS).status).toBe('completed')
  })

  it('#2317.12 — une action marquée obsolète devient le statut canonique `obsolete`, TERMINAL', () => {
    const action = canonicalActionFromPlanItem(planItem({ execution_status: 'obsolete' }), WS)
    expect(action.status).toBe('obsolete')
    expect(action.native_status).toBe('obsolete')
    expect(isCanonicalActionOpen(action.status)).toBe(false)
  })

  it('les sources de provenance se traduisent sans perte', () => {
    const src = (source: 'human' | 'connector' | 'pipeline' | 'model') =>
      canonicalActionFromPlanItem(planItem({ provenance: { source, at: null } }), WS).source
    expect(src('human')).toBe('user')
    expect(src('connector')).toBe('connector')
    expect(src('pipeline')).toBe('rule')
    expect(src('model')).toBe('laura')
  })
})

describe('#2395.1 — adaptateur tasks (tâches CRM natives, brief du jour)', () => {
  it('projette une tâche ouverte', () => {
    const action = canonicalActionFromTask(task({ priority: 'high', details: 'Version 2' }), WS)
    expect(canonicalActionSchema.parse(action)).toEqual(action)
    expect(action).toMatchObject({
      action_id: 'task:33333333-3333-4333-8333-333333333333',
      origin: { model: 'task', id: '33333333-3333-4333-8333-333333333333' },
      title: 'Envoyer la proposition',
      description: 'Version 2',
      status: 'accepted',
      native_status: 'todo',
      priority: 'high',
      due_at: '2026-09-24',
      owner: { id: '44444444-4444-4444-8444-444444444444', name: 'Marie' },
      object_type: null,
      object_id: null,
    })
    // Aucune colonne ne dit qui l'a créée : la source reste non renseignée.
    expect(action.source).toBeNull()
  })

  // #2395.8 (épopée #2871) — la colonne existe désormais : portée telle
  // quelle, `null` pour toute ligne créée avant elle (jamais devinée).
  it('#2395.8 — porte l’objectif de la tâche, `null` pour une ligne d’avant la colonne', () => {
    expect(canonicalActionFromTask(task({ objective: 'Obtenir une réponse du DSI' }), WS)).toMatchObject({
      objective: 'Obtenir une réponse du DSI',
    })
    expect(canonicalActionFromTask(task(), WS)).toMatchObject({ objective: null })
  })

  it('l’objet visé suit le plus précis : projet > contact > compte', () => {
    const t = task({ accountId: 'a1', accountName: 'Acme', contactId: 'c1', contactName: 'Jean' })
    expect(canonicalActionFromTask(t, WS)).toMatchObject({
      object_type: 'contact',
      object_id: 'c1',
      object_label: 'Jean',
    })
    expect(canonicalActionFromTask(task({ accountId: 'a1', accountName: 'Acme' }), WS)).toMatchObject({
      object_type: 'account',
      object_id: 'a1',
    })
    expect(canonicalActionFromTask({ ...t, projectId: 'p1', projectLabel: 'Refonte' }, WS)).toMatchObject({
      object_type: 'project',
      object_id: 'p1',
    })
  })

  it('créée par quelqu’un = source utilisateur ; close = complétée ou annulée, avec son résultat', () => {
    const done = canonicalActionFromTask(
      task({
        status: 'done',
        createdById: '44444444-4444-4444-8444-444444444444',
        resultNote: 'Envoyée',
        completedAt: 'x',
      }),
      WS,
    )
    expect(done).toMatchObject({ status: 'completed', source: 'user', result: 'Envoyée', completed_at: 'x' })
    expect(done.created_by).toBe('44444444-4444-4444-8444-444444444444')
    expect(canonicalActionFromTask(task({ status: 'cancelled' }), WS).status).toBe('cancelled')
  })

  it('#2395.4/#2395.9 (épopée #2901) — le canal posé à la création détermine type/expected_outcome, sans deviner', () => {
    expect(canonicalActionFromTask(task({ channel: 'phone' }), WS)).toMatchObject({
      type: 'call',
      channel: 'phone',
      expected_outcome: null,
    })
    expect(canonicalActionFromTask(task({ channel: 'meeting' }), WS)).toMatchObject({
      type: 'meeting',
      channel: 'meeting',
      expected_outcome: 'meeting',
    })
    // LinkedIn n'a pas de correspondance sans ambiguïté (voir TYPE_OF_CHANNEL) : jamais un type inventé.
    expect(canonicalActionFromTask(task({ channel: 'linkedin' }), WS)).toMatchObject({
      type: null,
      channel: 'linkedin',
    })
    expect(canonicalActionFromTask(task({ channel: null }), WS)).toMatchObject({ type: null, channel: null })
  })
})

describe('#2395.1 — adaptateur outreach_call_tasks (tâches d’appel)', () => {
  it('projette une tâche d’appel : type call, canal téléphone, objectif porté', () => {
    const action = canonicalActionFromCallTask(callTask({ expected_outcome: 'decision' }), WS)
    expect(canonicalActionSchema.parse(action)).toEqual(action)
    expect(action).toMatchObject({
      action_id: 'call_task:55555555-5555-4555-8555-555555555555',
      type: 'call',
      channel: 'phone',
      status: 'suggested',
      native_status: 'proposed',
      source: 'laura',
      object_type: 'contact',
      object_id: '66666666-6666-4666-8666-666666666666',
      object_label: 'Jean Martin',
      contact_id: '66666666-6666-4666-8666-666666666666',
      title: 'A ouvert la proposition trois fois',
      objective: 'Obtenir la date de décision sur le besoin IAM',
      // La valeur EST l'une des huit : elle se range telle quelle.
      expected_outcome: 'decision',
      expected_outcome_note: null,
    })
  })

  it('le porteur de l’appel devient le propriétaire ; sans porteur, aucun', () => {
    const mine = canonicalActionFromCallTask(callTask({ user_id: '44444444-4444-4444-8444-444444444444' }), WS)
    expect(mine.owner).toEqual({ id: '44444444-4444-4444-8444-444444444444', name: null })
    expect(canonicalActionFromCallTask(callTask(), WS).owner).toBeNull()
  })

  it('une surface autre que Laura = geste de l’utilisateur', () => {
    expect(canonicalActionFromCallTask(callTask({ source: 'contacts' }), WS).source).toBe('user')
  })

  it('chaque statut d’appel a sa traduction', () => {
    const s = (status: OutreachCallTask['status']) => canonicalActionFromCallTask(callTask({ status }), WS).status
    expect(s('ready')).toBe('accepted')
    expect(s('scheduled')).toBe('scheduled')
    expect(s('due')).toBe('scheduled')
    expect(s('callback')).toBe('scheduled')
    expect(s('started')).toBe('in_progress')
    expect(s('completed')).toBe('completed')
    expect(s('qualified')).toBe('completed')
    expect(s('refused')).toBe('completed')
    expect(s('no_answer')).toBe('failed')
    expect(s('wrong_person')).toBe('failed')
    expect(s('cancelled')).toBe('cancelled')
  })
})

function intervention(overrides: Partial<Intervention> = {}): Intervention {
  return {
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
    ...overrides,
  }
}

describe('#2395.10 — adaptateur interventions (routine du responsable, #2387.7-.9)', () => {
  it('projette une intervention ouverte sur une mission : mission_id porté, jamais un type deviné', () => {
    const action = canonicalActionFromIntervention(intervention(), WS)
    expect(canonicalActionSchema.parse(action)).toEqual(action)
    expect(action).toMatchObject({
      action_id: 'intervention:99999999-9999-4999-8999-999999999999',
      origin: { model: 'intervention', id: '99999999-9999-4999-8999-999999999999' },
      // `mission` n'est pas l'un des object_type nommés (compte + huit natures
      // du plan) : rester `null` plutôt que de forcer une valeur fausse.
      object_type: null,
      mission_id: '11111111-2222-4333-8444-555555555555',
      title: 'Mission Acme se termine dans 12 jours, aucun renouvellement ouvert.',
      type: null,
      status: 'suggested',
      native_status: 'open',
      source: 'rule',
      source_at: '2026-09-10T08:00:00.000Z',
      created_at: '2026-09-10T08:00:00.000Z',
      completed_at: null,
    })
  })

  it('un sujet « compte » renseigne account_id/account_name, jamais mission_id', () => {
    const action = canonicalActionFromIntervention(
      intervention({ subjectType: 'account', subjectId: '22222222-3333-4444-8555-666666666666', subjectLabel: 'Acme' }),
      WS,
    )
    expect(action.object_type).toBe('account')
    expect(action.account_id).toBe('22222222-3333-4444-8555-666666666666')
    expect(action.account_name).toBe('Acme')
    expect(action.mission_id).toBeNull()
  })

  it('chaque état d’intervention a sa traduction, jamais réduit à todo/done', () => {
    const s = (state: Intervention['state']) => canonicalActionFromIntervention(intervention({ state }), WS).status
    expect(s('open')).toBe('suggested')
    expect(s('acknowledged')).toBe('in_progress')
    expect(s('resolved')).toBe('completed')
  })

  it('un responsable assigné devient le propriétaire ; sans lui, aucun (jamais deviné)', () => {
    const owned = canonicalActionFromIntervention(intervention({ ownerId: 'u1', ownerName: 'Jeanne' }), WS)
    expect(owned.owner).toEqual({ id: 'u1', name: 'Jeanne' })
    expect(canonicalActionFromIntervention(intervention(), WS).owner).toBeNull()
  })
})

describe('#2395.11 — la fusion : une action n’apparaît ni trois fois ni zéro', () => {
  const a = canonicalActionFromPlanItem(planItem(), WS)
  const b = canonicalActionFromTask(task(), WS)
  const c = canonicalActionFromCallTask(callTask(), WS)

  it('dédoublonne par action_id et garde les ouvertes seulement', () => {
    const closed = canonicalActionFromTask(task({ id: '99999999-9999-4999-8999-999999999999', status: 'done' }), WS)
    const merged = mergeCanonicalActions([a, b], [a, c], [closed])
    expect(merged.map(x => x.action_id).sort()).toEqual([a.action_id, b.action_id, c.action_id].sort())
  })

  it('range les datées d’abord, la plus proche en tête, puis les non datées', () => {
    const merged = mergeCanonicalActions([a, b, c])
    expect(merged.map(x => x.origin.model)).toEqual(['task', 'plan_item', 'call_task'])
  })

  it('isCanonicalActionOpen : les sept statuts non terminaux', () => {
    const open = CANONICAL_ACTION_STATUSES.filter(isCanonicalActionOpen)
    expect(open).toEqual([
      'suggested',
      'accepted',
      'scheduled',
      'in_progress',
      'waiting_external',
      'waiting_internal',
      'blocked',
    ])
  })

  it('un même objet natif lu deux fois reste UNE action', () => {
    const twice: CanonicalAction[] = [a, { ...a }]
    expect(mergeCanonicalActions(twice)).toHaveLength(1)
  })
})
