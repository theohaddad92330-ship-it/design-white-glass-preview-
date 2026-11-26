import { describe, expect, it } from 'vitest'
import type {
  AtsWriteRequestView,
  CanonicalAction,
  CrmWriteRequestView,
  MyPlanAction,
  OutreachCallTask,
  OutreachMessage,
  OutreachSequence,
  PlaybookApproval,
} from '@bellum/contracts'
import type { ApprovalRequestView } from '../action-os/api'
import { buildTodayItems, buildTodayQueue, groupBatches, type TodayItem, type TodaySources } from './todayQueue'

// Mercredi 14/10/2026, 10 h (heure locale).
const NOW = new Date(2026, 9, 14, 10, 0, 0)
const at = (day: number, hour = 9) => new Date(2026, 9, day, hour, 0, 0).toISOString()

const EMPTY: TodaySources = {
  approvals: [],
  crm: [],
  erp: [],
  sends: [],
  messages: [],
  plan: [],
  sequences: [],
  calls: [],
  tasks: [],
}

const plan = (over: Partial<MyPlanAction>): MyPlanAction =>
  ({
    id: 'p1',
    account_id: 'a1',
    company_name: 'Acme',
    label: 'Relancer le DSI',
    due_date: '2026-10-14',
    channel: null,
    reason: null,
    contact_id: null,
    ...over,
  }) as MyPlanAction

const approval = (over: Partial<ApprovalRequestView> = {}): ApprovalRequestView =>
  ({
    id: 'ap1',
    run_id: 'r1',
    required_level: 'N3',
    state: 'pending',
    summary: 'Créer un brouillon de mail',
    estimated_credits: 0,
    expires_at: at(20),
    created_at: at(13),
    risk: 'medium',
    trace: {
      trigger: 'signal_detected',
      triggeredByName: null,
      approvedByName: null,
      approvedAt: null,
      accountName: 'Acme',
    },
    ...over,
  }) as ApprovalRequestView

const message = (over: Partial<OutreachMessage> = {}): OutreachMessage =>
  ({
    id: 'm1',
    contact_id: 'c1',
    contact_name: 'Marie Dubois',
    contact_role: 'DSI',
    account_name: 'Acme',
    channel: 'email',
    subject: 'Bonjour',
    body: 'Bonjour Marie,\nVotre DSI recrute.',
    status: 'needs_review',
    view: 'to_review',
    blockers: [],
    can_approve: true,
    sequence_id: null,
    sequence_step_id: null,
    current_version: 1,
    reason: null,
    ...over,
  }) as OutreachMessage

const sequence = (over: Partial<OutreachSequence> = {}): OutreachSequence =>
  ({
    id: 's1',
    contact_id: 'c1',
    contact_name: 'Marie Dubois',
    account_id: 'a1',
    account_name: 'Acme',
    name: 'DSI grands comptes',
    status: 'active',
    steps: [
      {
        id: 'st1',
        sequence_id: 's1',
        position: 0,
        due_at: at(10),
        kind: 'email',
        payload: { label: 'Mail 1' },
        status: 'done',
      },
      {
        id: 'st2',
        sequence_id: 's1',
        position: 1,
        due_at: at(13),
        kind: 'reminder',
        payload: { label: 'Relance LinkedIn' },
        status: 'pending',
      },
      {
        id: 'st3',
        sequence_id: 's1',
        position: 2,
        due_at: at(20),
        kind: 'task',
        payload: { label: 'Appeler' },
        status: 'pending',
      },
    ],
    ...over,
  }) as OutreachSequence

const call = (over: Partial<OutreachCallTask> = {}): OutreachCallTask =>
  ({
    id: 'call1',
    contact_id: 'c2',
    contact_name: 'Paul Martin',
    reason: 'Nouveau DSI',
    objective: 'Obtenir un rendez-vous',
    pitch: null,
    expected_outcome: null,
    status: 'ready',
    scheduled_at: at(14, 15),
    ...over,
  }) as OutreachCallTask

const ids = (items: TodayItem[]) => items.map(item => item.id)

