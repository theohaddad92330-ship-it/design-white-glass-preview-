import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { outreachSequenceCanonicalStatusSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { filterByCanonicalState, groupByAudience } from './sequences-audience'

const NOW = new Date('2026-10-22T10:00:00.000Z')

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: 's',
    sequence_id: 'q',
    position: 0,
    due_at: '2026-10-27T09:00:00.000Z',
    kind: 'email',
    payload: {},
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step(), step({ position: 1 }), step({ position: 2 })]
  return {
    id: 'q',
    contact_id: 'c',
    contact_name: 'Claire Martin',
    contact_role: 'DSI',
    account_id: 'a',
    account_name: 'Société Générale',
    name: 'Refonte applicative',
    campaign_label: null,
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-10-14T09:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  }
}

// Théo C sequences-liste.R4 — une ligne par CAMPAGNE (audience), pas une par personne.
describe('groupByAudience', () => {
  it('regroupe les séquences qui partagent une étiquette de campagne en UNE ligne d’audience', () => {
    const rows = groupByAudience(
      [
        sequence({ id: '1', contact_id: 'c1', campaign_label: 'Refonte · SG' }),
        sequence({ id: '2', contact_id: 'c2', campaign_label: 'Refonte · SG', contact_replied: true }),
        sequence({ id: '3', contact_id: 'c3', campaign_label: 'Refonte · SG' }),
        sequence({ id: '4', contact_id: 'c4', campaign_label: null, name: 'Seule' }),
      ],
      NOW,
    )
    expect(rows).toHaveLength(2)
    const group = rows[0]
    expect(group?.kind).toBe('group')
    if (group?.kind !== 'group') throw new Error('groupe attendu')
    expect(group.label).toBe('Refonte · SG')
    expect(group.members.map(m => m.id)).toEqual(['1', '2', '3'])
    expect(group.contactCount).toBe(3)
    expect(group.replies).toBe(1)
    expect(group.accountNames).toEqual(['Société Générale'])
    expect(rows[1]?.kind).toBe('single')
  })

  it('une étiquette portée par UNE seule séquence reste une ligne simple', () => {
    const rows = groupByAudience([sequence({ campaign_label: 'Seule campagne' })], NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('single')
  })

  it('l’état du groupe est celui qui demande ton attention d’abord — jamais un état inventé', () => {
    const rows = groupByAudience(
      [
        sequence({ id: '1', campaign_label: 'X', status: 'paused' }),
        sequence({ id: '2', campaign_label: 'X', can_send: false }),
      ],
      NOW,
    )
    const group = rows[0]
    if (group?.kind !== 'group') throw new Error('groupe attendu')
    expect(group.status).toBe('awaiting_connection')
  })

  it('la prochaine échéance du groupe est la plus proche des membres, absente si aucune', () => {
    const rows = groupByAudience(
      [
        sequence({ id: '1', campaign_label: 'X', steps: [step({ due_at: '2026-10-30T09:00:00.000Z' })] }),
        sequence({ id: '2', campaign_label: 'X', steps: [step({ due_at: '2026-10-27T09:00:00.000Z' })] }),
      ],
      NOW,
    )
    const group = rows[0]
    if (group?.kind !== 'group') throw new Error('groupe attendu')
    expect(group.nextDueAt).toBe('2026-10-27T09:00:00.000Z')
    const none = groupByAudience(
      [
        sequence({ id: '1', campaign_label: 'Y', status: 'completed', steps: [step({ status: 'done' })] }),
        sequence({ id: '2', campaign_label: 'Y', status: 'completed', steps: [step({ status: 'done' })] }),
      ],
      NOW,
    )
    const done = none[0]
    if (done?.kind !== 'group') throw new Error('groupe attendu')
    expect(done.nextDueAt).toBeNull()
  })
})

// Théo C sequences-detail.A6 / sequences-liste (onze états dans le filtre).
describe('filterByCanonicalState', () => {
  it('garde les séquences dont l’état canonique est celui demandé, toutes si null', () => {
    const list = [
      sequence({ id: '1' }),
      sequence({ id: '2', status: 'paused' }),
      sequence({ id: '3', status: 'cancelled' }),
    ]
    expect(filterByCanonicalState(list, null, NOW)).toHaveLength(3)
    expect(filterByCanonicalState(list, 'paused', NOW).map(s => s.id)).toEqual(['2'])
    expect(filterByCanonicalState(list, 'stopped', NOW).map(s => s.id)).toEqual(['3'])
  })

  it('le contrat porte bien les onze états du filtre', () => {
    expect(outreachSequenceCanonicalStatusSchema.options).toHaveLength(11)
  })
})
