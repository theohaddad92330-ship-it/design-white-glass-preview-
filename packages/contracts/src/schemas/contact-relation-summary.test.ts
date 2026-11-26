import { describe, expect, it } from 'vitest'
import {
  summarizeContactRelation,
  type RelationActivityInput,
  type RelationPlanItemInput,
} from './contact-relation-summary.js'

const NOW = new Date('2026-10-05T10:00:00Z')

function act(
  partial: Partial<RelationActivityInput> & Pick<RelationActivityInput, 'id' | 'occurredAt'>,
): RelationActivityInput {
  return { kind: 'email', direction: 'outbound', verdict: 'sent', outcome: null, ...partial }
}

function item(partial: Partial<RelationPlanItemInput> & Pick<RelationPlanItemInput, 'id'>): RelationPlanItemInput {
  return {
    label: 'Relancer',
    due_date: null,
    execution_status: 'todo',
    owner_name: null,
    outcome: null,
    result: null,
    completed_at: null,
    ...partial,
  }
}

describe('summarizeContactRelation — définitions communes (#3691)', () => {
  it('sans aucun historique : aucun échange enregistré, jamais « jamais contacté »', () => {
    const s = summarizeContactRelation({ activities: [], planItems: [], repliesReadable: true, now: NOW })
    expect(s.hasHistory).toBe(false)
    expect(s.lastAttempt).toBeNull()
    expect(s.lastExchange).toBeNull()
    expect(s.awaitingReply).toBe('none')
  })

  it('un e-mail envoyé sans réponse est une tentative, pas une conversation', () => {
    const s = summarizeContactRelation({
      activities: [act({ id: 'a1', occurredAt: '2026-10-01T09:00:00Z' })],
      planItems: [],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.lastAttempt?.id).toBe('a1')
    expect(s.lastExchange).toBeNull()
    expect(s.awaitingReply).toBe('yes')
  })

  it('sans lecture fiable de la messagerie, l’absence de réponse n’est pas garantie', () => {
    const s = summarizeContactRelation({
      activities: [act({ id: 'a1', occurredAt: '2026-10-01T09:00:00Z' })],
      planItems: [],
      repliesReadable: false,
      now: NOW,
    })
    expect(s.awaitingReply).toBe('unverifiable')
  })

  it('une réponse entrante est un échange réel et lève l’attente', () => {
    const s = summarizeContactRelation({
      activities: [
        act({ id: 'out', occurredAt: '2026-10-01T09:00:00Z' }),
        act({ id: 'in', occurredAt: '2026-10-02T09:00:00Z', direction: 'inbound', verdict: null }),
      ],
      planItems: [],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.lastExchange?.id).toBe('in')
    expect(s.awaitingReply).toBe('no')
  })

  it('un appel sans réponse / messagerie est une tentative ; un appel abouti est un échange', () => {
    const s = summarizeContactRelation({
      activities: [
        act({ id: 'vm', kind: 'call', occurredAt: '2026-10-03T09:00:00Z', outcome: 'voicemail', verdict: null }),
        act({
          id: 'ok',
          kind: 'call',
          occurredAt: '2026-10-02T09:00:00Z',
          outcome: 'connected_qualified',
          verdict: null,
        }),
      ],
      planItems: [],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.lastAttempt?.id).toBe('vm')
    expect(s.lastExchange?.id).toBe('ok')
    expect(s.awaitingReply).toBe('yes')
  })

  it('note, brouillon, envoi échoué, activité interne : ne rajeunissent jamais le dernier contact', () => {
    const s = summarizeContactRelation({
      activities: [
        act({ id: 'old', occurredAt: '2026-09-01T09:00:00Z' }),
        act({ id: 'note', kind: 'note', direction: 'internal', occurredAt: '2026-10-04T09:00:00Z', verdict: null }),
        act({ id: 'draft', occurredAt: '2026-10-04T09:00:00Z', verdict: 'drafted' }),
        act({ id: 'fail', occurredAt: '2026-10-04T10:00:00Z', verdict: 'failed' }),
        act({ id: 'int', kind: 'meeting', direction: 'internal', occurredAt: '2026-10-04T11:00:00Z', verdict: null }),
        act({ id: 'sys', kind: 'enrichment', direction: null, occurredAt: '2026-10-04T12:00:00Z', verdict: null }),
      ],
      planItems: [],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.lastAttempt?.id).toBe('old')
  })

  it('un envoi de statut inconnu n’est pas compté (timeout ≠ échec ≠ envoi)', () => {
    const s = summarizeContactRelation({
      activities: [act({ id: 'u', occurredAt: '2026-10-04T10:00:00Z', verdict: 'unknown' })],
      planItems: [],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.lastAttempt).toBeNull()
  })

  it('une réunion future n’est pas un échange passé', () => {
    const s = summarizeContactRelation({
      activities: [
        act({ id: 'm', kind: 'meeting', direction: 'outbound', occurredAt: '2026-10-09T09:00:00Z', verdict: null }),
      ],
      planItems: [],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.lastExchange).toBeNull()
  })
})

describe('summarizeContactRelation — prochaine action (#3691)', () => {
  it('la prochaine action est la tâche ouverte la plus proche ; les autres sont comptées', () => {
    const s = summarizeContactRelation({
      activities: [],
      planItems: [
        item({ id: 'later', due_date: '2026-10-20', label: 'Plus tard' }),
        item({ id: 'soon', due_date: '2026-10-08', label: 'Bientôt', owner_name: 'Marie' }),
        item({ id: 'nodate', due_date: null }),
      ],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.next).toMatchObject({ id: 'soon', label: 'Bientôt', owner: 'Marie', state: 'upcoming' })
    expect(s.otherOpenCount).toBe(2)
  })

  it('une relance en retard reste en retard et passe avant', () => {
    const s = summarizeContactRelation({
      activities: [],
      planItems: [item({ id: 'od', due_date: '2026-10-01' }), item({ id: 'ok', due_date: '2026-10-08' })],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.next).toMatchObject({ id: 'od', state: 'overdue' })
  })

  it('une tâche terminée n’est jamais « à faire » ; elle fournit le dernier résultat', () => {
    const s = summarizeContactRelation({
      activities: [],
      planItems: [
        item({
          id: 'd',
          execution_status: 'done',
          outcome: 'positive',
          result: 'Veut un devis',
          completed_at: '2026-10-02T10:00:00Z',
        }),
      ],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.next).toBeNull()
    expect(s.lastOutcome).toEqual({ outcome: 'positive', result: 'Veut un devis' })
  })

  it('une tâche sans échéance est « à planifier », jamais datée à la volée', () => {
    const s = summarizeContactRelation({
      activities: [],
      planItems: [item({ id: 'x' })],
      repliesReadable: true,
      now: NOW,
    })
    expect(s.next).toMatchObject({ id: 'x', dueDate: null, state: 'unscheduled' })
  })
})