describe('buildTodayItems — la fusion', () => {
  it('réunit toutes les sources dans UNE liste, chaque item gardant sa maison native', () => {
    const items = buildTodayItems(
      {
        ...EMPTY,
        approvals: [approval()],
        plan: [plan({})],
        messages: [message()],
        calls: [call()],
        sends: [
          {
            id: 'send1',
            recipient: 'x@y.fr',
            subject: 'S',
            body: 'B',
            expiresAt: at(20),
            playbook: 'p',
          } as unknown as PlaybookApproval,
        ],
        erp: [
          {
            id: 'erp1',
            kind: 'update_tjm',
            preview: 'TJM 600',
            expiresAt: at(20),
            canDecide: true,
          } as AtsWriteRequestView,
        ],
        crm: [
          {
            id: 'crm1',
            kind: 'note',
            preview: [],
            origin: 'user',
            expiresAt: at(20),
            target: {},
          } as unknown as CrmWriteRequestView,
        ],
      },
      NOW,
    )
    expect(ids(items).sort()).toEqual(
      [
        'approval:ap1',
        'call_task:call1',
        'crm_write:crm1',
        'erp_write:erp1',
        'message:m1',
        'plan_item:p1',
        'playbook_send:send1',
      ].sort(),
    )
  })

  it('range chaque source dans son geste', () => {
    const byId = Object.fromEntries(
      buildTodayItems(
        {
          ...EMPTY,
          approvals: [approval()],
          plan: [
            plan({ id: 'pe', channel: 'email' }),
            plan({ id: 'pl', channel: 'linkedin' }),
            plan({ id: 'pp', channel: 'phone' }),
            plan({ id: 'pn', channel: null }),
          ],
          messages: [message()],
          calls: [call()],
        },
        NOW,
      ).map(item => [item.id, item.group]),
    )
    expect(byId).toMatchObject({
      'approval:ap1': 'validate',
      'message:m1': 'validate',
      'plan_item:pe': 'email',
      'plan_item:pl': 'linkedin',
      'plan_item:pp': 'call',
      'plan_item:pn': 'task',
      'call_task:call1': 'call',
    })
  })

  it('une relance du plan garde le type d’objet visé (il décide des issues de « Fait »)', () => {
    const [item] = buildTodayItems(
      { ...EMPTY, plan: [plan({ target: { kind: 'meeting', id: 'x', label: 'RDV' } })] },
      NOW,
    )
    expect(item?.targetKind).toBe('meeting')
    const [bare] = buildTodayItems({ ...EMPTY, plan: [plan({ target: null })] }, NOW)
    expect(bare?.targetKind).toBeNull()
  })

  // #4521.1/.2 — la carte e-mail issue du plan nomme son contact et son signal sans qu'on lise la consigne.
  it('#4521 — une relance du plan porte le contact résolu (nom, fonction) et le signal cité', () => {
    const [item] = buildTodayItems(
      {
        ...EMPTY,
        plan: [
          plan({
            channel: 'email',
            contact_id: 'c1',
            contact_name: 'Muriel Kumpflen',
            contact_role: 'DG',
            signal: { text: 'Repli de CA : 72,4 M€ → 69,1 M€', at: '2026-10-02T08:00:00.000Z' },
          }),
        ],
      },
      NOW,
    )
    expect(item).toMatchObject({
      contactId: 'c1',
      contactName: 'Muriel Kumpflen',
      contactRole: 'DG',
      signal: { text: 'Repli de CA : 72,4 M€ → 69,1 M€', at: '2026-10-02T08:00:00.000Z' },
    })
  })

  it('#4521 — sans contact résolu ni signal : rien d’inventé', () => {
    const [item] = buildTodayItems({ ...EMPTY, plan: [plan({ channel: 'email' })] }, NOW)
    expect(item).toMatchObject({ contactName: null, contactRole: null, signal: null })
  })

  it('un appel clos ne fait aucune ligne', () => {
    const items = buildTodayItems(
      { ...EMPTY, calls: [call({ status: 'completed' }), call({ id: 'c3', status: 'cancelled' })] },
      NOW,
    )
    expect(items).toEqual([])
  })

  it('un message qui n’attend rien (envoyé, annulé) ne fait aucune ligne ; un bloqué reste, sans geste « valider »', () => {
    const items = buildTodayItems(
      {
        ...EMPTY,
        messages: [
          message({ id: 'sent', view: 'executed' }),
          message({ id: 'none', view: null }),
          message({ id: 'blk', view: 'blocked', blockers: ['missing_channel_address'] }),
        ],
      },
      NOW,
    )
    expect(ids(items)).toEqual(['message:blk'])
    expect(items[0]?.gestures.validate).toBe(false)
    expect(items[0]?.blockedReason).toBe('missing_channel_address')
  })

  it('un message que le lecteur ne peut pas valider n’offre pas « valider »', () => {
    const [item] = buildTodayItems({ ...EMPTY, messages: [message({ can_approve: false })] }, NOW)
    expect(item?.gestures.validate).toBe(false)
  })

  it('la prochaine étape de chaque séquence ACTIVE seulement : ni les faites, ni les suivantes, ni une séquence en pause', () => {
    const items = buildTodayItems({ ...EMPTY, sequences: [sequence(), sequence({ id: 's2', status: 'paused' })] }, NOW)
    expect(ids(items)).toEqual(['sequence_step:st2'])
  })

  it('une étape de séquence dit « Étape 2/3 · nom », se range par son libellé (LinkedIn) et se reporte', () => {
    const [item] = buildTodayItems({ ...EMPTY, sequences: [sequence()] }, NOW)
    expect(item?.group).toBe('linkedin')
    expect(item?.why).toEqual({ kind: 'step', position: 2, total: 3, sequenceName: 'DSI grands comptes' })
    expect(item?.source).toBe('sequence')
    expect(item?.gestures).toMatchObject({ done: true, postpone: true })
    expect(item?.contactName).toBe('Marie Dubois')
    expect(item?.accountName).toBe('Acme')
    expect(item?.stepId).toBe('st2')
    expect(item?.parentId).toBe('s1')
  })

  it('les étapes d’un modèle LinkedIn sont des gestes LinkedIn, même quand le libellé ne le dit pas', () => {
    const seq = sequence({
      template_key: 'cold_linkedin',
      steps: [
        {
          id: 'li1',
          sequence_id: 's1',
          position: 0,
          due_at: at(14),
          kind: 'task',
          payload: { label: 'Message après acceptation' },
          status: 'pending',
        },
      ] as unknown as OutreachSequence['steps'],
    })
    const [item] = buildTodayItems({ ...EMPTY, sequences: [seq] }, NOW)
    expect(item?.group).toBe('linkedin')
    expect(item?.channel).toBe('linkedin')
    // un modèle e-mail garde ses tâches en tâches
    const [task] = buildTodayItems({ ...EMPTY, sequences: [{ ...seq, template_key: 'cold_email' }] }, NOW)
    expect(task?.group).toBe('task')
  })

  it('une étape e-mail dont le message existe déjà n’est pas comptée deux fois', () => {
    const seq = sequence({
      steps: [
        {
          id: 'st9',
          sequence_id: 's1',
          position: 0,
          due_at: at(14),
          kind: 'email',
          payload: { label: 'Mail 1' },
          status: 'pending',
        },
      ] as unknown as OutreachSequence['steps'],
    })
    const items = buildTodayItems(
      { ...EMPTY, sequences: [seq], messages: [message({ sequence_id: 's1', sequence_step_id: 'st9' })] },
      NOW,
    )
    expect(ids(items)).toEqual(['message:m1'])
    expect(items[0]?.why).toEqual({ kind: 'step', position: 1, total: 1, sequenceName: 'DSI grands comptes' })
    expect(items[0]?.dueAt).toBe(at(14))
    expect(items[0]?.gestures.postpone).toBe(true)
    // le report d'un message passe par SON étape de séquence
    expect(items[0]?.stepId).toBe('st9')
    expect(items[0]?.parentId).toBe('s1')
  })

  it('les tâches canoniques déjà portées par le plan ou les appels ne reviennent pas', () => {
    const tasks = [
      {
        action_id: 'task:t1',
        origin: { model: 'task', id: 't1' },
        title: 'Préparer le brief',
        due_at: '2026-10-13',
        account_id: 'a1',
        account_name: 'Acme',
        status: 'open',
        source: null,
      } as unknown as CanonicalAction,
      {
        action_id: 'call_task:call1',
        origin: { model: 'call_task', id: 'call1' },
        title: 'Appel',
        due_at: null,
        status: 'open',
      } as unknown as CanonicalAction,
      {
        action_id: 'plan_item:p1',
        origin: { model: 'plan_item', id: 'p1' },
        title: 'x',
        due_at: null,
        status: 'open',
      } as unknown as CanonicalAction,
    ]
    const items = buildTodayItems({ ...EMPTY, tasks, calls: [call()] }, NOW)
    expect(ids(items).sort()).toEqual(['call_task:call1', 'task:t1'])
  })

  it('la source nomme l’origine : séquence, plan, automatisation, Laura', () => {
    const bySource = Object.fromEntries(
      buildTodayItems(
        {
          ...EMPTY,
          approvals: [
            approval(),
            approval({
              id: 'ap2',
              trace: {
                trigger: 'manual',
                triggeredByName: 'Louis',
                approvedByName: null,
                approvedAt: null,
                accountName: null,
              },
            }),
          ],
          plan: [plan({})],
          sequences: [sequence()],
          sends: [
            { id: 'send1', recipient: 'x', subject: 's', body: 'b', expiresAt: at(20) } as unknown as PlaybookApproval,
          ],
        },
        NOW,
      ).map(item => [item.id, item.source]),
    )
    expect(bySource).toEqual({
      'approval:ap1': 'automation',
      'approval:ap2': 'laura',
      'plan_item:p1': 'plan',
      'sequence_step:st2': 'sequence',
      'playbook_send:send1': 'automation',
    })
  })
})

describe('buildTodayItems — ce que préparent les automatisations (lot L-D1, #4167)', () => {
  const automated = (over: Partial<OutreachMessage> = {}) =>
    message({
      id: 'ma1',
      source: 'automation',
      reason: 'Appel d’offres publié chez Acme',
      sequence_id: 's1',
      sequence_step_id: 'st1',
      ...over,
    })

  it('un message préparé par une règle porte la source « automatisation », jamais « séquence » ni « Laura »', () => {
    const [item] = buildTodayItems({ ...EMPTY, messages: [automated()], sequences: [sequence()] }, NOW).filter(
      candidate => candidate.kind === 'message',
    )
    expect(item?.source).toBe('automation')
    expect(item?.agent).toBe('automation')
  })

  it('le signal est le « pourquoi maintenant » — pas la position dans la séquence', () => {
    const [item] = buildTodayItems({ ...EMPTY, messages: [automated()], sequences: [sequence()] }, NOW).filter(
      candidate => candidate.kind === 'message',
    )
    expect(item?.why).toEqual({ kind: 'text', text: 'Appel d’offres publié chez Acme' })
  })

  it('une règle ne valide rien à ta place : le message reste à valider, avec le geste « valider » du lecteur', () => {
    const [item] = buildTodayItems({ ...EMPTY, messages: [automated()] }, NOW)
    expect(item?.group).toBe('validate')
    expect(item?.gestures.validate).toBe(true)
  })

  it('un message d’une séquence ordinaire reste « séquence » (non-régression)', () => {
    const [item] = buildTodayItems(
      {
        ...EMPTY,
        messages: [message({ sequence_id: 's1', sequence_step_id: 'st1', source: 'sequences' })],
        sequences: [sequence()],
      },
      NOW,
    ).filter(candidate => candidate.kind === 'message')
    expect(item?.source).toBe('sequence')
  })

  it('une étape de séquence née d’une règle est « automatisation » : la séquence est reconnue par ses messages', () => {
    const items = buildTodayItems({ ...EMPTY, messages: [automated()], sequences: [sequence()] }, NOW)
    const step = items.find(candidate => candidate.kind === 'sequence_step')
    expect(step?.source).toBe('automation')
  })

  it('un appel proposé par une règle est « automatisation »', () => {
    const [item] = buildTodayItems({ ...EMPTY, calls: [call({ source: 'automation' })] }, NOW)
    expect(item?.source).toBe('automation')
    expect(item?.why).toEqual({ kind: 'text', text: 'Nouveau DSI' })
  })

  it('un appel de Laura reste « Laura »', () => {
    const [item] = buildTodayItems({ ...EMPTY, calls: [call({ source: 'laura' })] }, NOW)
    expect(item?.source).toBe('laura')
  })
})

describe('buildTodayItems — la carte garde ce que les écrans d’origine disaient (zéro régression)', () => {
  const crm = (over: Record<string, unknown> = {}) =>
    ({
      id: 'crm1',
      kind: 'deal_stage',
      preview: [
        { field: 'Étape', value: 'Proposition', previous: 'Qualification', key: 'stage' },
        { field: 'Montant', value: '40 k€', key: null },
      ],
      origin: 'system',
      requestedByYou: false,
      createdAt: at(13),
      expiresAt: at(16),
      target: {
        accountId: 'a1',
        accountName: 'Acme',
        contactId: null,
        contactName: null,
        ownerId: null,
        ownerName: null,
        channel: null,
        risk: 'high',
        source: null,
      },
      ...over,
    }) as unknown as CrmWriteRequestView

  it('une écriture CRM garde sa nature, son auteur, son diff ancienne → nouvelle valeur, sa conséquence et son expiration', () => {
    const [item] = buildTodayItems({ ...EMPTY, crm: [crm()] }, NOW)
    expect(item?.kindKey).toBe('crm.kind.deal_stage')
    expect(item?.originKey).toBe('system')
    expect(item?.detail).toEqual([
      { label: 'Étape', value: 'Proposition', previous: 'Qualification', key: 'stage' },
      { label: 'Montant', value: '40 k€', previous: null, key: null },
    ])
    expect(item?.risk).toBe('high')
    expect(item?.expiresAt).toBe(at(16))
    // au moins une ligne porte sa clé : la demande peut se corriger
    expect(item?.gestures.edit).toBe(true)
  })

  it('une demande d’origine « vous » / « un collègue » se distingue de celle d’une automatisation', () => {
    expect(buildTodayItems({ ...EMPTY, crm: [crm({ origin: 'user', requestedByYou: true })] }, NOW)[0]?.originKey).toBe(
      'you',
    )
    expect(
      buildTodayItems({ ...EMPTY, crm: [crm({ origin: 'user', requestedByYou: false })] }, NOW)[0]?.originKey,
    ).toBe('otherUser')
  })

  it('une écriture CRM sans clé de ligne se relit, elle ne se corrige pas', () => {
    const noKeys = crm({ preview: [{ field: 'Note', value: 'Appel passé' }] })
    expect(buildTodayItems({ ...EMPTY, crm: [noKeys] }, NOW)[0]?.gestures.edit).toBe(false)
  })

  it('une approbation garde son résumé complet, son coût annoncé et sa trace (déclencheur, prochaine étape)', () => {
    const [item] = buildTodayItems(
      {
        ...EMPTY,
        approvals: [
          approval({
            summary: 'Envoyer le récapitulatif\nà Claire Dubois',
            estimated_credits: 2,
            nextStepKey: 'append_note',
            trace: {
              trigger: 'manual',
              triggeredByName: 'Louis',
              approvedByName: null,
              approvedAt: null,
              accountName: 'Acme',
            },
          }),
        ],
      },
      NOW,
    )
    expect(item?.title).toBe('Envoyer le récapitulatif')
    expect(item?.body).toBe('à Claire Dubois')
    expect(item?.credits).toBe(2)
    expect(item?.why).toEqual({
      kind: 'trace',
      trigger: 'manual',
      triggeredByName: 'Louis',
      nextStepKey: 'append_note',
    })
    expect(item?.expiresAt).toBe(at(20))
  })

  it('une écriture ERP garde sa nature ; refusée au lecteur, elle dit pourquoi au lieu de deux boutons qui échoueront', () => {
    const [item] = buildTodayItems(
      {
        ...EMPTY,
        erp: [
          {
            id: 'erp1',
            kind: 'update_tjm',
            preview: 'TJM 600 → 650',
            expiresAt: at(20),
            canDecide: false,
            blockedReason: 'Tu es l’auteur de la demande.',
          } as AtsWriteRequestView,
        ],
      },
      NOW,
    )
    expect(item?.kindKey).toBe('erp.kind.update_tjm')
    expect(item?.gestures.validate).toBe(false)
    expect(item?.blockedReason).toBe('Tu es l’auteur de la demande.')
  })

  it('un envoi de playbook garde ses mots exacts : le corps entier est à lire avant d’envoyer', () => {
    const [item] = buildTodayItems(
      {
        ...EMPTY,
        sends: [
          {
            id: 's1',
            playbook: 'proposal_no_reply',
            recipient: 'claire@acme.fr',
            subject: 'Votre proposition',
            body: 'Bonjour Claire,\n…',
            requestedAt: at(13),
            expiresAt: at(20),
          } as PlaybookApproval,
        ],
      },
      NOW,
    )
    expect(item?.mustReadInFull).toBe(true)
    expect(item?.kindKey).toBeNull()
    expect(buildTodayItems({ ...EMPTY, messages: [message()] }, NOW)[0]?.mustReadInFull).toBe(false)
  })
})

describe('buildTodayQueue — sections, groupes, filtres', () => {
  const sources: TodaySources = {
    ...EMPTY,
    approvals: [approval()],
    plan: [
      plan({ id: 'late', due_date: '2026-10-12', channel: 'email' }),
      plan({ id: 'now', due_date: '2026-10-14', channel: 'email' }),
      plan({ id: 'wk', due_date: '2026-10-16', channel: 'linkedin', account_id: 'a2', company_name: 'Globex' }),
      plan({ id: 'far', due_date: '2026-11-30', channel: 'phone' }),
      plan({ id: 'nodue', due_date: null, channel: null }),
    ],
    calls: [call({ scheduled_at: at(13) })],
  }
  const queue = () => buildTodayQueue(buildTodayItems(sources, NOW), {}, NOW)

  it('trie par échéance : En retard, Aujourd’hui, Cette semaine, Plus tard', () => {
    expect(queue().sections.map(section => section.key)).toEqual(['overdue', 'today', 'week', 'later'])
  })

  it('une validation sans échéance est pour aujourd’hui ; une relance sans échéance est « plus tard »', () => {
    const q = queue()
    const today = q.sections.find(section => section.key === 'today')
    const later = q.sections.find(section => section.key === 'later')
    expect(today?.groups.flatMap(group => ids(group.items))).toContain('approval:ap1')
    expect(later?.groups.flatMap(group => ids(group.items))).toContain('plan_item:nodue')
  })

  it('range chaque section en groupes : À valider, E-mails, LinkedIn, Appels, Tâches — avec leur compteur', () => {
    const today = queue().sections.find(section => section.key === 'today')
    expect(today?.groups.map(group => [group.key, group.count])).toEqual([
      ['validate', 1],
      ['email', 1],
    ])
    const overdue = queue().sections.find(section => section.key === 'overdue')
    expect(overdue?.groups.map(group => [group.key, group.count])).toEqual([
      ['email', 1],
      ['call', 1],
    ])
  })

  it('une section ou un groupe vide n’existe pas : jamais de ligne à 0', () => {
    const q = buildTodayQueue(buildTodayItems({ ...EMPTY, plan: [plan({ channel: 'email' })] }, NOW), {}, NOW)
    expect(q.sections).toHaveLength(1)
    expect(q.sections[0]?.groups).toHaveLength(1)
    expect(buildTodayQueue([], {}, NOW).sections).toEqual([])
  })

  it('trie dans un groupe par échéance croissante', () => {
    const items = buildTodayItems(
      {
        ...EMPTY,
        plan: [
          plan({ id: 'b', due_date: '2026-10-14', label: 'B' }),
          plan({ id: 'a', due_date: '2026-10-14', label: 'A' }),
          plan({ id: 'c', due_date: '2026-10-12', label: 'C' }),
        ],
      },
      NOW,
    )
    const q = buildTodayQueue(items, {}, NOW)
    expect(q.sections[0]?.groups[0]?.items.map(item => item.id)).toEqual(['plan_item:c'])
    expect(q.sections[1]?.groups[0]?.items.map(item => item.id)).toEqual(['plan_item:a', 'plan_item:b'])
  })

  it('le sous-titre compte les gestes du jour : en retard + aujourd’hui, rien d’autre', () => {
    expect(queue().dayCount).toBe(4) // late, now, ap1, call en retard
  })

  it('#4353.1 — compte À PART ce qui est en retard, inclus dans le total du jour', () => {
    const q = queue()
    expect(q.overdueCount).toBe(2) // late, call en retard
    expect(q.overdueCount).toBeLessThanOrEqual(q.dayCount)
  })

  it('filtre par geste', () => {
    const q = buildTodayQueue(buildTodayItems(sources, NOW), { gesture: 'call' }, NOW)
    expect(q.sections.flatMap(s => s.groups.flatMap(g => ids(g.items))).sort()).toEqual([
      'call_task:call1',
      'plan_item:far',
    ])
  })

  it('filtre par compte', () => {
    const q = buildTodayQueue(buildTodayItems(sources, NOW), { accountId: 'a2' }, NOW)
    expect(q.sections.flatMap(s => s.groups.flatMap(g => ids(g.items)))).toEqual(['plan_item:wk'])
  })

  it('filtre par source, et reprend les filtres Risque et Agent de l’ancienne file', () => {
    const all = buildTodayItems(sources, NOW)
    const bySource = buildTodayQueue(all, { source: 'automation' }, NOW)
    expect(bySource.sections.flatMap(s => s.groups.flatMap(g => ids(g.items)))).toEqual(['approval:ap1'])
    const byRisk = buildTodayQueue(all, { risk: 'medium' }, NOW)
    expect(byRisk.sections.flatMap(s => s.groups.flatMap(g => ids(g.items)))).toEqual(['approval:ap1'])
    const byAgent = buildTodayQueue(all, { agent: 'automation' }, NOW)
    expect(byAgent.sections.flatMap(s => s.groups.flatMap(g => ids(g.items)))).toEqual(['approval:ap1'])
  })

  it('les options de filtre ne listent que ce qui existe dans la file', () => {
    const { options } = queue()
    expect(options.gestures).toEqual(['validate', 'email', 'linkedin', 'call', 'task'])
    expect([...options.sources].sort()).toEqual(['automation', 'laura', 'plan'])
    expect(options.accounts).toEqual([
      { id: 'a1', name: 'Acme' },
      { id: 'a2', name: 'Globex' },
    ])
    expect(options.risks).toEqual(['medium'])
    // une file sans aucun risque mesuré n'offre pas le filtre
    expect(buildTodayQueue(buildTodayItems({ ...EMPTY, plan: [plan({})] }, NOW), {}, NOW).options.risks).toEqual([])
  })

  it('le total rendu et le total filtré sont distincts : un filtre ne change jamais ce qui est dû', () => {
    const q = buildTodayQueue(buildTodayItems(sources, NOW), { gesture: 'call' }, NOW)
    expect(q.total).toBe(2)
    expect(q.unfilteredTotal).toBe(7)
    expect(q.dayCount).toBe(4)
  })
})

describe('groupBatches — les écritures CRM d’un même lot ne font qu’une carte (#4167 L-D2)', () => {
  const crmItems = (rows: Array<{ id: string; batchId?: string | null }>): TodayItem[] =>
    buildTodayItems(
      {
        ...EMPTY,
        crm: rows.map(
          row =>
            ({
              id: row.id,
              kind: 'update_deal_stage',
              preview: [{ field: 'Affaire', value: row.id, key: 'deal' }],
              origin: 'system',
              requestedByYou: false,
              createdAt: at(13),
              expiresAt: at(16),
              target: { accountName: 'Acme', risk: 'medium', source: null },
              batchId: row.batchId ?? null,
            }) as unknown as CrmWriteRequestView,
        ),
      },
      NOW,
    )

  it('porte le batchId de la demande sur l’item', () => {
    expect(crmItems([{ id: 'c1', batchId: 'b1' }])[0]?.batchId).toBe('b1')
    expect(crmItems([{ id: 'c1' }])[0]?.batchId).toBeNull()
  })

  it('regroupe deux écritures ou plus du même lot, à la place de la première', () => {
    const entries = groupBatches(
      crmItems([{ id: 'c1', batchId: 'b1' }, { id: 'c2' }, { id: 'c3', batchId: 'b1' }, { id: 'c4', batchId: 'b2' }]),
    )
    expect(entries.map(entry => entry.kind)).toEqual(['batch', 'item', 'item'])
    const [batch] = entries
    expect(batch?.kind === 'batch' && batch.items.map(item => item.nativeId)).toEqual(['c1', 'c3'])
  })

  it('un lot d’un seul élément reste une carte seule — jamais un lot deviné', () => {
    expect(groupBatches(crmItems([{ id: 'c1', batchId: 'b1' }])).map(entry => entry.kind)).toEqual(['item'])
  })

  it('ne regroupe que des écritures CRM', () => {
    const items = [...crmItems([{ id: 'c1', batchId: 'b1' }]), ...crmItems([{ id: 'c2', batchId: 'b1' }])]
    const mixed = items.map((item, index) => (index === 1 ? { ...item, kind: 'task' as const } : item))
    expect(groupBatches(mixed).map(entry => entry.kind)).toEqual(['item', 'item'])
  })
})

describe('buildTodayItems — chaque carte dit sa raison d’être (#4163 LF, point 2)', () => {
  const task = {
    action_id: 'task:t1',
    origin: { model: 'task', id: 't1' },
    title: 'Envoyer le compte rendu',
    due_at: '2026-10-13',
    account_id: 'a1',
    account_name: 'Acme',
    status: 'open',
    source: null,
    objective: null,
  } as unknown as CanonicalAction

  const bare: TodaySources = {
    ...EMPTY,
    approvals: [approval({ trace: undefined })],
    plan: [plan({})],
    messages: [message({ sequence_id: 'sx' })],
    calls: [call({ reason: '' })],
    tasks: [task],
    erp: [
      { id: 'erp1', kind: 'update_tjm', preview: 'TJM 600', expiresAt: at(20), canDecide: true },
    ] as unknown as AtsWriteRequestView[],
    crm: [
      { id: 'crm1', kind: 'note', preview: [], origin: 'user', expiresAt: at(20), target: {} },
    ] as unknown as CrmWriteRequestView[],
    sends: [
      { id: 'send1', recipient: 'x@y.fr', subject: 'S', body: 'B', expiresAt: at(20), playbook: 'p' },
    ] as unknown as PlaybookApproval[],
  }

  it('aucune carte sans « pourquoi » : à défaut de raison écrite, la SOURCE est nommée', () => {
    const items = buildTodayItems(bare, NOW)
    expect(items.length).toBe(8)
    expect(items.filter(item => item.why === null).map(item => item.id)).toEqual([])
  })

  it('la source nommée ne devine jamais une raison : plan → compte, tâche → sa liste, message d’une séquence introuvable → « séquence »', () => {
    const byId = Object.fromEntries(buildTodayItems(bare, NOW).map(item => [item.id, item.why]))
    expect(byId['plan_item:p1']).toEqual({ kind: 'origin', origin: 'plan', accountName: 'Acme' })
    expect(byId['task:t1']).toEqual({ kind: 'origin', origin: 'task', accountName: 'Acme' })
    expect(byId['message:m1']).toEqual({ kind: 'origin', origin: 'sequence', accountName: null })
    expect(byId['call_task:call1']).toEqual({ kind: 'origin', origin: 'call', accountName: null })
  })

  it('une raison écrite par la source passe avant la source nommée', () => {
    const items = buildTodayItems({ ...EMPTY, plan: [plan({ reason: 'Comité de jeudi' })], calls: [call()] }, NOW)
    expect(items.map(item => item.why)).toEqual([
      { kind: 'text', text: 'Comité de jeudi' },
      { kind: 'text', text: 'Nouveau DSI' },
    ])
  })
})

describe('buildTodayItems — la fonction ne tient pas lieu de nom deux fois (#4163 LF, point 8)', () => {
  const seat = 'Responsable des achats de prestations informatiques'
  // Une étape sans libellé : le titre de la carte est alors le nom de la séquence.
  const unlabeled = [
    { id: 'st1', sequence_id: 's1', position: 0, due_at: at(13), kind: 'email', payload: {}, status: 'pending' },
  ] as OutreachSequence['steps']

  it('un contact SANS NOM dont la fonction est déjà dans le titre : la fonction ne s’écrit qu’UNE fois', () => {
    const items = buildTodayItems(
      {
        ...EMPTY,
        sequences: [
          sequence({ name: `Compte froid — ${seat}`, contact_name: seat, contact_role: seat, steps: unlabeled }),
        ],
      },
      NOW,
    )
    expect(items[0]?.title).toContain(seat)
    expect(items[0]?.contactName).toBeNull()
  })

  it('sans la fonction dans le titre, elle s’écrit une fois sur la ligne du contact', () => {
    const items = buildTodayItems(
      { ...EMPTY, sequences: [sequence({ contact_name: seat, contact_role: seat, steps: unlabeled })] },
      NOW,
    )
    expect(items[0]?.contactName).toBe(seat)
  })

  it('un contact NOMMÉ garde sa ligne et son lien, même si son nom est dans le titre', () => {
    const items = buildTodayItems(
      {
        ...EMPTY,
        sequences: [
          sequence({
            name: 'Compte froid — Marie Dubois',
            contact_name: 'Marie Dubois',
            contact_role: 'DSI',
            steps: unlabeled,
          }),
        ],
      },
      NOW,
    )
    expect(items[0]?.contactName).toBe('Marie Dubois')
  })
})
